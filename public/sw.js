/* HelioMax push service worker.
 *
 * Kept deliberately small: it shows what the server sent and focuses (or opens)
 * the right page on click. No caching or offline behaviour — the app is not a
 * PWA and adding a fetch handler here would silently start serving stale pages.
 */

self.addEventListener('install', () => {
  // Take over immediately rather than waiting for every old tab to close.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'HelioMax', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'HelioMax';
  const options = {
    body: payload.body || '',
    icon: '/logo.png',
    badge: '/logo.png',
    dir: 'rtl',
    lang: 'ar',
    // Same tag replaces an older notification of the same kind instead of
    // stacking duplicates when several fire in a row.
    tag: payload.tag || payload.type || 'heliomax',
    renotify: true,
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Reuse a tab that already has the app open, so clicking a notification
      // never leaves the user with a dozen duplicate windows.
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
