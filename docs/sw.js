'use strict';

const CACHE_NAME = 'sneekie-offline-v23';

/* Precache only the lightweight app shell (~0.4 MB): HTML, CSS, JS, the BASIC
   source, the manifest, and the small icons. The heavy magazine scans and manual
   clips are NOT precached — the fetch handler's cacheFirstAsset() caches them on
   demand the first time a visitor actually opens those pages, so offline still
   works after a real visit without forcing every first-time visitor to download
   several megabytes of media up front. */
const PRECACHE_ASSETS = [
  './',
  'index.html',
  'html/manual.html',
  'html/live.html',
  'html/bot.html',
  'html/magazine.html',
  'html/source.html',
  'html/explained.html',
  'html/migration.html',
  'html/vram.html',
  'SNEEKIE.BAS',
  'site.webmanifest',
  'css/site.css',
  'css/index.css',
  'css/manual.css',
  'css/live.css',
  'css/bot.css',
  'css/magazine.css',
  'css/source.css',
  'css/explained.css',
  'css/migration.css',
  'css/vram.css',
  'js/site.js',
  'js/index.js',
  'js/manual.js',
  'js/live.js',
  'js/bot.js',
  'js/magazine.js',
  'js/source.js',
  'js/explained.js',
  'js/migration.js',
  'js/vram.js',
  'favicon.png',
  'images/logo.png',
  'images/apple-touch-icon.png',
  'images/icon-192.png',
  'images/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const urls = PRECACHE_ASSETS.map(path =>
      new Request(new URL(path, self.registration.scope), { cache: 'reload' })
    );
    // Cache each asset independently: cache.addAll() is all-or-nothing, so a
    // single missing/renamed/transiently-failing asset would reject the whole
    // install, skipWaiting() would never run, and users would stay pinned to the
    // old worker and a stale cache — silently. allSettled lets the install
    // succeed with whatever fetched; the rest is filled in on demand later.
    await Promise.allSettled(urls.map(req => cache.add(req)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('sneekie-offline-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if(request.method !== 'GET') return;

  const url = new URL(request.url);
  if(url.origin !== location.origin) return;
  if(!url.href.startsWith(self.registration.scope)) return;

  event.respondWith(request.mode === 'navigate'
    ? networkFirstNavigation(request)
    : cacheFirstAsset(request));
});

async function networkFirstNavigation(request){
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    if(fresh.ok) await cache.put(request, fresh.clone());
    return fresh;
  } catch(_) {
    return await cache.match(request, { ignoreSearch: true }) ||
      await cache.match(new URL('index.html', self.registration.scope)) ||
      Response.error();
  }
}

async function cacheFirstAsset(request){
  const cached = await caches.match(request, { ignoreSearch: true });
  if(cached) return cached;

  const fresh = await fetch(request);
  if(fresh.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, fresh.clone());
  }
  return fresh;
}
