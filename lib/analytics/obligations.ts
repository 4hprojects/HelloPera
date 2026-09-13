import { money, type Money } from '@/lib/money';
import type { DisplayStatus } from '@/lib/finance/obligation';

/**
 * Bill, receivable and expected-income metrics — PHASE-06 §19, §20, §49,
 * §50, §51.
 *
 * Structural input, so this never imports a service: anything shaped like an
 * obligation works, which is what makes it testable and what stops the
 * dependency running the wrong way.
 *
 * Two rules run through all of it:
 *
 *   §49/§50  Every total uses **remaining**, never the original amount. A
 *            ₱5,000 bill with ₱3,000 already paid is ₱2,000 outstanding.
 *   §8/§29   Totals are grouped per currency and never combined. The existing
 *            bills and receivables pages sum across currencies and stamp the
 *            profile's currency on the result; this replaces that.
 */

export type MetricObligation = {
  currency: string;
  remaining: Money;
  applied: Money;
  /** due_date, or expected_date. Null when the obligation carries no date. */
  date: string | null;
  display: DisplayStatus;
};

export type Bucket = { count: number; amount: Money };

export type ObligationMetrics = {
  currency: string;
  outstanding: Bucket;
  dueSoon: Bucket;
  overdue: Bucket;
};

export type ExpectedIncomeMetrics = {
  currency: string;
  expectedThisMonth: Bucket;
  upcoming: Bucket;
  missed: Bucket;
  /**
   * Sum of what has already been received against **this month's** expected
   * rows. Named for what it measures: the receipt date is not available here,
   * only the expectation's date, so this is not "received this month".
   */
  receivedOfThisMonth: Money;
};

const SETTLED: ReadonlySet<DisplayStatus> = new Set(['paid', 'cancelled']);

function emptyBucket(currency: string): Bucket {
  return { count: 0, amount: money(0n, currency) };
}

function add(bucket: Bucket, amount: Money): Bucket {
  return {
    count: bucket.count + 1,
    amount: money(bucket.amount.minor + amount.minor, bucket.amount.currency),
  };
}

/**
 * Outstanding / due soon / overdue per currency, for bills (§49) or
 * receivables (§50) — the shapes are identical, only the wording differs.
 *
 * "Due soon" includes due-today: both mean "act now, nothing is late yet",
 * and neither is counted in overdue.
 */
export function obligationMetrics(
  items: readonly MetricObligation[],
  preferred?: string,
): ObligationMetrics[] {
  const byCurrency = new Map<string, ObligationMetrics>();
  const ensure = (currency: string) => {
    const existing = byCurrency.get(currency);
    if (existing) return existing;
    const created: ObligationMetrics = {
      currency,
      outstanding: emptyBucket(currency),
      dueSoon: emptyBucket(currency),
      overdue: emptyBucket(currency),
    };
    byCurrency.set(currency, created);
    return created;
  };

  if (preferred) ensure(preferred);

  for (const item of items) {
    if (SETTLED.has(item.display)) continue;
    const m = ensure(item.currency);
    m.outstanding = add(m.outstanding, item.remaining);
    if (item.display === 'overdue' || item.display === 'missed') {
      m.overdue = add(m.overdue, item.remaining);
    } else if (item.display === 'due_soon' || item.display === 'due_today') {
      m.dueSoon = add(m.dueSoon, item.remaining);
    }
  }

  return order([...byCurrency.values()], preferred);
}

/**
 * Expected income — §20, §51.
 *
 * Kept deliberately separate from realized income: nothing here ever reaches
 * a cash-flow figure. §20, "Do not include expected income in realized income
 * totals", is guaranteed structurally rather than by discipline — the cash
 * flow aggregator's only input is transaction rows, and expected income lives
 * in a different table entirely.
 *
 * @param month  YYYY-MM in the user's timezone.
 */
export function expectedIncomeMetrics(
  items: readonly MetricObligation[],
  month: string,
  preferred?: string,
): ExpectedIncomeMetrics[] {
  const byCurrency = new Map<string, ExpectedIncomeMetrics>();
  const ensure = (currency: string) => {
    const existing = byCurrency.get(currency);
    if (existing) return existing;
    const created: ExpectedIncomeMetrics = {
      currency,
      expectedThisMonth: emptyBucket(currency),
      upcoming: emptyBucket(currency),
      missed: emptyBucket(currency),
      receivedOfThisMonth: money(0n, currency),
    };
    byCurrency.set(currency, created);
    return created;
  };

  if (preferred) ensure(preferred);

  for (const item of items) {
    if (item.display === 'cancelled') continue;
    const m = ensure(item.currency);
    const inMonth = item.date?.slice(0, 7) === month;

    if (inMonth) {
      m.expectedThisMonth = add(m.expectedThisMonth, item.remaining);
      m.receivedOfThisMonth = money(
        m.receivedOfThisMonth.minor + item.applied.minor,
        item.currency,
      );
    }
    if (item.display === 'missed') m.missed = add(m.missed, item.remaining);
    else if (!inMonth && item.display !== 'paid')
      m.upcoming = add(m.upcoming, item.remaining);
  }

  return order([...byCurrency.values()], preferred);
}

/** The metrics for one currency, or a zeroed set so a card never renders nothing. */
export function metricsFor<T extends { currency: string }>(
  all: readonly T[],
  currency: string,
  empty: (currency: string) => T,
): T {
  return all.find((m) => m.currency === currency) ?? empty(currency);
}

export function emptyObligationMetrics(currency: string): ObligationMetrics {
  return {
    currency,
    outstanding: emptyBucket(currency),
    dueSoon: emptyBucket(currency),
    overdue: emptyBucket(currency),
  };
}

export function emptyExpectedIncomeMetrics(currency: string): ExpectedIncomeMetrics {
  return {
    currency,
    expectedThisMonth: emptyBucket(currency),
    upcoming: emptyBucket(currency),
    missed: emptyBucket(currency),
    receivedOfThisMonth: money(0n, currency),
  };
}

function order<T extends { currency: string }>(list: T[], preferred?: string): T[] {
  return list.sort((a, b) => {
    if (a.currency === preferred) return -1;
    if (b.currency === preferred) return 1;
    return a.currency.localeCompare(b.currency);
  });
}
