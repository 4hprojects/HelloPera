/**
 * Consent — PHASE-10 §49, §50, criterion 21.
 *
 * ## The decision §49 demands, recorded
 *
 * Google requires a **Google-certified CMP integrated with the IAB
 * Transparency and Consent Framework** to serve ads to users in the EEA, UK or
 * Switzerland. A hand-rolled banner does not satisfy that, however correct its
 * categories are.
 *
 * §49 offers two paths and asks that the choice be recorded here.
 *
 * **Chosen: scope EEA/UK out at launch.** HelloPera is a Philippine-market
 * product. Serving ads only to the primary market avoids an integration that
 * would otherwise have to be built, certified and maintained before a single
 * ad is shown, and §49 calls this "defensible at launch and considerably less
 * work". It is revisited when traffic from those regions justifies it.
 *
 * The categories below are built regardless, because §49 notes they are what a
 * CMP integrates with when one is adopted, and because the analytics category
 * applies everywhere with or without advertising.
 */

export const CONSENT_CATEGORIES = ['necessary', 'analytics', 'advertising'] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

/**
 * §50 — stored state.
 *
 * `version` exists so a change to what the categories cover invalidates the
 * old answer rather than silently inheriting it. Consent to something else is
 * not consent to this.
 */
export const CONSENT_VERSION = 1;

export type ConsentState = {
  version: number;
  /** ISO timestamp of the decision. */
  decidedAt: string;
  categories: Record<ConsentCategory, boolean>;
};

/**
 * No consent given.
 *
 * `necessary` is true because it covers the session cookie that signing in
 * requires — there is no meaningful choice to offer about it, and pretending
 * otherwise would mean a banner that can log you out.
 *
 * Everything else is **false until asked**. §49: "Do not load non-essential
 * tracking before required consent."
 */
export const DEFAULT_CONSENT: ConsentState = {
  version: CONSENT_VERSION,
  decidedAt: '',
  categories: { necessary: true, analytics: false, advertising: false },
};

export const COOKIE_NAME = 'hp_consent';
/** Six months. Long enough not to nag, short enough that the answer is current. */
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

/**
 * Parse stored consent.
 *
 * Anything unparseable, or answering an older version of the question, resolves
 * to DEFAULT_CONSENT — which denies. A corrupt cookie must never read as
 * permission.
 */
export function parseConsent(raw: string | undefined | null): ConsentState {
  if (!raw) return DEFAULT_CONSENT;

  try {
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    if (parsed.version !== CONSENT_VERSION) return DEFAULT_CONSENT;

    const categories: Partial<Record<ConsentCategory, unknown>> = parsed.categories ?? {};
    return {
      version: CONSENT_VERSION,
      decidedAt: typeof parsed.decidedAt === 'string' ? parsed.decidedAt : '',
      categories: {
        necessary: true,
        // Strict equality: only a real `true` grants. "true", 1 and {} do not.
        analytics: categories.analytics === true,
        advertising: categories.advertising === true,
      },
    };
  } catch {
    return DEFAULT_CONSENT;
  }
}

export function serialiseConsent(state: ConsentState): string {
  return JSON.stringify(state);
}

/** Has the user answered the current version of the question? */
export function hasDecided(state: ConsentState): boolean {
  return state.decidedAt !== '';
}

export function grantAll(now: Date = new Date()): ConsentState {
  return {
    version: CONSENT_VERSION,
    decidedAt: now.toISOString(),
    categories: { necessary: true, analytics: true, advertising: true },
  };
}

export function rejectAll(now: Date = new Date()): ConsentState {
  return {
    version: CONSENT_VERSION,
    decidedAt: now.toISOString(),
    categories: { necessary: true, analytics: false, advertising: false },
  };
}
