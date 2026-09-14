export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'suspended', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export type Profile = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  /**
   * Generated in Postgres from the two parts above — never written directly.
   * Kept for display, where one string is what the sidebar, top bar and avatar
   * actually want.
   */
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  timezone: string;
  default_currency: string;
  created_at: string;
  updated_at: string;
};

/** Auth/security events. Phase 02 adds financial entity events to the same table. */
export const AUDIT_EVENTS = [
  'user_registered',
  'user_logged_in',
  'user_logged_out',
  'password_reset_requested',
  'password_reset_completed',
  'google_oauth_login',
  'profile_updated',
  'account_suspended',
  'account_reactivated',
  'role_changed',
  /**
   * PHASE-14 §72 — the minimal record a deletion leaves behind.
   *
   * Written before the cascade runs, because `audit_logs.actor_user_id` is
   * `on delete set null`: afterwards there is no user to attribute it to, and
   * the row would survive saying only that *someone* deleted *something*.
   */
  'account_deletion_requested',
  'rate_limit_exceeded',
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

/**
 * Recurring and forecasting events — PHASE-07 §61.
 *
 * Kept as a separate list because they are a different kind of thing: these
 * describe a user shaping their own financial model, not an account-security
 * event. They share the table, and `entity_type` is what tells them apart.
 */
export const RECURRING_AUDIT_EVENTS = [
  'recurring_rule_created',
  'recurring_rule_updated',
  'recurring_rule_paused',
  'recurring_rule_resumed',
  'recurring_rule_ended',
  'expected_event_generated',
  'expected_event_fulfilled',
  'expected_event_skipped',
  'expected_event_cancelled',
] as const;
export type RecurringAuditEvent = (typeof RECURRING_AUDIT_EVENTS)[number];

/**
 * Assistant events — PHASE-12 §94.
 *
 * §94: "Do not store full prompt in financial audit log." So there is no event
 * here that carries a question, and the metadata written alongside these names
 * the intent or the reason a question was refused — never the text. The
 * conversation itself is the user's own record, in `ai_messages`, scoped to
 * them; the audit log is an operational trail and does not need a second copy.
 */
export const AI_AUDIT_EVENTS = [
  'ai_query_executed',
  'ai_limit_reached',
  'ai_conversation_created',
  'ai_conversation_archived',
] as const;
export type AiAuditEvent = (typeof AI_AUDIT_EVENTS)[number];

/** Everything `recordAuditEvent` will accept. */
export type AnyAuditEvent = AuditEvent | RecurringAuditEvent | AiAuditEvent;

/** Which domain a row belongs to — the `entity_type` column. */
export const AUDIT_ENTITY_TYPES = [
  'auth',
  'recurring_rule',
  'expected_event',
  'ai',
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
