import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromDatabase, parseDecimal, toDecimalString } from '@/lib/money';
import { describeRule, initialCursor as firstCursor } from '@/lib/recurring/schedule';
import type { Frequency } from '@/lib/recurring/schedule';
import type {
  CreateRecurringRuleInput,
  RuleType,
  UpdateRecurringRuleInput,
} from '@/schemas/recurring.schema';
import type { GenerationResult, RecurringRule, RuleStatus } from '@/types/recurring';

/**
 * Recurring rules — PHASE-07 §7, §21 to §24, §37.
 *
 * Reads go through the RLS-scoped session client, so there is no `user_id`
 * predicate to forge. Writes go through the admin client, which bypasses RLS
 * by design, so **every write checks ownership in code first** — that check is
 * the security boundary, not a formality.
 */

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/**
 * §14 — status is derived, never stored.
 *
 * `ended` is a function of today and `end_date`. A stored copy is wrong from
 * the moment it becomes true until whatever job notices, and "is this rule
 * still running?" is precisely the question a user asks of this screen.
 */
export function ruleStatus(
  row: { is_active: boolean; is_paused: boolean; end_date: string | null },
  today: string,
): RuleStatus {
  if (row.end_date && row.end_date < today) return 'ended';
  if (!row.is_active) return 'ended';
  if (row.is_paused) return 'paused';
  return 'active';
}

function toRule(row: Row, today: string): RecurringRule {
  const frequency = String(row.frequency) as Frequency;
  const startDate = String(row.start_date);
  const endDate = str(row.end_date);
  const intervalCount = Number(row.interval_count);
  const dayOfMonth = num(row.day_of_month);
  const dayOfWeek = num(row.day_of_week);

  return {
    id: String(row.id),
    ruleType: String(row.rule_type) as RuleType,
    name: String(row.name),
    description: str(row.description),
    amount: fromDatabase(row.amount as string, String(row.currency_code)),
    frequency,
    intervalCount,
    startDate,
    endDate,
    dayOfMonth,
    dayOfWeek,
    nextOccurrenceDate: str(row.next_occurrence_date),
    accountId: str(row.account_id),
    categoryId: str(row.category_id),
    providerName: str(row.provider_name),
    sourceName: str(row.source_name),
    isActive: Boolean(row.is_active),
    isPaused: Boolean(row.is_paused),
    status: ruleStatus(
      {
        is_active: Boolean(row.is_active),
        is_paused: Boolean(row.is_paused),
        end_date: endDate,
      },
      today,
    ),
    cadence: describeRule({
      frequency,
      intervalCount,
      startDate,
      endDate,
      dayOfMonth,
      dayOfWeek,
    }),
    createdAt: String(row.created_at),
  };
}

const SELECT = `
  id, rule_type, name, description, amount, currency_code, frequency,
  interval_count, day_of_month, day_of_week, start_date, end_date,
  next_occurrence_date, account_id, category_id, provider_name, source_name,
  is_active, is_paused, created_at
`;

/** Every rule the user owns, newest first. RLS scopes the read (§62). */
export async function listRules(today: string): Promise<RecurringRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recurring_rules')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw new Error(`Could not load recurring rules: ${error.code}`);
  return (data ?? []).map((row) => toRule(row as Row, today));
}

export async function getRule(id: string, today: string): Promise<RecurringRule | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recurring_rules')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Could not load this rule: ${error.code}`);
  return data ? toRule(data as Row, today) : null;
}

/**
 * Ownership check for the admin-client writes below.
 *
 * Uses the SESSION client deliberately: RLS answers "does this user own it?"
 * without us writing a predicate that could be wrong. A row the user cannot
 * see comes back null and the write never happens.
 */
async function assertOwned(id: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recurring_rules')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Could not verify this rule: ${error.code}`);
  if (!data) throw new Error('That recurring rule could not be found.');
}

function optional(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Adapter over `initialCursor` in lib/recurring/schedule.ts, where the rule and
 * its reasoning live so they can be unit-tested — anything under `services/`
 * imports `server-only` and cannot be reached from a test.
 */
function initialCursor(
  input: {
    frequency: Frequency;
    intervalCount: number;
    startDate: string;
    endDate?: string | null;
    dayOfMonth?: number | null;
    dayOfWeek?: number | null;
  },
  today: string,
): string | null {
  return firstCursor(
    {
      frequency: input.frequency,
      intervalCount: input.intervalCount,
      startDate: input.startDate,
      endDate: optional(input.endDate),
      dayOfMonth: input.dayOfMonth ?? null,
      dayOfWeek: input.dayOfWeek ?? null,
    },
    today,
  );
}

export async function createRule(
  userId: string,
  input: CreateRecurringRuleInput,
  today: string,
): Promise<string> {
  const admin = createAdminClient();

  const cursor = initialCursor(input, today);

  const { data, error } = await admin
    .from('recurring_rules')
    .insert({
      user_id: userId,
      rule_type: input.ruleType,
      name: input.name,
      description: optional(input.description),
      amount: toDecimalString(parseDecimal(input.amount)),
      currency_code: input.currencyCode,
      frequency: input.frequency,
      interval_count: input.intervalCount,
      day_of_month: input.dayOfMonth ?? null,
      day_of_week: input.dayOfWeek ?? null,
      start_date: input.startDate,
      end_date: optional(input.endDate),
      next_occurrence_date: cursor,
      account_id: optional(input.accountId),
      category_id: optional(input.categoryId),
      provider_name: optional(input.providerName),
      source_name: optional(input.sourceName),
      is_active: true,
      is_paused: false,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Could not create this rule: ${error.code}`);
  return String(data.id);
}

/**
 * §23, §67 — editing.
 *
 * Past and fulfilled occurrences are never touched. Future unfulfilled ones
 * are removed and left for the generator to recreate from the new definition,
 * but only when the user asked for that: silently rewriting dated obligations
 * a user has already planned around is worse than leaving them stale.
 */
export async function updateRule(
  input: UpdateRecurringRuleInput,
  today: string,
): Promise<void> {
  await assertOwned(input.id);
  const admin = createAdminClient();

  const cursor = initialCursor(input, today);

  const { error } = await admin
    .from('recurring_rules')
    .update({
      rule_type: input.ruleType,
      name: input.name,
      description: optional(input.description),
      amount: toDecimalString(parseDecimal(input.amount)),
      currency_code: input.currencyCode,
      frequency: input.frequency,
      interval_count: input.intervalCount,
      day_of_month: input.dayOfMonth ?? null,
      day_of_week: input.dayOfWeek ?? null,
      start_date: input.startDate,
      end_date: optional(input.endDate),
      next_occurrence_date: cursor,
      account_id: optional(input.accountId),
      category_id: optional(input.categoryId),
      provider_name: optional(input.providerName),
      source_name: optional(input.sourceName),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id);

  if (error) throw new Error(`Could not update this rule: ${error.code}`);

  if (input.applyToFuture) {
    await rebuildFutureOccurrences(input.id, today);
  }
}

/**
 * §23, §66 — drop future occurrences so the generator can recreate them.
 *
 * Three things are deliberately spared: anything already fulfilled (it is a
 * real transaction now), anything dated today or earlier (the user may already
 * have acted on it), and anything `detached_from_rule` — a row the user edited
 * by hand, which regeneration must not silently overwrite.
 */
export async function rebuildFutureOccurrences(
  ruleId: string,
  today: string,
): Promise<void> {
  await assertOwned(ruleId);
  const admin = createAdminClient();

  const { error } = await admin
    .from('expected_events')
    .delete()
    .eq('recurring_rule_id', ruleId)
    .eq('status', 'scheduled')
    .eq('detached_from_rule', false)
    .gt('scheduled_date', today);

  if (error) throw new Error(`Could not rebuild occurrences: ${error.code}`);
}

/** §21, §22, §24 — pause, resume, end. */
export async function transitionRule(
  id: string,
  action: 'pause' | 'resume' | 'end',
  today: string,
  endDate?: string | null,
): Promise<void> {
  await assertOwned(id);
  const admin = createAdminClient();

  // §21 — pausing stops FUTURE generation and keeps what already exists.
  // Occurrences already generated stay until the user cancels them
  // individually (§42), which is the distinction §42 asks to be kept.
  const patch =
    action === 'pause'
      ? { is_paused: true }
      : action === 'resume'
        ? { is_paused: false }
        : {
            is_active: false,
            end_date: optional(endDate) ?? today,
          };

  const { error } = await admin
    .from('recurring_rules')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`Could not update this rule: ${error.code}`);
}

/**
 * §19 — generation.
 *
 * Calls the same function pg_cron calls. Scoped to one user when used as the
 * on-load safety check, so opening /forecast never turns into a full-table
 * job on everyone's rules.
 *
 * Requires the admin client: the RPC is revoked from `authenticated`, so a
 * browser cannot reach it even with a forged request.
 */
export async function generateOccurrences(
  userId?: string,
  horizonDays = 90,
): Promise<GenerationResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('run_recurring_generation', {
    p_horizon_days: horizonDays,
    p_user_id: userId ?? null,
  });

  if (error) throw new Error(`Could not generate occurrences: ${error.code}`);

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    skipped: Boolean(result.skipped),
    reason: str(result.reason) ?? undefined,
    jobId: str(result.job_id) ?? undefined,
    status: (str(result.status) as 'succeeded' | 'failed' | null) ?? undefined,
    rules: num(result.rules) ?? undefined,
    created: num(result.created) ?? undefined,
    examined: num(result.examined) ?? undefined,
    errorCode: str(result.error_code),
  };
}
