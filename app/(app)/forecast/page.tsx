import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardLabel, SectionCard } from '@/components/ui/card';
import { LineChart } from '@/components/charts/line-chart';
import { CHART_TOKENS } from '@/components/charts/tokens';
import { ForecastControls } from '@/components/forecast/forecast-controls';
import { ForecastTimeline } from '@/components/forecast/forecast-timeline';
import { ForecastAssumptionsPanel } from '@/components/forecast/forecast-assumptions';
import { requireUser } from '@/lib/auth/guards';
import { todayInTimezone } from '@/lib/finance/obligation';
import { compactMoney } from '@/lib/analytics/format';
import { formatMoney, isNegative, money } from '@/lib/money';
import { getForecast } from '@/services/forecast.service';
import { HORIZONS, type Horizon } from '@/types/forecast';

export const metadata: Metadata = { title: 'Forecast' };

/**
 * /forecast — PHASE-07 §51.
 *
 * Server-rendered: the projection never reaches the browser as raw events
 * (§69), and the page is complete on first paint.
 *
 * Filters fall back rather than erroring. A hand-edited or stale URL must
 * still render — the same promise /analytics makes — and there is nothing
 * here a bad parameter could expose, because every read is RLS-scoped.
 */
function parseHorizon(value: string | undefined): Horizon {
  const n = Number(value);
  return (HORIZONS as readonly number[]).includes(n) ? (n as Horizon) : 30;
}

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, profile } = await requireUser();
  const params = await searchParams;

  const first = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

  const horizon = parseHorizon(first(params.horizon));
  const includeReceivables = first(params.receivables) === '1';
  const requested = first(params.currency)?.toUpperCase();
  const today = todayInTimezone(profile.timezone);

  const data = await getForecast(user.id, today, {
    horizon,
    // An unheld currency falls back to the default rather than rendering an
    // empty page that looks like "you have nothing".
    currency: requested ?? profile.default_currency,
    includeReceivables,
  });

  const { forecast, assumptions, currencies } = data;
  const currency = forecast.currency;

  const shortfallIndex = forecast.shortfall
    ? forecast.points.findIndex((p) => p.date === forecast.shortfall!.date)
    : null;

  const net = forecast.closingBalance.minor - forecast.openingBalance.minor;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Forecast"
        description="What your cash position looks like ahead, from records you can check."
      />

      <ForecastControls
        horizon={horizon}
        currency={currency}
        currencies={currencies}
        includeReceivables={includeReceivables}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardLabel>Cash today</CardLabel>
          <p className="hp-h2 mt-1 text-text">{formatMoney(forecast.openingBalance)}</p>
        </Card>
        <Card>
          <CardLabel>Projected in {horizon} days</CardLabel>
          <p
            className={
              isNegative(forecast.closingBalance)
                ? 'hp-h2 mt-1 text-danger-text'
                : 'hp-h2 mt-1 text-text'
            }
          >
            {formatMoney(forecast.closingBalance)}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {net === 0n
              ? 'No change projected'
              : `${net > 0n ? '+' : '−'}${formatMoney(money(net < 0n ? -net : net, currency))}`}
          </p>
        </Card>
        <Card>
          <CardLabel>In / out</CardLabel>
          <p className="hp-body mt-1 font-semibold text-success-text">
            +{formatMoney(forecast.totalInflows)}
          </p>
          <p className="hp-body font-semibold text-text">
            −{formatMoney(forecast.totalOutflows)}
          </p>
        </Card>
      </div>

      {/*
        §54 — "Do not use alarmist language." A shortfall is information the
        user can act on, not a warning to flinch at, so it reads as a plain
        statement with the date and the amount.
      */}
      {forecast.shortfall ? (
        <div className="mb-4 rounded-[var(--radius-hp)] bg-tint-warning p-4">
          <p className="hp-body font-semibold text-warning-text">
            Projected balance may fall below {formatMoney(money(0n, currency))} on{' '}
            {forecast.shortfall.date}.
          </p>
          <p className="hp-body mt-1 text-sm text-warning-text">
            Short by about {formatMoney(forecast.shortfall.amount)} at that point, based
            on {forecast.shortfall.contributors.length}{' '}
            {forecast.shortfall.contributors.length === 1 ? 'movement' : 'movements'}{' '}
            scheduled on or before that date.
          </p>
        </div>
      ) : null}

      <SectionCard title="Projected balance" className="mb-4">
        <LineChart
          points={forecast.points.map((p) => ({
            label: p.date.slice(5),
            value: Number(p.closingProjectedBalance.minor),
          }))}
          colour={CHART_TOKENS.net}
          formatTick={(minor) => compactMoney(minor, currency)}
          formatValue={(minor) => formatMoney(money(BigInt(Math.round(minor)), currency))}
          caption={`Projected ${currency} balance each day for the next ${horizon} days.`}
          markerIndex={
            shortfallIndex != null && shortfallIndex >= 0 ? shortfallIndex : null
          }
          markerLabel={
            forecast.shortfall
              ? `Projected to fall below zero on ${forecast.shortfall.date}.`
              : undefined
          }
        />
      </SectionCard>

      <SectionCard title="What happens next" className="mb-4">
        <ForecastTimeline events={forecast.timeline} today={today} />
      </SectionCard>

      <ForecastAssumptionsPanel assumptions={assumptions} />
    </div>
  );
}
