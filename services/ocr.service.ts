import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET } from '@/services/storage.service';
import { ClaudeExtractionProvider } from '@/lib/ocr/claude-provider';
import { ProviderError, type ExtractionProvider } from '@/lib/ocr/provider';
import { assertWithinLimit, recordUsage } from '@/services/usage.service';
import { enforceRateLimit } from '@/services/rate-limit.service';
import { findCandidates, type ExistingRecord } from '@/lib/ocr/duplicate';
import { log } from '@/lib/log';
import { isFlagEnabled } from '@/services/plan.service';

/**
 * OCR pipeline — Phase 05 §46.
 *
 *   Document ready -> job -> provider -> ocr_result -> extraction_result
 *                                                      (pending_review)
 *
 * Nothing here writes a balance. The only path to a financial record is
 * confirm_extraction(), which a human triggers.
 */

let provider: ExtractionProvider | null = null;

/** Swappable per §8: the provider identifier is stored on every row. */
export function getProvider(): ExtractionProvider {
  if (!provider) provider = new ClaudeExtractionProvider();
  return provider;
}

export function setProviderForTesting(p: ExtractionProvider | null): void {
  provider = p;
}

export class OcrError extends Error {}

export async function listPendingExtractions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('extraction_results')
    .select(
      'id, document_id, document_type, target_type, status, structured_data, created_at',
    )
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load extractions: ${error.code}`);
  return data ?? [];
}

export async function getExtractionForDocument(documentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('extraction_results')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/**
 * Run extraction for a document.
 *
 * Reads the retained full-quality source, not the display WebP: the display
 * rendition is compressed for viewing at 1800px/q85, and small print is the
 * first thing that loses (§62, Phase 04 §26).
 */
export async function runExtraction(params: {
  userId: string;
  documentId: string;
  defaultCurrency: string;
  timezone: string;
}): Promise<{ extractionId: string }> {
  if (!(await isFlagEnabled('ocr_enabled'))) {
    throw new OcrError('Document reading is not available yet.');
  }

  const admin = createAdminClient();

  const { data: doc } = await admin
    .from('documents')
    .select(
      'id, user_id, original_path, original_mime_type, retention_status, content_hash',
    )
    .eq('id', params.documentId)
    .maybeSingle<{
      id: string;
      user_id: string;
      original_path: string | null;
      original_mime_type: string | null;
      retention_status: string;
      content_hash: string | null;
    }>();

  if (!doc || doc.user_id !== params.userId)
    throw new OcrError('That document is unavailable.');

  // PHASE-09 §17 — the quota gate sits BEFORE the provider is called, so a
  // rejected request costs nothing and counts nothing. It also sits before the
  // ocr_jobs insert, so a refused request leaves no job row implying an
  // attempt that never happened.
  //
  // Throws UsageLimitError, which the caller turns into §33's copy: the number
  // used, the reset date, and a way to continue manually.
  // PHASE-14 §38, §39 — the technical limit sits before the quota gate,
  // because refusing a burst should not consume one of the user's scans. The
  // two are different things: this bounds the rate, the quota bounds the bill.
  await enforceRateLimit('ocr_submit', params.userId);

  await assertWithinLimit(params.userId, 'ocr_jobs', params.timezone);

  // Retry after the source has been deleted would run against a degraded
  // image and quietly produce worse results (§43). Refuse instead.
  if (!doc.original_path || doc.retention_status === 'original_deleted') {
    throw new OcrError(
      'The original file for this document is no longer stored, so it cannot be read again.',
    );
  }

  const activeProvider = getProvider();

  // One active job per document is enforced by a unique index; this is the
  // friendly path to the same rule.
  const { data: job, error: jobError } = await admin
    .from('ocr_jobs')
    .insert({
      user_id: params.userId,
      document_id: params.documentId,
      provider: activeProvider.name,
      status: 'processing',
      started_at: new Date().toISOString(),
      attempt_count: 1,
    })
    .select('id')
    .single<{ id: string }>();

  if (jobError || !job) {
    throw new OcrError('This document is already being read.');
  }

  try {
    const { data: file, error: downloadError } = await admin.storage
      .from(BUCKET)
      .download(doc.original_path);
    if (downloadError || !file) throw new OcrError('We could not open that document.');

    const bytes = new Uint8Array(await file.arrayBuffer());

    // §17 — counted here, once the provider call is committed to. Placed
    // AFTER the download so a storage failure (HelloPera's fault) does not
    // count, and BEFORE extract() so a provider error still does: it cost
    // money either way, and the user gets a clear failure rather than a
    // silent charge.
    //
    // This is deliberately not the same number as ocr_jobs.attempt_count,
    // which tracks what was sent to the provider. The gap between them is the
    // measure of HelloPera's own reliability.
    await recordUsage(params.userId, 'ocr_jobs', params.timezone);

    const result = await activeProvider.extract({
      bytes,
      mimeType: doc.original_mime_type ?? 'application/octet-stream',
      defaultCurrency: params.defaultCurrency,
      timezone: params.timezone,
    });

    const { data: ocrRow } = await admin
      .from('ocr_results')
      .insert({
        user_id: params.userId,
        document_id: params.documentId,
        ocr_job_id: job.id,
        provider: result.provider,
        raw_text: result.rawText ?? null,
        provider_metadata: result.metadata ?? {},
      })
      .select('id')
      .single<{ id: string }>();

    const { data: extraction, error: extractionError } = await admin
      .from('extraction_results')
      .insert({
        user_id: params.userId,
        document_id: params.documentId,
        ocr_result_id: ocrRow?.id ?? null,
        document_type: result.fields.documentType,
        target_type: result.fields.suggestedTarget,
        status: 'pending_review',
        structured_data: result.fields,
        field_confidence: result.confidence,
      })
      .select('id')
      .single<{ id: string }>();

    if (extractionError || !extraction)
      throw new OcrError('We could not save the results.');

    await admin
      .from('ocr_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        duration_ms: result.durationMs,
      })
      .eq('id', job.id);

    // Structured logging only — never the extracted text or account numbers (§58).
    log.info('extraction completed', {
      document_id: params.documentId,
      provider: result.provider,
      duration_ms: result.durationMs,
    });

    return { extractionId: extraction.id };
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : 'INTERNAL';
    const safe =
      error instanceof ProviderError || error instanceof OcrError
        ? error.message
        : 'We could not read this document.';

    await admin
      .from('ocr_jobs')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        error_code: code,
        error_message_safe: safe,
      })
      .eq('id', job.id);

    log.error('extraction failed', { document_id: params.documentId, error_code: code });
    throw new OcrError(safe);
  }
}

/**
 * Look for records this extraction might duplicate.
 *
 * Compares against recent transactions only — a receipt is almost never for
 * something recorded months ago, and a wider window produces noise the user
 * learns to dismiss.
 */
export async function findDuplicateCandidates(params: {
  userId: string;
  amount: string | null;
  currency: string | null;
  date: string | null;
  merchant: string | null;
  reference: string | null;
  documentHash: string | null;
}) {
  const admin = createAdminClient();

  const since = new Date();
  since.setDate(since.getDate() - 45);

  const { data } = await admin
    .from('transactions')
    .select('id, amount, currency_code, transaction_date, merchant_name, description')
    .eq('user_id', params.userId)
    .eq('status', 'confirmed')
    .gte('transaction_date', since.toISOString().slice(0, 10))
    .returns<
      Array<{
        id: string;
        amount: string;
        currency_code: string;
        transaction_date: string;
        merchant_name: string | null;
        description: string | null;
      }>
    >();

  const existing: ExistingRecord[] = (data ?? []).map((t) => ({
    id: t.id,
    amount: t.amount,
    currency: t.currency_code,
    date: t.transaction_date,
    merchant: t.merchant_name ?? t.description,
    reference: null,
    documentHash: null,
  }));

  return findCandidates(params, existing);
}
