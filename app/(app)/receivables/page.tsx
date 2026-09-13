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

export const metadata: Metadata = { title: 'Receivables' };

export default async function ReceivablesPage() {
  const { profile } = await requireUser();
  const today = todayInTimezone(profile.timezone);
  const items = await listObligations('receivable', today);
  // §8, §29 — grouped per currency, never combined into one figure.
  const metrics = obligationMetrics(
    items.map((r) => ({
      currency: r.currency,
      remaining: r.remaining,
      applied: r.applied,
      date: r.date,
      display: r.display,
    })),
    profile.default_currency,
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Receivables"
        description="Money owed to you. It becomes income only when it actually arrives."
        actions={
          <Link href="/receivables/new" className={buttonClass('primary', 'sm')}>
            Add
          </Link>
        }
      />
      <ObligationTotals metrics={metrics} overdueLabel="Overdue" />
      <ObligationList
        obligations={items}
        emptyTitle="No receivables yet"
        emptyDescription="Track money that people or clients owe you."
        newHref="/receivables/new"
        newLabel="Add your first receivable"
      />
    </div>
  );
}
