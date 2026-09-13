import 'server-only';

import {
  bucketByMonth,
  incomeByCategory,
  spendingByAccount,
  spendingByCategory,
  summariseCashFlow,
  type AnalyticsRow,
  type CategoryAggregate,
} from '@/lib/analytics/aggregate';
import {
  emptyExpectedIncomeMetrics,
  emptyObligationMetrics,
  expectedIncomeMetrics,
  metricsFor,
  obligationMetrics,
  type MetricObligation,
} from '@/lib/analytics/obligations';
import { positionFor, summarisePositions } from '@/lib/analytics/position';
import { endOfMonth, monthWindow } from '@/lib/analytics/series';
import { daysBetween, todayInTimezone } from '@/lib/finance/obligation';
import { analyticsClass } from '@/lib/finance/balance';
import { listAccounts } from '@/services/account.service';
import { listObligations, type Obligation } from '@/services/obligation.service';
import { getRecentTransactions } from '@/services/transaction.service';
import { fetchAnalyticsRows, resolveCategoryNames } from '@/services/analytics.service';
import type {
  CurrencySlice,
  DashboardData,
  LabelledAggregate,
  ObligationView,
  TrendMonths,
} from '@/types/dashboard';

/**
 * The dashboard's one data call — PHASE-06 §30.
 *
 * Composition only: every figure comes from a pure function in
 * `lib/analytics/`, so the arithmetic is tested and this file is just wiring.
 *
 * Seven reads in two waves — six in parallel, then one for the category names
 * the breakdowns turned out to need. Nothing here is cached: §45 says fresh
 * server queries for MVP and §71 warns against holding private analytics, and
 * the page is dynamic anyway because `requireUser()` reads cookies.
 */

const TYPE_LABELS: Record<string, string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
  refund: 'Refund',
  adjustment: 'Adjustment',
  opening_balance: 'Opening balance',
};

export type DashboardParams = {
  timezone: string;
  preferredCurrency: string;
  trendMonths?: TrendMonths;
  recentLimit?: number;
};

export async function getDashboardData({
  timezone,
  preferredCurrency,
  trendMonths = 6,
  recentLimit = 6,
}: DashboardParams): Promise<DashboardData> {
  // §35 — every boundary below is the user's calendar date, not the server's.
  const today = todayInTimezone(timezone);
  const month = today.slice(0, 7);
  const months = monthWindow(today, trendMonths);
  const windowFrom = `${months[0]}-01`;
  // §11/§12 say "within the selected month", not month-to-date: a confirmed
  // transaction dated later this month has already moved the balance shown
  // beside it, so excluding it would make the two disagree.
  const windowTo = endOfMonth(today);

  const [accounts, rows, recentRows, bills, receivables, expected] = await Promise.all([
    // Archived included so historical rows can still resolve an account name
    // (§73); the balances widget filters them out for display (§47).
    listAccounts({ includeArchived: true }),
    fetchAnalyticsRows({ from: windowFrom, to: windowTo }),
    getRecentTransactions(recentLimit),
    listObligations('bill', today, { onlyOpen: true }),
    listObligations('receivable', today, { onlyOpen: true }),
    // Not onlyOpen: §51's "received" figure needs the rows that have been
    // paid. Bounded by the window so it cannot grow without limit.
    listObligations('expected_income', today, { from: windowFrom }),
  ]);

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  const positions = summarisePositions(
    accounts.map((a) => ({
      nature: a.nature,
      currency: a.currency_code,
      balance: a.balance,
      isArchived: a.is_archived,
    })),
    { preferred: preferredCurrency },
  );

  const billMetrics = obligationMetrics(toMetrics(bills), preferredCurrency);
  const receivableMetrics = obligationMetrics(toMetrics(receivables), preferredCurrency);
  const expectedMetrics = expectedIncomeMetrics(
    toMetrics(expected),
    month,
    preferredCurrency,
  );

  // Every currency the user actually has anything in, preferred first.
  const currencies = [
    preferredCurrency,
    ...new Set([
      ...positions.map((p) => p.currency),
      ...rows.map((r) => r.currency),
      ...bills.map((b) => b.currency),
      ...receivables.map((r) => r.currency),
    ]),
  ].filter((c, i, all) => all.indexOf(c) === i);

  const previousMonth = monthWindow(today, 2)[0]!;
  const slices: CurrencySlice[] = currencies.map((currency) => {
    const inMonth = rows.filter((r) => r.date.slice(0, 7) === month);
    const inPrevious = rows.filter((r) => r.date.slice(0, 7) === previousMonth);

    return {
      currency,
      position: positionFor(positions, currency),
      cashFlow: summariseCashFlow(inMonth, currency),
      previous: months.length > 1 ? summariseCashFlow(inPrevious, currency) : null,
      trend: bucketByMonth(rows, months, currency),
      spendingByCategory: [],
      spendingByAccount: [],
      incomeByCategory: [],
      bills: metricsFor(billMetrics, currency, emptyObligationMetrics),
      receivables: metricsFor(receivableMetrics, currency, emptyObligationMetrics),
      expectedIncome: metricsFor(expectedMetrics, currency, emptyExpectedIncomeMetrics),
    };
  });

  // Breakdowns for the primary currency only — §53 says the dashboard is a
  // quick overview, and six breakdowns per currency is the analytics page.
  const primarySlice = slices[0]!;
  const monthRows = rows.filter((r) => r.date.slice(0, 7) === month);
  const byCategory = spendingByCategory(monthRows, primarySlice.currency);
  const byAccount = spendingByAccount(monthRows, primarySlice.currency);
  const byIncomeCategory = incomeByCategory(monthRows, primarySlice.currency);

  const categoryNames = await resolveCategoryNames([
    ...byCategory.map((c) => c.categoryId),
    ...byIncomeCategory.map((c) => c.categoryId),
    ...recentRows.map((t) => t.category_id),
  ]);

  primarySlice.spendingByCategory = label(byCategory, (id) =>
    id ? (categoryNames.get(id) ?? 'Uncategorised') : 'Uncategorised',
  );
  primarySlice.incomeByCategory = label(byIncomeCategory, (id) =>
    id ? (categoryNames.get(id) ?? 'Uncategorised') : 'Uncategorised',
  );
  primarySlice.spendingByAccount = label(byAccount, (id) =>
    id ? (accountName.get(id) ?? 'Closed account') : 'No account',
  );

  return {
    today,
    month,
    trendMonths,
    primary: primarySlice,
    others: slices.slice(1).filter(hasAnything),
    accounts: accounts
      .filter((a) => !a.is_archived)
      .map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        nature: a.nature,
        balance: a.balance,
        currency: a.currency_code,
        institution: a.institution_name,
      })),
    accountTotal: accounts.filter((a) => !a.is_archived).length,
    recent: recentRows.map((t) => ({
      id: t.id,
      date: t.transaction_date,
      type: t.type,
      typeLabel: TYPE_LABELS[t.type] ?? t.type,
      analytics: analyticsClass(t.type, t.status),
      merchant: t.merchant_name ?? t.description ?? TYPE_LABELS[t.type] ?? t.type,
      categoryLabel: t.category_id ? (categoryNames.get(t.category_id) ?? null) : null,
      accountLabel:
        accountName.get(t.source_account_id ?? '') ??
        accountName.get(t.destination_account_id ?? '') ??
        null,
      amount: t.amount,
    })),
    overdueBills: toViews(
      bills.filter((b) => b.display === 'overdue'),
      today,
    ),
    upcomingBills: toViews(
      bills.filter((b) => b.display !== 'overdue').slice(0, 4),
      today,
    ),
    openReceivables: toViews(receivables.slice(0, 4), today),
    upcomingExpected: toViews(
      expected
        .filter((e) => e.display !== 'paid' && e.display !== 'cancelled')
        .slice(0, 4),
      today,
    ),
    isEmpty: accounts.filter((a) => !a.is_archived).length === 0,
  };
}

function toMetrics(list: readonly Obligation[]): MetricObligation[] {
  return list.map((o) => ({
    currency: o.currency,
    remaining: o.remaining,
    applied: o.applied,
    date: o.date,
    display: o.display,
  }));
}

function toViews(list: readonly Obligation[], today: string): ObligationView[] {
  return list.map((o) => ({
    id: o.id,
    name: o.name,
    amount: o.remaining,
    date: o.date,
    daysRemaining: o.date ? daysBetween(today, o.date) : null,
    status: o.display,
    currency: o.currency,
  }));
}

function label(
  aggregates: readonly CategoryAggregate[],
  nameOf: (id: string | null) => string,
): LabelledAggregate[] {
  return aggregates.map((a) => ({ ...a, label: nameOf(a.categoryId) }));
}

/** A currency worth its own strip: some balance, some activity or some obligation. */
function hasAnything(slice: CurrencySlice): boolean {
  return (
    slice.position.accountCount > 0 ||
    slice.cashFlow.rowCount > 0 ||
    slice.bills.outstanding.count > 0 ||
    slice.receivables.outstanding.count > 0
  );
}

export type { AnalyticsRow };
