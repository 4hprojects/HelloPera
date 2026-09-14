import type { Metadata } from 'next';
import { Card, CardLabel, SectionCard } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { requireAdmin } from '@/lib/auth/guards';
import { currentPeriod } from '@/lib/monetization/periods';
import { getMonetizationOverview } from '@/services/admin-monetization.service';

export const metadata: Metadata = { title: 'Admin — Monetization' };

/**
 * /admin/subscriptions — PHASE-09 §44, §48, criterion 18.
 *
 * Operational monetization data and nothing else. §48: "Admin should not use
 * monetization role to access private financial content." Everything on this
 * page is a count or a configuration value — there is no route from here to a
 * balance, a transaction or a receipt, and that is deliberate rather than
 * merely unimplemented.
 *
 * §45 keeps entitlement editing out of the UI for now: changing an entitlement
 * changes every user on that plan at once, so it stays migration-driven until
 * there is an audited admin action worth trusting with it.
 */
export default async function AdminSubscriptionsPage() {
  await requireAdmin();

  // Admin operates on the platform's own clock; per-user periods are the
  // user's timezone, but an operational rollup is not per-user.
  const period = currentPeriod('Asia/Manila');
  const overview = await getMonetizationOverview(period.start);

  const totalSubs = overview.subscriptionsByStatus.reduce((n, s) => n + s.count, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Monetization"
        description="Operational counts and configuration. No user financial data is shown here, by design."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardLabel>Subscriptions</CardLabel>
          <p className="hp-amount hp-amount-lg mt-1.5 text-text">{totalSubs}</p>
        </Card>
        <Card>
          <CardLabel>Unprocessed events</CardLabel>
          <p className="hp-amount hp-amount-lg mt-1.5 text-text">
            {overview.unprocessedEvents}
          </p>
        </Card>
        <Card>
          <CardLabel>Period</CardLabel>
          <p className="hp-body mt-1.5 text-text">{period.start}</p>
        </Card>
        <Card>
          <CardLabel>Billing</CardLabel>
          <div className="mt-2">
            <Badge
              tone={
                overview.flags.find((f) => f.key === 'billing_enabled')?.enabled
                  ? 'success'
                  : 'neutral'
              }
            >
              {overview.flags.find((f) => f.key === 'billing_enabled')?.enabled
                ? 'Enabled'
                : 'Disabled'}
            </Badge>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Plans">
          <ul className="divide-y divide-border">
            {overview.planCounts.map((p) => (
              <li key={p.code} className="flex justify-between gap-3 py-2.5">
                <span className="hp-body text-text">{p.name}</span>
                <span className="hp-body text-text-muted">
                  {p.subscribers} {p.subscribers === 1 ? 'subscriber' : 'subscribers'}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Feature flags">
          <ul className="divide-y divide-border">
            {overview.flags.map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-3 py-2.5">
                <span className="hp-body font-mono text-sm text-text">{f.key}</span>
                <Badge tone={f.enabled ? 'success' : 'neutral'}>
                  {f.enabled ? 'On' : 'Off'}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="hp-small mt-3 text-text-muted">
            Flags and entitlements are migration-driven for now (§45) — one edit here
            would change every user on a plan at once.
          </p>
        </SectionCard>

        <SectionCard title="Subscriptions by status">
          {overview.subscriptionsByStatus.length === 0 ? (
            <p className="hp-body text-text-muted">No subscription rows yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {overview.subscriptionsByStatus.map((s) => (
                <li key={s.status} className="flex justify-between gap-3 py-2.5">
                  <span className="hp-body text-text">{s.status}</span>
                  <span className="hp-body text-text-muted">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Metered usage this period">
          {overview.usageThisPeriod.length === 0 ? (
            <p className="hp-body text-text-muted">No metered usage recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {overview.usageThisPeriod.map((u) => (
                <li key={u.feature} className="flex justify-between gap-3 py-2.5">
                  <span className="hp-body text-text">{u.feature}</span>
                  <span className="hp-body text-text-muted">
                    {u.total} across {u.users} {u.users === 1 ? 'user' : 'users'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
