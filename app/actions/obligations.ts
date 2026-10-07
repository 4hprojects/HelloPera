'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { recordAuditEvent } from '@/lib/auth/audit';
import { todayInTimezone } from '@/lib/finance/obligation';
import { log } from '@/lib/log';
import { assertWritesEnabled, WritesDisabledError } from '@/lib/ops/kill-switches';
import type { ActionState } from '@/app/actions/auth';
import {
  createBillSchema,
  createExpectedIncomeSchema,
  createReceivableSchema,
  recordPaymentSchema,
  updateBillSchema,
  updateExpectedIncomeSchema,
  updateReceivableSchema,
} from '@/schemas/obligation.schema';
import { createRecurringRuleSchema } from '@/schemas/recurring.schema';
import { createRule, generateOccurrences } from '@/services/recurring-rule.service';
import {
  recordObligationPayment,
  AllocationError,
  cancelObligation,
  createBill,
  createExpectedIncome,
  createReceivable,
  getObligation,
  linkExpectedIncomeToRule,
  listPaymentCandidates,
  ObligationEditError,
  updateFutureExpectedIncome,
  updateObligation,
  type ObligationKind,
  type PaymentCandidate,
} from '@/services/obligation.service';
import { formRejected, REJECTED_FORM } from '@/lib/validation/form';
import { ACTION_ARGS, FORMS } from '@/schemas/forms';

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

const ROUTES: Record<ObligationKind, string> = {
  bill: '/bills',
  receivable: '/receivables',
  expected_income: '/expected-income',
};

export async function createBillAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formRejected(formData, FORMS.obligations.createBill, 'createBillAction'))
    return { error: REJECTED_FORM };
  const { user } = await requireUser();

  // PHASE-14 §23 — the ledger freeze, enforced at the write.
  try {
    await assertWritesEnabled();
  } catch (error) {
    if (error instanceof WritesDisabledError) return { error: error.message };
    throw error;
  }
  const parsed = createBillSchema.safeParse({
    providerName: formData.get('providerName'),
    description: formData.get('description') ?? '',
    amount: formData.get('amount'),
    currencyCode: formData.get('currencyCode') || 'PHP',
    dueDate: formData.get('dueDate'),
    categoryId: formData.get('categoryId') || null,
    notes: formData.get('notes') ?? '',
    installmentAmount: formData.get('installmentAmount') ?? '',
    installmentCount: formData.get('installmentCount') ?? '',
    installmentsPrior: formData.get('installmentsPrior') ?? '',
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    await createBill(user.id, parsed.data);
  } catch (error) {
    log.error('bill create failed', { m: error instanceof Error ? error.message : '?' });
    return { error: 'We could not create that bill. Please try again.' };
  }
  revalidatePath('/bills');
  revalidatePath('/dashboard');
  revalidatePath('/analytics');
  redirect('/bills?created=1');
}

export async function createReceivableAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (
    formRejected(formData, FORMS.obligations.createReceivable, 'createReceivableAction')
  )
    return { error: REJECTED_FORM };
  const { user } = await requireUser();

  // PHASE-14 §23 — the ledger freeze, enforced at the write.
  try {
    await assertWritesEnabled();
  } catch (error) {
    if (error instanceof WritesDisabledError) return { error: error.message };
    throw error;
  }
  const parsed = createReceivableSchema.safeParse({
    partyName: formData.get('partyName'),
    description: formData.get('description') ?? '',
    amount: formData.get('amount'),
    currencyCode: formData.get('currencyCode') || 'PHP',
    borrowedDate: formData.get('borrowedDate') || '',
    dueDate: formData.get('dueDate') || '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    await createReceivable(user.id, parsed.data);
  } catch (error) {
    log.error('receivable create failed', {
      m: error instanceof Error ? error.message : '?',
    });
    return { error: 'We could not create that receivable. Please try again.' };
  }
  revalidatePath('/receivables');
  revalidatePath('/dashboard');
  revalidatePath('/analytics');
  redirect('/receivables?created=1');
}

export async function createExpectedIncomeAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (
    formRejected(
      formData,
      FORMS.obligations.createExpectedIncome,
      'createExpectedIncomeAction',
    )
  )
    return { error: REJECTED_FORM };
  const { user, profile } = await requireUser();

  // PHASE-14 §23 — the ledger freeze, enforced at the write.
  try {
    await assertWritesEnabled();
  } catch (error) {
    if (error instanceof WritesDisabledError) return { error: error.message };
    throw error;
  }

  // A repeating income is a recurring rule; the generator then creates one
  // expected-income record per pay date, each carrying this estimate.
  if (formData.get('frequency'))
    return createRecurringIncome(user.id, profile.timezone, formData);

  const parsed = createExpectedIncomeSchema.safeParse({
    sourceName: formData.get('sourceName'),
    description: formData.get('description') ?? '',
    amount: formData.get('amount'),
    currencyCode: formData.get('currencyCode') || 'PHP',
    expectedDate: formData.get('expectedDate'),
    categoryId: formData.get('categoryId') || null,
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    await createExpectedIncome(user.id, parsed.data);
  } catch (error) {
    log.error('expected income create failed', {
      m: error instanceof Error ? error.message : '?',
    });
    return { error: 'We could not create that. Please try again.' };
  }
  revalidatePath('/expected-income');
  revalidatePath('/dashboard');
  revalidatePath('/analytics');
  redirect('/expected-income?created=1');
}

async function createRecurringIncome(
  userId: string,
  timezone: string,
  formData: FormData,
): Promise<ActionState> {
  const source = formData.get('sourceName');
  const parsed = createRecurringRuleSchema.safeParse({
    ruleType: 'expected_income',
    name: source,
    sourceName: source,
    description: formData.get('description') ?? '',
    amount: formData.get('amount'),
    currencyCode: formData.get('currencyCode') || 'PHP',
    frequency: formData.get('frequency'),
    intervalCount: 1,
    startDate: formData.get('expectedDate'),
    endDate: formData.get('endDate') ?? '',
    categoryId: formData.get('categoryId') || null,
  });
  if (!parsed.success) {
    const errors = fieldErrorsFrom(parsed.error);
    return {
      fieldErrors: {
        ...errors,
        ...(errors.name ? { sourceName: errors.name } : {}),
        ...(errors.startDate ? { expectedDate: errors.startDate } : {}),
      },
    };
  }

  try {
    const id = await createRule(userId, parsed.data, todayInTimezone(timezone));
    await recordAuditEvent({
      eventType: 'recurring_rule_created',
      actorUserId: userId,
      entityType: 'recurring_rule',
      entityId: id,
      metadata: { rule_type: 'expected_income', frequency: parsed.data.frequency },
    });
    await generateOccurrences(userId);
  } catch (error) {
    log.error('recurring income create failed', {
      m: error instanceof Error ? error.message : '?',
    });
    return { error: 'We could not create that. Please try again.' };
  }
  for (const path of [
    '/expected-income',
    '/recurring',
    '/forecast',
    '/dashboard',
    '/analytics',
  ])
    revalidatePath(path);
  redirect('/expected-income?created=1');
}

/**
 * Record a payment or collection.
 *
 * One atomic database call (`record_obligation_payment`): creating the
 * transaction and allocating it either both happen or neither does. The form's
 * request key makes a retry replay the original result instead of recording a
 * second payment; "Record another payment" supplies a fresh key. Linking an
 * existing transaction only adds the allocation and never changes a balance.
 */
export async function recordPaymentAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formRejected(formData, FORMS.obligations.recordPayment, 'recordPaymentAction'))
    return { error: REJECTED_FORM };
  const { user } = await requireUser();

  // PHASE-14 §23 — the ledger freeze, enforced at the write.
  try {
    await assertWritesEnabled();
  } catch (error) {
    if (error instanceof WritesDisabledError) return { error: error.message };
    throw error;
  }

  const parsed = recordPaymentSchema.safeParse({
    requestId: formData.get('requestId'),
    obligationType: formData.get('obligationType'),
    obligationId: formData.get('obligationId'),
    mode: formData.get('mode') || 'new',
    amount: formData.get('amount'),
    accountId: formData.get('accountId') || null,
    transactionDate: formData.get('transactionDate') || undefined,
    transactionId: formData.get('transactionId') || null,
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  try {
    await recordObligationPayment(user.id, input);
  } catch (error) {
    return {
      error:
        error instanceof AllocationError
          ? error.message
          : 'Payment could not be recorded. Please retry with the same form.',
    };
  }

  revalidatePath(ROUTES[input.obligationType]);
  revalidatePath('/transactions');
  revalidatePath('/accounts');
  revalidatePath('/dashboard');
  revalidatePath('/analytics');
  revalidatePath(`${ROUTES[input.obligationType]}/${input.obligationId}`);
  revalidatePath('/forecast');
  return { success: 'Payment recorded.' };
}

export async function cancelObligationAction(formData: FormData): Promise<void> {
  if (
    formRejected(formData, FORMS.obligations.cancelObligation, 'cancelObligationAction')
  )
    return;
  const { user } = await requireUser();

  // PHASE-14 §23. Void action: the throw reaches the error boundary rather
  // than silently doing nothing.
  await assertWritesEnabled();
  const kind = String(formData.get('kind') ?? '') as ObligationKind;
  const id = String(formData.get('id') ?? '');
  if (!id || !(kind in ROUTES)) return;

  await cancelObligation(user.id, kind, id);
  revalidatePath(ROUTES[kind]);
  revalidatePath(`${ROUTES[kind]}/${id}`);
  revalidatePath('/forecast');
  revalidatePath('/dashboard');
  revalidatePath('/analytics');
}

/** Read-only page of linkable transactions for the payment picker. */
export async function searchPaymentCandidatesAction(input: {
  kind: ObligationKind;
  currency: string;
  search?: string;
  cursor?: string | null;
}): Promise<{ items: PaymentCandidate[]; next: string | null; error?: string }> {
  await requireUser();
  const parsed = ACTION_ARGS.searchPaymentCandidates.safeParse(input);
  if (!parsed.success) return { items: [], next: null, error: 'Unknown item type.' };
  input = parsed.data;
  try {
    return await listPaymentCandidates({
      kind: input.kind,
      currency: String(input.currency).slice(0, 3).toUpperCase(),
      search: input.search,
      cursor: input.cursor,
    });
  } catch {
    return { items: [], next: null, error: 'Transactions could not be loaded.' };
  }
}

export async function updateObligationAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (
    formRejected(formData, FORMS.obligations.updateObligation, 'updateObligationAction')
  )
    return { error: REJECTED_FORM };
  const { user, profile } = await requireUser();
  try {
    await assertWritesEnabled();
  } catch (error) {
    if (error instanceof WritesDisabledError) return { error: error.message };
    throw error;
  }

  const kind = String(formData.get('kind') ?? '') as ObligationKind;
  if (!(kind in ROUTES)) return { error: 'That item could not be edited.' };

  const common = {
    id: formData.get('id'),
    description: formData.get('description') ?? '',
    amount: formData.get('amount'),
    notes: formData.get('notes') ?? '',
  };
  const categoryId = formData.get('categoryId') || null;

  let input;
  if (kind === 'bill') {
    const parsed = updateBillSchema.safeParse({
      ...common,
      providerName: formData.get('name'),
      dueDate: formData.get('date'),
      categoryId,
      installmentAmount: formData.get('installmentAmount') ?? '',
      installmentCount: formData.get('installmentCount') ?? '',
      installmentsPrior: formData.get('installmentsPrior') ?? '',
    });
    if (!parsed.success)
      return { fieldErrors: remapFieldErrors(parsed.error, 'providerName', 'dueDate') };
    input = { ...parsed.data, name: parsed.data.providerName, date: parsed.data.dueDate };
  } else if (kind === 'receivable') {
    const parsed = updateReceivableSchema.safeParse({
      ...common,
      partyName: formData.get('name'),
      borrowedDate: formData.get('borrowedDate') ?? '',
      dueDate: formData.get('date') ?? '',
    });
    if (!parsed.success)
      return { fieldErrors: remapFieldErrors(parsed.error, 'partyName', 'dueDate') };
    input = {
      ...parsed.data,
      name: parsed.data.partyName,
      date: parsed.data.dueDate || '',
    };
  } else {
    const parsed = updateExpectedIncomeSchema.safeParse({
      ...common,
      sourceName: formData.get('name'),
      expectedDate: formData.get('date'),
      categoryId,
    });
    if (!parsed.success)
      return {
        fieldErrors: remapFieldErrors(parsed.error, 'sourceName', 'expectedDate'),
      };
    input = {
      ...parsed.data,
      name: parsed.data.sourceName,
      date: parsed.data.expectedDate,
    };
  }

  // Validate any repeat change up front so a bad end date cannot leave the
  // record edited but the rule uncreated.
  const repeat =
    kind === 'expected_income'
      ? await planRepeatChange(
          user.id,
          todayInTimezone(profile.timezone),
          formData,
          input,
        )
      : null;
  if (repeat && 'state' in repeat) return repeat.state;

  try {
    await updateObligation(user.id, kind, input);
    await repeat?.run();
  } catch (error) {
    if (error instanceof ObligationEditError) return { error: error.message };
    log.error('obligation update failed', {
      m: error instanceof Error ? error.message : '?',
    });
    return { error: 'We could not save these changes. Please try again.' };
  }

  revalidatePath(ROUTES[kind]);
  revalidatePath('/recurring');
  revalidatePath(`${ROUTES[kind]}/${input.id}`);
  revalidatePath('/forecast');
  revalidatePath('/dashboard');
  revalidatePath('/analytics');
  return { success: 'Changes saved.' };
}

type RepeatPlan = { state: ActionState } | { run: () => Promise<void> } | null;

/**
 * What the edit modal's repeat controls ask for, on top of the plain edit.
 *
 * A record that came from a rule is identified server-side, never from a form
 * field, and "this and all later" carries the edit forward. A one-off record
 * with a "Repeats" choice becomes the first occurrence of a new rule.
 */
async function planRepeatChange(
  userId: string,
  today: string,
  formData: FormData,
  input: {
    id: string;
    name: string;
    amount: string;
    date: string;
    description?: string | null;
    categoryId?: string | null;
  },
): Promise<RepeatPlan> {
  const item = await getObligation('expected_income', input.id, today);
  if (!item) return { state: { error: 'That item no longer exists.' } };

  if (item.recurringRuleId) {
    if (formData.get('scope') !== 'future') return null;
    const ruleId = item.recurringRuleId;
    return {
      run: () =>
        updateFutureExpectedIncome(userId, ruleId, item.date ?? today, {
          name: input.name,
          amount: input.amount,
          description: input.description ?? '',
          categoryId: input.categoryId ?? null,
        }),
    };
  }

  const frequency = formData.get('frequency');
  if (!frequency) return null;
  const parsed = createRecurringRuleSchema.safeParse({
    ruleType: 'expected_income',
    name: input.name,
    sourceName: input.name,
    description: input.description ?? '',
    amount: input.amount,
    currencyCode: item.currency,
    frequency,
    intervalCount: 1,
    startDate: input.date,
    endDate: formData.get('endDate') ?? '',
    categoryId: input.categoryId ?? null,
  });
  if (!parsed.success) {
    const errors = fieldErrorsFrom(parsed.error);
    return {
      state: {
        fieldErrors: {
          ...errors,
          ...(errors.startDate ? { date: errors.startDate } : {}),
        },
      },
    };
  }
  return {
    run: async () => {
      const ruleId = await createRule(userId, parsed.data, today);
      await linkExpectedIncomeToRule(userId, input.id, ruleId, input.date);
      await recordAuditEvent({
        eventType: 'recurring_rule_created',
        actorUserId: userId,
        entityType: 'recurring_rule',
        entityId: ruleId,
        metadata: { rule_type: 'expected_income', frequency: parsed.data.frequency },
      });
      await generateOccurrences(userId);
    },
  };
}

/** The edit form uses generic `name` / `date` inputs for all three kinds. */
function remapFieldErrors(
  error: { issues: Array<{ path: PropertyKey[]; message: string }> },
  nameKey: string,
  dateKey: string,
) {
  const out = fieldErrorsFrom(error);
  if (out[nameKey]) out.name = out[nameKey];
  if (out[dateKey]) out.date = out[dateKey];
  return out;
}
