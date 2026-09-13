import type { Money } from '@/lib/money';

const SYMBOLS: Record<string, string> = {
  PHP: '₱',
  USD: '$',
  EUR: '€',
  JPY: '¥',
  SGD: 'S$',
};

/**
 * Compact money for chart axes and tight labels — ₱60K rather than ₱60,000.00.
 *
 * The sign leads the symbol (−₱60K, not ₱-60K): once an axis runs below zero
 * the wrong order reads as a currency called "peso-minus".
 */
export function compactMoney(minor: number | bigint, currency: string): string {
  const value = Number(minor) / 100;
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);

  if (abs >= 1_000_000) return `${sign}${symbol}${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${trim(abs / 1_000)}K`;
  return `${sign}${symbol}${Math.round(abs)}`;
}

/** One decimal place, but only when it says something. */
function trim(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

/**
 * "3 days left" / "Due today" / "5 days overdue" — §17's days-remaining.
 *
 * `tone: 'expected'` is for expected income, where nobody owes anything and
 * nothing is late: money that did not arrive is missed, not overdue.
 */
export function dueLabel(
  days: number | null,
  tone: 'obligation' | 'expected' = 'obligation',
): string | null {
  if (days === null) return null;
  if (days === 0) return tone === 'expected' ? 'Expected today' : 'Due today';
  if (days > 0) return days === 1 ? '1 day left' : `${days} days left`;

  const late = -days;
  if (tone === 'expected') return late === 1 ? '1 day ago' : `${late} days ago`;
  return late === 1 ? '1 day overdue' : `${late} days overdue`;
}

export type { Money };
