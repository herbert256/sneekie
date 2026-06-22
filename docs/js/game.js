'use strict';
/* ============================================================
   SNEEKIE — (c) July '88 by HerbySoft
   Faithful JS port of the GW-BASIC original (SNEEKIE.BAS,
   recovered by OCR from the magazine listing). BASIC line numbers in comments.
   ============================================================ */

/* surface any runtime error on the page instead of failing silently.
   window.onerror also fires for throws inside the requestAnimationFrame render
   loop, so a persistent render error would fire every frame -- reuse one banner
   and de-dupe identical messages so a single fault can't flood the DOM. */
let errorBanner = null;
const seenErrors = new Set();
function showError(text){
  if(seenErrors.has(text) || !document.body) return;
  seenErrors.add(text);
  if(!errorBanner){
    errorBanner = document.createElement('div');
    errorBanner.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99;'+
      'background:#3a0d0d;color:#ffb3b3;border:1px solid #a33;border-radius:4px;'+
      'padding:8px 14px;font:12px/1.5 monospace;max-width:90vw;';
    document.body.appendChild(errorBanner);
  }
  const line = document.createElement('div');
  line.textContent = text;
  errorBanner.appendChild(line);
}
window.onerror = (msg, src, line, col) => showError('Error: ' + msg + ' (line ' + line + ':' + col + ')');
/* The whole game runs as a Promise chain (bootSequence -> program), so a real
   throw surfaces as an unhandled rejection, which window.onerror never sees.
   Catch those too, or the on-page banner stays blank while the game freezes. */
window.addEventListener('unhandledrejection', e => {
  const r = e.reason;
  showError('Error: ' + ((r && (r.message || r)) || 'unhandled rejection'));
});

/* ---------- FONT: IBM VGA 8x16 CP437 ROM font (4096 bytes) ---------- */
const FONT = Uint8Array.from(atob('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AAB4zMzM2MzGxsbMAAAAAAAA/sbGwMDAwMDAwAAAAAAAAAAA/mxsbGxsbGwAAAAAAAAA/sZgMBgwYMb+AAAAAAAAAAAAftjY2NjYcAAAAAAAAAAAZmZmZmZ8YGDAAAAAAAAAAHbcGBgYGBgYAAAAAAAAAH4YPGZmZjwYfgAAAAAAAAA4bMbG/sbGbDgAAAAAAAA4bMbGxmxsbGzuAAAAAAAAHjAYDD5mZmZmPAAAAAAAAAAAAH7b29t+AAAAAAAAAAAAAwZ+29vzfmDAAAAAAAAAHDBgYHxgYGAwHAAAAAAAAAB8xsbGxsbGxsYAAAAAAAAAAP4AAP4AAP4AAAAAAAAAAAAYGH4YGAAA/wAAAAAAAAAwGAwGDBgwAH4AAAAAAAAADBgwYDAYDAB+AAAAAAAADhsbGBgYGBgYGBgYGBgYGBgYGBgYGNjY2HAAAAAAAAAAABgYAH4AGBgAAAAAAAAAAAAAdtwAdtwAAAAAAAAAOGxsOAAAAAAAAAAAAAAAAAAAAAAAABgYAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAADwwMDAwM7GxsPBwAAAAAANhsbGxsbAAAAAAAAAAAAABw2DBgyPgAAAAAAAAAAAAAAAAAfHx8fHx8fAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='), c => c.charCodeAt(0));

/* ---------- THEMES ---------- */
const THEMES = {
  hercules:{ dim:[ 46,168, 46], bright:[125,255,125], css:'#7dff7d', glow:'rgba(125,255,125,.14)', meta:'#051005' },
  amber:   { dim:[191,121,  0], bright:[255,196, 56], css:'#ffc438', glow:'rgba(255,196,56,.13)', meta:'#140c00'  },
  white:   { dim:[168,176,180], bright:[255,255,255], css:'#e8eef0', glow:'rgba(232,238,240,.12)', meta:'#0a0c0d' },
  cga:     { cga:true, dim:[170,170,170], bright:[255,255,255], css:'#55ffff', glow:'rgba(85,255,255,.12)', meta:'#001010' },
};

const GAME_TEXT = {
  en: {
    titleLine: "**** Sneekie ****         (c) July '88 by HerbySoft",
    scoreLine: '10 points      -50 points    Highscore',
    levelScore: 'Level       Score',
    itemLine: '25 points      Stone         <ESC> when stuck',
    livesBonus: 'Lives       Bonus',
    level: 'Level ',
    pressAny: 'Press any key',
    end: 'The End',
    stuck: 'Stuck !!!',
    playAgain: 'Any key to start again',
    yesInput: 'y',
    soundOn: 'Sound: on',
    soundOff: 'Sound: off'
  },
  nl: {
    titleLine: "**** Sneekie ****         (c) juli '88 door HerbySoft",
    scoreLine: '10 punten      -50 punten    Highscore',
    levelScore: 'Level       Score',
    itemLine: '25 punten      Steen         <ESC> als vast',
    livesBonus: 'Levens      Bonus',
    level: 'Level ',
    pressAny: 'Druk op een toets',
    end: 'Einde',
    stuck: 'Vast !!!',
    playAgain: 'Toets om opnieuw',
    yesInput: 'j',
    soundOn: 'Geluid: aan',
    soundOff: 'Geluid: uit'
  }
};

function gameLang(){
  return window.SNEEKIE_LANG || document.documentElement.lang || 'en';
}
function gt(key){
  const lang = gameLang() === 'nl' ? 'nl' : 'en';
  return (GAME_TEXT[lang] && GAME_TEXT[lang][key]) || GAME_TEXT.en[key] || key;
}

/* CGA 16-color palette entries used by the colorized theme */
const CGA_RGB = {
  2:[0,170,0], 3:[0,170,170], 6:[170,85,0], 7:[170,170,170], 10:[85,255,85],
  12:[255,85,85], 13:[255,85,255], 14:[255,255,85], 15:[255,255,255],
};
/* What the 1988 game COULD have poked into the attribute bytes:
   color per character class, brightness still follows the real attr byte. */
function cgaColor(ch, at){
  if(ch === 3)  return 12;                                  // ♥ heart: light red
  if(ch === 5)  return 10;                                  // ♣ club: light green
  if(ch === 1)  return 14;                                  // ☺ smiley: yellow
  if(ch === 10) return 6;                                   // ◙ stone: brown
  if(ch === 24 || ch === 26 || ch === 27) return 13;        // arrows: light magenta
  if(ch === 219 || ch === 186 || ch === 205 || ch === 187 ||
     ch === 188 || ch === 200 || ch === 201)
    return (at & 8) ? 10 : 2;                               // snake: light green / green
  if(ch >= 179 && ch <= 218) return 3;                      // walls: cyan
  return (at & 8) ? 15 : 7;                                 // text: white / light gray
}
const PLAYABLE_THEMES = new Set(['hercules', 'amber', 'cga']);
function playableThemeName(name){
  return PLAYABLE_THEMES.has(name) ? name : 'cga';
}
const forceTheme = PLAYABLE_THEMES.has(window.SNEEKIE_FORCE_THEME) ? window.SNEEKIE_FORCE_THEME : null;
const previewMode = window.SNEEKIE_PREVIEW_MODE === true;
const passivePreview = window.SNEEKIE_PASSIVE_PREVIEW === true;
let themeName = forceTheme || playableThemeName(lsGet('sneekie.theme'));
let theme = THEMES[themeName] || THEMES.cga;

/* ---------- VIDEO: 80x25 text VRAM, identical to B000/B800 layout ----------
   offset = (row-1)*160 + (col-1)*2 ; even byte = CP437 char, odd byte = attr.
   Only attrs 7 (normal) and 15 (bright) occur, exactly like the original. */
const vram = new Uint8Array(4000);
const dirty = new Set();
const cv = document.getElementById('screen');
const tube = document.getElementById('tube');
const ctx = cv.getContext('2d');
let atlasDim, atlasBright;
const cgaAtlas = {};
let bootActive = true, bootWaiting = false, bootStarted = false, bootSkip = false;
let bootStartResolve = null, bootAutoStart = null;
const BOOT_AUTOSTART_MS = 2000;   // boot starts on its own this long after the BIOS screen appears
document.body.classList.add('booting');     // hides the fullscreen touch controls until boot finishes

/* boot-time blinking hardware text cursor (the original game has none) */
let cursorVisible = false, cursorBlink = false, cursorPrevIdx = -1, cursorTimer = null;
function cursorCell(){
  const i = (curR-1)*80 + (curC-1);
  return (i >= 0 && i < 2000) ? i : -1;
}
function cursorRGB(){ return theme.cga ? [255,255,255] : theme.bright; }
function startCursor(){
  if(cursorTimer) return;
  cursorVisible = true; cursorBlink = true; cursorPrevIdx = cursorCell();
  if(cursorPrevIdx >= 0) dirty.add(cursorPrevIdx);
  cursorTimer = setInterval(() => {
    cursorBlink = !cursorBlink;
    const idx = cursorCell();
    if(cursorPrevIdx >= 0 && cursorPrevIdx !== idx) dirty.add(cursorPrevIdx);
    if(idx >= 0) dirty.add(idx);
    cursorPrevIdx = idx;
  }, 260);
}
function stopCursor(){
  if(cursorTimer){ clearInterval(cursorTimer); cursorTimer = null; }
  cursorVisible = false;
  if(cursorPrevIdx >= 0) dirty.add(cursorPrevIdx);
  cursorPrevIdx = -1;
}

function buildAtlas(rgb){
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const img = x.createImageData(256, 128);
  const [r,g,b] = rgb;
  for(let ch = 0; ch < 256; ch++){
    const gx = (ch & 31) * 8, gy = (ch >> 5) * 16;
    for(let row = 0; row < 16; row++){
      const bits = FONT[ch*16 + row];
      for(let col = 0; col < 8; col++){
        if(bits & (0x80 >> col)){
          const p = ((gy+row)*256 + gx+col) * 4;
          img.data[p] = r; img.data[p+1] = g; img.data[p+2] = b; img.data[p+3] = 255;
        }
      }
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

function poke(off, v){
  if(off >= 0 && off < 4000 && vram[off] !== v){
    vram[off] = v;
    dirty.add(off >> 1);
  }
}
function peek(off){ return (off >= 0 && off < 4000) ? vram[off] : 0; }

function drawCell(i){
  const ch = vram[i*2], at = vram[i*2+1];
  const dx = (i % 80) * 8, dy = (i / 80 | 0) * 16;
  ctx.fillStyle = '#000';
  ctx.fillRect(dx, dy, 8, 16);
  const atlas = theme.cga ? cgaAtlas[cgaColor(ch, at)] : ((at & 8) ? atlasBright : atlasDim);
  ctx.drawImage(atlas, (ch & 31)*8, (ch >> 5)*16, 8, 16, dx, dy, 8, 16);
  if(cursorVisible && cursorBlink && i === cursorCell()){
    const [r,g,b] = cursorRGB();
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(dx, dy + 13, 8, 3);          // underline cursor (cell scanlines 13-15)
  }
}
function repaintAll(){ for(let i = 0; i < 2000; i++) dirty.add(i); }
(function frame(){
  if(dirty.size){ for(const i of dirty) drawCell(i); dirty.clear(); }
  requestAnimationFrame(frame);
})();

/* cursor + GW-BASIC style output helpers */
let curR = 1, curC = 1;
function locate(r, c){ curR = r; curC = c; }
function wch(code){
  const off = (curR-1)*160 + (curC-1)*2;
  poke(off, code); poke(off+1, 7);
  curC++;
}
function ps(s){ for(let i = 0; i < s.length; i++){ const c = s.charCodeAt(i); wch(c < 128 ? c : 63); } }
function pc(code){ wch(code); }
function pcn(code, n){ for(let i = 0; i < n; i++) wch(code); }
function sp(n){ pcn(32, n); }
function pu(w, n){ let s = String(Math.trunc(n)); if(s.length < w) s = s.padStart(w); ps(s); } // PRINT USING "#..#"
function cls(){ for(let i = 0; i < 4000; i += 2){ vram[i] = 32; vram[i+1] = 7; } repaintAll(); locate(1,1); }

function pca(code, at){
  const off = (curR-1)*160 + (curC-1)*2;
  poke(off, code); poke(off+1, at);
  curC++;
  if(curC > 80){ curC = 1; curR = Math.min(24, curR + 1); }
}
function psa(s, at=7){
  for(let i = 0; i < s.length; i++){
    const c = s.charCodeAt(i);
    pca(c < 128 ? c : 63, at);
  }
}
function bootLine(s='', at=7){ psa(s, at); curR = Math.min(24, curR + 1); curC = 1; }
function bootCenter(row, s, at=7){
  locate(row, Math.max(1, Math.floor((80 - s.length) / 2) + 1));
  psa(s, at);
}

/* ---------- INPUT: BIOS keyboard buffer / INKEY$ semantics ---------- */
const kbuf = [];
let kwaiter = null;
function pushKey(s){
  if(kbuf.length >= 15) return;             // BIOS buffer full
  kbuf.push(s);
  if(kwaiter){ const w = kwaiter; kwaiter = null; w(); }
}
function clearKbd(){ kbuf.length = 0; }     // 400/1110: POKE 1050,PEEK(1052)
function keyOrTimeout(ms){                   // 430-460: INKEY$ poll with Z timeout
  return new Promise(res => {
    if(kbuf.length){ res(kbuf.shift()); return; }
    let to = null;
    if(ms !== Infinity) to = setTimeout(() => { kwaiter = null; res(''); }, ms);
    kwaiter = () => { if(to) clearTimeout(to); res(kbuf.shift()); };
  });
}
function waitKey(){ return keyOrTimeout(Infinity); }   // INPUT$(1)

let clickTarget = null;
let clickStartsLevel = false;
const CLICK_ROUTE_MS = 120;

window.sneekieWaitingForKey = () => clickStartsLevel;

function clearClickTarget(){ clickTarget = null; }
function cellOffset(row, col){ return (row - 1) * 160 + (col - 1) * 2; }
function cellFromOffset(off){
  const i = off >> 1;
  return { row: (i / 80 | 0) + 1, col: (i % 80) + 1 };
}
function eventCell(e){
  const r = cv.getBoundingClientRect();
  const x = Math.max(0, Math.min(cv.width - 1, (e.clientX - r.left) * cv.width / r.width));
  const y = Math.max(0, Math.min(cv.height - 1, (e.clientY - r.top) * cv.height / r.height));
  return {
    row: Math.max(4, Math.min(20, (y / 16 | 0) + 1)),
    col: Math.max(2, Math.min(79, (x / 8 | 0) + 1)),
  };
}
function setClickTarget(e){
  const c = eventCell(e);
  clickTarget = { row: c.row, col: c.col, off: cellOffset(c.row, c.col) };
}
function routePassable(idx){
  const ch = peek(idx * 2);
  return (ch === 32 || ch === 3 || ch === 5) && !routeArrowNextUnsafe(idx);
}
function routeArrowNextUnsafe(idx){
  const row = (idx / 80 | 0) + 1;
  const col = (idx % 80) + 1;
  const mode = (LEVEL - 1) % 16;
  if(mode === 5){
    if(col < 2 || col > 78 || col % 2 !== 0) return false;
    return row === (D[col][1] === 4 ? 20 : D[col][1] - 1);
  }
  if(mode === 6){
    if(row < 4 || row > 20) return false;
    const rightNext = D[row][1] === 79 ? 2 : D[row][1] + 1;
    const leftNext = D[row + 20][1] === 2 ? 79 : D[row + 20][1] - 1;
    return col === rightNext || col === leftNext;
  }
  return false;
}
function moveOffsetFromCode(off, code){
  if(code === 80) return off + 160;
  if(code === 72) return off - 160;
  if(code === 77) return off + 2;
  if(code === 75) return off - 2;
  return off;
}
function isSafeMove(code){
  const A = moveOffsetFromCode(T[BTEL], code);
  if(routeArrowNextUnsafe(A >> 1)) return false;
  const d = peek(A);
  if(d === 32 || d === 5 || d === 3 || d === 1) return true;
  if(d !== 10) return false;
  const TA = moveOffsetFromCode(A, code);
  return peek(TA) === 32;
}
function isSnakeStuck(){
  if(BTEL <= 0) return false;
  return ![72, 77, 80, 75].some(isSafeMove);
}
function nextClickTargetKey(){
  if(!clickTarget || BTEL <= 0) return null;
  const start = T[BTEL] >> 1;
  const target = clickTarget.off >> 1;
  if(start === target){ clearClickTarget(); return null; }

  const startCell = cellFromOffset(start * 2);
  const targetCell = cellFromOffset(clickTarget.off);
  const seen = new Uint8Array(2000);
  const first = new Int16Array(2000);
  const q = new Int16Array(2000);
  const dirs = [
    { dr:-1, dc: 0, code:72, key:'\0H' },
    { dr: 0, dc: 1, code:77, key:'\0M' },
    { dr: 1, dc: 0, code:80, key:'\0P' },
    { dr: 0, dc:-1, code:75, key:'\0K' },
  ];
  let head = 0, tail = 0, best = start;
  let bestDist = Math.abs(startCell.row - targetCell.row) + Math.abs(startCell.col - targetCell.col);
  seen[start] = 1; q[tail++] = start;

  while(head < tail){
    const idx = q[head++];
    const row = (idx / 80 | 0) + 1;
    const col = (idx % 80) + 1;
    const dist = Math.abs(row - targetCell.row) + Math.abs(col - targetCell.col);
    if(idx !== start && dist < bestDist){ best = idx; bestDist = dist; }
    if(idx === target) break;

    for(const d of dirs){
      const nr = row + d.dr, nc = col + d.dc;
      if(nr < 4 || nr > 20 || nc < 2 || nc > 79) continue;
      const ni = (nr - 1) * 80 + (nc - 1);
      if(seen[ni] || !routePassable(ni)) continue;
      seen[ni] = 1;
      first[ni] = idx === start ? d.code : first[idx];
      q[tail++] = ni;
    }
  }

  const routeEnd = seen[target] ? target : best;
  if(routeEnd === start || first[routeEnd] === 0){ clearClickTarget(); return null; }
  return dirs.find(d => d.code === first[routeEnd]).key;
}
function aimAtEventCell(e){
  if(clickStartsLevel){
    clearClickTarget();
    pushKey('\r');
    return;
  }
  setClickTarget(e);
  const key = nextClickTargetKey();
  if(key) pushKey(key);
}

const fsHelp = document.getElementById('fs-help');
const fsHelpTitle = document.getElementById('fs-help-title');
const fsHelpLead = document.getElementById('fs-help-lead');
const fsHelpList = document.getElementById('fs-help-list');
const fsHelpPlay = document.getElementById('fs-help-play');
let fsHelpOpen = false;

function fillFullscreenHelp(){
  const touch = matchMedia('(pointer:coarse)').matches;
  const leadKey = touch ? 'fsHelpLeadTouch' : 'fsHelpLeadMouse';
  const itemKeys = touch
    ? ['fsHelpTouchMove', 'fsHelpTouchTarget', 'fsHelpTouchButtons', 'fsHelpTouchExit']
    : ['fsHelpMouseMove', 'fsHelpMouseTarget', 'fsHelpMouseGiveUp', 'fsHelpMouseCheats'];
  fsHelpTitle.textContent = gameUiText('fsHelpTitle');
  fsHelpLead.textContent = gameUiText(leadKey);
  fsHelpPlay.textContent = gameUiText('fsHelpPlay');
  fsHelpList.replaceChildren(...itemKeys.map(key => {
    const li = document.createElement('li');
    li.textContent = gameUiText(key);
    return li;
  }));
}

function showFullscreenHelp(){
  if(!fsHelp) return;
  fillFullscreenHelp();
  fsHelp.hidden = false;
  fsHelp.setAttribute('aria-hidden', 'false');
  fsHelpOpen = true;
  fsHelpPlay.focus({ preventScroll:true });
}

function hideFullscreenHelp(){
  if(!fsHelp) return;
  fsHelpOpen = false;
  fsHelp.setAttribute('aria-hidden', 'true');
  fsHelp.hidden = true;
}

if(fsHelp){
  fsHelp.addEventListener('pointerdown', e => e.stopPropagation());
  fsHelp.addEventListener('touchstart', e => e.stopPropagation(), { passive:true });
  fsHelp.addEventListener('click', e => e.stopPropagation());
  fsHelpPlay.addEventListener('click', e => {
    ensureAudio();
    hideFullscreenHelp();
    e.preventDefault();
  });
}

if(!passivePreview){
  addEventListener('keydown', e => {
    if(fsHelpOpen){
      if(e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') hideFullscreenHelp();
      if(e.key !== 'Tab') e.preventDefault();
      return;
    }
    if(bootActive){
      ensureAudio();
      if(bootWaiting) startBootFromGesture();
      else if(bootStarted) bootSkip = true;
      if(e.key.startsWith('Arrow') || e.key === 'F9' || e.key === 'F10' || e.key === ' ' || e.key === 'Escape' || e.key === 'Enter') e.preventDefault();
      return;
    }
    ensureAudio();
    let s = null;
    switch(e.key){
      case 'ArrowUp':    s = '\0H'; break;   // scan 72
      case 'ArrowDown':  s = '\0P'; break;   // scan 80
      case 'ArrowLeft':  s = '\0K'; break;   // scan 75
      case 'ArrowRight': s = '\0M'; break;   // scan 77
      case 'F9':         s = '\0C'; break;   // scan 67 (extra life — shh!)
      case 'F10':        s = '\0D'; break;   // scan 68 (skip level — shh!)
      case 'Escape':     s = '\x1b'; break;
      case 'Enter':      s = '\r'; break;
      default: if(e.key.length === 1) s = e.key;
    }
    if(s !== null){
      clearClickTarget();
      if(e.key.startsWith('Arrow') || e.key === 'F9' || e.key === 'F10' || e.key === ' ' || e.key === 'Escape' || e.key === 'Enter') e.preventDefault();
      pushKey(s);
    }
  });
}

/* touch: swipe = direction, tap/click = route target */
let tStart = null;
if(!passivePreview){
  cv.addEventListener('touchstart', e => {
    if(bootActive){
      ensureAudio();
      if(bootWaiting) startBootFromGesture();
      else if(bootStarted) bootSkip = true;
      e.preventDefault();
      return;
    }
    ensureAudio(); const t = e.changedTouches[0]; tStart = {x:t.clientX, y:t.clientY}; e.preventDefault();
  }, {passive:false});
  cv.addEventListener('touchend', e => {
    if(bootActive){ e.preventDefault(); return; }
    if(!tStart) return;
    const t = e.changedTouches[0], dx = t.clientX - tStart.x, dy = t.clientY - tStart.y;
    tStart = null;
    if(Math.hypot(dx, dy) < 24){ aimAtEventCell(t); }
    else {
      clearClickTarget();
      if(Math.abs(dx) > Math.abs(dy)) pushKey(dx > 0 ? '\0M' : '\0K');
      else pushKey(dy > 0 ? '\0P' : '\0H');
    }
    e.preventDefault();
  }, {passive:false});
  cv.addEventListener('pointerdown', e => {
    if(e.pointerType === 'touch') return;
    ensureAudio();
    if(bootActive){
      if(bootWaiting) startBootFromGesture();
      else if(bootStarted) bootSkip = true;
    } else if(e.button === 0) {
      aimAtEventCell(e);
    }
    e.preventDefault();
  });
}

/* on-screen button -> the same INKEY$ strings the keyboard produces */
const TOUCHKEYS = {
  up:'\0H', down:'\0P', left:'\0K', right:'\0M',
  f9:'\0C', f10:'\0D',                                      // F9/F10 = extra life / skip level
};
if(!passivePreview){
  document.querySelectorAll('#fstouch button').forEach(b => {
    b.addEventListener('click', () => {
      if(bootActive){
        ensureAudio();
        if(bootWaiting) startBootFromGesture();
        else if(bootStarted) bootSkip = true;
        return;
      }
      ensureAudio();
      const k = b.dataset.key;
      const value = TOUCHKEYS[k] || k;
      clearClickTarget();
      pushKey(typeof value === 'function' ? value() : value);
    });
  });
}

/* ---------- AUDIO: GW-BASIC SOUND f,d (d in 1/18.2s clock ticks) ---------- */
let actx = null, qEnd = 0;
let muted = window.SNEEKIE_MUTED === true;
try { localStorage.removeItem('sneekie.muted'); } catch(_) {}
function ensureAudio(){
  if(!actx){
    try{ actx = new (window.AudioContext || window.webkitAudioContext)(); }catch(_){ }
  }
  if(actx && actx.state === 'suspended') actx.resume()?.catch(() => {});
}
function sound(freq, ticks){
  if(!actx || actx.state !== 'running') return;   // suspended clock is frozen: don't queue into it
  const dur = ticks / 18.2;
  const t0 = Math.max(actx.currentTime, qEnd);
  if(t0 - actx.currentTime > 3) return;     // cap the backlog
  if(!muted){
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square'; o.frequency.value = Math.min(freq, 12000);
    const v = 0.05;
    g.gain.setValueAtTime(v, t0);
    g.gain.setValueAtTime(v, Math.max(t0, t0 + dur - 0.004));
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  qEnd = t0 + dur;
}
async function playDrained(){               // 540: IF PLAY(0)<>0 GOTO 540
  if(!actx) return;
  // A suspended AudioContext freezes currentTime, so `qEnd > currentTime` would
  // stay true forever and hang deathSeq() before it unwinds the snake. Only wait
  // while the clock is actually running, and cap the wait at the max backlog so
  // a stalled clock can never spin us forever.
  const deadline = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 3500;
  while(actx.state === 'running' && qEnd > actx.currentTime){
    if((typeof performance !== 'undefined' ? performance.now() : Date.now()) > deadline) break;
    await sleep(25);
  }
}

/* ---------- helpers ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raf = () => new Promise(r => requestAnimationFrame(r));
const rnd = Math.random;
const DEATH = {sneekie:'crashed'};          // RETURN 510
const STUCK = {sneekie:'stuck'};
const STUCK_FLASH_COUNT = 4;
const STUCK_FLASH_MS = 250;
async function flashStuckScreen(){
  for(let I = 1; I <= STUCK_FLASH_COUNT; I++){
    tube.classList.add('stuck-red');
    await sleep(STUCK_FLASH_MS);
    tube.classList.remove('stuck-red');
    if(I < STUCK_FLASH_COUNT) await sleep(STUCK_FLASH_MS);
  }
}

/* ---------- BOOT SHOW: compressed PC DOS + GW-BASIC startup, before line 80 ---------- */
const BOOT_TIME_SCALE = 2.15;

function startBootFromGesture(){
  if(!bootWaiting || bootStarted) return;
  bootWaiting = false;
  bootStarted = true;
  if(bootAutoStart){ clearTimeout(bootAutoStart); bootAutoStart = null; }
  if(bootStartResolve){ const r = bootStartResolve; bootStartResolve = null; r(); }
}
function shouldSkipBoot(){
  return new URLSearchParams(location.search).has('noboot') ||
    window.SNEEKIE_SKIPBOOT === true ||                          // the bot page hosts the game and skips straight to play
    (typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches);  // honor reduced-motion: skip the JS-timed boot show
}
function bootSleep(ms){
  return new Promise(resolve => {
    const end = performance.now() + ms * BOOT_TIME_SCALE;
    function tick(){
      if(bootSkip || performance.now() >= end){ resolve(); return; }
      setTimeout(tick, Math.min(35, end - performance.now()));
    }
    tick();
  });
}
function bootFlick(){                          // retrigger the screen mode-switch flicker
  cv.classList.remove('flick');
  void cv.offsetWidth;
  cv.classList.add('flick');
}
async function bootCls(){                       // clear screen with a CRT mode-switch blackout
  bootFlick();
  await bootSleep(70);
  cls();
}
function bootClick(freq=95, dur=0.022, gain=0.04){
  if(!actx || muted) return;
  const t = actx.currentTime + 0.002;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.01);
}
/* the one short PC-speaker beep that signals POST passed (AT BIOS ~0.18s) */
function bootBeep(freq=900, dur=0.18, gain=0.07){
  if(!actx || muted) return;
  const t = actx.currentTime + 0.002;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.setValueAtTime(gain, t + dur - 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
let bootSeekNoise = null;
function bootNoiseBuffer(){
  const rate = actx.sampleRate;
  const length = Math.floor(rate * 0.09);
  const b = actx.createBuffer(1, length, rate);
  const d = b.getChannelData(0);
  let last = 0;
  for(let i = 0; i < length; i++){
    last = last * 0.72 + (rnd() * 2 - 1) * 0.28;
    d[i] = last * (1 - i / length);
  }
  return b;
}
function bootDiskMotor(ms=300){
  if(!actx || muted) return;
  const t = actx.currentTime + 0.002;
  const dur = Math.max(0.08, ms * BOOT_TIME_SCALE / 1000);
  const out = actx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(0.012, t + 0.035);
  out.gain.setValueAtTime(0.012, Math.max(t + 0.036, t + dur - 0.08));
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  out.connect(actx.destination);
  for(const [type, freq, level] of [
    ['triangle', 82 + rnd() * 9, 1],
    ['sine', 166 + rnd() * 14, 0.42],
    ['sine', 246 + rnd() * 18, 0.24],
  ]){
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.linearRampToValueAtTime(freq * (0.985 + rnd() * 0.035), t + dur);
    g.gain.value = level;
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.01);
  }
}
function bootDiskStep(force=1){
  if(!actx || muted) return;
  const t = actx.currentTime + 0.002;

  const thud = actx.createOscillator(), tg = actx.createGain();
  thud.type = 'square';
  thud.frequency.setValueAtTime(58 + rnd() * 58, t);
  thud.frequency.exponentialRampToValueAtTime(34 + rnd() * 24, t + 0.045);
  tg.gain.setValueAtTime(0.028 * force, t);
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  thud.connect(tg); tg.connect(actx.destination);
  thud.start(t); thud.stop(t + 0.055);

  if(!bootSeekNoise) bootSeekNoise = bootNoiseBuffer();
  const src = actx.createBufferSource(), bp = actx.createBiquadFilter(), ng = actx.createGain();
  src.buffer = bootSeekNoise;
  src.playbackRate.value = 0.65 + rnd() * 0.95;
  bp.type = 'bandpass';
  bp.frequency.value = 620 + rnd() * 1550;
  bp.Q.value = 4 + rnd() * 6;
  ng.gain.setValueAtTime(0.018 * force, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
  src.connect(bp); bp.connect(ng); ng.connect(actx.destination);
  src.start(t); src.stop(t + 0.085);

  if(rnd() > 0.38){
    const chirp = actx.createOscillator(), cg = actx.createGain();
    chirp.type = 'triangle';
    chirp.frequency.setValueAtTime(420 + rnd() * 700, t);
    chirp.frequency.exponentialRampToValueAtTime(180 + rnd() * 210, t + 0.038);
    cg.gain.setValueAtTime(0.0075 * force, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.038);
    chirp.connect(cg); cg.connect(actx.destination);
    chirp.start(t); chirp.stop(t + 0.046);
  }
}
async function bootDiskBurst(ms=300){
  bootDiskMotor(ms);
  const end = performance.now() + ms * BOOT_TIME_SCALE;
  while(!bootSkip && performance.now() < end){
    const steps = 1 + (rnd() * 4 | 0);
    for(let i = 0; i < steps && !bootSkip; i++){
      bootDiskStep(0.72 + rnd() * 0.75);
      if(rnd() > 0.68) bootDiskStep(0.38 + rnd() * 0.35);
      await bootSleep(7 + rnd() * 14);
    }
    await bootSleep(rnd() > 0.74 ? 64 + rnd() * 120 : 18 + rnd() * 48);
  }
}
async function bootType(s, at=15, lo=16, hi=34){
  for(let i = 0; i < s.length; i++){
    if(bootSkip){ psa(s.slice(i), at); break; }
    psa(s[i], at);
    if(s[i] !== ' ') bootClick(1450 + rnd()*700, 0.006, 0.012);
    await bootSleep(lo + rnd()*(hi-lo));
  }
}
async function bootTypeLine(s, at=15, lo=16, hi=34){
  await bootType(s, at, lo, hi);
  curR = Math.min(24, curR + 1);
  curC = 1;
}
function bootBiosLogo(top=3){
  const left = 25, inner = 30;
  const center = text => {
    const pad = Math.max(0, inner - text.length);
    return ' '.repeat(Math.floor(pad / 2)) + text + ' '.repeat(Math.ceil(pad / 2));
  };
  const row = (r, text, at) => {
    locate(r, left); pc(186); psa(center(text), at); pc(186);
  };
  locate(top, left); pc(201); pcn(205, inner); pc(187);
  row(top + 1, 'Acme Corporation', 15);
  row(top + 2, 'Turbo BIOS 1.88', 7);
  row(top + 3, 'PC/XT Compatible', 7);
  locate(top + 4, left); pc(200); pcn(205, inner); pc(188);
}
/* the system-configuration summary clones printed at the end of POST */
function bootConfigBox(top=11){
  const padR = (s, w) => (s + ' '.repeat(w)).slice(0, w);
  const fields = [
    ['Main Processor',  '8088  @ 4.77 MHz', 'Base Memory',     '640 KB'],
    ['Numeric Coproc.', 'None',             'Extended Memory', '0 KB'],
    ['Floppy Drive A',  '1.2 MB, 5.25"',    'Display Type',    'Color / CGA'],
    ['Floppy Drive B',  'None',             'Serial Ports',    '1'],
    ['Fixed Disk C',    '20 MB  (Type 2)',  'Parallel Ports',  '1'],
  ];
  const rows = fields.map(([lk, lv, rk, rv]) =>
    ' ' + padR(lk, 16) + ': ' + padR(lv, 17) + padR(rk, 16) + ': ' + rv);
  const title = 'System Configuration   (C) Acme Corporation 1988';
  const inner = Math.max(title.length, ...rows.map(r => r.length));
  const left = Math.max(2, Math.floor((80 - (inner + 2)) / 2) + 1);
  const center = s => {
    const p = Math.max(0, inner - s.length);
    return ' '.repeat(Math.floor(p / 2)) + s + ' '.repeat(Math.ceil(p / 2));
  };
  let r = top;
  locate(r++, left); pc(201); pcn(205, inner); pc(187);            // top border
  locate(r++, left); pc(186); psa(center(title), 15); pc(186);     // title
  locate(r++, left); pc(204); pcn(205, inner); pc(185);            // title rule
  for(const line of rows){
    locate(r++, left); pc(186); psa(padR(line, inner), 7); pc(186);
  }
  locate(r++, left); pc(200); pcn(205, inner); pc(188);            // bottom border
  curR = Math.min(24, r); curC = 1;
}
async function waitForBootStart(){
  bootWaiting = true;
  bootStarted = false;
  bootSkip = false;
  return new Promise(resolve => {
    bootStartResolve = resolve;
    // Start on its own after BOOT_AUTOSTART_MS; an early key/tap starts it sooner
    // (and resumes audio, which the autostart path can't do without a gesture).
    bootAutoStart = setTimeout(startBootFromGesture, BOOT_AUTOSTART_MS);
  });
}
function crtPowerOn(){
  const p = document.getElementById('power');
  if(p) p.classList.add('go');               // one-shot tube warm-up flash
}
async function bootSequence(){
  if(shouldSkipBoot()){ bootActive = false; document.body.classList.remove('booting'); fit(); return; }

  crtPowerOn();
  cls();
  bootBiosLogo(4);
  bootCenter(11, 'Acme Corporation PC/XT compatible', 15);
  bootCenter(13, '8088  4.77 MHz   640K RAM', 7);
  await waitForBootStart();

  await bootCls();
  startCursor();
  bootLine('Acme Corporation Turbo BIOS v1.88', 15);
  bootLine('(C) Copyright Acme Corporation 1984,1988', 7);
  bootLine('');
  const memRow = curR;                        // count RAM in place, fast and fine-grained
  for(let k = 0; k <= 640; k += 8){
    locate(memRow, 1); psa(String(k).padStart(4) + 'K OK', 15);
    if(k % 64 === 0) bootClick(760 + k, 0.011, 0.02);
    await bootSleep(7);
  }
  curR = memRow; curC = 1;
  bootLine('');                               // drop to the line below the RAM tally
  bootLine('BIOS ROM checksum . . . . . . . . . . . . . . . . OK', 7);
  await bootSleep(140);
  bootLine('Keyboard controller test . . . . . . . . . . . .  OK', 7);
  bootLine('CGA display adapter . . . . . . . . . . . . . . . OK', 7);
  await bootSleep(150);
  bootBeep();                                 // POST passed: the one short beep
  await bootSleep(320);
  bootConfigBox(11);                          // the clone's configuration summary
  await bootSleep(500);
  const afterBox = curR;
  bootCenter(24, 'Hit  <DEL>  if you want to run SETUP', 7);
  curR = afterBox; curC = 1;                  // keep boot messages above the SETUP prompt
  await bootSleep(850);
  await bootDiskBurst(220);
  bootLine('');
  bootLine('Booting from fixed disk C:...', 15);
  await bootDiskBurst(440);

  await bootCls();
  bootLine('The IBM Personal Computer DOS', 15);
  bootLine('Version 3.30 (C)Copyright International Business Machines Corp 1981, 1987', 7);
  bootLine('(C)Copyright Microsoft Corp 1981, 1986', 7);
  bootLine('');
  await bootDiskBurst(260);
  bootLine('');
  await bootTypeLine('C:\\>CD \\GAMES', 15);
  await bootDiskBurst(150);
  await bootTypeLine('C:\\GAMES>DIR SNEEKIE.*', 15);
  await bootDiskBurst(180);
  bootLine(' Volume in drive C is ACME CORP', 7);
  bootLine(' Directory of C:\\GAMES', 7);
  bootLine('');
  bootLine('SNEEKIE  BAS     12664  07-15-88   8:08a', 7);
  bootLine('        1 File(s)      12664 bytes', 7);
  bootLine('');
  await bootTypeLine('C:\\GAMES>GWBASIC', 15);
  await bootDiskBurst(360);

  await bootCls();
  bootLine('GW-BASIC 3.23', 15);
  bootLine('(C) Copyright Microsoft 1983,1984,1985,1986,1987,1988', 7);
  bootLine('60300 Bytes free', 7);
  bootLine('');
  bootLine('Ok', 15);
  await bootTypeLine('LOAD "SNEEKIE.BAS"', 15);
  await bootDiskBurst(520);
  bootLine('Ok', 15);
  await bootTypeLine('RUN', 15);
  await bootDiskBurst(220);
  stopCursor();
  qEnd = actx ? actx.currentTime : 0;
  clearKbd();
  bootActive = false;
  document.body.classList.remove('booting');  // boot done → reveal fullscreen touch controls
  fit();                                      // booting class changes touch-control/layout rules
}

/* ---------- GAME STATE (names as in the BASIC) ---------- */
const T = new Int32Array(15001);            // 100: DIM T(15000) — snake cell offsets
const POPUP_LEFT = 28, POPUP_INNER = 23, POPUP_BYTES = (POPUP_INNER + 2) * 2;
const S = new Int32Array(POPUP_BYTES * 4 + 1); // modern wider popup backup
const B = new Int32Array(11);               // DIM B(10)  — gate positions
const D = Array.from({length:81}, () => new Int32Array(4)); // DIM D(80,3) — arrows
let ZORE = 0, ZCORE = 0;                    // highscore / score (the non-DEFINT names!)
let LIVE = 0, LEVEL = 0, BTEL = 0, ETEL = 0, E = 0, F = 0;
let HART = 0, KLAVER = 0, BONUS = 0, AANTAL = 0, BMIN = 0, Z = 0, K1 = 0;
let botRequestedLevel = 0;
let botRequestedStuck = false;
let botRequestedDeath = false;

function botDrivesGame(){
  return window.SNEEKIE_BOT_DRIVES_GAME === true || window.SNEEKIE_PASSIVE_PREVIEW === true ||
    !!(document.body && document.body.classList.contains('page-bot'));
}

window.sneekieRequestLevel = n => {
  const level = Math.trunc(Number(n));
  if(level >= 1 && level <= 32){
    botRequestedLevel = level;
    botRequestedStuck = false;
    botRequestedDeath = false;
  }
};
window.sneekieRequestStuck = () => {
  botRequestedStuck = true;
  botRequestedDeath = false;
  pushKey('\r');
};
window.sneekieRequestBotDeath = () => {
  botRequestedDeath = true;
  botRequestedStuck = false;
  pushKey('\r');
};
function consumeBotStuckRequest(){
  if(!botRequestedStuck) return false;
  botRequestedStuck = false;
  return true;
}
function consumeBotDeathRequest(){
  if(!botRequestedDeath) return false;
  botRequestedDeath = false;
  return true;
}

/* 1150: drop item L on a random empty cell (rows 4-20) */
function place(L){
  K1 = 0;
  let K = Math.trunc(rnd()*2720 + 480);
  if(K % 2 === 1) K++;
  if(peek(K) === 32){ poke(K, L); K1 = 1; }
}

/* Persist the high score at most once per burst: score() can fire thousands of
   times during a single bonus drain, and writing localStorage every point is
   wasteful. A trailing debounce coalesces a burst into one write; pagehide
   flushes a still-pending write so the latest value isn't lost on exit. */
let hsTimer = 0;
function saveHighscore(){
  if(previewMode) return;
  if(hsTimer) clearTimeout(hsTimer);
  hsTimer = setTimeout(() => { hsTimer = 0; lsSet('sneekie.highscore', String(ZORE)); }, 500);
}
addEventListener('pagehide', () => {
  if(!previewMode && hsTimer){ clearTimeout(hsTimer); hsTimer = 0; lsSet('sneekie.highscore', String(ZORE)); }
});

/* 1190: score OP points, track highscore */
function score(OP){
  ZCORE += OP;
  locate(22,73); pu(6, ZCORE);
  if(ZCORE > ZORE){
    ZORE = ZCORE;
    locate(22,46); pu(6, ZORE);
    saveHighscore();
  }
}

/* 2260: eat-arpeggio (PLAY "mb" = background music mode) */
function sub2260(){ sound(2500,0.1); sound(3500,0.1); sound(5000,0.1); }

/* 2280: popup box rows 10-13, widened to fit the modern restart text */
function sub2280(){
  locate(10,POPUP_LEFT); pc(201); pcn(205,POPUP_INNER); pc(187);
  locate(11,POPUP_LEFT); pc(186); sp(POPUP_INNER); pc(186);
  locate(12,POPUP_LEFT); pc(186); sp(POPUP_INNER); pc(186);
  locate(13,POPUP_LEFT); pc(200); pcn(205,POPUP_INNER); pc(188);
}
function popupText(row, text){
  const s = String(text).slice(0, POPUP_INNER);
  locate(row, POPUP_LEFT + 1 + Math.max(0, Math.floor((POPUP_INNER - s.length) / 2)));
  ps(s);
}
async function restartPopup(title, restartText = gt('playAgain')){
  sub2280();
  popupText(11, title);
  popupText(12, restartText);
  clearKbd();
  clearClickTarget();
  clickStartsLevel = true;
  await waitKey();
  clickStartsLevel = false;
  clearClickTarget();
}

/* 1480 */
function stone(X, Y){ poke((Y-1)*160 + (X-1)*2, 10); }

/* ---------- LEVEL LAYOUTS ---------- */
/* 1230: maze of line segments */
function lay1230(){
  for(let I = 1; I <= 39; I++){ locate(8,1+I); pc(196); locate(16,80-I); pc(196); }
  for(let I = 0; I <= 8; I++){
    locate(21-I,11); pc(179); locate(3+I,70); pc(179); locate(21-I,26); pc(179);
    locate(3+I,55); pc(179); locate(15,22+I); pc(196); locate(6,51+I); pc(196);
    locate(15,7+I); pc(196); locate(6,66+I); pc(196); locate(18,7+I); pc(196);
    locate(9,66+I); pc(196); locate(18,22+I); pc(196); locate(9,51+I); pc(196);
    for(let I1 = 6; I1 <= 10; I1++){
      locate(I1,5+I*4); pc(179); locate(8+I1,44+I*4); pc(179);
    }
    locate(8,5+I*4); pc(197); locate(16,44+I*4); pc(197);
  }
  locate(3,70); pc(194); locate(21,11); pc(193); locate(3,55); pc(194);
  locate(15,26); pc(197); locate(6,55); pc(197); locate(18,26); pc(197);
  locate(9,55); pc(197); locate(15,11); pc(197); locate(6,70); pc(197);
  locate(18,11); pc(197); locate(9,70); pc(197); locate(21,26); pc(193);
}

/* 1400: zigzag + rows of pushable stones */
function lay1400(){
  for(let Y = 4; Y <= 20; Y += 2){
    for(let I = 0; I <= 1; I++){
      let Q = 1;
      for(let A = 1; A <= 6; A++){
        if(Q === 1){ Q = 0; Y = Y + 1; } else { Q = 1; Y = Y - 1; }
        if(Y < 21) stone(17 + A + 40*I, Y);
      }
    }
  }
  for(let X = 2; X <= 78; X += 2){
    for(let I = 0; I <= 1; I++){
      let Y = 7 + 8*I; stone(X, Y);
      Y = 8 + 8*I; X = X + 1; stone(X, Y);
      Y = 9 + 8*I; X = X - 1; stone(X, Y);
    }
  }
}

/* 1500: grid of rooms with door gaps (DATA from 1630-1650, via RESTORE 1500) */
const DATA1500 = [15,5,6,10,9,35,6,20,9,75,6,40,9,55,6,70,9,65,18,10,15,55,18,20,
                  15,65,18,30,15,75,18,40,9,45,12,20,9,15,12,30,9,15,18,50,9,15,
                  6,50,9,15,18,60];
function lay1500(){
  for(let I = 2; I <= 79; I++) for(let I1 = 1; I1 <= 2; I1++){ locate(3+6*I1,I); pc(196); }
  for(let I = 4; I <= 20; I++) for(let I1 = 1; I1 <= 7; I1++){
    locate(3,10*I1); pc(194); locate(21,10*I1); pc(193);
    locate(I,10*I1); pc(179);
    for(let I2 = 1; I2 <= 2; I2++){
      locate(3+6*I2,10*I1); pc(197); locate(3+6*I2,80); pc(180);
      locate(3+6*I2,1); pc(195);
    }
  }
  let p = 0;
  for(let I = 1; I <= 13; I++){
    const C1 = DATA1500[p++], C2 = DATA1500[p++], C3 = DATA1500[p++], C4 = DATA1500[p++];
    locate(C1,C2); ps(' '); locate(C1,C2-1); pc(180);
    locate(C1,C2+2); pc(195); locate(C1,C2+1); ps(' ');
    locate(C3+2,C4); pc(194); locate(C3+1,C4); ps(' ');
    locate(C3,C4); ps(' '); locate(C3-1,C4); pc(193);
  }
}

/* 1670: nine vertical walls, each with a 3-cell gap (B array) */
function lay1670(){
  for(let I = 1; I <= 9; I++){
    B[I] = 6 + I;
    locate(3,8*I); pc(194);
    for(let I1 = 4; I1 <= 20; I1++){ locate(I1,8*I); pc(179); }
    locate(21,8*I); pc(193); locate(B[I]-1,I*8); pc(193);
    for(let I1 = 0; I1 <= 2; I1++){ locate(B[I]+I1,I*8); ps(' '); }
    locate(B[I]+3,I*8); pc(194);
  }
}

/* 1750: walls + stone pattern */
function lay1750(){
  lay1670();
  for(let I1 = 4; I1 <= 20; I1 += 2) for(let I2 = 0; I2 <= 9; I2++){
    stone(I2*8+3, I1); stone(I2*8+5, I1);
    if(I1 < 20) stone(I2*8+4, I1+1);
  }
}

/* 1810: init upward arrows */
function lay1810(){
  for(let I = 2; I <= 79; I += 2){ D[I][1] = 5 + Math.trunc(rnd()*14); D[I][2] = 32; }
  sub1830();
}

/* 1920: init horizontal arrows */
function lay1920(){
  for(let I = 4; I <= 20; I++) for(let A = 0; A <= 1; A++){
    D[I+A*20][1] = Math.round(rnd()*38*2 + 2 + A);  // DEFINT assignment rounds
    D[I+A*20][2] = 32;
  }
  D[12][1] = 14; D[13][1] = 6; D[32][1] = 65; D[33][1] = 55;
  sub1970();
}

/* ---------- ENEMY UPDATES (RETURN 510 -> throw DEATH) ---------- */
/* 1830: arrows (chr 24) climbing up, wrapping 4 -> 21 */
function sub1830(){
  for(let I = 2; I <= 78; I += 2){
    let I2 = (D[I][1]-1)*160 + (I-1)*2;
    if(D[I][1] === 4){ poke(I2, D[I][2]); poke(I2+1, 7); D[I][1] = 21; I2 = I2 + 2720; }
    if(peek(I2-160) === 219) throw DEATH;                    // 1860
    if(peek(I2-160) > 100) continue;                          // 1870
    if(D[I][1] !== 21){ poke(I2, D[I][2]); poke(I2+1, 7); }
    D[I][1] = D[I][1] - 1; D[I][2] = peek(I2-160);
    poke(I2-160, 24); poke(I2-159, 15);
  }
}

/* 1970: arrows -> (chr 26) and <- (chr 27) sweeping rows 4-20 */
function sub1970(){
  for(let I = 4; I <= 20; I++){
    let I2 = (I-1)*160 + (D[I][1]-1)*2;
    if(D[I][1] === 79){ poke(I2, D[I][2]); poke(I2+1, 7); D[I][1] = 1; I2 = I2 - 156; }
    let d = peek(I2+2);
    if(d === 219) throw DEATH;                                // 2000
    if(d === 27){ poke(I2+2, D[I+20][2]); D[I+20][2] = 26; }  // 2010 head-on quirk
    if(d <= 100){                                             // 2020
      if(D[I][1] !== 1){ poke(I2, D[I][2]); poke(I2+1, 7); }
      D[I][1] = D[I][1] + 1; D[I][2] = peek(I2+2);
      poke(I2+2, 26); poke(I2+3, 15);
    }
    const L = I + 20;
    I2 = (I-1)*160 + (D[L][1]-1)*2;
    if(D[L][1] === 2){ poke(I2, D[L][2]); poke(I2+1, 7); D[L][1] = 80; I2 = I2 + 156; }
    d = peek(I2-2);
    if(d === 219) throw DEATH;                                // 2070
    if(!(d > 100 || d === 26)){                               // 2080
      if(D[L][1] !== 80){ poke(I2, D[L][2]); poke(I2+1, 7); }
      D[L][1] = D[L][1] - 1; D[L][2] = peek(I2-2);
      poke(I2-2, 27); poke(I2-1, 15);
    }
  }
}

/* 2130: gaps crawling down the nine walls (wrap 17 -> 4) */
function sub2130(){
  for(let D1 = 1; D1 <= 9; D1++){
    const D2 = (B[D1]-1)*160 + (D1*8-1)*2;
    if(B[D1] === 4){                                          // 2140-2180: wrap case
      const A = peek(D2+2080) + peek(D2+2240) + peek(D2+2400);
      if(A !== 96) continue;
      poke(D2+2560,179); poke(D2+2080,179); poke(D2+2240,179); poke(D2+2400,179);
      poke(D2,32); poke(D2+160,32); poke(D2+320,32); poke(D2+1920,179);
    }
    const A = peek(D2) + peek(D2+160) + peek(D2+320);         // 2190
    if(A !== 96) continue;
    if(B[D1] !== 4) poke(D2-160,179);                         // 2210
    poke(D2,193); poke(D2+160,32); poke(D2+320,32); poke(D2+480,32);
    poke(D2+640,194);
    B[D1] = B[D1] + 1; if(B[D1] === 17) B[D1] = 4;            // 2230
  }
}

const noEnemy = () => {};                                     // 1170
/* 310 + 1010: the two ON LEVEL GOSUB tables (16 entries, used twice) */
const CFG = [
  () => { Z = 999; AANTAL =  75; BMIN = 10; },                // 2320
  () => { Z = 999; AANTAL =  75; BMIN = 10; lay1230(); },     // 2330
  () => { Z = 999; AANTAL =  75; BMIN = 10; lay1500(); },     // 2340
  () => { Z = 999; AANTAL =  50; BMIN = 10; lay1400(); },     // 2350
  () => { Z = 999; AANTAL =  50; BMIN = 10; lay1670(); },     // 2360
  () => { Z = 999; AANTAL =  50; BMIN = 10; lay1810(); },     // 2370
  () => { Z = 999; AANTAL =  50; BMIN = 10; lay1920(); },     // 2380
  () => { Z = 999; AANTAL =  50; BMIN = 10; lay1750(); },     // 2390
  () => { Z = 0.4; AANTAL = 125; BMIN =  5; },                // 2410
  () => { Z = 0.6; AANTAL = 125; BMIN =  5; lay1230(); },     // 2420
  () => { Z = 0.6; AANTAL = 125; BMIN =  5; lay1500(); },     // 2430
  () => { Z = 0.9; AANTAL = 100; BMIN =  5; lay1400(); },     // 2440
  () => { Z = 0.9; AANTAL = 100; BMIN =  5; lay1670(); },     // 2450
  () => { Z = 1.0; AANTAL = 100; BMIN =  5; lay1810(); },     // 2460
  () => { Z = 1.0; AANTAL = 100; BMIN =  5; lay1920(); },     // 2470
  () => { Z = 1.2; AANTAL = 100; BMIN =  5; lay1750(); },     // 2480
];
const ENEMY = [noEnemy, noEnemy, noEnemy, noEnemy, sub2130, sub1830, sub1970, sub2130,
               noEnemy, noEnemy, noEnemy, noEnemy, sub2130, sub1830, sub1970, sub2130];

/* 510-630: death — tune, unwind the snake, lose a life */
async function deathSeq(){
  for(let I = 1; I <= 3; I++){                                // 510-530
    sound(2000,3); sound(3000,3); sound(4000,3); sound(3000,3);
  }
  await playDrained();                                        // 540
  while(ETEL <= BTEL){                                        // 550-600
    await sleep(75);                                          // 560-570 (0.075s)
    poke(T[ETEL],32); poke(T[ETEL]+1,7); sound(1500,0.1);
    ETEL++; score(-BMIN);
  }
  LIVE--; HART = 0; KLAVER = 0;                               // 610
  if(LIVE === 0) LEVEL = 32; else LEVEL--;                    // 620
}

/* 240-1080: FOR LEVEL=1 TO 32 */
async function playLevels(){
  for(LEVEL = 1; LEVEL <= 32; LEVEL++){
    /* 250-270: playfield + inner borders */
    for(let I = 1; I <= 17; I++){ locate(3+I,1); pc(179); sp(78); pc(179); }
    locate(3,1); pc(195); pcn(196,78); pc(180);
    locate(21,1); pc(195); pcn(196,78); pc(180);
    /* 280-300: snake start (head row 12, tail row 13, col 41, moving up) */
    T[1] = 2000; T[2] = 1840; BTEL = 2; ETEL = 1;
    poke(T[BTEL],219); poke(T[ETEL],186); poke(T[BTEL]+1,15);
    E = 72; F = 72; HART = 0; KLAVER = 0; BONUS = 10000; score(0);
    /* 310: level config + walls */
    CFG[(LEVEL-1) % 16]();
    /* 320-330: status values */
    locate(23,73); pu(6,BONUS);
    locate(23,61); pu(2,LIVE); locate(22,61); pu(2,LEVEL);
    /* 340-360: scatter AANTAL smileys + hearts */
    for(let I = 1; I <= AANTAL; I++){
      place(1); place(3);
      if(K1 === 1) HART++;
    }
    clearClickTarget();
    /* 370: save area behind popup */
    for(let I = 1; I <= POPUP_BYTES; I++) for(let I3 = 0; I3 <= 3; I3++) S[I+I3*POPUP_BYTES] = peek(1493+I+I3*160);
    /* 380-400: "Level n" popup */
    sub2280();
    popupText(11, gt('level') + ' ' + LEVEL + ' ');
    popupText(12, gt('pressAny'));
    clearKbd();
    clickStartsLevel = true;
    await waitKey();
    clickStartsLevel = false;
    botRequestedStuck = false;
    botRequestedDeath = false;
    /* 410: restore */
    for(let I = 1; I <= POPUP_BYTES; I++) for(let I3 = 0; I3 <= 3; I3++) poke(1493+I+I3*160, S[I+I3*POPUP_BYTES]);
    {
      const key = nextClickTargetKey();
      if(key) pushKey(key);
    }

    /* 420-1020: the move loop */
    let died = false, skip = false;
    while(HART + KLAVER > 0){
      if(botRequestedLevel){
        LEVEL = botRequestedLevel - 1;
        botRequestedLevel = 0;
        botRequestedStuck = false;
        botRequestedDeath = false;
        skip = true;
        break;
      }
      try{
        if(consumeBotDeathRequest()) throw DEATH;
        if(consumeBotStuckRequest() || (!botDrivesGame() && isSnakeStuck())) throw STUCK;
        const waitMs = clickTarget ? Math.min(Z * 1000, CLICK_ROUTE_MS) : Z * 1000;
        let A$ = await keyOrTimeout(waitMs);                  // 430-460
        if(consumeBotDeathRequest()) throw DEATH;
        if(consumeBotStuckRequest()) throw STUCK;
        if(!A$.length){
          const key = nextClickTargetKey();
          if(key) A$ = key;
        }
        if(BONUS > 0) BONUS -= BMIN;                          // 470
        locate(23,73); pu(6,BONUS);                           // 480
        if(A$.length === 1){                                  // 490
          if(A$.charCodeAt(0) === 27) throw DEATH;            // 500 -> 510
          E = F; score(-BMIN); sound(1000,5); continue;       // -> 910 (letter key)
        }
        if(A$.length === 2) E = A$.charCodeAt(1);             // 640
        let A = T[BTEL];                                      // 650
        if(E === 68){ skip = true; break; }                   // 660: F10
        if(E === 67){ LIVE++; locate(23,61); pu(2,LIVE); E = F; continue; } // 670: F9
        if(E === 80) A += 160; else if(E === 72) A -= 160;    // 680
        if(E === 77) A += 2;   else if(E === 75) A -= 2;      // 690
        const d = peek(A);                                    // 700
        let blocked = false;
        if(d === 32){                                         // 710-730: empty
          poke(T[ETEL],32); poke(T[ETEL]+1,7); sound(1500,0.1); ETEL++;
        } else if(d === 5){                                   // 740-760: club +25
          place(1); sub2260(); score(25); KLAVER--;
        } else if(d === 3){                                   // 770-790: heart +10
          if(LEVEL > 16){ place(5); if(K1 === 1) KLAVER++; }
          place(1); sub2260(); score(10); HART--;
        } else if(d === 10){                                  // 800-860: push the stone
          let TA = A;
          if(E === 80) TA += 160; else if(E === 72) TA -= 160;
          if(E === 77) TA += 2;   else if(E === 75) TA -= 2;
          if(peek(TA) !== 32) blocked = true;                 // 840 -> 910
          else {
            poke(TA,10); poke(T[ETEL],32); poke(T[ETEL]+1,7);
            sound(1500,0.1); ETEL++;
          }
        } else if(d === 1){                                   // 870-890: smiley -50
          for(let I = 50; I >= 1; I--) sound(600+75*I, 0.35);
          score(-50); place(1);
        } else if(d === 24 || d === 26 || d === 27){          // 900: arrow = death
          throw DEATH;
        } else blocked = true;                                // muur/lijf -> 910
        if(blocked){                                          // 910
          E = F; score(-BMIN); sound(1000,5); continue;
        }
        /* 920-970: body corner char from old+new direction */
        if((E===77&&F===77)||(E===75&&F===75)) poke(T[BTEL],205);
        else if((E===80&&F===80)||(E===72&&F===72)) poke(T[BTEL],186);
        else if((E===80&&F===77)||(E===75&&F===72)) poke(T[BTEL],187);
        else if((E===72&&F===77)||(E===75&&F===80)) poke(T[BTEL],188);
        else if((E===80&&F===75)||(E===77&&F===72)) poke(T[BTEL],201);
        else if((E===72&&F===75)||(E===77&&F===80)) poke(T[BTEL],200);
        BTEL++; T[BTEL] = A; F = E; poke(T[BTEL],219);        // 980
        if(clickTarget && A === clickTarget.off) clearClickTarget();
        if(BTEL === 15000) throw DEATH;                       // 990
        for(let I = BTEL; I >= ETEL; I -= 2){                 // 1000: shimmer
          poke(T[I]+1,15); poke(T[I-1]+1,7);
        }
        ENEMY[(LEVEL-1) % 16]();                              // 1010
      } catch(sig){
        if(sig === STUCK){
          await flashStuckScreen();
          await deathSeq();
          died = true;
          if(LIVE > 0) await restartPopup(gt('stuck'), ' ' + gt('playAgain'));
          break;
        }
        if(sig !== DEATH) throw sig;
        await deathSeq();
        died = true;
        break;
      }
    }
    if(!died && !skip){
      /* 1030-1060: drain bonus into score */
      let n = 0;
      while(BONUS > 0){
        score(5); BONUS -= 5;
        locate(23,74); pu(5,BONUS);
        if(++n % 25 === 0){ sound(3000,0.1); await raf(); }
      }
      await raf();
      LIVE++;                                                 // 1070
    }
  }
}

/* 80-210 + 230 + 1090-1130: boot, frame, restart loop */
async function program(){
  ZORE = previewMode ? 0 : parseInt(lsGet('sneekie.highscore') || '0', 10) || 0;  // 80 (persisted)
  cls();                                                      // 100
  locate(1,1);  pc(218); pcn(196,78); pc(191);                // 110
  locate(2,1);  pc(179); sp(78); pc(179);                     // 120
  locate(2,17); ps(gt('titleLine'));
  locate(22,1); pc(179); sp(78); pc(179);                     // 140
  locate(22,6); ps(gt('scoreLine'));                          // 150
  locate(23,1); pc(179); sp(78); pc(179);                     // 160
  locate(22,55); ps(gt('levelScore'));                        // 170
  locate(23,6); ps(gt('itemLine'));                           // 180
  locate(23,55); ps(gt('livesBonus'));                        // 190
  locate(24,1); pc(192); pcn(196,78); pc(217);                // 200
  poke(3396,1); poke(3556,10); poke(3526,5); poke(3366,3);    // 210: legend icons
  if(ZORE > 0){ locate(22,46); pu(6,ZORE); }                  // persisted highscore
  while(true){
    ZCORE = 0; LIVE = 3;                                      // 230
    await playLevels();                                       // 240-1080
    await restartPopup(gt('end'));                            // 1090-1130: modern any-key restart
  }
}

/* ---------- PAGE SHELL ---------- */
const titleCv = document.getElementById('title');
function drawTitle(){
  if(!titleCv) return;                             // title is now the static logo (images/logo.png) in the nav
  const txt = [3,32,83,78,69,69,75,73,69,32,3];   // "♥ SNEEKIE ♥"
  const w = txt.length * 8, h = 16;
  const off = document.createElement('canvas'); off.width = w; off.height = h;
  const ox = off.getContext('2d');
  const img = ox.createImageData(w, h);
  txt.forEach((ch, ci) => {
    const [r,g,b] = theme.cga ? CGA_RGB[cgaColor(ch, 8)] : theme.bright;
    for(let row = 0; row < 16; row++){
      const bits = FONT[ch*16 + row];
      for(let col = 0; col < 8; col++){
        if(bits & (0x80 >> col)){
          const p = (row*w + ci*8 + col) * 4;
          img.data[p] = r; img.data[p+1] = g; img.data[p+2] = b; img.data[p+3] = 255;
        }
      }
    }
  });
  ox.putImageData(img, 0, 0);
  titleCv.width = w*4; titleCv.height = h*4;
  const tx = titleCv.getContext('2d');
  tx.imageSmoothingEnabled = false;
  tx.drawImage(off, 0, 0, titleCv.width, titleCv.height);
}

function applyTheme(name){
  themeName = playableThemeName(name);
  theme = THEMES[themeName];
  if(theme.cga && !cgaAtlas[15]){
    for(const k in CGA_RGB) cgaAtlas[k] = buildAtlas(CGA_RGB[k]);
  }
  atlasDim = buildAtlas(theme.dim);
  atlasBright = buildAtlas(theme.bright);
  document.body.style.setProperty('--phos', theme.css);
  document.body.style.setProperty('--glow', theme.glow);
  repaintAll();
  drawTitle();
  document.querySelectorAll('#themes button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.theme === themeName)));
  if(!forceTheme) lsSet('sneekie.theme', themeName);

  const metaColor = theme.meta || '#0a0c0d';
  const metaTag = document.querySelector('meta[name="theme-color"]');
  if(metaTag) metaTag.content = metaColor;
  try {
    if(window.parent !== window) {
      window.parent.postMessage({ type: 'sneekie:theme', color: metaColor }, '*');
    }
  } catch(_) {}
}
document.querySelectorAll('#themes button').forEach(b =>
  b.addEventListener('click', () => { ensureAudio(); applyTheme(b.dataset.theme); }));

const muteBtn = document.getElementById('mute');
function gameUiText(key){
  const pageText = window.SNEEKIE_TEXT || {};
  return pageText[key] || gt(key);
}
function paintMute(){ muteBtn.textContent = muted ? gameUiText('soundOff') : gameUiText('soundOn'); }
muteBtn.addEventListener('click', () => {
  ensureAudio();
  muted = !muted;
  paintMute();
});
paintMute();

function fit(){
  if(previewMode && !document.fullscreenElement){
    bezel.style.removeProperty('--fs-touch-reserve');
    cv.style.width = '100%';
    cv.style.height = 'auto';
    return;
  }
  if(document.fullscreenElement){
    /* fill the screen like a real 1988 monitor (the game uses rows 1-24, so the canvas is 640x384).
       On touch, leave one right-side pad for the fullscreen buttons. */
    const touchReserve = matchMedia('(pointer:coarse)').matches
      ? Math.min(206, Math.max(154, innerWidth * 0.28))
      : 0;
    bezel.style.setProperty('--fs-touch-reserve', touchReserve + 'px');
    const s = Math.min(Math.max(160, innerWidth - touchReserve)/640, innerHeight/384);
    cv.style.width = (640*s) + 'px';
    cv.style.height = (384*s) + 'px';
    return;
  }
  bezel.style.removeProperty('--fs-touch-reserve');
  const num = v => parseFloat(v) || 0;
  const inlinePad = el => {
    const st = getComputedStyle(el);
    return num(st.paddingLeft) + num(st.paddingRight);
  };
  const blockPad = el => {
    const st = getComputedStyle(el);
    return num(st.paddingTop) + num(st.paddingBottom);
  };
  const bodyChromeW = inlinePad(document.body);
  const monitorChromeW = inlinePad(bezel) + inlinePad(document.getElementById('tube')) + 4;
  const monitorChromeH = blockPad(bezel) + blockPad(document.getElementById('tube')) +
    document.getElementById('panel').offsetHeight + 18;
  const availW = Math.min(document.documentElement.clientWidth - bodyChromeW - monitorChromeW, 1300);
  const availH = innerHeight - bezel.getBoundingClientRect().top - monitorChromeH - 18;
  let s = Math.min(availW/640, availH/384);
  s = s >= 1 ? Math.floor(s) : Math.max(s, 0.42);
  cv.style.width = (640*s) + 'px';
  cv.style.height = (384*s) + 'px';
}
addEventListener('resize', fit);

/* fullscreen: hand the whole display to the monitor */
const fsBtn = document.getElementById('fs');
const bezel = document.getElementById('bezel');
if(bezel.requestFullscreen){
  function lockLandscapeFullscreen(){
    if(!screen.orientation || !screen.orientation.lock) return;
    screen.orientation.lock('landscape').then(fit).catch(() => {});
  }
  function unlockFullscreenOrientation(){
    if(!screen.orientation || !screen.orientation.unlock) return;
    try { screen.orientation.unlock(); } catch(_) {}
  }
  if(screen.orientation && screen.orientation.addEventListener){
    screen.orientation.addEventListener('change', fit);
  }
  fsBtn.addEventListener('click', () => {
    ensureAudio();
    if(document.fullscreenElement) document.exitFullscreen()?.catch(() => {});
    else bezel.requestFullscreen()?.catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    const fs = !!document.fullscreenElement;
    fsBtn.setAttribute('aria-pressed', String(fs));
    if(fs) lockLandscapeFullscreen();
    else {
      hideFullscreenHelp();
      unlockFullscreenOrientation();
    }
    fit();
    if(fs) showFullscreenHelp();
    /* In fullscreen the browser normally swallows <ESC> to leave fullscreen, so the
       game never sees it. The Keyboard Lock API (Chromium, secure context) routes
       <ESC> to the page instead; to leave fullscreen you then press & hold <ESC>
       (Chrome shows a hint). No-op on Firefox/Safari, where <ESC> still exits. */
    if(navigator.keyboard && navigator.keyboard.lock){
      if(fs) navigator.keyboard.lock(['Escape']).catch(() => {});
      else navigator.keyboard.unlock();
    }
  });
} else {
  fsBtn.style.display = 'none';
}

applyTheme(themeName);
fit();
(async () => {
  await bootSequence();
  await program();
})();
