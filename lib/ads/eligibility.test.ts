import { describe, expect, it } from 'vitest';
import {
  AD_FREE_PREFIXES,
  adEligibility,
  isAdPermittedSurface,
} from '@/lib/ads/eligibility';
import { DEFAULT_CONSENT, grantAll, rejectAll } from '@/lib/consent/categories';
import { DISALLOWED_PREFIXES } from '@/lib/seo/routes';

const allowed = {
  pathname: '/guides/how-to-track-monthly-expenses',
  globalEnabled: true,
  adsShown: true,
  consent: grantAll(),
  configured: true,
};

describe('adEligibility — criteria 16 to 19', () => {
  it('allows an ad only when every gate permits', () => {
    expect(adEligibility(allowed).allowed).toBe(true);
  });

  it('respects the global kill switch — criterion 16', () => {
    const r = adEligibility({ ...allowed, globalEnabled: false });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('globally_disabled');
  });

  it('shows no ads to a Premium user — criterion 17', () => {
    const r = adEligibility({ ...allowed, adsShown: false });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('premium');
  });

  it('shows no ads without advertising consent — criterion 20', () => {
    expect(adEligibility({ ...allowed, consent: rejectAll() }).reason).toBe('no_consent');
    expect(adEligibility({ ...allowed, consent: DEFAULT_CONSENT }).reason).toBe(
      'no_consent',
    );
  });

  it('shows no ads when no publisher id is configured', () => {
    expect(adEligibility({ ...allowed, configured: false }).reason).toBe(
      'not_configured',
    );
  });

  it('requires ALL gates, not any', () => {
    // The bug this guards: an || where an && belongs would serve ads to
    // Premium users the moment the global flag went on.
    const combos = [
      { globalEnabled: false, adsShown: false },
      { globalEnabled: false, adsShown: true },
      { globalEnabled: true, adsShown: false },
    ];
    for (const c of combos) {
      expect(adEligibility({ ...allowed, ...c }).allowed, JSON.stringify(c)).toBe(false);
    }
  });
});

describe('sensitive surfaces — criterion 18', () => {
  it('never allows an ad on a financial screen, whatever the flags say', () => {
    // The check that matters most: even with every gate open, these refuse.
    for (const prefix of AD_FREE_PREFIXES) {
      const r = adEligibility({ ...allowed, pathname: prefix });
      expect(r.allowed, prefix).toBe(false);
      expect(r.reason, prefix).toBe('sensitive_surface');
    }
  });

  it('covers nested routes under a denied prefix', () => {
    for (const path of [
      '/transactions/new',
      '/documents/abc-123/review',
      '/settings/plan',
      '/admin/subscriptions',
    ]) {
      expect(isAdPermittedSurface(path), path).toBe(false);
    }
  });

  it('denies every route the sitemap also refuses to index', () => {
    // The two lists exist for different reasons — one is crawlers, one is
    // advertising — but a route private enough to hide from Google is private
    // enough to keep ads off.
    for (const prefix of DISALLOWED_PREFIXES) {
      if (prefix === '/api' || prefix === '/auth') continue; // not rendered surfaces
      expect(isAdPermittedSurface(prefix), prefix).toBe(false);
    }
  });

  it('permits the public marketing pages', () => {
    for (const path of ['/', '/features', '/pricing', '/guides', '/faq', '/about']) {
      expect(isAdPermittedSurface(path), path).toBe(true);
    }
  });

  it('is not fooled by a prefix that merely starts the same', () => {
    // "/settings-guide" is a public article, not the settings screen.
    expect(isAdPermittedSurface('/settings-guide')).toBe(true);
    expect(isAdPermittedSurface('/settings')).toBe(false);
  });
});
