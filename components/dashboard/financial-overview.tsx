import Link from 'next/link';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card } from '@/components/ui/card';
import { Amount } from '@/components/finance/amount';
import { percentChangeMinor, toChartValues } from '@/lib/analytics/series';
import type { CurrencySlice } from '@/types/dashboard';

/**
 * The four headline cards — §7 — plus the never-summed strip for any other
 * currency (§8, §29).
 *
 * Order follows §39's mobile priority rather than §7's listing order: Net
 * position and Net cash flow are what a user opens the app to see, so on a
 * two-column phone layout they take the first row. All four of §7's cards are
 * present; at `xl` they sit in one row and the order stops mattering.
 *
 * No sparkline on Net position: §48 forbids a net-worth trend derived from
 * current balances, and without historical snapshots there is no honest one
 * to draw. Income, expenses and cash flow each get one, because those series
 * are measured per month rather than inferred backwards from today.
 */
export function FinancialOverview({
  slice,
  others,
}: {
  slice: CurrencySlice;
  others: CurrencySlice[];
}) {
  const { position, cashFlow, previous, trend } = slice;

  return (
    <section aria-labelledby="overview-heading">
      <h2 id="overview-heading" className="sr-only">
        Financial overview
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Net position"
          icon="wallet"
          tone="primary"
          value={position.net}
          note={{ text: 'Assets less liabilities', tone: 'muted' }}
          href="/accounts"
        />
        <StatCard
          label="Net cash flow"
          icon="analytics"
          tone={cashFlow.netCashFlow.minor < 0n ? 'danger' : 'success'}
          value={cashFlow.netCashFlow}
          change={percentChangeMinor(
            cashFlow.netCashFlow.minor,
            previous?.netCashFlow.minor ?? null,
          )}
          trend={toChartValues(trend.map((t) => t.netCashFlow.minor))}
          href="/transactions"
        />
        <StatCard
          label="Total assets"
          icon="income"
          tone="success"
          value={position.assets}
          note={{ text: 'What you hold', tone: 'muted' }}
          href="/accounts"
        />
        <StatCard
          label="Total liabilities"
          icon="bills"
          tone="warning"
          // §10 — a positive amount owed, never a negative asset.
          value={position.liabilities}
          note={{ text: 'Amount owed', tone: 'muted' }}
          href="/accounts"
        />
      </div>

      {others.length > 0 ? <OtherCurrencies others={others} /> : null}
    </section>
  );
}

/**
 * §8 and §29: other currencies are reported, never converted and never added
 * to the figures above. The sentence saying so is part of the design, not a
 * disclaimer — a user who sees two totals needs to know why they are apart.
 */
function OtherCurrencies({ others }: { others: CurrencySlice[] }) {
  return (
    <Card className="mt-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="hp-h3 text-text">Other currencies</h3>
        <p className="hp-small text-text-muted">
          Shown separately — HelloPera does not convert between currencies.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {others.map((o) => (
          <li
            key={o.currency}
            className="rounded-xl border border-border bg-surface-muted/50 p-3"
          >
            <p className="hp-label mb-2 text-text-muted">{o.currency}</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <Figure label="Net position" value={<Amount value={o.position.net} />} />
              <Figure
                label="Net cash flow"
                value={<Amount value={o.cashFlow.netCashFlow} />}
              />
              <Figure label="Assets" value={<Amount value={o.position.assets} />} />
              <Figure
                label="Liabilities"
                value={<Amount value={o.position.liabilities} tone="liability" />}
              />
            </dl>
          </li>
        ))}
      </ul>
      <Link
        href="/accounts"
        className="hp-small mt-3 inline-block font-semibold text-primary-text"
      >
        View all accounts
      </Link>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="hp-small truncate text-text-muted">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}
