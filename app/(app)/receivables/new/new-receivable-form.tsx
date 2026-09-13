'use client';

import { useActionState } from 'react';
import { createReceivableAction } from '@/app/actions/obligations';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';

const initial: ActionState = {};

export function NewReceivableForm({ defaultCurrency }: { defaultCurrency: string }) {
  const [state, action, pending] = useActionState(createReceivableAction, initial);
  return (
    <form action={action} noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      <FormField
        id="partyName"
        label="Who owes you?"
        required
        error={state.fieldErrors?.partyName}
      />
      <FormField
        id="amount"
        label="Amount"
        inputMode="decimal"
        required
        error={state.fieldErrors?.amount}
      />
      <FormField
        id="dueDate"
        label="Expected by (optional)"
        type="date"
        error={state.fieldErrors?.dueDate}
      />
      <FormField
        id="description"
        label="What for? (optional)"
        error={state.fieldErrors?.description}
      />
      <input type="hidden" name="currencyCode" value={defaultCurrency} />
      <p className="hp-small mb-4 text-text-muted">
        This is not income yet. It counts when the money actually arrives.
      </p>
      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? 'Saving…' : 'Add receivable'}
      </Button>
    </form>
  );
}
