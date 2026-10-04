import type { Metadata } from 'next';
import Link from 'next/link';
import { Amount } from '@/components/finance/amount';
import { AccountCard, type AccountCardModel } from '@/components/finance/account-card';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/states';
import { requireUser } from '@/lib/auth/guards';
import {
  listAccounts,
  listBankDetails,
  listLoanDetails,
  summarise,
  type Account,
} from '@/services/account.service';
import { buttonClass } from '@/components/ui/button';
import { SuccessNextSteps } from '@/components/ui/success-next-steps';
import { BANK_KIND_LABELS, type BankKind } from '@/lib/finance/banks';
import { groupAccountsByNature } from '@/lib/finance/account-groups';
import { toDecimalString } from '@/lib/money';

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
  searchParams: Promise<{ created?: string; archived?: string }>;
}) {
  await requireUser();
  const { created, archived } = await searchParams;
  const showArchived = archived === '1';

  const accounts = await listAccounts({ includeArchived: showArchived });
  const [loans, banks] = await Promise.all([
    listLoanDetails(accounts),
    listBankDetails(accounts),
  ]);
  // Totals describe what you have now: archived accounts never count, even
  // while they are listed below.
  const totals = summarise(accounts.filter((a) => !a.is_archived));
  const { owned, owed } = groupAccountsByNature(accounts);

  const toCard = (account: Account): AccountCardModel => {
    const loan = loans.get(account.id);
    const bank = banks.get(account.id);
    const kind = bank?.kind ? BANK_KIND_LABELS[bank.kind as BankKind] : null;
    const subtitle = [
      TYPE_LABELS[account.type] ?? account.type,
      account.institution_name,
      kind,
    ]
      .filter(Boolean)
      .join(' · ')
      .concat(bank?.last4 ? ` ••${bank.last4}` : '');

    return {
      id: account.id,
      name: account.name,
      subtitle,
      nature: account.nature,
      balance: account.balance,
      archived: account.is_archived,
      loan: loan
        ? {
            nextPayment: loan.paymentAmount,
            nextDueDate: loan.nextDueDate,
            principal: loan.principal,
          }
        : null,
      edit: {
        id: account.id,
        name: account.name,
        isLoan: account.type === 'loan',
        isBank: account.type === 'bank',
        isArchived: account.is_archived,
        bank: bank ?? null,
        institutionName: account.institution_name,
        loan: loan
          ? {
              paymentAmount: toDecimalString(loan.paymentAmount.minor),
              paymentFrequency: loan.paymentFrequency,
              nextDueDate: loan.nextDueDate,
              principal: loan.principal ? toDecimalString(loan.principal.minor) : null,
              interestRateApr: loan.interestRateApr,
              termMonths: loan.termMonths,
            }
          : null,
      },
    };
  };

  const sections = [
    { key: 'owned', title: 'Money you own', items: owned },
    { key: 'owed', title: 'Money you owe', items: owed },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Accounts"
        description="Transactions are the source of truth; balances are derived from them."
        actions={
          <>
            <Link
              href={showArchived ? '/accounts' : '/accounts?archived=1'}
              className={buttonClass('ghost', 'sm')}
            >
              {showArchived ? 'Hide archived' : 'Show archived'}
            </Link>
            <Link href="/accounts/new" className={buttonClass('primary', 'sm')}>
              Add account
            </Link>
          </>
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
        <section key={t.currency} className="mb-5" aria-label={`${t.currency} totals`}>
          <h2 className="hp-small mb-2 font-semibold uppercase tracking-wide text-text-muted">
            {t.currency}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <CardLabel>Assets</CardLabel>
              <Amount value={t.assets} size="lg" className="mt-1.5 block" />
            </Card>
            <Card>
              <CardLabel>Liabilities</CardLabel>
              <Amount
                value={t.liabilities}
                tone="liability"
                size="lg"
                className="mt-1.5 block"
              />
            </Card>
            <Card>
              <CardLabel>Net position</CardLabel>
              <Amount value={t.net} size="lg" className="mt-1.5 block" />
            </Card>
          </div>
        </section>
      ))}

      {accounts.length === 0 ? (
        <EmptyState
          title={showArchived ? 'No accounts at all' : 'No accounts yet'}
          description="Add your cash, bank, GCash or credit card to start tracking."
          action={
            <Link href="/accounts/new" className={buttonClass('primary', 'md')}>
              Add your first account
            </Link>
          }
        />
      ) : (
        sections.map((section) => (
          <section
            key={section.key}
            className="mb-6"
            aria-labelledby={`${section.key}-h`}
          >
            <h2 id={`${section.key}-h`} className="hp-h3 mb-2 text-text">
              {section.title}{' '}
              <span className="hp-small font-normal text-text-muted">
                ({section.items.length})
              </span>
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {section.items.map((account) => (
                <li key={account.id}>
                  <AccountCard account={toCard(account)} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
