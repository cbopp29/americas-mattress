// Service worker intentionally DISABLED.
// A previous version cached the app for offline use, but on home-screen (PWA)
// installs it caused stale content and constant refreshing. This version caches
// nothing, deletes any old caches, and unregisters itself so every device
// returns to the reliable always-online app. Do not add caching back here
// without testing on a real installed iPhone home-screen app first.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {}
    try { await self.registration.unregister(); } catch (e) {}
    try { await self.clients.claim(); } catch (e) {}
  })());
});

// Never intercept requests — always go straight to the network (no reloads,
// no caching, no loops).
self.addEventListener('fetch', () => {});
