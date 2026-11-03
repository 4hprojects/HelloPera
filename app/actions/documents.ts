'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { log } from '@/lib/log';
import type { ActionState } from '@/app/actions/auth';
import { MAX_UPLOAD_BYTES } from '@/lib/documents/validation';
import { enforceRateLimit, RateLimitError } from '@/services/rate-limit.service';
import { recordAuditEvent } from '@/lib/auth/audit';
import {
  deleteDocument,
  finalizeUpload,
  prepareUpload,
  UploadError,
} from '@/services/document.service';

const DOCUMENT_TYPES = [
  'receipt',
  'screenshot',
  'bill',
  'payment_confirmation',
  'bank_record',
  'ewallet_record',
  'invoice',
  'statement',
  'salary_record',
  'other',
] as const;

export type UploadState = ActionState & { documentId?: string; duplicateOf?: string };

/**
 * Step one of an upload: a one-time URL the browser sends the file to.
 *
 * Files go straight to Storage because HelloDeploy's proxy rejects request
 * bodies over 10 MB, and uploads may be up to 25 MB. The size is checked here
 * only to fail early with a clear message; the real check runs on the stored
 * bytes in `finalizeUploadAction`.
 */
export async function prepareUploadAction(
  size: number,
): Promise<{ path: string; token: string } | { error: string }> {
  const { user } = await requireUser();
  if (!Number.isFinite(size) || size <= 0) return { error: 'Choose a file to upload.' };
  if (size > MAX_UPLOAD_BYTES) {
    return {
      error: `The file limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Choose a smaller file.`,
    };
  }
  try {
    await enforceRateLimit('document_upload', `user:${user.id}`);
    return await prepareUpload(user.id, size);
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.userMessage };
    if (error instanceof UploadError) return { error: error.message };
    return { error: 'Upload failed. Please try again.' };
  }
}

/** Step two: check and ingest what the browser stored at `stagedPath`. */
export async function finalizeUploadAction(input: {
  stagedPath: string;
  filename: string;
  declaredMimeType: string;
  documentType: string;
}): Promise<UploadState> {
  const { user } = await requireUser();

  const documentType = (DOCUMENT_TYPES as readonly string[]).includes(input.documentType)
    ? input.documentType
    : 'other';

  try {
    const result = await finalizeUpload({
      userId: user.id,
      stagedPath: String(input.stagedPath),
      filename: String(input.filename ?? '') || null,
      declaredMimeType: String(input.declaredMimeType ?? '') || null,
      documentType,
    });

    revalidatePath('/documents');
    return {
      success: 'Uploaded.',
      documentId: result.id,
      duplicateOf: result.duplicateOf ?? undefined,
    };
  } catch (error) {
    if (error instanceof UploadError) return { error: error.message };
    log.error('upload action failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'Upload failed. Please try again.' };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DeleteDocumentState = { error?: string };

/** Delete a document for good, freeing its share of the storage quota. */
export async function deleteDocumentAction(
  _prev: DeleteDocumentState,
  formData: FormData,
): Promise<DeleteDocumentState> {
  const { user } = await requireUser();
  const id = String(formData.get('id') ?? '');
  if (!UUID.test(id)) return { error: 'That document is unavailable.' };

  let deleted: Awaited<ReturnType<typeof deleteDocument>>;
  try {
    deleted = await deleteDocument(user.id, id);
  } catch (error) {
    if (error instanceof UploadError) return { error: error.message };
    log.error('document delete failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not delete that document. Please try again.' };
  }
  if (!deleted) return { error: 'That document is unavailable.' };

  await recordAuditEvent({
    eventType: 'document_deleted',
    actorUserId: user.id,
    entityType: 'document',
    entityId: id,
    metadata: { document_type: deleted.documentType, bytes: deleted.bytes },
  });
  revalidatePath('/documents');
  return {};
}
