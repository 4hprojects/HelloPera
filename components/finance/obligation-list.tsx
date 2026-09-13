import Link from 'next/link';
import { Amount } from '@/components/finance/amount';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { STATUS_LABELS, statusTone } from '@/lib/finance/obligation';
import type { Obligation } from '@/services/obligation.service';
import { buttonClass } from '@/components/ui/button';

/**
 * Shared list for bills, receivables and expected income.
 *
 * They differ in wording, not in shape — one component keeps the status
 * treatment identical across all three, which is what makes "overdue" mean
 * the same thing everywhere.
 */
export function ObligationList({
  obligations,
  emptyTitle,
  emptyDescription,
  newHref,
  newLabel,
}: {
  obligations: Obligation[];
  emptyTitle: string;
  emptyDescription: string;
  newHref: string;
  newLabel: string;
}) {
  if (obligations.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={
          <Link href={newHref} className={buttonClass('primary', 'md')}>
            {newLabel}
          </Link>
        }
      />
    );
  }

  return (
    <ul className="space-y-2">
      {obligations.map((o) => {
        const settled = o.display === 'paid' || o.display === 'cancelled';
        return (
          <li key={o.id}>
            <Card className={o.display === 'cancelled' ? 'opacity-60' : undefined}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-text">{o.name}</p>
                  <p className="hp-small text-text-muted">
                    {o.date ? o.date : 'No date'}
                    {o.description ? ` · ${o.description}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {/* Remaining, not the original total: what is still owed is
                      the number the user acts on. */}
                  <Amount value={settled ? o.amount : o.remaining} />
                  {!settled && o.applied.minor > 0n ? (
                    <p className="hp-small text-text-muted">
                      of <Amount value={o.amount} size="sm" /> left
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                {/* The label carries the meaning; the tone only reinforces it. */}
                <Badge tone={statusTone(o.display)}>{STATUS_LABELS[o.display]}</Badge>
                {!settled ? (
                  <Link
                    href={`${newHref.replace('/new', '')}/${o.id}`}
                    className="hp-small font-medium text-primary-text"
                  >
                    Record payment
                  </Link>
                ) : null}
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
