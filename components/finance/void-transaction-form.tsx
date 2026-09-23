'use client';
import { useActionState } from 'react';
import { voidTransactionAction } from '@/app/actions/finance';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { FormAlert } from '@/components/auth/form-alert';

export function VoidTransactionForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(voidTransactionAction, {});
  return (
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer py-3 text-danger-text">
        Correct this transaction
      </summary>
      <p className="hp-small mb-3">
        Void this entry, then add a corrected transaction. The original stays in history.
        Its payments are released and linked recurring occurrences reopen.
      </p>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
        {state.success && <FormAlert tone="success">{state.success}</FormAlert>}
        <TextField
          id={`reason-${id}`}
          name="reason"
          label="Reason for correction"
          maxLength={200}
          error={state.fieldErrors?.reason}
        />
        <Button
          type="submit"
          variant="danger"
          disabled={pending || Boolean(state.success)}
        >
          {pending ? 'Voiding…' : 'Confirm void'}
        </Button>
      </form>
    </details>
  );
}
