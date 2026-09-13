import Link from 'next/link';
import { GroupedBars } from '@/components/charts/grouped-bars';
import { CHART_TOKENS } from '@/components/charts/tokens';
import { SectionCard } from '@/components/ui/card';
import { compactMoney } from '@/lib/analytics/format';
import { toChartValues } from '@/lib/analytics/series';
import { formatMoney, money } from '@/lib/money';
import { cn } from '@/lib/utils/cn';
import type { MonthlyTrendPoint } from '@/lib/analytics/aggregate';
import type { TrendMonths } from '@/types/dashboard';

/**
 * Income, expenses and net cash flow month by month — §24.
 *
 * Three series, not two: net cash flow is the line a user actually steers by,
 * and it is the reason `GroupedBars` needed a signed axis — a month that
 * spends more than it earns must render below the zero line, not as a
 * cheerful bar of the same height as a good month.
 *
 * The window control is a set of links rather than a form, so it works
 * without JavaScript and keeps the state in the URL (§58) — which is the
 * pattern the /analytics filters will extend.
 */
const WINDOWS: TrendMonths[] = [3, 6, 12];

export function MonthlyTrendChart({
  points,
  currency,
  months,
  title = 'Income vs expenses',
  emptyLabel,
  showWindows = true,
}: {
  points: MonthlyTrendPoint[];
  currency: string;
  months: TrendMonths;
  title?: string;
  emptyLabel?: string;
  /**
   * The 3/6/12 pills. Off on /analytics, where the period is already the
   * page's own filter — two controls for one thing, with the smaller one
   * silently resetting the larger, is worse than no control.
   */
  showWindows?: boolean;
}) {
  const hasActivity = points.some((p) => p.rowCount > 0);

  return (
    <SectionCard
      title={title}
      action={
        showWindows ? (
          <nav aria-label="Trend window" className="flex gap-1">
            {WINDOWS.map((w) => (
              <Link
                key={w}
                href={w === 6 ? '/dashboard' : `/dashboard?trend=${w}`}
                aria-current={w === months ? 'true' : undefined}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  w === months
                    ? 'bg-primary-wash text-primary-text'
                    : 'text-text-muted hover:bg-surface-muted',
                )}
              >
                {w}m
              </Link>
            ))}
          </nav>
        ) : null
      }
    >
      {/* §42 — no empty charts. */}
      {!hasActivity ? (
        <p className="hp-body py-10 text-center text-text-muted">
          {emptyLabel ?? `No transactions in the last ${months} months.`}
        </p>
      ) : (
        <GroupedBars
          categories={points.map((p) => p.label)}
          series={[
            {
              label: 'Income',
              colour: CHART_TOKENS.income,
              values: toChartValues(points.map((p) => p.income.minor)),
            },
            {
              label: 'Expenses',
              colour: CHART_TOKENS.expense,
              values: toChartValues(points.map((p) => p.netExpenses.minor)),
            },
            {
              label: 'Net cash flow',
              colour: CHART_TOKENS.net,
              values: toChartValues(points.map((p) => p.netCashFlow.minor)),
            },
          ]}
          formatTick={(minor) => compactMoney(minor, currency)}
          formatValue={(minor) => formatMoney(money(BigInt(Math.round(minor)), currency))}
          caption={`Monthly income, net expenses and net cash flow in ${currency}, last ${months} months`}
        />
      )}
    </SectionCard>
  );
}
