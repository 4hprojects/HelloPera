import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import { getBillingProvider } from '@/lib/billing/provider';
import type { BillingHistoryEntry } from '@/types/monetization';

/**
 * Billing read and control paths — PHASE-11 §34, §26, §27.
 *
 * The write side lives in `billing-webhook.service.ts`, which the provider
 * drives. This is what the user's own billing page needs.
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function toEntry(row: Row): BillingHistoryEntry {
  return {
    id: String(row.id),
    provider: String(row.provider),
    // numeric arrives as a string from PostgREST. Left as one deliberately:
    // parseFloat on money is how rounding errors enter a ledger.
    amount: String(row.amount),
    currencyCode: str(row.currency_code) ?? 'PHP',
    status: String(row.status) as BillingHistoryEntry['status'],
    periodStart: str(row.billing_period_start),
    periodEnd: str(row.billing_period_end),
    receiptUrl: str(row.receipt_url),
    createdAt: String(row.created_at),
  };
}

/**
 * §34 — this user's payments, newest first.
 *
 * Read with the *user's* client, not the admin one: RLS already scopes
 * `billing_history` to the owner, so the database enforces the boundary rather
 * than a `.eq('user_id', …)` that a future edit could drop.
 */
export async function listBillingHistory(limit = 24): Promise<BillingHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('billing_history')
    .select(
      'id, provider, amount, currency_code, status, billing_period_start, billing_period_end, receipt_url, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    // Before the Phase 11 migration runs, the table does not exist. An empty
    // history is the right thing to render; a crashed settings page is not.
    log.warn('billing history unavailable', { code: error.code });
    return [];
  }

  return (data ?? []).map((row) => toEntry(row as Row));
}

export class BillingControlError extends Error {}

/**
 * §26 — stop renewing, keep what was paid for.
 *
 * The provider is told first. If that call fails, nothing is written locally:
 * a row saying "cancelled" while the provider keeps charging is the worst of
 * the available outcomes, and it is the one that generates refund requests.
 * The webhook that follows is what actually settles the state; this write is
 * so the page reflects the request immediately.
 */
export async function cancelAtPeriodEnd(userId: string): Promise<void> {
  const provider = getBillingProvider();
  if (!provider.isLive) {
    throw new BillingControlError('Billing is not available yet.');
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('subscriptions')
    .select('id, provider_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();

  const providerSubscriptionId = data ? str(data.provider_subscription_id) : null;
  if (!data || !providerSubscriptionId) {
    throw new BillingControlError('You do not have an active subscription.');
  }

  await provider.cancelSubscription(providerSubscriptionId);

  await admin
    .from('subscriptions')
    .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
    .eq('id', String(data.id));
}
