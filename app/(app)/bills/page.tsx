import type { Metadata } from 'next';
import Link from 'next/link';
import { ObligationTotals } from '@/components/finance/obligation-totals';
import { PageHeader } from '@/components/ui/page-header';
import { ObligationList } from '@/components/finance/obligation-list';
import { requireUser } from '@/lib/auth/guards';
import { todayInTimezone } from '@/lib/finance/obligation';
import { obligationMetrics } from '@/lib/analytics/obligations';
import { listObligations } from '@/services/obligation.service';
import { buttonClass } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Bills' };

export default async function BillsPage() {
  const { profile } = await requireUser();
  const today = todayInTimezone(profile.timezone);
  const bills = await listObligations('bill', today);

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

      <ObligationTotals metrics={metrics} />

      <ObligationList
        obligations={bills}
        emptyTitle="No bills yet"
        emptyDescription="Add your first bill to track upcoming payments."
        newHref="/bills/new"
        newLabel="Add your first bill"
      />
    </div>
  );
}
