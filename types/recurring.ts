import type { Money } from '@/lib/money';
import type { Frequency } from '@/lib/recurring/schedule';
import type { RuleType } from '@/schemas/recurring.schema';

/**
 * Recurring rules and the events they generate — PHASE-07 §7, §15.
 *
 * No `server-only` import, so `lib/`, `services/` and components can all
 * reference these. Every figure is `Money` (bigint minor units).
 */

/**
 * §14 — derived, not stored.
 *
 * The spec offers `active | paused | ended` as a column but notes it "could be
 * derived from fields rather than a separate status column". Derived wins for
 * the same reason Phase 03 derives obligation lateness: `ended` is a function
 * of today and `end_date`, so a stored copy is wrong between the moment it
 * becomes true and the job that notices.
 */
export type RuleStatus = 'active' | 'paused' | 'ended';

export type RecurringRule = {
  id: string;
  ruleType: RuleType;
  name: string;
  description: string | null;
  amount: Money;
  frequency: Frequency;
  intervalCount: number;
  startDate: string;
  endDate: string | null;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  /** Where generation resumes. Null once nothing further is scheduled. */
  nextOccurrenceDate: string | null;
  accountId: string | null;
  categoryId: string | null;
  providerName: string | null;
  sourceName: string | null;
  isActive: boolean;
  isPaused: boolean;
  /** Derived from the fields above plus today — see `RuleStatus`. */
  status: RuleStatus;
  /** "Every 2 weeks", from `describeRule`. */
  cadence: string;
  createdAt: string;
};

/** Labels resolved for display, so the list does not issue one query per row. */
export type RecurringRuleView = RecurringRule & {
  accountName: string | null;
  categoryName: string | null;
};

export type ExpectedEventStatus = 'scheduled' | 'fulfilled' | 'skipped' | 'cancelled';

export type ExpectedEvent = {
  id: string;
  recurringRuleId: string | null;
  eventType: RuleType;
  name: string;
  amount: Money;
  scheduledDate: string;
  status: ExpectedEventStatus;
  accountId: string | null;
  categoryId: string | null;
  actualTransactionId: string | null;
  /** §43 — excluded from the projection without being skipped. */
  includeInForecast: boolean;
  /** §66 — a manual edit the next regeneration must not overwrite. */
  detachedFromRule: boolean;
  sourceEntityType: 'bill' | 'expected_income' | 'transaction' | null;
  sourceEntityId: string | null;
};

/** What a generation run reports back — the jsonb from run_recurring_generation. */
export type GenerationResult = {
  skipped?: boolean;
  reason?: string;
  jobId?: string;
  status?: 'succeeded' | 'failed';
  rules?: number;
  created?: number;
  examined?: number;
  errorCode?: string | null;
};
