'use strict';

const VERSION = '2026-06-21-static-explained-1';
const PRECACHE = `sneekie-precache-${VERSION}`;
const RUNTIME = `sneekie-runtime-${VERSION}`;
const KEEP_CACHES = new Set([PRECACHE, RUNTIME]);

const CORE_ASSETS = [
  './',
  '404.html',
  'SNEEKIE.BAS',
  'css/404.css',
  'css/bot-thinking.css',
  'css/bot.css',
  'css/explained.css',
  'css/game.css',
  'css/history.css',
  'css/index.css',
  'css/magazine.css',
  'css/manual.css',
  'css/migration.css',
  'css/site.css',
  'css/source.css',
  'css/vram.css',
  'en/404.html',
  'en/bot-thinking.html',
  'en/bot.html',
  'en/explained.html',
  'en/game.html',
  'en/history.html',
  'en/magazine.html',
  'en/manual.html',
  'en/migration.html',
  'en/source.html',
  'en/vram.html',
  'favicon.ico',
  'favicon.png',
  'images/apple-touch-icon.png',
  'images/home-title-en.webp',
  'images/home-title-nl.webp',
  'images/home-title-uk.webp',
  'images/icon-192.png',
  'images/icon-512-maskable.png',
  'images/icon-512.png',
  'images/index.webp',
  'images/logo.png',
  'images/magazine/cover.thumb.webp',
  'images/magazine/cover.webp',
  'images/magazine/p58.thumb.webp',
  'images/magazine/p58.webp',
  'images/magazine/p59.thumb.webp',
  'images/magazine/p59.webp',
  'images/magazine/p60.thumb.webp',
  'images/magazine/p60.webp',
  'images/magazine/p61.thumb.webp',
  'images/magazine/p61.webp',
  'images/magazine/p62.thumb.webp',
  'images/magazine/p62.webp',
  'images/magazine/p63.thumb.webp',
  'images/magazine/p63.webp',
  'images/manual/scene-1.webp',
  'images/manual/scene-2.webp',
  'images/manual/scene-3.webp',
  'images/manual/scene-4.webp',
  'images/manual/scene-5.webp',
  'images/manual/scene-6.webp',
  'images/manual/scene-7.webp',
  'images/manual/scene-8.webp',
  'images/og.png',
  'images/pages/404-lost-snake.webp',
  'images/pages/bot-closing.webp',
  'images/pages/bot-thinking-closing.webp',
  'images/pages/bot-thinking-hero.webp',
  'images/pages/explained-closing.webp',
  'images/pages/explained-hero.webp',
  'images/pages/game-closing.webp',
  'images/pages/history-01-summer-start.webp',
  'images/pages/history-02-sunrise-snake.webp',
  'images/pages/history-03-screen-world.webp',
  'images/pages/history-04-poke-bytes.webp',
  'images/pages/history-05-snake-hero.webp',
  'images/pages/history-06-steady-nerve.webp',
  'images/pages/history-07-thirty-two-trials.webp',
  'images/pages/history-08-hand-tuned.webp',
  'images/pages/history-09-notebook-mazes.webp',
  'images/pages/history-10-pencil-walls.webp',
  'images/pages/history-11-magazine-print.webp',
  'images/pages/history-12-paper-release.webp',
  'images/pages/history-13-type-in-reader.webp',
  'images/pages/history-14-hundred-screens.webp',
  'images/pages/history-15-long-vigil.webp',
  'images/pages/history-16-sleeping-dragon.webp',
  'images/pages/history-17-ocr-recovery.webp',
  'images/pages/history-18-zero-o-war.webp',
  'images/pages/history-19-fable-port.webp',
  'images/pages/history-20-opus-house.webp',
  'images/pages/history-21-three-times.webp',
  'images/pages/history-22-snake-eternal.webp',
  'images/pages/legend-1988.webp',
  'images/pages/magazine-closing.webp',
  'images/pages/magazine-hero.webp',
  'images/pages/manual-closing.webp',
  'images/pages/manual-hero.webp',
  'images/pages/migration-closing.webp',
  'images/pages/migration-hero.webp',
  'images/pages/source-closing.webp',
  'images/pages/source-hero.webp',
  'images/pages/vram-closing.webp',
  'images/pages/vram-hero.webp',
  'images/pages/web-resurrection.webp',
  'index.html',
  'index_nl.html',
  'index_uk.html',
  'js/bot.js',
  'js/game.js',
  'js/i18n.js',
  'js/magazine.js',
  'js/manual.js',
  'js/site.js',
  'js/source.js',
  'js/vram.js',
  'nl/404.html',
  'nl/bot-thinking.html',
  'nl/bot.html',
  'nl/explained.html',
  'nl/game.html',
  'nl/history.html',
  'nl/magazine.html',
  'nl/manual.html',
  'nl/migration.html',
  'nl/source.html',
  'nl/vram.html',
  'robots.txt',
  'site.webmanifest',
  'sitemap.xml',
  'uk/404.html',
  'uk/bot-thinking.html',
  'uk/bot.html',
  'uk/explained.html',
  'uk/game.html',
  'uk/history.html',
  'uk/magazine.html',
  'uk/manual.html',
  'uk/migration.html',
  'uk/source.html',
  'uk/vram.html',
];

function scopedUrl(path){
  return new URL(path, self.registration.scope);
}

function normalizedRequest(input){
  const url = new URL(input.url || input);
  url.hash = '';
  url.search = '';
  return new Request(url.href, { credentials:'same-origin' });
}

function sameOrigin(request){
  const url = new URL(request.url);
  return url.origin === self.location.origin && url.href.startsWith(self.registration.scope);
}

function isHtmlLike(request){
  const url = new URL(request.url);
  const accept = request.headers.get('accept') || '';
  return request.mode === 'navigate' ||
    request.destination === 'document' ||
    accept.includes('text/html') ||
    url.pathname.endsWith('.html') ||
    !url.pathname.split('/').pop().includes('.');
}

function isFreshenedAsset(request){
  const url = new URL(request.url);
  return isHtmlLike(request) ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    /\.(?:css|js|webmanifest|json|xml|txt|bas)$/i.test(url.pathname);
}

function isImageAsset(request){
  const url = new URL(request.url);
  return request.destination === 'image' || /\.(?:png|ico|gif|jpe?g|webp|svg)$/i.test(url.pathname);
}

/* A response obtained by following a redirect (e.g. Cloudflare's `.html` -> clean-URL 307)
   is flagged `redirected`, and the platform refuses to hand such a response to a navigation
   ("a redirected response was used for a request whose redirect mode is not 'follow'").
   Rebuild it so the cached copy is a plain, non-redirected response. */
async function flatten(response){
  if(!response || !response.redirected) return response;
  const body = await response.clone().arrayBuffer();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

async function cacheResponse(cacheName, request, response){
  if(!response || !response.ok) return response;
  const cache = await caches.open(cacheName);
  await cache.put(normalizedRequest(request), await flatten(response.clone()));
  return response;
}

async function precacheCore(){
  const cache = await caches.open(PRECACHE);
  await Promise.all(CORE_ASSETS.map(async asset => {
    const url = scopedUrl(asset);
    try {
      const response = await fetch(new Request(url.href, { cache:'reload', credentials:'same-origin' }));
      if(response.ok) await cache.put(normalizedRequest(url.href), await flatten(response));
    } catch(_) {
      /* One optional asset should not prevent installing an otherwise usable app. */
    }
  }));
}

async function deleteOldCaches(){
  const keys = await caches.keys();
  await Promise.all(keys.map(key => {
    if(!key.startsWith('sneekie-') || KEEP_CACHES.has(key)) return Promise.resolve();
    return caches.delete(key);
  }));
}

async function cachedCleanHtmlFallback(request){
  const url = new URL(request.url);
  url.hash = '';
  url.search = '';
  const candidates = [];
  if(url.pathname.endsWith('/')) candidates.push(new URL('index.html', url).href);
  else if(!url.pathname.split('/').pop().includes('.')){
    candidates.push(url.href + '.html');
    candidates.push(new URL(url.pathname + '/index.html', url.origin).href);
  }
  for(const candidate of candidates){
    const cached = await caches.match(normalizedRequest(candidate));
    if(cached) return cached;
  }
  return null;
}

async function staleWhileRevalidate(request, event){
  const key = normalizedRequest(request);
  const cached = await caches.match(key) || (isHtmlLike(request) ? await cachedCleanHtmlFallback(request) : null);
  const refresh = fetch(request)
    .then(response => cacheResponse(RUNTIME, key, response))
    .catch(() => null);
  if(cached){
    event.waitUntil(refresh);
    return cached;
  }
  const response = await refresh;
  if(response) return response;
  if(isHtmlLike(request)){
    return await cachedCleanHtmlFallback(request) ||
      await caches.match(normalizedRequest(scopedUrl('index.html').href)) ||
      new Response('', { status:504, statusText:'Offline' });
  }
  return new Response('', { status:504, statusText:'Offline' });
}

async function cacheFirst(request){
  const key = normalizedRequest(request);
  const cached = await caches.match(key);
  if(cached) return cached;
  try {
    const response = await fetch(request);
    return cacheResponse(RUNTIME, key, response);
  } catch(_) {
    return new Response('', { status:504, statusText:'Offline' });
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await precacheCore();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await deleteOldCaches();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if(request.method !== 'GET' || !sameOrigin(request)) return;
  if(new URL(request.url).pathname.endsWith('/sw.js')) return;
  if(isImageAsset(request)){
    event.respondWith(cacheFirst(request));
    return;
  }
  if(isFreshenedAsset(request)){
    event.respondWith(staleWhileRevalidate(request, event));
    return;
  }
  event.respondWith(cacheFirst(request));
});
