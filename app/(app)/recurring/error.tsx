'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';

/** §68 — "Unable to create recurring rule." The underlying error never shows. */
export default function RecurringError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('recurring render failed', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-10">
      <ErrorState
        title="Unable to load your recurring rules."
        description="Your rules are safe — this is a problem reading them, not storing them."
        action={
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
