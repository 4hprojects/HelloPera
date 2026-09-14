/**
 * Public-site analytics — PHASE-10 §51, §52, criterion 24.
 *
 * Scaffolded with no provider attached. The provider is a later decision; the
 * *constraint* is not, and encoding it now is the point of this file.
 *
 * ## §52, which is criterion 24
 *
 * > Never send account balances, transaction amounts, OCR text, bill values,
 * > receivable values or account numbers to generic web analytics.
 *
 * A rule written in a document is followed until someone is in a hurry. So
 * this module makes the wrong thing hard to express: events are a closed union
 * of names, and their properties are restricted to a small set of
 * non-financial primitives. There is no `track(name, anyObject)` to reach for.
 *
 * Deliberately **not** used in the authenticated application. Every event
 * below describes a public marketing page. The moment analytics follows
 * someone past sign-in, the question stops being "did we send an amount?" and
 * becomes "can we prove we never will?" — and the honest answer to the second
 * is a smaller surface, not a stricter promise.
 */

/** §52's example vocabulary, extended only where a page actually needs it. */
export const ANALYTICS_EVENTS = [
  'page_viewed',
  'signup_clicked',
  'guide_viewed',
  'pricing_viewed',
  'features_viewed',
  'faq_viewed',
  'contact_viewed',
  'consent_accepted',
  'consent_rejected',
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

/**
 * What an event may carry.
 *
 * Strings and booleans only, from a fixed key set. No numbers — not because a
 * number is inherently private, but because every value §52 forbids is one,
 * and removing the shape removes the mistake.
 */
export type AnalyticsProperties = {
  /** A public path. Never a path containing an id. */
  path?: string;
  /** A guide slug, category name, or plan code — public strings. */
  slug?: string;
  category?: string;
  plan?: string;
};

const ALLOWED_KEYS: ReadonlySet<string> = new Set(['path', 'slug', 'category', 'plan']);

/**
 * Strip anything not explicitly allowed.
 *
 * Belt and braces: the type already prevents it at compile time, and this
 * catches the case where properties arrive from somewhere untyped. A value
 * that is not a string or boolean is dropped rather than coerced, because
 * coercing an amount to a string still sends the amount.
 */
export function sanitise(properties: Record<string, unknown>): AnalyticsProperties {
  const out: Record<string, string | boolean> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (typeof value === 'string' || typeof value === 'boolean') out[key] = value;
  }

  return out as AnalyticsProperties;
}

/**
 * Record an event.
 *
 * A no-op until a provider is configured. It is written now so call sites can
 * exist and be reviewed, and so adding a provider is one function body rather
 * than a scatter of new calls through the public pages.
 *
 * When a provider is chosen, the implementation goes here and nowhere else —
 * and it must check advertising/analytics consent before sending, per §49.
 */
export function track(event: AnalyticsEvent, properties: AnalyticsProperties = {}): void {
  if (process.env.NODE_ENV === 'development') {
    // Visible while developing so call sites can be checked, silent in
    // production where there is nothing to send.
    console.debug('[analytics]', event, sanitise(properties));
  }
}
