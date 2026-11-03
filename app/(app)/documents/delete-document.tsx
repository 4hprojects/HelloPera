'use client';

import { useActionState } from 'react';
import { deleteDocumentAction, type DeleteDocumentState } from '@/app/actions/documents';
import { Button } from '@/components/ui/button';

const initial: DeleteDocumentState = {};

/**
 * Delete behind a native <details>, so the irreversible step takes a second,
 * deliberate click and the warning is read before it. Archive hides a
 * document; this removes its files and frees the space they take.
 */
export function DeleteDocument({
  documentId,
  label,
}: {
  documentId: string;
  label: string;
}) {
  const [state, action, pending] = useActionState(deleteDocumentAction, initial);
  return (
    <details className="hp-small">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-danger-text underline">
        {label}
      </summary>
      <form action={action} className="mt-2 flex max-w-72 flex-col gap-2">
        <input type="hidden" name="id" value={documentId} />
        <p className="text-text-muted">
          This removes the file for good and frees its space. Records you saved from it
          stay.
        </p>
        <Button type="submit" size="sm" variant="danger" disabled={pending}>
          {pending ? 'Deleting…' : 'Delete for good'}
        </Button>
        {state.error ? (
          <p role="alert" className="text-danger-text">
            {state.error}
          </p>
        ) : null}
      </form>
    </details>
  );
}
