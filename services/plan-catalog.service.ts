import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import { FREE_FALLBACK, resolveEntitlements } from '@/lib/monetization/entitlements';
import type { Entitlements, PlanCode } from '@/lib/monetization/entitlements';

/**
 * The public plan catalogue — PHASE-10 §15.
 *
 * Separate from `services/plan.service.ts` for one reason: **this must not read
 * cookies.**
 *
 * `listPublicPlans()` uses the RLS-scoped session client, which is correct
 * inside the authenticated app. On `/pricing` it would make the route dynamic,
 * costing a database round trip on every crawl and every visitor, for data
 * that is the same for everyone and changes about once a quarter.
 *
 * Plans and entitlements are public information — the pricing page exists to
 * publish them — so reading them with the admin client leaks nothing. Nothing
 * here touches a user row.
 */

type Row = Record<string, unknown>;

export type PlanSummary = {
  code: PlanCode;
  name: string;
  description: string | null;
  entitlements: Entitlements;
};

/**
 * Every public plan, cheapest first.
 *
 * Returns an empty array rather than throwing: a pricing page that 500s
 * because the database is briefly unreachable is worse than one that renders
 * its static copy. The page falls back to describing the free tier from the
 * same defaults `FREE_FALLBACK` uses.
 */
export async function listPublicPlanSummaries(): Promise<PlanSummary[]> {
  try {
    const admin = createAdminClient();

    const { data: plans, error } = await admin
      .from('plans')
      .select('id, code, name, description')
      .eq('is_active', true)
      .eq('is_public', true)
      .order('price_amount', { ascending: true, nullsFirst: true });

    if (error) {
      log.error('pricing: plan read failed', { m: error.code });
      return [];
    }

    const { data: entitlements } = await admin
      .from('plan_entitlements')
      .select('plan_id, entitlement_key, value_json');

    const byPlan = new Map<
      string,
      Array<{ entitlement_key: string; value_json: unknown }>
    >();
    for (const row of (entitlements ?? []) as Row[]) {
      const key = String(row.plan_id);
      const list = byPlan.get(key) ?? [];
      list.push({
        entitlement_key: String(row.entitlement_key),
        value_json: row.value_json,
      });
      byPlan.set(key, list);
    }

    return (plans ?? []).map((p) => {
      const row = p as Row;
      const id = String(row.id);
      return {
        code: String(row.code) as PlanCode,
        name: String(row.name),
        description: typeof row.description === 'string' ? row.description : null,
        entitlements: byPlan.has(id)
          ? resolveEntitlements(byPlan.get(id)!)
          : FREE_FALLBACK,
      };
    });
  } catch (error) {
    log.error('pricing: plan catalogue threw', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return [];
  }
}
