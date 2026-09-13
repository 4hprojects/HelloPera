'use client';

import { useActionState } from 'react';
import { generateOccurrencesAction } from '@/app/actions/recurring';
import type { ActionState } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';

const initial: ActionState = {};

/**
 * §19 — a hand-operated generation run.
 *
 * pg_cron runs hourly and the forecast page generates on load, so this is
 * rarely needed. It exists because §2's fallbacks may leave a deployment with
 * no scheduler at all, and because "nothing appeared" should have an answer
 * the user can act on rather than a wait of unknown length.
 */
export function GenerateButton() {
  const [state, action, pending] = useActionState(generateOccurrencesAction, initial);

  return (
    <form action={action}>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? 'Checking…' : 'Check for new'}
      </Button>
      {state.success ? (
        <p role="status" className="hp-small mt-1 text-text-muted">
          {state.success}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="hp-small mt-1 text-danger-text">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
