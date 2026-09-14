import type {
  Entitlements,
  PlanCode,
  SubscriptionStatus,
} from '@/lib/monetization/entitlements';
import type { FeatureKey, UsageState } from '@/lib/monetization/limits';
import type { UsagePeriod } from '@/lib/monetization/periods';

/**
 * Monetization — PHASE-09 §6, §10, §13, §34.
 *
 * No `server-only` import, so `lib/`, `services/` and components can share.
 */

export type Plan = {
  id: string;
  code: PlanCode;
  name: string;
  description: string | null;
  isActive: boolean;
  isPublic: boolean;
  billingInterval: 'month' | 'year' | null;
  /** Null until pricing is finalised — §36 says show no invented numbers. */
  priceAmount: string | null;
  currencyCode: string;
};

export type Subscription = {
  id: string;
  planId: string;
  status: SubscriptionStatus;
  provider: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
  gracePeriodEnd: string | null;
};

/** What `getEffectivePlan` resolves to — §12. */
export type EffectivePlan = {
  plan: Plan;
  entitlements: Entitlements;
  /** Null for a Free user, who has no subscription row at all (§11). */
  subscription: Subscription | null;
  /** False while `billing_enabled` is off (§52) — no upgrade surfaces. */
  billingEnabled: boolean;
};

/** §34 — the usage dashboard's view model. */
export type UsageSummary = {
  period: UsagePeriod;
  /** YYYY-MM-DD the limits reset — the §33 copy. */
  resetsOn: string;
  features: UsageState[];
};

export type { Entitlements, FeatureKey, PlanCode, UsagePeriod, UsageState };
