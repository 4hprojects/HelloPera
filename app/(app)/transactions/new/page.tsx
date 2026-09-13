import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { requireUser } from '@/lib/auth/guards';
import { listAccounts } from '@/services/account.service';
import { listCategories } from '@/services/category.service';
import { EmptyState } from '@/components/ui/states';
import Link from 'next/link';
import { NewTransactionForm } from './new-transaction-form';
import { buttonClass } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Add transaction' };

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { profile } = await requireUser();
  const [accounts, categories] = await Promise.all([listAccounts(), listCategories()]);
  const { type } = await searchParams;

  if (accounts.length === 0) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Add transaction" />
        <EmptyState
          title="Add an account first"
          description="Every transaction moves money into or out of an account."
          action={
            <Link href="/accounts/new" className={buttonClass('primary', 'md')}>
              Add an account
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Add transaction" />
      <NewTransactionForm
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          nature: a.nature,
          currency: a.currency_code,
        }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
        defaultCurrency={profile.default_currency}
        initialType={type ?? 'expense'}
      />
    </div>
  );
}
