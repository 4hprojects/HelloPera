import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { appUrl } from '@/lib/env';
import { BRAND } from '@/lib/constants/brand';
import { findPublishedGuide, publishedGuides } from '@/lib/content/registry';
import { getAdContext } from '@/lib/ads/server';
import { AdSlot } from '@/components/ads/ad-slot';

type Params = { params: Promise<{ slug: string }> };

/**
 * §82 — every published guide is prerendered, and only published ones.
 *
 * A draft has no entry here, so it is not built. Combined with
 * `findPublishedGuide` returning null, a draft URL 404s rather than rendering.
 */
export function generateStaticParams(): Array<{ slug: string }> {
  return publishedGuides().map((g) => ({ slug: g.slug }));
}

/** §28, §29, §30 — unique title, description and canonical per article. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const guide = findPublishedGuide(slug);
  if (!guide) return { title: 'Not found' };

  const description = guide.seoDescription ?? guide.excerpt;

  return {
    title: guide.seoTitle ?? guide.title,
    description,
    alternates: { canonical: `${appUrl()}/guides/${guide.slug}` },
    openGraph: {
      type: 'article',
      title: guide.title,
      description,
      publishedTime: guide.publishedAt,
      modifiedTime: guide.updatedAt,
      authors: [guide.author],
    },
  };
}

export default async function GuidePage({ params }: Params) {
  const { slug } = await params;
  const guide = findPublishedGuide(slug);

  // A draft and a missing slug answer identically — distinguishing them would
  // confirm an unpublished article exists at that URL.
  if (!guide) notFound();

  const published = new Date(`${guide.publishedAt}T00:00:00Z`).toLocaleDateString(
    'en-US',
    {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    },
  );

  /**
   * §34 — structured data ONLY where it is valid. Every field below is a real
   * value from the article; nothing is invented to satisfy a schema, which is
   * what turns structured data into a manual-action risk.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.seoDescription ?? guide.excerpt,
    datePublished: guide.publishedAt,
    ...(guide.updatedAt ? { dateModified: guide.updatedAt } : {}),
    author: { '@type': 'Organization', name: guide.author },
    publisher: { '@type': 'Organization', name: BRAND.name },
    mainEntityOfPage: `${appUrl()}/guides/${guide.slug}`,
  };

  // §9 — public content pages are the priority surface for ads, and the only
  // one §8 permits. Renders nothing until AdSense is configured, the global
  // flag is on and the visitor has consented.
  const ads = await getAdContext();

  return (
    <article className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <script
        type="application/ld+json"
        // The content is built from typed article metadata, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* §37 — breadcrumbs, so the article is not a dead end. */}
      <nav aria-label="Breadcrumb" className="hp-small text-text-muted">
        <Link href="/guides" className="hover:text-text">
          Guides
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{guide.category}</span>
      </nav>

      <h1 className="hp-h1 mt-3 text-text">{guide.title}</h1>

      {/* §25 — author and dates, stated plainly. */}
      <p className="hp-small mt-3 text-text-muted">
        {guide.author} · {published} · {guide.readingMinutes} min read
        {guide.updatedAt ? ` · updated ${guide.updatedAt}` : ''}
      </p>

      <div className="mt-8">
        <guide.Body />
      </div>

      {/*
        §59 — one slot, after the content. An ad above the article would make
        the page look like it exists to carry advertising, which is both the
        §61 pattern to avoid and a poor argument for anyone to read on.
      */}
      <AdSlot
        pathname={`/guides/${guide.slug}`}
        globalEnabled={ads.globalEnabled}
        configured={ads.configured}
        consent={ads.consent}
        adsShown
      />

      {/* §79 — stated once, at the end, where it informs rather than shouts. */}
      <p className="hp-small mt-10 border-t border-border pt-6 text-text-muted">
        This guide is general educational information about organising your own records.
        It is not personalised financial advice.
      </p>

      <div className="mt-8">
        <Link href="/guides" className="hp-body text-primary-text underline">
          More guides
        </Link>
      </div>
    </article>
  );
}
