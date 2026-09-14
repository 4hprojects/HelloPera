import type { SubscriptionStatus } from '@/lib/monetization/entitlements';

/**
 * Subscription lifecycle — PHASE-11 §13, §19, §22 to §32.
 *
 * Pure functions. This is where Phase 11's real risk lives: every edge here
 * either strips Premium from someone who is paying, or leaves it switched on
 * for someone who stopped. Neither is discoverable by reading the code — only
 * by enumerating the transitions, which is what the tests do.
 *
 * Nothing provider-specific appears in this file. §6 leaves the provider
 * unchosen and Phase 09 §40 forbids baking one into the domain, so adapters
 * map their own vocabulary into `SubscriptionStatus` before anything here
 * sees it.
 */

/** §18 — the normalised events an adapter must produce. */
export const BILLING_EVENTS = [
  'checkout_completed',
  'subscription_created',
  'subscription_updated',
  'subscription_renewed',
  'payment_succeeded',
  'payment_failed',
  'subscription_cancel_scheduled',
  'subscription_cancelled',
  'subscription_expired',
  'subscription_reactivated',
] as const;
export type BillingEvent = (typeof BILLING_EVENTS)[number];

/**
 * §25 — how long Premium survives a failed payment.
 *
 * "Do not hardcode until product decision." It is therefore a default that a
 * caller may override, not a constant buried in a branch. Seven days is the
 * generous end of §25's 3–7 suggestion: the common cause is an expired card,
 * and the person fixing it usually needs to notice an email first.
 */
export const DEFAULT_GRACE_DAYS = 7;

/**
 * The status a normalised event moves a subscription to.
 *
 * Returns null when the event does not change status — a renewal moves the
 * period, not the state, and treating it as a transition would rewrite
 * `active` over a `cancel_at_period_end` that the user had set.
 */
export function statusAfter(
  event: BillingEvent,
  current: SubscriptionStatus,
): SubscriptionStatus | null {
  switch (event) {
    case 'checkout_completed':
    case 'subscription_created':
      return 'active';

    case 'payment_succeeded':
      // Recovery. A payment landing while past_due or in grace is exactly the
      // case grace exists for, and it must restore Premium rather than leave
      // someone paid-up and restricted.
      return current === 'past_due' || current === 'grace' ? 'active' : null;

    case 'payment_failed':
      return 'past_due';

    case 'subscription_cancel_scheduled':
      // §26 — the user asked to stop renewing. They keep what they paid for
      // until the period ends, so the status does NOT change here; only
      // `cancel_at_period_end` does.
      return null;

    case 'subscription_cancelled':
      return 'cancelled';

    case 'subscription_expired':
      return 'expired';

    case 'subscription_reactivated':
      return 'active';

    case 'subscription_renewed':
    case 'subscription_updated':
      return null;
  }
}

/**
 * §24 — when a past-due subscription should enter grace, and when grace ends.
 *
 * Grace is a dated state rather than a flag, because "is this person still
 * entitled?" has to be answerable at read time without a job having run. A
 * flag would mean Premium quietly persisting until some sweeper noticed.
 */
export function graceEndsAt(failedAt: Date, graceDays = DEFAULT_GRACE_DAYS): Date {
  const end = new Date(failedAt.getTime());
  end.setUTCDate(end.getUTCDate() + graceDays);
  return end;
}

export type SubscriptionState = {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  gracePeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

/**
 * Does this subscription entitle Premium *right now*?
 *
 * `grantsPaidPlan` in lib/monetization/entitlements.ts answers from the status
 * alone. This adds the two time-based cases it cannot see:
 *
 *  - **grace has expired** — the row still says `grace` because no job has run
 *    yet, but the deadline has passed and Premium must stop. Reading it as
 *    still-entitled is how a cancelled customer keeps paid features for as
 *    long as the sweeper is broken.
 *  - **cancelled but still inside the paid period** (§26) — they asked to stop
 *    renewing, and they have already paid for the time remaining. Taking it
 *    away early is taking something they bought.
 */
export function entitlesPremium(
  state: SubscriptionState,
  now: Date = new Date(),
): boolean {
  switch (state.status) {
    case 'active':
    case 'trialing':
      return true;

    case 'grace':
      return state.gracePeriodEnd !== null && state.gracePeriodEnd > now;

    case 'cancelled':
      return state.currentPeriodEnd !== null && state.currentPeriodEnd > now;

    case 'past_due':
    case 'expired':
    case 'inactive':
      return false;
  }
}

/**
 * §29 — the status a stale row should be moved to, or null to leave it alone.
 *
 * Used by the reconciliation job (criterion 21). Deliberately separate from
 * `entitlesPremium`: the read path must already be correct without this ever
 * running, and this only makes the stored state agree with reality so admin
 * views and reporting are not misleading.
 */
export function expiredStatusFor(
  state: SubscriptionState,
  now: Date = new Date(),
): SubscriptionStatus | null {
  if (state.status === 'grace' && state.gracePeriodEnd && state.gracePeriodEnd <= now) {
    return 'expired';
  }
  if (
    state.status === 'cancelled' &&
    state.currentPeriodEnd &&
    state.currentPeriodEnd <= now
  ) {
    return 'expired';
  }
  return null;
}

/**
 * §30, §32 — what a downgrade does.
 *
 * It restricts capability and removes nothing. §30 is explicit that downgrade
 * and account deletion must never behave alike: deletion is the only path that
 * removes financial records, and it is already working (master plan §54a).
 *
 * Returned as data rather than performed as an action so the policy is
 * readable in one place and assertable in a test — "downgrade deletes nothing"
 * is a claim worth being able to prove.
 */
export type DowngradeEffect = {
  /** Always empty. Present so the test can assert it stays that way. */
  deletes: readonly string[];
  restricts: readonly string[];
  /** §32 — usage already spent is not refunded or erased. */
  keepsExistingUsage: true;
  /** §31 — documents are not deleted on downgrade; policy is unfinished. */
  deletesDocuments: false;
};

export function downgradeEffect(): DowngradeEffect {
  return {
    deletes: [],
    restricts: [
      'forecast_horizon_days',
      'advanced_analytics',
      'export_enabled',
      'ocr_monthly_limit',
      'ai_monthly_limit',
      'ads_shown',
    ],
    keepsExistingUsage: true,
    deletesDocuments: false,
  };
}
