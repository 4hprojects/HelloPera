import type { ConsentState } from '@/lib/consent/categories';

/**
 * Ad eligibility — PHASE-10 §7, §8, §10, §54, §55, §62; PHASE-09 §27.
 *
 * One function decides whether an ad may render, because a rule spread across
 * call sites is a rule that will be wrong in one of them — and here being
 * wrong means an advertisement beside somebody's bank balance.
 *
 * Three independent gates, all of which must permit:
 *
 *   ads_enabled_global   system kill switch   (PHASE-09 feature_flags)
 *   ads_shown            per-user entitlement (false for Premium)
 *   consent.advertising  the visitor's answer
 *
 * Plus a fourth that overrides all of them: the surface itself.
 */

/**
 * §8, §62 — where an ad may never appear, whatever the flags say.
 *
 * §7 puts ads on "general application areas" and keeps them out of sensitive
 * financial workflows. The list below is the concrete reading of that:
 * anywhere a balance, an amount or a document is on screen, and anywhere the
 * user is part-way through entering money.
 *
 * A denylist of prefixes rather than an allowlist, and a deliberately broad
 * one — the entire authenticated application. A financial route added later
 * and forgotten inherits "no ads" automatically, which is the direction that
 * fails safely.
 */
export const AD_FREE_PREFIXES = [
  '/dashboard',
  '/accounts',
  '/transactions',
  '/bills',
  '/receivables',
  '/expected-income',
  '/documents',
  '/analytics',
  '/recurring',
  '/forecast',
  '/notifications',
  '/settings',
  '/admin',
  // Auth screens: an ad next to a password field looks like a phishing page.
  '/login',
  '/register',
  '/reset-password',
  '/forgot-password',
  '/verify-email',
];

/** Is this a surface where an advertisement is permitted at all? */
export function isAdPermittedSurface(pathname: string): boolean {
  return !AD_FREE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export type AdEligibilityInput = {
  pathname: string;
  /** PHASE-09 `feature_flags.ads_enabled_global`. */
  globalEnabled: boolean;
  /**
   * PHASE-09 `entitlements.adsShown`. On a public page there is no user, so
   * the caller passes `true` — the global flag and consent are the only gates
   * that can apply to an anonymous visitor.
   */
  adsShown: boolean;
  consent: ConsentState;
  /** §55 — whether a publisher id is actually configured. */
  configured: boolean;
};

export type AdEligibility = {
  allowed: boolean;
  /** Why not, for logging and for the tests. Never shown to a visitor. */
  reason:
    | 'ok'
    | 'sensitive_surface'
    | 'globally_disabled'
    | 'premium'
    | 'no_consent'
    | 'not_configured';
};

export function adEligibility(input: AdEligibilityInput): AdEligibility {
  // Surface first: it is the one gate no configuration can override, and
  // checking it first means a misconfigured flag can never put an ad on a
  // balance screen.
  if (!isAdPermittedSurface(input.pathname)) {
    return { allowed: false, reason: 'sensitive_surface' };
  }
  if (!input.globalEnabled) return { allowed: false, reason: 'globally_disabled' };
  if (!input.configured) return { allowed: false, reason: 'not_configured' };
  // §10 — Premium suppression.
  if (!input.adsShown) return { allowed: false, reason: 'premium' };
  if (!input.consent.categories.advertising) {
    return { allowed: false, reason: 'no_consent' };
  }
  return { allowed: true, reason: 'ok' };
}
