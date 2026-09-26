const CACHE_NAME = 'task-board-cache-v18'; // Change this version number (v2, v3, etc.) every time you deploy
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
  return new Response('You are offline — AlignTasks will load again when the connection returns.', {
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
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          response => {
            // Check if we received a valid response
            if (!response || response.status !== 200) { // Removed 'basic' check to allow caching CDN files
              return response || offlineResponse();
            }

            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              })
              .catch(() => {});

            return response;
          }
        ).catch(() => {
          // Network failed and nothing cached: navigations fall back to the cached app shell
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html').then(r => r || offlineResponse());
          }
          return offlineResponse();
        });
      })
      .catch(() => offlineResponse())
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

