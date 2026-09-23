'use client';

import { useActionState } from 'react';
import { deleteAccountAction, startGoogleDeletionAction } from '@/app/actions/account';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';

const initial: ActionState = {};

/**
 * §70 — "No one-click accidental deletion."
 *
 * Two independent steps, both required: the password (proving it is really
 * this person, right now) and a typed word (proving they meant this button and
 * not the one above it). Either alone is too easy to do by accident or by
 * someone passing an unlocked laptop.
 */
export function DeleteAccountForm({ google = false }: { google?: boolean }) {
  const [state, action, pending] = useActionState(deleteAccountAction, initial);

  return (
    <div>
      {google && (
        <form action={startGoogleDeletionAction} className="mb-4">
          <p className="hp-small mb-3">
            First verify with Google, then type DELETE below. Verification expires after
            10 minutes.
          </p>
          <Button type="submit" variant="secondary">
            Verify with Google
          </Button>
        </form>
      )}
      <form action={action} noValidate>
        {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

        {!google && (
          <FormField
            id="password"
            label="Your password"
            type="password"
            autoComplete="current-password"
            required
            error={state.fieldErrors?.password}
          />
        )}

        <FormField
          id="confirmation"
          label="Type DELETE to confirm"
          autoComplete="off"
          placeholder="DELETE"
          required
          error={state.fieldErrors?.confirmation}
        />

        <Button
          type="submit"
          variant="danger"
          size="lg"
          disabled={pending}
          className="w-full"
        >
          {pending ? 'Deleting…' : 'Delete my account permanently'}
        </Button>
      </form>
    </div>
  );
}
