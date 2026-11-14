/*
 * Containers and Lots — Service Worker (PWA offline shell).
 *
 * SAFETY RULES (why this can never corrupt or disturb the app):
 *  1. Non-GET requests (POST / PUT / DELETE — all writes, uploads, sync queue)
 *     are NEVER intercepted. They go straight to the network.
 *  2. Any same-origin URL starting with /api/ is NEVER cached. API responses
 *     (customers, proformas, invoices, containers, sync apply/remove...) always
 *     hit the network, so the app can never show stale or mixed data.
 *  3. Cross-origin requests (Firebase auth / Firestore / Drive) pass through.
 *  4. Static assets are cached stale-while-revalidate and navigations are
 *     network-first, so you always get a fresh shell when online and still have
 *     an offline shell when not.
 *  5. The cache is versioned; on activate old caches are deleted.
 */
const CACHE_NAME = 'containers-and-lots-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // writes / uploads / sync — never touch

  const url = new URL(req.url);

  // Cross-origin (Firebase, Drive, etc.) — pass through untouched.
  if (url.origin !== self.location.origin) return;

  // API data — always network, never cached (prevents stale/corrupt data).
  if (url.pathname.startsWith('/api/')) return;

  // App navigation: network-first, fall back to cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static assets (hashed JS/CSS, images, fonts, sqlite-wasm): stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
