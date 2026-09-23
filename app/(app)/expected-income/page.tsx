import { ObligationPagination } from '@/components/finance/obligation-pagination';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { ObligationList } from '@/components/finance/obligation-list';
import { requireUser } from '@/lib/auth/guards';
import { todayInTimezone } from '@/lib/finance/obligation';
import { listObligationPage } from '@/services/obligation.service';
import { buttonClass } from '@/components/ui/button';
import { SuccessNextSteps } from '@/components/ui/success-next-steps';

export const metadata: Metadata = { title: 'Expected income' };

export default async function ExpectedIncomePage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; page?: string }>;
}) {
  const { profile } = await requireUser();
  const { created, page: rawPage } = await searchParams;
  const page = Math.max(1, Math.min(4000, Number.parseInt(rawPage ?? '1', 10) || 1));
  const today = todayInTimezone(profile.timezone);
  const display = await listObligationPage('expected_income', today, page);

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
      {created === '1' ? (
        <SuccessNextSteps
          title="Expected income added"
          description="It is now included in your upcoming cash forecast."
          primary={{ href: '/dashboard', label: 'View dashboard' }}
          secondary={[{ href: '/expected-income/new', label: 'Add another income' }]}
        />
      ) : null}
      <ObligationList
        obligations={display.items}
        emptyTitle="No expected income yet"
        emptyDescription="Add expected salary, stipend or freelance income."
        newHref="/expected-income/new"
        newLabel="Add expected income"
      />
      <ObligationPagination
        page={page}
        hasNext={display.hasNext}
        href="/expected-income"
      />
    </div>
  );
}
