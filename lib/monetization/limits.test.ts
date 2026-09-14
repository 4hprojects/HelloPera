import { describe, expect, it } from 'vitest';
import { FREE_FALLBACK, type Entitlements } from '@/lib/monetization/entitlements';
import {
  LIMIT_KIND,
  METERED_FEATURES,
  isLimitReached,
  limitFor,
  usageState,
} from '@/lib/monetization/limits';

const free: Entitlements = FREE_FALLBACK;
const premium: Entitlements = {
  ...FREE_FALLBACK,
  ocrMonthlyLimit: 500,
  aiMonthlyLimit: 100,
  adsShown: false,
};

describe('usageState — §32, §33', () => {
  it('counts down remaining against a hard limit', () => {
    const s = usageState('ocr_jobs', 18, free);
    expect(s.limit).toBe(30);
    expect(s.remaining).toBe(12);
    expect(s.reached).toBe(false);
    expect(s.blocked).toBe(false);
  });

  it('blocks a hard limit exactly at the limit, not one past it', () => {
    // Off-by-one here is the difference between 30 scans and 31.
    expect(usageState('ocr_jobs', 29, free).blocked).toBe(false);
    expect(usageState('ocr_jobs', 30, free).blocked).toBe(true);
    expect(usageState('ocr_jobs', 31, free).blocked).toBe(true);
  });

  it('never reports negative remaining', () => {
    expect(usageState('ocr_jobs', 45, free).remaining).toBe(0);
  });

  it('warns but never blocks on a soft limit (§32)', () => {
    // Refusing an upload would block the capture flow the product is built
    // around; storage is elastic in a way a provider call is not.
    const limited: Entitlements = { ...free, maxDocuments: 10 };
    const s = usageState('document_uploads', 50, limited);
    expect(s.reached).toBe(true);
    expect(s.blocked).toBe(false);
  });

  it('treats an unmetered feature as having nothing to reach', () => {
    const s = usageState('exports', 9999, premium);
    expect(s.limit).toBeNull();
    expect(s.remaining).toBeNull();
    expect(s.blocked).toBe(false);
    expect(s.reached).toBe(false);
  });

  it('treats a null limit as no limit, not as zero', () => {
    // The bug this guards: reading "no limit" as 0 would block everything for
    // exactly the users who were meant to be unrestricted.
    const s = usageState('document_uploads', 1000, free);
    expect(free.maxDocuments).toBeNull();
    expect(s.blocked).toBe(false);
    expect(s.reached).toBe(false);
  });

  it('gives premium the higher ceiling', () => {
    expect(usageState('ocr_jobs', 100, free).blocked).toBe(true);
    expect(usageState('ocr_jobs', 100, premium).blocked).toBe(false);
    expect(usageState('ocr_jobs', 100, premium).remaining).toBe(400);
  });
});

describe('configuration completeness', () => {
  it('classifies every metered feature (§32)', () => {
    for (const f of METERED_FEATURES) {
      expect(LIMIT_KIND[f], f).toBeTruthy();
    }
  });

  it('maps every feature to an entitlement or explicit null', () => {
    for (const f of METERED_FEATURES) {
      expect(() => limitFor(f, free), f).not.toThrow();
    }
  });

  it('makes the money-spending features hard limits', () => {
    // Each of these calls a paid provider; a soft limit would mean unbounded
    // spend on a free account.
    expect(LIMIT_KIND.ocr_jobs).toBe('hard');
    expect(LIMIT_KIND.ai_queries).toBe('hard');
  });
});

describe('isLimitReached — the §20 server gate', () => {
  it('agrees with usageState.blocked', () => {
    for (const used of [0, 29, 30, 31, 500]) {
      expect(isLimitReached('ocr_jobs', used, free)).toBe(
        usageState('ocr_jobs', used, free).blocked,
      );
    }
  });
});
