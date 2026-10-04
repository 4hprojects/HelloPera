import Link from 'next/link';
import { Amount } from '@/components/finance/amount';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { STATUS_LABELS, statusTone } from '@/lib/finance/obligation';
import type { Obligation } from '@/services/obligation.service';
import { buttonClass } from '@/components/ui/button';
import { EditObligation } from '@/components/finance/edit-obligation';
import { toDecimalString } from '@/lib/money';
import { listCategories } from '@/services/category.service';

/**
 * Shared list for bills, receivables and expected income.
 *
 * They differ in wording, not in shape — one component keeps the status
 * treatment identical across all three, which is what makes "overdue" mean
 * the same thing everywhere.
 */
export async function ObligationList({
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
  const kind = obligations[0]?.kind;
  const categories =
    !kind || kind === 'receivable'
      ? []
      : (await listCategories(kind === 'bill' ? 'expense' : 'income')).map((c) => ({
          id: c.id,
          name: c.name,
        }));

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
                  {o.installment ? (
                    <p className="hp-small text-text-muted">
                      <Amount value={o.installment.amount} size="sm" /> / month ·{' '}
                      {o.paymentsMade} of {o.installment.count} paid
                    </p>
                  ) : null}
                  <p className="hp-small text-text-muted">
                    {o.borrowedDate ? `Lent ${o.borrowedDate} · ` : ''}
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
                <div className="flex items-center gap-2">
                  {o.display !== 'cancelled' ? (
                    <EditObligation
                      item={{
                        id: o.id,
                        kind: o.kind,
                        name: o.name,
                        amount: toDecimalString(o.amount.minor),
                        date: o.date,
                        description: o.description,
                        notes: o.notes,
                        categoryId: o.categoryId,
                        installmentAmount: o.installment
                          ? toDecimalString(o.installment.amount.minor)
                          : null,
                        installmentCount: o.installment?.count ?? null,
                        installmentsPrior: o.installment?.prior ?? 0,
                        borrowedDate: o.borrowedDate,
                      }}
                      categories={categories}
                    />
                  ) : null}
                  {!settled ? (
                    <Link
                      href={`${newHref.replace('/new', '')}/${o.id}`}
                      className="inline-flex min-h-11 items-center hp-small font-medium text-primary-text"
                    >
                      Record payment
                    </Link>
                  ) : null}
                </div>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
