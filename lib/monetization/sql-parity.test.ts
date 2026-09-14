import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ENTITLEMENT_KEYS,
  ENTITLING_STATUSES,
  FREE_FALLBACK,
  PLAN_CODES,
} from '@/lib/monetization/entitlements';
import { METERED_FEATURES } from '@/lib/monetization/limits';

/**
 * Parity between the monetization constants here and the migration.
 *
 * Three things exist in both places and must not drift:
 *
 *  - the entitlement key registry (a CHECK constraint in SQL, a union here),
 *  - the seeded Free values (rows in SQL, FREE_FALLBACK here),
 *  - the metered feature keys.
 *
 * The Free values matter most. `FREE_FALLBACK` is what a user gets when
 * entitlement resolution fails (§53), so if it drifts from the seeded Free
 * plan, a degraded system silently gives people a different product than the
 * one they signed up for — and nothing would surface it.
 */

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260914000500_phase09_monetization.sql'),
  'utf8',
);

describe('SQL ↔ TypeScript monetization parity', () => {
  it('registers the same entitlement keys (§9)', () => {
    for (const key of ENTITLEMENT_KEYS) {
      expect(MIGRATION, key).toContain(`'${key}'`);
    }
  });

  it('registers the same plan codes (§7)', () => {
    expect(MIGRATION).toContain(
      `check (code in (${PLAN_CODES.map((c) => `'${c}'`).join(', ')}))`,
    );
  });

  it('registers the same metered feature keys (§15)', () => {
    expect(MIGRATION).toContain(
      `check (feature_key in (${METERED_FEATURES.map((f) => `'${f}'`).join(', ')}))`,
    );
  });

  it('registers the same subscription statuses (§11)', () => {
    for (const status of ENTITLING_STATUSES) {
      expect(MIGRATION, status).toContain(`'${status}'`);
    }
  });

  it('seeds Free with exactly the values FREE_FALLBACK returns (§53)', () => {
    const seeded: Array<[string, string]> = [
      ['ocr_monthly_limit', String(FREE_FALLBACK.ocrMonthlyLimit)],
      ['ai_monthly_limit', String(FREE_FALLBACK.aiMonthlyLimit)],
      ['advanced_analytics', String(FREE_FALLBACK.advancedAnalytics)],
      ['forecast_horizon_days', String(FREE_FALLBACK.forecastHorizonDays)],
      ['export_enabled', String(FREE_FALLBACK.exportEnabled)],
      ['ads_shown', String(FREE_FALLBACK.adsShown)],
      ['document_retention_days', String(FREE_FALLBACK.documentRetentionDays)],
      ['premium_support', String(FREE_FALLBACK.premiumSupport)],
    ];

    for (const [key, value] of seeded) {
      // Matches the seed row shape: (v_free, 'key', 'value'::jsonb)
      const pattern = new RegExp(`\\(v_free,\\s*'${key}',\\s*'${value}'::jsonb\\)`);
      expect(MIGRATION, `${key} = ${value}`).toMatch(pattern);
    }
  });

  it('caps the premium forecast at what Phase 07 builds (§24, criterion 7)', () => {
    // Phase 07 implements 30/60/90 and refuses longer horizons. A premium
    // entitlement above 90 would be selling something that does not exist.
    const match = /\(v_premium,\s*'forecast_horizon_days',\s*'(\d+)'::jsonb\)/.exec(
      MIGRATION,
    );
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeLessThanOrEqual(90);
  });

  it('gives premium ads_shown = false (criterion 9)', () => {
    expect(MIGRATION).toMatch(/\(v_premium,\s*'ads_shown',\s*'false'::jsonb\)/);
  });

  it('ships billing_enabled off (§52)', () => {
    expect(MIGRATION).toMatch(/\('billing_enabled',\s*false/);
  });

  it('names the per-user entitlement ads_shown, never ads_enabled (§27)', () => {
    // Two controls one word apart with opposite scopes would be confused
    // during the incident where the kill switch matters.
    expect(MIGRATION).not.toMatch(/'ads_enabled'[^_]/);
    expect(MIGRATION).toContain("'ads_enabled_global'");
  });

  it('gives subscriptions and usage_records no write policy at all (§47)', () => {
    // The grep that would catch someone "helpfully" adding one.
    expect(MIGRATION).not.toMatch(
      /create policy .* on public\.subscriptions for (insert|update|delete)/i,
    );
    expect(MIGRATION).not.toMatch(
      /create policy .* on public\.usage_records for (insert|update|delete)/i,
    );
  });
});
