import type { Money } from '@/lib/money';

/**
 * Obligation status — Phase 03 §9, §38.
 *
 * Two vocabularies, deliberately separate:
 *
 *   Persisted (lifecycle)  open | partially_paid | paid | cancelled
 *   Derived (time)         upcoming | due_soon | due_today | overdue
 *
 * Time states are computed here at read time. Storing them would require a
 * daily job whose only purpose is refreshing a label — and between runs the
 * label would be silently wrong, which for "overdue" is exactly the moment it
 * matters.
 */

export const LIFECYCLE_STATUSES = [
  'open',
  'partially_paid',
  'paid',
  'cancelled',
] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export type DisplayStatus =
  | 'upcoming'
  | 'due_soon'
  | 'due_today'
  | 'overdue'
  | 'partially_paid'
  | 'paid'
  | 'cancelled'
  | 'missed';

/** Configurable (§39). Never hardcode 3 across the UI. */
export const DUE_SOON_DAYS = 3;

/**
 * Today in a given IANA timezone, as YYYY-MM-DD.
 *
 * Due dates are calendar dates, not instants. Comparing them against UTC
 * "now" marks a Manila bill overdue for the last 8 hours of the day it is
 * still due — which is the single most likely date bug in this product.
 */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  // en-CA gives ISO-shaped YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. Negative means past. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(to.slice(0, 4)),
    Number(to.slice(5, 7)) - 1,
    Number(to.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

export type ObligationLike = {
  status: LifecycleStatus;
  amount: Money;
  applied: Money;
  /** due_date for bills/receivables, expected_date for expected income. */
  date: string | null;
};

export function remaining(obligation: Pick<ObligationLike, 'amount' | 'applied'>): Money {
  return {
    minor: obligation.amount.minor - obligation.applied.minor,
    currency: obligation.amount.currency,
  };
}

/**
 * The status to show.
 *
 * Order matters: cancelled and paid are terminal and outrank any date. A paid
 * bill whose due date has passed is paid, not overdue.
 */
export function displayStatus(
  obligation: ObligationLike,
  today: string,
  options: { dueSoonDays?: number; missedInsteadOfOverdue?: boolean } = {},
): DisplayStatus {
  const { dueSoonDays = DUE_SOON_DAYS, missedInsteadOfOverdue = false } = options;

  if (obligation.status === 'cancelled') return 'cancelled';
  if (obligation.status === 'paid') return 'paid';

  const left = remaining(obligation);
  // Defensive: a zero remainder with a non-paid lifecycle means the two
  // disagree. Trust the arithmetic.
  if (left.minor <= 0n) return 'paid';

  if (!obligation.date) {
    return obligation.status === 'partially_paid' ? 'partially_paid' : 'upcoming';
  }

  const days = daysBetween(today, obligation.date);

  if (days < 0) return missedInsteadOfOverdue ? 'missed' : 'overdue';
  if (days === 0) return 'due_today';
  if (days <= dueSoonDays) return 'due_soon';

  return obligation.status === 'partially_paid' ? 'partially_paid' : 'upcoming';
}

/** Badge tone. Colour is never the only signal — the label always says it too. */
export function statusTone(
  status: DisplayStatus,
): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'paid':
      return 'success';
    case 'overdue':
    case 'missed':
      return 'danger';
    // The showcase gives Due Soon its own amber pill, distinct from both the
    // red of Overdue and the neutral of Upcoming. Due today shares it: it is
    // the same "act now, nothing is late yet" state, and the label is what
    // separates them.
    case 'due_today':
    case 'due_soon':
      return 'warning';
    case 'partially_paid':
      return 'info';
    case 'cancelled':
    case 'upcoming':
    default:
      return 'neutral';
  }
}

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  upcoming: 'Upcoming',
  due_soon: 'Due soon',
  due_today: 'Due today',
  overdue: 'Overdue',
  partially_paid: 'Partly paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
  missed: 'Missed',
};
