import { describe, expect, it } from 'vitest';
import {
  bucketByMonth,
  incomeByCategory,
  spendingByAccount,
  spendingByCategory,
  spendingByMerchant,
  summariseCashFlow,
  totalOf,
  type AnalyticsRow,
} from './aggregate';
import { monthWindow } from './series';
import type { TransactionType } from '@/lib/finance/types';

const PHP = 'PHP';

function row(over: Partial<AnalyticsRow> & { type: TransactionType }): AnalyticsRow {
  return {
    status: 'confirmed',
    direction: null,
    minor: 100_00n,
    currency: PHP,
    date: '2026-09-10',
    categoryId: null,
    sourceAccountId: null,
    merchant: null,
    refundOf: null,
    ...over,
  };
}

/** The original purchase a refund reverses — §14's attribution source. */
function parent(
  over: Partial<NonNullable<AnalyticsRow['refundOf']>> = {},
): NonNullable<AnalyticsRow['refundOf']> {
  return { categoryId: null, sourceAccountId: null, merchant: null, ...over };
}

describe('summariseCashFlow', () => {
  it('counts only income as income — §11', () => {
    const rows = [
      row({ type: 'income', minor: 45_000_00n }),
      row({ type: 'transfer', minor: 10_000_00n }),
      row({ type: 'refund', minor: 1_200_00n }),
      row({ type: 'adjustment', minor: 500_00n }),
      row({ type: 'opening_balance', minor: 80_000_00n }),
    ];
    expect(summariseCashFlow(rows, PHP).income.minor).toBe(45_000_00n);
  });

  it('nets refunds within expenses and keeps both figures — §14', () => {
    // The worked example from the spec: 24,500 gross − 1,200 refunds = 23,300.
    const rows = [
      row({ type: 'expense', minor: 24_500_00n }),
      row({ type: 'refund', minor: 1_200_00n }),
    ];
    const out = summariseCashFlow(rows, PHP);
    expect(out.grossExpenses.minor).toBe(24_500_00n);
    expect(out.refunds.minor).toBe(1_200_00n);
    expect(out.netExpenses.minor).toBe(23_300_00n);
  });

  it('lets net expenses go negative when refunds exceed purchases', () => {
    const rows = [
      row({ type: 'expense', minor: 1_000_00n }),
      row({ type: 'refund', minor: 5_000_00n }),
    ];
    const out = summariseCashFlow(rows, PHP);
    // Money came back, so net spending is negative and net cash flow is
    // higher than income. Flooring at zero would hide ₱4,000 of inflow and
    // break the identity the §34 tests assert.
    expect(out.netExpenses.minor).toBe(-4_000_00n);
    expect(out.grossExpenses.minor).toBe(1_000_00n);
    expect(out.netCashFlow.minor).toBe(4_000_00n);
  });

  it('reports adjustments separately by direction — §15', () => {
    const rows = [
      row({ type: 'adjustment', minor: 300_00n, direction: 'increase' }),
      row({ type: 'adjustment', minor: 120_00n, direction: 'decrease' }),
      row({ type: 'income', minor: 1_000_00n }),
    ];
    const out = summariseCashFlow(rows, PHP);
    expect(out.adjustments.increase.minor).toBe(300_00n);
    expect(out.adjustments.decrease.minor).toBe(120_00n);
    // …and never inside income, expenses or cash flow (§15).
    expect(out.income.minor).toBe(1_000_00n);
    expect(out.grossExpenses.minor).toBe(0n);
    expect(out.netCashFlow.minor).toBe(1_000_00n);
  });

  it('counts qualifying rows so empty states never compare money to zero', () => {
    const rows = [
      row({ type: 'income', minor: 500_00n }),
      row({ type: 'expense', minor: 500_00n }),
      row({ type: 'income', minor: 1n, status: 'voided' }),
      row({ type: 'income', minor: 1n, currency: 'USD' }),
    ];
    const out = summariseCashFlow(rows, PHP);
    // A real month can net to exactly zero; rowCount is what separates that
    // from having no data at all (§42).
    expect(out.netCashFlow.minor).toBe(0n);
    expect(out.rowCount).toBe(2);
    expect(summariseCashFlow([], PHP).rowCount).toBe(0);
  });

  it('computes net cash flow from NET expenses — §13', () => {
    const rows = [
      row({ type: 'income', minor: 45_000_00n }),
      row({ type: 'expense', minor: 24_500_00n }),
      row({ type: 'refund', minor: 1_200_00n }),
    ];
    expect(summariseCashFlow(rows, PHP).netCashFlow.minor).toBe(21_700_00n);
  });

  it('goes negative when a period spends more than it earns', () => {
    const rows = [
      row({ type: 'income', minor: 10_000_00n }),
      row({ type: 'expense', minor: 18_000_00n }),
    ];
    expect(summariseCashFlow(rows, PHP).netCashFlow.minor).toBe(-8_000_00n);
  });

  it('excludes voided rows entirely — §4', () => {
    const rows = [
      row({ type: 'income', minor: 45_000_00n, status: 'voided' }),
      row({ type: 'expense', minor: 3_000_00n, status: 'voided' }),
      row({ type: 'expense', minor: 1_000_00n }),
    ];
    const out = summariseCashFlow(rows, PHP);
    expect(out.income.minor).toBe(0n);
    expect(out.grossExpenses.minor).toBe(1_000_00n);
  });

  it('never lets another currency contribute — §8, §29', () => {
    const rows = [
      row({ type: 'income', minor: 1_000_00n, currency: 'USD' }),
      row({ type: 'expense', minor: 500_00n, currency: 'USD' }),
      row({ type: 'income', minor: 45_000_00n }),
    ];
    const php = summariseCashFlow(rows, PHP);
    expect(php.income.minor).toBe(45_000_00n);
    expect(php.grossExpenses.minor).toBe(0n);
    expect(php.income.currency).toBe(PHP);

    const usd = summariseCashFlow(rows, 'USD');
    expect(usd.income.minor).toBe(1_000_00n);
    expect(usd.grossExpenses.minor).toBe(500_00n);
  });

  it('counts a credit-card purchase once, and its bill payment not at all', () => {
    // Phase 02 §34: the expense happened at purchase; paying the card is a
    // transfer from an asset to a liability, not a second expense.
    const rows = [
      row({ type: 'expense', minor: 5_580_00n, sourceAccountId: 'visa' }),
      row({ type: 'transfer', minor: 5_580_00n, sourceAccountId: 'bpi' }),
    ];
    expect(summariseCashFlow(rows, PHP).grossExpenses.minor).toBe(5_580_00n);
  });

  it('returns zero figures in the right currency for no rows', () => {
    const out = summariseCashFlow([], PHP);
    expect(out.income.minor).toBe(0n);
    expect(out.netCashFlow.minor).toBe(0n);
    expect(out.netExpenses.currency).toBe(PHP);
  });
});

describe('§34 aggregate accuracy — totals equal the sum of qualifying rows', () => {
  // The spec's own test: "dashboard total = sum of qualifying transaction
  // rows". Built from a deterministic pseudo-random spread so it exercises
  // far more combinations than hand-written cases, while failing identically
  // on every run.
  function generate(seed: number, count: number): AnalyticsRow[] {
    const types: TransactionType[] = [
      'income',
      'expense',
      'transfer',
      'refund',
      'adjustment',
      'opening_balance',
    ];
    const rows: AnalyticsRow[] = [];
    let state = seed;
    const next = (n: number) => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state % n;
    };
    for (let i = 0; i < count; i += 1) {
      rows.push(
        row({
          type: types[next(types.length)]!,
          status: next(5) === 0 ? 'voided' : 'confirmed',
          currency: next(4) === 0 ? 'USD' : PHP,
          minor: BigInt(next(500_000) + 1),
          date: `2026-0${next(9) + 1}-1${next(9)}`,
          categoryId: `c${next(6)}`,
          sourceAccountId: `a${next(4)}`,
        }),
      );
    }
    return rows;
  }

  for (const seed of [1, 7, 42, 1234, 99999]) {
    it(`holds for generated set ${seed}`, () => {
      const rows = generate(seed, 240);
      const qualifying = rows.filter((r) => r.status !== 'voided' && r.currency === PHP);
      const sumOf = (type: TransactionType) =>
        qualifying.filter((r) => r.type === type).reduce((s, r) => s + r.minor, 0n);

      const out = summariseCashFlow(rows, PHP);
      expect(out.income.minor).toBe(sumOf('income'));
      expect(out.grossExpenses.minor).toBe(sumOf('expense'));
      expect(out.refunds.minor).toBe(sumOf('refund'));

      expect(out.netExpenses.minor).toBe(sumOf('expense') - sumOf('refund'));
      expect(out.netCashFlow.minor).toBe(out.income.minor - out.netExpenses.minor);
      // Every figure stays in bigint — one stray Number() would round money.
      for (const m of [out.income, out.grossExpenses, out.refunds, out.netExpenses]) {
        expect(typeof m.minor).toBe('bigint');
      }
    });

    it(`monthly buckets sum back to the whole for set ${seed}`, () => {
      const rows = generate(seed, 240);
      const months = monthWindow('2026-09-30', 9);
      const points = bucketByMonth(rows, months, PHP);
      const whole = summariseCashFlow(rows, PHP);

      // Every row in the generator falls inside the window, so the parts must
      // reconstitute the whole exactly — for gross figures. Net expenses are
      // floored per month, so they can only exceed the overall net.
      expect(points.reduce((s, p) => s + p.income.minor, 0n)).toBe(whole.income.minor);
      expect(points.reduce((s, p) => s + p.grossExpenses.minor, 0n)).toBe(
        whole.grossExpenses.minor,
      );
      expect(points.reduce((s, p) => s + p.refunds.minor, 0n)).toBe(whole.refunds.minor);
      // Signed throughout, so the parts reconstitute the whole exactly.
      expect(points.reduce((s, p) => s + p.netExpenses.minor, 0n)).toBe(
        whole.netExpenses.minor,
      );
      expect(points.reduce((s, p) => s + p.netCashFlow.minor, 0n)).toBe(
        whole.netCashFlow.minor,
      );
    });

    it(`breakdowns sum back to their headline figure for set ${seed}`, () => {
      const rows = generate(seed, 240);
      const whole = summariseCashFlow(rows, PHP);
      // The identity that catches almost every aggregation bug: each
      // breakdown must account for exactly its headline total, no more and
      // no less (§34).
      expect(totalOf(spendingByCategory(rows, PHP), PHP).minor).toBe(
        whole.netExpenses.minor,
      );
      expect(totalOf(spendingByAccount(rows, PHP), PHP).minor).toBe(
        whole.netExpenses.minor,
      );
      expect(totalOf(incomeByCategory(rows, PHP), PHP).minor).toBe(whole.income.minor);
    });
  }
});

describe('bucketByMonth', () => {
  const months = monthWindow('2026-09-13', 3); // Jul, Aug, Sep

  it('places each row in its own month', () => {
    const rows = [
      row({ type: 'income', minor: 1_000_00n, date: '2026-07-01' }),
      row({ type: 'income', minor: 2_000_00n, date: '2026-08-15' }),
      row({ type: 'income', minor: 3_000_00n, date: '2026-09-30' }),
    ];
    expect(bucketByMonth(rows, months, PHP).map((p) => p.income.minor)).toEqual([
      1_000_00n,
      2_000_00n,
      3_000_00n,
    ]);
  });

  it('handles the first and last day of a month — §35', () => {
    const rows = [
      row({ type: 'expense', minor: 500_00n, date: '2026-08-01' }),
      row({ type: 'expense', minor: 700_00n, date: '2026-08-31' }),
    ];
    const august = bucketByMonth(rows, months, PHP)[1]!;
    expect(august.month).toBe('2026-08');
    expect(august.grossExpenses.minor).toBe(1_200_00n);
  });

  it('keeps empty months rather than closing the gap', () => {
    const points = bucketByMonth(
      [row({ type: 'income', minor: 1_000_00n, date: '2026-09-02' })],
      months,
      PHP,
    );
    expect(points).toHaveLength(3);
    expect(points[0]!.income.minor).toBe(0n);
    expect(points[1]!.income.minor).toBe(0n);
  });

  it('drops rows outside the window', () => {
    const rows = [row({ type: 'income', minor: 9_999_00n, date: '2025-01-05' })];
    expect(bucketByMonth(rows, months, PHP).every((p) => p.income.minor === 0n)).toBe(
      true,
    );
  });

  it('labels each month', () => {
    expect(bucketByMonth([], months, PHP).map((p) => p.label)).toEqual([
      'Jul',
      'Aug',
      'Sep',
    ]);
  });
});

describe('spendingByCategory — refund attribution, §14', () => {
  it('subtracts a refund from the ORIGINAL purchase category, not its own', () => {
    const rows = [
      row({ type: 'expense', minor: 5_000_00n, categoryId: 'tech' }),
      row({ type: 'expense', minor: 2_000_00n, categoryId: 'food' }),
      // The refund row carries a "refunds" category of its own, which must be
      // ignored in favour of the purchase it reverses.
      row({
        type: 'refund',
        minor: 1_500_00n,
        categoryId: 'refunds',
        refundOf: parent({ categoryId: 'tech' }),
      }),
    ];
    const out = spendingByCategory(rows, PHP);
    expect(out.find((c) => c.categoryId === 'tech')?.amount.minor).toBe(3_500_00n);
    expect(out.find((c) => c.categoryId === 'food')?.amount.minor).toBe(2_000_00n);
    expect(out.find((c) => c.categoryId === 'refunds')).toBeUndefined();
  });

  it('falls back to its own category when the purchase is not linked', () => {
    const rows = [
      row({ type: 'expense', minor: 5_000_00n, categoryId: 'tech' }),
      row({ type: 'refund', minor: 1_500_00n, categoryId: 'tech', refundOf: null }),
    ];
    expect(spendingByCategory(rows, PHP)[0]!.amount.minor).toBe(3_500_00n);
  });

  it('drops a category a refund cancels out to exactly zero', () => {
    const rows = [
      row({ type: 'expense', minor: 2_000_00n, categoryId: 'tech' }),
      row({
        type: 'refund',
        minor: 2_000_00n,
        refundOf: parent({ categoryId: 'tech' }),
      }),
    ];
    expect(spendingByCategory(rows, PHP)).toEqual([]);
  });

  it('keeps a net-negative category rather than hiding the refund', () => {
    const rows = [
      row({ type: 'expense', minor: 500_00n, categoryId: 'tech' }),
      row({
        type: 'refund',
        minor: 9_000_00n,
        refundOf: parent({ categoryId: 'tech' }),
      }),
    ];
    const out = spendingByCategory(rows, PHP);
    expect(out).toHaveLength(1);
    expect(out[0]!.amount.minor).toBe(-8_500_00n);
  });

  it('keeps §14’s worked case legible — a big purchase refunded in full', () => {
    // "a large refund cannot silently hide a large purchase"
    const rows = [
      row({ type: 'expense', minor: 20_000_00n, categoryId: 'tech' }),
      row({
        type: 'refund',
        minor: 20_000_00n,
        refundOf: parent({ categoryId: 'tech' }),
      }),
    ];
    const out = summariseCashFlow(rows, PHP);
    expect(out.grossExpenses.minor).toBe(20_000_00n);
    expect(out.refunds.minor).toBe(20_000_00n);
    expect(out.netExpenses.minor).toBe(0n);
    expect(out.rowCount).toBe(2);
  });

  it('groups uncategorised spending under a null key', () => {
    const rows = [row({ type: 'expense', minor: 800_00n, categoryId: null })];
    expect(spendingByCategory(rows, PHP)[0]!.categoryId).toBeNull();
  });

  it('orders largest first', () => {
    const rows = [
      row({ type: 'expense', minor: 100_00n, categoryId: 'a' }),
      row({ type: 'expense', minor: 900_00n, categoryId: 'b' }),
      row({ type: 'expense', minor: 400_00n, categoryId: 'c' }),
    ];
    expect(spendingByCategory(rows, PHP).map((c) => c.categoryId)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('ignores income and transfers', () => {
    const rows = [
      row({ type: 'income', minor: 45_000_00n, categoryId: 'salary' }),
      row({ type: 'transfer', minor: 5_000_00n, categoryId: 'moving' }),
      row({ type: 'expense', minor: 100_00n, categoryId: 'food' }),
    ];
    expect(spendingByCategory(rows, PHP).map((c) => c.categoryId)).toEqual(['food']);
  });
});

describe('spendingByAccount — §22', () => {
  it('groups by source account and returns the refund to it', () => {
    const rows = [
      row({ type: 'expense', minor: 8_500_00n, sourceAccountId: 'gcash' }),
      row({ type: 'expense', minor: 6_200_00n, sourceAccountId: 'bpi' }),
      row({
        type: 'refund',
        minor: 500_00n,
        sourceAccountId: null,
        refundOf: parent({ sourceAccountId: 'gcash' }),
      }),
    ];
    const out = spendingByAccount(rows, PHP);
    expect(out.find((a) => a.categoryId === 'gcash')?.amount.minor).toBe(8_000_00n);
    expect(out.find((a) => a.categoryId === 'bpi')?.amount.minor).toBe(6_200_00n);
  });
});

describe('incomeByCategory — §23', () => {
  it('groups income and excludes refunds', () => {
    const rows = [
      row({ type: 'income', minor: 45_000_00n, categoryId: 'salary' }),
      row({ type: 'income', minor: 8_000_00n, categoryId: 'freelance' }),
      row({ type: 'refund', minor: 1_000_00n, categoryId: 'salary' }),
      row({ type: 'expense', minor: 900_00n, categoryId: 'food' }),
    ];
    const out = incomeByCategory(rows, PHP);
    expect(out.map((c) => c.categoryId)).toEqual(['salary', 'freelance']);
    expect(out[0]!.amount.minor).toBe(45_000_00n);
  });
});

describe('totalOf', () => {
  it('sums aggregates and returns zero in the right currency for none', () => {
    expect(totalOf([], PHP)).toEqual({ minor: 0n, currency: PHP });
    const rows = [
      row({ type: 'expense', minor: 100_00n, categoryId: 'a' }),
      row({ type: 'expense', minor: 250_00n, categoryId: 'b' }),
    ];
    expect(totalOf(spendingByCategory(rows, PHP), PHP).minor).toBe(350_00n);
  });
});

describe('spendingByMerchant — §55', () => {
  it('groups expenses by the merchant as typed', () => {
    const rows = [
      row({ type: 'expense', minor: 1_200_00n, merchant: 'Jollibee' }),
      row({ type: 'expense', minor: 800_00n, merchant: 'Jollibee' }),
      row({ type: 'expense', minor: 3_000_00n, merchant: 'Shopee' }),
    ];
    const out = spendingByMerchant(rows, PHP);
    expect(out.map((m) => [m.categoryId, m.amount.minor])).toEqual([
      ['Shopee', 3_000_00n],
      ['Jollibee', 2_000_00n],
    ]);
  });

  it('does not normalise names — §55 forbids guessing', () => {
    // "SM" and "SM Supermarket" may well be the same shop. Merging them would
    // be a guess, and the spec says not to guess.
    const rows = [
      row({ type: 'expense', minor: 100_00n, merchant: 'SM' }),
      row({ type: 'expense', minor: 200_00n, merchant: 'SM Supermarket' }),
    ];
    expect(spendingByMerchant(rows, PHP)).toHaveLength(2);
  });

  it('returns a refund to the merchant of the original purchase', () => {
    const rows = [
      row({ type: 'expense', minor: 5_000_00n, merchant: 'Lazada' }),
      row({
        type: 'refund',
        minor: 1_500_00n,
        merchant: 'Lazada Returns',
        refundOf: parent({ merchant: 'Lazada' }),
      }),
    ];
    const out = spendingByMerchant(rows, PHP);
    expect(out).toHaveLength(1);
    expect(out[0]!.amount.minor).toBe(3_500_00n);
  });

  it('keeps unrecorded merchants under a null key so totals reconcile', () => {
    const rows = [
      row({ type: 'expense', minor: 900_00n, merchant: null }),
      row({ type: 'expense', minor: 100_00n, merchant: 'Grab' }),
    ];
    const out = spendingByMerchant(rows, PHP);
    expect(totalOf(out, PHP).minor).toBe(summariseCashFlow(rows, PHP).netExpenses.minor);
    expect(out.some((m) => m.categoryId === null)).toBe(true);
  });

  it('totals to net expenses, like every other breakdown (§34)', () => {
    const rows = [
      row({ type: 'expense', minor: 4_000_00n, merchant: 'A' }),
      row({ type: 'expense', minor: 6_000_00n, merchant: 'B' }),
      row({ type: 'refund', minor: 1_000_00n, refundOf: parent({ merchant: 'A' }) }),
      row({ type: 'income', minor: 9_000_00n, merchant: 'Employer' }),
    ];
    expect(totalOf(spendingByMerchant(rows, PHP), PHP).minor).toBe(
      summariseCashFlow(rows, PHP).netExpenses.minor,
    );
  });
});
