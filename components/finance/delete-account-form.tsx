'use client';

import { useActionState } from 'react';
import { deleteAccountAction } from '@/app/actions/finance';
import { FormAlert } from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';

export function DeleteAccountForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(deleteAccountAction, {});
  return (
    <details className="mt-1">
      <summary className="min-h-11 cursor-pointer py-3 text-danger-text">
        Delete account
      </summary>
      <p className="hp-small mb-3">
        Permanently deletes <strong>{name}</strong> and its opening balance. Only possible
        while the account has no transactions. If it does, archive it instead to keep your
        history.
      </p>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
        {state.success ? <FormAlert tone="success">{state.success}</FormAlert> : null}
        <Button
          type="submit"
          variant="danger"
          disabled={pending || Boolean(state.success)}
        >
          {pending ? 'Deleting…' : 'Confirm delete'}
        </Button>
      </form>
    </details>
  );
}
