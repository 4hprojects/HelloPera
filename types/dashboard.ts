import type { CashFlowSummary, CategoryAggregate } from '@/lib/analytics/aggregate';
import type { MonthlyTrendPoint } from '@/lib/analytics/aggregate';
import type {
  ExpectedIncomeMetrics,
  ObligationMetrics,
} from '@/lib/analytics/obligations';
import type { PositionSummary } from '@/lib/analytics/position';
import type { Money } from '@/lib/money';
import type { AccountType } from '@/lib/finance/types';
import type { DisplayStatus } from '@/lib/finance/obligation';
import type { AnalyticsClass } from '@/lib/finance/balance';

/**
 * The dashboard's view model — PHASE-06 §64.
 *
 * No `server-only` import, so `lib/`, `services/` and components can all
 * reference these. Every figure is `Money` (bigint minor units); the only
 * conversion to `number` happens at chart geometry, via `toChartValues`.
 */

/** One named slice of a breakdown, with its label already resolved. */
export type LabelledAggregate = CategoryAggregate & { label: string };

/**
 * Everything reported for a single currency.
 *
 * Currencies are never combined (§8, §29) — the dashboard renders one of
 * these prominently and lists the rest separately.
 */
export type CurrencySlice = {
  currency: string;
  position: PositionSummary;
  /** This calendar month (§11, §12) — not month-to-date. */
  cashFlow: CashFlowSummary;
  /** Last month, for the deltas. Null when there is no prior month of data. */
  previous: CashFlowSummary | null;
  trend: MonthlyTrendPoint[];
  spendingByCategory: LabelledAggregate[];
  spendingByAccount: LabelledAggregate[];
  incomeByCategory: LabelledAggregate[];
  bills: ObligationMetrics;
  receivables: ObligationMetrics;
  expectedIncome: ExpectedIncomeMetrics;
};

/** A row in the account balances widget — §47. */
export type AccountBalance = {
  id: string;
  name: string;
  type: AccountType;
  nature: 'asset' | 'liability';
  balance: Money;
  currency: string;
  institution: string | null;
};

/** A row in one of the obligation lists — §17, §18, §19, §20. */
export type ObligationView = {
  id: string;
  name: string;
  amount: Money;
  date: string | null;
  /** Days until due; negative when overdue. Null when the row has no date. */
  daysRemaining: number | null;
  status: DisplayStatus;
  currency: string;
};

/** A row in recent transactions — §16. */
export type RecentTransactionView = {
  id: string;
  date: string;
  type: string;
  typeLabel: string;
  analytics: AnalyticsClass;
  merchant: string;
  categoryLabel: string | null;
  accountLabel: string | null;
  amount: Money;
};

export type TrendMonths = 3 | 6 | 12;

export type DashboardData = {
  /** YYYY-MM-DD in the user's timezone. */
  today: string;
  /** YYYY-MM. */
  month: string;
  trendMonths: TrendMonths;
  /** The user's default currency, or the one they actually hold records in. */
  primary: CurrencySlice;
  /** Every other currency — shown apart, never summed with `primary` (§8). */
  others: CurrencySlice[];
  accounts: AccountBalance[];
  accountTotal: number;
  recent: RecentTransactionView[];
  overdueBills: ObligationView[];
  upcomingBills: ObligationView[];
  openReceivables: ObligationView[];
  upcomingExpected: ObligationView[];
  projected: { opening: Money; closing: Money } | null;
  /** True when the user has no accounts at all — the first-run state. */
  isEmpty: boolean;
};
