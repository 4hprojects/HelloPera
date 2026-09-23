import { describe, expect, it } from 'vitest';
import {
  FLAG_GROUP_ORDER,
  KNOWN_FLAG_KEYS,
  flagInfo,
  humaniseFlagKey,
} from '@/lib/admin/flag-catalog';

/** The eight rows the migrations seed into `feature_flags`. */
const SEEDED = [
  'ads_enabled_global',
  'billing_enabled',
  'premium_enabled',
  'ai_enabled',
  'ocr_enabled',
  'push_enabled',
  'financial_writes_enabled',
  'retention_enabled',
];

describe('flag catalog', () => {
  it('describes every seeded switch', () => {
    for (const key of SEEDED) {
      expect(KNOWN_FLAG_KEYS, key).toContain(key);
      const info = flagInfo(key);
      expect(info.title.length, key).toBeGreaterThan(0);
      expect(info.description.length, key).toBeGreaterThan(20);
    }
  });

  it('never shows a developer key in a title or description', () => {
    for (const key of KNOWN_FLAG_KEYS) {
      const { title, description } = flagInfo(key);
      expect(title, key).not.toMatch(/_/);
      expect(description, key).not.toMatch(/_/);
      expect(description, key).not.toContain(key);
    }
  });

  it('puts every switch in a group the page renders', () => {
    for (const key of KNOWN_FLAG_KEYS) {
      expect(FLAG_GROUP_ORDER, key).toContain(flagInfo(key).group);
    }
  });

  it('marks the switches no code reads as not connected', () => {
    // If one of these starts doing something, this test is the reminder to flip
    // `connected` in the catalog so the page stops saying it has no effect.
    for (const key of ['premium_enabled']) {
      expect(flagInfo(key).connected, key).toBe(false);
    }
    for (const key of [
      'ads_enabled_global',
      'billing_enabled',
      'ai_enabled',
      'ocr_enabled',
      'push_enabled',
      'financial_writes_enabled',
      'retention_enabled',
    ]) {
      expect(flagInfo(key).connected, key).toBe(true);
    }
  });

  it('warns in the risky direction of each dangerous switch', () => {
    // Turning the freeze OFF stops everyone writing; turning cleanup ON deletes data.
    expect(flagInfo('financial_writes_enabled').caution?.when).toBe('off');
    expect(flagInfo('retention_enabled').caution?.when).toBe('on');
  });
});

describe('humaniseFlagKey', () => {
  it('turns a key into words', () => {
    expect(humaniseFlagKey('some_new_flag_enabled')).toBe('Some new flag');
    expect(humaniseFlagKey('dark-launch')).toBe('Dark launch');
  });

  it('gives an unknown switch a readable name and stays connected', () => {
    const info = flagInfo('beta_reports_enabled');
    expect(info.title).toBe('Beta reports');
    expect(info.connected).toBe(true);
    expect(info.title).not.toMatch(/_/);
  });

  it('survives an empty key', () => {
    expect(humaniseFlagKey('')).toBe('Unnamed switch');
    expect(humaniseFlagKey('_enabled')).toBe('Unnamed switch');
  });
});
