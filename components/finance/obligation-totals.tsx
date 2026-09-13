import { Amount } from '@/components/finance/amount';
import { Card, CardLabel } from '@/components/ui/card';
import type { ObligationMetrics } from '@/lib/analytics/obligations';

/**
 * Outstanding / due soon / overdue, one row of cards per currency.
 *
 * A single set of cards was summing `remaining` across every currency and
 * labelling the result with the profile's default — so a $40 bill quietly
 * added ₱40 to the peso total. PHASE-06 §8 and §29 forbid combining, and §75
 * criterion 22 requires that mixed currencies are never misleadingly summed.
 *
 * With one currency this renders exactly as before; the heading only appears
 * once there is something to disambiguate.
 */
export function ObligationTotals({
  metrics,
  overdueLabel = 'Overdue',
}: {
  metrics: readonly ObligationMetrics[];
  overdueLabel?: string;
}) {
  const withAny = metrics.filter((m) => m.outstanding.count > 0);
  if (withAny.length === 0) return null;

  return (
    <div className="mb-4 space-y-3">
      {withAny.map((m) => (
        <section key={m.currency}>
          {withAny.length > 1 ? (
            <h2 className="hp-label mb-2 text-text-muted">{m.currency}</h2>
          ) : null}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardLabel>Outstanding</CardLabel>
              <Amount value={m.outstanding.amount} size="lg" className="mt-1.5 block" />
            </Card>
            <Card>
              <CardLabel>Due soon</CardLabel>
              <Amount value={m.dueSoon.amount} size="lg" className="mt-1.5 block" />
            </Card>
            <Card>
              <CardLabel>{overdueLabel}</CardLabel>
              <Amount
                value={m.overdue.amount}
                tone={m.overdue.count > 0 ? 'expense' : 'neutral'}
                size="lg"
                className="mt-1.5 block"
              />
            </Card>
          </div>
        </section>
      ))}
    </div>
  );
}
