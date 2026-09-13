import type { Metadata } from 'next';
import Link from 'next/link';
import { AnalyticsFilters } from '@/components/analytics/analytics-filters';
import { BreakdownChart } from '@/components/analytics/breakdown-chart';
import { CategorySpendingChart } from '@/components/analytics/category-spending-chart';
import { MonthlyTrendChart } from '@/components/analytics/monthly-trend-chart';
import { Amount } from '@/components/finance/amount';
import { Card, SectionCard } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/states';
import { buttonClass } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/guards';
import { isZero } from '@/lib/money';
import { parseAnalyticsParams } from '@/schemas/analytics.schema';
import { getAnalyticsData } from '@/services/analytics.service';
import type { AnalyticsData } from '@/types/analytics';

export const metadata: Metadata = { title: 'Analytics' };

/**
 * Deeper filtering and trends — PHASE-06 §52, §53.
 *
 * §53 draws the line: the dashboard is "quick current overview", analytics is
 * "deeper filtering and trends", and "do not duplicate every chart in both
 * places". So this page carries what the dashboard cannot — any date range,
 * any currency, narrowed by account, category or type — plus the one
 * breakdown the dashboard has no room for, Top Merchants (§55). Bills and
 * receivables stay on the dashboard, where they are already complete.
 *
 * Filters live entirely in the query string (§58), so every view is
 * shareable, refresh-safe and works with the back button.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { profile } = await requireUser();
  const params = parseAnalyticsParams(await searchParams);

  const data = await getAnalyticsData({
    timezone: profile.timezone,
    preferredCurrency: profile.default_currency,
    params,
  });

  if (data.hasNoData) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Analytics" description="Where your money goes, over time." />
        <EmptyState
          title="Nothing to analyse yet"
          description="Add an account and record a few transactions — this page fills in from your own history."
          action={
            <Link href="/accounts/new" className={buttonClass('primary')}>
              Add an account
            </Link>
          }
        />
      </div>
    );
  }

  const spendingTotal = data.spendingByCategory.reduce(
    (sum, c) => (c.amount.minor > 0n ? sum + c.amount.minor : sum),
    0n,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Analytics"
        description="Where your money goes, over time."
        actions={
          <Link href="/dashboard" className={buttonClass('ghost', 'sm')}>
            Dashboard
          </Link>
        }
      />

      <AnalyticsFilters
        params={params}
        accounts={data.accountOptions}
        categories={data.categoryOptions}
        currencies={data.currencies}
        rangeLabel={data.range.label}
      />

      {data.rejected.length > 0 ? <RejectedNotice data={data} /> : null}

      {data.isNeutralType ? (
        <NeutralTypeNotice data={data} />
      ) : (
        <CashFlowBand data={data} />
      )}

      {data.months.length > 1 ? (
        <MonthlyTrendChart
          points={data.trend}
          currency={data.currency}
          months={data.months.length}
          title="Trend"
          showWindows={false}
          emptyLabel={`No transactions in ${data.range.label.toLowerCase()}.`}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.show.byCategory ? (
          <CategorySpendingChart
            items={data.spendingByCategory}
            currency={data.currency}
            total={spendingTotal}
            period={data.range.label}
          />
        ) : null}
        {data.show.byAccount ? (
          <BreakdownChart
            title="Spending by account"
            period={data.range.label}
            items={data.spendingByAccount}
            caption={`Expenses by account, ${data.range.label}, in ${data.currency}`}
          />
        ) : null}
      </div>

      {data.show.byMerchant ? <TopMerchants data={data} /> : null}

      {data.show.income ? (
        <BreakdownChart
          title="Income by source"
          period={data.range.label}
          items={data.incomeByCategory}
          caption={`Income by category, ${data.range.label}, in ${data.currency}`}
        />
      ) : null}
    </div>
  );
}

/**
 * §65 — say what was ignored.
 *
 * A dropped filter and a genuinely empty period render identically otherwise,
 * and confusing "we ignored your filter" with "you spent nothing" is a bad
 * mistake for a finance app to make quietly.
 */
function RejectedNotice({ data }: { data: AnalyticsData }) {
  return (
    <Card className="border-warning/50">
      <p className="hp-small font-semibold text-text">Some filters were adjusted</p>
      <ul className="hp-small mt-1 list-disc pl-5 text-text-muted">
        {data.rejected.map((r) => (
          <li key={`${r.field}-${r.reason}`}>{r.reason}</li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * §15 — transfers, adjustments and opening balances move money without
 * earning or spending it.
 *
 * Every cash-flow figure for them is ₱0 by definition. A card full of zeroes
 * looks like a failure; saying so in words is the same information without
 * the false alarm.
 */
function NeutralTypeNotice({ data }: { data: AnalyticsData }) {
  const label = data.filter.type === 'transfer' ? 'Transfers' : 'These transactions';
  return (
    <SectionCard title={data.range.label}>
      <p className="hp-body text-text-muted">
        {label} move money without earning or spending it, so they are counted in neither
        income nor expenses.{' '}
        <span className="font-semibold text-text">
          {data.cashFlow.rowCount}{' '}
          {data.cashFlow.rowCount === 1 ? 'transaction' : 'transactions'}
        </span>{' '}
        matched in {data.range.label.toLowerCase()}.
      </p>
      <Link
        href={`/transactions?from=${data.range.from}&to=${data.range.to}&type=${data.filter.type ?? ''}`}
        className="hp-small mt-3 inline-block font-semibold text-primary-text"
      >
        See them in the transactions list
      </Link>
    </SectionCard>
  );
}

/** The §11–§14 figures for the selected range, with §57 drill-down links. */
function CashFlowBand({ data }: { data: AnalyticsData }) {
  const { cashFlow, range, currency } = data;
  const drill = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ from: range.from, to: range.to, ...extra });
    if (data.filter.accountId) q.set('accountId', data.filter.accountId);
    if (data.filter.categoryId) q.set('categoryId', data.filter.categoryId);
    return `/transactions?${q.toString()}`;
  };

  return (
    <SectionCard
      title={range.label}
      action={
        <span className="hp-small rounded-full border border-border px-3 py-1 text-text-muted">
          {currency}
        </span>
      }
    >
      {cashFlow.rowCount === 0 ? (
        <p className="hp-body py-8 text-center text-text-muted">
          No transactions match these filters.
        </p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <Row label="Income" href={drill({ type: 'income' })}>
            <Amount value={cashFlow.income} tone="income" />
          </Row>
          <Row label="Gross expenses" href={drill({ type: 'expense' })}>
            <Amount value={cashFlow.grossExpenses} tone="expense" />
          </Row>
          {!isZero(cashFlow.refunds) ? (
            <Row label="Refunds" href={drill({ type: 'refund' })}>
              <Amount value={cashFlow.refunds} tone="refund" />
            </Row>
          ) : null}
          <Row label="Net expenses" strong>
            <Amount value={cashFlow.netExpenses} tone="expense" />
          </Row>
          <Row label="Net cash flow" strong>
            <Amount
              value={cashFlow.netCashFlow}
              tone={cashFlow.netCashFlow.minor < 0n ? 'expense' : 'income'}
            />
          </Row>
          <Row label="Transactions">
            <span className="hp-amount text-text">{cashFlow.rowCount}</span>
          </Row>
        </dl>
      )}
    </SectionCard>
  );
}

function Row({
  label,
  href,
  strong,
  children,
}: {
  label: string;
  href?: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  const body = (
    <>
      <dt className={strong ? 'text-sm font-semibold text-text' : 'text-sm text-text'}>
        {label}
      </dt>
      <dd className="shrink-0 text-right">{children}</dd>
    </>
  );

  return href ? (
    <Link
      href={href}
      className="flex items-baseline justify-between gap-3 border-b border-border py-2.5 hover:bg-surface-muted"
    >
      {body}
    </Link>
  ) : (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2.5">
      {body}
    </div>
  );
}

/**
 * §55 — Top Merchants, on the raw name.
 *
 * The caveat is on the page, not just in the code: "SM" and "SM Supermarket"
 * stay two rows, because merging them would be a guess and §55 says not to
 * guess. Ten rows is enough to be useful without becoming a second
 * transactions list.
 */
function TopMerchants({ data }: { data: AnalyticsData }) {
  const top = data.spendingByMerchant.filter((m) => m.amount.minor > 0n).slice(0, 10);
  if (top.length === 0) return null;

  return (
    <BreakdownChart
      title="Top merchants"
      period={data.range.label}
      items={top}
      caption={`Expenses by merchant, ${data.range.label}, in ${data.currency}`}
    />
  );
}
