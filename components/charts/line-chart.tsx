import { signedDomain } from '@/lib/analytics/series';
import { cn } from '@/lib/utils/cn';

export type LinePoint = {
  /** X label — only some are drawn, but every one reaches the table. */
  label: string;
  /** Minor units. */
  value: number;
};

/**
 * Projected balance over time — PHASE-07 §53.
 *
 * Rendered as SVG on the server, like every other chart here: no chart
 * library, no client bundle, complete on first paint. The accessible layer is
 * a real table after the graphic rather than a `role="img"` summary, because
 * a summary tells a screen-reader user the shape and withholds the numbers.
 *
 * A line rather than bars because the projection is a running balance — a
 * continuous quantity measured daily, where bars would imply ninety separate
 * events. The zero line is drawn heavier for the same reason it is in
 * `GroupedBars`: below it is the part that matters (§54).
 */
export function LineChart({
  points,
  colour,
  formatTick,
  formatValue,
  caption,
  /** Drawn as a dashed rule, for the §55 shortfall date. */
  markerIndex,
  markerLabel,
  height = 220,
  className,
}: {
  points: readonly LinePoint[];
  colour: string;
  formatTick: (minor: number) => string;
  formatValue: (minor: number) => string;
  caption: string;
  markerIndex?: number | null;
  markerLabel?: string;
  height?: number;
  className?: string;
}) {
  // A signed domain, because a projection that goes negative is precisely the
  // case the page exists to surface. Scaling from a zero baseline would draw a
  // shortfall as if it were a small positive balance.
  const { bottom, top, ticks } = signedDomain(
    points.map((p) => p.value),
    4,
  );
  const span = top - bottom || 1;

  const width = 520;
  const padL = 52;
  const padR = 10;
  const padT = 10;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xOf = (i: number) =>
    padL + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yOf = (v: number) => padT + plotH - ((v - bottom) / span) * plotH;

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)} ${yOf(p.value)}`)
    .join(' ');

  // Fill under the line, closed along the zero baseline rather than the
  // bottom of the plot, so a negative stretch reads as below zero.
  const yZero = yOf(0);
  const area =
    points.length > 1
      ? `${line} L${xOf(points.length - 1)} ${yZero} L${xOf(0)} ${yZero} Z`
      : '';

  // At 90 days a label per point is unreadable; roughly six evenly spaced.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        aria-hidden="true"
        focusable="false"
        className="block overflow-visible"
      >
        {ticks.map((t) => {
          const y = yOf(t);
          return (
            <g key={t}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
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

        {area ? <path d={area} fill={colour} opacity={0.12} /> : null}

        <path
          d={line}
          fill="none"
          stroke={colour}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* §55 — where the balance first goes below zero. */}
        {markerIndex != null && markerIndex >= 0 && markerIndex < points.length ? (
          <g>
            <line
              x1={xOf(markerIndex)}
              x2={xOf(markerIndex)}
              y1={padT}
              y2={padT + plotH}
              stroke="var(--hp-chart-2)"
              strokeWidth={1.25}
              strokeDasharray="3 3"
            />
            <circle
              cx={xOf(markerIndex)}
              cy={yOf(points[markerIndex]!.value)}
              r={3.5}
              fill="var(--hp-chart-2)"
            />
          </g>
        ) : null}

        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={p.label + String(i)}
              x={xOf(i)}
              y={height - 8}
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
              fontSize="10"
              fill="var(--hp-text-muted)"
            >
              {p.label}
            </text>
          ) : null,
        )}
      </svg>

      <table className="sr-only">
        <caption>
          {caption}
          {markerIndex != null && markerLabel ? ` ${markerLabel}` : ''}
        </caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Projected balance</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={p.label + String(i)}>
              <th scope="row">{p.label}</th>
              <td>{formatValue(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
