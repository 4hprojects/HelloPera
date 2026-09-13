import type { Money } from '@/lib/money';

/**
 * Deterministic forecasting — PHASE-07 §29 to §36, §44, §54.
 *
 * Every figure is `Money` (bigint minor units), and `lib/money` throws when
 * two currencies meet. That is §46 made structural: a combined projected
 * balance is a fabricated number, and a forecast is the place a user is most
 * likely to act on one.
 */

/** §34 — exactly three. Longer horizons are deliberately not offered. */
export const HORIZONS = [30, 60, 90] as const;
export type Horizon = (typeof HORIZONS)[number];

/**
 * §44 — how much weight a projected event deserves.
 *
 * Three words, no percentages. A confidence score would imply a model that
 * does not exist; these are categories the user can reason about.
 */
export type Confidence =
  /** A dated obligation or generated occurrence. */
  | 'scheduled'
  /** Expected income — dated, but not yet promised money. */
  | 'expected'
  /** Receivables, off by default: collection is the least certain of the three. */
  | 'optional';

export type ForecastEventKind =
  'bill' | 'expected_income' | 'receivable' | 'expected_event';

/** One projected movement. */
export type ForecastEvent = {
  id: string;
  date: string;
  kind: ForecastEventKind;
  label: string;
  /** Always positive; `direction` carries the sign. */
  amount: Money;
  direction: 'in' | 'out';
  confidence: Confidence;
  /** Where to go to act on it. */
  href: string | null;
};

/** §36 — one day of the projection. */
export type ForecastPoint = {
  date: string;
  openingProjectedBalance: Money;
  inflows: Money;
  outflows: Money;
  closingProjectedBalance: Money;
  events: ForecastEvent[];
};

/** §54, §55 — the first day the projection dips below zero, if it does. */
export type Shortfall = {
  date: string;
  /** How far below zero, as a positive figure. */
  amount: Money;
  /** The events on and before that date that drove it there. */
  contributors: ForecastEvent[];
};

/**
 * The projection for one currency. Never merged with another (§46).
 */
export type CurrencyForecast = {
  currency: string;
  horizon: Horizon;
  /** §32 — liquid asset accounts only; investments are excluded by default. */
  openingBalance: Money;
  closingBalance: Money;
  totalInflows: Money;
  totalOutflows: Money;
  points: ForecastPoint[];
  shortfall: Shortfall | null;
  /** Every event in the window, oldest first — the §35 textual timeline. */
  timeline: ForecastEvent[];
};

/** §45 — stated plainly on the page, because an unexplained projection is a guess. */
export type ForecastAssumptions = {
  includeReceivables: boolean;
  /** Names of the liquid accounts the opening balance came from. */
  liquidAccounts: string[];
  /** Accounts deliberately left out, and why. */
  excludedAccounts: { name: string; reason: string }[];
  horizonDays: Horizon;
  currency: string;
  /** True when the user holds more than one currency (§46). */
  multiCurrency: boolean;
};

export type ForecastData = {
  forecast: CurrencyForecast;
  assumptions: ForecastAssumptions;
  /** Currencies the user holds, default first — for the selector. */
  currencies: string[];
};
