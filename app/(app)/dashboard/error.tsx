'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';

/**
 * §43 — a dashboard-specific failure, with a retry.
 *
 * Nested boundary, so it renders inside the app shell rather than replacing
 * the document: the navigation rail stays usable while this section is down.
 * The message never includes the underlying error — it may name a table or a
 * constraint, and this page is behind auth but the text is not.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('dashboard render failed', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-10">
      <ErrorState
        title="We couldn't load your financial summary."
        description="Your data is safe — this is a problem reading it, not storing it. Try again in a moment."
        action={
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
