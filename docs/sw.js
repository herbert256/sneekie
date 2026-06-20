'use strict';

async function deleteAllCaches(){
  if(!self.caches) return;
  const keys = await caches.keys();
  await Promise.all(keys.map(key => caches.delete(key)));
}

async function reloadOpenClients(){
  if(!self.clients || !self.clients.matchAll) return;
  const windows = await clients.matchAll({ type:'window', includeUncontrolled:true });
  await Promise.all(windows.map(client => {
    try {
      const url = new URL(client.url);
      if(url.origin !== self.location.origin) return Promise.resolve();
      return client.navigate(client.url);
    } catch(_) {
      return Promise.resolve();
    }
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await deleteAllCaches();
    await self.clients.claim();
    await self.registration.unregister();
    await reloadOpenClients();
  })());
});
