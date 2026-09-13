/**
 * Notification rules — PHASE-08 §10, §17, §31, §48, §63.
 *
 * Pure: dates in, decisions out. Nothing here reads a database, builds a
 * `Date` from "now", or sends anything. The scheduler decides *whether* a
 * reminder is due by asking these functions, which is what makes the awkward
 * cases — escalation ladders, quiet hours crossing midnight — testable.
 */

export const NOTIFICATION_TYPES = [
  'bill_due_soon',
  'bill_due_today',
  'bill_overdue',
  'receivable_due_soon',
  'receivable_overdue',
  'expected_income_upcoming',
  'expected_income_missed',
  'recurring_event_upcoming',
  'ocr_review_required',
  'forecast_shortfall',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * §10 — due-soon windows, in days before the date.
 *
 * "Do not hardcode these values in multiple places." This object is the one
 * place; the SQL generator reads the same numbers through its own constants,
 * held to these by a parity test.
 */
export const DUE_SOON_DAYS = {
  bill: 3,
  receivable: 3,
  expected_income: 1,
  recurring_event: 1,
} as const;

/**
 * §48 — the overdue escalation ladder, in days past the date.
 *
 * Three reminders over a month rather than thirty. §48 says "Do not send daily
 * overdue reminders indefinitely", and the ladder is the mechanism: each step
 * is a distinct dedupe key, so each fires exactly once.
 */
export const ESCALATION_STEPS = [1, 7, 30] as const;
export type EscalationStep = (typeof ESCALATION_STEPS)[number];

/**
 * Which escalation step a given lateness has reached, or null before the first.
 *
 * Returns the HIGHEST step passed, not the nearest: at 10 days overdue the
 * answer is step 7, and step 7's key was already used at day 7, so nothing
 * fires again until day 30. That is what stops the hourly scheduler from
 * re-notifying every run — the condition stays true, but the key does not
 * change.
 */
export function escalationStepFor(daysOverdue: number): EscalationStep | null {
  let step: EscalationStep | null = null;
  for (const candidate of ESCALATION_STEPS) {
    if (daysOverdue >= candidate) step = candidate;
  }
  return step;
}

/**
 * §17 — deterministic dedupe keys.
 *
 * Date-anchored reminders key on the date, because the date happens once.
 * Overdue keys on the escalation step, because `due_date < today` stays true
 * indefinitely: `bill:42:overdue` would fire once and never escalate, and
 * `bill:42:overdue:2026-09-14` would fire every single day.
 */
export const dedupeKey = {
  billDueSoon: (id: string, dueDate: string) => `bill:${id}:due_soon:${dueDate}`,
  billDueToday: (id: string, dueDate: string) => `bill:${id}:due_today:${dueDate}`,
  billOverdue: (id: string, step: number) => `bill:${id}:overdue:${step}`,

  receivableDueSoon: (id: string, dueDate: string) =>
    `receivable:${id}:due_soon:${dueDate}`,
  receivableOverdue: (id: string, step: number) => `receivable:${id}:overdue:${step}`,

  expectedIncomeUpcoming: (id: string, date: string) =>
    `expected_income:${id}:upcoming:${date}`,
  expectedIncomeMissed: (id: string, date: string) =>
    `expected_income:${id}:missed:${date}`,

  recurringEventUpcoming: (eventId: string, date: string) =>
    `recurring_event:${eventId}:upcoming:${date}`,

  ocrReview: (extractionId: string, reminderNumber: number) =>
    `ocr_review:${extractionId}:${reminderNumber}`,

  /**
   * §64 — keyed on the shortfall DATE, so a materially different shortfall
   * notifies again while an unchanged one stays quiet. Without the date, a
   * user whose projection worsens would never hear about it.
   */
  forecastShortfall: (userId: string, firstShortfallDate: string) =>
    `forecast_shortfall:${userId}:${firstShortfallDate}`,
} as const;

/**
 * §31, §32 — is a local time inside the user's quiet hours?
 *
 * The window normally crosses midnight (22:00 → 07:00), which is why this is
 * not a simple `start <= t && t < end`: that comparison is false for every
 * hour of a 22:00–07:00 window and would silently disable the feature.
 *
 * Times are `HH:MM` in the user's own timezone; the caller resolves that.
 */
export function isWithinQuietHours(time: string, start: string, end: string): boolean {
  const t = toMinutes(time);
  const s = toMinutes(start);
  const e = toMinutes(end);

  // A window that does not wrap: 01:00 → 06:00.
  if (s < e) return t >= s && t < e;
  // A window that wraps midnight: 22:00 → 07:00.
  if (s > e) return t >= s || t < e;
  // start === end: an empty window, not a 24-hour one. Treating it as
  // all-day would mute every notification a user ever receives because of
  // two matching values in a settings form.
  return false;
}

function toMinutes(hhmm: string): number {
  const [h = '0', m = '0'] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * §32 — when quiet hours defer a notification, where does it land?
 *
 * Deferred, never dropped. A bill reminder suppressed at 23:00 and discarded
 * would mean the user is never told at all, which is worse than telling them
 * late. Returns the local `HH:MM` the notification should be held until.
 */
export function deferUntil(end: string): string {
  return end;
}

/** §63 — how long a reminder stays useful, in days from creation. */
export const EXPIRY_DAYS: Record<NotificationType, number> = {
  bill_due_soon: 14,
  bill_due_today: 14,
  bill_overdue: 30,
  receivable_due_soon: 14,
  receivable_overdue: 30,
  expected_income_upcoming: 14,
  expected_income_missed: 30,
  recurring_event_upcoming: 7,
  ocr_review_required: 30,
  forecast_shortfall: 14,
};

/**
 * §42 — does the user's preference allow this type?
 *
 * One notification type maps to one preference column, and the mapping is not
 * one-to-one: both expected-income types share a single toggle, as do both
 * overdue ladders with their due-soon counterparts where §8's column list says
 * so. Getting this wrong means a user who switched something off keeps
 * receiving it, which is the complaint that loses trust fastest.
 */
export const PREFERENCE_COLUMN: Record<NotificationType, string> = {
  bill_due_soon: 'bill_due_soon',
  bill_due_today: 'bill_due_soon',
  bill_overdue: 'bill_overdue',
  receivable_due_soon: 'receivable_due_soon',
  receivable_overdue: 'receivable_overdue',
  expected_income_upcoming: 'expected_income',
  expected_income_missed: 'expected_income',
  recurring_event_upcoming: 'recurring_events',
  ocr_review_required: 'ocr_review',
  forecast_shortfall: 'forecast_shortfall',
};
