// Service Worker — network-first, but cache app shell so the app loads OFFLINE.
// Drivers lose signal in some areas; this lets the app open and show the last
// data even with no connection. Bump CACHE to force a refresh on all devices.
const CACHE = 'amattress-v4';

self.addEventListener('install', e => {
  self.skipWaiting();
  // Pre-cache the app entry so a cold offline open still boots.
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(['/']).catch(() => {}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Never cache API calls (Supabase, Twilio, Netlify functions) — those must hit
// the network and fail loudly so the offline write-queue can take over.
function isApi(url) {
  return url.includes('supabase.co') ||
         url.includes('/.netlify/functions/') ||
         url.includes('api.twilio.com');
}

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (e.request.method !== 'GET' || isApi(url)) return; // let it go to network untouched

  // App shell (HTML navigations + JS/CSS): network-first, but SAVE a copy so
  // the next offline open has it. Fall back to cache (then cached '/') offline.
  if (e.request.mode === 'navigate' ||
      url.includes('.js') || url.includes('.css')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() =>
          caches.match(e.request).then(hit => hit || caches.match('/'))
        )
    );
    return;
  }

  // Other static assets: network-first, cache fallback.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
