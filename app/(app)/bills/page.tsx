import { ObligationPagination } from '@/components/finance/obligation-pagination';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ObligationTotals } from '@/components/finance/obligation-totals';
import { PageHeader } from '@/components/ui/page-header';
import { ObligationList } from '@/components/finance/obligation-list';
import { requireUser } from '@/lib/auth/guards';
import { todayInTimezone } from '@/lib/finance/obligation';
import { obligationMetrics } from '@/lib/analytics/obligations';
import { listObligations, listObligationPage } from '@/services/obligation.service';
import { buttonClass } from '@/components/ui/button';
import { SuccessNextSteps } from '@/components/ui/success-next-steps';

export const metadata: Metadata = { title: 'Bills' };

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; page?: string }>;
}) {
  const { profile } = await requireUser();
  const { created, page: rawPage } = await searchParams;
  const page = Math.max(1, Math.min(4000, Number.parseInt(rawPage ?? '1', 10) || 1));
  const today = todayInTimezone(profile.timezone);
  const [bills, display] = await Promise.all([
    listObligations('bill', today),
    listObligationPage('bill', today, page),
  ]);

  // §8, §29 — grouped per currency, never combined into one figure.
  const metrics = obligationMetrics(
    bills.map((b) => ({
      currency: b.currency,
      remaining: b.remaining,
      applied: b.applied,
      date: b.date,
      display: b.display,
    })),
    profile.default_currency,
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Bills"
        description="What you owe. A bill is not an expense until you pay it."
        actions={
          <Link href="/bills/new" className={buttonClass('primary', 'sm')}>
            Add bill
          </Link>
        }
      />

      {created === '1' ? (
        <SuccessNextSteps
          title="Bill added"
          description="It is now included in your upcoming payments and forecast."
          primary={{ href: '/dashboard', label: 'View dashboard' }}
          secondary={[{ href: '/bills/new', label: 'Add another bill' }]}
        />
      ) : null}

      <ObligationTotals metrics={metrics} />

      <ObligationList
        obligations={display.items}
        emptyTitle="No bills yet"
        emptyDescription="Add your first bill to track upcoming payments."
        newHref="/bills/new"
        newLabel="Add your first bill"
      />
      <ObligationPagination page={page} hasNext={display.hasNext} href="/bills" />
    </div>
  );
}
