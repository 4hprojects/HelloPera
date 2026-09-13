import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import type { PushSubscriptionInput } from '@/schemas/notification.schema';
import type { PushDevice } from '@/types/notifications';

/**
 * Push subscriptions — PHASE-08 §24, §25, §27, §28, §55, §60.
 *
 * Every function here uses the admin client, because `push_subscriptions` is
 * not readable by the browser role at all — not even a user's own rows. The
 * table holds `p256dh` and `auth`, the device's encryption keys: anyone with
 * those plus the VAPID private key can push to that device, so they never
 * cross the wire to a client (§25), and the device list is assembled here
 * from the harmless columns only.
 */

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** §51 — what the settings page may show. Never the keys. */
export async function listPushDevices(userId: string): Promise<PushDevice[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, user_agent, is_active, created_at, last_success_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    log.error('push: device list failed', { m: error.code });
    return [];
  }

  return (data ?? []).map((r) => {
    const row = r as Row;
    return {
      id: String(row.id),
      userAgent: str(row.user_agent),
      isActive: Boolean(row.is_active),
      createdAt: String(row.created_at),
      lastSuccessAt: str(row.last_success_at),
    };
  });
}

/**
 * §27 — one row per device, keyed on the endpoint.
 *
 * A browser re-subscribes whenever its subscription is refreshed, and returns
 * the same endpoint for the same device. Upserting on it is what keeps a
 * device from accumulating a row per visit — and what lets a previously
 * disabled subscription come back to life when the user re-grants permission.
 */
export async function savePushSubscription(
  userId: string,
  input: PushSubscriptionInput,
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent || null,
      is_active: true,
      failure_count: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );

  if (error) throw new Error(`Could not register this device: ${error.code}`);
}

/**
 * Remove a device.
 *
 * Scoped by user_id as well as id: the admin client bypasses RLS, so the
 * ownership predicate here is the check, not a convenience.
 */
export async function deletePushSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint);

  if (error) throw new Error(`Could not remove this device: ${error.code}`);
}

/**
 * §28, §60 — record a delivery failure.
 *
 * A 404 or 410 from the push service means the subscription is permanently
 * gone: the user cleared site data or revoked permission, and it will never
 * work again. Retrying it forever wastes a request per notification per run.
 *
 * Anything else is treated as transient and counted; three strikes disables
 * it, which is §60's "max 3 attempts" applied to the subscription rather than
 * to a single send.
 */
export async function recordPushFailure(
  endpoint: string,
  statusCode: number | null,
): Promise<void> {
  const admin = createAdminClient();
  const permanent = statusCode === 404 || statusCode === 410;

  if (permanent) {
    await admin
      .from('push_subscriptions')
      .update({
        is_active: false,
        last_failure_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('endpoint', endpoint);
    return;
  }

  const { data } = await admin
    .from('push_subscriptions')
    .select('failure_count')
    .eq('endpoint', endpoint)
    .maybeSingle();

  const next = Number((data as Row | null)?.failure_count ?? 0) + 1;

  await admin
    .from('push_subscriptions')
    .update({
      failure_count: next,
      is_active: next < 3,
      last_failure_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('endpoint', endpoint);
}

export async function recordPushSuccess(endpoint: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('push_subscriptions')
    .update({
      failure_count: 0,
      last_success_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('endpoint', endpoint);
}
