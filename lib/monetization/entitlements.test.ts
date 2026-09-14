import { describe, expect, it } from 'vitest';
import {
  ENTITLEMENT_KEYS,
  FREE_FALLBACK,
  allowedHorizons,
  grantsPaidPlan,
  resolveEntitlements,
} from '@/lib/monetization/entitlements';

const rows = (o: Record<string, unknown>) =>
  Object.entries(o).map(([entitlement_key, value_json]) => ({
    entitlement_key,
    value_json,
  }));

describe('resolveEntitlements — §13, §53', () => {
  it('falls back to Free when there are no rows at all', () => {
    // §53: "If entitlement service fails: do not accidentally grant premium."
    expect(resolveEntitlements([])).toEqual(FREE_FALLBACK);
  });

  it('reads a full premium set', () => {
    const e = resolveEntitlements(
      rows({
        ocr_monthly_limit: 500,
        ai_monthly_limit: 100,
        advanced_analytics: true,
        forecast_horizon_days: 90,
        export_enabled: true,
        ads_shown: false,
        document_retention_days: 365,
        max_documents: null,
        max_accounts: null,
        premium_support: true,
      }),
    );
    expect(e.ocrMonthlyLimit).toBe(500);
    expect(e.forecastHorizonDays).toBe(90);
    expect(e.advancedAnalytics).toBe(true);
    // Criterion 9.
    expect(e.adsShown).toBe(false);
  });

  it('falls back per key, not all-or-nothing', () => {
    // One corrupt row must not downgrade a paying customer's whole plan, nor
    // upgrade a free one.
    const e = resolveEntitlements(
      rows({ ocr_monthly_limit: 500, advanced_analytics: 'yes-please' }),
    );
    expect(e.ocrMonthlyLimit).toBe(500);
    expect(e.advancedAnalytics).toBe(FREE_FALLBACK.advancedAnalytics);
  });

  it('never grants a capability from a malformed value', () => {
    for (const bad of ['true', 1, {}, [], undefined, NaN]) {
      const e = resolveEntitlements(
        rows({ advanced_analytics: bad, ads_shown: bad, export_enabled: bad }),
      );
      expect(e.advancedAnalytics, String(bad)).toBe(false);
      expect(e.exportEnabled, String(bad)).toBe(false);
      // ads_shown falling back to TRUE is the safe direction: a free user
      // seeing ads is the intended state, and a bug must not silently give
      // away the ad-free experience.
      expect(e.adsShown, String(bad)).toBe(true);
    }
  });

  it('distinguishes null (no limit) from missing (fall back)', () => {
    expect(resolveEntitlements(rows({ max_accounts: null })).maxAccounts).toBeNull();
    expect(resolveEntitlements([]).maxAccounts).toBe(FREE_FALLBACK.maxAccounts);
    expect(resolveEntitlements(rows({ max_accounts: 5 })).maxAccounts).toBe(5);
  });

  it('ignores keys outside the registry', () => {
    const e = resolveEntitlements(rows({ unlimited_everything: true }));
    expect(e).toEqual(FREE_FALLBACK);
  });

  it('documents every key it resolves', () => {
    // §9 — "Do not create arbitrary keys without documentation."
    expect(ENTITLEMENT_KEYS).toHaveLength(10);
    expect(new Set(ENTITLEMENT_KEYS).size).toBe(ENTITLEMENT_KEYS.length);
  });
});

describe('grantsPaidPlan — §11, §12, §42', () => {
  it('grants for active, trialing and grace', () => {
    // A trial is the product being sold; grace exists so a failed payment
    // does not instantly strip features from someone about to fix it.
    expect(grantsPaidPlan('active')).toBe(true);
    expect(grantsPaidPlan('trialing')).toBe(true);
    expect(grantsPaidPlan('grace')).toBe(true);
  });

  it('refuses every terminal or lapsed state', () => {
    for (const s of ['past_due', 'cancelled', 'expired', 'inactive']) {
      expect(grantsPaidPlan(s), s).toBe(false);
    }
  });

  it('refuses a missing status — the Free default (§11)', () => {
    expect(grantsPaidPlan(null)).toBe(false);
    expect(grantsPaidPlan(undefined)).toBe(false);
    expect(grantsPaidPlan('')).toBe(false);
    expect(grantsPaidPlan('ACTIVE')).toBe(false);
  });
});

describe('allowedHorizons — §24, criterion 7', () => {
  const SUPPORTED = [30, 60, 90];

  it('gives a free plan only 30 days', () => {
    expect(allowedHorizons(FREE_FALLBACK, SUPPORTED)).toEqual([30]);
  });

  it('gives premium the full set Phase 07 implements', () => {
    const premium = { ...FREE_FALLBACK, forecastHorizonDays: 90 };
    expect(allowedHorizons(premium, SUPPORTED)).toEqual([30, 60, 90]);
  });

  it('can never offer a horizon the forecast engine does not implement', () => {
    // Criterion 7: "The forecast entitlement does not exceed what Phase 07
    // builds." Even a mis-seeded entitlement of 365 cannot invent a horizon.
    const overreaching = { ...FREE_FALLBACK, forecastHorizonDays: 365 };
    expect(allowedHorizons(overreaching, SUPPORTED)).toEqual(SUPPORTED);
  });

  it('never returns an empty set for a plausible entitlement', () => {
    for (const days of [30, 60, 90]) {
      expect(
        allowedHorizons({ ...FREE_FALLBACK, forecastHorizonDays: days }, SUPPORTED)
          .length,
      ).toBeGreaterThan(0);
    }
  });
});
