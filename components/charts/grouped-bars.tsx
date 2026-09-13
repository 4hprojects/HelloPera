import { signedDomain } from '@/lib/analytics/series';
import { cn } from '@/lib/utils/cn';

export type BarSeries = {
  label: string;
  colour: string;
  /** One value per category, in minor units. */
  values: readonly number[];
};

/**
 * Income vs Expenses — grouped bars.
 *
 * Rendered as SVG on the server: no chart library, no client bundle, and the
 * page is complete on first paint. The accessible layer is a real table
 * placed after the graphic, because a bar chart with `role="img"` and a
 * one-line summary tells a screen-reader user the shape and withholds the
 * numbers.
 *
 * `formatTick` and `formatValue` take minor units — the caller owns currency
 * formatting so nothing here has to know about money.
 */
export function GroupedBars({
  categories,
  series,
  formatTick,
  formatValue,
  caption,
  height = 200,
  className,
}: {
  categories: readonly string[];
  series: readonly BarSeries[];
  formatTick: (minor: number) => string;
  formatValue: (minor: number) => string;
  caption: string;
  height?: number;
  className?: string;
}) {
  // A signed domain, because net cash flow goes negative (§24). Scaling
  // |value| from a zero baseline would draw −₱8,000 and +₱8,000 identically,
  // which in a finance chart is not a cosmetic problem.
  const { bottom, top, ticks } = signedDomain(
    series.flatMap((s) => [...s.values]),
    4,
  );
  const span = top - bottom || 1;

  const width = 520;
  const padL = 52;
  const padR = 8;
  const padT = 8;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const groupW = plotW / Math.max(1, categories.length);
  const barW = Math.min(14, (groupW - 8) / Math.max(1, series.length));
  const groupInner = barW * series.length + 4 * (series.length - 1);

  return (
    <div className={cn('w-full', className)}>
      <ul className="mb-3 flex flex-wrap items-center justify-end gap-4">
        {series.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-xs text-text-muted">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: s.colour }}
            />
            {s.label}
          </li>
        ))}
      </ul>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        aria-hidden="true"
        focusable="false"
        className="block overflow-visible"
      >
        {ticks.map((t) => {
          const y = padT + plotH - ((t - bottom) / span) * plotH;
          return (
            <g key={t}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                // The zero line is the one a reader measures against, so it
                // is drawn heavier than the rest of the grid.
                stroke={t === 0 ? 'var(--hp-border-strong)' : 'var(--hp-chart-grid)'}
                strokeWidth={t === 0 ? 1.25 : 1}
              />
              <text
                x={padL - 8}
                y={y + 3.5}
                textAnchor="end"
                fontSize="10"
                fill="var(--hp-text-muted)"
              >
                {formatTick(t)}
              </text>
            </g>
          );
        })}

        {categories.map((cat, ci) => {
          const gx = padL + ci * groupW + (groupW - groupInner) / 2;
          return (
            <g key={cat}>
              {series.map((s, si) => {
                const value = s.values[ci] ?? 0;
                const yOf = (v: number) => padT + plotH - ((v - bottom) / span) * plotH;
                const yValue = yOf(value);
                const yZero = yOf(0);
                const h = Math.abs(yValue - yZero);
                return (
                  <rect
                    key={s.label}
                    x={gx + si * (barW + 4)}
                    y={Math.min(yValue, yZero)}
                    width={barW}
                    height={Math.max(h, value !== 0 ? 2 : 0)}
                    rx={Math.min(barW / 2, h / 2)}
                    fill={s.colour}
                  />
                );
              })}
              <text
                x={padL + ci * groupW + groupW / 2}
                y={height - 8}
                textAnchor="middle"
                fontSize="10"
                fill="var(--hp-text-muted)"
              >
                {cat}
              </text>
            </g>
          );
        })}
      </svg>

      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map((s) => (
              <th key={s.label} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat, ci) => (
            <tr key={cat}>
              <th scope="row">{cat}</th>
              {series.map((s) => (
                <td key={s.label}>{formatValue(s.values[ci] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
