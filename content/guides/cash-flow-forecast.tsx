import { H2, P } from '@/lib/content/prose';
import type { Article } from '@/lib/content/types';

/**
 * Deliberately a DRAFT.
 *
 * It exists so criterion 5 — "Draft content cannot leak publicly" — is tested
 * against a real unpublished article rather than a hypothetical one. It must
 * not appear on /guides, must not resolve at its slug, and must not reach the
 * sitemap. `lib/content/registry.test.ts` asserts all three.
 */
export const meta = {
  slug: 'build-a-simple-cash-flow-forecast',
  title: 'How to build a simple personal cash-flow forecast',
  excerpt:
    'Projecting the next 30 days from what you already know, without pretending to predict the future.',
  author: 'The HelloPera team',
  publishedAt: '2026-10-01',
  status: 'draft' as const,
  category: 'Planning',
  readingMinutes: 7,
};

export function Body() {
  return (
    <>
      <H2>Draft</H2>
      <P>This guide is still being written and is not published.</P>
    </>
  );
}

const article: Article = { ...meta, Body };
export default article;
