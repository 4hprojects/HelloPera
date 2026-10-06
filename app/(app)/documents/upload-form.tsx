'use client';

import { useEffect, useRef, useState } from 'react';
import {
  finalizeUploadAction,
  prepareUploadAction,
  type UploadState,
} from '@/app/actions/documents';
import { FormAlert } from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { BUCKET } from '@/lib/documents/bucket';
import { maxBytesFor } from '@/lib/documents/validation';
import { createClient } from '@/lib/supabase/client';

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
};

/**
 * Some browsers send an empty type for HEIC, and the bucket refuses anything
 * outside its allowed list. The server ignores this and reads the bytes.
 */
function contentTypeOf(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

type Phase = 'idle' | 'uploading' | 'processing';

const TYPES = [
  { value: 'receipt', label: 'Receipt' },
  { value: 'bill', label: 'Bill' },
  { value: 'payment_confirmation', label: 'Payment confirmation' },
  { value: 'screenshot', label: 'Screenshot' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'statement', label: 'Statement' },
  { value: 'bank_record', label: 'Bank record' },
  { value: 'ewallet_record', label: 'E-wallet record' },
  { value: 'salary_record', label: 'Salary record' },
  { value: 'other', label: 'Other' },
];

export function UploadForm({ initialType = 'receipt' }: { initialType?: string }) {
  const [state, setState] = useState<UploadState>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [clientError, setClientError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const pending = phase !== 'idle';

  useEffect(() => {
    if (state.documentId) formRef.current?.reset();
  }, [state.documentId]);

  /** Check the size before sending, so an oversized file fails with a reason. */
  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return setClientError(null);
    const isPdf = contentTypeOf(file) === 'application/pdf';
    const limit = maxBytesFor(isPdf);
    if (file.size > limit) {
      setClientError(
        `That ${isPdf ? 'PDF' : 'image'} is ${(file.size / 1024 / 1024).toFixed(1)} MB. ` +
          `The limit is ${limit / 1024 / 1024} MB.`,
      );
      event.target.value = '';
    } else {
      setClientError(null);
    }
  }

  /**
   * Three steps, because the file can be larger than HelloDeploy's 10 MB
   * request limit: ask for a one-time upload URL, send the file straight to
   * Storage, then have the server check and process what arrived.
   */
  async function upload(formData: FormData) {
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setState({ error: 'Choose a file to upload.' });
      return;
    }

    setClientError(null);
    setState({});
    setPhase('uploading');
    try {
      const prepared = await prepareUploadAction(file.size);
      if ('error' in prepared) return setState({ error: prepared.error });

      const contentType = contentTypeOf(file);
      const { error } = await createClient()
        .storage.from(BUCKET)
        .uploadToSignedUrl(prepared.path, prepared.token, file, { contentType });
      if (error) {
        return setState({ error: 'The upload did not finish. Please try again.' });
      }

      setPhase('processing');
      setState(
        await finalizeUploadAction({
          stagedPath: prepared.path,
          filename: file.name,
          declaredMimeType: contentType,
          documentType: String(formData.get('documentType') ?? 'other'),
        }),
      );
    } catch {
      setState({ error: 'Upload failed. Please check your connection and try again.' });
    } finally {
      setPhase('idle');
    }
  }

  return (
    <form ref={formRef} action={upload}>
      {clientError ? <FormAlert tone="error">{clientError}</FormAlert> : null}
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.success ? (
        <FormAlert tone="success">
          {state.duplicateOf
            ? 'Uploaded. This file was already in your documents, so both copies are kept.'
            : 'Uploaded and ready in your document library. Document reading is available only when enabled; uploading does not create a transaction.'}
        </FormAlert>
      ) : null}

      <div className="mb-3">
        <Label htmlFor="file">Choose a file</Label>
        <input
          id="file"
          name="file"
          type="file"
          required
          onChange={onFileChange}
          // capture prompts the camera on mobile; the gallery remains available.
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
          className="w-full rounded-[var(--radius-hp)] border border-border-strong bg-surface px-3 py-2.5 text-sm text-text file:mr-3 file:rounded file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:text-text"
        />
        <p className="hp-small mt-1 text-text-muted">
          JPEG, PNG, WebP, HEIC or PDF. Images up to 25 MB, PDFs up to 20 MB.
        </p>
      </div>

      <SelectField
        id="documentType"
        label="What is it?"
        defaultValue={initialType}
        wrapClassName="mb-4"
      >
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </SelectField>

      <Button type="submit" disabled={pending || Boolean(clientError)}>
        {phase === 'uploading'
          ? 'Uploading…'
          : phase === 'processing'
            ? 'Processing…'
            : 'Upload'}
      </Button>
    </form>
  );
}
