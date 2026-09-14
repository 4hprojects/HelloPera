import type { Metadata } from 'next';
import Link from 'next/link';
import { appUrl } from '@/lib/env';
import { guideCategories, publishedGuides } from '@/lib/content/registry';

export const metadata: Metadata = {
  title: 'Guides',
  description:
    'Practical guides to tracking your money — expenses, bills, receivables and cash flow, written for everyday use.',
  alternates: { canonical: `${appUrl()}/guides` },
};

/**
 * /guides — PHASE-10 §19, §36.
 *
 * Reads `publishedGuides()`, which is the only list the public site may use;
 * drafts are excluded there rather than filtered here (criterion 5).
 */
export default function GuidesPage() {
  const guides = publishedGuides();
  const categories = guideCategories();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="hp-h1 text-text">Guides</h1>
      <p className="hp-body mt-3 text-text-muted">
        How to keep track of your money in practice — what to record, what to ignore, and
        what to do when you fall behind.
      </p>

      {categories.map((category) => (
        <section key={category} className="mt-10">
          <h2 className="hp-label text-text-muted">{category}</h2>
          <ul className="mt-3 divide-y divide-border">
            {guides
              .filter((g) => g.category === category)
              .map((guide) => (
                <li key={guide.slug}>
                  <Link
                    href={`/guides/${guide.slug}`}
                    className="block rounded-[var(--radius-hp)] py-4 transition-colors hover:bg-surface-raised"
                  >
                    <h3 className="hp-h3 text-text">{guide.title}</h3>
                    <p className="hp-body mt-1 text-text-muted">{guide.excerpt}</p>
                    <p className="hp-small mt-2 text-text-muted">
                      {guide.readingMinutes} min read
                    </p>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
