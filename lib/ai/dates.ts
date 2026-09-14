import { rangeFor, type DateRange, type RangePreset } from '@/lib/analytics/range';
import type { AiRangePreset } from '@/schemas/ai.schema';

/**
 * Date resolution for the assistant — PHASE-12 §27, §28.
 *
 * §28 is titled "Date Range Authority", and the authority is deliberately not
 * here. `rangeFor()` in `lib/analytics/range.ts` already decides what "this
 * month" means, in the user's timezone, for every analytics page — so this
 * module translates the assistant's vocabulary into that one and then defers.
 *
 * The alternative, a second implementation, is how acceptance criterion 12
 * ("spending questions match dashboard analytics") gets quietly broken: two
 * definitions of a month drift on the first edge case — a 31st, a leap day,
 * a DST boundary — and the assistant starts confidently quoting a number the
 * dashboard disagrees with. One definition cannot drift from itself.
 *
 * The two presets analytics does not have are forward-looking, because bills
 * and forecasts are the only questions that point at the future.
 */

/** How far ahead `next-30-days` and `next-7-days` reach. */
const FORWARD_DAYS: Record<string, number> = {
  'next-7-days': 7,
  'next-30-days': 30,
};

/** Shift a YYYY-MM-DD by whole days, in UTC so DST cannot move it. */
function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type ResolvedRange = DateRange & {
  /** True for the forward-looking presets, which read obligations, not history. */
  forward: boolean;
};

/**
 * Turn an intent's range into concrete inclusive dates.
 *
 * @param today YYYY-MM-DD in the user's timezone — from `todayInTimezone()`,
 *              never from `new Date()` on the server, whose day may not be
 *              theirs.
 */
export function resolveRange(
  preset: AiRangePreset,
  today: string,
  custom?: { from?: string; to?: string },
): ResolvedRange {
  const forwardDays = FORWARD_DAYS[preset];
  if (forwardDays !== undefined) {
    return {
      preset: 'custom',
      from: today,
      to: shiftDays(today, forwardDays),
      label: preset === 'next-7-days' ? 'Next 7 days' : 'Next 30 days',
      swapped: false,
      forward: true,
    };
  }

  return { ...rangeFor(preset as RangePreset, today, custom), forward: false };
}

/**
 * §28 — the window a comparison is measured against.
 *
 * Returned as its own range so the comparison figure comes from the same
 * executor as the primary one. Computing "last month" by subtracting inside a
 * query is how a comparison ends up measured over a different number of days
 * than the thing it is compared to.
 */
export function comparisonRange(
  range: ResolvedRange,
  comparison: 'previous_period' | 'previous_year',
): ResolvedRange | null {
  // A forward-looking range has no meaningful "previous": comparing bills due
  // next week against bills due last week answers a question nobody asked.
  if (range.forward) return null;

  if (comparison === 'previous_year') {
    return {
      ...range,
      preset: 'custom',
      from: shiftYearsKeepingDay(range.from, -1),
      to: shiftYearsKeepingDay(range.to, -1),
      label: 'Same period last year',
    };
  }

  // An immediately preceding window of the same length. Inclusive dates, so
  // the span is (to - from) + 1 days and the previous window ends the day
  // before this one starts.
  const days = daysBetween(range.from, range.to) + 1;
  const to = shiftDays(range.from, -1);
  return {
    ...range,
    preset: 'custom',
    from: shiftDays(to, -(days - 1)),
    to,
    label: 'Previous period',
  };
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * A year earlier, keeping the calendar day.
 *
 * 29 February has no counterpart in a common year; it lands on 1 March, which
 * is one day wide and would silently shorten a comparison window. Clamped to
 * 28 February instead, which keeps the window the length the caller asked for.
 */
function shiftYearsKeepingDay(date: string, years: number): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const targetYear = y + years;
  const lastDay = new Date(Date.UTC(targetYear, m, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${String(targetYear).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
