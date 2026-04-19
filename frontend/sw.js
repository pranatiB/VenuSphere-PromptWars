/**
 * VenuSphere Service Worker
 * Cache-first for static assets, network-first for API calls.
 * Handles offline fallback and push notification delivery.
 */

const CACHE_VERSION = 'venusphere-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/services/firebase-client.js',
  '/js/services/api-client.js',
  '/js/services/maps-client.js',
  '/js/utils/a11y.js',
  '/js/utils/i18n.js',
  '/js/components/dashboard.js',
  '/js/components/crowd-map.js',
  '/js/components/queue-tracker.js',
  '/js/components/assistant.js',
  '/js/components/schedule.js',
  '/js/components/navigation.js',
  '/js/components/settings.js',
  '/assets/locales/en.json',
  '/manifest.json',
];

const API_PATTERNS = ['/api/', 'googleapis.com', 'firebaseio.com'];

/** Install: pre-cache static shell. */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

/** Activate: purge old caches. */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/** Fetch: route based on request type. */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  const isApi = API_PATTERNS.some((p) => request.url.includes(p));

  if (isApi) {
    event.respondWith(networkFirstWithFallback(request));
  } else {
    event.respondWith(cacheFirstWithNetworkUpdate(request));
  }
});

/**
 * Cache-first strategy with background network update.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function cacheFirstWithNetworkUpdate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || (await networkFetch) || offlineFallback();
}

/**
 * Network-first strategy with cache fallback for API requests.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function networkFirstWithFallback(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || offlineFallback();
  }
}

/**
 * Returns an offline JSON response for API failures.
 * @returns {Response}
 */
function offlineFallback() {
  return new Response(
    JSON.stringify({ error: 'You are offline. Showing cached data.' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
}

/** Push: display notification when received from server. */
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'VenuSphere Alert';
  const options = {
    body: data.body || 'New update from Eden Gardens.',
    icon: '/manifest.json',
    badge: '/manifest.json',
    tag: data.tag || 'venusphere',
    requireInteraction: data.priority === 'emergency',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/** Notification click: focus or open the app. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const existing = clients.find((c) => c.url === targetUrl && 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
