'use client';

import { useEffect, useState, useTransition } from 'react';
import { subscribeToPushAction, unsubscribeFromPushAction } from '@/app/actions/push';
import { Button } from '@/components/ui/button';

type Status = 'checking' | 'unsupported' | 'denied' | 'off' | 'on';

/**
 * §26 — push permission UX.
 *
 * The prompt is never shown unasked. A browser permission dialog that appears
 * the moment a page loads is the single most-blocked pattern on the web, and a
 * denied permission cannot be asked for again — so the cost of prompting too
 * early is losing the channel permanently.
 *
 * `denied` is therefore a terminal state here, explained rather than retried:
 * only the user can undo it, in browser settings.
 */
export function PushOptIn({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [status, setStatus] = useState<Status>('checking');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    // Everything resolves inside this async function so no setState runs
    // synchronously in the effect body — that cascades renders, and the
    // subscription lookup is asynchronous anyway.
    async function detect(): Promise<Status> {
      if (!vapidPublicKey) return 'unsupported';
      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        return 'unsupported';
      }
      // Terminal: only the user can undo a denial, in browser settings.
      if (Notification.permission === 'denied') return 'denied';

      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        return subscription ? 'on' : 'off';
      } catch {
        return 'off';
      }
    }

    void detect().then((next) => {
      if (!cancelled) setStatus(next);
    });

    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function enable() {
    if (!vapidPublicKey) return;
    setMessage(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        setStatus('denied');
        return;
      }
      if (permission !== 'granted') return;

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        // Required by every browser: a push that cannot be shown to the user
        // is not allowed.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const json = subscription.toJSON();
      const form = new FormData();
      form.set('endpoint', subscription.endpoint);
      form.set('p256dh', json.keys?.p256dh ?? '');
      form.set('auth', json.keys?.auth ?? '');
      form.set('userAgent', navigator.userAgent.slice(0, 400));

      startTransition(async () => {
        const result = await subscribeToPushAction({}, form);
        if (result.error) setMessage(result.error);
        else {
          setStatus('on');
          setMessage(result.success ?? null);
        }
      });
    } catch {
      setMessage('We could not turn on notifications for this device.');
    }
  }

  async function disable() {
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {
        setStatus('off');
        return;
      }
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      const form = new FormData();
      form.set('endpoint', endpoint);
      startTransition(async () => {
        const result = await unsubscribeFromPushAction({}, form);
        if (result.error) setMessage(result.error);
        else {
          setStatus('off');
          setMessage(result.success ?? null);
        }
      });
    } catch {
      setMessage('We could not turn off notifications for this device.');
    }
  }

  if (status === 'checking') return null;

  return (
    <div className="mt-4 border-t border-border pt-4">
      {status === 'unsupported' ? (
        <p className="hp-body text-text-muted">
          This browser does not support push notifications. You will still see reminders
          in the app.
        </p>
      ) : status === 'denied' ? (
        <p className="hp-body text-text-muted">
          Notifications are blocked for this site. You can allow them again in your
          browser settings — HelloPera cannot ask a second time.
        </p>
      ) : status === 'on' ? (
        <div className="flex items-center justify-between gap-3">
          <p className="hp-body text-text-muted">
            This device receives push notifications.
          </p>
          <Button variant="ghost" size="sm" onClick={disable} disabled={pending}>
            Turn off
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="hp-body text-text-muted">
            Get reminders on this device, even when HelloPera is closed.
          </p>
          <Button variant="secondary" size="sm" onClick={enable} disabled={pending}>
            Allow
          </Button>
        </div>
      )}

      {message ? (
        <p role="status" className="hp-small mt-2 text-text-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The VAPID public key is distributed base64url; PushManager wants raw bytes.
 * Browsers do not do this conversion, so every web-push client carries a copy
 * of it.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  // Backed by an explicit ArrayBuffer: PushManager's applicationServerKey will
  // not accept a view over a SharedArrayBuffer, which is what a bare
  // `new Uint8Array(n)` widens to under this TypeScript lib.
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
