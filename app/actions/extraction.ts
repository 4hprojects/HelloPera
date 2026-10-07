'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { log } from '@/lib/log';
import type { ActionState } from '@/app/actions/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { OcrError, runExtraction } from '@/services/ocr.service';
import { UsageLimitError } from '@/services/usage.service';
import { createTransaction, TransactionError } from '@/services/transaction.service';
import {
  createBill,
  createExpectedIncome,
  createReceivable,
} from '@/services/obligation.service';
import { missingRequiredFieldsForDraft, type TargetType } from '@/lib/ocr/schema';
import { draftRequestId } from '@/lib/ocr/drafts';
import { getAccount } from '@/services/account.service';
import { isoDate, positiveAmount } from '@/schemas/primitives';
import { isFlagEnabled } from '@/services/plan.service';
import { assertWritesEnabled, WritesDisabledError } from '@/lib/ops/kill-switches';
import { formRejected, REJECTED_FORM } from '@/lib/validation/form';
import { FORMS } from '@/schemas/forms';
import { RateLimitError } from '@/services/rate-limit.service';

export async function runExtractionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formRejected(formData, FORMS.extraction.runExtraction, 'runExtractionAction'))
    return { error: REJECTED_FORM };
  const { user, profile } = await requireUser();
  const documentId = String(formData.get('documentId') ?? '');
  if (!documentId) return { error: 'No document selected.' };

  try {
    await runExtraction({
      userId: user.id,
      documentId,
      defaultCurrency: profile.default_currency,
      timezone: profile.timezone,
    });
  } catch (error) {
    // PHASE-09 §33 — say the number, say when it resets, and never imply the
    // user is stuck: manual entry is always available, which §33 is explicit
    // about ("Do not block manual transaction entry").
    if (error instanceof UsageLimitError) {
      return {
        error:
          `You've used your ${error.limit} document scans for this month. ` +
          `Your limit resets on ${formatResetDate(error.resetsOn)}. ` +
          `You can still add this transaction manually.`,
      };
    }
    if (error instanceof RateLimitError) return { error: error.userMessage };
    if (error instanceof OcrError) return { error: error.message };
    log.error('extraction action failed', { document_id: documentId });
    return { error: 'We could not read that document.' };
  }

  revalidatePath(`/documents/${documentId}/review`);
  revalidatePath('/documents');
  // From the documents list the person asked to "Read & draft": take them
  // straight to the draft rather than leaving them on the list to find it.
  if (formData.get('redirectTo') === 'review') {
    redirect(`/documents/${documentId}/review`);
  }
  return { success: 'Document read. Review the details below.' };
}

export async function discardExtractionAction(formData: FormData): Promise<void> {
  if (
    formRejected(formData, FORMS.extraction.discardExtraction, 'discardExtractionAction')
  )
    return;
  const { user } = await requireUser();
  const extractionId = String(formData.get('extractionId') ?? '');
  const documentId = String(formData.get('documentId') ?? '');
  if (!extractionId) return;

  const admin = createAdminClient();
  await admin.rpc('discard_extraction', {
    p_user_id: user.id,
    p_extraction_id: extractionId,
  });

  revalidatePath(`/documents/${documentId}/review`);
  revalidatePath('/documents');
}

/** "2026-10-01" -> "October 1", for the §33 limit message. */
function formatResetDate(iso: string): string {
  const [y = '1970', m = '01', d = '01'] = iso.split('-');
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).toLocaleDateString(
    'en-US',
    { month: 'long', day: 'numeric', timeZone: 'UTC' },
  );
}

export type DraftResult = { index: number; ok: boolean; message: string };
export type DraftsState = ActionState & { results?: DraftResult[] };

const FIELD_LABELS = { name: 'name', amount: 'amount', date: 'date' } as const;

/**
 * Save the drafts a person ticked.
 *
 * Each draft is created from the values the USER submitted (their edits, not
 * what was read), then recorded with confirm_extraction_draft, which accepts a
 * draft index once. Drafts are independent: one that fails does not undo the
 * ones already saved, and the result says which is which.
 */
export async function confirmDraftsAction(
  _prev: DraftsState,
  formData: FormData,
): Promise<DraftsState> {
  if (formRejected(formData, FORMS.extraction.confirmDrafts, 'confirmDraftsAction'))
    return { error: REJECTED_FORM };
  const { user } = await requireUser();

  if (!(await isFlagEnabled('ocr_enabled'))) {
    return { error: 'Document reading is not available yet. Nothing was changed.' };
  }
  try {
    await assertWritesEnabled();
  } catch (error) {
    if (error instanceof WritesDisabledError) return { error: error.message };
    throw error;
  }

  const extractionId = String(formData.get('extractionId') ?? '');
  const documentId = String(formData.get('documentId') ?? '');
  const count = Math.min(Number(formData.get('count') ?? 0) || 0, 30);
  const sharedAccountId = String(formData.get('accountId') ?? '');
  if (!extractionId) return { error: 'No document selected.' };

  const selected: number[] = [];
  for (let i = 0; i < count; i++) {
    if (formData.get(`d${i}.selected`) === 'on') selected.push(i);
  }
  if (selected.length === 0) return { error: 'Tick at least one record to save.' };

  const account = sharedAccountId ? await getAccount(sharedAccountId) : null;
  const results: DraftResult[] = [];
  const admin = createAdminClient();

  for (const i of selected) {
    const get = (key: string) => String(formData.get(`d${i}.${key}`) ?? '').trim();
    const target = get('target') as Exclude<TargetType, 'unknown'>;
    const name = get('name');
    const amountRaw = get('amount');
    const dateRaw = get('date');
    const categoryId = get('categoryId') || null;
    const description = get('description');

    const missing = missingRequiredFieldsForDraft({
      target,
      name,
      amount: amountRaw,
      date: dateRaw,
    });
    if (missing.length > 0) {
      results.push({
        index: i,
        ok: false,
        message: `Fill in: ${missing.map((m) => FIELD_LABELS[m]).join(', ')}`,
      });
      continue;
    }
    const amount = positiveAmount.safeParse(amountRaw);
    if (!amount.success) {
      results.push({
        index: i,
        ok: false,
        message: amount.error.issues[0]?.message ?? 'Check the amount',
      });
      continue;
    }
    const date = dateRaw ? isoDate.safeParse(dateRaw) : null;
    if (date && !date.success) {
      results.push({ index: i, ok: false, message: 'Use a valid date' });
      continue;
    }
    const day = date?.success ? date.data : '';

    let entityId: string;
    try {
      if (target === 'transaction') {
        if (!account) {
          results.push({ index: i, ok: false, message: 'Choose an account first.' });
          continue;
        }
        const income = get('direction') === 'income';
        entityId = await createTransaction(user.id, {
          requestId: draftRequestId(extractionId, i),
          type: income ? 'income' : 'expense',
          amount: amount.data,
          currencyCode: account.currency_code,
          transactionDate: day,
          sourceAccountId: income ? null : account.id,
          destinationAccountId: income ? account.id : null,
          direction: null,
          categoryId,
          merchantName: name,
          description,
          notes: '',
          refundOfTransactionId: null,
        });
      } else if (target === 'bill') {
        entityId = await createBill(user.id, {
          providerName: name,
          description,
          amount: amount.data,
          currencyCode: currencyFor(account, formData),
          dueDate: day,
          categoryId,
          notes: '',
        });
      } else if (target === 'receivable') {
        entityId = await createReceivable(user.id, {
          partyName: name,
          description,
          amount: amount.data,
          currencyCode: currencyFor(account, formData),
          dueDate: day,
          notes: '',
        });
      } else {
        entityId = await createExpectedIncome(user.id, {
          sourceName: name,
          description,
          amount: amount.data,
          currencyCode: currencyFor(account, formData),
          expectedDate: day,
          categoryId,
          notes: '',
        });
      }
    } catch (error) {
      if (error instanceof TransactionError) {
        results.push({ index: i, ok: false, message: error.message });
      } else {
        log.error('draft create failed', { target });
        results.push({
          index: i,
          ok: false,
          message: 'We could not create that record.',
        });
      }
      continue;
    }

    const { error } = await admin.rpc('confirm_extraction_draft', {
      p_user_id: user.id,
      p_extraction_id: extractionId,
      p_draft_index: i,
      p_entity_type: target,
      p_entity_id: entityId,
    });
    if (error) {
      results.push({
        index: i,
        ok: false,
        message: error.message.includes('DRAFT_ALREADY_SAVED')
          ? 'Already saved earlier.'
          : 'The record was created but could not be linked to the document. Check for a duplicate before retrying.',
      });
    } else {
      results.push({ index: i, ok: true, message: 'Saved' });
    }
  }

  revalidatePath(`/documents/${documentId}/review`);
  revalidatePath('/documents');
  for (const route of [
    '/transactions',
    '/accounts',
    '/dashboard',
    '/analytics',
    '/bills',
    '/receivables',
    '/expected-income',
    '/forecast',
  ])
    revalidatePath(route);

  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  if (ok === 0)
    return { error: 'Nothing was saved. See the notes on each record.', results };
  return {
    success:
      failed === 0
        ? `Saved ${ok} record${ok === 1 ? '' : 's'}.`
        : `Saved ${ok}. ${failed} need${failed === 1 ? 's' : ''} attention.`,
    results,
  };
}

/** Non-ledger records take the shared account's currency, else the user's default. */
function currencyFor(
  account: { currency_code: string } | null,
  formData: FormData,
): string {
  return account?.currency_code ?? (String(formData.get('currency') ?? '') || 'PHP');
}
