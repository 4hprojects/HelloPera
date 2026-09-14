/**
 * Entitlements — PHASE-09 §4, §8, §9, §13, §53.
 *
 * §4 is the rule this module exists to enforce: capability is decided by an
 * entitlement, never by comparing a plan name. `if (plan === 'premium')`
 * scattered through the app is what makes pricing changes into deploys, and
 * makes a missed check into a free feature.
 *
 * Pure and dependency-free, so every resolution rule is testable.
 */

export const PLAN_CODES = ['free', 'premium'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/**
 * The registry. §9: "Do not create arbitrary keys without documentation."
 *
 * The database CHECK constraint carries the same list, so a typo is an error
 * rather than a key that silently resolves to its safe default forever.
 */
export const ENTITLEMENT_KEYS = [
  'ocr_monthly_limit',
  'ai_monthly_limit',
  'advanced_analytics',
  /** §24 — a number of days, capped at what Phase 07 built. Never a boolean. */
  'forecast_horizon_days',
  'export_enabled',
  /** §27 — per-user. Phase 10's system kill switch is `ads_enabled_global`. */
  'ads_shown',
  'document_retention_days',
  'max_documents',
  'max_accounts',
  'premium_support',
] as const;
export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

/** A resolved entitlement set, in the shape §13 specifies. */
export type Entitlements = {
  ocrMonthlyLimit: number;
  aiMonthlyLimit: number;
  advancedAnalytics: boolean;
  forecastHorizonDays: number;
  exportEnabled: boolean;
  adsShown: boolean;
  documentRetentionDays: number;
  /** null means no limit — §28 says not to limit accounts unnecessarily. */
  maxDocuments: number | null;
  maxAccounts: number | null;
  premiumSupport: boolean;
};

/**
 * §53 — the safe fallback.
 *
 * "If entitlement service fails: do not accidentally grant premium."
 *
 * Every resolution path lands here when a value is missing, malformed, or the
 * lookup failed outright. It is deliberately identical to the seeded Free
 * plan: a degraded system gives the user the free product, never the paid one,
 * and never nothing at all.
 */
export const FREE_FALLBACK: Entitlements = {
  ocrMonthlyLimit: 30,
  aiMonthlyLimit: 5,
  advancedAnalytics: false,
  forecastHorizonDays: 30,
  exportEnabled: false,
  adsShown: true,
  documentRetentionDays: 30,
  maxDocuments: null,
  maxAccounts: null,
  premiumSupport: false,
};

/** One row as it arrives from `plan_entitlements`. */
export type EntitlementRow = {
  entitlement_key: string;
  value_json: unknown;
};

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** null is meaningful here — it means "no limit", not "missing". */
function asNullableNumber(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Turn rows into a resolved set.
 *
 * Anything absent or of the wrong type falls back to Free's value for that
 * key — per key, not all-or-nothing. One corrupt row must not silently
 * downgrade a paying customer's entire plan, nor upgrade a free one.
 */
export function resolveEntitlements(rows: readonly EntitlementRow[]): Entitlements {
  const map = new Map<string, unknown>();
  for (const row of rows) map.set(row.entitlement_key, row.value_json);

  return {
    ocrMonthlyLimit: asNumber(
      map.get('ocr_monthly_limit'),
      FREE_FALLBACK.ocrMonthlyLimit,
    ),
    aiMonthlyLimit: asNumber(map.get('ai_monthly_limit'), FREE_FALLBACK.aiMonthlyLimit),
    advancedAnalytics: asBoolean(
      map.get('advanced_analytics'),
      FREE_FALLBACK.advancedAnalytics,
    ),
    forecastHorizonDays: asNumber(
      map.get('forecast_horizon_days'),
      FREE_FALLBACK.forecastHorizonDays,
    ),
    exportEnabled: asBoolean(map.get('export_enabled'), FREE_FALLBACK.exportEnabled),
    adsShown: asBoolean(map.get('ads_shown'), FREE_FALLBACK.adsShown),
    documentRetentionDays: asNumber(
      map.get('document_retention_days'),
      FREE_FALLBACK.documentRetentionDays,
    ),
    maxDocuments: asNullableNumber(map.get('max_documents'), FREE_FALLBACK.maxDocuments),
    maxAccounts: asNullableNumber(map.get('max_accounts'), FREE_FALLBACK.maxAccounts),
    premiumSupport: asBoolean(map.get('premium_support'), FREE_FALLBACK.premiumSupport),
  };
}

/**
 * §11, §12 — which subscription states grant the paid plan.
 *
 * `trialing` and `grace` count: a trial is the product being sold, and a grace
 * period exists precisely so a failed payment does not instantly strip
 * features from someone who is about to fix it (§42). `past_due` does not —
 * by the time it is set, grace has already been offered and declined.
 */
export const ENTITLING_STATUSES = ['active', 'trialing', 'grace'] as const;
export type SubscriptionStatus =
  'active' | 'trialing' | 'past_due' | 'grace' | 'cancelled' | 'expired' | 'inactive';

export function grantsPaidPlan(status: string | null | undefined): boolean {
  return (ENTITLING_STATUSES as readonly string[]).includes(status ?? '');
}

/**
 * §24 — the horizons a plan may actually select.
 *
 * Phase 07 builds exactly 30/60/90 and refuses longer ones because they
 * extrapolate past any evidence the recurring rules still hold. This filters
 * that fixed set by the entitlement, so a plan can never offer a horizon the
 * forecast engine does not implement — criterion 7.
 */
export function allowedHorizons(
  entitlements: Entitlements,
  supported: readonly number[],
): number[] {
  return supported.filter((h) => h <= entitlements.forecastHorizonDays);
}
