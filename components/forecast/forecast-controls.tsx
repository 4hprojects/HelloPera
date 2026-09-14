import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { HORIZONS, type Horizon } from '@/types/forecast';

/**
 * Horizon, currency and the receivables toggle — PHASE-07 §51.
 *
 * Links rather than a form, so the controls work without JavaScript and the
 * state stays in the URL: refresh-safe and shareable, the same pattern
 * /analytics uses (PHASE-06 §58).
 */

function href(
  base: { horizon: Horizon; currency: string; includeReceivables: boolean },
  patch: Partial<{ horizon: Horizon; currency: string; includeReceivables: boolean }>,
): string {
  const next = { ...base, ...patch };
  const params = new URLSearchParams();
  if (next.horizon !== 30) params.set('horizon', String(next.horizon));
  if (next.currency) params.set('currency', next.currency);
  if (next.includeReceivables) params.set('receivables', '1');
  const qs = params.toString();
  return qs ? `/forecast?${qs}` : '/forecast';
}

const pill = (active: boolean) =>
  cn(
    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
    active
      ? 'bg-tint-primary text-primary-text'
      : 'text-text-muted hover:bg-surface-raised hover:text-text',
  );

export function ForecastControls({
  horizon,
  currency,
  currencies,
  includeReceivables,
  permittedHorizons,
  showUpgrade = false,
}: {
  horizon: Horizon;
  currency: string;
  currencies: string[];
  includeReceivables: boolean;
  /** PHASE-09 §24 — what this plan may select. The server enforces it too. */
  permittedHorizons?: readonly number[];
  /** Hidden while billing is disabled (§52), so no CTA leads nowhere. */
  showUpgrade?: boolean;
}) {
  const state = { horizon, currency, includeReceivables };
  const permitted = permittedHorizons ?? HORIZONS;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <nav aria-label="Forecast horizon" className="flex items-center gap-1">
        <span className="mr-1 text-xs font-medium text-text-muted">Next</span>
        {HORIZONS.map((h) =>
          permitted.includes(h) ? (
            <Link
              key={h}
              href={href(state, { horizon: h })}
              aria-current={h === horizon ? 'true' : undefined}
              className={pill(h === horizon)}
            >
              {h} days
            </Link>
          ) : (
            // §21 — labelled, not hidden. A user cannot decide an upgrade is
            // worth it if they never learn the longer view exists. Rendered as
            // a disabled control rather than a link, so it cannot be followed.
            <span
              key={h}
              aria-disabled="true"
              title={
                showUpgrade
                  ? 'Longer forecasts are part of Premium'
                  : 'Longer forecasts are not available yet'
              }
              className="cursor-not-allowed rounded-full px-3 py-1.5 text-xs font-medium text-text-muted opacity-60"
            >
              {h} days{showUpgrade ? ' · Premium' : ''}
            </span>
          ),
        )}
      </nav>

      {/* §46 — only shown when there is a genuine choice to make. */}
      {currencies.length > 1 ? (
        <nav aria-label="Currency" className="flex items-center gap-1">
          <span className="mr-1 text-xs font-medium text-text-muted">Currency</span>
          {currencies.map((c) => (
            <Link
              key={c}
              href={href(state, { currency: c })}
              aria-current={c === currency ? 'true' : undefined}
              className={pill(c === currency)}
            >
              {c}
            </Link>
          ))}
        </nav>
      ) : null}

      {/* §31 — off by default; collection is the least certain input. */}
      <Link
        href={href(state, { includeReceivables: !includeReceivables })}
        className={pill(includeReceivables)}
        aria-pressed={includeReceivables}
      >
        {includeReceivables ? '✓ ' : ''}Include receivables
      </Link>
    </div>
  );
}
