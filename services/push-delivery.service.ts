import 'server-only';

import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import { env, isPushConfigured } from '@/lib/env';
import { log } from '@/lib/log';
import { renderPushNotification } from '@/lib/notifications/copy';
import { notificationHref } from '@/lib/notifications/links';
import { isWithinQuietHours, type NotificationType } from '@/lib/notifications/rules';
import { recordPushFailure, recordPushSuccess } from '@/services/push.service';
import { isFlagEnabled } from '@/services/plan.service';

/**
 * Push delivery — PHASE-08 §23, §29, §30, §41, §55, §60.
 *
 * Server-side only (§55): the VAPID private key never reaches a browser, and
 * `server-only` makes importing this from a client component a build error
 * rather than a runtime leak.
 *
 * Nothing here changes financial state (§4). It reads pending notifications
 * and sends them.
 */

let configured = false;

function configure(): boolean {
  if (!isPushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT!,
      env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return true;
}

type Row = Record<string, unknown>;

/**
 * §29 — the payload.
 *
 * Deliberately thin: a type, a title, a body and a URL. §30 says not to put
 * sensitive financial detail in a push, and `renderPushNotification` already
 * strips amounts — this adds nothing back. The client reads the rest from the
 * app once opened, behind the session it already has.
 */
type PushPayload = {
  id: string;
  title: string;
  body: string;
  url: string;
};

/**
 * Send every pending push notification that is due.
 *
 * Called by the scheduler. Returns counts rather than throwing on individual
 * failures: one dead subscription must not stop the rest of the run.
 */
export async function deliverPendingPushes(limit = 200): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  if (!(await isFlagEnabled('push_enabled'))) {
    log.info('push: disabled by feature flag');
    return { sent: 0, failed: 0, skipped: 0 };
  }
  if (!configure()) {
    log.warn('push: VAPID not configured, skipping delivery');
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const admin = createAdminClient();

  // Only rows whose owner wants push, joined to their live subscriptions.
  const { data, error } = await admin
    .from('notifications')
    .select(
      `id, user_id, type, entity_id, metadata, scheduled_for,
       notification_preferences!inner (
         push_enabled, quiet_hours_enabled, quiet_hours_start,
         quiet_hours_end, timezone
       )`,
    )
    .eq('delivery_status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .limit(limit);

  if (error) {
    log.error('push: could not read pending notifications', { m: error.code });
    return { sent: 0, failed: 0, skipped: 0 };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of (data ?? []) as Row[]) {
    const prefs = (row.notification_preferences ?? {}) as Row;

    if (prefs.push_enabled !== true) {
      // Not a failure — the user simply does not want push. Marked skipped so
      // the row is not reconsidered on every run forever.
      await markStatus(row.id as string, 'skipped');
      skipped += 1;
      continue;
    }

    // §31, §32 — quiet hours DEFER, never drop. A reminder suppressed at 23:00
    // and discarded means the user is never told at all, which is worse than
    // telling them late.
    if (prefs.quiet_hours_enabled === true) {
      const tz = String(prefs.timezone ?? 'Asia/Manila');
      const localTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date());

      const start = String(prefs.quiet_hours_start ?? '22:00').slice(0, 5);
      const end = String(prefs.quiet_hours_end ?? '07:00').slice(0, 5);

      if (isWithinQuietHours(localTime, start, end)) {
        await deferUntilQuietHoursEnd(row.id as string, tz, end);
        skipped += 1;
        continue;
      }
    }

    const result = await sendToUser(row);
    if (result) sent += 1;
    else failed += 1;
  }

  return { sent, failed, skipped };
}

async function markStatus(
  id: string,
  status: 'sent' | 'failed' | 'skipped',
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('notifications')
    .update({
      delivery_status: status,
      delivered_at: status === 'sent' ? new Date().toISOString() : null,
    })
    .eq('id', id);
}

/**
 * Push the row's `scheduled_for` to the end of quiet hours.
 *
 * Left `pending`, so the next run picks it up — the row is not lost, just not
 * yet due.
 */
async function deferUntilQuietHoursEnd(
  id: string,
  timezone: string,
  end: string,
): Promise<void> {
  const admin = createAdminClient();

  // The next occurrence of `end` in the user's timezone. Computed by walking
  // forward an hour at a time rather than with date arithmetic across zones,
  // which is where DST bugs live.
  const now = new Date();
  const [h = '7', m = '0'] = end.split(':');
  let candidate = new Date(now.getTime());
  for (let i = 0; i < 48; i += 1) {
    candidate = new Date(now.getTime() + i * 30 * 60 * 1000);
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(candidate);
    const [ch = '0', cm = '0'] = local.split(':');
    if (Number(ch) === Number(h) && Math.abs(Number(cm) - Number(m)) < 30) break;
  }

  await admin
    .from('notifications')
    .update({ scheduled_for: candidate.toISOString() })
    .eq('id', id);
}

async function sendToUser(row: Row): Promise<boolean> {
  const admin = createAdminClient();
  const userId = String(row.user_id);
  const type = String(row.type) as NotificationType;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!subs || subs.length === 0) {
    await markStatus(String(row.id), 'skipped');
    return false;
  }

  // §14, §30 — no amounts on a lock screen.
  const rendered = renderPushNotification(type, {
    name: typeof meta.name === 'string' ? meta.name : undefined,
    days: typeof meta.days === 'number' ? meta.days : undefined,
    date: typeof meta.date === 'string' ? meta.date : undefined,
    count: typeof meta.count === 'number' ? meta.count : undefined,
  });

  const payload: PushPayload = {
    id: String(row.id),
    title: rendered.title,
    body: rendered.message,
    url: notificationHref(type, (row.entity_id as string) ?? null) ?? '/notifications',
  };

  let anySucceeded = false;

  // §27 — every device the user has allowed.
  for (const s of subs as Row[]) {
    const endpoint = String(s.endpoint);
    try {
      await webpush.sendNotification(
        {
          endpoint,
          keys: { p256dh: String(s.p256dh), auth: String(s.auth) },
        },
        JSON.stringify(payload),
      );
      await recordPushSuccess(endpoint);
      anySucceeded = true;
    } catch (error) {
      const statusCode =
        typeof error === 'object' && error !== null && 'statusCode' in error
          ? Number((error as { statusCode: unknown }).statusCode)
          : null;
      // 404/410 is a subscription that is gone for good; anything else counts
      // toward three strikes (§60).
      await recordPushFailure(endpoint, statusCode);
      log.warn('push: send failed', { code: statusCode ?? 'unknown' });
    }
  }

  // The stored title/message record what was actually SENT, which is a
  // different question from what the row would say if rendered now.
  await admin
    .from('notifications')
    .update({
      delivery_status: anySucceeded ? 'sent' : 'failed',
      delivered_at: anySucceeded ? new Date().toISOString() : null,
      title: payload.title,
      message: payload.body,
    })
    .eq('id', String(row.id));

  return anySucceeded;
}
