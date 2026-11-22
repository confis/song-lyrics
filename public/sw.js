/* Simple offline-first service worker for "סדר הופעה".
   After one online visit, the app shell, its assets and the songs list are
   cached, so the site opens and shows the songs without a connection. */
const VERSION = "v1";
const STATIC_CACHE = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;
const API_CACHE = `api-${VERSION}`;
const KNOWN_CACHES = [STATIC_CACHE, RUNTIME_CACHE, API_CACHE];

const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !KNOWN_CACHES.includes(k)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.status === 200) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Last resort for the songs API: an empty list so the app still renders.
    return new Response(JSON.stringify({ songs: [] }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin alone

  // Songs list: network-first, fall back to the last cached copy (offline view).
  if (url.pathname === "/api/songs") {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Page navigations: network-first, fall back to the cached app shell.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(request);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put("/", net.clone()).catch(() => {});
          return net;
        } catch {
          const cache = await caches.open(RUNTIME_CACHE);
          return (
            (await cache.match("/")) ||
            (await caches.match("/")) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // Everything else (JS/CSS/fonts/images): serve from cache, update in the
  // background (stale-while-revalidate).
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            cache.put(request, res.clone()).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })()
  );
});
