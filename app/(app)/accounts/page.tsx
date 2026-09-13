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

export default async function AccountsPage() {
  await requireUser();
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
                  <p className="truncate font-medium text-text">{account.name}</p>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
