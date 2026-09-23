'use client';

import { useActionState, useState } from 'react';
import { registerWithEmail, type ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { GoogleButton } from '@/components/auth/google-button';
import { PasswordField } from '@/components/auth/password-field';
import { Button } from '@/components/ui/button';
import { MIN_LENGTH } from '@/lib/auth/password-strength';

const initial: ActionState = {};

export function RegisterForm({ cancelled = false }: { cancelled?: boolean }) {
  const [state, action, pending] = useActionState(registerWithEmail, initial);

  // Lifted so the confirm field can compare against it. Only the confirm field
  // warns — see PasswordField's `matchAgainst`.
  const [password, setPassword] = useState('');

  return (
    <>
      {cancelled ? (
        <FormAlert tone="error">Google sign-up was cancelled.</FormAlert>
      ) : null}
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <GoogleButton label="Continue with Google" />

      <div className="my-3 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="hp-small text-text-muted">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={action} noValidate>
        {/*
          Email leads because it is the one identifier the account cannot exist
          without — it is what you sign in with. Every field is required, so none
          is marked as such.

          The names share a row from `sm` up; the password fields do not, because
          "Confirm password" plus its Show toggle does not fit in half of a
          384px card. Gaps use `mb-1` because the reserved message slot under
          every field already supplies most of the space.
        */}
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          wrapClassName="mb-1"
          error={state.fieldErrors?.email}
        />

        <PasswordField
          id="password"
          label="Password"
          autoComplete="new-password"
          required
          showStrength
          onChange={setPassword}
          /*
            Stated as the rule actually is. The schema requires length and
            nothing else, on purpose — so this does not imply a complexity
            requirement the server would not enforce.
          */
          hint={`At least ${MIN_LENGTH} characters.`}
          wrapClassName="mb-1"
          error={state.fieldErrors?.password}
        />
        <PasswordField
          id="confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
          required
          matchAgainst={password}
          wrapClassName="mb-1"
          error={state.fieldErrors?.confirmPassword}
        />

        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <FormField
            id="firstName"
            label="First name"
            required
            autoComplete="given-name"
            wrapClassName="mb-1"
            error={state.fieldErrors?.firstName}
          />
          <FormField
            id="lastName"
            label="Last name"
            required
            autoComplete="family-name"
            wrapClassName="mb-1"
            error={state.fieldErrors?.lastName}
          />
        </div>

        <Button type="submit" disabled={pending} className="mt-2 w-full" size="lg">
          {pending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="hp-small mt-3 text-text-muted">
        HelloPera never asks for bank credentials, e-wallet passwords, or government IDs.
      </p>
    </>
  );
}
