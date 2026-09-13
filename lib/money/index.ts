/**
 * Money — Phase 02 §7.
 *
 * Amounts are held as bigint MINOR UNITS (centavos for PHP). Never as a
 * JavaScript number.
 *
 *   0.1 + 0.2 === 0.30000000000000004
 *
 * That is not an acceptable error in a ledger, and it compounds: a cent lost
 * per transaction is a balance that never reconciles and cannot be explained
 * to the person whose money it is.
 *
 * bigint rather than a decimal library because it is exact, has no dependency,
 * and covers the full range of `numeric(18,2)` — 10^18 minor units, well past
 * Number.MAX_SAFE_INTEGER (~9.007 x 10^15), which is exactly where a
 * number-based implementation would start silently rounding.
 *
 * The database remains the source of truth. These helpers move values across
 * the boundary without corrupting them.
 */

/** Minor units per major unit. PHP, USD, EUR are all 2. */
export const DEFAULT_SCALE = 2;

export type Money = {
  /** Minor units. ₱1,234.56 is 123456n. */
  readonly minor: bigint;
  readonly currency: string;
};

export class MoneyError extends Error {}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    // HelloPera never converts (master plan §11). Summing across currencies
    // would invent a number, and a forecast is exactly where someone would
    // act on it.
    throw new MoneyError(
      `Cannot combine ${a.currency} and ${b.currency}. HelloPera does not convert currencies.`,
    );
  }
}

export function money(minor: bigint, currency: string): Money {
  return { minor, currency: currency.toUpperCase() };
}

export function zero(currency: string): Money {
  return money(0n, currency);
}

/**
 * Parse a decimal string into minor units.
 *
 * Accepts "1234.56", "1,234.56", "₱1,234.56", " 1234 ", "-12.30".
 * Rejects anything with more precision than the scale allows, rather than
 * rounding silently — a truncated centavo is a reconciliation bug later.
 */
export function parseDecimal(input: string, scale = DEFAULT_SCALE): bigint {
  const cleaned = input
    .trim()
    .replace(/[₱$€£¥]/g, '')
    .replace(/[\s,_]/g, '');

  if (cleaned === '' || cleaned === '-' || cleaned === '+') {
    throw new MoneyError('Enter an amount.');
  }
  if (!/^[+-]?\d*(\.\d*)?$/.test(cleaned)) {
    throw new MoneyError(`"${input}" is not a valid amount.`);
  }

  const negative = cleaned.startsWith('-');
  const unsigned = cleaned.replace(/^[+-]/, '');
  const [whole = '', fraction = ''] = unsigned.split('.');

  if (fraction.length > scale) {
    throw new MoneyError(
      `Amounts use at most ${scale} decimal places. "${input}" has ${fraction.length}.`,
    );
  }

  const padded = fraction.padEnd(scale, '0');
  const digits = `${whole === '' ? '0' : whole}${padded}`;
  const value = BigInt(digits);
  return negative ? -value : value;
}

export function parseMoney(
  input: string,
  currency: string,
  scale = DEFAULT_SCALE,
): Money {
  return money(parseDecimal(input, scale), currency);
}

/** Render minor units as a plain decimal string — the form Postgres accepts. */
export function toDecimalString(minor: bigint, scale = DEFAULT_SCALE): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const divisor = 10n ** BigInt(scale);
  const whole = abs / divisor;
  const fraction = abs % divisor;
  const body =
    scale === 0 ? `${whole}` : `${whole}.${fraction.toString().padStart(scale, '0')}`;
  return negative ? `-${body}` : body;
}

/** Read a Postgres `numeric` (driver returns it as a string) without precision loss. */
export function fromDatabase(value: string | number | null, currency: string): Money {
  if (value === null) return zero(currency);
  // A number here means the driver already coerced it, which risks precision.
  // Accepted for resilience, but String() keeps whatever precision survived.
  return money(parseDecimal(String(value)), currency);
}

/** Serialise for Postgres. Always a string — never a JS number. */
export function toDatabase(value: Money): string {
  return toDecimalString(value.minor);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor + b.minor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor - b.minor, a.currency);
}

export function negate(a: Money): Money {
  return money(-a.minor, a.currency);
}

export function sum(values: readonly Money[], currency: string): Money {
  return values.reduce((acc, v) => add(acc, v), zero(currency));
}

/**
 * Total a mixed-currency list, grouped — never combined.
 *
 * `sum()` throws on a cross-currency add, which is the right default for one
 * figure. This is for the other case: a list of obligations or accounts that
 * may legitimately span currencies and must be reported per currency, because
 * HelloPera never converts (master plan §11, PHASE-06 §8 and §29).
 *
 * Ordered with `preferred` first when given — the user's default currency
 * leads, the rest follow alphabetically so the order is stable across loads.
 */
export function sumByCurrency(values: readonly Money[], preferred?: string): Money[] {
  const totals = new Map<string, bigint>();
  for (const v of values)
    totals.set(v.currency, (totals.get(v.currency) ?? 0n) + v.minor);
  if (preferred && !totals.has(preferred)) totals.set(preferred, 0n);

  return [...totals.entries()]
    .map(([currency, minor]) => ({ minor, currency }))
    .sort((a, b) => {
      if (a.currency === preferred) return -1;
      if (b.currency === preferred) return 1;
      return a.currency.localeCompare(b.currency);
    });
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.minor < b.minor) return -1;
  if (a.minor > b.minor) return 1;
  return 0;
}

export const isZero = (a: Money): boolean => a.minor === 0n;
export const isNegative = (a: Money): boolean => a.minor < 0n;
export const isPositive = (a: Money): boolean => a.minor > 0n;

const SYMBOLS: Record<string, string> = {
  PHP: '₱',
  USD: '$',
  EUR: '€',
  JPY: '¥',
  SGD: 'S$',
};

/**
 * Format for display.
 *
 * Always renders the currency, because HelloPera shows per-currency totals and
 * an unlabelled figure is ambiguous the moment a second currency exists.
 */
export function formatMoney(
  value: Money,
  options: { showSign?: boolean; locale?: string } = {},
): string {
  const { showSign = false, locale = 'en-PH' } = options;
  const negative = value.minor < 0n;
  const abs = negative ? -value.minor : value.minor;

  const divisor = 10n ** BigInt(DEFAULT_SCALE);
  const whole = abs / divisor;
  const fraction = (abs % divisor).toString().padStart(DEFAULT_SCALE, '0');

  const grouped = new Intl.NumberFormat(locale).format(whole);
  const symbol = SYMBOLS[value.currency] ?? `${value.currency} `;

  const sign = negative ? '-' : showSign && abs > 0n ? '+' : '';
  return `${sign}${symbol}${grouped}.${fraction}`;
}
