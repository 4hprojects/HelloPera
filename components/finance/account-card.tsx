import Link from 'next/link';
import { Amount } from '@/components/finance/amount';
import { EditAccount, type EditableAccount } from '@/components/finance/edit-account';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { loanProgress } from '@/lib/finance/account-groups';
import type { Money } from '@/lib/money';
import { cn } from '@/lib/utils/cn';

export type AccountCardModel = {
  id: string;
  name: string;
  /** "Bank · BDO · Savings ••1234" */
  subtitle: string;
  nature: 'asset' | 'liability';
  balance: Money;
  archived: boolean;
  loan: { nextPayment: Money; nextDueDate: string; principal: Money | null } | null;
  edit: EditableAccount;
};

/**
 * One account: monogram, name and balance up top; loan schedule when there is
 * one; a footer with the two things you do next — look at its history or edit.
 * Archive and delete live in the edit modal, so the card stays quiet.
 */
export function AccountCard({ account: a }: { account: AccountCardModel }) {
  const liability = a.nature === 'liability';
  const progress = a.loan ? loanProgress(a.balance.minor, a.loan.principal?.minor) : null;

  return (
    <Card className={cn(a.archived && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full text-base font-semibold',
            liability
              ? 'bg-tint-warning text-warning-text'
              : 'bg-tint-primary text-primary-text',
          )}
        >
          {a.name.trim().charAt(0).toUpperCase() || '?'}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="truncate font-medium text-text">{a.name}</p>
            <Amount value={a.balance} tone={liability ? 'liability' : 'neutral'} />
          </div>
          <p className="hp-small truncate text-text-muted">{a.subtitle}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={liability ? 'warning' : 'neutral'}>
              {liability ? 'Owed' : 'Owned'}
            </Badge>
            {a.archived ? <Badge tone="neutral">Archived</Badge> : null}
          </div>

          {a.loan ? (
            <p className="hp-small mt-2 text-text-muted">
              Next payment <Amount value={a.loan.nextPayment} size="sm" /> due{' '}
              {a.loan.nextDueDate}
            </p>
          ) : null}
          {progress !== null ? (
            <div className="mt-1.5 flex items-center gap-2">
              <div
                role="progressbar"
                aria-label="Loan paid off"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-tint-ink"
              >
                <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
              <span className="hp-small text-text-muted">{progress}% paid</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <Link
          href={`/transactions?accountId=${a.id}`}
          className="inline-flex min-h-11 items-center hp-small font-medium text-primary-text"
        >
          View transactions
        </Link>
        <EditAccount account={a.edit} />
      </div>
    </Card>
  );
}
