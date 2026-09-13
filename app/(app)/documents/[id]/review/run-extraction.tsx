'use client';

import { useActionState } from 'react';
import { runExtractionAction } from '@/app/actions/extraction';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';

const initial: ActionState = {};

export function RunExtraction({
  documentId,
  label = 'Read this document',
}: {
  documentId: string;
  label?: string;
}) {
  const [state, action, pending] = useActionState(runExtractionAction, initial);

  return (
    <form action={action}>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      <input type="hidden" name="documentId" value={documentId} />
      <Button type="submit" disabled={pending}>
        {pending ? 'Reading…' : label}
      </Button>
      <p className="hp-small mt-2 text-text-muted">
        The document is sent to an AI provider to be read. It is never used to change your
        balances without your confirmation.
      </p>
    </form>
  );
}
