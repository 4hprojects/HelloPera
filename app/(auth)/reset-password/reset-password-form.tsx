'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { resetPassword, type ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { PasswordField } from '@/components/auth/password-field';
import { Button } from '@/components/ui/button';

const initial: ActionState = {};

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPassword, initial);

  return (
    <form action={action} noValidate>
      {state.error ? (
        <>
          <FormAlert tone="error">{state.error}</FormAlert>
          <p className="hp-small mb-4 text-text-muted">
            <Link href="/forgot-password" className="font-medium text-primary-text">
              Request a new link
            </Link>
          </p>
        </>
      ) : null}
      <PasswordField
        id="password"
        label="New password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.password}
      />
      <PasswordField
        id="confirmPassword"
        label="Confirm new password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <Button type="submit" disabled={pending} className="w-full" size="lg">
        {pending ? 'Saving…' : 'Update password'}
      </Button>
    </form>
  );
}
