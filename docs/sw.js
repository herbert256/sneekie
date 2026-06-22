'use strict';

const CACHE_PREFIX = 'sneekie-';

async function deleteSneekieCaches(){
  if(!self.caches) return;
  const keys = await caches.keys();
  await Promise.all(keys
    .filter(key => key.startsWith(CACHE_PREFIX))
    .map(key => caches.delete(key)));
}

async function reloadOpenPages(){
  if(!self.clients || !self.clients.matchAll) return;
  const pages = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
  await Promise.all(pages.map(client => {
    if(!client.url || !client.navigate) return Promise.resolve();
    return client.navigate(client.url).catch(() => {});
  }));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await deleteSneekieCaches();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await deleteSneekieCaches();
    await self.clients.claim();
    await self.registration.unregister();
    await reloadOpenPages();
  })());
});
