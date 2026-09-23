'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { log } from '@/lib/log';
import { assertWritesEnabled, WritesDisabledError } from '@/lib/ops/kill-switches';
import {
  createAccountSchema,
  createTransactionSchema,
  voidTransactionSchema,
} from '@/schemas/finance.schema';
import { archiveAccount, createAccount } from '@/services/account.service';
import {
  createTransaction,
  TransactionError,
  voidTransaction,
} from '@/services/transaction.service';
import type { ActionState } from '@/app/actions/auth';

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

export async function createAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireUser();

  // PHASE-14 §23 — the ledger freeze, enforced where the write happens rather
  // than in the UI. A disabled button is a suggestion; this is a refusal.
  try {
    await assertWritesEnabled();
  } catch (error) {
    if (error instanceof WritesDisabledError) return { error: error.message };
    throw error;
  }

  const parsed = createAccountSchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type'),
    nature: formData.get('nature'),
    currencyCode: formData.get('currencyCode') || 'PHP',
    openingBalance: formData.get('openingBalance') || '0',
    institutionName: formData.get('institutionName') ?? '',
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    await createAccount(user.id, parsed.data);
  } catch (error) {
    log.error('account create failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not create that account. Please try again.' };
  }

  revalidatePath('/accounts');
  revalidatePath('/dashboard');
  revalidatePath('/analytics');
  redirect('/accounts?created=1');
}

export async function archiveAccountAction(formData: FormData): Promise<void> {
  const { user } = await requireUser();

  // PHASE-14 §23. This action returns void, so there is no error object to
  // hand back — the throw propagates to the error boundary, which is the
  // honest outcome. Silently doing nothing would leave the account looking
  // archived until the page refreshed and it reappeared.
  await assertWritesEnabled();

  const id = String(formData.get('id') ?? '');
  const archived = String(formData.get('archived') ?? '') === 'true';
  if (!id) return;

  await archiveAccount(user.id, id, archived);
  revalidatePath('/accounts');
  revalidatePath('/dashboard');
  revalidatePath('/analytics');
}

export async function createTransactionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireUser();

  // PHASE-14 §23 — the ledger freeze, enforced where the write happens rather
  // than in the UI. A disabled button is a suggestion; this is a refusal.
  try {
    await assertWritesEnabled();
  } catch (error) {
    if (error instanceof WritesDisabledError) return { error: error.message };
    throw error;
  }

  const raw = {
    type: formData.get('type'),
    direction: formData.get('direction') || null,
    amount: formData.get('amount'),
    currencyCode: formData.get('currencyCode') || 'PHP',
    transactionDate: formData.get('transactionDate'),
    sourceAccountId: formData.get('sourceAccountId') || null,
    destinationAccountId: formData.get('destinationAccountId') || null,
    categoryId: formData.get('categoryId') || null,
    merchantName: formData.get('merchantName') ?? '',
    description: formData.get('description') ?? '',
    notes: formData.get('notes') ?? '',
  };

  const parsed = createTransactionSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    await createTransaction(user.id, parsed.data);
  } catch (error) {
    if (error instanceof TransactionError) return { error: error.message };
    log.error('transaction create failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not save this transaction. Please try again.' };
  }

  revalidatePath('/transactions');
  revalidatePath('/accounts');
  revalidatePath('/dashboard');
  revalidatePath('/analytics');
  redirect(`/transactions?created=1&type=${parsed.data.type}`);
}

export async function voidTransactionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireUser();

  // PHASE-14 §23 — the ledger freeze, enforced where the write happens rather
  // than in the UI. A disabled button is a suggestion; this is a refusal.
  try {
    await assertWritesEnabled();
  } catch (error) {
    if (error instanceof WritesDisabledError) return { error: error.message };
    throw error;
  }

  const parsed = voidTransactionSchema.safeParse({
    id: formData.get('id'),
    reason: formData.get('reason') ?? '',
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    await voidTransaction(user.id, parsed.data.id, parsed.data.reason);
  } catch (error) {
    if (error instanceof TransactionError) return { error: error.message };
    return { error: 'We could not void this transaction.' };
  }

  revalidatePath('/transactions');
  revalidatePath('/accounts');
  revalidatePath('/dashboard');
  revalidatePath('/analytics');
  for (const route of [
    '/bills',
    '/receivables',
    '/expected-income',
    '/recurring',
    '/forecast',
  ])
    revalidatePath(route, 'layout');
  return { success: 'Transaction voided. It no longer affects your balances.' };
}
