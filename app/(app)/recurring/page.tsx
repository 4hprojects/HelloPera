import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/button';
import { RuleList } from '@/components/forecast/rule-list';
import { GenerateButton } from '@/components/forecast/generate-button';
import { requireUser } from '@/lib/auth/guards';
import { todayInTimezone } from '@/lib/finance/obligation';
import { listRules } from '@/services/recurring-rule.service';

export const metadata: Metadata = { title: 'Recurring' };

/** §48 — /recurring. */
export default async function RecurringPage() {
  const { profile } = await requireUser();
  const today = todayInTimezone(profile.timezone);
  const rules = await listRules(today);

  const active = rules.filter((r) => r.status === 'active');
  const inactive = rules.filter((r) => r.status !== 'active');

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Recurring"
        description="Rules that create future bills, income and expected events. They never move a balance on their own."
        actions={
          <Link href="/recurring/new" className={buttonClass('primary', 'sm')}>
            Add rule
          </Link>
        }
      />

      <SectionCard title="Active" className="mb-4" action={<GenerateButton />}>
        <RuleList rules={active} />
      </SectionCard>

      {inactive.length ? (
        <SectionCard title="Paused and ended">
          <RuleList rules={inactive} />
        </SectionCard>
      ) : null}
    </div>
  );
}
