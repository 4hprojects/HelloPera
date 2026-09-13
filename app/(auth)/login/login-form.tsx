'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { loginWithEmail, type ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { GoogleButton } from '@/components/auth/google-button';
import { PasswordField } from '@/components/auth/password-field';
import { Button } from '@/components/ui/button';

const initial: ActionState = {};

export function LoginForm({ cancelled }: { cancelled: boolean }) {
  const [state, action, pending] = useActionState(loginWithEmail, initial);

  return (
    <>
      {cancelled ? (
        <FormAlert tone="error">Google sign-in was cancelled.</FormAlert>
      ) : null}
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <GoogleButton label="Continue with Google" />

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="hp-small text-text-muted">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={action} noValidate>
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
          autoComplete="current-password"
          required
          error={state.fieldErrors?.password}
        />
        <div className="mb-5 text-right">
          <Link
            href="/forgot-password"
            className="hp-small font-medium text-primary-text"
          >
            Forgot password?
          </Link>
        </div>
        {/* Disabled while pending so a double submit cannot fire twice. */}
        <Button type="submit" disabled={pending} className="w-full" size="lg">
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </>
  );
}
