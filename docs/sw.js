'use strict';

const CACHE_NAME = 'sneekie-offline-v8';
const PRECACHE_ASSETS = [
  './',
  'index.html',
  'manual.html',
  'live.html',
  'bot.html',
  'magazine.html',
  'source.html',
  'explained.html',
  'migration.html',
  'vram.html',
  'SNEEKIE.BAS',
  'site.webmanifest',
  'favicon.png',
  'logo.png',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'og.png',
  'manual/scene-1.gif',
  'manual/scene-2.gif',
  'manual/scene-3.gif',
  'manual/scene-4.gif',
  'manual/scene-5.gif',
  'manual/scene-6.gif',
  'manual/scene-7.gif',
  'manual/scene-8.gif',
  'magazine/cover.jpg',
  'magazine/cover.thumb.jpg',
  'magazine/p58.jpg',
  'magazine/p58.thumb.jpg',
  'magazine/p59.jpg',
  'magazine/p59.thumb.jpg',
  'magazine/p60.jpg',
  'magazine/p60.thumb.jpg',
  'magazine/p61.jpg',
  'magazine/p61.thumb.jpg',
  'magazine/p62.jpg',
  'magazine/p62.thumb.jpg',
  'magazine/p63.jpg',
  'magazine/p63.thumb.jpg',
  'magazine/p58.en.jpg',
  'magazine/p58.en.thumb.jpg',
  'magazine/p59.en.jpg',
  'magazine/p59.en.thumb.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const urls = PRECACHE_ASSETS.map(path =>
      new Request(new URL(path, self.registration.scope), { cache: 'reload' })
    );
    await cache.addAll(urls);
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
