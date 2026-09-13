import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { requireUser } from '@/lib/auth/guards';
import { NewReceivableForm } from './new-receivable-form';

export const metadata: Metadata = { title: 'Add receivable' };

export default async function NewReceivablePage() {
  const { profile } = await requireUser();
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Add receivable" />
      <NewReceivableForm defaultCurrency={profile.default_currency} />
    </div>
  );
}
