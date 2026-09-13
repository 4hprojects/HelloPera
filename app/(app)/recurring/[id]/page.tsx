import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardLabel, SectionCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { RuleActions } from '@/components/forecast/rule-actions';
import { OccurrenceList } from '@/components/forecast/occurrence-list';
import { requireUser } from '@/lib/auth/guards';
import { todayInTimezone } from '@/lib/finance/obligation';
import { formatMoney } from '@/lib/money';
import { getRule } from '@/services/recurring-rule.service';
import { listEventsForRule } from '@/services/expected-event.service';
import type { RuleStatus } from '@/types/recurring';
import type { RuleType } from '@/schemas/recurring.schema';

export const metadata: Metadata = { title: 'Recurring rule' };

const STATUS: Record<
  RuleStatus,
  { label: string; tone: 'success' | 'warning' | 'neutral' }
> = {
  active: { label: 'Active', tone: 'success' },
  paused: { label: 'Paused', tone: 'warning' },
  ended: { label: 'Ended', tone: 'neutral' },
};

const TYPE_LABEL: Record<RuleType, string> = {
  income: 'Income',
  expense: 'Expense',
  bill: 'Bill',
  expected_income: 'Expected income',
};

/**
 * §50 — /recurring/[id].
 *
 * A rule created before Phase 03's bills existed still shows its history, so
 * the occurrence list is the rule's audit trail as much as its schedule.
 */
export default async function RecurringRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireUser();
  const today = todayInTimezone(profile.timezone);

  const rule = await getRule(id, today);
  // RLS already scoped the read, so "not yours" and "does not exist" arrive
  // identically — which is the correct amount to tell someone either way.
  if (!rule) notFound();

  const events = await listEventsForRule(id);
  const status = STATUS[rule.status];

  const generatesNatively =
    rule.ruleType === 'bill' || rule.ruleType === 'expected_income';

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={rule.name}
        description={`${TYPE_LABEL[rule.ruleType]} · ${rule.cadence}`}
        actions={
          <Link href="/recurring" className={buttonClass('ghost', 'sm')}>
            All rules
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardLabel>Amount</CardLabel>
          <p className="hp-h2 mt-1 text-text">{formatMoney(rule.amount)}</p>
        </Card>
        <Card>
          <CardLabel>Next occurrence</CardLabel>
          <p className="hp-h2 mt-1 text-text">
            {rule.status === 'active' && rule.nextOccurrenceDate
              ? rule.nextOccurrenceDate
              : '—'}
          </p>
          {rule.endDate ? (
            <p className="mt-1 text-xs text-text-muted">Ends {rule.endDate}</p>
          ) : null}
        </Card>
        <Card>
          <CardLabel>Status</CardLabel>
          <div className="mt-2">
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="mt-2 text-xs text-text-muted">Started {rule.startDate}</p>
        </Card>
      </div>

      <SectionCard title="Manage" className="mb-4">
        <RuleActions id={rule.id} status={rule.status} />
        <p className="hp-small mt-3 text-text-muted">
          {/* §21 — pausing keeps what has already been generated. */}
          Pausing stops new occurrences from being created. Ones already created stay
          until you skip them individually.
        </p>
      </SectionCard>

      <SectionCard title="Occurrences">
        {generatesNatively ? (
          <p className="hp-body mb-3 text-text-muted">
            This rule creates{' '}
            {rule.ruleType === 'bill' ? (
              <Link href="/bills" className="text-primary-text underline">
                real bills
              </Link>
            ) : (
              <Link href="/expected-income" className="text-primary-text underline">
                expected-income records
              </Link>
            )}
            , which then follow their normal lifecycle.
          </p>
        ) : null}
        <OccurrenceList events={events} />
      </SectionCard>
    </div>
  );
}
