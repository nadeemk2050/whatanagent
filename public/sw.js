const CACHE_NAME = 'whatanagent-v2';
const ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-180.png',
  '/icon-192.svg',
  '/icon-512.svg'
];

// Take over immediately when a new version is installed
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(err => console.log("SW Cache assets skipped:", err));
    })
  );
});

// Delete ALL old caches (including old admin.html copies) and activate immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-first: always try to serve FRESH content from the server,
// and only fall back to the cache when the user is offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Never intercept API calls, Firestore or external CDNs
  if (url.pathname.startsWith('/api') || url.hostname.includes('firestore') || url.hostname.includes('googleapis') || url.hostname.includes('gstatic') || url.hostname.includes('unpkg')) {
    return;
  }

  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request).then((response) => {
      if (response && response.ok && url.origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy)).catch(() => {});
      }
      return response;
    }).catch(() => caches.match(e.request))
  );
});
