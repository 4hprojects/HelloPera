import Link from 'next/link';
import { ObligationRow } from '@/components/dashboard/obligation-row';
import { Amount } from '@/components/finance/amount';
import { SectionCard } from '@/components/ui/card';
import type { ObligationMetrics } from '@/lib/analytics/obligations';
import type { ObligationView } from '@/types/dashboard';

/** Open bills, soonest first — §17, with §49's counts in the header. */
export function UpcomingBills({
  items,
  metrics,
}: {
  items: ObligationView[];
  metrics: ObligationMetrics;
}) {
  return (
    <SectionCard
      title="Upcoming bills"
      action={
        <Link href="/bills" className="hp-small font-semibold text-primary-text">
          View all
        </Link>
      }
      bodyClassName="-mt-1"
    >
      <p className="hp-small mb-2 text-text-muted">
        {metrics.outstanding.count === 0
          ? 'Nothing outstanding'
          : `${metrics.outstanding.count} outstanding · `}
        {metrics.outstanding.count > 0 ? (
          <Amount value={metrics.outstanding.amount} size="sm" />
        ) : null}
        {metrics.dueSoon.count > 0 ? ` · ${metrics.dueSoon.count} due soon` : ''}
      </p>

      {items.length === 0 ? (
        <p className="hp-body py-6 text-center text-text-muted">No upcoming bills.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <ObligationRow key={item.id} item={item} icon="bills" tone="warning" />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
