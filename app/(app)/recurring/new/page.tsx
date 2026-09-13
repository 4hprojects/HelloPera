import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { NewRuleForm } from './new-rule-form';
import { requireUser } from '@/lib/auth/guards';
import { listAccounts } from '@/services/account.service';
import { listCategories } from '@/services/category.service';

export const metadata: Metadata = { title: 'New recurring rule' };

/** §49 — /recurring/new. */
export default async function NewRecurringRulePage() {
  const { profile } = await requireUser();
  const [accounts, categories] = await Promise.all([listAccounts(), listCategories()]);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="New recurring rule"
        description="Describe something that repeats. HelloPera will create the future occurrences for you."
      />
      <Card>
        <NewRuleForm
          defaultCurrency={profile.default_currency}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        />
      </Card>
    </div>
  );
}
