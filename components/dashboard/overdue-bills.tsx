import Link from 'next/link';
import { ObligationRow } from '@/components/dashboard/obligation-row';
import { Amount } from '@/components/finance/amount';
import { SectionCard } from '@/components/ui/card';
import type { ObligationMetrics } from '@/lib/analytics/obligations';
import type { ObligationView } from '@/types/dashboard';

/**
 * Bills already past their date — §18.
 *
 * "Show prominently … Do not overuse alarming styling." So it sits high on
 * the page and states the figure plainly, with a danger-toned chip on each
 * row and no red panel, no icon shouting, no colour as the only signal. It
 * renders nothing at all when there is nothing overdue, rather than an empty
 * reassuring box that trains people to ignore the space.
 */
export function OverdueBills({
  items,
  metrics,
}: {
  items: ObligationView[];
  metrics: ObligationMetrics;
}) {
  if (items.length === 0) return null;

  return (
    <SectionCard
      title="Overdue"
      action={
        <Link href="/bills" className="hp-small font-semibold text-primary-text">
          View all
        </Link>
      }
      bodyClassName="-mt-1"
      className="border-danger/40"
    >
      <p className="hp-small mb-2 text-text-muted">
        {metrics.overdue.count === 1
          ? '1 bill past due · '
          : `${metrics.overdue.count} bills past due · `}
        <Amount value={metrics.overdue.amount} tone="expense" size="sm" />
      </p>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <ObligationRow key={item.id} item={item} icon="bills" tone="danger" />
        ))}
      </ul>
    </SectionCard>
  );
}
