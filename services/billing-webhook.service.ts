import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import {
  BILLING_EVENTS,
  entitlesPremium,
  graceEndsAt,
  statusAfter,
  type BillingEvent,
} from '@/lib/billing/lifecycle';
import type { NormalisedWebhookEvent } from '@/lib/billing/provider';
import type { SubscriptionStatus } from '@/lib/monetization/entitlements';

/**
 * Webhook processing — PHASE-11 §16 to §23, criterion 7.
 *
 * The route verifies (via the adapter, which owns the signature) and this
 * applies. Nothing here knows the provider's name beyond storing it as text.
 *
 * ## Idempotency is the database's job
 *
 * Providers retry. A payment webhook arriving twice is the normal case, not an
 * edge case, and "did we already handle this?" answered in application code is
 * a race: two deliveries land on two instances, both read "no", both process.
 * So the event row is claimed FIRST, by an insert that the
 * `(provider, provider_event_id)` unique index from Phase 09 will reject for
 * the loser. Whoever wins the insert does the work.
 *
 * ## Why a duplicate is still examined
 *
 * Claim-first has one failure mode worth handling: if processing throws after
 * the claim, the row exists, and a naive "already seen, skip" would mean that
 * event is never applied — a customer who paid stays on Free. So a duplicate
 * whose stored status is `pending` or `failed` is retried; only a `processed`
 * or `ignored` one is genuinely skipped.
 *
 * ## Everything runs with the service-role key
 *
 * There is no user session on a webhook. RLS on these tables grants no writes
 * to anyone (criterion 22), so this is the only path that can write them.
 */

export type WebhookOutcome =
  | { status: 'processed'; event: BillingEvent; userId: string }
  | { status: 'skipped'; reason: 'already_processed' }
  | { status: 'ignored'; reason: 'unknown_event' | 'unmatched_user' };

function toBillingEvent(eventType: string): BillingEvent | null {
  return (BILLING_EVENTS as readonly string[]).includes(eventType)
    ? (eventType as BillingEvent)
    : null;
}

/** Postgres unique-violation. The signal that someone else claimed the event. */
const UNIQUE_VIOLATION = '23505';

type Admin = ReturnType<typeof createAdminClient>;

/**
 * §17 — turn the provider's identifiers into a HelloPera user.
 *
 * Two routes, because which identifiers a webhook carries varies by event: a
 * payment usually names the customer, a subscription change usually names the
 * subscription. Both are tried before giving up.
 */
async function resolveUser(
  admin: Admin,
  event: NormalisedWebhookEvent,
  provider: string,
): Promise<{ userId: string; subscriptionId: string | null } | null> {
  if (event.providerSubscriptionId) {
    const { data } = await admin
      .from('subscriptions')
      .select('id, user_id')
      .eq('provider', provider)
      .eq('provider_subscription_id', event.providerSubscriptionId)
      .maybeSingle();
    if (data) {
      return { userId: String(data.user_id), subscriptionId: String(data.id) };
    }
  }

  if (event.providerCustomerId) {
    const { data } = await admin
      .from('billing_customers')
      .select('user_id')
      .eq('provider', provider)
      .eq('provider_customer_id', event.providerCustomerId)
      .maybeSingle();
    if (data) {
      const userId = String(data.user_id);
      const { data: sub } = await admin
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      return { userId, subscriptionId: sub ? String(sub.id) : null };
    }
  }

  return null;
}

/**
 * Apply a recognised event to the subscription row.
 *
 * Returns the status it settled on, so the caller can log what actually
 * changed rather than what was requested.
 */
async function applyToSubscription(
  admin: Admin,
  subscriptionId: string,
  event: NormalisedWebhookEvent,
  billingEvent: BillingEvent,
  now: Date,
): Promise<SubscriptionStatus | null> {
  const { data: row } = await admin
    .from('subscriptions')
    .select(
      'id, status, current_period_start, current_period_end, cancel_at_period_end, grace_period_end',
    )
    .eq('id', subscriptionId)
    .maybeSingle();

  if (!row) return null;

  const current = String(row.status) as SubscriptionStatus;
  const patch: Record<string, unknown> = { updated_at: now.toISOString() };

  const next = statusAfter(billingEvent, current);
  if (next) patch.status = next;

  // §24 — a failed payment starts the clock rather than cutting access. The
  // deadline is stored, not a flag, so `entitlesPremium` can answer correctly
  // at read time even if the reconciliation job never runs.
  if (billingEvent === 'payment_failed' && current !== 'grace') {
    patch.status = 'grace';
    patch.grace_period_end = graceEndsAt(now).toISOString();
  }

  // Recovery clears the deadline; leaving it set would expire a paying
  // customer the next time the job swept.
  if (billingEvent === 'payment_succeeded') {
    patch.grace_period_end = null;
  }

  // §26 — scheduling a cancellation moves this flag and nothing else. The
  // status stays put so they keep the period they paid for.
  if (billingEvent === 'subscription_cancel_scheduled') {
    patch.cancel_at_period_end = true;
  }
  if (billingEvent === 'subscription_reactivated') {
    patch.cancel_at_period_end = false;
  }

  // Period dates come from the adapter's normalised view, never parsed out of
  // the raw payload here.
  if (event.subscription) {
    if (event.subscription.currentPeriodStart) {
      patch.current_period_start = event.subscription.currentPeriodStart;
    }
    if (event.subscription.currentPeriodEnd) {
      patch.current_period_end = event.subscription.currentPeriodEnd;
    }
    if (event.subscription.providerCustomerId) {
      patch.provider_customer_id = event.subscription.providerCustomerId;
    }
  }

  await admin.from('subscriptions').update(patch).eq('id', subscriptionId);

  return (patch.status as SubscriptionStatus | undefined) ?? current;
}

/** §34 — the payment record behind the history page. Metadata only. */
async function recordInvoice(
  admin: Admin,
  userId: string,
  subscriptionId: string | null,
  provider: string,
  event: NormalisedWebhookEvent,
): Promise<void> {
  const invoice = event.invoice;
  if (!invoice) return;

  const { error } = await admin.from('billing_history').insert({
    user_id: userId,
    subscription_id: subscriptionId,
    provider,
    provider_invoice_id: invoice.providerInvoiceId,
    provider_payment_id: invoice.providerPaymentId,
    amount: invoice.amount,
    currency_code: invoice.currencyCode,
    status: invoice.status,
    billing_period_start: invoice.periodStart,
    billing_period_end: invoice.periodEnd,
    receipt_url: invoice.receiptUrl,
  });

  // A duplicate invoice is the partial unique index doing its job on a
  // retry — not a failure, and not a reason to abandon the rest of the event.
  if (error && error.code !== UNIQUE_VIOLATION) {
    log.error('billing webhook: invoice insert failed', { code: error.code });
  }
}

export async function processWebhookEvent(
  event: NormalisedWebhookEvent,
  provider: string,
  now: Date = new Date(),
): Promise<WebhookOutcome> {
  const admin = createAdminClient();
  const billingEvent = toBillingEvent(event.eventType);

  // Claim first — see the header note. `select()` so we learn the row id, and
  // so a unique violation surfaces here rather than silently.
  const claim = await admin
    .from('subscription_events')
    .insert({
      provider,
      provider_event_id: event.providerEventId,
      event_type: event.eventType,
      payload: event.payload,
      processing_status: 'pending',
    })
    .select('id')
    .single();

  let eventRowId: string;

  if (claim.error) {
    if (claim.error.code !== UNIQUE_VIOLATION) throw claim.error;

    const { data: existing } = await admin
      .from('subscription_events')
      .select('id, processing_status')
      .eq('provider', provider)
      .eq('provider_event_id', event.providerEventId)
      .maybeSingle();

    // Genuinely handled already. This is the common path: providers retry
    // successful deliveries too.
    if (
      !existing ||
      existing.processing_status === 'processed' ||
      existing.processing_status === 'ignored'
    ) {
      return { status: 'skipped', reason: 'already_processed' };
    }

    // Claimed but never finished. Retry rather than lose it.
    eventRowId = String(existing.id);
  } else {
    eventRowId = String(claim.data.id);
  }

  const finish = async (
    status: 'processed' | 'failed' | 'ignored',
    extra: Record<string, unknown> = {},
  ) => {
    await admin
      .from('subscription_events')
      .update({ processing_status: status, processed_at: now.toISOString(), ...extra })
      .eq('id', eventRowId);
  };

  // An event we do not model. Recorded — the payload is the evidence if it
  // later turns out to matter — and deliberately not guessed at.
  if (!billingEvent) {
    log.warn('billing webhook: unmodelled event type', { t: event.eventType });
    await finish('ignored');
    return { status: 'ignored', reason: 'unknown_event' };
  }

  try {
    const match = await resolveUser(admin, event, provider);

    if (!match) {
      // §17 — an event for someone we cannot identify. Ignored, not failed:
      // retrying will not make the mapping appear, and a provider that resends
      // forever on a non-2xx is worse than a recorded gap.
      log.warn('billing webhook: no user for event', { t: event.eventType });
      await finish('ignored');
      return { status: 'ignored', reason: 'unmatched_user' };
    }

    if (event.providerCustomerId) {
      // §11 — keep the mapping current. Cheap, and it is what makes the next
      // customer-only event resolvable.
      await admin.from('billing_customers').upsert(
        {
          user_id: match.userId,
          provider,
          provider_customer_id: event.providerCustomerId,
          updated_at: now.toISOString(),
        },
        { onConflict: 'provider,provider_customer_id' },
      );
    }

    let settled: SubscriptionStatus | null = null;
    if (match.subscriptionId) {
      settled = await applyToSubscription(
        admin,
        match.subscriptionId,
        event,
        billingEvent,
        now,
      );
    }

    await recordInvoice(admin, match.userId, match.subscriptionId, provider, event);

    await finish('processed', {
      user_id: match.userId,
      subscription_id: match.subscriptionId,
    });

    log.info('billing webhook: processed', {
      t: billingEvent,
      status: settled ?? 'unchanged',
    });

    return { status: 'processed', event: billingEvent, userId: match.userId };
  } catch (error) {
    // Left as `failed`, which the duplicate branch above treats as retryable.
    await finish('failed');
    log.error('billing webhook: processing failed', {
      t: event.eventType,
      m: error instanceof Error ? error.message : 'unknown',
    });
    throw error;
  }
}

/**
 * §29, criterion 21 — reconcile stored status with elapsed time.
 *
 * Separate from the read path on purpose: `entitlesPremium` is already correct
 * without this, so a broken job makes admin views stale rather than handing
 * out Premium. Bounded, and it only ever moves rows to `expired` — §30 means
 * nothing here deletes.
 */
export async function expireStaleSubscriptions(
  now: Date = new Date(),
): Promise<{ expired: number }> {
  const admin = createAdminClient();
  const iso = now.toISOString();

  const { data } = await admin
    .from('subscriptions')
    .select('id, status, current_period_end, grace_period_end')
    .in('status', ['grace', 'cancelled'])
    .limit(1000);

  const stale = (data ?? []).filter(
    (row) =>
      !entitlesPremium(
        {
          status: String(row.status) as SubscriptionStatus,
          currentPeriodEnd: row.current_period_end
            ? new Date(String(row.current_period_end))
            : null,
          gracePeriodEnd: row.grace_period_end
            ? new Date(String(row.grace_period_end))
            : null,
          cancelAtPeriodEnd: false,
        },
        now,
      ),
  );

  if (stale.length === 0) return { expired: 0 };

  await admin
    .from('subscriptions')
    .update({ status: 'expired', updated_at: iso })
    .in(
      'id',
      stale.map((row) => String(row.id)),
    );

  log.info('billing: expired stale subscriptions', { n: stale.length });
  return { expired: stale.length };
}
