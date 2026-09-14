import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/card';
import { requireAdmin } from '@/lib/auth/guards';
import { getMonetizationOverview } from '@/services/admin-monetization.service';
import { currentPeriod } from '@/lib/monetization/periods';

export const metadata: Metadata = { title: 'Usage · Admin' };

/**
 * /admin/usage — PHASE-13 §20 to §22.
 *
 * Aggregate only: how much metered work happened, by nobody in particular.
 * Per-user usage and its adjustments live on the user's own admin page, which
 * is where an operator is already looking when that question arises — and
 * keeping it there means this page never needs to join usage to an identity.
 */
export default async function AdminUsagePage() {
  await requireAdmin();

  // The platform's own month. Per-user periods are in the user's timezone
  // (Phase 09 §16); this is an operator's view, so it uses one clock.
  const period = currentPeriod('Asia/Manila');
  const overview = await getMonetizationOverview(period.start);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Usage"
        description={`Metered work since ${period.start}. Aggregate figures only.`}
      />

      <SectionCard title="This period">
        {overview.usageThisPeriod.length === 0 ? (
          <p className="hp-small text-text-muted">Nothing metered yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {overview.usageThisPeriod.map((row) => (
              <li
                key={row.feature}
                className="flex items-baseline justify-between gap-3 py-2"
              >
                <span className="hp-small min-w-0 text-text-muted">{row.feature}</span>
                <span className="hp-small shrink-0 tabular-nums text-text">
                  {row.total} across {row.users} user{row.users === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <p className="hp-small mt-4 text-text-muted">
        To credit or debit one person, open their account under Users. An adjustment is
        recorded as its own row — usage history is never edited.
      </p>
    </div>
  );
}
