/**
 * HelloPera service worker — PHASE-08 §46.
 *
 * Push and notification clicks only. It deliberately does NOT cache anything:
 * §46 says "Do not cache sensitive API data broadly", and this app's responses
 * are a person's financial records. An offline shell can be added later with
 * an explicit allowlist; caching by default here would put balances in a store
 * that outlives the session.
 */

const VERSION = 'hellopera-sw-v1';

self.addEventListener('install', (event) => {
  // Take over immediately rather than waiting for every tab to close — a
  // stale worker that keeps handling pushes after a fix has shipped is worse
  // than a brief overlap.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // A push that is not our JSON is not something to guess at.
    return;
  }

  const title = payload.title || 'HelloPera';
  const options = {
    body: payload.body || '',
    // Reusing one tag per notification id means a re-sent reminder replaces
    // its predecessor instead of stacking duplicates on the lock screen.
    tag: payload.id || VERSION,
    data: { url: payload.url || '/notifications' },
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // No vibration and no requireInteraction: a bill reminder is not urgent
    // enough to demand dismissal (§47).
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url =
    (event.notification.data && event.notification.data.url) || '/notifications';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing tab rather than opening a duplicate.
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
        return undefined;
      }),
  );
});
