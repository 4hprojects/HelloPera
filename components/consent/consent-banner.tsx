'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  COOKIE_MAX_AGE,
  COOKIE_NAME,
  grantAll,
  hasDecided,
  parseConsent,
  rejectAll,
  serialiseConsent,
  type ConsentState,
} from '@/lib/consent/categories';

/**
 * Consent banner — PHASE-10 §49, §50, §61.
 *
 * §61 prohibits UX patterns that trap or mislead, and consent banners are
 * where that is most often violated. So:
 *
 *  - It does not block the page. Content stays readable underneath; nothing
 *    is behind a modal.
 *  - Accept and decline are the same size and one click each. A decline
 *    hidden two menus deep is not a choice.
 *  - Declining is remembered, so the banner does not reappear on the next
 *    page — the behaviour that trains people to click Accept to make it stop.
 */
export function ConsentBanner() {
  const [state, setState] = useState<ConsentState | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Read on the client only: the value differs per visitor, so reading it on
    // the server would either leak into a cached page or force the whole
    // public site dynamic.
    //
    // Resolved through a promise so no setState runs synchronously in the
    // effect body, which cascades renders.
    async function read(): Promise<ConsentState> {
      const raw = document.cookie
        .split('; ')
        .find((c) => c.startsWith(`${COOKIE_NAME}=`))
        ?.split('=')[1];
      return parseConsent(raw ? decodeURIComponent(raw) : null);
    }

    void read().then((next) => {
      if (!cancelled) setState(next);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function decide(next: ConsentState): void {
    document.cookie = [
      `${COOKIE_NAME}=${encodeURIComponent(serialiseConsent(next))}`,
      'path=/',
      `max-age=${COOKIE_MAX_AGE}`,
      'SameSite=Lax',
      // Secure everywhere except local development, which has no https.
      location.protocol === 'https:' ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; ');
    setState(next);
  }

  // Not yet read, or already answered.
  if (!state || hasDecided(state)) return null;

  return (
    <div
      role="region"
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface p-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="hp-small text-text-muted">
          We use cookies that are needed to sign you in. With your permission we would
          also measure which pages are useful.{' '}
          <Link href="/privacy" className="text-primary-text underline">
            How we handle your data
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          {/* Equal weight, one click each. */}
          <Button variant="ghost" size="sm" onClick={() => decide(rejectAll())}>
            Only what is needed
          </Button>
          <Button variant="primary" size="sm" onClick={() => decide(grantAll())}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
