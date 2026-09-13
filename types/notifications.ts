import type { NotificationType } from '@/lib/notifications/rules';
import type { NotificationFacts } from '@/lib/notifications/copy';

/**
 * Notifications — PHASE-08 §7, §8, §24.
 *
 * No `server-only` import, so `lib/`, `services/` and components can all
 * reference these.
 */

export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export type Notification = {
  id: string;
  type: NotificationType;
  entityType: string | null;
  entityId: string | null;
  /** The facts the copy is rendered from — see lib/notifications/copy.ts. */
  facts: NotificationFacts;
  createdAt: string;
  readAt: string | null;
  deliveryStatus: DeliveryStatus;
  /** Rendered at read time, never stored for in-app rows. */
  title: string;
  message: string;
  /** §44, §45 — where this notification takes you. */
  href: string | null;
};

export type NotificationPreferences = {
  billDueSoon: boolean;
  billOverdue: boolean;
  receivableDueSoon: boolean;
  receivableOverdue: boolean;
  expectedIncome: boolean;
  recurringEvents: boolean;
  ocrReview: boolean;
  forecastShortfall: boolean;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  quietHoursEnabled: boolean;
  /** HH:MM in `timezone`. */
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
};

/** §51 — what the device list may show. Never the encryption keys (§25). */
export type PushDevice = {
  id: string;
  userAgent: string | null;
  isActive: boolean;
  createdAt: string;
  lastSuccessAt: string | null;
};
