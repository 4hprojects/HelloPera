'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { CAPTCHA_FIELD } from '@/lib/auth/captcha';

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      'response-field-name': string;
      theme: 'auto';
      size: 'flexible';
      callback: () => void;
      'expired-callback': () => void;
      'error-callback': () => boolean;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Cloudflare Turnstile, rendered inside an auth form.
 *
 * The widget writes its token into a hidden input named `CAPTCHA_FIELD`, so
 * the token travels with the form to the server action and is never held in
 * React state or any storage.
 *
 * Rendered explicitly rather than by the script's auto-scan: auto-scan runs
 * once at script load, so a client-side move from /login to /register would
 * leave the second form with no widget.
 *
 * `resetSignal` should change after every submission. Supabase consumes a
 * token whether or not sign-in succeeds, so a failed attempt must get a fresh
 * one before the next.
 *
 * Renders nothing without a site key, so a deployment without Turnstile
 * keeps working forms rather than a broken widget.
 */
export function Turnstile({
  siteKey,
  resetSignal,
}: {
  siteKey: string | undefined;
  resetSignal?: unknown;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const lastSignal = useRef(resetSignal);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const api = window.turnstile;
    if (!siteKey || !ready || !api || !container.current) return;
    const id = api.render(container.current, {
      sitekey: siteKey,
      'response-field-name': CAPTCHA_FIELD,
      theme: 'auto',
      size: 'flexible',
      callback: () => setFailed(false),
      'expired-callback': () => api.reset(id),
      // Returning true tells Turnstile the error was handled, so it does not
      // also throw to the console.
      'error-callback': () => {
        setFailed(true);
        return true;
      },
    });
    widget.current = id;
    return () => {
      api.remove(id);
      widget.current = null;
    };
  }, [siteKey, ready]);

  useEffect(() => {
    if (lastSignal.current === resetSignal) return;
    lastSignal.current = resetSignal;
    if (widget.current) window.turnstile?.reset(widget.current);
  }, [resetSignal]);

  if (!siteKey) return null;

  return (
    <div className="mb-5">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        onError={() => setFailed(true)}
      />
      <div ref={container} />
      {failed ? (
        <p className="hp-small mt-2 text-danger-text" role="alert">
          The security check could not load. Refresh the page and try again.
        </p>
      ) : null}
    </div>
  );
}
