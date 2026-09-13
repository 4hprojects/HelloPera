import { endOfMonth, monthLabel } from '@/lib/analytics/series';

/**
 * Date ranges for the analytics filters — PHASE-06 §25.
 *
 * Every boundary is a plain YYYY-MM-DD calendar date in the user's own
 * timezone. The caller resolves "today" once via
 * `todayInTimezone(profile.timezone)` and everything here is arithmetic on
 * that string — done in UTC so a DST boundary can never move a month, the
 * same discipline as `endOfMonth`.
 */

export const RANGE_PRESETS = [
  'this-month',
  'last-month',
  '3m',
  '6m',
  'this-year',
  'custom',
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

export type DateRange = {
  preset: RangePreset;
  /** Inclusive YYYY-MM-DD. */
  from: string;
  to: string;
  /** Human label for the period chip on each card. */
  label: string;
  /**
   * True when a custom range arrived with its dates the wrong way round and
   * was swapped. §65 says reject `end before start`; a URL is not a form, so
   * rather than dead-ending we correct it and say so on the page — the input
   * is still refused, it just is not fatal.
   */
  swapped: boolean;
  /** True when the start was pulled forward to the maximum span. */
  clamped?: boolean;
};

/** The longest custom range we will read. See the `custom` branch below. */
export const MAX_RANGE_YEARS = 5;

export const PRESET_LABELS: Record<RangePreset, string> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
  'this-year': 'This year',
  custom: 'Custom range',
};

/** First day of the month containing `date`. */
export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Shift a YYYY-MM-DD by whole years, keeping the day. */
function shiftYears(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y + years, m - 1, d));
  return shifted.toISOString().slice(0, 10);
}

/** Shift a YYYY-MM-DD by whole months, landing on the first of the month. */
function shiftMonths(date: string, months: number): string {
  const [y, m] = date.split('-').map(Number) as [number, number, number];
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Resolve a preset into concrete bounds.
 *
 * The multi-month presets are inclusive of the current month: "last 3 months"
 * is this month plus the two before it, which is what the same wording means
 * on the dashboard's trend control.
 *
 * @param today   YYYY-MM-DD in the user's timezone.
 * @param custom  Only consulted for the `custom` preset.
 */
export function rangeFor(
  preset: RangePreset,
  today: string,
  custom?: { from?: string; to?: string },
): DateRange {
  const label = PRESET_LABELS[preset];

  switch (preset) {
    case 'last-month': {
      const previous = shiftMonths(today, -1);
      return {
        preset,
        from: previous,
        to: endOfMonth(previous),
        label: `${monthLabel(previous.slice(0, 7))} ${previous.slice(0, 4)}`,
        swapped: false,
      };
    }
    case '3m':
      return {
        preset,
        from: shiftMonths(today, -2),
        to: endOfMonth(today),
        label,
        swapped: false,
      };
    case '6m':
      return {
        preset,
        from: shiftMonths(today, -5),
        to: endOfMonth(today),
        label,
        swapped: false,
      };
    case 'this-year':
      return {
        preset,
        from: `${today.slice(0, 4)}-01-01`,
        // Not 31 December: months that have not happened yet would draw as
        // empty columns on the trend, which reads as "you earned nothing in
        // November" rather than "November is in the future".
        to: endOfMonth(today),
        label: today.slice(0, 4),
        swapped: false,
      };
    case 'custom': {
      // A missing half is filled relative to the half that was supplied, not
      // from the current month: `to=2026-01-31` alone means "the month ending
      // there", and defaulting `from` to this month would produce an
      // eight-month range from one typed date — then swap it for good measure.
      const rawFrom =
        custom?.from || (custom?.to ? startOfMonth(custom.to) : startOfMonth(today));
      const rawTo = custom?.to || (custom?.from ? endOfMonth(today) : endOfMonth(today));

      const swapped = rawFrom > rawTo;
      let from = swapped ? rawTo : rawFrom;
      const to = swapped ? rawFrom : rawTo;

      // A hand-edited `from=1900-01-01` would ask for a hundred years of
      // rows; `fetchAnalyticsRows` gives up past 60,000 and throws, landing on
      // an error page that blames the database for a URL.
      const floor = shiftYears(to, -MAX_RANGE_YEARS);
      const clamped = from < floor;
      if (clamped) from = floor;

      return {
        preset,
        from,
        to,
        label: `${from} to ${to}`,
        swapped,
        clamped,
      };
    }
    case 'this-month':
    default:
      return {
        preset: 'this-month',
        from: startOfMonth(today),
        to: endOfMonth(today),
        label,
        swapped: false,
      };
  }
}

/**
 * Every YYYY-MM the range touches, oldest first.
 *
 * `monthWindow` counts backwards from today; a range needs the months between
 * two arbitrary dates, which is a different question.
 *
 * Long ranges are capped to the most recent `cap` months — 120 columns is not
 * a chart — and `truncated` says so, because a chart silently plotting a
 * shorter period than its own heading claims is exactly the kind of quiet
 * wrongness this codebase is otherwise careful about.
 */
export function monthsInRange(
  range: { from: string; to: string },
  cap = 24,
): { months: string[]; truncated: boolean } {
  const all: string[] = [];
  let cursor = startOfMonth(range.from);
  const last = range.to.slice(0, 7);

  while (cursor.slice(0, 7) <= last && all.length < 600) {
    all.push(cursor.slice(0, 7));
    cursor = shiftMonths(cursor, 1);
  }

  return all.length > cap
    ? { months: all.slice(-cap), truncated: true }
    : { months: all, truncated: false };
}
