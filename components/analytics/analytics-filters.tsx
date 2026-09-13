import Link from 'next/link';
import { analyticsHref, type AnalyticsParams } from '@/schemas/analytics.schema';
import { PRESET_LABELS, RANGE_PRESETS } from '@/lib/analytics/range';
import { TRANSACTION_TYPES } from '@/lib/finance/types';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import type { FilterOption } from '@/types/analytics';

/**
 * The analytics filter bar — §25 through §29, with state in the URL (§58).
 *
 * Two controls, deliberately different:
 *
 *   - **Range presets** are links. They are one-click, they work with no
 *     JavaScript, and each is its own shareable URL.
 *   - **Everything else** is a GET form, because account, category, type and
 *     currency are chosen together and submitting once beats four round-trips.
 *
 * Both round-trip through `analyticsParamsSchema`, and the form carries the
 * current range in hidden fields so changing a category never silently resets
 * the period — the bug the transactions list still has in its pagination.
 */
const TYPE_LABELS: Record<string, string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
  refund: 'Refund',
  adjustment: 'Adjustment',
  opening_balance: 'Opening balance',
};

const CONTROL =
  'rounded-[var(--radius-hp)] border border-border-strong bg-surface px-3 py-2 text-sm text-text';

export function AnalyticsFilters({
  params,
  accounts,
  categories,
  currencies,
  rangeLabel,
}: {
  params: AnalyticsParams;
  accounts: FilterOption[];
  categories: FilterOption[];
  currencies: string[];
  rangeLabel: string;
}) {
  return (
    <Card className="space-y-3">
      <nav aria-label="Date range" className="flex flex-wrap gap-1.5">
        {RANGE_PRESETS.filter((p) => p !== 'custom').map((preset) => (
          <Link
            key={preset}
            href={analyticsHref(params, {
              range: preset,
              from: undefined,
              to: undefined,
            })}
            aria-current={params.range === preset ? 'true' : undefined}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              params.range === preset
                ? 'bg-primary-wash text-primary-text'
                : 'text-text-muted hover:bg-surface-muted',
            )}
          >
            {PRESET_LABELS[preset]}
          </Link>
        ))}
      </nav>

      <form method="get" className="flex flex-wrap items-end gap-2">
        {/* A select rather than a hidden field: with the period hidden, typing
            two custom dates while the range still said "This month" would
            silently discard them. */}
        <Field label="Period">
          <select name="range" defaultValue={params.range} className={CONTROL}>
            {RANGE_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {PRESET_LABELS[preset]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="From">
          <input
            type="date"
            name="from"
            defaultValue={params.from ?? ''}
            className={CONTROL}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            name="to"
            defaultValue={params.to ?? ''}
            className={CONTROL}
          />
        </Field>

        {currencies.length > 1 ? (
          <Field label="Currency">
            <select
              name="currency"
              defaultValue={params.currency ?? ''}
              className={CONTROL}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Account">
          <select
            name="accountId"
            defaultValue={params.accountId ?? ''}
            className={CONTROL}
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
                {a.hint ? ` (${a.hint})` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Category">
          <select
            name="categoryId"
            defaultValue={params.categoryId ?? ''}
            className={CONTROL}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Type">
          <select name="type" defaultValue={params.type ?? ''} className={CONTROL}>
            <option value="">All types</option>
            {TRANSACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </Field>

        <button
          type="submit"
          className="rounded-[var(--radius-hp)] border border-border-strong px-3 py-2 text-sm font-medium text-text"
        >
          Apply
        </button>

        <Link
          href="/analytics"
          className="rounded-[var(--radius-hp)] px-3 py-2 text-sm font-medium text-text-muted hover:text-text"
        >
          Reset
        </Link>
      </form>

      <p className="hp-small text-text-muted">
        Showing <span className="font-semibold text-text">{rangeLabel}</span>. The From
        and To dates apply when the period is set to {PRESET_LABELS.custom}.
      </p>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="hp-label text-text-muted">{label}</span>
      {children}
    </label>
  );
}
