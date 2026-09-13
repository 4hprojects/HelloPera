/**
 * Recurrence date arithmetic — PHASE-07 §8 to §14.
 *
 * Pure, string-in string-out, all arithmetic in UTC on `YYYY-MM-DD` calendar
 * dates that the caller has already resolved in the user's timezone. Nothing
 * here constructs a `Date` from "now".
 *
 * **The anchor rule, which is the whole point of this module.**
 *
 * Occurrence N is computed from the rule's *start date*, never from the
 * previous occurrence. That distinction is the classic recurrence bug: a rule
 * on the 31st clamps to 28 February, and a generator that then asks "what is
 * one month after the 28th?" answers 28 March. The rule has silently moved
 * from the 31st to the 28th and will never move back. Anchoring every
 * occurrence to the start date means February is clamped and March is not.
 */

export const FREQUENCIES = [
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'yearly',
] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export type RecurrenceRule = {
  frequency: Frequency;
  /** "every N" — §9. */
  intervalCount: number;
  /** YYYY-MM-DD. */
  startDate: string;
  endDate?: string | null;
  /** 1–31 for monthly-family rules. Defaults to the start date's day. */
  dayOfMonth?: number | null;
  /** ISO 1 = Monday … 7 = Sunday, for weekly-family rules. */
  dayOfWeek?: number | null;
};

/** Months advanced per step, for the monthly family. */
const MONTH_STEP: Partial<Record<Frequency, number>> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/** Days advanced per step, for the weekly family. */
const DAY_STEP: Partial<Record<Frequency, number>> = {
  weekly: 7,
  biweekly: 14,
};

function toUTC(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Days in a given month. `month` is 1-based. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoDayOfWeek(date: string): number {
  const day = toUTC(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * The occurrence `steps` intervals after the rule's start.
 *
 * For monthly-family rules the day is taken from `dayOfMonth` (or the start
 * date's day) and clamped to the target month's length — §10's "use last valid
 * day of month", so the 31st becomes 28 or 29 February and then returns to the
 * 31st in March.
 */
export function occurrenceAt(rule: RecurrenceRule, steps: number): string {
  const start = toUTC(rule.startDate);

  const dayStep = DAY_STEP[rule.frequency];
  if (dayStep !== undefined) {
    const base = new Date(start);
    // §11 — a weekly rule may name its weekday; the first occurrence moves
    // forward to that day, and every later one keeps the same offset.
    if (rule.dayOfWeek) {
      const shift = (rule.dayOfWeek - isoDayOfWeek(rule.startDate) + 7) % 7;
      base.setUTCDate(base.getUTCDate() + shift);
    }
    base.setUTCDate(base.getUTCDate() + steps * dayStep * rule.intervalCount);
    return toISO(base);
  }

  const monthStep = MONTH_STEP[rule.frequency] ?? 1;
  const anchorDay = rule.dayOfMonth ?? start.getUTCDate();
  const monthsFromStart = steps * monthStep * rule.intervalCount;

  const targetMonthIndex = start.getUTCMonth() + monthsFromStart;
  const year = start.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const month = ((targetMonthIndex % 12) + 12) % 12; // 0-based

  const day = Math.min(anchorDay, daysInMonth(year, month + 1));
  return toISO(new Date(Date.UTC(year, month, day)));
}

/** Does the rule still run on this date? §12, §13. */
function withinBounds(rule: RecurrenceRule, date: string): boolean {
  if (date < rule.startDate) return false;
  if (rule.endDate && date > rule.endDate) return false;
  return true;
}

/**
 * The first occurrence on or after `from`, or null when the rule has ended.
 *
 * Walks forward from step 0 rather than solving for the step count: the
 * clamping in §10 means the sequence is not a simple arithmetic progression,
 * and a closed-form guess would be wrong in exactly the months that matter.
 * The walk is bounded — see `MAX_STEPS`.
 */
export function firstOccurrenceOnOrAfter(
  rule: RecurrenceRule,
  from: string,
): string | null {
  for (let step = 0; step <= MAX_STEPS; step += 1) {
    const date = occurrenceAt(rule, step);
    if (rule.endDate && date > rule.endDate) return null;
    if (date >= from) return withinBounds(rule, date) ? date : null;
  }
  return null;
}

/** The next occurrence strictly after `date`, or null when the rule has ended. */
export function nextOccurrence(rule: RecurrenceRule, after: string): string | null {
  for (let step = 0; step <= MAX_STEPS; step += 1) {
    const date = occurrenceAt(rule, step);
    if (rule.endDate && date > rule.endDate) return null;
    if (date > after) return withinBounds(rule, date) ? date : null;
  }
  return null;
}

/**
 * Every occurrence in `[from, to]`, oldest first.
 *
 * `cap` bounds the result because a weekly rule over a long horizon is the one
 * combination that can produce a lot of rows; §17 says not to generate years
 * of future rows unnecessarily.
 */
export function occurrencesBetween(
  rule: RecurrenceRule,
  from: string,
  to: string,
  cap = 400,
): string[] {
  const out: string[] = [];
  if (to < from) return out;

  for (let step = 0; step <= MAX_STEPS && out.length < cap; step += 1) {
    const date = occurrenceAt(rule, step);
    if (date > to) break;
    if (rule.endDate && date > rule.endDate) break;
    if (date >= from && withinBounds(rule, date)) out.push(date);
  }
  return out;
}

/**
 * How far the walk will go before giving up.
 *
 * A weekly rule needs 52 steps a year; ten years of a weekly rule is 520. The
 * bound exists so a malformed rule cannot spin forever, not to limit the user
 * — generation horizons are 90 days (§17) and forecasts 90 (§34), both far
 * inside it.
 */
const MAX_STEPS = 4000;

/**
 * Where generation should begin for a newly created or edited rule.
 *
 * §12 forbids occurrences before `startDate`, and the start date remains the
 * anchor, so a rule on the 31st still clamps February and returns to 31 March.
 * What this adds is that the cursor never starts in the past.
 *
 * A user entering "Internet, monthly on the 31st, started January" is saying
 * when the real subscription began — not asking for eight unpaid bills to be
 * created behind them. Anchoring the cursor at the start date did exactly
 * that: measured against a real database, a January rule created in September
 * produced eight back-dated `open` bills, every one counted as overdue.
 *
 * Catch-up is unaffected. The generator honours whatever the cursor holds, so
 * a scheduler that has not run for three days still fills those three days in.
 * This only governs where a rule *starts*.
 */
export function initialCursor(rule: RecurrenceRule, today: string): string | null {
  const from = rule.startDate > today ? rule.startDate : today;
  return firstOccurrenceOnOrAfter(rule, from);
}

/** A human description, for the rule list and the forecast's assumptions (§45). */
export function describeRule(rule: RecurrenceRule): string {
  const n = rule.intervalCount;
  const every = n === 1 ? 'Every' : `Every ${n}`;

  switch (rule.frequency) {
    case 'weekly':
      return n === 1 ? 'Weekly' : `${every} weeks`;
    case 'biweekly':
      return n === 1 ? 'Every 2 weeks' : `${every} fortnights`;
    case 'monthly':
      return n === 1 ? 'Monthly' : `${every} months`;
    case 'quarterly':
      return n === 1 ? 'Quarterly' : `${every} quarters`;
    case 'yearly':
      return n === 1 ? 'Yearly' : `${every} years`;
    default:
      return 'Repeating';
  }
}
