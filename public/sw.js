/*
 * Stanza service worker: lets the web app open with no connection.
 * Online, every file comes from the network (so you always get the newest
 * version) and a copy is kept. Offline, the kept copies are used.
 * Your songs are not touched here; they live in the browser's own database.
 */
const BUILD = '__BUILD__';
const CACHE = 'stanza-' + BUILD;
const ROOT = new URL('./', self.registration.scope).href;

// every file of this version, stored when the worker installs; filled in by scripts/finish-web.mjs
let PRECACHE = [];
try {
  PRECACHE = JSON.parse('__PRECACHE__');
} catch (e) {
  /* a build without the list still works: files are kept as they are used */
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const urls = [ROOT, ...PRECACHE.map((p) => new URL(p, ROOT).href)];
      await Promise.all(
        urls.map(async (u) => {
          try {
            const res = await fetch(u, { cache: 'reload' });
            if (res.ok) await cache.put(u, res);
          } catch (e) {
            /* one missing file should not stop the rest */
          }
        })
      );
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('stanza-') && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      } catch (err) {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        // a page address we have not seen (a song link): open the app itself
        if (req.mode === 'navigate') {
          const app = (await cache.match(ROOT)) || (await cache.match(ROOT + 'index.html'));
          if (app) return app;
        }
        return Response.error();
      }
    })()
  );
});
