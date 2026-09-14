import { todayInTimezone } from '@/lib/finance/obligation';

/**
 * Usage periods — PHASE-09 §16, §18.
 *
 * Calendar months in the USER's timezone, not the server's and not the
 * subscription anniversary. PHASE-11 §22 is explicit that renewal does not
 * reset monthly usage, so a period is a calendar fact and nothing else.
 */

export type UsagePeriod = {
  /** YYYY-MM-DD, first day of the month. */
  start: string;
  /** YYYY-MM-DD, last day of the month. */
  end: string;
};

/** Days in a month. `month` is 1-based. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The calendar month containing `date` (YYYY-MM-DD). */
export function periodForDate(date: string): UsagePeriod {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const last = daysInMonth(year, month);
  const mm = String(month).padStart(2, '0');
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(last).padStart(2, '0')}`,
  };
}

/**
 * The current period for a user.
 *
 * `now` is injectable so this stays pure and testable; callers pass the user's
 * timezone from `profiles.timezone` (PHASE-01 §9).
 */
export function currentPeriod(timezone: string, now: Date = new Date()): UsagePeriod {
  return periodForDate(todayInTimezone(timezone, now));
}

/**
 * §18 — what happens when a user changes timezone mid-period.
 *
 * The current period keeps the boundaries it was created with; only the next
 * one uses the new zone. Recomputing a period that has already been charged
 * against would change a number the user has already been shown — "18 / 30"
 * becoming "17 / 30" after a settings change is a bug report, and a
 * justifiable one.
 *
 * So: if an existing period contains today, keep it. Otherwise start fresh.
 */
export function resolvePeriod(
  timezone: string,
  existing: UsagePeriod | null,
  now: Date = new Date(),
): UsagePeriod {
  const today = todayInTimezone(timezone, now);
  if (existing && today >= existing.start && today <= existing.end) return existing;
  return periodForDate(today);
}

/**
 * When the user's limit resets — the copy §33 asks for ("Your limit resets on
 * October 1"). Returns YYYY-MM-DD of the first day of the next period.
 */
export function resetsOn(period: UsagePeriod): string {
  const year = Number(period.end.slice(0, 4));
  const month = Number(period.end.slice(5, 7));
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}
