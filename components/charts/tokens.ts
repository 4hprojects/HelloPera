/**
 * Chart colour roles — §38, "Do not hardcode chart colors throughout
 * components. Use design tokens."
 *
 * Every value here is a `--hp-chart-*` variable measured at >= 3:1 against
 * the card surface in both themes (app/globals.css), so a mark is
 * distinguishable without relying on the legend swatch.
 */
export const CHART_TOKENS = {
  income: 'var(--hp-chart-1)',
  expense: 'var(--hp-chart-2)',
  net: 'var(--hp-chart-3)',
  liability: 'var(--hp-chart-4)',
  neutral: 'var(--hp-chart-6)',
} as const;

/** Category slices, in order. Six roles before it wraps. */
export const CATEGORY_PALETTE = [
  'var(--hp-chart-1)',
  'var(--hp-chart-2)',
  'var(--hp-chart-3)',
  'var(--hp-chart-4)',
  'var(--hp-chart-5)',
  'var(--hp-chart-6)',
] as const;

export const paletteAt = (i: number): string =>
  CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]!;
