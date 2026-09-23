import type { Metadata } from 'next';
import Link from 'next/link';
import { BreakdownChart } from '@/components/analytics/breakdown-chart';
import { CategorySpendingChart } from '@/components/analytics/category-spending-chart';
import { MonthlyTrendChart } from '@/components/analytics/monthly-trend-chart';
import { AccountBalances } from '@/components/dashboard/account-balances';
import { CashFlowSummary } from '@/components/dashboard/cash-flow-summary';
import { ExpectedIncomeSummary } from '@/components/dashboard/expected-income-summary';
import { FinancialOverview } from '@/components/dashboard/financial-overview';
import { ForecastCard } from '@/components/dashboard/forecast-card';
import {
  ENCOURAGEMENTS,
  greetingFor,
  HeroBanner,
  QUOTES,
  rotate,
} from '@/components/dashboard/hero-banner';
import { OverdueBills } from '@/components/dashboard/overdue-bills';
import { PromoCard } from '@/components/dashboard/promo-card';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { RecentTransactions } from '@/components/dashboard/recent-transactions';
import { ReceivablesSummary } from '@/components/dashboard/receivables-summary';
import { UpcomingBills } from '@/components/dashboard/upcoming-bills';
import { buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { requireUser } from '@/lib/auth/guards';
import { parseDashboardParams } from '@/schemas/analytics.schema';
import { getDashboardData } from '@/services/dashboard.service';

export const metadata: Metadata = { title: 'Dashboard' };

/**
 * The dashboard — PHASE-06 §5, §6, §39, §40.
 *
 * No arithmetic lives here. Every figure arrives from `getDashboardData`,
 * which composes the pure aggregators in `lib/analytics/`; this file decides
 * only what appears and in what order.
 *
 * Section order reconciles §6, §39 and §40, which disagree in two places.
 * §39 is explicitly a mobile *priority* list, so net position and cash flow
 * lead; §6's ordering governs from there, and the `lg:grid-cols-2` bands
 * produce §40's columns. One DOM order at every width — no `order-*`
 * utilities — so the reading order a screen reader follows is the order on
 * screen.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { profile } = await requireUser();
  const { trend } = parseDashboardParams(await searchParams);

  const data = await getDashboardData({
    timezone: profile.timezone,
    preferredCurrency: profile.default_currency,
    trendMonths: trend,
  });

  // Read directly now. This used to be `full_name.split(' ')[0]`, which
  // greeted "Ma. Cristina Reyes" as "Ma." — the reason the name was split into
  // parts at all.
  const firstName = profile.first_name;
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: profile.timezone,
    }).format(new Date()),
  );

  const { primary } = data;
  const spendingTotal = primary.spendingByCategory.reduce(
    (sum, c) => (c.amount.minor > 0n ? sum + c.amount.minor : sum),
    0n,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <HeroBanner
        greeting={`${greetingFor(hour)}${firstName ? `, ${firstName}` : ''}!`}
        line={rotate(ENCOURAGEMENTS, data.today)}
        quote={rotate(QUOTES, data.today)}
      />

      <QuickActions />

      {data.isEmpty ? (
        <EmptyState
          title="Add your first account"
          description="Cash, bank, GCash, Maya or a credit card — whatever you actually use."
          action={
            <Link href="/accounts/new" className={buttonClass('primary')}>
              Add an account
            </Link>
          }
        />
      ) : (
        <>
          <FinancialOverview slice={primary} others={data.others} />

          <OverdueBills items={data.overdueBills} metrics={primary.bills} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AccountBalances accounts={data.accounts} total={data.accountTotal} />
            <CashFlowSummary slice={primary} />
          </div>

          {data.projected ? (
            <ForecastCard
              opening={data.projected.opening}
              closing={data.projected.closing}
            />
          ) : null}

          <MonthlyTrendChart
            points={primary.trend}
            currency={primary.currency}
            months={data.trendMonths}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <UpcomingBills items={data.upcomingBills} metrics={primary.bills} />
            <div className="space-y-4">
              <ReceivablesSummary
                items={data.openReceivables}
                metrics={primary.receivables}
              />
              <ExpectedIncomeSummary
                items={data.upcomingExpected}
                metrics={primary.expectedIncome}
              />
            </div>
          </div>

          <RecentTransactions items={data.recent} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CategorySpendingChart
              items={primary.spendingByCategory}
              currency={primary.currency}
              total={spendingTotal}
            />
            <BreakdownChart
              title="Spending by account"
              period="This month"
              items={primary.spendingByAccount}
              caption={`Expenses by account this month, in ${primary.currency}`}
            />
          </div>

          <BreakdownChart
            title="Income by source"
            period="This month"
            items={primary.incomeByCategory}
            caption={`Income by category this month, in ${primary.currency}`}
          />
        </>
      )}

      <PromoCard />
    </div>
  );
}
