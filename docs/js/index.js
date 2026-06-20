'use strict';

function useCleanUrls(){
  return location.hostname === 'sneekie.xyz' || location.hostname === 'www.sneekie.xyz';
}

function pageHref(path){
  return useCleanUrls() ? path.replace(/\.html$/, '') : path;
}

function removeOfflineSupport(){
  const cleanup = () => {
    if('serviceWorker' in navigator){
      const rootScope = new URL('./', location.href).href;
      navigator.serviceWorker.getRegistrations()
        .then(registrations => Promise.all(registrations
          .filter(registration => registration.scope === rootScope)
          .map(registration => registration.unregister())))
        .catch(() => {});
    }
    if('caches' in window){
      caches.keys()
        .then(keys => Promise.all(keys
          .filter(key => key.startsWith('sneekie-offline-'))
          .map(key => caches.delete(key))))
        .catch(() => {});
    }
  };
  if(document.readyState === 'complete') cleanup();
  else addEventListener('load', cleanup, { once:true });
}

const I18N = window.SNEEKIE_I18N || {};
const LANGS = I18N.languageCodes || ['en'];
const DEFAULT_LANG = I18N.defaultLang || 'en';
const LANG_META = Object.fromEntries((I18N.languages || []).map(lang => [lang.code, lang]));

function normalizeLang(value){
  const lang = String(value || '').toLowerCase().split('-')[0];
  return LANGS.includes(lang) ? lang : DEFAULT_LANG;
}

function queryLang(){
  try {
    const value = new URLSearchParams(location.search).get('lang');
    return LANGS.includes(value) ? value : null;
  } catch(_) {
    return null;
  }
}

function storedLang(){
  try { return localStorage.getItem('sneekie.lang'); }
  catch(_) { return null; }
}

function currentLang(){
  return queryLang() || normalizeLang(storedLang() || navigator.language || DEFAULT_LANG);
}

function setStoredLang(lang){
  try { localStorage.setItem('sneekie.lang', normalizeLang(lang)); }
  catch(_) { }
}

function gameSrc(){
  const lang = currentLang();
  const prefix = LANG_META[lang]?.pathPrefix || lang;
  return pageHref(prefix + '/game.html');
}

const game = document.getElementById('game');
function syncGameSrc(){
  const lang = currentLang();
  document.documentElement.lang = lang;
  game.title = lang === 'nl' ? 'Sneekie spel' : lang === 'uk' ? 'Гра Sneekie' : 'Sneekie game';
  const src = gameSrc();
  if(new URL(game.getAttribute('src') || '', location.href).href !== new URL(src, location.href).href){
    game.src = src;
  }
}

if(queryLang()) setStoredLang(queryLang());
removeOfflineSupport();
syncGameSrc();
game.addEventListener('load', () => game.focus());
addEventListener('pointerdown', () => game.focus(), {passive:true});
addEventListener('storage', event => {
  if(event.key === 'sneekie.lang') syncGameSrc();
});
addEventListener('message', event => {
  const data = event.data || {};
  if(data.type === 'sneekie:language' && data.lang){
    setStoredLang(data.lang);
    syncGameSrc();
  }
});
