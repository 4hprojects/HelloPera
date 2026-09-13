import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { requireUser } from '@/lib/auth/guards';
import { NewAccountForm } from './new-account-form';

export const metadata: Metadata = { title: 'Add account' };

export default async function NewAccountPage() {
  const { profile } = await requireUser();
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Add account" />
      <NewAccountForm defaultCurrency={profile.default_currency} />
    </div>
  );
}
