'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { uploadDocumentAction, type UploadState } from '@/app/actions/documents';
import { FormAlert } from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { MAX_IMAGE_BYTES } from '@/lib/documents/validation';

const initial: UploadState = {};

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

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadDocumentAction, initial);
  const [clientError, setClientError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.documentId) formRef.current?.reset();
  }, [state.documentId]);

  /**
   * Check the size before sending. HelloDeploy's nginx rejects anything over
   * 10 MB with a bare 413 that never reaches the app, so without this the user
   * sees a generic network failure with no explanation.
   */
  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return setClientError(null);
    if (file.size > MAX_IMAGE_BYTES) {
      setClientError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB.`,
      );
      event.target.value = '';
    } else {
      setClientError(null);
    }
  }

  return (
    <form
      ref={formRef}
      action={(fd) => {
        setClientError(null);
        action(fd);
      }}
    >
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
          JPEG, PNG, WebP, HEIC or PDF. Up to 8 MB.
        </p>
      </div>

      <SelectField
        id="documentType"
        label="What is it?"
        defaultValue="receipt"
        wrapClassName="mb-4"
      >
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </SelectField>

      <Button type="submit" disabled={pending || Boolean(clientError)}>
        {pending ? 'Uploading…' : 'Upload'}
      </Button>
    </form>
  );
}
