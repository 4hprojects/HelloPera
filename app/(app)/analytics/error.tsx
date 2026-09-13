'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';

/**
 * §43 — an analytics-specific failure, with a retry.
 *
 * The message never includes the underlying error: it may name a table or a
 * constraint, and an error string is not a place to leak schema.
 */
export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('analytics render failed', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-10">
      <ErrorState
        title="Unable to load spending analytics."
        description="Your data is safe — this is a problem reading it, not storing it. Try again, or reset the filters."
        action={
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
