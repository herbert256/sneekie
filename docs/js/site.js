/* site.js — shared page chrome/helpers plus the GW-BASIC syntax tokenizer used by
   source.html and explained.html. The tokenizer returns [class, text] tokens
   per physical line; classes: ws ln com str num kw fn op id pn. migration.html
   keeps its own reduced tokenizer because it also tokenizes JavaScript. */
'use strict';

/* ---------- shared page helpers ---------- */
function lsGet(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } }
function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(_){ } }

const SITE_I18N = {
  en: {
    brand: 'Sneekie home',
    primary: 'Primary',
    skip: 'Skip to content',
    navGame: '\u25b6 Play',
    navManual: 'Manual',
    navLive: 'Live',
    navBot: 'Bot',
    navMagazine: 'Magazine',
    navMaking2: 'Making Off',
    navSource: 'Source',
    navExplained: 'Explained',
    navMigration: 'Migration',
    navVram: 'Visualizer',
    navMakingOf1: 'The making off - 1',
    navMakingOf3: 'The making off - 3',
    download: 'Download',
    print: 'Print',
    language: 'Language',
    langEn: 'English',
    langNl: 'Nederlands',
    footer:
      "Sneekie &copy; July '88 by HerbySoft<br>" +
      'Published in MS(X)DOS Computer Magazine no.&nbsp;25 (October 1988).<br>' +
      'Original: GW-BASIC, 80&times;25 text mode, POKEs straight into video memory.<br>' +
      'Browser version: June 2026.',
    gameTitle: 'The 1988 Game',
    gameSub: 'A MS-DOS text game from 1988 &mdash; reborn as a browser game',
    gameCanvas: 'Sneekie game screen',
    dirLeft: 'Left',
    dirUp: 'Up',
    dirDown: 'Down',
    dirRight: 'Right',
    themeGreen: 'Green',
    themeAmber: 'Amber',
    themeWhite: 'White',
    themeCga: 'CGA',
    soundOn: 'Sound: on',
    soundOff: 'Sound: off',
    fullscreen: 'Fullscreen',
    gameHintKeys: 'Arrow keys steer the snake &middot; &lt;ESC&gt; = give up when stuck<br />F9 = extra life &middot; F10 = skip level &middot; any key continues',
    gameHintTouch: 'Swipe to steer &middot; tap = any key',
    yesKey: 'Y',
    noKey: 'N',
    liveTitle: 'One live bot &mdash; levels 26-32',
    liveLead:
      'One copy of the <em>real</em> 1988 game runs at a time. Pick a level tab to watch levels <strong>26-32</strong> &mdash; the self-moving late-game mazes where the snake grows roughly <strong>twice as long</strong> and every <span class="ico h">&hearts;</span> heart scatters a <span class="ico g">&clubs;</span> club into cleared ground. The bot paths to the nearest target, <strong>pushes <span class="ico t">&#9689;</span> stones</strong>, <strong>dodges <span class="ico a">&uarr;&larr;&rarr;</span> arrows</strong>, keeps a route home to its tail, and will <strong>eat a <span class="ico s">&#9786;</span> smiley</strong> to avoid boxing itself in. Clear a level and its screen <strong><span class="ico green">flashes green</span></strong> and advances; get stuck and it <strong><span class="ico r">flashes red</span></strong> and restarts.',
    botSpeed: 'Bot speed',
    liveTabsLabel: 'Live bot level',
    liveNote: "It's live, not a recording. Keep this tab in front &mdash; browsers throttle background tabs, which pauses the running game.",
    close: 'Close',
    layoutPreview: 'Layout preview',
    magazinePreview: 'Magazine page preview',
    openLarger: 'Open larger view: ',
    layoutPreviewFallback: 'layout preview',
    magazinePreviewFallback: 'Magazine page preview',
    sourceLoadError: 'Could not load SNEEKIE.BAS &mdash; ',
    vramHover: 'Hover a cell to read its bytes.',
    vramEmpty: 'empty',
    vramHeart: '&#9829; heart (+10)',
    vramClub: '&#9827; club (+25)',
    vramSmiley: '&#9786; smiley (-50)',
    vramStone: '&#9689; stone (push it)',
    vramArrowUp: '&#8593; arrow (enemy)',
    vramArrowDown: '&#8595; arrow (enemy)',
    vramArrowRight: '&#8594; arrow (enemy)',
    vramArrowLeft: '&#8592; arrow (enemy)',
    vramSnakeHead: 'snake head',
    vramSnakeBody: 'snake body',
    vramWall: 'wall',
    vramSpace: 'space',
    vramSteerLog: "Steer the snake &mdash; each move's peeks and pokes show up here.",
    vramEraseTail: 'erase tail',
    vramEatHeart: 'score += 10 &mdash; eat the heart',
    vramClubPops: 'a &#9827; club pops up where the heart sent it',
    vramEatClub: 'score += 25 &mdash; eat the club',
    vramEatSmiley: 'score -= 50 &mdash; ouch, a smiley!',
    vramBehindStone: ' (behind the stone)',
    vramShoveStone: 'shove the stone &#9689; along',
    vramStoneBlocked: '&#8594; blocked: stone has nowhere to go, stay put',
    vramBlocked: '&#8594; blocked: ',
    vramStayPut: ', stay put',
    vramOldHeadBody: 'old head &#8594; body',
    vramDrawHead: 'draw new head &#9608;',
    vramGrow: '  (grow)',
    vramAllHearts: '&#9733; all hearts collected!',
    vramMove: 'move ',
    vramCell: 'cell (col ',
    vramRow: ', row ',
    vramChar: 'char = ',
    vramAttr: 'attr = ',
    vramTourStop: '&#9632; Stop',
    vramTourStart: '&#9654; Tour'
  },
  nl: {
    brand: 'Sneekie start',
    primary: 'Hoofdnavigatie',
    skip: 'Spring naar inhoud',
    navGame: '\u25b6 Spelen',
    navManual: 'Handleiding',
    navLive: 'Live',
    navBot: 'Bot',
    navMagazine: 'Magazine',
    navMaking2: 'Making Off',
    navSource: 'Broncode',
    navExplained: 'Uitleg',
    navMigration: 'Migratie',
    navVram: 'Visualizer',
    navMakingOf1: 'The making off - 1',
    navMakingOf3: 'The making off - 3',
    download: 'Download',
    print: 'Print',
    language: 'Taal',
    langEn: 'English',
    langNl: 'Nederlands',
    footer:
      "Sneekie &copy; juli '88 door HerbySoft<br>" +
      'Gepubliceerd in MS(X)DOS Computer Magazine nr.&nbsp;25 (oktober 1988).<br>' +
      'Origineel: GW-BASIC, 80&times;25 tekstmodus, met POKE direct in het videogeheugen.<br>' +
      'Browserversie: juni 2026.',
    gameTitle: 'Het spel uit 1988',
    gameSub: 'Een MS-DOS tekstspel uit 1988 &mdash; herboren als browserspel',
    gameCanvas: 'Sneekie spelscherm',
    dirLeft: 'Links',
    dirUp: 'Omhoog',
    dirDown: 'Omlaag',
    dirRight: 'Rechts',
    themeGreen: 'Groen',
    themeAmber: 'Amber',
    themeWhite: 'Wit',
    themeCga: 'CGA',
    soundOn: 'Geluid: aan',
    soundOff: 'Geluid: uit',
    fullscreen: 'Volledig scherm',
    gameHintKeys: 'Pijltjestoetsen sturen de slang &middot; &lt;ESC&gt; = opgeven als je vastzit<br />F9 = extra leven &middot; F10 = level overslaan &middot; elke toets gaat verder',
    gameHintTouch: 'Veeg om te sturen &middot; tik = willekeurige toets',
    yesKey: 'J',
    noKey: 'N',
    liveTitle: 'Een livebot &mdash; levels 26-32',
    liveLead:
      'Er draait telkens een exemplaar van het <em>echte</em> spel uit 1988. Kies een leveltab om levels <strong>26-32</strong> te bekijken &mdash; de zelfbewegende eindlevels waar de slang ongeveer <strong>twee keer zo lang</strong> wordt en ieder <span class="ico h">&hearts;</span> hart een <span class="ico g">&clubs;</span> klaver in leeg terrein strooit. De bot loopt naar het dichtstbijzijnde doel, <strong>duwt <span class="ico t">&#9689;</span> stenen</strong>, <strong>ontwijkt <span class="ico a">&uarr;&larr;&rarr;</span> pijlen</strong>, houdt een route terug naar zijn staart vrij, en <strong>eet een <span class="ico s">&#9786;</span> smiley</strong> om zichzelf niet op te sluiten. Haalt hij een level, dan <strong><span class="ico green">flitst het scherm groen</span></strong> en gaat hij door; loopt hij vast, dan <strong><span class="ico r">flitst het scherm rood</span></strong> en start hij opnieuw.',
    botSpeed: 'Botsnelheid',
    liveTabsLabel: 'Livebot level',
    liveNote: 'Het is live, geen opname. Houd dit tabblad vooraan &mdash; browsers vertragen achtergrondtabs, waardoor het lopende spel pauzeert.',
    close: 'Sluiten',
    layoutPreview: 'Layoutvoorbeeld',
    magazinePreview: 'Tijdschriftpagina voorbeeld',
    openLarger: 'Open grotere weergave: ',
    layoutPreviewFallback: 'layoutvoorbeeld',
    magazinePreviewFallback: 'Tijdschriftpagina voorbeeld',
    sourceLoadError: 'Kan SNEEKIE.BAS niet laden &mdash; ',
    vramHover: 'Beweeg over een cel om de bytes te lezen.',
    vramEmpty: 'leeg',
    vramHeart: '&#9829; hart (+10)',
    vramClub: '&#9827; klaver (+25)',
    vramSmiley: '&#9786; smiley (-50)',
    vramStone: '&#9689; steen (duwbaar)',
    vramArrowUp: '&#8593; pijl (vijand)',
    vramArrowDown: '&#8595; pijl (vijand)',
    vramArrowRight: '&#8594; pijl (vijand)',
    vramArrowLeft: '&#8592; pijl (vijand)',
    vramSnakeHead: 'slangenkop',
    vramSnakeBody: 'slangenlijf',
    vramWall: 'muur',
    vramSpace: 'ruimte',
    vramSteerLog: 'Stuur de slang &mdash; de peeks en pokes van elke zet verschijnen hier.',
    vramEraseTail: 'staart wissen',
    vramEatHeart: 'score += 10 &mdash; eet het hart',
    vramClubPops: 'er verschijnt een &#9827; klaver waar het hart hem neerzet',
    vramEatClub: 'score += 25 &mdash; eet de klaver',
    vramEatSmiley: 'score -= 50 &mdash; au, een smiley!',
    vramBehindStone: ' (achter de steen)',
    vramShoveStone: 'duw de steen &#9689; door',
    vramStoneBlocked: '&#8594; geblokkeerd: de steen kan nergens heen, blijf staan',
    vramBlocked: '&#8594; geblokkeerd: ',
    vramStayPut: ', blijf staan',
    vramOldHeadBody: 'oude kop &#8594; lijf',
    vramDrawHead: 'teken nieuwe kop &#9608;',
    vramGrow: '  (groei)',
    vramAllHearts: '&#9733; alle harten verzameld!',
    vramMove: 'zet ',
    vramCell: 'cel (kolom ',
    vramRow: ', rij ',
    vramChar: 'teken = ',
    vramAttr: 'attribuut = ',
    vramTourStop: '&#9632; Stop',
    vramTourStart: '&#9654; Tour'
  }
};

function normalizeSiteLang(value){
  return String(value || '').toLowerCase().split('-')[0] === 'nl' ? 'nl' : 'en';
}

function querySiteLang(){
  try {
    const value = new URLSearchParams(location.search).get('lang');
    return value === 'nl' || value === 'en' ? value : null;
  } catch(_) {
    return null;
  }
}

let siteLang = querySiteLang() || normalizeSiteLang(lsGet('sneekie.lang') || navigator.language || 'en');

function siteLanguage(){ return siteLang; }

function siteText(key){
  const table = SITE_I18N[siteLang] || SITE_I18N.en;
  return table[key] || SITE_I18N.en[key] || key;
}

function applySiteTranslations(){
  document.documentElement.lang = siteLang;
  if(document.body) document.body.dataset.lang = siteLang;
  applyPageTemplate();
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
    const lang = btn.dataset.lang === 'nl' ? 'nl' : 'en';
    const key = lang === 'nl' ? 'langNl' : 'langEn';
    btn.setAttribute('aria-label', siteText(key));
    btn.setAttribute('title', siteText(key));
    btn.setAttribute('aria-pressed', String(lang === siteLang));
  });
}

function applyPageTemplate(){
  const main = document.querySelector('main[data-lang-template]');
  if(!main) return;
  if(siteLang === 'en') return;
  const tpl = document.getElementById('main-template-' + siteLang);
  if(!tpl || main.dataset.appliedLang === siteLang) return;
  main.innerHTML = tpl.innerHTML;
  main.dataset.appliedLang = siteLang;
  if(!main.id) main.id = 'main';
  if(!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
}

function reloadWithLanguage(lang){
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  location.href = url.href;
}

function setSiteLanguage(lang, options){
  const opts = options || {};
  const next = normalizeSiteLang(lang);
  siteLang = next;
  if(opts.persist !== false) lsSet('sneekie.lang', next);
  if(opts.silent !== true && document.querySelector('main[data-lang-template]')){
    reloadWithLanguage(next);
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

addEventListener('storage', event => {
  if(event.key === 'sneekie.lang' && event.newValue) setSiteLanguage(event.newValue, { silent: true, persist: false });
});

addEventListener('message', event => {
  const data = event.data || {};
  if(data.type === 'sneekie:language' && data.lang) setSiteLanguage(data.lang, { silent: true });
});

function inHtmlDir(){
  return location.pathname.split('/').includes('html');
}

function pageRoot(){
  return inHtmlDir() ? '../' : '';
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

function sitePageHref(slug){
  return useCleanUrls() ? slug : slug + '.html';
}

function currentPage(){
  const file = location.pathname.split('/').pop() || 'index.html';
  return file.replace(/\.html$/, '') || 'index';
}

function renderTopHeader(){
  if(document.querySelector('header.top')) return;
  const root = pageRoot();
  const current = currentPage();
  const embedded = isEmbedded();
  const links = [
    ['game', 'navGame'],
    ['manual', 'navManual'],
    ['live', 'navLive'],
    ['bot', 'navBot'],
    ['magazine', 'navMagazine'],
    ['making_of_2', 'navMaking2'],
    ['source', 'navSource'],
    ['explained', 'navExplained'],
    ['migration', 'navMigration'],
    ['vram', 'navVram'],
    ['making_of_1', 'navMakingOf1'],
    ['making_of_3', 'navMakingOf3'],
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

  const download = document.createElement('a');
  download.href = root + 'SNEEKIE.BAS';
  download.download = 'SNEEKIE.BAS';
  download.dataset.i18n = 'download';
  download.innerHTML = siteText('download');
  nav.appendChild(download);

  const print = document.createElement('button');
  print.type = 'button';
  print.id = 'print';
  print.dataset.i18n = 'print';
  print.innerHTML = siteText('print');
  nav.appendChild(print);

  header.appendChild(nav);

  const langSwitch = document.createElement('div');
  langSwitch.className = 'lang-switch';
  langSwitch.setAttribute('aria-label', siteText('language'));
  for(const lang of ['nl', 'en']){
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.lang = lang;
    button.innerHTML = '<span class="lang-icon">' + lang.toUpperCase() + '</span>';
    button.addEventListener('click', () => setSiteLanguage(lang));
    langSwitch.appendChild(button);
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

function setupPrintButton(){
  const btn = document.getElementById('print');
  if(!btn) return;
  const isSource = currentPage() === 'source';
  btn.addEventListener('click', () => {
    if(isSource) window.print();
    else siteNavigate(sitePageHref('source') + '?print');
  });
  if(isSource && location.search.indexOf('print') > -1) setTimeout(() => window.print(), 120);
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

renderTopHeader();
renderPageFooter();
setSiteLanguage(siteLang, { silent: true });
setupPrintButton();
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
