import { describe, expect, it } from 'vitest';
import {
  ENTITLEMENT_KEYS,
  FREE_FALLBACK,
  activeOverrides,
  allowedHorizons,
  grantsPaidPlan,
  resolveEntitlements,
  type OverrideRow,
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

describe('entitlement overrides — PHASE-13 §19', () => {
  const NOW = new Date('2026-09-14T12:00:00Z');
  const at = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

  const override = (over: Partial<OverrideRow> = {}): OverrideRow => ({
    entitlement_key: 'advanced_analytics',
    value_json: true,
    starts_at: at(-1),
    ends_at: at(30),
    ...over,
  });

  it('takes precedence over the plan for the key it names', () => {
    // The mechanism behind "promotional Premium is an override row, not a fake
    // subscription": a later row wins.
    const plan = [{ entitlement_key: 'advanced_analytics', value_json: false }];
    const resolved = resolveEntitlements([
      ...plan,
      ...activeOverrides([override()], NOW),
    ]);
    expect(resolved.advancedAnalytics).toBe(true);
  });

  it('leaves every other key on the plan alone', () => {
    const plan = [
      { entitlement_key: 'advanced_analytics', value_json: false },
      { entitlement_key: 'ocr_monthly_limit', value_json: 25 },
    ];
    const resolved = resolveEntitlements([
      ...plan,
      ...activeOverrides([override()], NOW),
    ]);
    expect(resolved.ocrMonthlyLimit).toBe(25);
  });

  it('ignores one that has not started', () => {
    expect(activeOverrides([override({ starts_at: at(1) })], NOW)).toHaveLength(0);
  });

  it('ignores one that has expired', () => {
    // The case that matters most: a promotion nobody remembered to end must
    // stop on its own, or it never ends at all.
    expect(activeOverrides([override({ ends_at: at(-1) })], NOW)).toHaveLength(0);
  });

  it('honours an open-ended override', () => {
    expect(activeOverrides([override({ ends_at: null })], NOW)).toHaveLength(1);
  });

  it('refuses an unparseable window rather than granting on it', () => {
    // A bad date must not read as "no limit". Both directions are skipped.
    expect(activeOverrides([override({ starts_at: 'not-a-date' })], NOW)).toHaveLength(0);
    expect(activeOverrides([override({ ends_at: 'not-a-date' })], NOW)).toHaveLength(0);
  });

  it('falls back per key when an override value is the wrong type', () => {
    // Same rule as a corrupt plan row: one bad value must not void the plan.
    const plan = [
      { entitlement_key: 'advanced_analytics', value_json: false },
      { entitlement_key: 'ocr_monthly_limit', value_json: 25 },
    ];
    const resolved = resolveEntitlements([
      ...plan,
      ...activeOverrides([override({ value_json: 'yes please' })], NOW),
    ]);
    expect(resolved.advancedAnalytics).toBe(FREE_FALLBACK.advancedAnalytics);
    expect(resolved.ocrMonthlyLimit).toBe(25);
  });

  it('can restrict as well as grant', () => {
    // Overrides are not only promotions — abuse mitigation is the other
    // direction, and it must work the same way.
    const plan = [{ entitlement_key: 'ocr_monthly_limit', value_json: 500 }];
    const resolved = resolveEntitlements([
      ...plan,
      ...activeOverrides(
        [override({ entitlement_key: 'ocr_monthly_limit', value_json: 0 })],
        NOW,
      ),
    ]);
    expect(resolved.ocrMonthlyLimit).toBe(0);
  });

  it('applies the last override when two name the same key', () => {
    const resolved = resolveEntitlements(
      activeOverrides(
        [
          override({ entitlement_key: 'ocr_monthly_limit', value_json: 10 }),
          override({ entitlement_key: 'ocr_monthly_limit', value_json: 50 }),
        ],
        NOW,
      ),
    );
    expect(resolved.ocrMonthlyLimit).toBe(50);
  });
});
