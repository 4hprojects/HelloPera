import { formatMoney, type Money } from '@/lib/money';
import { cn } from '@/lib/utils/cn';

export type BarListItem = { label: string; amount: Money; colour: string };

/**
 * Horizontal bars — §21 offers "Donut or Horizontal bar", and for spending by
 * account (§22) and income by category (§23) a bar list reads better than a
 * ring: the labels are long and the comparison is ordinal.
 *
 * The figure sits beside each label as text, so nothing depends on comparing
 * bar lengths by eye (§37). Negative rows — a category a refund pushed below
 * zero — render as a zero-width bar with the real figure beside it rather
 * than being dropped, so a total still reconciles against its parts.
 */
export function BarList({
  items,
  caption,
  className,
}: {
  items: readonly BarListItem[];
  caption: string;
  className?: string;
}) {
  const max = items.reduce((m, i) => (i.amount.minor > m ? i.amount.minor : m), 0n);

  return (
    <table className={cn('w-full', className)}>
      <caption className="sr-only">{caption}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Amount</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const width =
            max > 0n && item.amount.minor > 0n
              ? Number((item.amount.minor * 100n) / max)
              : 0;
          return (
            <tr key={item.label}>
              <th scope="row" className="w-full py-1.5 pr-3 text-left font-normal">
                <span className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm text-text">{item.label}</span>
                  <span className="hp-amount shrink-0 text-sm text-text-muted">
                    {formatMoney(item.amount)}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="block h-2 w-full overflow-hidden rounded-full bg-surface-muted"
                >
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${width}%`, background: item.colour }}
                  />
                </span>
              </th>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
