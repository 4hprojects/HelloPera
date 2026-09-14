import type { ReactNode } from 'react';

/**
 * Content model — PHASE-10 §23 to §27, §41.
 *
 * ## Why typed modules rather than MDX
 *
 * §23 offers MDX files or a database, and notes "MDX may be simpler". In this
 * repo it is not, for three specific reasons:
 *
 *  1. `@next/mdx` needs four packages, and this repo has no content
 *     dependencies at all today.
 *  2. It routes by file location, whereas §41 and criterion 5 need routing
 *     driven by *frontmatter status* — a draft must not resolve at its URL,
 *     which file-based routing cannot express.
 *  3. Raw markdown emits bare `<p>`/`<h2>` with no classes, and this design
 *     system carries its own typography utilities (`hp-body`, `hp-h2`). Every
 *     article would need a styling layer to look like the rest of the site.
 *
 * So a guide is a module: typed metadata plus a component. It costs a `<p>`
 * wrapper per paragraph and buys type-checked frontmatter, trivial draft
 * filtering, and prose that uses the same classes as every other page.
 *
 * If editing by non-developers ever matters, §23's database option is the
 * upgrade path and this type is the interface it would satisfy.
 */

export type ArticleStatus = 'draft' | 'published';

export type ArticleMeta = {
  /** §27 — lowercase, hyphen-separated, stable, human-readable. */
  slug: string;
  title: string;
  excerpt: string;
  /**
   * §25 — a real name. "Do not fabricate credentials": no invented CFPs, no
   * fictional finance editors.
   */
  author: string;
  /** ISO date. §84 requires honest dates. */
  publishedAt: string;
  /** Set only when the content materially changed (§85). */
  updatedAt?: string;
  /** §41 — a draft is invisible everywhere: route, hub and sitemap. */
  status: ArticleStatus;
  /** §39 — the content category. */
  category: string;
  /** §28 — overrides when the title is wrong for a search result. */
  seoTitle?: string;
  seoDescription?: string;
  /** Rough reading time in minutes, stated rather than computed from a guess. */
  readingMinutes: number;
};

export type Article = ArticleMeta & {
  /** The body. */
  Body: () => ReactNode;
};
