import { cn } from '@/lib/utils/cn';

/**
 * The trend line under each stat card.
 *
 * Purely decorative: the figure above it and the delta beside it carry every
 * number a reader needs, so it is `aria-hidden` rather than a chart with a
 * description nobody asked for. A flat or single-point series renders as a
 * mid-height line rather than collapsing to the baseline, which would read
 * as "zero" instead of "nothing to compare".
 */
export function Sparkline({
  values,
  stroke = 'var(--hp-chart-1)',
  className,
  width = 160,
  height = 40,
}: {
  values: readonly number[];
  stroke?: string;
  className?: string;
  width?: number;
  height?: number;
}) {
  if (values.length === 0) return null;

  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;

  const point = (v: number, i: number) => {
    const x = pad + i * stepX;
    const y =
      span === 0 ? height / 2 : height - pad - ((v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  };

  const points = values.map(point);
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  const area = `${line} L${points.at(-1)![0]} ${height} L${points[0]![0]} ${height} Z`;
  const id = `spark-${stroke.replace(/\W/g, '')}-${values.length}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cn('block', className)}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.20" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
