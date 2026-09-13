import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { requireUser } from '@/lib/auth/guards';
import { listCategories } from '@/services/category.service';
import { NewBillForm } from './new-bill-form';

export const metadata: Metadata = { title: 'Add bill' };

export default async function NewBillPage() {
  const { profile } = await requireUser();
  const categories = await listCategories('expense');
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Add bill" />
      <NewBillForm
        defaultCurrency={profile.default_currency}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
