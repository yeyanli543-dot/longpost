const CACHE_NAME = 'longpost-cache-v1';

function getBasePrefix() {
  const scope = self.registration ? self.registration.scope : '';
  if (!scope) return '';
  const url = new URL(scope);
  return url.pathname.replace(/\/$/, '');
}

const BASE_PREFIX = getBasePrefix();
const PRECACHE_URLS = [BASE_PREFIX + '/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const path = url.pathname;
  if (path.includes('/api/') || path.includes('/__runtime__/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(BASE_PREFIX + '/').then((cached) => cached || Response.error()),
      ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone).catch(() => {});
            });
          }
          return response;
        })
        .catch(() => cached || Response.error());
    }),
  );
});
