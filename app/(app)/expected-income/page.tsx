import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { ObligationList } from '@/components/finance/obligation-list';
import { requireUser } from '@/lib/auth/guards';
import { todayInTimezone } from '@/lib/finance/obligation';
import { listObligations } from '@/services/obligation.service';
import { buttonClass } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Expected income' };

export default async function ExpectedIncomePage() {
  const { profile } = await requireUser();
  const today = todayInTimezone(profile.timezone);
  const items = await listObligations('expected_income', today);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Expected income"
        description="Salary, stipends and payments you anticipate. Separate from money that has arrived."
        actions={
          <Link href="/expected-income/new" className={buttonClass('primary', 'sm')}>
            Add
          </Link>
        }
      />
      <ObligationList
        obligations={items}
        emptyTitle="No expected income yet"
        emptyDescription="Add expected salary, stipend or freelance income."
        newHref="/expected-income/new"
        newLabel="Add expected income"
      />
    </div>
  );
}
