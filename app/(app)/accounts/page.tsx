import { archiveAccountAction } from '@/app/actions/finance';
import { Button } from '@/components/ui/button';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Amount } from '@/components/finance/amount';
import { Badge } from '@/components/ui/badge';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/states';
import { requireUser } from '@/lib/auth/guards';
import { listAccounts, summarise } from '@/services/account.service';
import { buttonClass } from '@/components/ui/button';
import { SuccessNextSteps } from '@/components/ui/success-next-steps';

export const metadata: Metadata = { title: 'Accounts' };

const TYPE_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank: 'Bank',
  gcash: 'GCash',
  maya: 'Maya',
  paypal: 'PayPal',
  credit_card: 'Credit card',
  loan: 'Loan',
  investment: 'Investment',
  other: 'Other',
};

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  await requireUser();
  const { created } = await searchParams;
  const accounts = await listAccounts();
  const totals = summarise(accounts);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Accounts"
        description="Transactions are the source of truth; balances are derived from them."
        actions={
          <Link href="/accounts/new" className={buttonClass('primary', 'sm')}>
            Add account
          </Link>
        }
      />

      {created === '1' ? (
        <SuccessNextSteps
          title="Account added"
          description="Your balance is ready. Record what comes in or goes out next."
          primary={{ href: '/transactions/new?type=expense', label: 'Add an expense' }}
          secondary={[
            { href: '/transactions/new?type=income', label: 'Add income' },
            { href: '/dashboard', label: 'View dashboard' },
          ]}
        />
      ) : null}

      {/* One block per currency. HelloPera never sums across currencies. */}
      {totals.map((t) => (
        <div key={t.currency} className="mb-4 grid grid-cols-3 gap-3">
          <Card>
            <CardLabel>Assets ({t.currency})</CardLabel>
            <Amount value={t.assets} size="lg" className="mt-1.5 block" />
          </Card>
          <Card>
            <CardLabel>Liabilities ({t.currency})</CardLabel>
            <Amount
              value={t.liabilities}
              tone="liability"
              size="lg"
              className="mt-1.5 block"
            />
          </Card>
          <Card>
            <CardLabel>Net position ({t.currency})</CardLabel>
            <Amount value={t.net} size="lg" className="mt-1.5 block" />
          </Card>
        </div>
      ))}

      {accounts.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Add your cash, bank, GCash or credit card to start tracking."
          action={
            <Link href="/accounts/new" className={buttonClass('primary', 'md')}>
              Add your first account
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2">
          {accounts.map((account) => (
            <li key={account.id}>
              <Card className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-text">
                    {account.name}
                    {account.is_archived ? ' (archived)' : ''}
                  </p>
                  <p className="hp-small text-text-muted">
                    {TYPE_LABELS[account.type] ?? account.type}
                    {account.institution_name ? ` · ${account.institution_name}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={account.nature === 'liability' ? 'warning' : 'neutral'}>
                    {account.nature === 'liability' ? 'Owed' : 'Owned'}
                  </Badge>
                  <Amount
                    value={account.balance}
                    tone={account.nature === 'liability' ? 'liability' : 'neutral'}
                  />
                </div>
              </Card>
              <details className="mt-2">
                <summary className="min-h-11 cursor-pointer py-3 text-primary-text">
                  {account.is_archived ? 'Restore account' : 'Archive account'}
                </summary>
                <p className="hp-small mb-2">
                  History is kept. Archived accounts cannot receive new transactions and
                  are excluded from dashboard balances.
                </p>
                <form action={archiveAccountAction}>
                  <input type="hidden" name="id" value={account.id} />
                  <input
                    type="hidden"
                    name="archived"
                    value={String(!account.is_archived)}
                  />
                  <Button type="submit" variant="secondary">
                    {account.is_archived ? 'Confirm restore' : 'Confirm archive'}
                  </Button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
