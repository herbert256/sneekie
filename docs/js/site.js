/* site.js - shared storage, link cleanup, and old service-worker removal. */
'use strict';

function lsGet(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } }
function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(_){ } }

function useCleanUrls(){
  return location.hostname === 'sneekie.xyz' || location.hostname === 'www.sneekie.xyz';
}

function normalizeCleanLinks(){
  if(!useCleanUrls()) return;
  document.querySelectorAll('a[href]').forEach(a => {
    if(a.closest('header.top, footer')) return;
    const raw = a.getAttribute('href');
    if(!raw || !/\.html([?#]|$)/.test(raw)) return;
    const url = new URL(raw, location.href);
    if(url.origin !== location.origin) return;
    url.pathname = url.pathname.replace(/\.html$/, '');
    a.href = url.href;
  });
}

const OFFLINE_CLEANUP_RELOAD_KEY = 'sneekie.offlineCleanupReloaded';

function offlineCleanupReloaded(){
  try { return sessionStorage.getItem(OFFLINE_CLEANUP_RELOAD_KEY) === '1'; }
  catch(_) { return true; }
}

function markOfflineCleanupReloaded(){
  try { sessionStorage.setItem(OFFLINE_CLEANUP_RELOAD_KEY, '1'); }
  catch(_) { }
}

function removeOfflineSupport(){
  const hadController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  if('caches' in window){
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('sneekie-'))
        .map(key => caches.delete(key))))
      .catch(() => {});
  }
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations()
    .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
    .then(() => {
      if(!hadController || offlineCleanupReloaded()) return;
      markOfflineCleanupReloaded();
      location.reload();
    })
    .catch(() => {});
}

normalizeCleanLinks();
removeOfflineSupport();
