'use client';

import { useActionState } from 'react';
import { requestPasswordReset, type ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';

const initial: ActionState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  // The success message is identical whether or not the account exists —
  // otherwise this form becomes an account-enumeration oracle.
  if (state.success) return <FormAlert tone="success">{state.success}</FormAlert>;

  return (
    <form action={action} noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      <FormField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />
      <Button type="submit" disabled={pending} className="w-full" size="lg">
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
