import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import { DISALLOWED_PREFIXES, PUBLIC_ROUTES } from '@/lib/seo/routes';
import { allGuides, publishedGuides } from '@/lib/content/registry';

describe('sitemap — §31, criteria 8 and 11', () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it('lists every public route', () => {
    for (const route of PUBLIC_ROUTES) {
      const expected = route.path === '/' ? '' : route.path;
      expect(
        urls.some((u) => u.endsWith(expected)),
        route.path,
      ).toBe(true);
    }
  });

  it('lists every published guide', () => {
    for (const guide of publishedGuides()) {
      expect(
        urls.some((u) => u.endsWith(`/guides/${guide.slug}`)),
        guide.slug,
      ).toBe(true);
    }
  });

  it('lists no draft guide — criterion 5', () => {
    const drafts = allGuides().filter((a) => a.status === 'draft');
    expect(drafts.length).toBeGreaterThan(0);
    for (const draft of drafts) {
      expect(
        urls.some((u) => u.includes(draft.slug)),
        draft.slug,
      ).toBe(false);
    }
  });

  it('lists no private route — criterion 11', () => {
    // The check that matters: a financial screen in the sitemap is an
    // invitation to index it.
    for (const prefix of DISALLOWED_PREFIXES) {
      for (const url of urls) {
        const path = new URL(url).pathname;
        expect(
          path === prefix || path.startsWith(`${prefix}/`),
          `${path} vs ${prefix}`,
        ).toBe(false);
      }
    }
  });

  it('uses absolute URLs', () => {
    for (const url of urls) {
      expect(() => new URL(url), url).not.toThrow();
      expect(url.startsWith('http'), url).toBe(true);
    }
  });

  it('has no duplicate URLs', () => {
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('dates guides by their content, not the build', () => {
    // §84 — a sitemap claiming everything changed today teaches crawlers to
    // ignore lastModified entirely.
    const guide = publishedGuides()[0]!;
    const entry = entries.find((e) => e.url.endsWith(`/guides/${guide.slug}`))!;
    const expected = new Date(guide.updatedAt ?? guide.publishedAt).toISOString();
    expect(new Date(entry.lastModified!).toISOString()).toBe(expected);
  });
});

describe('robots — §32, §33, criteria 9 and 11', () => {
  const result = robots();
  const rule = Array.isArray(result.rules) ? result.rules[0]! : result.rules;

  it('points at the sitemap', () => {
    expect(String(result.sitemap)).toMatch(/\/sitemap\.xml$/);
  });

  it('disallows every private prefix', () => {
    const disallow = (rule.disallow ?? []) as string[];
    for (const prefix of DISALLOWED_PREFIXES) {
      expect(disallow.includes(prefix) || disallow.includes(`${prefix}/`), prefix).toBe(
        true,
      );
    }
  });

  it('allows the public site', () => {
    expect(rule.allow).toBe('/');
  });

  it('does not disallow a public route', () => {
    const disallow = (rule.disallow ?? []) as string[];
    for (const route of PUBLIC_ROUTES) {
      expect(disallow.includes(route.path), route.path).toBe(false);
    }
  });
});
