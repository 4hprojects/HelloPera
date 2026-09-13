import { describe, expect, it } from 'vitest';
import {
  emptyExpectedIncomeMetrics,
  emptyObligationMetrics,
  expectedIncomeMetrics,
  metricsFor,
  obligationMetrics,
  type MetricObligation,
} from './obligations';
import type { DisplayStatus } from '@/lib/finance/obligation';
import { money } from '@/lib/money';

const PHP = 'PHP';
const php = (n: bigint) => money(n, PHP);

function ob(
  over: Partial<MetricObligation> & { display: DisplayStatus },
): MetricObligation {
  return {
    currency: PHP,
    remaining: php(1_000_00n),
    applied: php(0n),
    date: '2026-09-20',
    ...over,
  };
}

const only =
  (currency: string) =>
  <T extends { currency: string }>(list: readonly T[]) =>
    list.find((m) => m.currency === currency)!;
const phpOnly = only(PHP);

describe('obligationMetrics — §49, §50', () => {
  it('totals remaining, never the original amount', () => {
    // A ₱5,000 bill with ₱3,000 applied is ₱2,000 outstanding.
    const m = phpOnly(
      obligationMetrics([
        ob({
          display: 'partially_paid',
          remaining: php(2_000_00n),
          applied: php(3_000_00n),
        }),
      ]),
    );
    expect(m.outstanding.amount.minor).toBe(2_000_00n);
    expect(m.outstanding.count).toBe(1);
  });

  it('excludes paid and cancelled entirely', () => {
    const m = phpOnly(
      obligationMetrics([
        ob({ display: 'paid', remaining: php(0n) }),
        ob({ display: 'cancelled', remaining: php(9_000_00n) }),
        ob({ display: 'upcoming', remaining: php(1_500_00n) }),
      ]),
    );
    expect(m.outstanding.amount.minor).toBe(1_500_00n);
    expect(m.outstanding.count).toBe(1);
  });

  it('counts due-today inside due-soon, not overdue', () => {
    const m = phpOnly(
      obligationMetrics([
        ob({ display: 'due_today', remaining: php(100_00n) }),
        ob({ display: 'due_soon', remaining: php(200_00n) }),
      ]),
    );
    expect(m.dueSoon.amount.minor).toBe(300_00n);
    expect(m.dueSoon.count).toBe(2);
    expect(m.overdue.count).toBe(0);
  });

  it('separates overdue from due soon, and counts both in outstanding', () => {
    const m = phpOnly(
      obligationMetrics([
        ob({ display: 'overdue', remaining: php(2_500_00n) }),
        ob({ display: 'due_soon', remaining: php(149_00n) }),
        ob({ display: 'upcoming', remaining: php(2_800_00n) }),
      ]),
    );
    expect(m.overdue.amount.minor).toBe(2_500_00n);
    expect(m.dueSoon.amount.minor).toBe(149_00n);
    expect(m.outstanding.amount.minor).toBe(5_449_00n);
    expect(m.outstanding.count).toBe(3);
  });

  it('counts a missed expectation as overdue money', () => {
    const m = phpOnly(
      obligationMetrics([ob({ display: 'missed', remaining: php(500_00n) })]),
    );
    expect(m.overdue.amount.minor).toBe(500_00n);
  });

  it('keeps an undated obligation out of overdue and due soon — §19', () => {
    const m = phpOnly(
      obligationMetrics([
        ob({ display: 'upcoming', date: null, remaining: php(700_00n) }),
      ]),
    );
    expect(m.outstanding.amount.minor).toBe(700_00n);
    expect(m.overdue.count).toBe(0);
    expect(m.dueSoon.count).toBe(0);
  });

  it('never sums across currencies — §8, §29', () => {
    const all = obligationMetrics(
      [
        ob({ display: 'overdue', remaining: php(2_500_00n) }),
        ob({ display: 'overdue', currency: 'USD', remaining: money(40_00n, 'USD') }),
      ],
      PHP,
    );
    expect(all).toHaveLength(2);
    expect(all[0]!.currency).toBe(PHP);
    expect(all[0]!.overdue.amount.minor).toBe(2_500_00n);
    expect(all[1]!.currency).toBe('USD');
    expect(all[1]!.overdue.amount.minor).toBe(40_00n);
  });

  it('always emits the preferred currency, even with nothing in it', () => {
    const all = obligationMetrics([], PHP);
    expect(all).toHaveLength(1);
    expect(all[0]!.outstanding.amount).toEqual({ minor: 0n, currency: PHP });
  });

  it('puts the preferred currency first', () => {
    const all = obligationMetrics(
      [
        ob({ display: 'upcoming', currency: 'AUD', remaining: money(1n, 'AUD') }),
        ob({ display: 'upcoming', currency: 'USD', remaining: money(1n, 'USD') }),
        ob({ display: 'upcoming', remaining: php(1n) }),
      ],
      PHP,
    );
    expect(all.map((m) => m.currency)).toEqual([PHP, 'AUD', 'USD']);
  });
});

describe('expectedIncomeMetrics — §20, §51', () => {
  const MONTH = '2026-09';

  it('splits this month, upcoming and missed', () => {
    const all = expectedIncomeMetrics(
      [
        ob({ display: 'upcoming', date: '2026-09-15', remaining: php(45_000_00n) }),
        ob({ display: 'upcoming', date: '2026-11-15', remaining: php(45_000_00n) }),
        ob({ display: 'missed', date: '2026-08-15', remaining: php(12_000_00n) }),
      ],
      MONTH,
      PHP,
    );
    const m = phpOnly(all);
    expect(m.expectedThisMonth.amount.minor).toBe(45_000_00n);
    expect(m.upcoming.amount.minor).toBe(45_000_00n);
    expect(m.missed.amount.minor).toBe(12_000_00n);
  });

  it('reports what has been received against this month’s expectations', () => {
    const m = phpOnly(
      expectedIncomeMetrics(
        [
          ob({
            display: 'partially_paid',
            date: '2026-09-15',
            remaining: php(15_000_00n),
            applied: php(30_000_00n),
          }),
          // Applied against a different month must not leak in.
          ob({
            display: 'paid',
            date: '2026-08-15',
            remaining: php(0n),
            applied: php(99_000_00n),
          }),
        ],
        MONTH,
        PHP,
      ),
    );
    expect(m.receivedOfThisMonth.minor).toBe(30_000_00n);
  });

  it('excludes cancelled expectations', () => {
    const m = phpOnly(
      expectedIncomeMetrics(
        [ob({ display: 'cancelled', date: '2026-09-15', remaining: php(45_000_00n) })],
        MONTH,
        PHP,
      ),
    );
    expect(m.expectedThisMonth.count).toBe(0);
  });

  it('does not count a fully received past expectation as upcoming', () => {
    const m = phpOnly(
      expectedIncomeMetrics(
        [ob({ display: 'paid', date: '2026-07-15', remaining: php(0n) })],
        MONTH,
        PHP,
      ),
    );
    expect(m.upcoming.count).toBe(0);
    expect(m.missed.count).toBe(0);
  });

  it('never sums across currencies', () => {
    const all = expectedIncomeMetrics(
      [
        ob({ display: 'upcoming', date: '2026-09-15', remaining: php(45_000_00n) }),
        ob({
          display: 'upcoming',
          date: '2026-09-15',
          currency: 'USD',
          remaining: money(800_00n, 'USD'),
        }),
      ],
      MONTH,
      PHP,
    );
    expect(all.map((m) => m.expectedThisMonth.amount.minor)).toEqual([
      45_000_00n,
      800_00n,
    ]);
  });

  // §20's "never counted as realized income" is structural, not behavioural:
  // the cash-flow aggregator's only input is transaction rows, and expected
  // income lives in a different table. There is no code path to test, which
  // is the strongest form the guarantee can take.
});

describe('metricsFor', () => {
  it('falls back to a zeroed set rather than undefined', () => {
    expect(metricsFor([], 'USD', emptyObligationMetrics).outstanding.amount).toEqual({
      minor: 0n,
      currency: 'USD',
    });
    expect(metricsFor([], 'USD', emptyExpectedIncomeMetrics).missed.count).toBe(0);
  });

  it('finds the requested currency when present', () => {
    const all = obligationMetrics([ob({ display: 'overdue', remaining: php(5n) })], PHP);
    expect(metricsFor(all, PHP, emptyObligationMetrics).overdue.amount.minor).toBe(5n);
  });
});
