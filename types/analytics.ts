import type { CashFlowSummary, MonthlyTrendPoint } from '@/lib/analytics/aggregate';
import type { AnalyticsFilter } from '@/lib/analytics/filter';
import type { DateRange } from '@/lib/analytics/range';
import type { LabelledAggregate } from '@/types/dashboard';

/**
 * The /analytics view model — PHASE-06 §64.
 *
 * No `server-only` import, so the page, its components and the pure layer can
 * all reference it.
 */

/** One option in a filter select. */
export type FilterOption = { id: string; label: string; hint?: string };

/**
 * A filter value that was asked for and refused — §65.
 *
 * Dropping a stale id silently would look like "no activity in this period",
 * which is the same shape as a real empty result and a genuinely dangerous
 * thing to confuse in a finance app. The page says what it ignored.
 */
export type RejectedFilter = {
  field: 'account' | 'category' | 'currency' | 'range';
  reason: string;
};

export type AnalyticsData = {
  range: DateRange;
  /** The currency every figure below is reported in. Never a mixture (§8). */
  currency: string;
  /** Every currency the user actually holds, for the §29 selector. */
  currencies: string[];
  filter: AnalyticsFilter;
  rejected: RejectedFilter[];

  cashFlow: CashFlowSummary;
  months: string[];
  trend: MonthlyTrendPoint[];

  spendingByCategory: LabelledAggregate[];
  spendingByAccount: LabelledAggregate[];
  spendingByMerchant: LabelledAggregate[];
  incomeByCategory: LabelledAggregate[];
  /** Which breakdowns the filters leave meaningful — §42. */
  show: {
    spending: boolean;
    income: boolean;
    byCategory: boolean;
    byAccount: boolean;
    byMerchant: boolean;
  };
  /** True when the selected type moves money without earning or spending it. */
  isNeutralType: boolean;

  accountOptions: FilterOption[];
  categoryOptions: FilterOption[];

  /** True when the user has no confirmed activity at all, ever. */
  hasNoData: boolean;
};
