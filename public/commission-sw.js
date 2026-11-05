// Commission Accounts — offline shell cache.
// Scoped to /commission only, so the rest of the dashboard is untouched.
const CACHE = 'commission-shell-v2';
const SHELL = ['/commission', '/commission.html', '/commission.css', '/commission.js', '/commission.webmanifest', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => null).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('commission-shell-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Never cache API responses — the app keeps its own copy of the data.
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('/commission', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/commission').then(hit => hit || caches.match('/commission.html')))
    );
    return;
  }

  // Network first, cache as the offline fallback: a deploy must never leave users
  // running an old bundle, but a dead connection must still open the books.
  if (/\.(css|js|webmanifest|png|svg)$/.test(url.pathname) && url.pathname.startsWith('/commission')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || Response.error()))
    );
  }
});
