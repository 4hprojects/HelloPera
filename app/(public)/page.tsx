import type { Metadata } from 'next';
import { appUrl } from '@/lib/env';
import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui/card';
import { BRAND } from '@/lib/constants/brand';
import { buttonClass } from '@/components/ui/button';

const pillars = [
  {
    title: 'Capture',
    body: 'Photograph a receipt or screenshot a payment. Nothing becomes official until you confirm it.',
  },
  {
    title: 'Track',
    body: 'Accounts, bills, receivables and expected income stay separate from the transactions that settle them.',
  },
  {
    title: 'Forecast',
    body: 'See what is due, what is owed to you, and where your balance is heading.',
  },
];

export const metadata: Metadata = {
  // §30 — the home page needs an explicit canonical too: without one,
  // a link carrying a tracking parameter becomes a second indexable
  // copy of the same page.
  alternates: { canonical: `${appUrl()}/` },
};

export default function HomePage() {
  /**
   * §34 — structured data only where it is valid.
   *
   * Organization is the one type a homepage can assert honestly: a name, a URL
   * and a description that are all true. No aggregateRating, no founder, no
   * address — inventing those to fill a schema is what turns structured data
   * into a manual action rather than a rich result.
   */
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
      <section className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
        <p className="hp-label text-primary-text">Personal finance, Philippines-first</p>
        <h1 className="hp-display mt-3 max-w-2xl text-text">{BRAND.tagline}</h1>
        <p className="hp-body mt-4 max-w-xl text-text-muted">{BRAND.description}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/register" className={buttonClass('primary', 'lg')}>
            Create an account
          </Link>
          <Link href="/features" className={buttonClass('ghost', 'lg')}>
            See features
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {pillars.map((p) => (
            <Card key={p.title}>
              <CardTitle>{p.title}</CardTitle>
              <p className="hp-body mt-2 text-text-muted">{p.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
