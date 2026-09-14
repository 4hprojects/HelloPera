'use server';

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
import { missingRequiredFields, type TargetType } from '@/lib/ocr/schema';

export async function runExtractionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
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
    if (error instanceof OcrError) return { error: error.message };
    log.error('extraction action failed', { document_id: documentId });
    return { error: 'We could not read that document.' };
  }

  revalidatePath(`/documents/${documentId}/review`);
  revalidatePath('/documents');
  return { success: 'Document read. Review the details below.' };
}

/**
 * Confirm an extraction into a real financial record.
 *
 * Two things happen, in this order and only this order:
 *   1. the record is created from the values the USER submitted, not the
 *      extracted ones — editing a field must actually change what is saved;
 *   2. confirm_extraction() flips the status and links the document, and
 *      refuses if the row is not pending_review.
 *
 * That second step is what makes a double-click safe (§83): the second call
 * finds the row already confirmed and stops.
 */
export async function confirmExtractionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireUser();

  const extractionId = String(formData.get('extractionId') ?? '');
  const documentId = String(formData.get('documentId') ?? '');
  const target = String(formData.get('target') ?? 'unknown') as TargetType;

  const fields = {
    amount: String(formData.get('amount') ?? ''),
    transactionDate: String(formData.get('transactionDate') ?? ''),
    dueDate: String(formData.get('dueDate') ?? ''),
    expectedDate: String(formData.get('expectedDate') ?? ''),
    merchantName: String(formData.get('merchantName') ?? ''),
    providerName: String(formData.get('providerName') ?? ''),
    partyName: String(formData.get('partyName') ?? ''),
  };

  if (target === 'unknown') {
    return { error: 'Choose what this document is before confirming.' };
  }

  const missing = missingRequiredFields(target, fields);
  if (missing.length > 0) {
    return { error: `Fill in: ${missing.join(', ')}` };
  }

  const currency = profile.default_currency;
  const accountId = String(formData.get('accountId') ?? '');
  let entityId: string;

  try {
    if (target === 'transaction') {
      if (!accountId) return { error: 'Choose which account this came from.' };
      entityId = await createTransaction(user.id, {
        type: 'expense',
        amount: fields.amount,
        currencyCode: currency,
        transactionDate: fields.transactionDate,
        sourceAccountId: accountId,
        destinationAccountId: null,
        direction: null,
        categoryId: String(formData.get('categoryId') ?? '') || null,
        merchantName: fields.merchantName,
        description: '',
        notes: '',
        refundOfTransactionId: null,
      });
    } else if (target === 'bill') {
      entityId = await createBill(user.id, {
        providerName: fields.providerName,
        description: '',
        amount: fields.amount,
        currencyCode: currency,
        dueDate: fields.dueDate,
        categoryId: null,
        notes: '',
      });
    } else if (target === 'receivable') {
      entityId = await createReceivable(user.id, {
        partyName: fields.partyName,
        description: '',
        amount: fields.amount,
        currencyCode: currency,
        dueDate: '',
        notes: '',
      });
    } else {
      entityId = await createExpectedIncome(user.id, {
        sourceName: fields.providerName,
        description: '',
        amount: fields.amount,
        currencyCode: currency,
        expectedDate: fields.expectedDate,
        categoryId: null,
        notes: '',
      });
    }
  } catch (error) {
    if (error instanceof TransactionError) return { error: error.message };
    log.error('confirm create failed', { target });
    return { error: 'We could not create that record.' };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc('confirm_extraction', {
    p_user_id: user.id,
    p_extraction_id: extractionId,
    p_entity_type: target,
    p_entity_id: entityId,
  });

  if (error) {
    if (error.message.includes('ALREADY_CONFIRMED')) {
      // The record above was created by this call, but the extraction was
      // already confirmed — say so rather than implying nothing happened.
      return {
        error: 'This document was already confirmed. Check for a duplicate record.',
      };
    }
    return { error: 'We created the record but could not link the document to it.' };
  }

  revalidatePath(`/documents/${documentId}/review`);
  revalidatePath('/documents');
  revalidatePath('/transactions');
  revalidatePath('/accounts');
  revalidatePath('/dashboard');
  revalidatePath('/analytics');
  return { success: 'Saved, and the document is attached to it.' };
}

export async function discardExtractionAction(formData: FormData): Promise<void> {
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
