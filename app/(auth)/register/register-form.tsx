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

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="hp-small text-text-muted">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={action} noValidate>
        {/*
          Two boxes, stacked at 320px and side by side above `sm`. Forcing two
          text inputs into one row on a narrow phone leaves each about 120px
          wide, which is not enough to read what you typed.
        */}
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <FormField
            id="firstName"
            label="First name"
            autoComplete="given-name"
            error={state.fieldErrors?.firstName}
          />
          <FormField
            id="lastName"
            label="Last name"
            autoComplete="family-name"
            error={state.fieldErrors?.lastName}
          />
        </div>
        <p className="hp-small mb-4 -mt-2 text-text-muted">
          Optional — we only use it to say hello.
        </p>
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          error={state.fieldErrors?.email}
        />
        <PasswordField
          id="password"
          label="Password"
          autoComplete="new-password"
          required
          showStrength
          onChange={setPassword}
          error={state.fieldErrors?.password}
        />
        <PasswordField
          id="confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
          required
          matchAgainst={password}
          error={state.fieldErrors?.confirmPassword}
        />

        <p className="hp-small mb-4 text-text-muted">
          {/*
            Stated as the rule actually is. The schema requires length and
            nothing else, on purpose — so this does not imply a complexity
            requirement the server would not enforce.
          */}
          At least {MIN_LENGTH} characters. A short phrase works well.
        </p>

        <Button type="submit" disabled={pending} className="w-full" size="lg">
          {pending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="hp-small mt-4 text-text-muted">
        HelloPera never asks for bank credentials, e-wallet passwords, or government IDs.
      </p>
    </>
  );
}
