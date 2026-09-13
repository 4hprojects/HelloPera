import Link from 'next/link';
import { ObligationRow } from '@/components/dashboard/obligation-row';
import { Amount } from '@/components/finance/amount';
import { SectionCard } from '@/components/ui/card';
import type { ObligationMetrics } from '@/lib/analytics/obligations';
import type { ObligationView } from '@/types/dashboard';

/** Money owed to you — §19, §50. Outstanding, overdue and due soon. */
export function ReceivablesSummary({
  items,
  metrics,
}: {
  items: ObligationView[];
  metrics: ObligationMetrics;
}) {
  return (
    <SectionCard
      title="Receivables"
      action={
        <Link href="/receivables" className="hp-small font-semibold text-primary-text">
          View all
        </Link>
      }
      bodyClassName="-mt-1"
    >
      {metrics.outstanding.count === 0 ? (
        <p className="hp-body py-6 text-center text-text-muted">
          No outstanding receivables.
        </p>
      ) : (
        <>
          <dl className="mb-2 grid grid-cols-3 gap-2">
            <Figure label="Outstanding" value={metrics.outstanding.amount} />
            <Figure label="Due soon" value={metrics.dueSoon.amount} />
            <Figure label="Overdue" value={metrics.overdue.amount} tone="expense" />
          </dl>
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <ObligationRow
                key={item.id}
                item={item}
                icon="receivables"
                tone="primary"
              />
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: Parameters<typeof Amount>[0]['value'];
  tone?: 'expense';
}) {
  return (
    <div className="min-w-0">
      <dt className="hp-label truncate text-text-muted">{label}</dt>
      <dd className="mt-0.5">
        <Amount value={value} tone={tone} size="sm" />
      </dd>
    </div>
  );
}
