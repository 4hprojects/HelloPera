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
  processImage,
} from '@/services/image-processing.service';
import { removeDocumentObjects, uploadObject } from '@/services/storage.service';
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
}): Promise<{ id: string; duplicateOf: string | null }> {
  const { userId, bytes, filename, declaredMimeType, documentType } = params;

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
    await uploadObject({ path: originalPath, body: bytes, contentType: validation.type });
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

export async function archiveDocument(userId: string, id: string, archived: boolean) {
  const admin = createAdminClient();
  const { error } = await admin
    .from('documents')
    .update({ is_archived: archived })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}
