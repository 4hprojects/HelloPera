import { describe, expect, it } from 'vitest';
import {
  BILLING_EVENTS,
  DEFAULT_GRACE_DAYS,
  downgradeEffect,
  entitlesPremium,
  expiredStatusFor,
  graceEndsAt,
  statusAfter,
  type SubscriptionState,
} from '@/lib/billing/lifecycle';
import {
  ENTITLEMENT_KEYS,
  grantsPaidPlan,
  type SubscriptionStatus,
} from '@/lib/monetization/entitlements';

const NOW = new Date('2026-09-14T12:00:00Z');
const future = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
const past = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const state = (over: Partial<SubscriptionState> = {}): SubscriptionState => ({
  status: 'active',
  currentPeriodEnd: future(20),
  gracePeriodEnd: null,
  cancelAtPeriodEnd: false,
  ...over,
});

describe('statusAfter — §18, §19, §23', () => {
  it('activates on checkout and creation', () => {
    expect(statusAfter('checkout_completed', 'inactive')).toBe('active');
    expect(statusAfter('subscription_created', 'inactive')).toBe('active');
  });

  it('moves to past_due on a failed payment', () => {
    expect(statusAfter('payment_failed', 'active')).toBe('past_due');
  });

  it('recovers from past_due and grace when payment succeeds', () => {
    // The case grace exists for. Leaving someone restricted after they have
    // paid is the worst outcome available here.
    expect(statusAfter('payment_succeeded', 'past_due')).toBe('active');
    expect(statusAfter('payment_succeeded', 'grace')).toBe('active');
  });

  it('does not touch an already-active subscription on payment', () => {
    // Returning 'active' would overwrite a cancel_at_period_end the user set.
    expect(statusAfter('payment_succeeded', 'active')).toBeNull();
  });

  it('does not change status when cancellation is only scheduled (§26)', () => {
    // They keep what they paid for. Only cancel_at_period_end moves.
    expect(statusAfter('subscription_cancel_scheduled', 'active')).toBeNull();
  });

  it('does not change status on renewal — that moves the period, not the state', () => {
    expect(statusAfter('subscription_renewed', 'active')).toBeNull();
    expect(statusAfter('subscription_updated', 'active')).toBeNull();
  });

  it('handles every normalised event', () => {
    // A new event type added without a branch would fall through silently.
    for (const event of BILLING_EVENTS) {
      expect(() => statusAfter(event, 'active'), event).not.toThrow();
    }
  });
});

describe('entitlesPremium — the read path', () => {
  it('entitles an active or trialing subscription', () => {
    expect(entitlesPremium(state({ status: 'active' }), NOW)).toBe(true);
    expect(entitlesPremium(state({ status: 'trialing' }), NOW)).toBe(true);
  });

  it('entitles during grace', () => {
    expect(
      entitlesPremium(state({ status: 'grace', gracePeriodEnd: future(3) }), NOW),
    ).toBe(true);
  });

  it('STOPS entitling the moment grace expires, without a job having run', () => {
    // The row still says 'grace' because nothing has swept it. If this read
    // as entitled, a customer who stopped paying keeps Premium for as long as
    // the sweeper is broken.
    expect(
      entitlesPremium(state({ status: 'grace', gracePeriodEnd: past(1) }), NOW),
    ).toBe(false);
  });

  it('treats grace with no deadline as not entitled', () => {
    expect(entitlesPremium(state({ status: 'grace', gracePeriodEnd: null }), NOW)).toBe(
      false,
    );
  });

  it('keeps Premium after cancellation until the paid period ends (§26)', () => {
    // They asked to stop renewing and have already paid for the remaining
    // time. Taking it early takes something they bought.
    expect(
      entitlesPremium(state({ status: 'cancelled', currentPeriodEnd: future(10) }), NOW),
    ).toBe(true);
  });

  it('stops at the end of the cancelled period', () => {
    expect(
      entitlesPremium(state({ status: 'cancelled', currentPeriodEnd: past(1) }), NOW),
    ).toBe(false);
  });

  it('never entitles past_due, expired or inactive', () => {
    for (const status of ['past_due', 'expired', 'inactive'] as SubscriptionStatus[]) {
      expect(entitlesPremium(state({ status }), NOW), status).toBe(false);
    }
  });

  it('is stricter than grantsPaidPlan, never more lenient', () => {
    // grantsPaidPlan reads the status alone; this adds the time checks. If
    // this ever said yes where that said no, the two would disagree about who
    // is a paying customer.
    const cases: SubscriptionState[] = [
      state({ status: 'active' }),
      state({ status: 'trialing' }),
      state({ status: 'grace', gracePeriodEnd: future(1) }),
      state({ status: 'grace', gracePeriodEnd: past(1) }),
      state({ status: 'past_due' }),
      state({ status: 'expired' }),
      state({ status: 'inactive' }),
    ];
    for (const s of cases) {
      if (entitlesPremium(s, NOW)) {
        expect(grantsPaidPlan(s.status), s.status).toBe(true);
      }
    }
  });
});

describe('grace period — §24, §25', () => {
  it('defaults inside the range §25 suggests', () => {
    expect(DEFAULT_GRACE_DAYS).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_GRACE_DAYS).toBeLessThanOrEqual(7);
  });

  it('is configurable rather than hardcoded', () => {
    expect(graceEndsAt(NOW, 3).toISOString()).toBe('2026-09-17T12:00:00.000Z');
    expect(graceEndsAt(NOW, 7).toISOString()).toBe('2026-09-21T12:00:00.000Z');
  });

  it('crosses a month boundary correctly', () => {
    expect(graceEndsAt(new Date('2026-09-28T00:00:00Z'), 7).toISOString()).toBe(
      '2026-10-05T00:00:00.000Z',
    );
  });
});

describe('expiredStatusFor — §29, the reconciliation job', () => {
  it('expires grace that has run out', () => {
    expect(
      expiredStatusFor(state({ status: 'grace', gracePeriodEnd: past(1) }), NOW),
    ).toBe('expired');
  });

  it('expires a cancelled subscription past its period', () => {
    expect(
      expiredStatusFor(state({ status: 'cancelled', currentPeriodEnd: past(1) }), NOW),
    ).toBe('expired');
  });

  it('leaves anything still live alone', () => {
    expect(expiredStatusFor(state({ status: 'active' }), NOW)).toBeNull();
    expect(
      expiredStatusFor(state({ status: 'grace', gracePeriodEnd: future(1) }), NOW),
    ).toBeNull();
    expect(
      expiredStatusFor(state({ status: 'cancelled', currentPeriodEnd: future(5) }), NOW),
    ).toBeNull();
  });

  it('agrees with the read path — never expires something still entitled', () => {
    const cases: SubscriptionState[] = [
      state({ status: 'grace', gracePeriodEnd: future(1) }),
      state({ status: 'grace', gracePeriodEnd: past(1) }),
      state({ status: 'cancelled', currentPeriodEnd: future(1) }),
      state({ status: 'cancelled', currentPeriodEnd: past(1) }),
    ];
    for (const s of cases) {
      if (expiredStatusFor(s, NOW) === 'expired') {
        expect(entitlesPremium(s, NOW), s.status).toBe(false);
      }
    }
  });
});

describe('downgradeEffect — §30, §31, §32', () => {
  it('deletes nothing, ever', () => {
    // §30: "Downgrade must not destroy core financial data... Downgrade
    // restricts access; deletion removes data. Never let one behave like the
    // other." This assertion is the guard on that sentence.
    expect(downgradeEffect().deletes).toEqual([]);
  });

  it('does not touch documents (§31)', () => {
    expect(downgradeEffect().deletesDocuments).toBe(false);
  });

  it('keeps usage already recorded (§32)', () => {
    expect(downgradeEffect().keepsExistingUsage).toBe(true);
  });

  it('restricts only entitlement keys that exist', () => {
    // A typo here silently restricts nothing.
    for (const key of downgradeEffect().restricts) {
      expect(ENTITLEMENT_KEYS, key).toContain(key);
    }
  });
});
