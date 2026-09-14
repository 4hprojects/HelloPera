import type { Metadata } from 'next';
import Link from 'next/link';
import { appUrl } from '@/lib/env';
import { Card, CardTitle, IconChip } from '@/components/ui/card';
import { Icon } from '@/components/icons';
import { buttonClass } from '@/components/ui/button';
import { Terraces } from '@/components/brand/terraces';
import { LeafMark } from '@/components/brand/motifs';
import { BRAND } from '@/lib/constants/brand';
import { publishedGuides } from '@/lib/content/registry';

export const metadata: Metadata = {
  alternates: { canonical: `${appUrl()}/` },
};

/**
 * The landing page — PHASE-10 §12, §13, §36.
 *
 * §13 asks the hero to say what HelloPera is for rather than what it is. The
 * sections below follow the order a sceptical visitor actually asks in: what
 * is this, why do I need it, how does it work, what do I get, can I trust you.
 *
 * Illustration is inline SVG (`Terraces`, `LeafMark`) — no raster hero, and no
 * screenshot of the dashboard. A mockup presented as a product shot would be
 * showing invented balances as if they were real.
 *
 * The page is fully static: nothing here reads a request, which matters
 * because it is the most-crawled route on the site.
 */

/** §12 — the three things the product actually does. */
const PILLARS = [
  {
    icon: 'capture' as const,
    tone: 'primary' as const,
    title: 'Capture',
    body: 'Photograph a receipt or screenshot a payment. HelloPera reads it and shows you what it found — nothing is recorded until you say so.',
  },
  {
    icon: 'accounts' as const,
    tone: 'success' as const,
    title: 'Track',
    body: 'Cash, bank, GCash, Maya and credit cards, with bills and receivables kept separate from the transactions that settle them.',
  },
  {
    icon: 'analytics' as const,
    tone: 'gold' as const,
    title: 'Understand',
    body: 'Where the money went, what is due, who owes you, and where your balance is heading over the next 30 days.',
  },
];

/** The problems, in the words people actually use. */
const PROBLEMS = [
  'Money is in four places and none of them agree',
  'A bill arrives that you meant to set aside for',
  'Someone owes you and you have stopped remembering how much',
  'The month ends and you cannot say where it went',
];

const STEPS = [
  {
    n: '01',
    title: 'Add where your money is',
    body: 'Cash, bank, e-wallet, credit card. Set each balance to what it holds today — that one step is what makes every later total trustworthy.',
  },
  {
    n: '02',
    title: 'Record as you go',
    body: 'Four things: how much, when, which account, roughly what for. Snap the receipt if you have it, skip it if you do not.',
  },
  {
    n: '03',
    title: 'Look once a month',
    body: 'What came in, what went out, and which two categories surprised you. That last one is the part that changes anything.',
  },
];

export default function HomePage() {
  const guides = publishedGuides().slice(0, 3);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND.name,
    url: appUrl(),
    description: BRAND.description,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ---------------------------------------------------------------- */}
      {/* Hero */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden border-b border-border">
        <Terraces />
        <div className="relative mx-auto max-w-5xl px-4 py-16 sm:py-24">
          <p className="hp-label text-on-hero-muted">
            Personal finance, Philippines-first
          </p>
          <h1 className="hp-display mt-3 max-w-2xl text-on-hero">{BRAND.taglineLong}</h1>
          <p className="hp-body mt-4 max-w-xl text-on-hero-muted">
            Track cash, e-wallets, bills and the people who owe you — in one place,
            without handing over a single bank password.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className={buttonClass('primary', 'lg')}>
              Create a free account
            </Link>
            <Link href="/features" className={buttonClass('ghost', 'lg')}>
              See what it does
            </Link>
          </div>
          <p className="hp-small mt-4 text-on-hero-muted">
            Free to use. No bank connection. No card required.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* The problem */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="hp-h1 text-text">You already know where it goes wrong</h2>
            <p className="hp-body mt-3 text-text-muted">
              Most tools assume your money lives in a bank account they can log into. Here
              it lives in a wallet, an e-wallet, a card, and a friend who will pay you
              back on Friday.
            </p>
          </div>
          <ul className="divide-y divide-border border-l border-border pl-6">
            {PROBLEMS.map((problem) => (
              <li key={problem} className="flex items-start gap-3 py-3.5">
                <LeafMark size={16} className="mt-1" />
                <span className="hp-body text-text">{problem}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* What it does */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="hp-h1 text-text">{BRAND.promise}</h2>
          <p className="hp-body mt-2 text-text-muted">{BRAND.promiseSub}</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {PILLARS.map((pillar) => (
              <Card key={pillar.title}>
                <IconChip tone={pillar.tone} size={38}>
                  <Icon name={pillar.icon} size={19} />
                </IconChip>
                <CardTitle className="mt-3">{pillar.title}</CardTitle>
                <p className="hp-body mt-2 text-text-muted">{pillar.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* How it works */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="hp-h1 text-text">Getting started takes an evening</h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n}>
              {/* The number is decorative; the heading carries the order. */}
              <span aria-hidden="true" className="hp-label text-primary-text">
                {step.n}
              </span>
              <h3 className="hp-h3 mt-2 text-text">{step.title}</h3>
              <p className="hp-body mt-2 text-text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Guides — §36 internal linking to content that already exists */}
      {/* ---------------------------------------------------------------- */}
      {guides.length > 0 ? (
        <section className="border-y border-border bg-surface">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="hp-h1 text-text">Learn the habit, not just the app</h2>
              <Link href="/guides" className="hp-body text-primary-text underline">
                All guides
              </Link>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {guides.map((guide) => (
                <Link
                  key={guide.slug}
                  href={`/guides/${guide.slug}`}
                  className="rounded-[var(--radius-hp)] border border-border p-4 transition-colors hover:bg-surface-muted"
                >
                  <h3 className="hp-h3 text-text">{guide.title}</h3>
                  <p className="hp-body mt-2 text-text-muted">{guide.excerpt}</p>
                  <p className="hp-small mt-3 text-text-muted">
                    {guide.readingMinutes} min read
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Trust — the objections a finance app has to answer out loud */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="hp-h1 text-text">What HelloPera will not do</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            [
              'Never asks for bank credentials',
              'No e-wallet passwords, no government IDs. You record what happened; HelloPera keeps it in order.',
            ],
            [
              'Never moves your money',
              'It is a record, not a bank. Nothing here pays a bill or transfers funds.',
            ],
            [
              'Never guesses at a number',
              'Extracted receipt details are a suggestion until you confirm them, and currencies are never converted.',
            ],
            [
              'Never sells your records',
              'Your financial data is not shared with advertisers or used to target an advertisement.',
            ],
          ].map(([title, body]) => (
            <div key={title} className="rounded-[var(--radius-hp)] bg-surface-muted p-4">
              <h3 className="hp-h3 text-text">{title}</h3>
              <p className="hp-body mt-1.5 text-text-muted">{body}</p>
            </div>
          ))}
        </div>
        <p className="hp-small mt-4 text-text-muted">
          You can export everything, or delete your account and its files, at any time.{' '}
          <Link href="/privacy" className="text-primary-text underline">
            How we handle your data
          </Link>
          .
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Closing CTA */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-t border-border bg-sand">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center">
          <LeafMark size={28} className="mx-auto" />
          <h2 className="hp-h1 mt-4 text-on-sand">{BRAND.motto}</h2>
          <p className="hp-body mx-auto mt-3 max-w-md text-on-sand">
            Start with one account and this month&rsquo;s spending. That is enough to see
            the shape of it.
          </p>
          <Link
            href="/register"
            className={`${buttonClass('primary', 'lg')} mt-7 inline-flex`}
          >
            Create a free account
          </Link>
        </div>
      </section>
    </>
  );
}
