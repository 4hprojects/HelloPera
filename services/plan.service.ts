import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import {
  activeOverrides,
  FREE_FALLBACK,
  grantsPaidPlan,
  resolveEntitlements,
  type Entitlements,
  type EntitlementRow,
  type OverrideRow,
  type PlanCode,
  type SubscriptionStatus,
} from '@/lib/monetization/entitlements';
import type { EffectivePlan, Plan, Subscription } from '@/types/monetization';

/**
 * Plan and entitlement resolution — PHASE-09 §12, §13, §52, §53.
 *
 * §12: "Do not let client choose effective plan." Nothing here accepts a plan
 * from a caller — the only input is a user id, and the answer comes from the
 * database.
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

const FREE_PLAN: Plan = {
  id: '',
  code: 'free',
  name: 'Free',
  description: 'Everything you need to track your money by hand.',
  isActive: true,
  isPublic: true,
  billingInterval: null,
  priceAmount: null,
  currencyCode: 'PHP',
};

function toPlan(row: Row): Plan {
  return {
    id: String(row.id),
    code: String(row.code) as PlanCode,
    name: String(row.name),
    description: str(row.description),
    isActive: row.is_active !== false,
    isPublic: row.is_public !== false,
    billingInterval: str(row.billing_interval) as 'month' | 'year' | null,
    priceAmount: str(row.price_amount),
    currencyCode: str(row.currency_code) ?? 'PHP',
  };
}

/**
 * §50, §52 — system-wide kill switches.
 *
 * Read with the admin client because `feature_flags` is operational and has no
 * browser access at all. A missing or unreadable flag is treated as OFF, which
 * for `billing_enabled` means monetization stays dark rather than half-on.
 */
export async function isFlagEnabled(key: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('feature_flags')
      .select('enabled')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      log.error('flags: read failed', { key, m: error.code });
      return false;
    }
    return (data as Row | null)?.enabled === true;
  } catch (error) {
    log.error('flags: read threw', {
      key,
      m: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}

/**
 * §12 — the effective plan for a user.
 *
 * A paid plan requires a subscription row in an entitling state. Everything
 * else is Free: no row, a cancelled row, an expired row, or a lookup that
 * failed outright (§53).
 *
 * While `billing_enabled` is false (§52) every user resolves Free regardless
 * of what their subscription row says. That is what makes monetization-
 * disabled mode genuinely safe to develop against — a stray subscription row
 * cannot turn on features that are not ready to be sold.
 */
/**
 * PHASE-13 §19 — this user's overrides that are in effect right now.
 *
 * Fails to an empty list rather than throwing. An unreadable override table
 * must leave someone on their plan, not strip them of it — §53's rule that a
 * failure grants Free and never nothing applies here too, one level down.
 */
async function activeOverrideRows(userId: string): Promise<EntitlementRow[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('entitlement_overrides')
      .select('entitlement_key, value_json, starts_at, ends_at')
      .eq('user_id', userId);

    if (error) {
      // Before the Phase 13 migration runs, the table does not exist.
      log.warn('plan: overrides unavailable', { code: error.code });
      return [];
    }

    return activeOverrides((data ?? []) as OverrideRow[]);
  } catch (error) {
    log.error('plan: override read threw', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return [];
  }
}

export async function getEffectivePlan(_userId: string): Promise<EffectivePlan> {
  // `_userId` is deliberately unused. The session client carries the user's
  // JWT and RLS scopes both reads, so there is no `user_id` predicate to write
  // — and therefore none to get wrong. The parameter stays because §12 names
  // the function this way and because it documents whose plan is being asked
  // for at every call site.
  const billingEnabled = await isFlagEnabled('billing_enabled');

  try {
    const supabase = await createClient();

    const { data: subRow } = await supabase
      .from('subscriptions')
      .select(
        `id, plan_id, status, provider, current_period_start, current_period_end,
         cancel_at_period_end, trial_end, grace_period_end`,
      )
      .maybeSingle();

    const sub = subRow as Row | null;
    const status = str(sub?.status) as SubscriptionStatus | null;

    const paid = billingEnabled && sub !== null && grantsPaidPlan(status);
    const planId = paid ? String(sub!.plan_id) : null;

    const { data: planRow } = planId
      ? await supabase.from('plans').select('*').eq('id', planId).maybeSingle()
      : await supabase.from('plans').select('*').eq('code', 'free').maybeSingle();

    const plan = planRow ? toPlan(planRow as Row) : FREE_PLAN;

    const { data: entRows } = await supabase
      .from('plan_entitlements')
      .select('entitlement_key, value_json')
      .eq('plan_id', plan.id);

    // PHASE-13 §19 — per-user overrides, appended after the plan's rows so they
    // win for the keys they name and leave the rest of the plan alone.
    //
    // Read with the admin client: `entitlement_overrides` is an operational
    // table with no browser access at all, so the session client cannot see it.
    // That is the point — a user must not be able to read, let alone write, the
    // record of a grant made about them.
    const overrides = await activeOverrideRows(_userId);

    const entitlements = resolveEntitlements([
      ...((entRows ?? []) as EntitlementRow[]),
      ...overrides,
    ]);

    const subscription: Subscription | null = sub
      ? {
          id: String(sub.id),
          planId: String(sub.plan_id),
          status: (status ?? 'inactive') as SubscriptionStatus,
          provider: str(sub.provider),
          currentPeriodStart: str(sub.current_period_start),
          currentPeriodEnd: str(sub.current_period_end),
          cancelAtPeriodEnd: sub.cancel_at_period_end === true,
          trialEnd: str(sub.trial_end),
          gracePeriodEnd: str(sub.grace_period_end),
        }
      : null;

    return { plan, entitlements, subscription, billingEnabled };
  } catch (error) {
    // §53 — a failure grants Free, never Premium, and never nothing.
    log.error('plan: resolution failed, falling back to Free', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return {
      plan: FREE_PLAN,
      entitlements: FREE_FALLBACK,
      subscription: null,
      billingEnabled,
    };
  }
}

/** §13 — the common case, when only capability matters. */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  return (await getEffectivePlan(userId)).entitlements;
}

/** Every public plan, for the pricing and plan pages. */
export async function listPublicPlans(): Promise<
  Array<Plan & { entitlements: Entitlements }>
> {
  const supabase = await createClient();

  const { data: plans, error } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .eq('is_public', true)
    .order('price_amount', { ascending: true, nullsFirst: true });

  if (error) {
    log.error('plan: list failed', { m: error.code });
    return [];
  }

  const { data: allEntitlements } = await supabase
    .from('plan_entitlements')
    .select('plan_id, entitlement_key, value_json');

  const byPlan = new Map<
    string,
    Array<{ entitlement_key: string; value_json: unknown }>
  >();
  for (const row of (allEntitlements ?? []) as Row[]) {
    const key = String(row.plan_id);
    const list = byPlan.get(key) ?? [];
    list.push({
      entitlement_key: String(row.entitlement_key),
      value_json: row.value_json,
    });
    byPlan.set(key, list);
  }

  return (plans ?? []).map((p) => {
    const plan = toPlan(p as Row);
    return { ...plan, entitlements: resolveEntitlements(byPlan.get(plan.id) ?? []) };
  });
}
