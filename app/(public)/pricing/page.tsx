import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'HelloPera is free to use. Premium is coming soon.',
};

/**
 * /pricing — PHASE-09 §36.
 *
 * "Show only approved pricing once finalized. Until then: Premium pricing
 * coming soon."
 *
 * So this page states what Free actually includes — which is true and useful
 * today — and says plainly that Premium is not yet purchasable. No invented
 * numbers, no fake "was/now", no countdown. Phase 10 owns the marketing
 * version of this page and will consume the same plan data.
 */
const FREE_INCLUDES = [
  'Unlimited accounts and transactions',
  'Bills, receivables and expected income',
  'Dashboard, spending breakdowns and cash flow',
  'Recurring rules and a 30-day forecast',
  '30 document scans a month',
  'Reminders for what is due',
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="hp-h1 text-text">Pricing</h1>
      <p className="hp-body mt-3 text-text-muted">
        HelloPera is free to use, and the free plan is meant to be genuinely useful rather
        than a trial with the important parts removed.
      </p>

      <div className="mt-8 rounded-[var(--radius-hp)] border border-border bg-surface p-6">
        <h2 className="hp-h3 text-text">Free</h2>
        <p className="hp-body mt-1 text-text-muted">
          Everything you need to track your money by hand.
        </p>
        <ul className="mt-4 space-y-2">
          {FREE_INCLUDES.map((item) => (
            <li key={item} className="hp-body text-text">
              {item}
            </li>
          ))}
        </ul>
        <Link href="/register" className={`${buttonClass('primary')} mt-6 inline-flex`}>
          Get started
        </Link>
      </div>

      <div className="mt-6 rounded-[var(--radius-hp)] border border-dashed border-border-strong p-6">
        <h2 className="hp-h3 text-text">Premium</h2>
        <p className="hp-body mt-1 text-text-muted">
          Higher scan limits, a 90-day forecast and no ads.
        </p>
        <p className="hp-body mt-4 font-medium text-text">Pricing coming soon.</p>
        <p className="hp-small mt-1 text-text-muted">
          There is nothing to buy yet, and nothing in HelloPera is behind a payment today.
        </p>
      </div>
    </div>
  );
}
