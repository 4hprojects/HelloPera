import { describe, expect, it } from 'vitest';
import {
  allGuides,
  findPublishedGuide,
  guideCategories,
  publishedGuides,
} from '@/lib/content/registry';

describe('draft exclusion — §41, criterion 5', () => {
  it('has at least one draft, so this suite tests something real', () => {
    // Without a draft in the registry these assertions would pass vacuously
    // forever, which is the failure mode of a "drafts are hidden" test.
    expect(allGuides().some((a) => a.status === 'draft')).toBe(true);
  });

  it('never lists a draft publicly', () => {
    for (const article of publishedGuides()) {
      expect(article.status, article.slug).toBe('published');
    }
  });

  it('does not resolve a draft by its slug', () => {
    const draft = allGuides().find((a) => a.status === 'draft')!;
    expect(findPublishedGuide(draft.slug)).toBeNull();
  });

  it('answers identically for a draft and for a slug that does not exist', () => {
    // Distinguishing them would confirm that an unpublished article exists at
    // that URL, which is the leak in a different shape.
    const draft = allGuides().find((a) => a.status === 'draft')!;
    expect(findPublishedGuide(draft.slug)).toBe(findPublishedGuide('no-such-guide'));
  });

  it('keeps drafts out of the category list', () => {
    const draftCategories = allGuides()
      .filter((a) => a.status === 'draft')
      .map((a) => a.category);
    const published = new Set(publishedGuides().map((a) => a.category));

    for (const c of draftCategories) {
      if (!published.has(c)) {
        expect(guideCategories()).not.toContain(c);
      }
    }
  });
});

describe('article metadata — §25, §27, §84', () => {
  it('uses slugs that are lowercase and hyphen-separated', () => {
    for (const a of allGuides()) {
      expect(a.slug, a.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('has unique slugs', () => {
    const slugs = allGuides().map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('has unique titles and excerpts — §28 forbids duplicates', () => {
    const published = publishedGuides();
    expect(new Set(published.map((a) => a.title)).size).toBe(published.length);
    expect(new Set(published.map((a) => a.excerpt)).size).toBe(published.length);
  });

  it('carries a real ISO published date', () => {
    for (const a of allGuides()) {
      expect(a.publishedAt, a.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(a.publishedAt)), a.slug).toBe(false);
    }
  });

  it('never claims an update older than publication', () => {
    for (const a of allGuides()) {
      if (a.updatedAt) expect(a.updatedAt >= a.publishedAt, a.slug).toBe(true);
    }
  });

  it('names an author — §25 forbids fabricated credentials', () => {
    for (const a of allGuides()) {
      expect(a.author.trim().length, a.slug).toBeGreaterThan(0);
    }
  });

  it('gives every article an excerpt short enough to be a meta description', () => {
    for (const a of publishedGuides()) {
      const description = a.seoDescription ?? a.excerpt;
      expect(description.length, a.slug).toBeGreaterThan(50);
      expect(description.length, a.slug).toBeLessThanOrEqual(200);
    }
  });
});

describe('ordering', () => {
  it('lists newest first', () => {
    const dates = publishedGuides().map((a) => a.publishedAt);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });
});
