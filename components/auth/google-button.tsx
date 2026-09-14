'use client';

import { useState, useTransition } from 'react';
import { loginWithGoogle } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';

/**
 * "Continue with Google" (§47).
 *
 * Wording and mark follow Google's branding requirements. The button must not
 * imply Google is part of HelloPera.
 *
 * ## Why the result is captured
 *
 * This previously called `startTransition(() => void loginWithGoogle())`,
 * discarding the returned `ActionState`. Because the success path calls
 * `redirect()` — which throws — that return value is **only ever an error**.
 * So the one case it could report was the one case it threw away: if
 * `signInWithOAuth` failed, the button simply snapped back to idle and the
 * user was told nothing at all.
 */
export function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function start(): void {
    setError(null);
    startTransition(async () => {
      // Resolves only on failure; a success redirects out of this component.
      const result = await loginWithGoogle();
      if (result?.error) setError(result.error);
    });
  }

  return (
    <>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <button
        type="button"
        disabled={pending}
        onClick={start}
        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-[var(--radius-hp)] border border-border-strong bg-surface font-medium text-text disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
          />
          <path
            fill="#FBBC05"
            d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
          />
        </svg>
        {pending ? 'Redirecting…' : label}
      </button>
    </>
  );
}
