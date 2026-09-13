export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'suspended', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export type Profile = {
  id: string;
  email: string | null;
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
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];
