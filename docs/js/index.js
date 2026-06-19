'use strict';

function useCleanUrls(){
  return location.hostname === 'sneekie.xyz' || location.hostname === 'www.sneekie.xyz';
}

function pageHref(path){
  return useCleanUrls() ? path.replace(/\.html$/, '') : path;
}

const LANGS = ['nl', 'en', 'uk'];

function normalizeLang(value){
  const lang = String(value || '').toLowerCase().split('-')[0];
  return LANGS.includes(lang) ? lang : 'en';
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
  return queryLang() || normalizeLang(storedLang() || navigator.language || 'en');
}

function setStoredLang(lang){
  try { localStorage.setItem('sneekie.lang', normalizeLang(lang)); }
  catch(_) { }
}

function gameSrc(){
  const src = pageHref('html/game.html');
  return src + (src.includes('?') ? '&' : '?') + 'lang=' + currentLang();
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
