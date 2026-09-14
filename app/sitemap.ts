import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/env';
import { PUBLIC_ROUTES } from '@/lib/seo/routes';
import { publishedGuides } from '@/lib/content/registry';

/**
 * sitemap.xml — PHASE-10 §31, §83, criteria 8 and 11.
 *
 * Built from the same two sources the site itself renders from: the public
 * route registry and `publishedGuides()`. A hand-maintained sitemap drifts
 * within a release or two, and a sitemap listing a page that 404s is worse
 * than no sitemap at all.
 *
 * `publishedGuides()` already excludes drafts, so criterion 5 holds here by
 * construction rather than by a second filter that could be forgotten.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();

  const pages = PUBLIC_ROUTES.map((route) => ({
    url: `${base}${route.path === '/' ? '' : route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const guides = publishedGuides().map((guide) => ({
    url: `${base}/guides/${guide.slug}`,
    // §84 — the real date the content last changed, not the build time. A
    // sitemap that claims every article changed today teaches crawlers to
    // ignore the field.
    lastModified: new Date(guide.updatedAt ?? guide.publishedAt),
    changeFrequency: 'yearly' as const,
    priority: 0.7,
  }));

  return [...pages, ...guides];
}
