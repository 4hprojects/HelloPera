import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Card, SectionCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { UsageMeter } from '@/components/monetization/usage-meter';
import { requireUser } from '@/lib/auth/guards';
import { getEffectivePlan, listPublicPlans } from '@/services/plan.service';
import { getUsageSummary } from '@/services/usage.service';

export const metadata: Metadata = { title: 'Plan and usage' };

/**
 * /settings/plan — PHASE-09 §35, §34, §52.
 *
 * Shows the plan, what it includes, and this month's usage. There is no
 * checkout: §3 puts real payment in Phase 11, and an upgrade button that
 * cannot charge anyone is worse than none.
 */
export default async function PlanPage() {
  const { user, profile } = await requireUser();

  const [effective, usage, plans] = await Promise.all([
    getEffectivePlan(user.id),
    getUsageSummary(user.id, profile.timezone),
    listPublicPlans(),
  ]);

  const { plan, entitlements, subscription, billingEnabled } = effective;
  const premium = plans.find((p) => p.code === 'premium');
  const isPremium = plan.code === 'premium';

  const resets = new Date(`${usage.resetsOn}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Plan and usage"
        description="What your plan includes, and what you have used this month."
        actions={
          <>
            {/*
              §66 — a page nobody can reach is a page that does not exist. This
              is the only route to /settings/billing, and it appears only when
              billing is on, which is also when that page stops 404ing.
            */}
            {billingEnabled ? (
              <Link href="/settings/billing" className={buttonClass('ghost', 'sm')}>
                Billing
              </Link>
            ) : null}
            <Link href="/settings" className={buttonClass('ghost', 'sm')}>
              Settings
            </Link>
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="hp-label text-text-muted">Current plan</p>
            <p className="hp-h2 mt-1 text-text">{plan.name}</p>
          </div>
          {isPremium ? <Badge tone="gold">Premium</Badge> : null}
        </div>
        {plan.description ? (
          <p className="hp-body mt-2 text-text-muted">{plan.description}</p>
        ) : null}

        {/* §43 — a cancellation that has not taken effect yet is worth saying
            plainly, so the date is not a surprise. */}
        {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd ? (
          <p className="hp-small mt-3 text-text-muted">
            Your plan ends on{' '}
            {new Date(subscription.currentPeriodEnd).toLocaleDateString()}. Until then
            nothing changes.
          </p>
        ) : null}
      </Card>

      <SectionCard title="This month" className="mb-4">
        <div className="divide-y divide-border">
          {usage.features.map((f) => (
            <UsageMeter key={f.feature} state={f} />
          ))}
        </div>
        <p className="hp-small mt-3 text-text-muted">Resets on {resets}.</p>
      </SectionCard>

      <SectionCard title="What your plan includes" className="mb-4">
        <ul className="divide-y divide-border">
          <Row label="Document scans" value={`${entitlements.ocrMonthlyLimit} a month`} />
          <Row
            label="Forecast"
            value={`Up to ${entitlements.forecastHorizonDays} days ahead`}
          />
          <Row
            label="Document history"
            value={`${entitlements.documentRetentionDays} days`}
          />
          <Row
            label="Advanced analytics"
            value={entitlements.advancedAnalytics ? 'Included' : 'Not included'}
          />
          <Row
            label="Export"
            value={entitlements.exportEnabled ? 'Included' : 'Not included'}
          />
          <Row label="Ads" value={entitlements.adsShown ? 'Shown' : 'No ads'} />
        </ul>
      </SectionCard>

      {/*
        §52 — every upgrade surface disappears while billing is disabled.
        Showing "Upgrade" with no provider behind it teaches people the button
        does not work, which is expensive to undo.
      */}
      {billingEnabled && !isPremium && premium ? (
        <SectionCard title="Premium">
          <p className="hp-body text-text-muted">{premium.description}</p>
          <ul className="mt-3 divide-y divide-border">
            <Row
              label="Document scans"
              value={`${premium.entitlements.ocrMonthlyLimit} a month`}
            />
            <Row
              label="Forecast"
              value={`Up to ${premium.entitlements.forecastHorizonDays} days ahead`}
            />
            <Row label="Ads" value="None" />
          </ul>
          {/* §36 — no invented prices. */}
          <p className="hp-small mt-4 text-text-muted">
            Premium pricing is coming soon. There is nothing to pay yet.
          </p>
        </SectionCard>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="hp-body text-text-muted">{label}</span>
      <span className="hp-body font-medium text-text">{value}</span>
    </li>
  );
}
