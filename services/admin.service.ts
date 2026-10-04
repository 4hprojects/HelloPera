import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import {
  available,
  newReference,
  unavailable,
  type Availability,
} from '@/lib/admin/availability';
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

/**
 * Like `safely`, but a failure is reported as unavailable with a reference that
 * is also logged, never as an empty answer. Returned Supabase errors are thrown
 * by the callers so they reach this wrapper.
 */
async function guarded<T>(
  label: string,
  run: () => Promise<T>,
): Promise<Availability<T>> {
  try {
    return available(await run());
  } catch (error) {
    const reference = newReference();
    log.error(`admin: ${label} failed`, {
      ref: reference,
      m: error instanceof Error ? error.message : 'unknown',
    });
    return unavailable(reference);
  }
}

function num(row: Row, key: string): number {
  return Number(row[key] ?? 0);
}

function pairs(value: unknown): Array<{ value: string; count: number }> {
  return ((value ?? []) as Row[]).map((r) => ({
    value: String(r.value),
    count: Number(r.count),
  }));
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
  /** Failures are counted over the stated window, not "recently". */
  jobs: { lastRunAt: string | null; failedInWindow: number; windowHours: number };
};

const JOB_WINDOW_HOURS = 24;

export async function getAdminOverview(): Promise<Availability<AdminOverview>> {
  const admin = createAdminClient();
  const now = Date.now();

  return guarded('overview', async () => {
    const { data, error } = await admin.rpc('admin_overview_counts', {
      p_since: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      p_jobs_since: new Date(now - JOB_WINDOW_HOURS * 60 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error(error.code ?? error.message);
    const r = (data ?? {}) as Row;

    return {
      users: {
        total: num(r, 'users_total'),
        active: num(r, 'users_active'),
        suspended: num(r, 'users_suspended'),
        disabled: num(r, 'users_disabled'),
      },
      admins: num(r, 'admins'),
      ocr: { today: num(r, 'ocr_today'), failed: num(r, 'ocr_failed') },
      ai: { today: num(r, 'ai_today'), failed: num(r, 'ai_failed') },
      notifications: {
        pending: num(r, 'notifications_pending'),
        failed: num(r, 'notifications_failed'),
      },
      jobs: {
        lastRunAt: str(r.jobs_last_run_at),
        failedInWindow: num(r, 'jobs_failed'),
        windowHours: JOB_WINDOW_HOURS,
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

export async function getAiOverview(
  configured: boolean,
): Promise<Availability<AdminAiOverview>> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  return guarded('ai overview', async () => {
    const [aggregates, failures] = await Promise.all([
      admin.rpc('admin_ai_aggregates', { p_since: since }),
      admin
        .from('ai_usage_logs')
        // §29 — id, user, intent, model, error code, duration. There is no prompt
        // column in this table, which is how §94 of Phase 12 stays true here.
        .select(
          'id, user_id, intent, model, call_type, status, error_code, duration_ms, created_at',
        )
        .gte('created_at', since)
        .neq('status', 'succeeded')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (aggregates.error)
      throw new Error(aggregates.error.code ?? aggregates.error.message);
    if (failures.error) throw new Error(failures.error.code);

    const a = (aggregates.data ?? {}) as Row;
    const total = num(a, 'total');
    const failed = num(a, 'failed');

    return {
      health: healthFrom(total, failed, configured),
      total,
      failed,
      medianDurationMs:
        a.median_duration_ms === null ? null : num(a, 'median_duration_ms'),
      byIntent: pairs(a.by_intent),
      byCallType: pairs(a.by_call_type),
      recentFailures: ((failures.data ?? []) as Row[]).map((r) => ({
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

export async function listJobRuns(limit = 50): Promise<Availability<AdminJobRun[]>> {
  const admin = createAdminClient();
  return guarded('job runs', async () => {
    const { data, error } = await admin
      .from('job_runs')
      .select('id, job_type, status, started_at, completed_at, duration_ms, error_code')
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.code);
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
  recentFailures: Array<{
    id: string;
    type: string;
    channel: string;
    createdAt: string;
  }>;
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
export async function getNotificationOverview(): Promise<
  Availability<AdminNotificationOverview>
> {
  const admin = createAdminClient();

  return guarded('notification overview', async () => {
    const [aggregates, failures] = await Promise.all([
      admin.rpc('admin_notification_aggregates'),
      admin
        .from('notifications')
        .select('id, type, channel, created_at')
        .eq('delivery_status', 'failed')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (aggregates.error)
      throw new Error(aggregates.error.code ?? aggregates.error.message);
    if (failures.error) throw new Error(failures.error.code);

    const a = (aggregates.data ?? {}) as Row;
    return {
      byDeliveryStatus: pairs(a.by_delivery_status),
      byType: pairs(a.by_type),
      byChannel: pairs(a.by_channel),
      push: {
        active: num(a, 'push_active'),
        // §35 of Phase 08 — a subscription failing repeatedly is a dead device,
        // and knowing how many there are is how you notice the channel rotting.
        failing: num(a, 'push_failing'),
      },
      recentFailures: ((failures.data ?? []) as Row[]).map((row) => ({
        id: String(row.id),
        type: String(row.type),
        channel: String(row.channel),
        createdAt: String(row.created_at),
      })),
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

// -----------------------------------------------------------------------------
// §64, §65, §66 — financial integrity
// -----------------------------------------------------------------------------

export type IntegrityFinding = {
  checkName: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  detail: string;
  expected: string | null;
  actual: string | null;
};

/**
 * Every integrity mismatch, across all users.
 *
 * Read-only by construction: `check_financial_integrity` is declared `stable`
 * and writes nothing. That matters more than it sounds — the function this
 * replaced repaired as it read, so running the report changed the thing being
 * reported on.
 *
 * `detail` is an entity name (a provider, a party, an account) rather than a
 * figure. It is the minimum needed to act on a finding, and it is the one place
 * in this file where admin sees a user-entered string — a bill called
 * "Meralco" is not private financial content in the sense §4 protects, and
 * without it a finding is an unactionable uuid.
 */
export async function listIntegrityFindings(
  userId?: string,
): Promise<Availability<IntegrityFinding[]>> {
  const admin = createAdminClient();
  return guarded('integrity findings', async () => {
    const { data, error } = await admin.rpc('check_financial_integrity', {
      p_user_id: userId ?? null,
    });
    if (error) throw new Error(error.code);

    return ((data ?? []) as Row[]).map((r) => ({
      checkName: String(r.check_name),
      userId: str(r.user_id),
      entityType: String(r.entity_type),
      entityId: String(r.entity_id),
      detail: String(r.detail ?? ''),
      // numeric arrives as a string; left as one, because parseFloat on money
      // is how rounding errors enter a report about rounding errors.
      expected: r.expected === null ? null : String(r.expected),
      actual: r.actual === null ? null : String(r.actual),
    }));
  });
}
