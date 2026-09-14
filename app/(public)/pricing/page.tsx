import type { Metadata } from 'next';
import Link from 'next/link';
import { appUrl } from '@/lib/env';
import { buttonClass } from '@/components/ui/button';
import { listPublicPlanSummaries } from '@/services/plan-catalog.service';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'HelloPera is free to use. Premium is coming soon.',
  alternates: { canonical: `${appUrl()}/pricing` },
};

/**
 * /pricing — PHASE-10 §15, §36; PHASE-09 §36.
 *
 * Reads the real plan catalogue rather than a hardcoded list, so raising a
 * limit is a database change and this page cannot drift from what the product
 * actually enforces. Previously a `FREE_INCLUDES` array that nothing kept in
 * step with `plan_entitlements`.
 *
 * Read through the admin client (see the service) so the page stays **static**
 * and indexable — the session client reads cookies, which would make the whole
 * route dynamic and cost a database round trip on every crawl.
 *
 * §36 and PHASE-09 §36: no invented prices. Premium is described, and stated
 * as not yet purchasable, because it is not.
 */

/** Revalidate daily — plan entitlements change rarely, and never urgently. */
export const revalidate = 86_400;

function line(label: string, value: string) {
  return (
    <li key={label} className="flex justify-between gap-4 py-2">
      <span className="hp-body text-text-muted">{label}</span>
      <span className="hp-body font-medium text-text">{value}</span>
    </li>
  );
}

export default async function PricingPage() {
  const plans = await listPublicPlanSummaries();
  const free = plans.find((p) => p.code === 'free');
  const premium = plans.find((p) => p.code === 'premium');

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="hp-h1 text-text">Pricing</h1>
      <p className="hp-body mt-3 text-text-muted">
        HelloPera is free to use, and the free plan is meant to be genuinely useful rather
        than a trial with the important parts removed.
      </p>

      <div className="mt-8 rounded-[var(--radius-hp)] border border-border bg-surface p-6">
        <h2 className="hp-h3 text-text">{free?.name ?? 'Free'}</h2>
        <p className="hp-body mt-1 text-text-muted">
          {free?.description ?? 'Everything you need to track your money by hand.'}
        </p>

        <ul className="mt-4 divide-y divide-border">
          {line('Accounts and transactions', 'Unlimited')}
          {line('Bills, receivables and expected income', 'Unlimited')}
          {line(
            'Document scans',
            free ? `${free.entitlements.ocrMonthlyLimit} a month` : '30 a month',
          )}
          {line(
            'Forecast',
            free
              ? `${free.entitlements.forecastHorizonDays} days ahead`
              : '30 days ahead',
          )}
          {line(
            'Document history',
            free ? `${free.entitlements.documentRetentionDays} days` : '30 days',
          )}
        </ul>

        <Link href="/register" className={`${buttonClass('primary')} mt-6 inline-flex`}>
          Get started
        </Link>
      </div>

      <div className="mt-6 rounded-[var(--radius-hp)] border border-dashed border-border-strong p-6">
        <h2 className="hp-h3 text-text">{premium?.name ?? 'Premium'}</h2>
        <p className="hp-body mt-1 text-text-muted">
          {premium?.description ?? 'Higher limits, longer forecasts and no ads.'}
        </p>

        {premium ? (
          <ul className="mt-4 divide-y divide-border">
            {line('Document scans', `${premium.entitlements.ocrMonthlyLimit} a month`)}
            {line('Forecast', `${premium.entitlements.forecastHorizonDays} days ahead`)}
            {line(
              'Document history',
              `${premium.entitlements.documentRetentionDays} days`,
            )}
            {line('Ads', premium.entitlements.adsShown ? 'Shown' : 'None')}
          </ul>
        ) : null}

        <p className="hp-body mt-5 font-medium text-text">Pricing coming soon.</p>
        <p className="hp-small mt-1 text-text-muted">
          There is nothing to buy yet, and nothing in HelloPera is behind a payment today.
        </p>
      </div>

      <p className="hp-small mt-8 text-text-muted">
        Questions about what is included? See the{' '}
        <Link href="/faq" className="text-primary-text underline">
          FAQ
        </Link>
        .
      </p>
    </div>
  );
}
