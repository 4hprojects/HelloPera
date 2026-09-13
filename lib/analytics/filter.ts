import {
  attributedAccountId,
  attributedCategoryId,
  type AnalyticsRow,
} from '@/lib/analytics/aggregate';
import type { TransactionType } from '@/lib/finance/types';

/**
 * Row-level analytics filters — PHASE-06 §26, §27, §28.
 *
 * These are applied in memory rather than in SQL, and that is not laziness.
 * Filtering rows away before aggregation silently breaks §14: a refund is
 * netted against the category and account of the purchase it reverses, and a
 * refund row carries its *own* category, its own (often absent) account, and
 * its own type. Narrow the query and the refunds never arrive, so every
 * category total comes out overstated by exactly the refunds it should have
 * absorbed — a wrong number that looks entirely plausible.
 *
 * So each filter asks the row the **same question the aggregator will ask** —
 * `attributedCategoryId` / `attributedAccountId`, shared with `groupNet`.
 * Matching on "the row's own key OR its parent's" looks equivalent and is
 * not: a refund whose own account is BPI but whose purchase was on GCash
 * would survive a BPI filter and then be charged to GCash, so a page filtered
 * to BPI would report ₱0 spent and draw a GCash row. Same key, both times, or
 * the chart contradicts its own filter.
 */

export type AnalyticsFilter = {
  /**
   * The account the money left. Note this is narrower than the transactions
   * list's account filter, which matches either side: `AnalyticsRow` folds
   * source and destination into one field, so a transfer matches only its
   * source. Harmless — transfers contribute nothing but a row count — but
   * worth knowing before comparing the two screens.
   */
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
};

export const EMPTY_FILTER: AnalyticsFilter = {};

export function isFiltered(filter: AnalyticsFilter): boolean {
  return Boolean(filter.accountId || filter.categoryId || filter.type);
}

/**
 * Narrow a row set to the filter.
 *
 * The type rule has one deliberate asymmetry: selecting **expense** keeps
 * refunds as well. A refund is not an expense, but §14 makes it part of the
 * expense figure, and a view of spending that dropped the returns would
 * overstate what was actually spent. Every other type selection is literal.
 */
export function applyFilter(
  rows: readonly AnalyticsRow[],
  filter: AnalyticsFilter,
): AnalyticsRow[] {
  if (!isFiltered(filter)) return [...rows];

  return rows.filter((row) => {
    if (filter.accountId && attributedAccountId(row) !== filter.accountId) return false;
    if (filter.categoryId && attributedCategoryId(row) !== filter.categoryId)
      return false;

    if (filter.type) {
      const keepRefundWithExpenses = filter.type === 'expense' && row.type === 'refund';
      if (row.type !== filter.type && !keepRefundWithExpenses) return false;
    }

    return true;
  });
}

/**
 * Which breakdowns a type selection leaves meaningful.
 *
 * `spendingByCategory`, `spendingByAccount` and `spendingByMerchant` only
 * ever read expense and refund rows; `incomeByCategory` only reads income.
 * Filtering to "income" therefore does not make the spending charts empty —
 * it makes them meaningless, and §42 says not to show empty charts. They are
 * hidden instead, which is also the honest answer to "why is this blank".
 */
export function visibleBreakdowns(filter: AnalyticsFilter): {
  spending: boolean;
  income: boolean;
  byCategory: boolean;
  byAccount: boolean;
  byMerchant: boolean;
} {
  const { type } = filter;
  const spending = !type || type === 'expense' || type === 'refund';
  const income = !type || type === 'income';

  return {
    spending,
    income,
    // A breakdown grouped by something the filter has already pinned is a
    // chart with one full-width bar. It says nothing the filter chip does not
    // already say, so it is hidden rather than drawn.
    byCategory: spending && !filter.categoryId,
    byAccount: spending && !filter.accountId,
    byMerchant: spending,
  };
}

/**
 * Types that move money without earning or spending it — §15.
 *
 * Selecting one gives a page of honest but useless zeroes: every cash-flow
 * figure is ₱0 by definition, which looks like a failure rather than an
 * answer. The page says so in words instead.
 */
export function isNeutralType(type?: TransactionType): boolean {
  return type === 'transfer' || type === 'adjustment' || type === 'opening_balance';
}
