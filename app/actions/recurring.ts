'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { todayInTimezone } from '@/lib/finance/obligation';
import { log } from '@/lib/log';
import { recordAuditEvent } from '@/lib/auth/audit';
import type { ActionState } from '@/app/actions/auth';
import {
  createRecurringRuleSchema,
  expectedEventActionSchema,
  ruleTransitionSchema,
  updateRecurringRuleSchema,
} from '@/schemas/recurring.schema';
import {
  createRule,
  generateOccurrences,
  transitionRule,
  updateRule,
} from '@/services/recurring-rule.service';
import {
  fulfillExpectedEvent,
  setEventStatus,
  setIncludeInForecast,
} from '@/services/expected-event.service';

/**
 * Recurring rules and expected events — PHASE-07 §48 to §50.
 *
 * These actions are the ONLY path to the generation RPCs: every Phase 07
 * function is revoked from `anon` and `authenticated`, so a browser cannot
 * reach them even with a forged request. The services behind these actions
 * use the secret key and check ownership in code first.
 */

function fieldErrorsFrom(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** §61 — one shape for the expected-event rows. */
async function audit(
  eventType:
    'expected_event_fulfilled' | 'expected_event_skipped' | 'expected_event_cancelled',
  actorUserId: string,
  entityId: string,
): Promise<void> {
  await recordAuditEvent({
    eventType,
    actorUserId,
    entityType: 'expected_event',
    entityId,
  });
}

/** Every surface a recurring change can move. */
function revalidateAll(): void {
  revalidatePath('/recurring');
  revalidatePath('/forecast');
  revalidatePath('/dashboard');
  revalidatePath('/bills');
  revalidatePath('/expected-income');
}

function formValues(formData: FormData) {
  return {
    ruleType: formData.get('ruleType'),
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    amount: formData.get('amount'),
    currencyCode: formData.get('currencyCode') || 'PHP',
    frequency: formData.get('frequency'),
    intervalCount: formData.get('intervalCount') || 1,
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate') ?? '',
    dayOfMonth: formData.get('dayOfMonth') || null,
    dayOfWeek: formData.get('dayOfWeek') || null,
    accountId: formData.get('accountId') || null,
    categoryId: formData.get('categoryId') || null,
    providerName: formData.get('providerName') ?? '',
    sourceName: formData.get('sourceName') ?? '',
  };
}

export async function createRecurringRuleAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireUser();
  const parsed = createRecurringRuleSchema.safeParse(formValues(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  // §47 — every date boundary is the user's local one, never the server's.
  const today = todayInTimezone(profile.timezone);

  let id: string;
  try {
    id = await createRule(user.id, parsed.data, today);
    await recordAuditEvent({
      eventType: 'recurring_rule_created',
      actorUserId: user.id,
      entityType: 'recurring_rule',
      entityId: id,
      metadata: { rule_type: parsed.data.ruleType, frequency: parsed.data.frequency },
    });
    // Generate this rule's occurrences immediately rather than waiting up to
    // an hour for cron: a rule that appears to do nothing after being created
    // reads as broken.
    await generateOccurrences(user.id);
  } catch (error) {
    log.error('recurring: create failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not create this recurring rule. Please try again.' };
  }

  revalidateAll();
  redirect(`/recurring/${id}`);
}

export async function updateRecurringRuleAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireUser();
  const parsed = updateRecurringRuleSchema.safeParse({
    ...formValues(formData),
    id: formData.get('id'),
    applyToFuture: formData.get('applyToFuture') ?? '',
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    await updateRule(parsed.data, todayInTimezone(profile.timezone));
    await recordAuditEvent({
      eventType: 'recurring_rule_updated',
      actorUserId: user.id,
      entityType: 'recurring_rule',
      entityId: parsed.data.id,
      metadata: { applied_to_future: parsed.data.applyToFuture },
    });
    await generateOccurrences(user.id);
  } catch (error) {
    log.error('recurring: update failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not update this recurring rule. Please try again.' };
  }

  revalidateAll();
  redirect(`/recurring/${parsed.data.id}`);
}

/** §21, §22, §24 — pause, resume, end. */
export async function transitionRuleAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireUser();
  const parsed = ruleTransitionSchema.safeParse({
    id: formData.get('id'),
    action: formData.get('action'),
    endDate: formData.get('endDate') ?? '',
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    await transitionRule(
      parsed.data.id,
      parsed.data.action,
      todayInTimezone(profile.timezone),
      parsed.data.endDate,
    );
    await recordAuditEvent({
      eventType:
        parsed.data.action === 'pause'
          ? 'recurring_rule_paused'
          : parsed.data.action === 'resume'
            ? 'recurring_rule_resumed'
            : 'recurring_rule_ended',
      actorUserId: user.id,
      entityType: 'recurring_rule',
      entityId: parsed.data.id,
    });
    // §22 — resuming continues from the next valid occurrence. Generating here
    // makes that immediate instead of waiting for the next scheduled run.
    if (parsed.data.action === 'resume') {
      await generateOccurrences(user.id);
    }
  } catch (error) {
    log.error('recurring: transition failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not update this rule. Please try again.' };
  }

  revalidateAll();
  return {
    success:
      parsed.data.action === 'pause'
        ? 'Rule paused. Occurrences already created are still there.'
        : parsed.data.action === 'resume'
          ? 'Rule resumed.'
          : 'Rule ended. Its history is kept.',
  };
}

/** §39, §41, §42, §43 — acting on one occurrence, never the whole rule. */
export async function expectedEventAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireUser();
  const parsed = expectedEventActionSchema.safeParse({
    id: formData.get('id'),
    action: formData.get('action'),
    transactionId: formData.get('transactionId') ?? '',
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { id, action, transactionId } = parsed.data;

  try {
    switch (action) {
      case 'fulfill':
        if (!transactionId) {
          return { error: 'Choose the transaction that matched this occurrence.' };
        }
        await fulfillExpectedEvent(id, transactionId);
        await audit('expected_event_fulfilled', user.id, id);
        break;
      case 'skip':
        await setEventStatus(id, 'skipped');
        await audit('expected_event_skipped', user.id, id);
        break;
      case 'cancel':
        await setEventStatus(id, 'cancelled');
        await audit('expected_event_cancelled', user.id, id);
        break;
      case 'include':
        await setIncludeInForecast(id, true);
        break;
      case 'exclude':
        await setIncludeInForecast(id, false);
        break;
    }
  } catch (error) {
    log.error('recurring: event action failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not update this occurrence. Please try again.' };
  }

  revalidateAll();
  return { success: 'Updated.' };
}

/**
 * §19 — a manual "check for new occurrences".
 *
 * The same function pg_cron calls, scoped to this user. Exists so generation
 * is never something the user has to wait an hour for, and so the fallback in
 * §2 has a hand-operated equivalent.
 */
export async function generateOccurrencesAction(
  _p: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { user } = await requireUser();

  try {
    const result = await generateOccurrences(user.id);
    revalidateAll();

    if (result.skipped) {
      return { success: 'A generation run is already in progress.' };
    }
    const created = result.created ?? 0;
    return {
      success:
        created === 0
          ? 'Everything is already up to date.'
          : `Added ${created} upcoming ${created === 1 ? 'occurrence' : 'occurrences'}.`,
    };
  } catch (error) {
    log.error('recurring: manual generation failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not refresh upcoming occurrences. Please try again.' };
  }
}
