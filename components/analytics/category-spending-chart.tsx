import { Donut } from '@/components/charts/donut';
import { paletteAt } from '@/components/charts/tokens';
import { SectionCard } from '@/components/ui/card';
import { formatMoney, money } from '@/lib/money';
import type { LabelledAggregate } from '@/types/dashboard';

/**
 * Spending by category this month — §21.
 *
 * The donut draws positive slices only; a category a refund pushed below zero
 * cannot be a wedge of a ring. Those are not discarded — the aggregate keeps
 * them so totals reconcile, and the note under the chart says how many and
 * how much, so nothing disappears silently.
 */
export function CategorySpendingChart({
  items,
  currency,
  total,
  title = 'Spending by category',
  period = 'This month',
}: {
  items: LabelledAggregate[];
  currency: string;
  total: bigint;
  title?: string;
  /** The period chip — "This month" on the dashboard, the range on /analytics. */
  period?: string;
}) {
  const positive = items.filter((i) => i.amount.minor > 0n);
  const refunded = items.filter((i) => i.amount.minor < 0n);
  const refundedTotal = refunded.reduce((s, i) => s - i.amount.minor, 0n);

  return (
    <SectionCard
      title={title}
      action={
        <span className="hp-small rounded-full border border-border px-3 py-1 text-text-muted">
          {period}
        </span>
      }
    >
      {positive.length === 0 ? (
        <p className="hp-body py-10 text-center text-text-muted">
          No expenses recorded in this period.
        </p>
      ) : (
        <>
          <Donut
            slices={positive.map((item, i) => ({
              label: item.label,
              value: Number(item.amount.minor),
              colour: paletteAt(i),
            }))}
            total={Number(total)}
            totalLabel="Total expenses"
            formatValue={(minor) =>
              formatMoney(money(BigInt(Math.round(minor)), currency))
            }
            caption={`Expenses by category this month, in ${currency}`}
          />
          {refunded.length > 0 ? (
            <p className="hp-small mt-3 text-text-muted">
              {refunded.length === 1 ? '1 category' : `${refunded.length} categories`} net
              refunded {formatMoney(money(refundedTotal, currency))} and{' '}
              {refunded.length === 1 ? 'is' : 'are'} not shown above.
            </p>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}
