import { z } from 'zod';

/**
 * Notification preferences — PHASE-08 §8, §31, §50.
 *
 * Checkbox fields arrive from an HTML form as 'on' or absent, never 'false',
 * so an unchecked box is a missing key. `.default(false)` is what turns that
 * absence into an explicit off — without it, switching a reminder off would
 * silently leave it on.
 */

const checkbox = z
  .union([z.literal('on'), z.literal('true'), z.literal('false'), z.literal('')])
  .optional()
  .transform((v) => v === 'on' || v === 'true');

/** HH:MM, the shape an <input type="time"> produces. */
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 22:00');

export const notificationPreferencesSchema = z.object({
  billDueSoon: checkbox,
  billOverdue: checkbox,
  receivableDueSoon: checkbox,
  receivableOverdue: checkbox,
  expectedIncome: checkbox,
  recurringEvents: checkbox,
  ocrReview: checkbox,
  forecastShortfall: checkbox,
  inAppEnabled: checkbox,
  pushEnabled: checkbox,
  quietHoursEnabled: checkbox,
  quietHoursStart: clockTime.default('22:00'),
  quietHoursEnd: clockTime.default('07:00'),
  timezone: z.string().min(1).max(64).default('Asia/Manila'),
});

/**
 * A push subscription as the browser's PushManager produces it.
 *
 * Validated rather than trusted: these values are written to a table the
 * browser cannot write directly (§21), so the server action is the only gate.
 */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url('That is not a valid push endpoint').max(2000),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
  userAgent: z.string().max(400).optional().or(z.literal('')),
});

export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
