'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { log } from '@/lib/log';
import type { ActionState } from '@/app/actions/auth';
import {
  archiveDocument,
  uploadDocument,
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

export async function uploadDocumentAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const { user } = await requireUser();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a file to upload.' };
  }

  const declaredType = String(formData.get('documentType') ?? 'other');
  const documentType = (DOCUMENT_TYPES as readonly string[]).includes(declaredType)
    ? declaredType
    : 'other';

  try {
    // Read once into memory. The 8 MB cap makes this bounded, and the
    // container filesystem is ephemeral so a temp file would buy nothing.
    const bytes = new Uint8Array(await file.arrayBuffer());

    const result = await uploadDocument({
      userId: user.id,
      bytes,
      filename: file.name,
      declaredMimeType: file.type || null,
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
  const { user } = await requireUser();
  const id = String(formData.get('id') ?? '');
  const archived = String(formData.get('archived') ?? '') === 'true';
  if (!id) return;
  await archiveDocument(user.id, id, archived);
  revalidatePath('/documents');
}
