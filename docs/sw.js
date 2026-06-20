'use strict';

/* Offline support was removed. This file remains only as a cleanup shim for
   browsers that already installed the old cache-first service worker. */

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('sneekie-offline-'))
      .map(key => caches.delete(key)));
    await self.registration.unregister();
  })());
});
