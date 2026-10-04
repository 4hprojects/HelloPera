import 'server-only';

import { requireAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import type { AdminAuditEvent, Profile } from '@/types/auth';
import type { User } from '@supabase/supabase-js';

/**
 * The admin mutation seam — PHASE-13 §70, §72, §73, §74, §53, §54.
 *
 * §70 is specific: `requireAdmin()` must run **on every request, not only at
 * the layout**. That is not pedantry. A Next.js layout renders once for a page
 * and does not run again when a server action is invoked from it — so a
 * layout-only guard protects the *view* and leaves every mutation reachable by
 * anyone who can POST to the action's endpoint. `app/admin/layout.tsx` guards
 * the screens; this guards the actions, and the two are different problems.
 *
 * ## Why authorization and auditing arrive together
 *
 * §53 requires every admin action to be audited and §54 requires a reason.
 * Those could be three separate calls in each action, and over a dozen actions
 * one of them would eventually be forgotten — most likely the audit, because
 * nothing fails when it is missing.
 *
 * So they are one call. `adminAction()` cannot authorise without also being
 * handed the event name and the reason, and it writes the audit record itself.
 * The only way to skip the audit is to skip the authorization, which fails
 * loudly.
 */

export class AdminActionError extends Error {
  constructor(
    message: string,
    readonly code: string = 'ADMIN_ERROR',
  ) {
    super(message);
    this.name = 'AdminActionError';
  }
}

export type AdminContext = { user: User; profile: Profile };

/** §54 — a reason nobody can read is the same as no reason. */
const MIN_REASON = 3;
const MAX_REASON = 500;

export function validateReason(raw: unknown): string {
  const reason = String(raw ?? '').trim();
  if (reason.length < MIN_REASON) {
    throw new AdminActionError('Give a reason for this change.', 'REASON_REQUIRED');
  }
  if (reason.length > MAX_REASON) {
    throw new AdminActionError(
      `Keep the reason under ${MAX_REASON} characters.`,
      'REASON_TOO_LONG',
    );
  }
  return reason;
}

export type AdminOperation =
  | 'set_status'
  | 'set_role'
  | 'add_note'
  | 'set_flag'
  | 'grant_override'
  | 'revoke_override'
  | 'adjust_usage'
  | 'repair_balance'
  | 'integrity_check';

export type AdminActionParams = {
  event: AdminAuditEvent;
  /** §54 — required for every audited action, without exception. */
  reason: unknown;
  /** The user being acted upon, when there is one. */
  targetUserId?: string | null;
  /** A uuid of the row acted upon. Non-uuid keys belong in `metadata`. */
  entityId?: string | null;
  /** Safe metadata. Never free-text user content, never a secret. */
  metadata?: Record<string, string | number | boolean | null>;
  /** The database change, applied together with its audit row. */
  operation: AdminOperation;
  args?: Record<string, unknown>;
  /** Cheap application-side refusal (e.g. self-target) before touching the database. */
  precheck?: (context: AdminContext) => void;
};

const DATABASE_REFUSALS: Record<string, [string, string]> = {
  ADMIN_REQUIRED: ['You are not allowed to do that.', 'FORBIDDEN'],
  REASON_REQUIRED: ['Give a reason for this change.', 'REASON_REQUIRED'],
  SELF_TARGET: ['You cannot apply this to your own account.', 'SELF_TARGET'],
  TARGET_NOT_FOUND: ['That record no longer exists.', 'NOT_FOUND'],
};

/**
 * Authorise, apply, audit — atomically.
 *
 * `requireAdmin()` re-checks role *and* status, because it delegates to
 * `requireUser()` which redirects a suspended or disabled account before role
 * is ever considered (§5: admin routes need `role = admin` **and**
 * `status = active`). An admin suspended between page load and button press is
 * refused here, which is the entire reason this cannot be a layout check.
 *
 * The change and its audit row are written by one database function
 * (`admin_apply_change`), so they commit or roll back together: a privileged
 * change can never succeed without its record, and a record can never describe
 * a change that did not happen. If the audit insert fails, the change is undone
 * and the admin is told nothing was changed.
 */
export async function adminAction(
  params: AdminActionParams,
): Promise<Record<string, unknown>> {
  const context = await requireAdmin();
  const reason = validateReason(params.reason);
  params.precheck?.(context);

  const { data, error } = await createAdminClient().rpc('admin_apply_change', {
    p_actor: context.user.id,
    p_event: params.event,
    p_op: params.operation,
    p_target: params.targetUserId || null,
    p_entity: params.entityId || null,
    p_reason: reason,
    p_args: params.args ?? {},
    p_metadata: params.metadata ?? {},
  });

  if (error) {
    const refusal = Object.entries(DATABASE_REFUSALS).find(([key]) =>
      error.message.includes(key),
    );
    if (refusal) throw new AdminActionError(refusal[1][0], refusal[1][1]);
    throw new Error(`Admin change failed: ${error.code}`);
  }

  log.info('admin action', { event: params.event, actor: context.user.id });
  return (data ?? {}) as Record<string, unknown>;
}

/**
 * §14 — an admin may not act on their own account.
 *
 * Not a courtesy. The two failure modes it prevents are real: an admin
 * suspending themselves locks the only operator out of the system, and an
 * admin granting themselves a role is the escalation §13 and §14 exist to
 * prevent — the check that matters is not "are you an admin" but "are you
 * changing your own privileges", because the first is true by definition at
 * the moment the second happens.
 *
 * Privilege changes on other admins are still allowed: two operators are
 * meant to be able to correct each other.
 */
export function rejectSelfTarget(context: AdminContext, targetUserId: string): void {
  if (context.user.id === targetUserId) {
    throw new AdminActionError(
      'You cannot apply this to your own account.',
      'SELF_TARGET',
    );
  }
}
