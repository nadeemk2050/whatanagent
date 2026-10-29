const CACHE_NAME = 'task-board-cache-v68'; // Change this version number (v2, v3, etc.) every time you deploy
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icons/192.png',
  './icons/512.png',
  'https://cdn.tailwindcss.com',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js'
];

// Install the service worker
self.addEventListener('install', event => {
  self.skipWaiting();   // activate the new version immediately on next reload
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching essential assets');
        return cache.addAll(urlsToCache).catch(err => console.log('Some assets could not be cached (will retry at runtime):', err && err.message));
      })
  );
});

function offlineResponse() {
  return new Response('You are offline â€” AlignTasks will load again when the connection returns.', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

// Serve cached content when offline, and update cache with new content.
// NOTE: the fetch handler must ALWAYS resolve to a real Response - resolving
// undefined throws "Failed to convert value to 'Response'" in the page console.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;   // never intercept writes/POSTs
  let url;
  try { url = new URL(event.request.url); } catch (e) { return; }
  // Only http(s) can be cached; browser extensions inject chrome-extension:// requests
  // into the page and caching those throws "Request scheme 'chrome-extension' is unsupported".
  if (!/^https?:$/i.test(url.protocol)) return;
  // NEVER touch API or data traffic. A cached â€” or synthetic "503 Offline" â€” response for
  // /api/align/* or Firestore breaks sign-in, task saves and live listeners.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') === 0) return;

  const isHtml = event.request.mode === 'navigate'
    || event.request.destination === 'document'
    || /\/$|\.html?$/.test(url.pathname);

  // HTML / app shell: NETWORK-FIRST so a new deployment is picked up on the very next load.
  // (Previously cache-first, which made deployed UI changes invisible until the cache expired.)
  if (isHtml) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy)).catch(() => {});
          }
          return response || offlineResponse();
        })
        .catch(() => caches.match('./index.html')
          .then(r => r || caches.match(event.request))
          .then(r => r || offlineResponse()))
    );
    return;
  }

  // Static assets / CDN files: cache-first, then network (and cache the result).
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;

        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          response => {
            if (!response || response.status !== 200) {
              return response || offlineResponse();
            }

            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                // Only same-origin / http(s) requests can be cached; browser extensions
                // (chrome-extension://â€¦) and other schemes throw here.
                if (!/^https?:$/i.test(new URL(event.request.url).protocol)) return;
                cache.put(event.request, responseToCache).catch(() => {});
              })
              .catch(() => {});

            return response;
          }
        ).catch(() => Response.error());   // a real network failure, not a fake 503 page
      })
      .catch(() => Response.error())
  );
});

// Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());   // take control of open pages immediately
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// ---------------------------------------------------------------- 🔔 Web Push
// A task reminder arrives here even when the app is closed (Android + desktop Chrome/Edge,
// and iPhone once the site is added to the Home Screen).
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || '⏰ AlignTasks reminder';
  const options = {
    body: data.body || 'You have a pending task.',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: data.tag || 'align-task',
    renotify: true,
    requireInteraction: data.priority === 'high',
    vibrate: data.priority === 'high' ? [200, 100, 200, 100, 200] : [120],
    data: { url: data.url || './index.html', taskId: data.taskId || '' },
    actions: data.actions || []
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.indexOf('aligntasks') !== -1) { try { c.focus(); } catch (e) {} return; }
      }
      return self.clients.openWindow(target);
    })
  );
});


