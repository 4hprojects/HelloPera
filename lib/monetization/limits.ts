import type { Entitlements } from '@/lib/monetization/entitlements';

/**
 * Limit arithmetic — PHASE-09 §30, §32, §33.
 *
 * §32 distinguishes hard limits (OCR — refuse) from soft ones (storage —
 * warn). The distinction is per feature and documented here rather than
 * decided at each call site, which is how one of them ends up enforced the
 * wrong way.
 */

export const METERED_FEATURES = [
  'ocr_jobs',
  'ai_queries',
  'document_uploads',
  'exports',
] as const;
export type FeatureKey = (typeof METERED_FEATURES)[number];

export type LimitKind = 'hard' | 'soft' | 'unmetered';

/**
 * §32 — which features refuse and which only warn.
 *
 * OCR and AI are hard because each call spends real money with a provider.
 * Document uploads are soft: storage is cheap and comparatively elastic, and
 * refusing an upload would block the capture flow that the whole product is
 * built around. Exports are unmetered until Phase 11 gives them a limit worth
 * enforcing.
 */
export const LIMIT_KIND: Record<FeatureKey, LimitKind> = {
  ocr_jobs: 'hard',
  ai_queries: 'hard',
  document_uploads: 'soft',
  exports: 'unmetered',
};

/** The entitlement that caps each feature. null means no cap is defined. */
export function limitFor(feature: FeatureKey, entitlements: Entitlements): number | null {
  switch (feature) {
    case 'ocr_jobs':
      return entitlements.ocrMonthlyLimit;
    case 'ai_queries':
      return entitlements.aiMonthlyLimit;
    case 'document_uploads':
      return entitlements.maxDocuments;
    case 'exports':
      return null;
  }
}

export type UsageState = {
  feature: FeatureKey;
  used: number;
  limit: number | null;
  remaining: number | null;
  /** True only for a HARD limit that has been reached — a soft one never blocks. */
  blocked: boolean;
  /** True once the user is at or past the limit, hard or soft. */
  reached: boolean;
};

export function usageState(
  feature: FeatureKey,
  used: number,
  entitlements: Entitlements,
): UsageState {
  const limit = limitFor(feature, entitlements);
  const kind = LIMIT_KIND[feature];

  // No cap defined, or the feature is not metered: nothing to reach.
  if (limit === null || kind === 'unmetered') {
    return {
      feature,
      used,
      limit: null,
      remaining: null,
      blocked: false,
      reached: false,
    };
  }

  const remaining = Math.max(0, limit - used);
  const reached = used >= limit;

  return {
    feature,
    used,
    limit,
    remaining,
    blocked: reached && kind === 'hard',
    reached,
  };
}

/** Convenience for the §20 server-side gate. */
export function isLimitReached(
  feature: FeatureKey,
  used: number,
  entitlements: Entitlements,
): boolean {
  return usageState(feature, used, entitlements).blocked;
}
