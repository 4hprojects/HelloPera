import type { Metadata } from 'next';
import Link from 'next/link';
import { appUrl } from '@/lib/env';
import { publishedGuides } from '@/lib/content/registry';

export const metadata: Metadata = {
  title: 'Help',
  description:
    'Getting started with HelloPera — setting up accounts, recording money, and where to go when something looks wrong.',
  alternates: { canonical: `${appUrl()}/help` },
};

/**
 * /help — PHASE-10 §17, §36.
 *
 * A hub rather than a knowledge base. §36 wants real internal linking, and the
 * honest structure for a product this size is: here is how to start, here are
 * the guides, here is how to reach a person.
 */
const STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Add your accounts first',
    body: 'List the places your money actually sits — bank, cash, e-wallet, credit card — and set each opening balance to what it holds today. Every later total depends on getting this right once.',
  },
  {
    title: 'Record money as it moves',
    body: 'Four things: how much, when, which account, and roughly what for. If you have a receipt you can attach it, but never let a missing receipt stop you recording that the money moved.',
  },
  {
    title: 'Keep bills separate from payments',
    body: 'Add what you owe with its due date. It stays an obligation until you record the payment, at which point the two are linked and the balance moves.',
  },
  {
    title: 'Review once a month',
    body: 'Look at what came in, what went out, and which categories were larger than expected. Daily totals tell you very little; monthly ones change behaviour.',
  },
];

export default function HelpPage() {
  const guides = publishedGuides().slice(0, 4);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="hp-h1 text-text">Help</h1>
      <p className="hp-body mt-3 text-text-muted">
        How to get set up, and where to look when something does not add up.
      </p>

      <h2 className="hp-h2 mt-10 text-text">Getting started</h2>
      <ol className="mt-4 space-y-5">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-wash text-sm font-semibold text-primary-text"
            >
              {i + 1}
            </span>
            <div>
              <h3 className="hp-h3 text-text">{step.title}</h3>
              <p className="hp-body mt-1 text-text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="hp-h2 mt-10 text-text">Guides</h2>
      <ul className="mt-3 divide-y divide-border">
        {guides.map((guide) => (
          <li key={guide.slug}>
            <Link
              href={`/guides/${guide.slug}`}
              className="block rounded-[var(--radius-hp)] py-3 transition-colors hover:bg-surface-raised"
            >
              <span className="hp-body font-medium text-text">{guide.title}</span>
              <span className="hp-small mt-0.5 block text-text-muted">
                {guide.excerpt}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/guides"
        className="hp-body mt-4 inline-block text-primary-text underline"
      >
        All guides
      </Link>

      <h2 className="hp-h2 mt-10 text-text">When something looks wrong</h2>
      <p className="hp-body mt-3 text-text-muted">
        If a balance does not match reality, the usual cause is a transfer recorded as an
        expense, or a missing transaction. Check the account&rsquo;s recent activity
        first, and record an adjustment for any difference you cannot trace — an accurate
        balance from today is more useful than an unexplained gap.
      </p>
      <p className="hp-body mt-3 text-text-muted">
        Still stuck?{' '}
        <Link href="/contact" className="text-primary-text underline">
          Contact us
        </Link>
        , or read the{' '}
        <Link href="/faq" className="text-primary-text underline">
          FAQ
        </Link>
        .
      </p>
    </div>
  );
}
