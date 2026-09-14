import type { Metadata } from 'next';
import Link from 'next/link';
import { appUrl } from '@/lib/env';
import { BRAND } from '@/lib/constants/brand';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Common questions about HelloPera — cost, bank connections, document reading, data ownership and deletion.',
  alternates: { canonical: `${appUrl()}/faq` },
};

/**
 * /faq — PHASE-10 §18, §34.
 *
 * §34 permits `FAQPage` structured data, and this is a genuine case for it:
 * every question below is really on the page, with its real answer. Marking up
 * questions that are not visible is the misuse Google penalises.
 */
const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'How much does HelloPera cost?',
    a: 'HelloPera is free to use, and the free plan is meant to be genuinely useful rather than a trial with the important parts removed. A paid plan with higher document-scanning limits and a longer forecast is planned, but there is nothing to buy today.',
  },
  {
    q: 'Does HelloPera connect to my bank?',
    a: 'No. You record what happened yourself. That is deliberate: it means HelloPera works for cash, e-wallets and money owed to you by other people, which bank connections cannot see.',
  },
  {
    q: 'What happens when I upload a receipt?',
    a: 'It is stored, and nothing else happens until you ask HelloPera to read it. When you do, the file is sent to Anthropic to extract the details, and the result is shown to you as a suggestion. Nothing becomes a financial record until you confirm it.',
  },
  {
    q: 'Can I get my data out?',
    a: 'Yes, at any time, as CSV or JSON, from your settings. It includes your accounts, transactions, bills, receivables, expected income, categories and recurring rules.',
  },
  {
    q: 'Can I delete everything?',
    a: 'Yes. Deleting your account removes your profile, all your financial records and every file you uploaded. We keep one dated note that a deletion happened, with no financial information attached.',
  },
  {
    q: 'Does HelloPera handle more than one currency?',
    a: 'It stores each account in its own currency and reports each currency separately. It never converts between them, because an exchange rate applied to a balance would be an invented number in a place people act on numbers.',
  },
  {
    q: 'Is my data used for advertising?',
    a: 'No. Your financial records are never shared with advertisers or used to target an advertisement. HelloPera does not currently show advertising at all.',
  },
  {
    q: 'Does HelloPera give financial advice?',
    a: 'No. It records what you tell it and does arithmetic on it. Forecasts and summaries are calculations, shown with their inputs, not recommendations.',
  },
];

export default function FaqPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1 className="hp-h1 text-text">Frequently asked questions</h1>
      <p className="hp-body mt-3 text-text-muted">
        Short answers about how {BRAND.name} works.
      </p>

      <dl className="mt-8 divide-y divide-border">
        {FAQS.map((item) => (
          <div key={item.q} className="py-5">
            <dt className="hp-h3 text-text">{item.q}</dt>
            <dd className="hp-body mt-2 text-text-muted">{item.a}</dd>
          </div>
        ))}
      </dl>

      <p className="hp-body mt-8 text-text-muted">
        Something not answered here?{' '}
        <Link href="/contact" className="text-primary-text underline">
          Get in touch
        </Link>
        .
      </p>
    </div>
  );
}
