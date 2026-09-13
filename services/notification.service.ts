import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromDatabase, formatMoney } from '@/lib/money';
import { log } from '@/lib/log';
import { renderNotification } from '@/lib/notifications/copy';
import { notificationHref } from '@/lib/notifications/links';
import type { NotificationType } from '@/lib/notifications/rules';
import type {
  DeliveryStatus,
  Notification,
  NotificationPreferences,
} from '@/types/notifications';

/**
 * Notifications — PHASE-08 §19, §21, §39, §66, §67.
 *
 * Reads go through the RLS-scoped session client. Writes go through the admin
 * client with ownership checked in code first — including marking read, which
 * looks harmless enough to give the browser an UPDATE policy for, except that
 * no Postgres policy can be restricted to a single column. A server action is
 * the narrower tool.
 */

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

const SELECT = `
  id, type, entity_type, entity_id, metadata, created_at, read_at,
  delivery_status, title, message
`;

/**
 * Turn a stored row into something renderable.
 *
 * The money in `metadata` arrives as a raw numeric; it is formatted here so
 * the copy module never has to know about currencies.
 */
function toNotification(row: Row): Notification {
  const type = String(row.type) as NotificationType;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;

  const amountRaw = meta.amount;
  const currency = typeof meta.currency === 'string' ? meta.currency : 'PHP';
  const facts = {
    name: typeof meta.name === 'string' ? meta.name : undefined,
    amount:
      amountRaw === undefined || amountRaw === null
        ? undefined
        : formatMoney(fromDatabase(amountRaw as string, currency)),
    days: typeof meta.days === 'number' ? meta.days : undefined,
    date: typeof meta.date === 'string' ? meta.date : undefined,
    count: typeof meta.count === 'number' ? meta.count : undefined,
  };

  const rendered = renderNotification(type, facts);
  const entityId = str(row.entity_id);

  return {
    id: String(row.id),
    type,
    entityType: str(row.entity_type),
    entityId,
    facts,
    createdAt: String(row.created_at),
    readAt: str(row.read_at),
    deliveryStatus: String(row.delivery_status) as DeliveryStatus,
    // A stored title/message means this was sent over push; otherwise render.
    title: str(row.title) ?? rendered.title,
    message: str(row.message) ?? rendered.message,
    href: notificationHref(type, entityId),
  };
}

/**
 * §66 — unread first, then newest first.
 *
 * Strict reverse-chronological would bury an unread reminder under a week of
 * read ones, which defeats the badge that brought the user here.
 */
export async function listNotifications(
  limit = 30,
  offset = 0,
): Promise<{ items: Notification[]; total: number }> {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from('notifications')
    .select(SELECT, { count: 'exact' })
    .order('read_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Could not load notifications: ${error.code}`);
  return {
    items: (data ?? []).map((r) => toNotification(r as Row)),
    total: count ?? 0,
  };
}

/** §20 — the badge. Counts only, so it stays cheap on every page load. */
export async function unreadCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);

  if (error) {
    // A badge is not worth failing a page render over.
    log.error('notifications: unread count failed', { m: error.code });
    return 0;
  }
  return count ?? 0;
}

/** Ownership through the RLS-scoped client, before any admin-client write. */
async function assertOwned(id: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Could not verify that notification: ${error.code}`);
  if (!data) throw new Error('That notification could not be found.');
}

/** §21, §62 — unread is `read_at is null`. */
export async function markRead(id: string): Promise<void> {
  await assertOwned(id);
  const admin = createAdminClient();
  const { error } = await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);

  if (error) throw new Error(`Could not mark that read: ${error.code}`);
}

export async function markAllRead(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
    .select('id');

  if (error) throw new Error(`Could not mark those read: ${error.code}`);
  return (data ?? []).length;
}

/**
 * §19, §34 — the lazy safety check, mirroring Phase 07's.
 *
 * pg_cron generates hourly; this makes a freshly-opened notification centre
 * correct even where pg_cron could not be enabled. Scoped to one user so
 * opening the page never runs a full-table job.
 *
 * Swallows its error deliberately: failing to generate is a reason to show a
 * slightly stale list, not to replace the page with an error. The failure is
 * recorded in `job_runs` either way.
 */
export async function generateNotifications(userId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc('run_notification_generation', {
      p_user_id: userId,
    });
    if (error) log.error('notifications: generation failed', { m: error.code });
  } catch (error) {
    log.error('notifications: generation threw', {
      m: error instanceof Error ? error.message : 'unknown',
    });
  }
}

// ---------------------------------------------------------------------------
// Preferences (§8, §42)
// ---------------------------------------------------------------------------

const PREF_SELECT = `
  bill_due_soon, bill_overdue, receivable_due_soon, receivable_overdue,
  expected_income, recurring_events, ocr_review, forecast_shortfall,
  in_app_enabled, push_enabled, quiet_hours_enabled,
  quiet_hours_start, quiet_hours_end, timezone
`;

/** Trims Postgres `time` (HH:MM:SS) to the HH:MM a form expects. */
const hhmm = (v: unknown): string => String(v ?? '').slice(0, 5) || '00:00';

export async function getPreferences(
  userId: string,
  timezone: string,
): Promise<NotificationPreferences> {
  const admin = createAdminClient();

  // Created on demand rather than by a signup trigger, so users who registered
  // before this phase are covered too.
  await admin.rpc('ensure_notification_preferences', { p_user_id: userId });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notification_preferences')
    .select(PREF_SELECT)
    .maybeSingle();

  if (error) throw new Error(`Could not load your preferences: ${error.code}`);

  const r = (data ?? {}) as Row;
  return {
    billDueSoon: r.bill_due_soon !== false,
    billOverdue: r.bill_overdue !== false,
    receivableDueSoon: r.receivable_due_soon !== false,
    receivableOverdue: r.receivable_overdue !== false,
    expectedIncome: r.expected_income !== false,
    recurringEvents: r.recurring_events !== false,
    ocrReview: r.ocr_review !== false,
    forecastShortfall: r.forecast_shortfall !== false,
    inAppEnabled: r.in_app_enabled !== false,
    // §9, §13 — push stays off until the browser permission is granted.
    pushEnabled: r.push_enabled === true,
    quietHoursEnabled: r.quiet_hours_enabled === true,
    quietHoursStart: hhmm(r.quiet_hours_start) || '22:00',
    quietHoursEnd: hhmm(r.quiet_hours_end) || '07:00',
    timezone: str(r.timezone) ?? timezone,
  };
}

export async function updatePreferences(
  userId: string,
  prefs: NotificationPreferences,
): Promise<void> {
  const admin = createAdminClient();
  await admin.rpc('ensure_notification_preferences', { p_user_id: userId });

  const { error } = await admin
    .from('notification_preferences')
    .update({
      bill_due_soon: prefs.billDueSoon,
      bill_overdue: prefs.billOverdue,
      receivable_due_soon: prefs.receivableDueSoon,
      receivable_overdue: prefs.receivableOverdue,
      expected_income: prefs.expectedIncome,
      recurring_events: prefs.recurringEvents,
      ocr_review: prefs.ocrReview,
      forecast_shortfall: prefs.forecastShortfall,
      in_app_enabled: prefs.inAppEnabled,
      push_enabled: prefs.pushEnabled,
      quiet_hours_enabled: prefs.quietHoursEnabled,
      quiet_hours_start: prefs.quietHoursStart,
      quiet_hours_end: prefs.quietHoursEnd,
      timezone: prefs.timezone,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) throw new Error(`Could not save your preferences: ${error.code}`);
}
