/* site.js — shared page chrome/helpers plus the GW-BASIC syntax tokenizer used by
   source.html and explained.html. The tokenizer returns [class, text] tokens
   per physical line; classes: ws ln com str num kw fn op id pn. explained.js
   carries its own small JavaScript tokenizer too (for the right-hand port column). */
'use strict';

/* ---------- shared page helpers ---------- */
function lsGet(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } }
function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(_){ } }

const SITE_I18N_CONFIG = window.SNEEKIE_I18N || {};
const SITE_LANGS = SITE_I18N_CONFIG.languageCodes || ['en'];
const SITE_LANG_META = Object.fromEntries((SITE_I18N_CONFIG.languages || []).map(lang => [lang.code, lang]));
const SITE_I18N = SITE_I18N_CONFIG.strings || {};
const DEFAULT_LANG = SITE_I18N_CONFIG.defaultLang || 'en';

function normalizeSiteLang(value){
  const lang = String(value || '').toLowerCase().split('-')[0];
  return SITE_LANGS.includes(lang) ? lang : DEFAULT_LANG;
}

function querySiteLang(){
  try {
    const value = String(new URLSearchParams(location.search).get('lang') || '').toLowerCase().split('-')[0];
    return SITE_LANGS.includes(value) ? value : null;
  } catch(_) {
    return null;
  }
}

function sitePathPartsFromPathname(pathname){
  const parts = String(pathname || '').split('/').filter(Boolean);
  const docsIndex = parts.lastIndexOf('docs');
  return docsIndex >= 0 ? parts.slice(docsIndex + 1) : parts;
}

function pathParts(){
  return sitePathPartsFromPathname(location.pathname);
}

function currentPathLanguage(){
  const first = pathParts()[0];
  return SITE_LANGS.includes(first) ? first : null;
}

let siteLang = currentPathLanguage() || querySiteLang() || DEFAULT_LANG;

function siteLanguage(){ return siteLang; }

function siteText(key){
  const fallback = SITE_I18N[DEFAULT_LANG] || {};
  const table = SITE_I18N[siteLang] || fallback;
  return table[key] || fallback[key] || key;
}

function languageTextKey(lang){
  return 'lang' + lang.charAt(0).toUpperCase() + lang.slice(1);
}

function applySiteTranslations(){
  document.documentElement.lang = siteLang;
  if(document.body) document.body.dataset.lang = siteLang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.innerHTML = siteText(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-text]').forEach(el => {
    el.textContent = siteText(el.dataset.i18nText);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', siteText(el.dataset.i18nAria));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.setAttribute('title', siteText(el.dataset.i18nTitle));
  });
  document.querySelectorAll('[data-i18n-alt]').forEach(el => {
    el.setAttribute('alt', siteText(el.dataset.i18nAlt));
  });
  document.querySelectorAll('.lang-switch').forEach(el => {
    el.setAttribute('aria-label', siteText('language'));
  });
  document.querySelectorAll('.lang-switch [data-lang]').forEach(btn => {
    const lang = normalizeSiteLang(btn.dataset.lang);
    const meta = SITE_LANG_META[lang] || SITE_LANG_META.en;
    const key = meta.key || languageTextKey(lang);
    btn.setAttribute('aria-label', siteText(key));
    btn.setAttribute('title', siteText(key));
    if(lang === siteLang) btn.setAttribute('aria-current', 'true');
    else btn.removeAttribute('aria-current');
  });
}

function setSiteLanguage(lang, options){
  const opts = options || {};
  const next = normalizeSiteLang(lang);
  siteLang = next;
  if(opts.persist !== false) lsSet('sneekie.lang', next);
  if(opts.silent !== true && opts.navigate !== false){
    siteNavigate(sitePageHref(currentPage(), next));
    return;
  }
  applySiteTranslations();
  if(opts.silent !== true){
    dispatchEvent(new CustomEvent('sneekie:languagechange', { detail: { lang: next } }));
    if(isEmbedded()){
      try { parent.postMessage({ type: 'sneekie:language', lang: next }, '*'); } catch(_) { }
    }
  }
}

window.sneekieLang = siteLanguage;
window.sneekieText = siteText;
window.sneekieSetLanguage = setSiteLanguage;

function languagePathPrefix(lang){
  const code = normalizeSiteLang(lang);
  return SITE_LANG_META[code]?.pathPrefix || code;
}

function pageRoot(){
  const parts = pathParts();
  return SITE_LANGS.includes(parts[0]) && parts.length > 1 ? '../' : '';
}

function isEmbedded(){
  try { return window.self !== window.top; }
  catch(_) { return true; }
}

function siteNavigate(href){
  if(isEmbedded()) window.top.location.href = new URL(href, location.href).href;
  else location.href = href;
}

function useCleanUrls(){
  return location.hostname === 'sneekie.xyz' || location.hostname === 'www.sneekie.xyz';
}

function sitePageHref(slug, lang){
  const code = normalizeSiteLang(lang || siteLang);
  const prefix = languagePathPrefix(code) + '/';
  const suffix = useCleanUrls() ? slug : slug + '.html';
  return pageRoot() + prefix + suffix;
}

function currentPage(){
  const file = location.pathname.split('/').pop() || 'index.html';
  return file.replace(/\.html$/, '') || 'index';
}

function redirectLegacyLanguageQuery(){
  const query = querySiteLang();
  if(!query) return;
  if(query === (currentPathLanguage() || DEFAULT_LANG)) return;
  location.replace(new URL(sitePageHref(currentPage(), query), location.href).href);
}

function renderTopHeader(){
  if(document.querySelector('header.top')) return;
  const root = pageRoot();
  const current = currentPage();
  const embedded = isEmbedded();
  const links = [
    ['game', 'navGame'],
    ['history', 'navHistory'],
    ['source', 'navSource'],
    ['manual', 'navManual'],
    ['bot', 'navBot'],
    ['magazine', 'navMagazine'],
    ['explained', 'navExplained'],
    ['migration', 'navMigration'],
    ['vram', 'navVram'],
  ];
  const header = document.createElement('header');
  header.className = 'top';

  const brand = document.createElement('a');
  brand.className = 'brand';
  brand.href = sitePageHref('game');
  if(embedded) brand.target = '_top';
  brand.dataset.i18nAria = 'brand';
  brand.setAttribute('aria-label', siteText('brand'));
  const logo = document.createElement('img');
  logo.src = root + 'images/logo.png';
  logo.alt = 'Sneekie';
  brand.appendChild(logo);
  header.appendChild(brand);

  const nav = document.createElement('nav');
  nav.dataset.i18nAria = 'primary';
  nav.setAttribute('aria-label', siteText('primary'));
  for(const [slug, key] of links){
    const a = document.createElement('a');
    a.href = sitePageHref(slug);
    a.dataset.i18n = key;
    a.innerHTML = siteText(key);
    if(embedded) a.target = '_top';
    if(slug === current) a.setAttribute('aria-current', 'page');
    nav.appendChild(a);
  }

  header.appendChild(nav);

  const langSwitch = document.createElement('div');
  langSwitch.className = 'lang-switch';
  langSwitch.setAttribute('aria-label', siteText('language'));
  for(const lang of SITE_LANGS){
    const meta = SITE_LANG_META[lang] || SITE_LANG_META.en;
    const a = document.createElement('a');
    a.href = sitePageHref(current, lang);
    a.dataset.lang = lang;
    if(embedded) a.target = '_top';
    a.innerHTML = '<span class="lang-icon" aria-hidden="true">' + (meta.flag || lang.toUpperCase()) + '</span>';
    a.addEventListener('click', () => lsSet('sneekie.lang', lang));
    langSwitch.appendChild(a);
  }
  header.appendChild(langSwitch);

  document.body.insertBefore(header, document.body.firstChild);
  requestAnimationFrame(() => {
    const active = nav.querySelector('[aria-current="page"]');
    if(active && nav.scrollWidth > nav.clientWidth) active.scrollIntoView({inline:'center', block:'nearest'});
  });

  // skip-to-content link, inserted as the first focusable element on the page
  const skip = document.createElement('a');
  skip.className = 'skip';
  skip.href = '#main';
  skip.dataset.i18n = 'skip';
  skip.innerHTML = siteText('skip');
  document.body.insertBefore(skip, document.body.firstChild);

  // ensure the skip target exists and is focusable on every page
  const main = document.querySelector('main');
  if(main){
    if(!main.id) main.id = 'main';
    if(!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  }
}

function renderPageFooter(){
  if(document.querySelector('footer')) return;
  const footer = document.createElement('footer');
  footer.dataset.i18n = 'footer';
  footer.innerHTML = siteText('footer');
  document.body.appendChild(footer);   // end of <body>; robust regardless of where site.js is loaded
}

function normalizeCleanLinks(){
  if(!useCleanUrls()) return;
  document.querySelectorAll('a[href]').forEach(a => {
    const raw = a.getAttribute('href');
    if(!raw || !/\.html([?#]|$)/.test(raw)) return;
    const url = new URL(raw, location.href);
    if(url.origin !== location.origin) return;
    url.pathname = url.pathname.replace(/\.html$/, '');
    a.href = url.href;
  });
}

function registerOfflineCache(){
  if('serviceWorker' in navigator){
    addEventListener('load', () => {
      navigator.serviceWorker.register(new URL(pageRoot() + 'sw.js', location.href).href).catch(() => {});
    });
  }
}

redirectLegacyLanguageQuery();
renderTopHeader();
renderPageFooter();
setSiteLanguage(siteLang, { silent: true });
normalizeCleanLinks();
registerOfflineCache();

/* ---------- GW-BASIC token classification ---------- */
const KW = new Set(('REM DEFINT DEFSNG DEFDBL DEFSTR SCREEN WIDTH CLS RANDOMIZE DEF SEG ' +
  'POKE DIM LOCATE PRINT USING LPRINT FOR TO STEP NEXT IF THEN ELSE GOTO GOSUB RETURN ' +
  'ON WHILE WEND SOUND PLAY BEEP END STOP DATA READ RESTORE LET INPUT LINE GET PUT OPEN ' +
  'CLOSE CALL RUN COLOR PSET PRESET CIRCLE PAINT DRAW OUT WAIT SWAP ERASE CLEAR OPTION BASE').split(' '));
const FN = new Set(('CHR$ STR$ STRING$ SPACE$ LEFT$ RIGHT$ MID$ HEX$ OCT$ INKEY$ INPUT$ ASC LEN ' +
  'INSTR INT FIX ABS SGN SQR SIN COS TAN ATN LOG EXP RND VAL PEEK TIMER POS CSRLIN VARPTR ' +
  'FRE SPC TAB').split(' '));
const OPWORD = new Set('AND OR NOT XOR EQV IMP MOD'.split(' '));

const isWordStart = c => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
const isWord      = c => isWordStart(c) || (c >= '0' && c <= '9');
const isDigit     = c => c >= '0' && c <= '9';
const isHex       = c => isDigit(c) || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f');

/* scan a run of code (no leading line number) into [class, text] tokens */
function scanCode(s, out){
  let i = 0; const n = s.length;
  while(i < n){
    const c = s[i];
    if(c === ' ' || c === '\t'){ let j = i; while(j < n && (s[j] === ' ' || s[j] === '\t')) j++; out.push(['ws', s.slice(i, j)]); i = j; continue; }
    if(c === "'"){ out.push(['com', s.slice(i)]); break; }                       // apostrophe comment → rest of line
    if(c === '"'){ let j = i + 1; while(j < n && s[j] !== '"') j++; if(j < n) j++; out.push(['str', s.slice(i, j)]); i = j; continue; }
    if(c === '&' && (s[i+1] === 'H' || s[i+1] === 'h')){ let j = i + 2; while(j < n && isHex(s[j])) j++; out.push(['num', s.slice(i, j)]); i = j; continue; }
    if(isDigit(c) || (c === '.' && isDigit(s[i+1] || ''))){ let j = i; while(j < n && (isDigit(s[j]) || s[j] === '.')) j++; out.push(['num', s.slice(i, j)]); i = j; continue; }
    if(isWordStart(c)){
      let j = i; while(j < n && isWord(s[j])) j++;
      if(s[j] === '$') j++;                                                       // CHR$, A$, INKEY$ …
      const w = s.slice(i, j), up = w.toUpperCase();
      if(up === 'REM'){ out.push(['kw', w]); out.push(['com', s.slice(j)]); break; }
      out.push([KW.has(up) ? 'kw' : FN.has(up) ? 'fn' : OPWORD.has(up) ? 'op' : 'id', w]);
      i = j; continue;
    }
    if('=+-*/\\^<>'.includes(c)){
      const two = s.substr(i, 2);
      if(two === '<=' || two === '>=' || two === '<>' || two === '><'){ out.push(['op', two]); i += 2; continue; }
      out.push(['op', c]); i++; continue;
    }
    out.push(['pn', c]); i++;                                                     // : ; , ( ) etc.
  }
}

/* one physical line → tokens (split off the leading BASIC line number first) */
function tokenizeBasicLine(line){
  const out = [];
  const m = /^(\s*)(\d+)(?=\D|$)/.exec(line);
  if(m){
    if(m[1]) out.push(['ws', m[1]]);
    out.push(['ln', m[2]]);
    scanCode(line.slice(m[0].length), out);
  } else {
    scanCode(line, out);                                                          // header ' comments + blank lines
  }
  return out;
}
