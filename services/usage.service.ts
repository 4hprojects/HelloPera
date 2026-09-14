import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import { getEntitlements } from '@/services/plan.service';
import { currentPeriod, resetsOn } from '@/lib/monetization/periods';
import {
  METERED_FEATURES,
  usageState,
  type FeatureKey,
  type UsageState,
} from '@/lib/monetization/limits';
import type { UsageSummary } from '@/types/monetization';

/**
 * Usage metering — PHASE-09 §17, §29, §30, §31.
 *
 * §17 is the authoritative counting rule and the reason the two functions
 * below are separate:
 *
 *   Request rejected before the provider is called   -> not counted
 *   Provider invoked, any outcome                    -> counted once
 *   Retry caused by a HelloPera fault                -> not counted again
 *   Retry requested by the user                      -> counted
 *
 * `assertWithinLimit` runs before the provider; `recordUsage` runs once the
 * call is committed. Collapsing them into one "check and increment" helper
 * would count rejected requests, which is the user paying for HelloPera
 * saying no.
 */

export class UsageLimitError extends Error {
  readonly feature: FeatureKey;
  readonly used: number;
  readonly limit: number;
  readonly resetsOn: string;

  constructor(state: UsageState, resets: string) {
    super(`Monthly limit reached for ${state.feature}`);
    this.name = 'UsageLimitError';
    this.feature = state.feature;
    this.used = state.used;
    this.limit = state.limit ?? 0;
    this.resetsOn = resets;
  }
}

type Row = Record<string, unknown>;

/** Current-period usage for one feature. RLS scopes the read. */
export async function getUsage(feature: FeatureKey, timezone: string): Promise<number> {
  const period = currentPeriod(timezone);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('usage_records')
    .select('quantity')
    .eq('feature_key', feature)
    .eq('period_start', period.start)
    .maybeSingle();

  if (error) {
    log.error('usage: read failed', { feature, m: error.code });
    // Fail CLOSED for a metered feature: an unreadable counter must not be
    // treated as zero, which would hand out unlimited provider calls to
    // anyone who could make the read fail.
    throw new Error('We could not check your usage. Please try again.');
  }

  return Number((data as Row | null)?.quantity ?? 0);
}

/**
 * §20, §31 — the server-side gate, before the provider is called.
 *
 * Throws `UsageLimitError` when a HARD limit is reached. A soft limit never
 * throws (§32); the caller may warn.
 */
export async function assertWithinLimit(
  userId: string,
  feature: FeatureKey,
  timezone: string,
): Promise<UsageState> {
  const [entitlements, used] = await Promise.all([
    getEntitlements(userId),
    getUsage(feature, timezone),
  ]);

  const state = usageState(feature, used, entitlements);
  if (state.blocked) {
    throw new UsageLimitError(state, resetsOn(currentPeriod(timezone)));
  }
  return state;
}

/**
 * §17, §31 — count one use, atomically.
 *
 * Called once the provider is committed to, so a provider error still counts:
 * it cost money. A HelloPera-side failure before this point does not, which is
 * the gap §17 wants preserved between `ocr_jobs.attempt_count` and
 * `usage_records.quantity`.
 *
 * The RPC does insert-or-add in one statement. A read-then-write here would
 * lose exactly the race §31 describes.
 */
export async function recordUsage(
  userId: string,
  feature: FeatureKey,
  timezone: string,
  quantity = 1,
): Promise<number> {
  const period = currentPeriod(timezone);
  const admin = createAdminClient();

  const { data, error } = await admin.rpc('increment_usage', {
    p_user_id: userId,
    p_feature_key: feature,
    p_period_start: period.start,
    p_period_end: period.end,
    p_quantity: quantity,
  });

  if (error) {
    // Never fail the user's operation because metering failed — the provider
    // call has already happened. Loud in the log, silent to them.
    log.error('usage: increment failed', { feature, m: error.code });
    return -1;
  }

  return Number(data ?? 0);
}

/** §34 — the usage dashboard. */
export async function getUsageSummary(
  userId: string,
  timezone: string,
): Promise<UsageSummary> {
  const period = currentPeriod(timezone);
  const entitlements = await getEntitlements(userId);

  const supabase = await createClient();
  const { data } = await supabase
    .from('usage_records')
    .select('feature_key, quantity')
    .eq('period_start', period.start);

  const used = new Map<string, number>();
  for (const row of (data ?? []) as Row[]) {
    used.set(String(row.feature_key), Number(row.quantity ?? 0));
  }

  return {
    period,
    resetsOn: resetsOn(period),
    features: METERED_FEATURES.map((f) => usageState(f, used.get(f) ?? 0, entitlements)),
  };
}
