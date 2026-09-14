import { describe, expect, it } from 'vitest';
import {
  CONSENT_VERSION,
  DEFAULT_CONSENT,
  grantAll,
  hasDecided,
  parseConsent,
  rejectAll,
  serialiseConsent,
} from '@/lib/consent/categories';

describe('parseConsent — §49, §50', () => {
  it('denies when nothing is stored', () => {
    expect(parseConsent(null)).toEqual(DEFAULT_CONSENT);
    expect(parseConsent(undefined)).toEqual(DEFAULT_CONSENT);
    expect(parseConsent('')).toEqual(DEFAULT_CONSENT);
  });

  it('denies when the cookie is corrupt', () => {
    // A cookie that cannot be parsed must never read as permission.
    for (const bad of ['{', 'null', '"yes"', '[]', 'undefined']) {
      const r = parseConsent(bad);
      expect(r.categories.advertising, bad).toBe(false);
      expect(r.categories.analytics, bad).toBe(false);
    }
  });

  it('denies when the stored answer is for an older version', () => {
    // §50 — consent to a different question is not consent to this one.
    const stale = JSON.stringify({
      version: CONSENT_VERSION - 1,
      decidedAt: '2026-01-01T00:00:00.000Z',
      categories: { necessary: true, analytics: true, advertising: true },
    });
    expect(parseConsent(stale).categories.advertising).toBe(false);
  });

  it('grants only on a real boolean true', () => {
    // "true", 1 and {} are not consent.
    for (const value of ['true', 1, {}, [], 'yes']) {
      const raw = JSON.stringify({
        version: CONSENT_VERSION,
        decidedAt: '2026-09-14T00:00:00.000Z',
        categories: { advertising: value, analytics: value },
      });
      expect(parseConsent(raw).categories.advertising, String(value)).toBe(false);
    }
  });

  it('round-trips a real decision', () => {
    const granted = grantAll(new Date('2026-09-14T10:00:00Z'));
    const parsed = parseConsent(serialiseConsent(granted));
    expect(parsed).toEqual(granted);
  });

  it('always keeps necessary true', () => {
    // It covers the session cookie that signing in requires; a banner that
    // could switch it off would be a banner that logs you out.
    expect(parseConsent(serialiseConsent(rejectAll())).categories.necessary).toBe(true);
    expect(DEFAULT_CONSENT.categories.necessary).toBe(true);
  });
});

describe('hasDecided', () => {
  it('is false before the user answers', () => {
    expect(hasDecided(DEFAULT_CONSENT)).toBe(false);
  });

  it('is true after either answer', () => {
    expect(hasDecided(grantAll())).toBe(true);
    expect(hasDecided(rejectAll())).toBe(true);
  });

  it('distinguishes "rejected everything" from "never asked"', () => {
    // Otherwise the banner reappears forever for anyone who declined, which
    // is the single most irritating consent bug on the web.
    const rejected = rejectAll();
    expect(rejected.categories.advertising).toBe(DEFAULT_CONSENT.categories.advertising);
    expect(hasDecided(rejected)).not.toBe(hasDecided(DEFAULT_CONSENT));
  });
});
