/**
 * Pure helpers behind the dashboard charts.
 *
 * They live here rather than beside the service or inside the chart
 * components because they are the parts worth testing: month boundaries,
 * percentage deltas, axis rounding and the greeting rotation are all small
 * enough to get subtly wrong and invisible enough that nobody would notice
 * for a month. Neither `server-only` nor JSX belongs in a unit test.
 */

/**
 * The YYYY-MM keys for the `count` months ending at `today`, oldest first.
 *
 * Built in UTC from the already-localised date string: `today` arrives as the
 * user's own calendar date (lib/finance/obligation.todayInTimezone), so the
 * only job here is calendar arithmetic, and doing that in UTC keeps a DST
 * boundary from moving a month.
 */
export function monthWindow(today: string, count: number): string[] {
  const [y, m] = today.split('-').map(Number) as [number, number, number];
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const MONTH_LABEL = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  timeZone: 'UTC',
});

/**
 * The last calendar day of the month containing `today`, as YYYY-MM-DD.
 *
 * §11 and §12 say "within selected month", not "month to date": a confirmed
 * transaction dated later this month has already moved the account balance,
 * so excluding it would make cash flow disagree with the balances shown
 * beside it. Computed in UTC from an already-localised date, so a DST
 * boundary cannot move the month.
 */
export function endOfMonth(today: string): string {
  const [y, m] = today.split('-').map(Number) as [number, number, number];
  // Day 0 of the next month is the last day of this one.
  const d = new Date(Date.UTC(y, m, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** "2026-01" → "Jan". */
export function monthLabel(month: string): string {
  return MONTH_LABEL.format(new Date(`${month}-01T00:00:00Z`));
}

/**
 * Percentage change between two months, or null when there is nothing to
 * compare against — a first month has no delta, and "+100% from ₱0" is noise
 * dressed as insight.
 */
export function percentChange(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Axis ticks rounded up to 1/2/5 × 10ⁿ, so labels read ₱20K / ₱40K rather
 * than ₱18,437. Always returns at least one tick, so a chart of an empty
 * month still draws a grid instead of a bare box.
 */
export function niceTicks(max: number, count: number): number[] {
  const rough = Math.max(max, 1) / Math.max(count, 1);
  const mag = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? mag * 10;
  const out: number[] = [];
  for (let v = step; v <= Math.ceil(Math.max(max, 1) / step) * step + 1e-9; v += step) {
    out.push(v);
  }
  return out.length > 0 ? out : [step];
}

/**
 * An axis domain that always contains zero, for series that can go negative —
 * net cash flow being the one that matters (§24).
 *
 * A chart that scales |value| from a zero baseline draws −₱8,000 and +₱8,000
 * identically, which is not a cosmetic problem in a finance app. An
 * all-positive series yields `bottom === 0` and exactly the ticks `niceTicks`
 * would have produced, so charts that never go negative are unaffected.
 */
export function signedDomain(
  values: readonly number[],
  tickCount: number,
): { bottom: number; top: number; ticks: number[] } {
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);

  const top = max > 0 ? niceTicks(max, tickCount).at(-1)! : 0;
  const bottom =
    min < 0 ? -niceTicks(-min, Math.max(2, Math.floor(tickCount / 2))).at(-1)! : 0;

  const step = niceTicks(Math.max(top, -bottom), tickCount)[0]!;
  const ticks: number[] = [];
  for (let v = bottom; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
  if (!ticks.includes(0)) ticks.push(0);

  return { bottom, top, ticks: [...new Set(ticks)].sort((a, b) => a - b) };
}

/** bigint minor units → numbers, for geometry only. The single documented
 * crossing from exact money into floating point: pixels are not money. */
export function toChartValues(values: readonly bigint[]): number[] {
  return values.map((v) => Number(v));
}

/** Percent change over exact minor units. A ratio is a float by nature. */
export function percentChangeMinor(
  current: bigint,
  previous: bigint | null,
): number | null {
  if (previous === null || previous === 0n) return null;
  return (
    (Number(current - previous) / Number(previous < 0n ? -previous : previous)) * 100
  );
}

/** Time-of-day greeting from a local hour (0–23). */
export function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Pick one item from a rotation, keyed by date rather than at random — a
 * refresh must not reshuffle the page under the reader, and two renders of
 * the same request have to agree or React reports a hydration mismatch.
 */
export function rotate<T>(items: readonly T[], isoDate: string): T {
  if (items.length === 0) throw new Error('rotate() needs at least one item');
  const seed = Number(isoDate.replace(/\D/g, '').slice(-6)) || 0;
  return items[seed % items.length]!;
}

/** Keep the largest `keep` entries and roll the rest into one "Others" row. */
export function collapseTail<T extends { value: number }>(
  slices: readonly T[],
  keep: number,
  makeOther: (value: number) => T,
): T[] {
  if (slices.length <= keep + 1) return [...slices];
  const head = slices.slice(0, keep);
  const tail = slices.slice(keep).reduce((sum, s) => sum + s.value, 0);
  return tail > 0 ? [...head, makeOther(tail)] : [...head];
}
