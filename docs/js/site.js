/* site.js — shared page chrome/helpers plus the GW-BASIC syntax tokenizer used by
   source.html and explained.html. The tokenizer returns [class, text] tokens
   per physical line; classes: ws ln com str num kw fn op id pn. migration.html
   keeps its own reduced tokenizer because it also tokenizes JavaScript. */
'use strict';

/* ---------- shared page helpers ---------- */
function lsGet(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } }
function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(_){ } }

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
    ['game', '\u25b6 Play'],
    ['manual', 'Manual'],
    ['live', 'Live'],
    ['bot', 'Bot'],
    ['magazine', 'Magazine'],
    ['source', 'Source'],
    ['explained', 'Explained'],
    ['migration', 'Migration'],
    ['vram', 'Visualizer'],
  ];
  const header = document.createElement('header');
  header.className = 'top';

  const brand = document.createElement('a');
  brand.className = 'brand';
  brand.href = sitePageHref('game');
  if(embedded) brand.target = '_top';
  brand.setAttribute('aria-label', 'Sneekie home');
  const logo = document.createElement('img');
  logo.src = root + 'images/logo.png';
  logo.alt = 'Sneekie';
  brand.appendChild(logo);
  header.appendChild(brand);

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Primary');
  for(const [slug, label] of links){
    const a = document.createElement('a');
    a.href = sitePageHref(slug);
    a.textContent = label;
    if(embedded) a.target = '_top';
    if(slug === current) a.setAttribute('aria-current', 'page');
    nav.appendChild(a);
  }

  const download = document.createElement('a');
  download.href = root + 'SNEEKIE.BAS';
  download.download = 'SNEEKIE.BAS';
  download.textContent = 'Download';
  nav.appendChild(download);

  const print = document.createElement('button');
  print.type = 'button';
  print.id = 'print';
  print.textContent = 'Print';
  nav.appendChild(print);

  header.appendChild(nav);
  document.body.insertBefore(header, document.body.firstChild);
  requestAnimationFrame(() => {
    const active = nav.querySelector('[aria-current="page"]');
    if(active && nav.scrollWidth > nav.clientWidth) active.scrollIntoView({inline:'center', block:'nearest'});
  });

  // skip-to-content link, inserted as the first focusable element on the page
  const skip = document.createElement('a');
  skip.className = 'skip';
  skip.href = '#main';
  skip.textContent = 'Skip to content';
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
  footer.innerHTML =
    "Sneekie &copy; July '88 by HerbySoft<br>" +
    'Published in MS(X)DOS Computer Magazine no.&nbsp;25 (October 1988).<br>' +
    'Original: GW-BASIC, 80&times;25 text mode, POKEs straight into video memory.<br>' +
    'Browser version: June 2026.';
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
