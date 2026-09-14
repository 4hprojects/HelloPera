import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';

/**
 * Operational monetization data — PHASE-09 §44, §48.
 *
 * §48 draws the line this file has to respect: "Admin should not use
 * monetization role to access private financial content." So every query here
 * returns COUNTS and plan configuration — never a balance, a transaction, a
 * receipt, or a name attached to a figure.
 *
 * Uses the admin client because `feature_flags` and `subscription_events` have
 * no browser access at all, and because aggregate counts across users cannot
 * come through an RLS-scoped client by definition.
 */

type Row = Record<string, unknown>;

export type MonetizationOverview = {
  subscriptionsByStatus: Array<{ status: string; count: number }>;
  planCounts: Array<{ code: string; name: string; subscribers: number }>;
  flags: Array<{ key: string; enabled: boolean }>;
  /** Aggregate only — how much metered work happened, by nobody in particular. */
  usageThisPeriod: Array<{ feature: string; users: number; total: number }>;
  unprocessedEvents: number;
};

export async function getMonetizationOverview(
  periodStart: string,
): Promise<MonetizationOverview> {
  const admin = createAdminClient();

  const empty: MonetizationOverview = {
    subscriptionsByStatus: [],
    planCounts: [],
    flags: [],
    usageThisPeriod: [],
    unprocessedEvents: 0,
  };

  try {
    const [subs, plans, flags, usage, events] = await Promise.all([
      admin.from('subscriptions').select('status, plan_id'),
      admin.from('plans').select('id, code, name'),
      admin.from('feature_flags').select('key, enabled').order('key'),
      admin
        .from('usage_records')
        .select('feature_key, quantity, user_id')
        .eq('period_start', periodStart),
      admin
        .from('subscription_events')
        .select('id', { count: 'exact', head: true })
        .eq('processing_status', 'pending'),
    ]);

    const subRows = (subs.data ?? []) as Row[];

    const byStatus = new Map<string, number>();
    const byPlan = new Map<string, number>();
    for (const r of subRows) {
      const status = String(r.status);
      byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
      const planId = String(r.plan_id);
      byPlan.set(planId, (byPlan.get(planId) ?? 0) + 1);
    }

    const usageRows = (usage.data ?? []) as Row[];
    const usageAgg = new Map<string, { users: Set<string>; total: number }>();
    for (const r of usageRows) {
      const key = String(r.feature_key);
      const entry = usageAgg.get(key) ?? { users: new Set<string>(), total: 0 };
      entry.users.add(String(r.user_id));
      entry.total += Number(r.quantity ?? 0);
      usageAgg.set(key, entry);
    }

    return {
      subscriptionsByStatus: [...byStatus.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      planCounts: ((plans.data ?? []) as Row[]).map((p) => ({
        code: String(p.code),
        name: String(p.name),
        subscribers: byPlan.get(String(p.id)) ?? 0,
      })),
      flags: ((flags.data ?? []) as Row[]).map((f) => ({
        key: String(f.key),
        enabled: f.enabled === true,
      })),
      usageThisPeriod: [...usageAgg.entries()]
        .map(([feature, v]) => ({ feature, users: v.users.size, total: v.total }))
        .sort((a, b) => b.total - a.total),
      unprocessedEvents: events.count ?? 0,
    };
  } catch (error) {
    log.error('admin: monetization overview failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return empty;
  }
}
