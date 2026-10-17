// Algorender's service worker: keeps the site usable offline, above all the
// daily review (/review), whose cards and progress live on the device.
//
// - /_next/static/ files are content-hashed, so they are served from the
//   cache once fetched.
// - Pages, their React Server Component payloads and other same-origin GETs
//   go to the network first and fall back to the last copy cached; /review is
//   cached when the worker installs, so it opens offline even before a visit.
// - The API (/api/) is never cached: accounts and sync need the server.
// - An uncached page offline gets a short page pointing to the review.
//
// Registered in production only (src/components/ServiceWorker.tsx). Bump
// VERSION to drop every cache after changing what is cached.

const VERSION = 'v1';
const PAGES = `algorender-pages-${VERSION}`;
const STATIC = `algorender-static-${VERSION}`;
const PRECACHE = ['/review'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .catch(() => {}) // offline at install: cache on the first visit instead
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('algorender-') && k !== PAGES && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request, request.mode === 'navigate'));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(STATIC)).put(request, response.clone());
  return response;
}

async function networkFirst(request, navigation) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') (await caches.open(PAGES)).put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreVary: true });
    if (cached) return cached;
    if (navigation) return offlinePage();
    throw error;
  }
}

function offlinePage() {
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline | Algorender</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#1f2937;background:#f8fafc}a{color:#1d4ed8}@media (prefers-color-scheme:dark){body{color:#e5e7eb;background:#0f172a}a{color:#93c5fd}}</style></head>
<body><h1>You’re offline</h1><p>This page hasn’t been saved on this device yet. Your <a href="/review">daily review</a> works offline, and everything you do syncs when you’re back.</p></body></html>`;
  return new Response(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
