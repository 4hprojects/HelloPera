import { cn } from '@/lib/utils/cn';

export type DonutSlice = {
  label: string;
  /** Minor units. Negative and zero values are dropped by the caller. */
  value: number;
  colour: string;
};

/**
 * Spending by Category — donut with a centred total and a legend carrying
 * each share as a percentage.
 *
 * Drawn with stroke-dasharray on a single circle rather than arc paths, so
 * there is no trigonometry to get wrong and the ring stays perfectly even.
 * Each slice is separated by a small gap in the showcase's style.
 *
 * The percentages sit in the legend as text, so the reading does not depend
 * on distinguishing six colours — which is also what makes the chart usable
 * in greyscale.
 */
export function Donut({
  slices,
  total,
  totalLabel,
  formatValue,
  caption,
  className,
}: {
  slices: readonly DonutSlice[];
  total: number;
  totalLabel: string;
  formatValue: (minor: number) => string;
  caption: string;
  className?: string;
}) {
  const sum = slices.reduce((s, x) => s + x.value, 0);
  const r = 60;
  const circumference = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 1.5 : 0;

  // Each slice starts where the ones before it ended. Accumulated with
  // reduce rather than a mutable cursor so the map stays a pure projection
  // of `slices` — the lint rule that forbids reassignment during render is
  // pointing at a real hazard: a re-render mid-list would resume from a
  // stale offset.
  const arcs = slices.reduce<
    Array<DonutSlice & { share: number; dash: string; offset: number }>
  >((acc, slice) => {
    const consumed = acc.reduce((s, a) => s + a.share, 0) * circumference;
    const share = sum === 0 ? 0 : slice.value / sum;
    const length = Math.max(0, share * circumference - gap);
    acc.push({
      ...slice,
      share,
      dash: `${length} ${circumference - length}`,
      offset: -consumed,
    });
    return acc;
  }, []);

  return (
    <div className={cn('flex flex-wrap items-center gap-6', className)}>
      <div className="relative shrink-0">
        <svg
          viewBox="0 0 160 160"
          width="160"
          height="160"
          aria-hidden="true"
          focusable="false"
          className="block -rotate-90"
        >
          <circle
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke="var(--hp-surface-muted)"
            strokeWidth="22"
          />
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke={arc.colour}
              strokeWidth="22"
              strokeDasharray={arc.dash}
              strokeDashoffset={arc.offset}
            />
          ))}
        </svg>
        <div
          aria-hidden="true"
          className="absolute inset-0 flex flex-col items-center justify-center text-center"
        >
          <span className="hp-amount text-[1.0625rem] text-text">
            {formatValue(total)}
          </span>
          <span className="mt-0.5 text-[0.6875rem] text-text-muted">{totalLabel}</span>
        </div>
      </div>

      <table className="min-w-[12rem] flex-1 text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Amount</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {arcs.map((arc) => (
            <tr key={arc.label}>
              <th scope="row" className="py-1.5 pr-3 text-left font-normal text-text">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: arc.colour }}
                  />
                  <span className="truncate">{arc.label}</span>
                </span>
              </th>
              <td className="hp-amount sr-only py-1.5">{formatValue(arc.value)}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums text-text-muted">
                {Math.round(arc.share * 100)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
