'use strict';

const CACHE_NAME = 'sneekie-offline-v22';
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
  'images/icon-512.png',
  'images/og.png',
  'images/manual/scene-1.gif',
  'images/manual/scene-2.gif',
  'images/manual/scene-3.gif',
  'images/manual/scene-4.gif',
  'images/manual/scene-5.gif',
  'images/manual/scene-6.gif',
  'images/manual/scene-7.gif',
  'images/manual/scene-8.gif',
  'images/magazine/cover.jpg',
  'images/magazine/cover.thumb.jpg',
  'images/magazine/p58.jpg',
  'images/magazine/p58.thumb.jpg',
  'images/magazine/p59.jpg',
  'images/magazine/p59.thumb.jpg',
  'images/magazine/p60.jpg',
  'images/magazine/p60.thumb.jpg',
  'images/magazine/p61.jpg',
  'images/magazine/p61.thumb.jpg',
  'images/magazine/p62.jpg',
  'images/magazine/p62.thumb.jpg',
  'images/magazine/p63.jpg',
  'images/magazine/p63.thumb.jpg',
  'images/magazine/p58.en.jpg',
  'images/magazine/p58.en.thumb.jpg',
  'images/magazine/p59.en.jpg',
  'images/magazine/p59.en.thumb.jpg'
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
