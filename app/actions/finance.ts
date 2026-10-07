'use server';

import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { log } from '@/lib/log';
import { assertWritesEnabled, WritesDisabledError } from '@/lib/ops/kill-switches';
import {
  createAccountSchema,
  createTransactionSchema,
  updateAccountSchema,
  updateTransactionSchema,
  voidTransactionSchema,
} from '@/schemas/finance.schema';
import {
  archiveAccount,
  createAccount,
  createLoanAccount,
  AccountEditError,
  deleteAccount,
  getAccount,
  updateAccountDetails,
} from '@/services/account.service';
import { deriveTransactionCurrency } from '@/lib/finance/currency';
import {
  createTransaction,
  TransactionError,
  updateTransaction,
  voidTransaction,
} from '@/services/transaction.service';
import type { ActionState } from '@/app/actions/auth';
import { formRejected, REJECTED_FORM } from '@/lib/validation/form';
import { FORMS } from '@/schemas/forms';

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
  if (formRejected(formData, FORMS.finance.createAccount, 'createAccountAction'))
    return { error: REJECTED_FORM };
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
    requestId: formData.get('requestId'),
    name: formData.get('name'),
    type: formData.get('type'),
    nature: formData.get('nature'),
    currencyCode: formData.get('currencyCode') || 'PHP',
    openingBalance: formData.get('openingBalance') || '0',
    institutionName: formData.get('institutionName') ?? '',
    bankLast4: formData.get('bankLast4') ?? '',
    bankKind: formData.get('bankKind') ?? '',
    paymentAmount: formData.get('paymentAmount') ?? '',
    paymentFrequency: formData.get('paymentFrequency') ?? '',
    nextDueDate: formData.get('nextDueDate') ?? '',
    principal: formData.get('principal') ?? '',
    loanStartDate: formData.get('loanStartDate') ?? '',
    interestRateApr: formData.get('interestRateApr') ?? '',
    termMonths: formData.get('termMonths') ?? '',
    createReminder: formData.get('createReminder') === 'on',
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    if (parsed.data.type === 'loan') await createLoanAccount(user.id, parsed.data);
    else await createAccount(user.id, parsed.data);
  } catch (error) {
    log.error('account create failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not create that account. Please try again.' };
  }

  revalidatePath('/accounts');
  revalidatePath('/dashboard');
  revalidatePath('/analytics');
  if (parsed.data.type === 'loan') revalidatePath('/bills');
  redirect('/accounts?created=1');
}

export async function archiveAccountAction(formData: FormData): Promise<void> {
  if (formRejected(formData, FORMS.finance.archiveAccount, 'archiveAccountAction'))
    return;
  const { user } = await requireUser();

  // PHASE-14 §23. This action returns void, so there is no error object to
  // hand back — the throw propagates to the error boundary, which is the
  // honest outcome. Silently doing nothing would leave the account looking
  // archived until the page refreshed and it reappeared.
  await assertWritesEnabled();

  const id = String(formData.get('id') ?? '');
  const archived = String(formData.get('archived') ?? '') === 'true';
  if (!id) return;

  // Another user's id matches no row: answer as not found, never success.
  if (!(await archiveAccount(user.id, id, archived))) notFound();
  revalidatePath('/accounts');
  revalidatePath('/dashboard');
  revalidatePath('/analytics');
}

export async function createTransactionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formRejected(formData, FORMS.finance.createTransaction, 'createTransactionAction'))
    return { error: REJECTED_FORM };
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
    requestId: formData.get('requestId'),
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

  // The accounts decide the currency. Whatever the browser sent is ignored, so
  // a stale or tampered value cannot disagree with the ledger.
  const [source, destination] = await Promise.all([
    raw.sourceAccountId ? getAccount(String(raw.sourceAccountId)) : null,
    raw.destinationAccountId ? getAccount(String(raw.destinationAccountId)) : null,
  ]);
  if ((raw.sourceAccountId && !source) || (raw.destinationAccountId && !destination)) {
    return { error: 'Choose one of your accounts.' };
  }
  const derived = deriveTransactionCurrency(
    source && { id: source.id, currency: source.currency_code },
    destination && { id: destination.id, currency: destination.currency_code },
  );
  if (!derived.ok) return { error: derived.message };
  raw.currencyCode = derived.currency;

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
  if (formRejected(formData, FORMS.finance.voidTransaction, 'voidTransactionAction'))
    return { error: REJECTED_FORM };
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

export async function deleteAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formRejected(formData, FORMS.finance.deleteAccount, 'deleteAccountAction'))
    return { error: REJECTED_FORM };
  const { user } = await requireUser();
  try {
    await assertWritesEnabled();
  } catch (error) {
    if (error instanceof WritesDisabledError) return { error: error.message };
    throw error;
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'That account could not be deleted.' };

  try {
    await deleteAccount(user.id, id);
  } catch (error) {
    if (error instanceof AccountEditError) return { error: error.message };
    log.error('account delete failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not delete this account. Please try again.' };
  }

  revalidatePath('/accounts');
  revalidatePath('/dashboard');
  revalidatePath('/analytics');
  revalidatePath('/bills');
  revalidatePath('/recurring', 'layout');
  revalidatePath('/forecast');
  return { success: 'Account deleted.' };
}

export async function updateAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formRejected(formData, FORMS.finance.updateAccount, 'updateAccountAction'))
    return { error: REJECTED_FORM };
  const { user } = await requireUser();
  try {
    await assertWritesEnabled();
  } catch (error) {
    if (error instanceof WritesDisabledError) return { error: error.message };
    throw error;
  }

  const id = String(formData.get('id') ?? '');
  // The type decides which fields apply, so read it from the row, not the form.
  const account = id ? await getAccount(id) : null;
  if (!account) return { error: 'That account no longer exists.' };

  const parsed = updateAccountSchema.safeParse({
    id,
    type: account.type,
    name: formData.get('name'),
    institutionName: formData.get('institutionName') ?? '',
    bankLast4: formData.get('bankLast4') ?? '',
    bankKind: formData.get('bankKind') ?? '',
    paymentAmount: formData.get('paymentAmount') ?? '',
    paymentFrequency: formData.get('paymentFrequency') ?? '',
    nextDueDate: formData.get('nextDueDate') ?? '',
    principal: formData.get('principal') ?? '',
    interestRateApr: formData.get('interestRateApr') ?? '',
    termMonths: formData.get('termMonths') ?? '',
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    await updateAccountDetails(user.id, parsed.data);
  } catch (error) {
    if (error instanceof AccountEditError) return { error: error.message };
    log.error('account update failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not save these changes. Please try again.' };
  }

  revalidatePath('/accounts');
  revalidatePath('/dashboard');
  if (account.type === 'loan') {
    revalidatePath('/bills');
    revalidatePath('/recurring', 'layout');
    revalidatePath('/forecast');
  }
  return { success: 'Account updated.' };
}

export async function updateTransactionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formRejected(formData, FORMS.finance.updateTransaction, 'updateTransactionAction'))
    return { error: REJECTED_FORM };
  const { user } = await requireUser();
  try {
    await assertWritesEnabled();
  } catch (error) {
    if (error instanceof WritesDisabledError) return { error: error.message };
    throw error;
  }

  const parsed = updateTransactionSchema.safeParse({
    id: formData.get('id'),
    amount: formData.get('amount'),
    transactionDate: formData.get('transactionDate'),
    categoryId: formData.get('categoryId') || null,
    merchantName: formData.get('merchantName') ?? '',
    description: formData.get('description') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    await updateTransaction(user.id, parsed.data);
  } catch (error) {
    if (error instanceof TransactionError) return { error: error.message };
    log.error('transaction update failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not save these changes. Please try again.' };
  }

  revalidatePath('/transactions');
  revalidatePath('/accounts');
  revalidatePath('/dashboard');
  revalidatePath('/analytics');
  revalidatePath('/forecast');
  return { success: 'Transaction updated.' };
}
