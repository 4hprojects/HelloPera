'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';

/**
 * §68 — "Unable to generate forecast."
 *
 * The message never includes the underlying error: it may name a table or a
 * constraint, and an error string is not a place to leak schema.
 */
export default function ForecastError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('forecast render failed', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-10">
      <ErrorState
        title="Unable to generate your forecast."
        description="Your rules and records are safe — this is a problem projecting them, not storing them. Try again, or change the horizon."
        action={
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
