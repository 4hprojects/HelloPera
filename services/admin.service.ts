import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import { allGuides } from '@/lib/content/registry';
import type { UserRole, UserStatus } from '@/types/auth';

/**
 * Admin operations — PHASE-13 §6 to §55.
 *
 * ## The constraint this whole file is written under
 *
 * §4: *"Admin can manage the platform without reading private user financial
 * content."* Criteria 8, 10, 20 and 21 restate it. So nothing here selects a
 * column from `transactions`, `accounts`, `documents`, `ocr_results`,
 * `extraction_results` or `ai_messages`. Where a count over those tables is
 * genuinely operational — "how many documents failed to process today" — it is
 * a count, and the row it counted never leaves the database.
 *
 * That is easy to say and easy to lose. The realistic way it gets lost is a
 * future page that needs one more field, an admin client already in scope, and
 * a query that is trivially easy to write. `services/admin.privacy.test.ts`
 * asserts the absence rather than trusting the comment.
 *
 * Everything uses the service-role client, because aggregates across users
 * cannot come through an RLS-scoped one by definition (§71: it stays
 * server-side, and `lib/supabase/admin.ts` carries `server-only`).
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Every read here degrades to an empty answer rather than a broken page. */
async function safely<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    log.error(`admin: ${label} failed`, {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return fallback;
  }
}

function tally(
  rows: readonly Row[],
  key: string,
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = String(row[key] ?? 'unknown');
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

// -----------------------------------------------------------------------------
// §6 — the dashboard
// -----------------------------------------------------------------------------

export type AdminOverview = {
  users: { total: number; active: number; suspended: number; disabled: number };
  admins: number;
  ocr: { today: number; failed: number };
  ai: { today: number; failed: number };
  notifications: { pending: number; failed: number };
  jobs: { lastRunAt: string | null; failedRecently: number };
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const empty: AdminOverview = {
    users: { total: 0, active: 0, suspended: 0, disabled: 0 },
    admins: 0,
    ocr: { today: 0, failed: 0 },
    ai: { today: 0, failed: 0 },
    notifications: { pending: 0, failed: 0 },
    jobs: { lastRunAt: null, failedRecently: 0 },
  };

  return safely('overview', empty, async () => {
    const [profiles, ocr, ai, notifications, jobs] = await Promise.all([
      admin.from('profiles').select('status, role'),
      admin.from('ocr_jobs').select('status').gte('created_at', since),
      admin.from('ai_usage_logs').select('status').gte('created_at', since),
      admin.from('notifications').select('delivery_status'),
      admin
        .from('job_runs')
        .select('status, started_at')
        .order('started_at', {
          ascending: false,
        })
        .limit(50),
    ]);

    const people = (profiles.data ?? []) as Row[];
    const jobRows = (jobs.data ?? []) as Row[];
    const count = (rows: Row[], key: string, value: string) =>
      rows.filter((r) => r[key] === value).length;

    return {
      users: {
        total: people.length,
        active: count(people, 'status', 'active'),
        suspended: count(people, 'status', 'suspended'),
        disabled: count(people, 'status', 'disabled'),
      },
      admins: count(people, 'role', 'admin'),
      ocr: {
        today: (ocr.data ?? []).length,
        failed: count((ocr.data ?? []) as Row[], 'status', 'failed'),
      },
      ai: {
        today: (ai.data ?? []).length,
        failed: (ai.data ?? []).filter((r) => (r as Row).status !== 'succeeded').length,
      },
      notifications: {
        pending: count((notifications.data ?? []) as Row[], 'delivery_status', 'pending'),
        failed: count((notifications.data ?? []) as Row[], 'delivery_status', 'failed'),
      },
      jobs: {
        lastRunAt: jobRows[0] ? str(jobRows[0].started_at) : null,
        failedRecently: count(jobRows, 'status', 'failed'),
      },
    };
  });
}

// -----------------------------------------------------------------------------
// §7, §8, §15 — users
// -----------------------------------------------------------------------------

export type AdminUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  timezone: string;
};

function toUser(row: Row): AdminUser {
  return {
    id: String(row.id),
    email: str(row.email),
    fullName: str(row.full_name),
    role: (str(row.role) ?? 'user') as UserRole,
    status: (str(row.status) ?? 'active') as UserStatus,
    createdAt: String(row.created_at),
    timezone: str(row.timezone) ?? 'Asia/Manila',
  };
}

/**
 * §8 — search by email, name or id.
 *
 * §67 asks for search safety. The term has PostgREST's filter punctuation
 * stripped before it reaches an `or()`: those characters are how a filter
 * string is delimited, so a term containing them changes the shape of the
 * query rather than the value being matched. The same guard
 * `services/transaction.service.ts:58` already applies to user search.
 */
export async function listUsers(params: {
  search?: string;
  status?: UserStatus;
  limit?: number;
}): Promise<AdminUser[]> {
  const admin = createAdminClient();

  return safely('user list', [], async () => {
    let query = admin
      .from('profiles')
      .select('id, email, full_name, role, status, created_at, timezone')
      .order('created_at', { ascending: false })
      .limit(params.limit ?? 50);

    if (params.status) query = query.eq('status', params.status);

    const term = params.search?.trim();
    if (term) {
      const safe = term.replace(/[%,()"']/g, '');
      if (safe) {
        query = query.or(`email.ilike.%${safe}%,full_name.ilike.%${safe}%`);
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(error.code);
    return (data ?? []).map((row) => toUser(row as Row));
  });
}

export type AdminUserDetail = {
  user: AdminUser;
  plan: { code: string; name: string; status: string | null } | null;
  /** §15 — how much metered work, never what it contained. */
  usage: Array<{ feature: string; quantity: number }>;
  overrides: Array<{
    id: string;
    key: string;
    value: unknown;
    reason: string;
    startsAt: string;
    endsAt: string | null;
  }>;
  notes: Array<{
    id: string;
    note: string;
    createdAt: string;
    adminUserId: string | null;
  }>;
  /** §15 — recent operational events. Auth and admin only, never financial. */
  events: Array<{ id: string; eventType: string; createdAt: string }>;
  /**
   * §15 — counts only. Deliberately not a list: "42 transactions" is the
   * operational fact; which 42 is the user's business.
   */
  recordCounts: { transactions: number; accounts: number; documents: number };
};

export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const admin = createAdminClient();

  return safely('user detail', null, async () => {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, full_name, role, status, created_at, timezone')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) return null;

    const [sub, usage, overrides, notes, events, tx, accounts, documents] =
      await Promise.all([
        admin
          .from('subscriptions')
          .select('status, plan_id, plans(code, name)')
          .eq('user_id', userId)
          .maybeSingle(),
        admin.from('usage_records').select('feature_key, quantity').eq('user_id', userId),
        admin
          .from('entitlement_overrides')
          .select('id, entitlement_key, value_json, reason, starts_at, ends_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        admin
          .from('admin_support_notes')
          .select('id, note, created_at, admin_user_id')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
        admin
          .from('audit_logs')
          .select('id, event_type, created_at')
          .eq('target_user_id', userId)
          .in('entity_type', ['auth', 'admin'])
          .order('created_at', { ascending: false })
          .limit(20),
        // Counts with `head: true` — the rows are never fetched, which is the
        // difference between an operational figure and reading someone's ledger.
        admin
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        admin
          .from('accounts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        admin
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
      ]);

    const planRow = sub.data?.plans as Row | undefined;

    return {
      user: toUser(profile as Row),
      plan: planRow
        ? {
            code: String(planRow.code),
            name: String(planRow.name),
            status: str((sub.data as Row | null)?.status),
          }
        : null,
      usage: ((usage.data ?? []) as Row[]).map((r) => ({
        feature: String(r.feature_key),
        quantity: Number(r.quantity ?? 0),
      })),
      overrides: ((overrides.data ?? []) as Row[]).map((r) => ({
        id: String(r.id),
        key: String(r.entitlement_key),
        value: r.value_json,
        reason: String(r.reason),
        startsAt: String(r.starts_at),
        endsAt: str(r.ends_at),
      })),
      notes: ((notes.data ?? []) as Row[]).map((r) => ({
        id: String(r.id),
        note: String(r.note),
        createdAt: String(r.created_at),
        adminUserId: str(r.admin_user_id),
      })),
      events: ((events.data ?? []) as Row[]).map((r) => ({
        id: String(r.id),
        eventType: String(r.event_type),
        createdAt: String(r.created_at),
      })),
      recordCounts: {
        transactions: tx.count ?? 0,
        accounts: accounts.count ?? 0,
        documents: documents.count ?? 0,
      },
    };
  });
}

// -----------------------------------------------------------------------------
// §33 to §36 — feature flags
// -----------------------------------------------------------------------------

export type AdminFlag = {
  key: string;
  enabled: boolean;
  config: Record<string, unknown>;
  updatedAt: string;
  updatedBy: string | null;
};

export async function listFlags(): Promise<AdminFlag[]> {
  const admin = createAdminClient();
  return safely('flags', [], async () => {
    const { data } = await admin
      .from('feature_flags')
      .select('key, enabled, config, updated_at, updated_by')
      .order('key');
    return ((data ?? []) as Row[]).map((r) => ({
      key: String(r.key),
      enabled: r.enabled === true,
      config: (r.config ?? {}) as Record<string, unknown>,
      updatedAt: String(r.updated_at),
      updatedBy: str(r.updated_by),
    }));
  });
}

// -----------------------------------------------------------------------------
// §24, §25 — OCR operations. Metadata only, by construction.
// -----------------------------------------------------------------------------

export type AdminOcrJob = {
  id: string;
  userId: string;
  documentId: string;
  provider: string | null;
  status: string;
  attemptCount: number;
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
};

export async function listOcrJobs(params: { status?: string; limit?: number } = {}) {
  const admin = createAdminClient();
  return safely<AdminOcrJob[]>('ocr jobs', [], async () => {
    let query = admin
      .from('ocr_jobs')
      // §24 — "Do not show raw OCR text in list view." There is no raw text in
      // this table at all; it lives in `ocr_results`, which nothing here reads.
      .select(
        'id, user_id, document_id, provider, status, attempt_count, error_code, created_at, completed_at',
      )
      .order('created_at', { ascending: false })
      .limit(params.limit ?? 50);

    if (params.status) query = query.eq('status', params.status);

    const { data } = await query;
    return ((data ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      documentId: String(r.document_id),
      provider: str(r.provider),
      status: String(r.status),
      attemptCount: Number(r.attempt_count ?? 0),
      errorCode: str(r.error_code),
      createdAt: String(r.created_at),
      completedAt: str(r.completed_at),
    }));
  });
}

// -----------------------------------------------------------------------------
// §28, §29, §30 — AI operations
// -----------------------------------------------------------------------------

export type ProviderHealth =
  'operational' | 'degraded' | 'unavailable' | 'not_configured';

export type AdminAiOverview = {
  health: ProviderHealth;
  total: number;
  failed: number;
  medianDurationMs: number | null;
  byIntent: Array<{ value: string; count: number }>;
  byCallType: Array<{ value: string; count: number }>;
  recentFailures: Array<{
    id: string;
    userId: string;
    intent: string | null;
    model: string;
    errorCode: string | null;
    durationMs: number;
    createdAt: string;
  }>;
};

/**
 * §30 — health from recent outcomes rather than a synthetic probe.
 *
 * A probe tells you whether the provider answers a request nobody asked for.
 * The failure rate over real traffic tells you whether it is answering the
 * ones people did, which is the question an operator has.
 */
export function healthFrom(
  total: number,
  failed: number,
  configured: boolean,
): ProviderHealth {
  if (!configured) return 'not_configured';
  // No traffic is not evidence of a problem, and reporting "degraded" for a
  // quiet hour would train an operator to ignore the indicator.
  if (total === 0) return 'operational';
  const rate = failed / total;
  if (rate >= 0.5) return 'unavailable';
  if (rate >= 0.1) return 'degraded';
  return 'operational';
}

export async function getAiOverview(configured: boolean): Promise<AdminAiOverview> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const empty: AdminAiOverview = {
    health: configured ? 'operational' : 'not_configured',
    total: 0,
    failed: 0,
    medianDurationMs: null,
    byIntent: [],
    byCallType: [],
    recentFailures: [],
  };

  return safely('ai overview', empty, async () => {
    const { data } = await admin
      .from('ai_usage_logs')
      // §29 — id, user, intent, model, error code, duration. There is no prompt
      // column in this table, which is how §94 of Phase 12 stays true here.
      .select(
        'id, user_id, intent, model, call_type, status, error_code, duration_ms, created_at',
      )
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000);

    const rows = (data ?? []) as Row[];
    const failed = rows.filter((r) => r.status !== 'succeeded');
    const durations = rows
      .map((r) => Number(r.duration_ms ?? 0))
      .filter((n) => n > 0)
      .sort((a, b) => a - b);

    return {
      health: healthFrom(rows.length, failed.length, configured),
      total: rows.length,
      failed: failed.length,
      medianDurationMs:
        durations.length > 0 ? (durations[durations.length >> 1] ?? null) : null,
      byIntent: tally(
        rows.filter((r) => r.intent),
        'intent',
      ),
      byCallType: tally(rows, 'call_type'),
      recentFailures: failed.slice(0, 20).map((r) => ({
        id: String(r.id),
        userId: String(r.user_id),
        intent: str(r.intent),
        model: String(r.model),
        errorCode: str(r.error_code),
        durationMs: Number(r.duration_ms ?? 0),
        createdAt: String(r.created_at),
      })),
    };
  });
}

// -----------------------------------------------------------------------------
// §48 to §51 — jobs, and §39 to §47 — system health
// -----------------------------------------------------------------------------

export type AdminJobRun = {
  id: string;
  jobType: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
};

export async function listJobRuns(limit = 50): Promise<AdminJobRun[]> {
  const admin = createAdminClient();
  return safely<AdminJobRun[]>('job runs', [], async () => {
    const { data } = await admin
      .from('job_runs')
      .select('id, job_type, status, started_at, completed_at, duration_ms, error_code')
      .order('started_at', { ascending: false })
      .limit(limit);
    return ((data ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      jobType: String(r.job_type),
      status: String(r.status),
      startedAt: String(r.started_at),
      completedAt: str(r.completed_at),
      durationMs: r.duration_ms === null ? null : Number(r.duration_ms),
      errorCode: str(r.error_code),
    }));
  });
}

// -----------------------------------------------------------------------------
// §52 to §55 — the audit viewer
// -----------------------------------------------------------------------------

export type AdminAuditRow = {
  id: string;
  eventType: string;
  entityType: string | null;
  actorUserId: string | null;
  targetUserId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export async function listAuditLog(params: {
  eventType?: string;
  entityType?: string;
  limit?: number;
}): Promise<AdminAuditRow[]> {
  const admin = createAdminClient();
  return safely<AdminAuditRow[]>('audit log', [], async () => {
    let query = admin
      .from('audit_logs')
      .select(
        'id, event_type, entity_type, actor_user_id, target_user_id, created_at, metadata',
      )
      .order('created_at', { ascending: false })
      .limit(params.limit ?? 100);

    if (params.eventType) query = query.eq('event_type', params.eventType);
    if (params.entityType) query = query.eq('entity_type', params.entityType);

    const { data } = await query;
    return ((data ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      eventType: String(r.event_type),
      entityType: str(r.entity_type),
      actorUserId: str(r.actor_user_id),
      targetUserId: str(r.target_user_id),
      createdAt: String(r.created_at),
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
    }));
  });
}

// -----------------------------------------------------------------------------
// §31, §32 — notification operations
// -----------------------------------------------------------------------------

export type AdminNotificationOverview = {
  byDeliveryStatus: Array<{ value: string; count: number }>;
  byType: Array<{ value: string; count: number }>;
  byChannel: Array<{ value: string; count: number }>;
  push: { active: number; failing: number };
};

/**
 * Delivery health, never content.
 *
 * `notifications` carries `title` and `message`, which are assembled from a
 * user's own bills and balances — §22 of Phase 08 strips amounts from push
 * copy for the same reason. Neither column is selected here: the operational
 * question is whether delivery works, and that is answered entirely by
 * `delivery_status`, `type` and `channel`.
 */
export async function getNotificationOverview(): Promise<AdminNotificationOverview> {
  const admin = createAdminClient();
  const empty: AdminNotificationOverview = {
    byDeliveryStatus: [],
    byType: [],
    byChannel: [],
    push: { active: 0, failing: 0 },
  };

  return safely('notification overview', empty, async () => {
    const [notifications, subscriptions] = await Promise.all([
      admin.from('notifications').select('delivery_status, type, channel').limit(1000),
      admin.from('push_subscriptions').select('is_active, failure_count'),
    ]);

    const rows = (notifications.data ?? []) as Row[];
    const subs = (subscriptions.data ?? []) as Row[];

    return {
      byDeliveryStatus: tally(rows, 'delivery_status'),
      byType: tally(rows, 'type'),
      byChannel: tally(rows, 'channel'),
      push: {
        active: subs.filter((s) => s.is_active === true).length,
        // §35 of Phase 08 — a subscription failing repeatedly is a dead device,
        // and knowing how many there are is how you notice the channel rotting.
        failing: subs.filter((s) => Number(s.failure_count ?? 0) > 0).length,
      },
    };
  });
}

// -----------------------------------------------------------------------------
// §37, §38 — content operations
// -----------------------------------------------------------------------------

export type AdminContentRow = {
  slug: string;
  title: string;
  status: string;
  category: string;
  updatedAt: string | null;
  /** Whether the public site will serve and index it. */
  live: boolean;
};

/**
 * Content, read from the registry that already exists.
 *
 * Phase 10 shipped guides as files under `content/guides/` with a
 * draft/published status, and `allGuides()` is already documented as the
 * non-public view of them. A database-backed editor would be a second content
 * system and a second place a guide could live — so this reports what the
 * repository contains rather than offering to change it. Editing a guide is a
 * commit, which is version control, review and rollback for free.
 */
export function listContent(): AdminContentRow[] {
  return allGuides().map((guide) => ({
    slug: guide.slug,
    title: guide.title,
    status: guide.status,
    category: guide.category,
    updatedAt: guide.updatedAt ?? null,
    live: guide.status === 'published',
  }));
}

// -----------------------------------------------------------------------------
// Mutations — §9 to §12, §16, §19, §23, §33 to §36
//
// Every one of these is called from `app/actions/admin.ts` inside
// `adminAction()`, which authorises and audits. None of them checks
// authorization itself, and that is deliberate: two places deciding who may
// suspend a user is two places to get it wrong. The wrapper is the only door.
// -----------------------------------------------------------------------------

/** §9, §10, §11, §12 — status changes preserve everything else. */
export async function setUserStatus(userId: string, status: UserStatus): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', userId);

  // §10: "Suspension must not delete user records." Nothing here touches
  // subscriptions, usage or financial rows — a suspended user who is
  // reactivated finds everything exactly as they left it.
  if (error) throw new Error(`Could not change status: ${error.code}`);
}

/** §13 — role changes are privileged and audited; never client-controlled. */
export async function setUserRole(userId: string, role: UserRole): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw new Error(`Could not change role: ${error.code}`);
}

/** §16 — a support note, written by an admin about a user. */
export async function addSupportNote(
  userId: string,
  adminUserId: string,
  note: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('admin_support_notes')
    .insert({ user_id: userId, admin_user_id: adminUserId, note });
  if (error) throw new Error(`Could not save the note: ${error.code}`);
}

/** §33 to §36 — the first write path `feature_flags` has ever had. */
export async function setFlag(
  key: string,
  enabled: boolean,
  adminUserId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('feature_flags')
    .update({ enabled, updated_at: new Date().toISOString(), updated_by: adminUserId })
    .eq('key', key);
  if (error) throw new Error(`Could not change the flag: ${error.code}`);
}

/** §19 — promotional Premium and its opposite, as a row rather than a lie. */
export async function grantOverride(params: {
  userId: string;
  entitlementKey: string;
  value: unknown;
  reason: string;
  endsAt: string | null;
  createdBy: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('entitlement_overrides').insert({
    user_id: params.userId,
    entitlement_key: params.entitlementKey,
    value_json: params.value,
    reason: params.reason,
    ends_at: params.endsAt,
    created_by: params.createdBy,
  });
  if (error) throw new Error(`Could not grant the override: ${error.code}`);
}

/**
 * §19 — revoking ends an override now rather than deleting the row.
 *
 * The row is the record that a grant was made and why. Deleting it would erase
 * the reason along with the effect, which is the same mistake as writing the
 * grant into `subscriptions` in the first place.
 */
export async function revokeOverride(overrideId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('entitlement_overrides')
    .update({ ends_at: new Date().toISOString() })
    .eq('id', overrideId);
  if (error) throw new Error(`Could not revoke the override: ${error.code}`);
}

/** §23 — a credit is a row, never an edit to usage history (§32 of Phase 09). */
export async function adjustUsage(params: {
  userId: string;
  featureKey: string;
  quantityDelta: number;
  reason: string;
  createdBy: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('usage_adjustments').insert({
    user_id: params.userId,
    feature_key: params.featureKey,
    quantity_delta: params.quantityDelta,
    reason: params.reason,
    created_by: params.createdBy,
  });
  if (error) throw new Error(`Could not record the adjustment: ${error.code}`);
}
