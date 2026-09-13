import Link from 'next/link';
import { ObligationRow } from '@/components/dashboard/obligation-row';
import { Amount } from '@/components/finance/amount';
import { SectionCard } from '@/components/ui/card';
import type { ExpectedIncomeMetrics } from '@/lib/analytics/obligations';
import type { ObligationView } from '@/types/dashboard';

/**
 * Expected income — §20, §51.
 *
 * Kept visibly apart from realized income, which is §20's whole point: none
 * of these figures has arrived yet, and none of them reaches the cash-flow
 * card above. The "received" line is labelled for exactly what it measures —
 * what has come in against *this month's* expectations. We know the date the
 * money was expected, not the date it landed, and calling it "received this
 * month" would be a claim the data cannot support.
 */
export function ExpectedIncomeSummary({
  items,
  metrics,
}: {
  items: ObligationView[];
  metrics: ExpectedIncomeMetrics;
}) {
  const nothing =
    metrics.expectedThisMonth.count === 0 &&
    metrics.upcoming.count === 0 &&
    metrics.missed.count === 0;

  return (
    <SectionCard
      title="Expected income"
      action={
        <Link
          href="/expected-income"
          className="hp-small font-semibold text-primary-text"
        >
          View all
        </Link>
      }
      bodyClassName="-mt-1"
    >
      {nothing ? (
        <p className="hp-body py-6 text-center text-text-muted">Nothing expected yet.</p>
      ) : (
        <>
          <p className="hp-small mb-2 text-text-muted">
            Not counted as income until it arrives.
          </p>
          <dl className="mb-2 grid grid-cols-3 gap-2">
            <Figure label="This month" value={metrics.expectedThisMonth.amount} />
            <Figure label="Upcoming" value={metrics.upcoming.amount} />
            <Figure label="Missed" value={metrics.missed.amount} tone="expense" />
          </dl>
          {metrics.receivedOfThisMonth.minor > 0n ? (
            <p className="hp-small mb-2 text-text-muted">
              Received of this month&rsquo;s expected:{' '}
              <Amount value={metrics.receivedOfThisMonth} tone="income" size="sm" />
            </p>
          ) : null}
          {items.length > 0 ? (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <ObligationRow
                  key={item.id}
                  item={item}
                  icon="calendar"
                  tone="primary"
                  timing="expected"
                />
              ))}
            </ul>
          ) : null}
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
