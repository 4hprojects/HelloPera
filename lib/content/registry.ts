import type { Article } from '@/lib/content/types';

import trackMonthlyExpenses from '@/content/guides/track-monthly-expenses';
import transfersVsExpenses from '@/content/guides/transfers-vs-expenses';
import organizeBills from '@/content/guides/organize-bills-and-due-dates';
import moneyOwed from '@/content/guides/track-money-people-owe-you';
import cashFlowForecast from '@/content/guides/cash-flow-forecast';

/**
 * The guide registry — PHASE-10 §41, §71, criterion 5.
 *
 * An explicit list rather than a filesystem scan. Three reasons, and the third
 * is the important one:
 *
 *  1. It works under `output: 'standalone'`, where the source tree is not
 *     present at runtime and a `readdir` would find nothing.
 *  2. Imports are type-checked, so a malformed article is a build error.
 *  3. Publishing is a deliberate edit to one reviewable file. A directory scan
 *     publishes whatever happens to be on disk, which is how a half-finished
 *     draft reaches production.
 *
 * ## The draft rule
 *
 * `publishedGuides()` is the ONLY export the public site may use. Draft
 * filtering lives here, once, rather than at each call site — criterion 5 is
 * "draft content cannot leak", and a rule repeated in three places is a rule
 * that will eventually be forgotten in one of them.
 */
const ALL: Article[] = [
  trackMonthlyExpenses,
  transfersVsExpenses,
  organizeBills,
  moneyOwed,
  cashFlowForecast,
];

/**
 * Everything, drafts included. For tests and future draft preview (§71) only —
 * never for a public route.
 */
export function allGuides(): Article[] {
  return ALL;
}

/** Published guides, newest first. The only list the public site renders. */
export function publishedGuides(): Article[] {
  return ALL.filter((a) => a.status === 'published').sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
}

/**
 * One published guide, or null.
 *
 * Returns null for a draft as well as for a missing slug, so the route renders
 * the same 404 either way. Distinguishing them would confirm that an
 * unpublished article exists at that URL.
 */
export function findPublishedGuide(slug: string): Article | null {
  return publishedGuides().find((a) => a.slug === slug) ?? null;
}

/** §39 — categories present in published content, for the hub. */
export function guideCategories(): string[] {
  return [...new Set(publishedGuides().map((a) => a.category))].sort();
}
