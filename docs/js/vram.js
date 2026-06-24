'use strict';
const FONT = Uint8Array.from(atob("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AAB4zMzM2MzGxsbMAAAAAAAA/sbGwMDAwMDAwAAAAAAAAAAA/mxsbGxsbGwAAAAAAAAA/sZgMBgwYMb+AAAAAAAAAAAAftjY2NjYcAAAAAAAAAAAZmZmZmZ8YGDAAAAAAAAAAHbcGBgYGBgYAAAAAAAAAH4YPGZmZjwYfgAAAAAAAAA4bMbG/sbGbDgAAAAAAAA4bMbGxmxsbGzuAAAAAAAAHjAYDD5mZmZmPAAAAAAAAAAAAH7b29t+AAAAAAAAAAAAAwZ+29vzfmDAAAAAAAAAHDBgYHxgYGAwHAAAAAAAAAB8xsbGxsbGxsYAAAAAAAAAAP4AAP4AAP4AAAAAAAAAAAAYGH4YGAAA/wAAAAAAAAAwGAwGDBgwAH4AAAAAAAAADBgwYDAYDAB+AAAAAAAADhsbGBgYGBgYGBgYGBgYGBgYGBgYGNjY2HAAAAAAAAAAABgYAH4AGBgAAAAAAAAAAAAAdtwAdtwAAAAAAAAAOGxsOAAAAAAAAAAAAAAAAAAAAAAAABgYAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAADwwMDAwM7GxsPBwAAAAAANhsbGxsbAAAAAAAAAAAAABw2DBgyPgAAAAAAAAAAAAAAAAAfHx8fHx8fAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=="), c => c.charCodeAt(0));
const vt = key => (window.SNEEKIE_TEXT && window.SNEEKIE_TEXT[key]) || key;

/* ---------- a 22x15 corner of the real 80x25 text screen ---------- */
const W = 22, H = 15, STRIDE = 160, SCALE = 2, CW = 8 * SCALE, CH = 16 * SCALE;
const off = (c, r) => (r - 1) * STRIDE + (c - 1) * 2;          // 1-based, exactly like the BASIC
const vram = new Uint8Array((H - 1) * STRIDE + (W - 1) * 2 + 2);
const cellByOff = {};                                          // offset -> {c,r}
for(let r = 1; r <= H; r++) for(let c = 1; c <= W; c++) cellByOff[off(c, r)] = {c, r};

let flashSet = new Set(), screenFlashOn = false, restartTimer = null;
function poke(o, v){ if(vram[o] !== v){ vram[o] = v; if(cellByOff[o]) flashSet.add(o); } }
function peek(o){ return vram[o]; }

/* ---------- snake state (names as in the game) ---------- */
const T = []; let BTEL, ETEL, DIR, FDIR, score, hearts, heartsBannerShown = false, dead = false;
const HEAD = 219, BODY_H = 205, BODY_V = 186;
const WALL_H = 196, WALL_V = 179, C_TL = 218, C_TR = 191, C_BL = 192, C_BR = 217;
const SNAKE = new Set([219,205,186,187,188,201,200]);          // head + double-line body
const WALLSET = new Set([196,179,218,191,192,217,197,194,193,195,180]); // single-line walls
const D = { U:{d:-STRIDE}, R:{d:2}, D:{d:STRIDE}, L:{d:-2} };

/* ---------- moving arrows (the enemies — chr 24/25/26/27 = ↑ ↓ → ←) ---------- */
const ARROWSET = new Set([24,25,26,27]);
const ADIR = { U:-STRIDE, D:STRIDE, L:-2, R:2 };               // one arrow step per direction
const AREV = { U:'D', D:'U', L:'R', R:'L' };                   // bounce: flip the axis
const ACH  = { U:24, D:25, L:27, R:26 };                       // CP437 glyph per direction
const roomCells = new Set();                                   // offsets that make up the little blue room
let arrows = [], arrowTimer = null;

function stopArrows(){
  if(arrowTimer){ clearInterval(arrowTimer); arrowTimer = null; }
}

function startFailureFlash(){
  if(restartTimer) return;
  stopArrows();
  const FLASHES = 8, STEP = 250;          // 8 red flashes: 0.25s on, 0.25s off in between
  const TICKS = FLASHES * 2;
  let tick = 0;
  const pulse = () => {
    screenFlashOn = tick % 2 === 0;
    render();
    tick++;
    if(tick < TICKS){
      restartTimer = setTimeout(pulse, STEP);
    } else {
      screenFlashOn = false;
      restartTimer = null;
      init();
    }
  };
  pulse();
}

function failAndRestart(){
  if(dead) return;
  dead = true;
  startFailureFlash();
}

function corner(E, F){                                         // BASIC 920-970, new dir E, old dir F
  if((E==='R'&&F==='R')||(E==='L'&&F==='L')) return BODY_H;
  if((E==='D'&&F==='D')||(E==='U'&&F==='U')) return BODY_V;
  if((E==='D'&&F==='R')||(E==='L'&&F==='U')) return 187;       // ╗
  if((E==='U'&&F==='R')||(E==='L'&&F==='D')) return 188;       // ╝
  if((E==='D'&&F==='L')||(E==='R'&&F==='U')) return 201;       // ╔
  if((E==='U'&&F==='L')||(E==='R'&&F==='D')) return 200;       // ╚
  return BODY_H;
}

function scatter(ch, n){                                       // drop n of char ch on empty interior cells
  let placed = 0, guard = 0;
  while(placed < n && guard++ < 4000){
    const c = 2 + Math.floor(Math.random() * (W - 2));        // cols 2..W-1 (inside the border)
    const r = 2 + Math.floor(Math.random() * (H - 2));        // rows 2..H-1
    if(peek(off(c, r)) === 32){ poke(off(c, r), ch); placed++; }
  }
  return placed;
}

function popClub(){                                            // eat a heart -> a club pops up elsewhere (the BASIC's place(5))
  for(let guard = 0; guard < 600; guard++){
    const c = 2 + Math.floor(Math.random() * (W - 2));
    const r = 2 + Math.floor(Math.random() * (H - 2));
    const o = off(c, r);
    if(peek(o) === 32){ poke(o, 5); return o; }
  }
  return null;
}

/* a Room-Grid room: single-line walls + a 2-wide door gap, drawn blue */
function drawRoom(){
  roomCells.clear();
  const c0 = 12, c1 = 19, r0 = 3, r1 = 7;                       // an 8x5 box up top
  const put = (c, r, ch) => { poke(off(c,r), ch); poke(off(c,r)+1, 7); roomCells.add(off(c,r)); };
  for(let c = c0; c <= c1; c++){ put(c, r0, WALL_H); put(c, r1, WALL_H); }
  for(let r = r0; r <= r1; r++){ put(c0, r, WALL_V); put(c1, r, WALL_V); }
  put(c0, r0, C_TL); put(c1, r0, C_TR); put(c0, r1, C_BL); put(c1, r1, C_BR);
  for(const dc of [15, 16]){ poke(off(dc, r1), 32); roomCells.delete(off(dc, r1)); }  // a 2-wide door gap, like the Room Grid's
}

/* pushable stones in the Stone Field motif (lay1400): ◙, one down-right, one back */
function drawStones(){
  for(let x = 8; x <= 14; x += 2){ poke(off(x,9), 10); poke(off(x+1,10), 10); poke(off(x,11), 10); }
}

/* four moving arrows — up, down, right and left — each bouncing off whatever it meets */
function initArrows(){
  arrows = [{ o: off(3,13), dir:'U' }, { o: off(20,2), dir:'D' },
            { o: off(20,13), dir:'L' }, { o: off(3,7), dir:'R' }];
  for(const a of arrows){ a.ch = ACH[a.dir]; a.under = peek(a.o); poke(a.o, a.ch); poke(a.o+1, 15); }
}
function moveArrow(a){
  const open = o => { const t = peek(o); return t===32 || t===3 || t===5 || t===1; }; // floor or a pickup; everything else bounces
  let dir = a.dir, target = a.o + ADIR[dir];
  if(peek(target) === HEAD){ die(); return true; }                 // arrow steps onto the head -> death (BASIC 1860/2000)
  if(!open(target)){ dir = AREV[dir]; target = a.o + ADIR[dir]; }   // hit something — turn around
  if(peek(target) === HEAD){ die(); return true; }                 // ...and into the head after bouncing
  if(!open(target)) return false;                                  // boxed in — sit still this tick
  poke(a.o, a.under); poke(a.o+1, 7);                              // drop whatever was under us (item reappears)
  a.under = peek(target); a.o = target; a.dir = dir; a.ch = ACH[dir];
  poke(a.o, a.ch); poke(a.o+1, 15);                               // draw the arrow at its new cell
  return false;
}
function stepArrows(){
  for(const a of arrows){ if(moveArrow(a)) break; }
  flashSet.clear();                                              // the enemies glide silently; the flash is for "this move"
  render();
  if(dead) log.insertAdjacentHTML('beforeend', '<div class="blk">' + vt('vramDead') + '</div>');
}
/* the snake hit (or was hit by) a moving arrow — flash, then restart the sandbox */
function die(){
  failAndRestart();
}

function init(){
  if(restartTimer){ clearTimeout(restartTimer); restartTimer = null; }
  stopArrows();
  screenFlashOn = false;
  vram.fill(0); T.length = 0; flashSet.clear(); roomCells.clear(); arrows = [];
  for(let r = 1; r <= H; r++) for(let c = 1; c <= W; c++){ poke(off(c,r), 32); poke(off(c,r)+1, 7); }
  // border
  for(let c = 2; c < W; c++){ poke(off(c,1), WALL_H); poke(off(c,H), WALL_H); }
  for(let r = 2; r < H; r++){ poke(off(1,r), WALL_V); poke(off(W,r), WALL_V); }
  poke(off(1,1), C_TL); poke(off(W,1), C_TR); poke(off(1,H), C_BL); poke(off(W,H), C_BR);
  drawRoom();                // the little blue room (was a 3-cell wall stub)
  drawStones();              // the Stone Field motif (was an ad-hoc zigzag)
  // snake: cols 5,6,7 on row 5, head at 7 facing right
  T[1] = off(5,5); T[2] = off(6,5); T[3] = off(7,5); ETEL = 1; BTEL = 3; DIR = 'R'; FDIR = 'R';
  poke(T[1], BODY_H); poke(T[2], BODY_H); poke(T[3], HEAD); poke(T[3]+1, 15);
  initArrows();              // four moving arrows
  // scatter the goodies — no clubs up front: each heart you eat pops one up
  hearts = scatter(3, 14);   // hearts  (+10)
  scatter(1, 6);             // smileys (yellow, -50)
  score = 0; heartsBannerShown = false; dead = false; flashSet.clear();
  render(); logMove(null, []);
  arrowTimer = setInterval(stepArrows, 480);                    // the enemies move on their own
}

const cdesc = d => d===32 ? vt('vramEmpty') : d===3 ? vt('vramHeart') :
  d===5 ? vt('vramClub') : d===1 ? vt('vramSmiley') : d===10 ? vt('vramStone') :
  d===24 ? vt('vramArrowUp') : d===25 ? vt('vramArrowDown') :
  d===26 ? vt('vramArrowRight') : d===27 ? vt('vramArrowLeft') :
  d===HEAD ? vt('vramSnakeHead') : SNAKE.has(d) ? vt('vramSnakeBody') :
  WALLSET.has(d) ? vt('vramWall') : vt('vramSpace');

/* a direction the snake could actually take: open floor, a pickup, or a stone with room to slide */
function canMove(dir){
  const A = T[BTEL] + D[dir].d, d = peek(A);
  if(d === 32 || d === 3 || d === 5 || d === 1) return true;     // floor or a pickup
  if(d === 10) return peek(A + D[dir].d) === 32;                 // a stone we can shove
  return false;                                                  // wall, body, immovable stone, arrow
}
/* really stuck = nowhere left to go; only then do we restart (apart from arrow hits) */
function isStuck(){ return !['U','R','D','L'].some(canMove); }

function move(dir){
  if(dead) return;
  const E = dir, F = DIR, A = T[BTEL] + D[dir].d;
  const ops = [];
  const d = peek(A);
  ops.push(['peek', A, d, cdesc(d)]);
  if(ARROWSET.has(d)){                                          // a moving arrow ahead = instant death, like the game
    ops.push(['blk', vt('vramDead'), '', '']);
    render(); logMove({dir, grow:false}, ops); failAndRestart(); return;
  }
  let grow = false, moved = true;
  if(d === 32){ poke(T[ETEL], 32); poke(T[ETEL]+1, 7); ops.push(['poke', T[ETEL], 32, vt('vramEraseTail')]); ETEL++; }
  else if(d === 3){ score += 10; hearts--; grow = true; ops.push(['+', vt('vramEatHeart'), '', '']);
    const co = popClub();                                      // the heart spawns a club elsewhere
    if(co != null) ops.push(['poke', co, 5, vt('vramClubPops')]); }
  else if(d === 5){ score += 25; grow = true; ops.push(['+', vt('vramEatClub'), '', '']); }
  else if(d === 1){ score -= 50; grow = true; ops.push(['+', vt('vramEatSmiley'), '', '']); }
  else if(d === 10){                                          // push the stone (like level 4)
    const TA = A + D[dir].d, beyond = peek(TA);               // the cell on the far side of the stone
    ops.push(['peek', TA, beyond, cdesc(beyond) + vt('vramBehindStone')]);
    if(beyond === 32){
      poke(TA, 10); ops.push(['poke', TA, 10, vt('vramShoveStone')]);
      poke(T[ETEL], 32); poke(T[ETEL]+1, 7); ops.push(['poke', T[ETEL], 32, vt('vramEraseTail')]); ETEL++;
    } else { moved = false; ops.push(['blk', vt('vramStoneBlocked'), '', '']); }
  }
  else { moved = false; ops.push(['blk', vt('vramBlocked') + cdesc(d) + vt('vramStayPut'), '', '']); }

  if(moved){
    const bg = corner(E, F);
    poke(T[BTEL], bg); poke(T[BTEL]+1, 7);
    ops.push(['poke', T[BTEL], bg, vt('vramOldHeadBody')]);
    BTEL++; T[BTEL] = A; poke(A, HEAD); poke(A+1, 15);
    ops.push(['poke', A, HEAD, vt('vramDrawHead')]);
    DIR = E; FDIR = E;
  }
  const stuck = !moved && isStuck();                            // a wall/stone bump only kills when there's nowhere left to go
  if(stuck) ops.push(['blk', vt('vramStuck'), '', '']);
  render(); logMove({dir, grow}, ops);
  if(stuck) failAndRestart();
  if(hearts === 0 && !heartsBannerShown){ heartsBannerShown = true; setTimeout(() => log.insertAdjacentHTML('beforeend','<div class="mv">' + vt('vramAllHearts') + '</div>') , 10); }
}

/* ---------- rendering ---------- */
const cv = document.getElementById('screen'), ctx = cv.getContext('2d');
const arrow = { U:'▲', D:'▼', L:'◀', R:'▶' };
const colorOf = ch => ch===HEAD ? getCss('--greenhi') : ch===3 ? getCss('--red') :
  ch===5 ? getCss('--club') : ch===1 ? getCss('--smiley') : ch===10 ? getCss('--stone') :
  ARROWSET.has(ch) ? getCss('--arrow') :
  SNAKE.has(ch) ? getCss('--green') : WALLSET.has(ch) ? getCss('--wall') : null;
const _cssCache = {};   // the visualizer has no theme switcher, so the CRT palette vars never change — read each once
function getCss(v){ return _cssCache[v] ?? (_cssCache[v] = getComputedStyle(document.documentElement).getPropertyValue(v).trim()); }

let hover = null;                                              // {c,r}
function drawScreen(){
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,cv.width,cv.height);
  for(let r = 1; r <= H; r++) for(let c = 1; c <= W; c++){
    const o = off(c,r), ch = vram[o];
    const col = roomCells.has(o) ? getCss('--room') : colorOf(ch);
    if(col){
      ctx.fillStyle = col;
      const bx = (c-1)*CW, by = (r-1)*CH;
      for(let row = 0; row < 16; row++){ const bits = FONT[ch*16+row];
        for(let cc = 0; cc < 8; cc++) if(bits & (0x80>>cc)) ctx.fillRect(bx+cc*SCALE, by+row*SCALE, SCALE, SCALE); }
    }
  }
  if(hover){ ctx.strokeStyle = getCss('--accent'); ctx.lineWidth = 2;
    ctx.strokeRect((hover.c-1)*CW+1, (hover.r-1)*CH+1, CW-2, CH-2); }
  if(screenFlashOn){
    ctx.fillStyle = 'rgba(255, 0, 0, .58)';
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
}

const memEl = document.getElementById('mem'), mcs = [];
memEl.style.gridTemplateColumns = 'repeat(' + W + ', minmax(0, 1fr))';
for(let r = 1; r <= H; r++) for(let c = 1; c <= W; c++){
  const d = document.createElement('div'); d.className = 'mc'; d.dataset.c = c; d.dataset.r = r;
  memEl.appendChild(d); mcs.push(d);
}
function classFor(ch){ return ch===HEAD ? 'head' : ch===3 ? 'heart' :
  ch===5 ? 'club' : ch===1 ? 'smiley' : ch===10 ? 'stone' :
  ARROWSET.has(ch) ? 'arrow' :
  SNAKE.has(ch) ? 'snake' : WALLSET.has(ch) ? 'wall' : ''; }
function updateMemory(){
  for(const d of mcs){
    const o = off(+d.dataset.c, +d.dataset.r), ch = vram[o];
    d.textContent = ch === 32 ? '·' : ch;
    let cls = classFor(ch);
    if(cls === 'wall' && roomCells.has(o)) cls = 'room';
    d.className = 'mc ' + cls + (hover && +d.dataset.c===hover.c && +d.dataset.r===hover.r ? ' hl' : '');
  }
  // flash the cells that changed this step
  for(const o of flashSet){ const cell = cellByOff[o]; if(!cell) continue;
    const d = mcs[(cell.r-1)*W + (cell.c-1)]; d.classList.remove('flash'); void d.offsetWidth; d.classList.add('flash'); }
  flashSet.clear();
}
function render(){
  document.body.classList.toggle('vram-fail-flash', screenFlashOn);
  drawScreen(); updateMemory();
}

/* ---------- log + stats + inspector ---------- */
const log = document.getElementById('log');
function logMove(info, ops){
  if(!info){ log.innerHTML = '<div class="op b">' + vt('vramSteerLog') + '</div>'; return; }
  let h = '<div class="mv">' + vt('vramMove') + arrow[info.dir] + (info.grow ? vt('vramGrow') : '') + '</div>';
  for(const op of ops){
    if(op[0]==='peek') h += '<div class="op"><span class="a">peek(' + op[1] + ')</span> → ' + op[2] + '  <span class="b">' + op[3] + '</span></div>';
    else if(op[0]==='poke') h += '<div class="op"><span class="a">poke(' + op[1] + ', ' + op[2] + ')</span>  <span class="b">' + op[3] + '</span></div>';
    else if(op[0]==='+') h += '<div class="op"><span class="a">' + op[1] + '</span></div>';
    else if(op[0]==='blk') h += '<div class="blk">' + op[1] + '</div>';
  }
  log.innerHTML = h; log.scrollTop = log.scrollHeight;
}
function setHover(c, r){
  const next = (c && r) ? {c, r} : null;
  if((!next && !hover) || (next && hover && next.c === hover.c && next.r === hover.r)) return;   // same cell — skip the full screen+grid re-render
  hover = next; render();
}

/* ---------- input ---------- */
document.querySelectorAll('.pad button').forEach(b => b.addEventListener('click', () => move(b.dataset.d)));
const demo = document.getElementById('demo');
demo.addEventListener('mouseleave', () => setHover());           // clear the hover highlight on the way out
document.addEventListener('keydown', e => {                      // arrows always steer, wherever the pointer is
  const k = {ArrowUp:'U', ArrowDown:'D', ArrowLeft:'L', ArrowRight:'R'}[e.key];
  if(k){ e.preventDefault(); move(k); }
});
cv.addEventListener('mousemove', e => {
  const rect = cv.getBoundingClientRect();
  const c = Math.floor((e.clientX - rect.left) / (rect.width / W)) + 1;
  const r = Math.floor((e.clientY - rect.top) / (rect.height / H)) + 1;
  if(c>=1&&c<=W&&r>=1&&r<=H) setHover(c, r);
});
mcs.forEach(d => d.addEventListener('mouseenter', () => setHover(+d.dataset.c, +d.dataset.r)));

/* swipe the screen to steer (canvas has touch-action:none so the page doesn't scroll under it) */
let swx = 0, swy = 0, swOn = false;
cv.addEventListener('touchstart', e => { const t = e.changedTouches[0]; swx = t.clientX; swy = t.clientY; swOn = true; }, {passive:true});
cv.addEventListener('touchend', e => {
  if(!swOn) return; swOn = false;
  const t = e.changedTouches[0], dx = t.clientX - swx, dy = t.clientY - swy;
  if(Math.hypot(dx, dy) < 24) return;                             // a tap, not a swipe
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'));
}, {passive:true});

/* ---------- buttons ---------- */
document.getElementById('reset').addEventListener('click', () => init());

init();
