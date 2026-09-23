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

export const metadata: Metadata = { title: 'Receivables' };

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; page?: string }>;
}) {
  const { profile } = await requireUser();
  const { created, page: rawPage } = await searchParams;
  const page = Math.max(1, Math.min(4000, Number.parseInt(rawPage ?? '1', 10) || 1));
  const today = todayInTimezone(profile.timezone);
  const [items, display] = await Promise.all([
    listObligations('receivable', today),
    listObligationPage('receivable', today, page),
  ]);
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
      {created === '1' ? (
        <SuccessNextSteps
          title="Receivable added"
          description="You can track what remains and record the payment when it arrives."
          primary={{ href: '/dashboard', label: 'View dashboard' }}
          secondary={[{ href: '/receivables/new', label: 'Add another receivable' }]}
        />
      ) : null}
      <ObligationTotals metrics={metrics} overdueLabel="Overdue" />
      <ObligationList
        obligations={display.items}
        emptyTitle="No receivables yet"
        emptyDescription="Track money that people or clients owe you."
        newHref="/receivables/new"
        newLabel="Add your first receivable"
      />
      <ObligationPagination page={page} hasNext={display.hasNext} href="/receivables" />
    </div>
  );
}
