import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/env';
import { DISALLOWED_PREFIXES } from '@/lib/seo/routes';

/**
 * robots.txt — PHASE-10 §32, §33, criteria 9 and 11.
 *
 * Generated rather than a static file so the sitemap URL follows `appUrl()`
 * and cannot drift from whatever host the deployment actually answers on.
 *
 * The disallow list is belt and braces: every private route already renders
 * `noindex` from the root layout, which is what actually keeps it out of an
 * index. robots.txt only asks a crawler not to fetch — a page it never fetches
 * can still be indexed from an inbound link, which is exactly why the meta tag
 * is the real control and this is the polite request.
 */
export default function robots(): MetadataRoute.Robots {
  const base = appUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOWED_PREFIXES.map((p) => `${p}/`).concat(DISALLOWED_PREFIXES),
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
