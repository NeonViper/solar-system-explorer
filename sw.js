/* Solar System Explorer service worker — makes the app installable and fully offline.
   Strategy: precache the ~1 MB app shell; cache-as-you-go for the ~35 MB of planet
   textures (stale-while-revalidate). Bump VERSION when shipping changed assets so
   installed copies update themselves on next launch. */
'use strict';
const VERSION = 'sse-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './assets/css/app.css',
  './assets/js/app.js', './assets/js/astro-core.js', './assets/js/astro-data.js',
  './assets/js/procedural.js', './three.min.js'];
const shellCache = 'sse-shell-' + VERSION;
const assetCache = 'sse-assets-' + VERSION;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(shellCache).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // navigations: network-first so installs pick up new deploys, offline fallback to shell
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(shellCache).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then((h) => h || caches.match('./index.html'))));
    return;
  }
  // everything else (css/js/textures): serve cache instantly, refresh in background
  e.respondWith((async () => {
    const cache = await caches.open(assetCache);
    const hit = await cache.match(req);
    const net = fetch(req).then((res) => {
      if (res && res.status === 200) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) return hit;
    const res = await net;
    return res || new Response('offline', { status: 503 });
  })());
});
