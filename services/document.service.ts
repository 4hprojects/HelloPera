import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildObjectPath,
  extensionFor,
  sanitiseFilename,
  validateUpload,
} from '@/lib/documents/validation';
import {
  estimatePdfPageCount,
  hashContent,
  ImageProcessingError,
  normaliseForOcr,
  processImage,
} from '@/services/image-processing.service';
import {
  createStagedUpload,
  downloadObject,
  isOwnStagedPath,
  listStaleStagedObjects,
  moveObject,
  removeDocumentObjects,
  uploadObject,
} from '@/services/storage.service';
import { log } from '@/lib/log';
import { withServiceTiming } from '@/lib/performance/service-timing';

export type DocumentRow = {
  id: string;
  document_type: string;
  original_filename: string | null;
  original_mime_type: string | null;
  original_size_bytes: number | null;
  display_size_bytes: number | null;
  thumbnail_size_bytes: number | null;
  width: number | null;
  height: number | null;
  page_count: number | null;
  processing_status: 'uploaded' | 'processing' | 'ready' | 'failed';
  retention_status: string;
  processing_error: string | null;
  content_hash: string | null;
  is_archived: boolean;
  created_at: string;
};

export class UploadError extends Error {}

export async function listDocuments(options: { includeArchived?: boolean } = {}) {
  return withServiceTiming(
    'documents.list',
    async () => {
      const supabase = await createClient();
      let query = supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });
      if (!options.includeArchived) query = query.eq('is_archived', false);

      const { data, error } = await query.returns<DocumentRow[]>();
      if (error) throw new Error(`Could not load documents: ${error.code}`);
      return data ?? [];
    },
    {
      fields: { include_archived: options.includeArchived ?? false },
      resultFields: (documents) => ({ row_count: documents.length }),
    },
  );
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .maybeSingle<DocumentRow>();
  if (error || !data) return null;
  return data;
}

/**
 * Ingest an uploaded file.
 *
 * Order matters. The metadata row is created FIRST so that a crash during
 * processing leaves a visible `failed` document the user can retry, rather
 * than storage objects with nothing pointing at them (§71).
 */
export async function uploadDocument(params: {
  userId: string;
  bytes: Uint8Array;
  filename: string | null;
  declaredMimeType: string | null;
  documentType: string;
  /** Already in Storage from a direct upload: moved into place, not re-sent. */
  stagedPath?: string;
}): Promise<{ id: string; duplicateOf: string | null }> {
  const { userId, bytes, filename, declaredMimeType, documentType, stagedPath } = params;

  const validation = validateUpload({
    bytes,
    size: bytes.byteLength,
    declaredMimeType,
    filename,
  });
  if (!validation.ok) throw new UploadError(validation.message);

  const admin = createAdminClient();
  const hash = hashContent(bytes);
  const safeName = sanitiseFilename(filename);

  // Same bytes already uploaded? Surface it rather than storing twice.
  // Never merges automatically — Phase 05 §51 owns that decision.
  const { data: existing } = await admin
    .from('documents')
    .select('id')
    .eq('user_id', userId)
    .eq('content_hash', hash)
    .eq('is_archived', false)
    .limit(1)
    .maybeSingle<{ id: string }>();

  const { data: created, error: insertError } = await admin
    .from('documents')
    .insert({
      user_id: userId,
      document_type: documentType,
      original_filename: safeName,
      original_mime_type: validation.type,
      original_size_bytes: bytes.byteLength,
      content_hash: hash,
      processing_status: 'processing',
      retention_status: 'original_retained',
    })
    .select('id')
    .single<{ id: string }>();

  if (insertError || !created) {
    throw new UploadError('We could not start the upload. Please try again.');
  }

  const documentId = created.id;
  const at = new Date();
  const originalPath = buildObjectPath({
    userId,
    documentId,
    filename: `original.${extensionFor(validation.type)}`,
    at,
  });
  const uploaded: Array<string | null> = [];

  try {
    // The full-quality source is retained for Phase 05 OCR and its retries.
    if (stagedPath) await moveObject(stagedPath, originalPath);
    else await uploadObject({ path: originalPath, body: bytes, contentType: validation.type });
    uploaded.push(originalPath);

    if (validation.isPdf) {
      const { error: readyError } = await admin
        .from('documents')
        .update({
          original_path: originalPath,
          page_count: estimatePdfPageCount(bytes),
          processing_status: 'ready',
          // No rendering: the container has no poppler or pdfium, so a PDF has
          // no display or thumbnail rendition. The UI shows a generic preview.
          retention_status: 'original_retained',
        })
        .eq('id', documentId);

      if (readyError) throw new Error('Document metadata could not be saved.');
      return { id: documentId, duplicateOf: existing?.id ?? null };
    }

    const processed = await processImage(bytes);

    const displayPath = buildObjectPath({
      userId,
      documentId,
      filename: 'display.webp',
      at,
    });
    const thumbPath = buildObjectPath({ userId, documentId, filename: 'thumb.webp', at });

    await uploadObject({
      path: displayPath,
      body: processed.display,
      contentType: 'image/webp',
    });
    uploaded.push(displayPath);
    await uploadObject({
      path: thumbPath,
      body: processed.thumbnail,
      contentType: 'image/webp',
    });
    uploaded.push(thumbPath);

    const { error: readyError } = await admin
      .from('documents')
      .update({
        original_path: originalPath,
        display_path: displayPath,
        thumbnail_path: thumbPath,
        display_mime_type: 'image/webp',
        display_size_bytes: processed.displaySize,
        thumbnail_size_bytes: processed.thumbnailSize,
        width: processed.width,
        height: processed.height,
        processing_status: 'ready',
      })
      .eq('id', documentId);

    if (readyError) throw new Error('Document metadata could not be saved.');
    return { id: documentId, duplicateOf: existing?.id ?? null };
  } catch (error) {
    const message =
      error instanceof ImageProcessingError
        ? error.message
        : 'We could not process that file.';

    // Keep the row, mark it failed, allow retry (§31). Remove the partial
    // objects so storage does not accumulate orphans.
    const { error: failureError } = await admin
      .from('documents')
      .update({ processing_status: 'failed', processing_error: message })
      .eq('id', documentId);
    if (failureError)
      log.error('document: failed state could not be saved', { code: failureError.code });
    await removeDocumentObjects(uploaded);

    log.error('document processing failed', { document_id: documentId });
    throw new UploadError(message);
  }
}

/** Step one of a direct upload: where the browser should send the file. */
export async function prepareUpload(
  userId: string,
): Promise<{ path: string; token: string }> {
  try {
    return await createStagedUpload(userId);
  } catch {
    throw new UploadError('We could not start the upload. Please try again.');
  }
}

/**
 * Step two: check what the browser actually stored, then ingest it.
 *
 * Nothing about the staged file is trusted — not its size, not its type. It
 * is read back and goes through the same `validateUpload` as any other bytes.
 * Whatever happens, the staged object does not outlive this call: it is
 * either moved into place or removed.
 */
export async function finalizeUpload(params: {
  userId: string;
  stagedPath: string;
  filename: string | null;
  declaredMimeType: string | null;
  documentType: string;
}): Promise<{ id: string; duplicateOf: string | null }> {
  // The token only allowed writing to a path we generated, but the path
  // itself comes back from the browser — so it must be one of this user's.
  if (!isOwnStagedPath(params.userId, params.stagedPath)) {
    throw new UploadError('That upload is unavailable. Please try again.');
  }

  let bytes: Uint8Array;
  try {
    bytes = await downloadObject(params.stagedPath);
  } catch {
    throw new UploadError('We could not find the uploaded file. Please try again.');
  }

  try {
    return await uploadDocument({ ...params, bytes });
  } catch (error) {
    // A no-op if the move already happened; otherwise it drops the rejected file.
    await removeDocumentObjects([params.stagedPath]);
    throw error;
  }
}

export type ShrinkOutcome = 'shrunk' | 'not_worth_it' | 'failed';

/** Below this, a JPEG copy is not worth losing a crisp PNG screenshot for. */
const SHRINK_MIN_SAVING = 0.25;

/**
 * Replace a document's original with its OCR-grade JPEG.
 *
 * Order matters, as in `uploadDocument`: the new object is written, then the
 * row points at it, then the old object goes. A failure at any step leaves
 * the row pointing at a file that exists.
 *
 * The update is conditional on `original_retained` so two shrinks racing
 * (a read and the sweep) can't both win. `original_size_bytes` keeps the
 * uploaded size: the "space saved" figure on the documents page is measured
 * against it.
 *
 * Never throws. Shrinking saves storage; it must not fail a read.
 */
export async function shrinkOriginal(params: {
  documentId: string;
  originalPath: string;
  originalByteLength: number;
  jpeg: Uint8Array;
}): Promise<ShrinkOutcome> {
  const { documentId, originalPath, originalByteLength, jpeg } = params;
  if (jpeg.byteLength > originalByteLength * (1 - SHRINK_MIN_SAVING)) return 'not_worth_it';

  const newPath = `${originalPath.slice(0, originalPath.lastIndexOf('/'))}/ocr.jpg`;
  if (newPath === originalPath) return 'not_worth_it';

  try {
    await uploadObject({ path: newPath, body: jpeg, contentType: 'image/jpeg' });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('documents')
      .update({
        original_path: newPath,
        original_mime_type: 'image/jpeg',
        retention_status: 'optimized_only',
      })
      .eq('id', documentId)
      .eq('retention_status', 'original_retained')
      .select('id');

    if (error || !data?.length) {
      await removeDocumentObjects([newPath]);
      return 'failed';
    }

    await removeDocumentObjects([originalPath]);
    log.info('document original shrunk', {
      document_id: documentId,
      before_bytes: originalByteLength,
      after_bytes: jpeg.byteLength,
    });
    return 'shrunk';
  } catch (error) {
    log.warn('document shrink failed', {
      document_id: documentId,
      m: error instanceof Error ? error.message : 'unknown',
    });
    return 'failed';
  }
}

const UNREAD_SHRINK_AFTER_DAYS = 7;
const STAGED_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const SWEEP_BATCH = 20;

/**
 * Scheduled storage housekeeping, run from `/api/scheduler`.
 *
 *   - Images still kept at full size a week after upload — never read, or
 *     only failed reads — are shrunk the same way a successful read does.
 *   - Direct uploads the browser started but never finalised are removed.
 *
 * In Node rather than pg_cron because shrinking needs Sharp. Bounded per run
 * so one call can't hold the scheduler request open; the next run continues.
 * HEIC is skipped: the bundled libvips cannot decode it. PDFs are skipped:
 * the container cannot render them.
 */
export async function sweepDocumentStorage(): Promise<{
  shrunk: number;
  staleUploadsRemoved: number;
}> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - UNREAD_SHRINK_AFTER_DAYS * 86_400_000);

  const { data: rows, error } = await admin
    .from('documents')
    .select('id, original_path')
    .eq('retention_status', 'original_retained')
    .eq('processing_status', 'ready')
    .in('original_mime_type', ['image/jpeg', 'image/png', 'image/webp'])
    .not('original_path', 'is', null)
    .lt('created_at', cutoff.toISOString())
    .order('created_at', { ascending: true })
    .limit(SWEEP_BATCH)
    .returns<Array<{ id: string; original_path: string }>>();
  if (error) throw new Error(`Could not load documents to shrink: ${error.code}`);

  let shrunk = 0;
  for (const row of rows ?? []) {
    try {
      const bytes = await downloadObject(row.original_path);
      const jpeg = await normaliseForOcr(bytes);
      const outcome = await shrinkOriginal({
        documentId: row.id,
        originalPath: row.original_path,
        originalByteLength: bytes.byteLength,
        jpeg,
      });
      if (outcome === 'shrunk') shrunk += 1;
      // Already small: mark it so the sweep stops picking it up. The stored
      // file is unchanged, and it is no larger than the reader's copy.
      else if (outcome === 'not_worth_it')
        await admin
          .from('documents')
          .update({ retention_status: 'optimized_only' })
          .eq('id', row.id)
          .eq('retention_status', 'original_retained')
          .eq('original_path', row.original_path);
    } catch {
      log.warn('document sweep: could not shrink', { document_id: row.id });
    }
  }

  const stale = await listStaleStagedObjects(STAGED_STALE_AFTER_MS);
  await removeDocumentObjects(stale);

  return { shrunk, staleUploadsRemoved: stale.length };
}

export async function archiveDocument(userId: string, id: string, archived: boolean) {
  const admin = createAdminClient();
  const { error } = await admin
    .from('documents')
    .update({ is_archived: archived })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}
