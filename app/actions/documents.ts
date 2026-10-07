'use server';

import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/guards';
import { log } from '@/lib/log';
import type { ActionState } from '@/app/actions/auth';
import { MAX_UPLOAD_BYTES } from '@/lib/documents/validation';
import {
  archiveDocument,
  finalizeUpload,
  prepareUpload,
  UploadError,
} from '@/services/document.service';
import { formRejected, REJECTED_FORM } from '@/lib/validation/form';
import { ACTION_ARGS, FORMS } from '@/schemas/forms';

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
  if (!ACTION_ARGS.prepareUpload.safeParse(size).success) {
    return { error: 'Choose a file to upload.' };
  }
  if (size > MAX_UPLOAD_BYTES) {
    return {
      error: `The file limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Choose a smaller file.`,
    };
  }
  try {
    return await prepareUpload(user.id);
  } catch (error) {
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
  const parsed = ACTION_ARGS.finalizeUpload.safeParse(input);
  if (!parsed.success) return { error: REJECTED_FORM };
  input = parsed.data;

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

export async function archiveDocumentAction(formData: FormData): Promise<void> {
  if (formRejected(formData, FORMS.documents.archiveDocument, 'archiveDocumentAction'))
    return;
  const { user } = await requireUser();
  const id = String(formData.get('id') ?? '');
  const archived = String(formData.get('archived') ?? '') === 'true';
  if (!id) return;
  if (!(await archiveDocument(user.id, id, archived))) notFound();
  revalidatePath('/documents');
}
