import {
  add,
  isNegative,
  money,
  negate,
  subtract,
  sum,
  zero,
  type Money,
} from '@/lib/money';
import { daysBetween } from '@/lib/finance/obligation';
import { isLiquid, type AccountNature, type AccountType } from '@/lib/finance/types';
import type {
  Confidence,
  CurrencyForecast,
  ForecastEvent,
  ForecastPoint,
  Horizon,
  Shortfall,
} from '@/types/forecast';

/**
 * Deterministic projection — PHASE-07 §29 to §36, §54.
 *
 * Pure: dates in, dates out, no `Date` built from "now" and no database. The
 * caller resolves today in the user's timezone (§47) and hands it in.
 *
 * §29's formula is the whole model:
 *
 *   Projected Balance = Current Balance + Future Inflows - Future Outflows
 *
 * No AI computes any of it (§29), and nothing here estimates. Every movement
 * in the projection is a dated record the user can open and check, which is
 * what makes §45's assumptions panel honest rather than decorative.
 */

/** Add whole days to a YYYY-MM-DD date, in UTC. */
export function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/**
 * Which events count.
 *
 * §41 and §42: a skipped or cancelled occurrence "must not affect the
 * forecast". §43: `include_in_forecast` lets a user drop an uncertain one
 * without skipping it. §39: a fulfilled event has already become a real
 * transaction that moved the balance, so counting it again would charge the
 * user twice for the same money — the double-count §70 asks to be tested for.
 */
export function includesEvent(event: {
  status?: string;
  includeInForecast?: boolean;
}): boolean {
  if (event.includeInForecast === false) return false;
  const status = event.status ?? 'scheduled';
  return status === 'scheduled';
}

function signed(event: ForecastEvent): Money {
  return event.direction === 'in' ? event.amount : negate(event.amount);
}

/**
 * Build the day-by-day projection.
 *
 * Every day in the window gets a point, including empty ones: a chart that
 * skipped quiet days would compress time and draw a slope that never happened.
 */
export function projectBalance(params: {
  currency: string;
  /** §32 — liquid asset accounts only. */
  openingBalance: Money;
  today: string;
  horizon: Horizon;
  events: ForecastEvent[];
}): CurrencyForecast {
  const { currency, openingBalance, today, horizon } = params;
  const end = addDays(today, horizon);

  // Only what falls inside the window, oldest first. A stable tiebreak on id
  // keeps the timeline from reordering between two identical dates.
  const events = params.events
    .filter((e) => e.date >= today && e.date <= end)
    .sort((a, b) =>
      a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1,
    );

  const byDate = new Map<string, ForecastEvent[]>();
  for (const e of events) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }

  const points: ForecastPoint[] = [];
  let running = openingBalance;
  let totalInflows = zero(currency);
  let totalOutflows = zero(currency);
  let shortfall: Shortfall | null = null;

  const days = daysBetween(today, end);
  for (let i = 0; i <= days; i += 1) {
    const date = addDays(today, i);
    const dayEvents = byDate.get(date) ?? [];

    let inflows = zero(currency);
    let outflows = zero(currency);
    for (const e of dayEvents) {
      if (e.direction === 'in') inflows = add(inflows, e.amount);
      else outflows = add(outflows, e.amount);
    }

    const opening = running;
    const closing = add(subtract(opening, outflows), inflows);

    totalInflows = add(totalInflows, inflows);
    totalOutflows = add(totalOutflows, outflows);

    points.push({
      date,
      openingProjectedBalance: opening,
      inflows,
      outflows,
      closingProjectedBalance: closing,
      events: dayEvents,
    });

    // §55 — the FIRST date it happens, not the worst. A user needs to know
    // when to act, and the first crossing is the deadline.
    if (shortfall === null && isNegative(closing)) {
      shortfall = {
        date,
        amount: money(-closing.minor, currency),
        // Everything up to and including that day: those are the movements a
        // user could still reschedule to avoid it.
        contributors: events.filter((e) => e.date <= date),
      };
    }

    running = closing;
  }

  return {
    currency,
    horizon,
    openingBalance,
    closingBalance: running,
    totalInflows,
    totalOutflows,
    points,
    shortfall,
    timeline: events,
  };
}

/** Build the dashboard's 30-day figure from rows its main load already owns. */
export function projectDashboardBalance(params: {
  today: string;
  currency: string;
  accounts: ReadonlyArray<{
    type: AccountType;
    nature: AccountNature;
    currency_code: string;
    balance: Money;
    is_archived?: boolean;
  }>;
  bills: ReadonlyArray<{
    id: string;
    name: string;
    date: string | null;
    currency: string;
    remaining: Money;
  }>;
  expectedIncome: ReadonlyArray<{
    id: string;
    name: string;
    date: string | null;
    currency: string;
    remaining: Money;
    lifecycle: string;
  }>;
  events: ReadonlyArray<{
    id: string;
    name: string;
    scheduledDate: string;
    eventType: string;
    amount: Money;
    status?: string;
    includeInForecast?: boolean;
  }>;
}): { opening: Money; closing: Money } | null {
  const { today, currency } = params;
  const liquid = params.accounts.filter(
    (account) =>
      !account.is_archived &&
      isLiquid(account.type, account.nature) &&
      account.currency_code === currency,
  );
  if (liquid.length === 0) return null;

  const opening = sum(
    liquid.map((account) => account.balance),
    currency,
  );
  const events: ForecastEvent[] = [
    ...params.bills
      .filter((bill) => bill.currency === currency && bill.date)
      .map((bill) => ({
        id: `bill:${bill.id}`,
        date: bill.date!,
        kind: 'bill' as const,
        label: bill.name,
        amount: bill.remaining,
        direction: 'out' as const,
        confidence: confidenceFor('bill'),
        href: null,
      })),
    ...params.expectedIncome
      .filter(
        (income) =>
          income.currency === currency &&
          income.date &&
          (income.lifecycle === 'open' || income.lifecycle === 'partially_paid'),
      )
      .map((income) => ({
        id: `expected_income:${income.id}`,
        date: income.date!,
        kind: 'expected_income' as const,
        label: income.name,
        amount: income.remaining,
        direction: 'in' as const,
        confidence: confidenceFor('expected_income'),
        href: null,
      })),
    ...params.events
      .filter((event) => event.amount.currency === currency && includesEvent(event))
      .map((event) => ({
        id: `event:${event.id}`,
        date: event.scheduledDate,
        kind: 'expected_event' as const,
        label: event.name,
        amount: event.amount,
        direction: (event.eventType === 'income' ? 'in' : 'out') as 'in' | 'out',
        confidence: confidenceFor('expected_event'),
        href: null,
      })),
  ];

  const projection = projectBalance({
    currency,
    openingBalance: opening,
    today,
    horizon: 30,
    events,
  });

  return { opening, closing: projection.closingBalance };
}

/** §44 — what weight an event's source earns it. */
export function confidenceFor(kind: ForecastEvent['kind']): Confidence {
  switch (kind) {
    case 'bill':
    case 'expected_event':
      return 'scheduled';
    case 'expected_income':
      return 'expected';
    case 'receivable':
      // §31 — "collection is less certain", which is why it is off by default.
      return 'optional';
  }
}

/** Net movement across a projection — `closing - opening`, stated directly. */
export function netChange(forecast: CurrencyForecast): Money {
  return subtract(forecast.closingBalance, forecast.openingBalance);
}

export { signed as signedAmount };
