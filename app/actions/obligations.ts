'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { log } from '@/lib/log';
import type { ActionState } from '@/app/actions/auth';
import {
  createBillSchema,
  createExpectedIncomeSchema,
  createReceivableSchema,
  recordPaymentSchema,
} from '@/schemas/obligation.schema';
import {
  allocatePayment,
  AllocationError,
  cancelObligation,
  createBill,
  createExpectedIncome,
  createReceivable,
  type ObligationKind,
} from '@/services/obligation.service';
import { createTransaction, TransactionError } from '@/services/transaction.service';

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
  const { user } = await requireUser();
  const parsed = createBillSchema.safeParse({
    providerName: formData.get('providerName'),
    description: formData.get('description') ?? '',
    amount: formData.get('amount'),
    currencyCode: formData.get('currencyCode') || 'PHP',
    dueDate: formData.get('dueDate'),
    categoryId: formData.get('categoryId') || null,
    notes: formData.get('notes') ?? '',
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
  redirect('/bills');
}

export async function createReceivableAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireUser();
  const parsed = createReceivableSchema.safeParse({
    partyName: formData.get('partyName'),
    description: formData.get('description') ?? '',
    amount: formData.get('amount'),
    currencyCode: formData.get('currencyCode') || 'PHP',
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
  redirect('/receivables');
}

export async function createExpectedIncomeAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireUser();
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
  redirect('/expected-income');
}

/**
 * Record a payment or collection.
 *
 * Two steps that must both succeed: the transaction, then the allocation. If
 * the allocation fails the transaction still stands — the money genuinely
 * moved, and deleting it would be worse than leaving it unlinked. The message
 * says exactly that, so the user is not left guessing.
 */
export async function recordPaymentAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireUser();

  const parsed = recordPaymentSchema.safeParse({
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
  const currency = String(formData.get('currencyCode') ?? profile.default_currency);
  let transactionId = input.transactionId ?? '';

  if (input.mode === 'new') {
    // A bill payment is an expense; collecting a receivable or expected
    // income is income. The link never redefines the transaction type (§13).
    const isInbound = input.obligationType !== 'bill';
    try {
      transactionId = await createTransaction(user.id, {
        type: isInbound ? 'income' : 'expense',
        amount: input.amount,
        currencyCode: currency,
        transactionDate: input.transactionDate!,
        sourceAccountId: isInbound ? null : input.accountId!,
        destinationAccountId: isInbound ? input.accountId! : null,
        direction: null,
        categoryId: null,
        merchantName: '',
        description: '',
        notes: '',
        refundOfTransactionId: null,
      });
    } catch (error) {
      if (error instanceof TransactionError) return { error: error.message };
      return { error: 'We could not record that transaction.' };
    }
  }

  try {
    await allocatePayment({
      userId: user.id,
      kind: input.obligationType,
      obligationId: input.obligationId,
      transactionId,
      amount: input.amount,
    });
  } catch (error) {
    const detail = error instanceof AllocationError ? error.message : 'Please try again.';
    if (input.mode === 'new') {
      return {
        error: `${detail} The transaction was recorded and your balance is correct — it just is not linked to this item.`,
      };
    }
    return { error: detail };
  }

  revalidatePath(ROUTES[input.obligationType]);
  revalidatePath('/transactions');
  revalidatePath('/accounts');
  revalidatePath('/dashboard');
  return { success: 'Payment recorded.' };
}

export async function cancelObligationAction(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const kind = String(formData.get('kind') ?? '') as ObligationKind;
  const id = String(formData.get('id') ?? '');
  if (!id || !(kind in ROUTES)) return;

  await cancelObligation(user.id, kind, id);
  revalidatePath(ROUTES[kind]);
  revalidatePath('/dashboard');
}
