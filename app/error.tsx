'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Global error boundary — Phase 00 §24.
 *
 * Never renders the raw error. `digest` is a server-generated identifier that
 * correlates with the server log, so support can find the cause without the
 * user ever seeing a stack trace.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'unhandled client error',
        digest: error.digest ?? null,
        timestamp: new Date().toISOString(),
      }),
    );
  }, [error]);

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 text-center"
    >
      <h1 className="hp-h1 text-text">Something went wrong</h1>
      <p className="hp-body mt-2 text-text-muted">
        We hit an unexpected problem. Nothing you were working on has been changed.
      </p>
      {error.digest ? (
        <p className="hp-small mt-3 text-text-muted">
          Reference: <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}
      <div className="mt-6 flex justify-center">
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
