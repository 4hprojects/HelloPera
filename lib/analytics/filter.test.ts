import { describe, expect, it } from 'vitest';
import { applyFilter, isFiltered, isNeutralType, visibleBreakdowns } from './filter';
import {
  spendingByAccount,
  spendingByCategory,
  summariseCashFlow,
  totalOf,
  type AnalyticsRow,
} from './aggregate';
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

function parent(
  over: Partial<NonNullable<AnalyticsRow['refundOf']>> = {},
): NonNullable<AnalyticsRow['refundOf']> {
  return { categoryId: null, sourceAccountId: null, merchant: null, ...over };
}

describe('isFiltered', () => {
  it('is false only when nothing is set', () => {
    expect(isFiltered({})).toBe(false);
    expect(isFiltered({ accountId: 'a' })).toBe(true);
    expect(isFiltered({ categoryId: 'c' })).toBe(true);
    expect(isFiltered({ type: 'expense' })).toBe(true);
  });
});

describe('applyFilter — account, §26', () => {
  it('keeps rows on the account', () => {
    const rows = [
      row({ type: 'expense', sourceAccountId: 'bpi' }),
      row({ type: 'expense', sourceAccountId: 'gcash' }),
    ];
    expect(applyFilter(rows, { accountId: 'bpi' })).toHaveLength(1);
  });

  it('keeps a refund whose original purchase was on the account', () => {
    // The refund arrived somewhere else, but it reverses a purchase made from
    // this account, so it belongs to this account's spending (§14).
    const rows = [
      row({ type: 'expense', minor: 5_000_00n, sourceAccountId: 'bpi' }),
      row({
        type: 'refund',
        minor: 1_000_00n,
        sourceAccountId: 'cash',
        refundOf: parent({ sourceAccountId: 'bpi' }),
      }),
    ];
    const kept = applyFilter(rows, { accountId: 'bpi' });
    expect(kept).toHaveLength(2);
    // …and the netting still comes out right.
    expect(summariseCashFlow(kept, PHP).netExpenses.minor).toBe(4_000_00n);
  });

  it('drops a refund whose original purchase was on another account', () => {
    const rows = [
      row({ type: 'expense', minor: 100_00n, sourceAccountId: 'bpi' }),
      row({
        type: 'refund',
        minor: 100_00n,
        sourceAccountId: 'bpi',
        refundOf: parent({ sourceAccountId: 'gcash' }),
      }),
    ];
    // The refund landed in BPI but reverses a GCash purchase, so it belongs to
    // GCash. Keeping it because its own account matched would report ₱0 spent
    // on a page filtered to BPI — and draw a GCash bar on it.
    const kept = applyFilter(rows, { accountId: 'bpi' });
    expect(kept).toHaveLength(1);
    expect(summariseCashFlow(kept, PHP).netExpenses.minor).toBe(100_00n);

    const buckets = spendingByAccount(kept, PHP);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.categoryId).toBe('bpi');
  });

  it('never shows a bucket the filter excluded — the invariant', () => {
    // Filter-then-aggregate must equal aggregate-then-pick-the-bucket. If the
    // two disagree, a chart contradicts the filter above it.
    const rows = [
      row({ type: 'expense', minor: 400_00n, sourceAccountId: 'bpi' }),
      row({ type: 'expense', minor: 900_00n, sourceAccountId: 'gcash' }),
      row({
        type: 'refund',
        minor: 100_00n,
        refundOf: parent({ sourceAccountId: 'bpi' }),
      }),
      row({ type: 'refund', minor: 50_00n, sourceAccountId: 'gcash' }),
    ];
    for (const account of ['bpi', 'gcash']) {
      const filtered = spendingByAccount(applyFilter(rows, { accountId: account }), PHP);
      const whole = spendingByAccount(rows, PHP).filter((b) => b.categoryId === account);
      expect(filtered).toEqual(whole);
      expect(filtered.every((b) => b.categoryId === account)).toBe(true);
    }
  });
});

describe('applyFilter — category, §27', () => {
  it('keeps a refund attributed to the filtered category', () => {
    // This is the case that breaks if filtering happens in SQL: the refund
    // carries category "refunds" and would never arrive.
    const rows = [
      row({ type: 'expense', minor: 8_000_00n, categoryId: 'tech' }),
      row({
        type: 'refund',
        minor: 3_000_00n,
        categoryId: 'refunds',
        refundOf: parent({ categoryId: 'tech' }),
      }),
      row({ type: 'expense', minor: 2_000_00n, categoryId: 'food' }),
    ];
    const kept = applyFilter(rows, { categoryId: 'tech' });
    expect(kept).toHaveLength(2);

    const out = spendingByCategory(kept, PHP);
    expect(out).toHaveLength(1);
    expect(out[0]!.amount.minor).toBe(5_000_00n);
  });

  it('would overstate the category if the refund were dropped', () => {
    // Proof the rule earns its place: the naive filter gives 8,000, not 5,000.
    const rows = [
      row({ type: 'expense', minor: 8_000_00n, categoryId: 'tech' }),
      row({
        type: 'refund',
        minor: 3_000_00n,
        categoryId: 'refunds',
        refundOf: parent({ categoryId: 'tech' }),
      }),
    ];
    const naive = rows.filter((r) => r.categoryId === 'tech');
    expect(totalOf(spendingByCategory(naive, PHP), PHP).minor).toBe(8_000_00n);
    expect(
      totalOf(spendingByCategory(applyFilter(rows, { categoryId: 'tech' }), PHP), PHP)
        .minor,
    ).toBe(5_000_00n);
  });
});

describe('applyFilter — type, §28', () => {
  it('keeps only the chosen type', () => {
    const rows = [
      row({ type: 'income' }),
      row({ type: 'expense' }),
      row({ type: 'transfer' }),
      row({ type: 'adjustment' }),
    ];
    expect(applyFilter(rows, { type: 'income' }).map((r) => r.type)).toEqual(['income']);
    expect(applyFilter(rows, { type: 'transfer' }).map((r) => r.type)).toEqual([
      'transfer',
    ]);
  });

  it('keeps refunds alongside expenses — §14', () => {
    // A view of spending that dropped the returns would overstate what was
    // actually spent.
    const rows = [
      row({ type: 'expense', minor: 5_000_00n }),
      row({ type: 'refund', minor: 2_000_00n }),
      row({ type: 'income', minor: 9_000_00n }),
    ];
    const kept = applyFilter(rows, { type: 'expense' });
    expect(kept).toHaveLength(2);
    expect(summariseCashFlow(kept, PHP).netExpenses.minor).toBe(3_000_00n);
    expect(summariseCashFlow(kept, PHP).income.minor).toBe(0n);
  });

  it('does not pull expenses in when refunds are selected', () => {
    const rows = [row({ type: 'expense' }), row({ type: 'refund' })];
    expect(applyFilter(rows, { type: 'refund' }).map((r) => r.type)).toEqual(['refund']);
  });
});

describe('applyFilter — combinations', () => {
  it('requires every filter to match', () => {
    const rows = [
      row({ type: 'expense', sourceAccountId: 'bpi', categoryId: 'food' }),
      row({ type: 'expense', sourceAccountId: 'bpi', categoryId: 'tech' }),
      row({ type: 'income', sourceAccountId: 'bpi', categoryId: 'food' }),
    ];
    expect(
      applyFilter(rows, { accountId: 'bpi', categoryId: 'food', type: 'expense' }),
    ).toHaveLength(1);
  });

  it('returns a copy, not the original array', () => {
    const rows = [row({ type: 'expense' })];
    const out = applyFilter(rows, {});
    expect(out).toEqual(rows);
    expect(out).not.toBe(rows);
  });

  it('never invents rows', () => {
    const rows = [row({ type: 'expense' }), row({ type: 'income' })];
    for (const f of [
      {},
      { type: 'expense' as const },
      { accountId: 'nope' },
      { categoryId: 'nope' },
    ]) {
      expect(applyFilter(rows, f).length).toBeLessThanOrEqual(rows.length);
    }
  });
});

describe('visibleBreakdowns — §42', () => {
  it('shows everything when nothing is filtered', () => {
    expect(visibleBreakdowns({})).toMatchObject({
      spending: true,
      income: true,
      byCategory: true,
      byAccount: true,
    });
  });

  it('hides the spending charts when only income is in scope', () => {
    // They would be blank, not wrong — and §42 says not to show empty charts.
    expect(visibleBreakdowns({ type: 'income' })).toMatchObject({
      spending: false,
      income: true,
    });
  });

  it('hides the income chart when only spending is in scope', () => {
    expect(visibleBreakdowns({ type: 'expense' })).toMatchObject({
      spending: true,
      income: false,
    });
  });

  it('hides a breakdown the filter has already pinned', () => {
    // Grouping by category on a page filtered to one category is a chart with
    // a single 100% slice.
    expect(visibleBreakdowns({ categoryId: 'food' })).toMatchObject({
      byCategory: false,
      byAccount: true,
    });
    expect(visibleBreakdowns({ accountId: 'bpi' })).toMatchObject({
      byCategory: true,
      byAccount: false,
    });
  });

  it('hides both classes for types no breakdown reads', () => {
    for (const t of ['transfer', 'adjustment', 'opening_balance'] as const) {
      expect(visibleBreakdowns({ type: t })).toMatchObject({
        spending: false,
        income: false,
      });
    }
  });
});

describe('isNeutralType — §15', () => {
  it('names the types that move money without earning or spending it', () => {
    expect(isNeutralType('transfer')).toBe(true);
    expect(isNeutralType('adjustment')).toBe(true);
    expect(isNeutralType('opening_balance')).toBe(true);
    expect(isNeutralType('expense')).toBe(false);
    expect(isNeutralType(undefined)).toBe(false);
  });
});
