import { BarList } from '@/components/charts/bar-list';
import { paletteAt } from '@/components/charts/tokens';
import { SectionCard } from '@/components/ui/card';
import type { LabelledAggregate } from '@/types/dashboard';

/**
 * A ranked breakdown as horizontal bars — §22 spending by account and §23
 * income by category.
 *
 * §21 offers "Donut or Horizontal bar"; bars win here because account and
 * income-source names are long and the question being asked is ordinal
 * ("where does most of it go?") rather than proportional.
 *
 * Renders nothing when there is nothing — §42, "Do not show empty charts."
 */
export function BreakdownChart({
  title,
  period,
  items,
  caption,
}: {
  title: string;
  period: string;
  items: LabelledAggregate[];
  caption: string;
}) {
  const positive = items.filter((i) => i.amount.minor > 0n);
  if (positive.length === 0) return null;

  return (
    <SectionCard
      title={title}
      action={
        <span className="hp-small rounded-full border border-border px-3 py-1 text-text-muted">
          {period}
        </span>
      }
    >
      <BarList
        items={positive.map((item, i) => ({
          label: item.label,
          amount: item.amount,
          colour: paletteAt(i),
        }))}
        caption={caption}
      />
    </SectionCard>
  );
}
