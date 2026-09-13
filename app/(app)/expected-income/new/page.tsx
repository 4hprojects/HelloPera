import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { requireUser } from '@/lib/auth/guards';
import { listCategories } from '@/services/category.service';
import { NewExpectedIncomeForm } from './new-expected-income-form';

export const metadata: Metadata = { title: 'Add expected income' };

export default async function NewExpectedIncomePage() {
  const { profile } = await requireUser();
  const categories = await listCategories('income');
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Add expected income" />
      <NewExpectedIncomeForm
        defaultCurrency={profile.default_currency}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
