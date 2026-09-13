import Link from 'next/link';
import { Card, CardLabel } from '@/components/ui/card';
import { formatMoney, isNegative, money, subtract } from '@/lib/money';
import type { Money } from '@/lib/money';

/**
 * §52 — "Add lightweight card: Projected 30-Day Balance. Do not overcrowd
 * dashboard."
 *
 * One number and its direction. Everything else — the timeline, the horizons,
 * the assumptions — lives on /forecast, which this links to.
 */
export function ForecastCard({ opening, closing }: { opening: Money; closing: Money }) {
  const change = subtract(closing, opening);
  const falling = isNegative(change);
  const magnitude = money(
    change.minor < 0n ? -change.minor : change.minor,
    change.currency,
  );

  return (
    <Link
      href="/forecast"
      className="block rounded-[var(--radius-hp)] transition-colors hover:opacity-90"
    >
      <Card>
        <CardLabel>Projected in 30 days</CardLabel>
        <p
          className={
            isNegative(closing) ? 'hp-h2 mt-1 text-danger-text' : 'hp-h2 mt-1 text-text'
          }
        >
          {formatMoney(closing)}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          {change.minor === 0n
            ? 'No change projected'
            : /* The word carries the direction, not just the sign. */
              `${falling ? 'Down' : 'Up'} ${formatMoney(magnitude)} from today`}
        </p>
      </Card>
    </Link>
  );
}
