'use client';

import { useActionState } from 'react';
import { runExtractionAction } from '@/app/actions/extraction';
import type { ActionState } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';

const initial: ActionState = {};

/**
 * One click from the list: read the document, then land on its draft.
 * Uses one scan from the monthly allowance, which is why it is a button and
 * not something that happens on upload.
 */
export function ReadAndDraft({ documentId }: { documentId: string }) {
  const [state, action, pending] = useActionState(runExtractionAction, initial);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="redirectTo" value="review" />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Reading…' : 'Read & draft'}
      </Button>
      {state.error ? (
        <p role="alert" className="hp-small max-w-56 text-right text-danger-text">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
