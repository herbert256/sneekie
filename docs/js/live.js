'use strict';

const SCENES = ['Open Arena','Combs & Crosses','Room Grid','Stone Field','Picket Columns','Rising Arrows','Sweeping Arrows','The Vault'];
const LEVEL_CHOICES = [1,2,3,4,5,6,7,8,25,26,27,28,29,30,31,32];
const GREEN = '#46ff64', RED = '#ff4040';

// --- the smarter bot, eval'd inside the game iframe (IDX + TARGET are injected before it) ---
const BOT = `
(function(){
  'use strict';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const DIRS = [[72,-160],[80,160],[75,-2],[77,2]];
  const keyOf = {72:' H', 80:' P', 75:' K', 77:' M'};
  const opp = {72:80, 80:72, 75:77, 77:75};
  const tell = (fn,a,b,c) => { try { parent[fn](a,b,c); } catch(e){} };
  const moveDelay = () => { try { return parent.botDelay(); } catch(e){ return 165; } };

  const STEP = {72:-160, 80:160, 75:-2, 77:2};
  const curDir = () => { const d = T[BTEL]-T[BTEL-1]; return d===-160?72:d===160?80:d===-2?75:77; };
  const rowOf = o => Math.trunc(o / 160) + 1;
  const colOf = o => Math.trunc((o % 160) / 2) + 1;
  const visitKey = (o, sc) => o * 100 + sc;
  const dirIdx = sc => sc===72?0:sc===80?1:sc===75?2:3;
  const stateKey = st => (((((st.head>>1)*4 + dirIdx(st.dir))*2000 + (st.body[0]>>1))*2000 + (st.body[st.body.length-2]>>1))*16000 + st.body.length);
  const isFood = c => c===3 || c===5;
  const open = c => c===32 || c===1 || isFood(c);
  const dangerSeen = new Uint16Array(4000), dangerVals = new Uint8Array(4000);
  let dangerGen = 1;
  const resetDanger = () => {
    dangerGen++;
    if(dangerGen >= 65535){ dangerSeen.fill(0); dangerGen = 1; }
  };
  const rawDanger = o => {
    const r = rowOf(o), c = colOf(o);
    if(peek(o)===24 || peek(o)===26 || peek(o)===27) return true;
    if(peek(o+160)===24 || peek(o-2)===26 || peek(o+2)===27) return true;
    if(r===20 && c%2===0 && peek((4-1)*160 + (c-1)*2)===24) return true;
    if(c===2 && r>=4 && r<=20 && peek((r-1)*160 + (79-1)*2)===26) return true;
    if(c===79 && r>=4 && r<=20 && peek((r-1)*160 + (2-1)*2)===27) return true;
    return false;
  };
  const danger = o => {
    if(o >= 0 && o < dangerSeen.length && dangerSeen[o] === dangerGen) return dangerVals[o] === 1;
    const v = rawDanger(o);
    if(o >= 0 && o < dangerSeen.length){ dangerSeen[o] = dangerGen; dangerVals[o] = v ? 1 : 0; }
    return v;
  };
  const makeState = () => {
    const body = [], bodySet = new Set();
    for(let i=ETEL;i<=BTEL;i++){ body.push(T[i]); bodySet.add(T[i]); }
    return { head:T[BTEL], body, bodySet, dir:curDir(), cells:new Map(), first:null, dist:0, ate:0, points:0, smiles:0, stones:0 };
  };
  const cell = (st,o) => {
    const c = st.cells.get(o);
    return c === undefined ? peek(o) : c;
  };
  const move = (st, sc, allowSmile) => {
    if(sc===opp[st.dir]) return null;
    const d = STEP[sc], n = st.head + d;
    if(danger(n) || st.bodySet.has(n)) return null;
    let c = cell(st,n), cells = st.cells, stones = st.stones;
    if(c===1 && !allowSmile) return null;
    if(c===10){
      const nn = n + d;
      if(st.bodySet.has(nn) || cell(st,nn)!==32) return null;
      cells = new Map(cells); cells.set(n,32); cells.set(nn,10); stones++;
    } else if(!open(c)) return null;
    const grow = c===1 || isFood(c), body = st.body.slice(), bodySet = new Set(st.bodySet);
    if(!grow){
      const old = body.shift(); bodySet.delete(old);
      if(cells===st.cells) cells = new Map(cells);
      cells.set(old,32);
    }
    body.push(n); bodySet.add(n);
    if(grow){ if(cells===st.cells) cells = new Map(cells); cells.set(n,32); }
    return {
      head:n, body, bodySet, dir:sc, cells, first:st.first ?? sc, dist:st.dist+1,
      ate:st.ate + (isFood(c)?1:0), points:st.points + (c===5?25:c===3?10:0),
      smiles:st.smiles + (c===1?1:0), stones
    };
  };
  const legal = (st, allowSmile) => {
    const out = [];
    for(const [sc] of DIRS){ const ns = move(st, sc, allowSmile); if(ns) out.push(ns); }
    return out;
  };
  const canMove = (st, sc, allowSmile) => {
    if(sc===opp[st.dir]) return false;
    const d = STEP[sc], n = st.head + d;
    if(danger(n) || st.bodySet.has(n)) return false;
    const c = cell(st,n);
    if(c===1 && !allowSmile) return false;
    if(c===10){
      const nn = n + d;
      return !st.bodySet.has(nn) && cell(st,nn)===32;
    }
    return open(c);
  };
  const legalCount = (st, allowSmile) => {
    let count = 0;
    for(const [sc] of DIRS) if(canMove(st, sc, allowSmile)) count++;
    return count;
  };
  const spaceInfo = st => {
    const tail = st.body[0], seen = new Set([visitKey(st.head, st.dir)]), cells = new Set([st.head]), qo = [st.head], qd = [st.dir];
    let h = 0, tailReach = st.head === tail;
    while(h<qo.length){
      const o = qo[h], dir = qd[h++];
      if(o===tail) tailReach = true;
      for(const [sc,d] of DIRS){
        if(sc===opp[dir]) continue;
        const n = o + d;
        if(danger(n)) continue;
        if(n!==tail && (st.bodySet.has(n) || !open(cell(st,n)))) continue;
        const key = visitKey(n, sc);
        if(seen.has(key)) continue;
        seen.add(key);
        if(cells.size < 1200) cells.add(n);
        qo.push(n); qd.push(sc);
      }
      if(tailReach && cells.size >= 1200) break;
    }
    return { space: cells.size, tailReach };
  };
  const survivalDepth = (start, limit) => {
    let frontier = [start], seen = new Set([stateKey(start)]), best = 0;
    for(let depth=1; depth<=limit; depth++){
      const next = [];
      for(const st of frontier){
        for(const ns of legal(st, true)){
          const key = stateKey(ns);
          if(seen.has(key)) continue;
          seen.add(key);
          next.push([ns, legalCount(ns, true)]);
        }
      }
      if(!next.length) return best;
      best = depth;
      next.sort((a,b) => b[1] - a[1]);
      frontier = next.slice(0,40).map(x => x[0]);
    }
    return best;
  };
  const nearFood = allowSmile => {
    const start = makeState(), q = [start], seen = new Set([stateKey(start)]), few = (HART+KLAVER)<=6;
    const cycle = (LEVEL-1) % 16, arrowLevel = cycle===5 || cycle===6 || cycle===13 || cycle===14;
    const maxDepth = few ? 12 : 9;
    let h = 0, best = null, bs = -1e18;
    while(h<q.length && h<260){
      const st = q[h++];
      if(st.dist >= maxDepth) continue;
      for(const [sc] of DIRS){
        const ns = move(st, sc, allowSmile); if(!ns) continue;
        const key = stateKey(ns);
        if(seen.has(key)) continue; seen.add(key);
        if(ns.ate){
          const exits = legalCount(ns, true);
          if(!exits) continue;
          const info = spaceInfo(ns), sp = info.space, rt = info.tailReach;
          const minSpace = Math.min(170, ns.body.length + (few ? 18 : 8));
          if(!((rt && sp >= Math.min(minSpace, 115)) || sp >= minSpace + 22)) continue;
          const horizon = few ? 14 : (arrowLevel ? 7 : 9);
          const live = survivalDepth(ns, horizon);
          if(live < (few ? 8 : (arrowLevel ? 4 : 6)) && !(rt && exits > 1)) continue;
          const score = -ns.dist*6200 + (rt?32000:0) + live*2600 + exits*1600 +
            sp*8 + ns.points*120 - ns.smiles*900 - ns.stones*45 - (exits===1?9000:0);
          if(score > bs){ bs = score; best = ns.first; }
        } else q.push(ns);
      }
    }
    return best;
  };
  const routeFood = allowSmile => {
    const start = makeState(), q = [start], seen = new Set(), few = (HART+KLAVER)<=6;
    const cycle = (LEVEL-1) % 16, arrowLevel = cycle===5 || cycle===6 || cycle===13 || cycle===14;
    const maxDepth = few ? 115 : 78; let h = 0, checked = 0, best = null, bs = -1e18;
    seen.add(stateKey(start));
    while(h<q.length && h<950){
      const st = q[h++];
      if(st.dist >= maxDepth) continue;
      for(const [sc] of DIRS){
        const ns = move(st, sc, allowSmile); if(!ns) continue;
        const key = stateKey(ns);
        if(seen.has(key)) continue; seen.add(key);
        if(ns.ate){
          checked++;
          const exits = legalCount(ns, true);
          if(!exits) continue;
          const info = spaceInfo(ns), sp = info.space, rt = info.tailReach;
          const minSpace = Math.min(190, ns.body.length + (few ? 24 : 12));
          const spacious = (rt && sp >= minSpace) || sp >= minSpace + 42;
          if(!spacious) continue;
          const horizon = few ? 22 : (arrowLevel ? 12 : 16), live = survivalDepth(ns, horizon);
          const corridorOk = exits > 1 || arrowLevel || (live >= horizon && rt && sp >= minSpace + 50);
          if(corridorOk && live >= (few ? 14 : (arrowLevel ? 7 : 10)) && ((rt && sp >= minSpace) || sp >= minSpace + 42)){
            const score = (rt?100000:0) + live*5600 + exits*2400 + sp*16 + ns.points*150 - ns.dist*260 - ns.smiles*1200 - ns.stones*55 - (exits===1?18000:0);
            if(score > bs){ bs = score; best = ns.first; }
          }
          if(checked >= 28 && best !== null) return best;
        } else q.push(ns);
      }
    }
    return best;
  };
  const pressureFood = (allowSmile, urgent) => {
    const start = makeState(), q = [start], seen = new Set([stateKey(start)]), few = (HART+KLAVER)<=6;
    const cycle = (LEVEL-1) % 16, arrowLevel = cycle===5 || cycle===6 || cycle===13 || cycle===14;
    const maxDepth = few ? (urgent ? 125 : 100) : (urgent ? 88 : 70);
    const scanLimit = urgent ? 1050 : 720, checkLimit = urgent ? 38 : 22;
    let h = 0, checked = 0, best = null, bs = -1e18;
    while(h<q.length && h<scanLimit){
      const st = q[h++];
      if(st.dist >= maxDepth) continue;
      for(const [sc] of DIRS){
        const ns = move(st, sc, allowSmile); if(!ns) continue;
        const key = stateKey(ns);
        if(seen.has(key)) continue; seen.add(key);
        if(ns.ate){
          checked++;
          const exits = legalCount(ns, true);
          if(!exits) continue;
          const info = spaceInfo(ns), sp = info.space, rt = info.tailReach;
          const minSpace = Math.min(150, ns.body.length + (few ? 12 : 6));
          if(sp < Math.min(minSpace, 80) && !rt) continue;
          const horizon = urgent ? (arrowLevel ? 6 : 8) : (arrowLevel ? 8 : 10);
          const live = survivalDepth(ns, horizon);
          if(live < (urgent ? 3 : 5) && exits < 2 && !rt) continue;
          const trapCost = exits===1 ? (urgent ? 3800 : 9000) : 0;
          const smileCost = urgent ? 450 : 900;
          const score = (rt?36000:0) + live*3600 + exits*2100 + sp*13 + ns.points*230 -
            ns.dist*(urgent?110:190) - ns.smiles*smileCost - ns.stones*40 - trapCost;
          if(score > bs){ bs = score; best = ns.first; }
          if(checked >= checkLimit && best !== null) return best;
        } else q.push(ns);
      }
    }
    return best;
  };
  const tailFirst = () => {
    const st = makeState(), tail = st.body[0], first = new Map(), seen = new Set([st.head]), q = [st.head]; let h = 0;
    while(h<q.length){
      const o = q[h++];
      for(const [sc,d] of DIRS){
        if(o===st.head && sc===opp[st.dir]) continue;
        const n = o + d;
        if(o===st.head && n===tail) continue;
        if(seen.has(n) || danger(n)) continue;
        if(n!==tail && (st.bodySet.has(n) || !open(cell(st,n)))) continue;
        const f = o===st.head ? sc : first.get(o);
        if(n===tail && move(st, f, true)) return f;
        seen.add(n); first.set(n, f); q.push(n);
      }
    }
    return null;
  };
  const survivalMove = () => {
    const st = makeState(); let best = null, bs = -1e18;
    for(const ns of legal(st, true)){
      const c = cell(st, st.head + STEP[ns.first]), exits = legalCount(ns, true);
      if(!exits) continue;
      const info = spaceInfo(ns);
      const sp = info.space, rt = info.tailReach;
      const score = (rt?60000:0) + sp*24 + exits*900 + (isFood(c)?1200:0) - (c===1?1400:0) - ns.stones*35 + (ns.first===st.dir?40:0);
      if(score > bs){ bs = score; best = ns.first; }
    }
    return best;
  };
  const decide = (idle, looping) => {
    resetDanger();
    const urgent = idle >= 45 || looping;
    return nearFood(false) ?? routeFood(false) ?? nearFood(true) ?? routeFood(true) ??
      (urgent ? (pressureFood(false, true) ?? pressureFood(true, true)) : null) ??
      (!urgent ? tailFirst() : null) ??
      pressureFood(false, urgent) ?? pressureFood(true, urgent) ??
      survivalMove();
  };

  const ready = () => { try { return typeof LEVEL!=='undefined' && LEVEL>=1 && BTEL===2 && T[2]===1840; } catch(e){ return false; } };

  (async () => {
   try {
    for(let i=0;i<400 && !ready(); i++) await sleep(50);
    if(!ready()){ tell('botEnd', IDX, false); return; }
    // jump straight to TARGET: set the loop counter and skip once (no 24-level grind)
    pushKey('\\r'); await sleep(120);
    LEVEL = TARGET - 1; pushKey(' D');
    for(let w=0;w<500 && LEVEL!==TARGET;w++) await sleep(8);
    for(let w=0;w<200 && !(BTEL===2 && T[2]===1840);w++) await sleep(8);
    pushKey('\\r'); await sleep(120);
    let lastScore = ZCORE, idle = 0, lastHead = BTEL, stall = 0;
    const headTrail = [];
    while(true){
      if(typeof LEVEL==='undefined'){ tell('botEnd', IDX, false); return; }
      if(LEVEL === TARGET+1 && LIVE > 0){ tell('botEnd', IDX, true); return; }   // cleared the level -> green
      if(LEVEL !== TARGET){ tell('botEnd', IDX, false); return; }                 // game-over / jumped away -> red
      if(BTEL > lastHead){ lastHead = BTEL; stall = 0; } else stall++;
      if(stall > 15){ tell('botEnd', IDX, false); return; }                       // head not advancing (boxed/dying) -> red
      const f = HART+KLAVER; if(f<=2) BONUS=0;
      // progress = the score rising (the bot ate something). In levels >16 a heart spawns a
      // club, so HART+KLAVER can sit flat while the snake is busy eating — the score is the
      // honest signal, so idle off that, not off the item count.
      if(ZCORE > lastScore){ idle = 0; } else idle++; lastScore = ZCORE;
      tell('botStatus', IDX, ZCORE, f);
      // Endgame clubs can take a long safe path without scoring; keep the quick stuck
      // detector early, but give the last few items enough moves to finish.
      const idleLimit = f<=1 ? 520 : f<=2 ? 400 : f<=4 ? 280 : f<=8 ? 210 : 160;
      if(idle > idleLimit){ tell('botEnd', IDX, false); return; }                 // no score gain for too long -> red
      headTrail.push(T[BTEL]);
      if(headTrail.length > 96) headTrail.shift();
      let repeats = 0;
      for(let i=0;i<headTrail.length-10;i++) if(headTrail[i]===T[BTEL]) repeats++;
      const looping = idle > 24 && repeats >= 2;
      const sc = decide(idle, looping);
      if(sc===null){ tell('botEnd', IDX, false); return; }                        // no safe move -> red
      pushKey(keyOf[sc]);
      await sleep(moveDelay());
    }
   } catch(e){ tell('botEnd', IDX, false); }
  })();
})();
`;

const HIDE = '<style>header.top,.hero,#controls,#touchbar,#hint,footer{display:none!important}' +
  'html,body{margin:0!important;padding:0!important;background:#000!important;width:100%!important;height:100%!important;min-height:0!important;display:block!important;overflow:hidden!important}' +
  '#bezel{margin:0!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:#000!important;animation:none!important;gap:0!important;width:100%!important;height:100%!important;display:block!important}' +
  '#tube{margin:0!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:#000!important;width:100%!important;height:100%!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important}' +
  '#glass,#panel{display:none!important}' +
  '#screen{display:block!important;width:100%!important;height:100%!important;margin:0!important;image-rendering:pixelated!important;border-radius:0!important;box-shadow:none!important}</style>';

let activeLevel = 25, gen = 0;
const cell = {};
const tabs = new Map();
const tablist = document.getElementById('leveltabs');
const grid = document.getElementById('cells');
const speed = document.getElementById('speed');
const speedout = document.getElementById('speedout');
let botSpeed = Number(speed.value);

function speedToDelay(value){
  return Math.round(45 + 375 * Math.pow((100 - value) / 100, 1.6));
}

function updateSpeed(){
  botSpeed = Number(speed.value);
  speedout.value = String(botSpeed);
  speedout.textContent = String(botSpeed);
}
speed.addEventListener('input', updateSpeed);
updateSpeed();
function botDelay(){ return speedToDelay(botSpeed); }
window.botDelay = botDelay;

for(const level of LEVEL_CHOICES){
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('role', 'tab');
  btn.dataset.level = String(level);
  btn.textContent = 'Level ' + level;
  btn.setAttribute('aria-selected', String(level === activeLevel));
  btn.addEventListener('click', () => setLevel(level));
  tablist.appendChild(btn);
  tabs.set(level, btn);
}

{
  const fig = document.createElement('figure'); fig.className = 'cell';
  fig.innerHTML =
    '<figcaption><span class="lv"></span> <span class="dim"></span><span class="st"></span></figcaption>' +
    '<div class="frame"><iframe tabindex="-1" allow="fullscreen"></iframe><div class="flash"></div></div>';
  grid.appendChild(fig);
  cell.frame = fig.querySelector('iframe');
  cell.frameBox = fig.querySelector('.frame');
  cell.flash = fig.querySelector('.flash');
  cell.st = fig.querySelector('.st');
  cell.lv = fig.querySelector('.lv');
  cell.scene = fig.querySelector('.dim');
}

function sceneFor(level){ return SCENES[(level - 1) % 8]; }

function updateLabel(){
  cell.lv.textContent = 'Level ' + activeLevel;
  cell.scene.innerHTML = '&middot; ' + sceneFor(activeLevel);
  cell.frame.title = 'Sneekie level ' + activeLevel;
  tabs.forEach((btn, level) => btn.setAttribute('aria-selected', String(level === activeLevel)));
}

let liveAudioForced = false;   // default the demo to sound-on once; respect the user's toggle after that
function liveGameHref(){ return sitePageHref('game') + '?noboot'; }
function inject(){
  try {
    cell.frame.contentDocument.head.insertAdjacentHTML('beforeend', HIDE);
    fitFullscreenFrame();
    primeGameAudio(!liveAudioForced);   // only force-unmute on the first load, not on every level reload
    liveAudioForced = true;
    cell.frame.contentWindow.eval('var IDX=0,TARGET=' + activeLevel + ';' + BOT);
    wireGameFullscreenEvents();
    syncControls();
  } catch(e){ cell.st.className = 'st stuck'; cell.st.textContent = ' — ' + e.message; }
}

function reloadCell(){
  try { cell.frame.contentWindow.location.reload(); } catch(e){ cell.frame.src = liveGameHref(); }
}

window.botStatus = (idx, score, left) => {
  cell.st.className = 'st';
  cell.st.textContent = left <= 0 ? ' — clearing…' : ' — score ' + score + ' · ' + left + ' left';
};

let flashTimers = [];
function clearFlash(){
  flashTimers.forEach(clearTimeout);
  flashTimers = [];
}
function flash(el, color, done){
  clearFlash();   // cancel any in-flight flash so rapid switches don't stack or double-advance
  // Honor a reduced-motion preference: show a single static win/stuck tint and
  // advance, instead of pulsing the overlay five times.
  if(matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches){
    el.style.background = color;
    el.style.opacity = '0.4';
    flashTimers.push(setTimeout(() => { el.style.opacity = '0'; done(); }, 1400));
    return;
  }
  el.style.background = color;
  let k = 0;
  (function tick(){
    if(k >= 5){ flashTimers.push(setTimeout(done, 320)); return; }
    el.style.opacity = '0.82';
    flashTimers.push(setTimeout(() => { el.style.opacity = '0'; }, 300));
    k++;
    flashTimers.push(setTimeout(tick, 1000));   // 1 s between flashes
  })();
}

window.botEnd = (idx, win) => {
  const g = gen;
  cell.st.className = win ? 'st win' : 'st stuck';
  cell.st.textContent = win ? ' — cleared! next level…' : ' — stuck — next level…';
  flash(cell.flash, win ? GREEN : RED, () => { if(g === gen) stepLevel(1); });
};

function setLevel(level){
  if(activeLevel === level) return;
  activeLevel = level; gen++;   // invalidate any in-flight flash restarts
  clearFlash();                 // stop the leaving level's pulse and its auto-advance
  if(cell.flash) cell.flash.style.opacity = '0';
  updateLabel();
  cell.st.className = 'st'; cell.st.textContent = ' — restarting…';
  fitFullscreenFrame();
  reloadCell();
}

/* ---- the six game controls below the screen (drive the iframe's own hidden controls) ---- */
function gameDoc(){ try { return cell.frame.contentDocument; } catch(e){ return null; } }
function primeGameAudio(forceOn=false, startAudio=false){
  if(forceOn) lsSet('sneekie.muted', '0');
  const unmuted = lsGet('sneekie.muted') !== '1';
  try {
    cell.frame.contentWindow.eval(
      "try{muted=" + JSON.stringify(!unmuted) + ";lsSet('sneekie.muted'," +
      JSON.stringify(unmuted ? '0' : '1') + ");" +
      (unmuted && startAudio ? "ensureAudio();" : "") +
      "paintMute();}catch(e){}"
    );
  } catch(e){}
}
const ctlThemes = [...document.querySelectorAll('#controls #themes button')];
const ctlMute = document.getElementById('mute');
const ctlFs = document.getElementById('fs');
function fullscreenElement(doc){ return doc && (doc.fullscreenElement || doc.webkitFullscreenElement) || null; }
function requestFullscreen(el){
  const fn = el && (el.requestFullscreen || el.webkitRequestFullscreen);
  return fn ? Promise.resolve(fn.call(el)) : Promise.reject(new Error('fullscreen unavailable'));
}
function exitFullscreen(doc){
  const fn = doc && (doc.exitFullscreen || doc.webkitExitFullscreen);
  return fn ? Promise.resolve(fn.call(doc)) : Promise.resolve();
}
function isLiveFullscreen(){
  return fullscreenElement(document) === cell.frameBox ||
    !!fullscreenElement(gameDoc()) ||
    cell.frameBox.classList.contains('live-fullscreen');
}
function syncControls(){
  const theme = lsGet('sneekie.theme') || 'cga';
  ctlThemes.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.theme === theme)));
  ctlMute.textContent = lsGet('sneekie.muted') === '1' ? 'Sound: off' : 'Sound: on';
  ctlFs.setAttribute('aria-pressed', String(isLiveFullscreen()));
}
function fitFullscreenFrame(){
  if(fullscreenElement(document) === cell.frameBox || cell.frameBox.classList.contains('live-fullscreen')){
    const scale = Math.min(innerWidth / 640, innerHeight / 384);
    cell.frame.style.width = Math.round(640 * scale) + 'px';
    cell.frame.style.height = Math.round(384 * scale) + 'px';
  } else {
    cell.frame.style.width = '';
    cell.frame.style.height = '';
  }
}
function enterFallbackFullscreen(){
  cell.frameBox.classList.add('live-fullscreen');
  document.body.style.overflow = 'hidden';
  fitFullscreenFrame();
  syncControls();
}
function exitFallbackFullscreen(){
  cell.frameBox.classList.remove('live-fullscreen');
  document.body.style.overflow = '';
  fitFullscreenFrame();
  syncControls();
}
function wireGameFullscreenEvents(){
  const d = gameDoc();
  if(!d || d.__sneekieLiveFullscreenWired) return;
  d.__sneekieLiveFullscreenWired = true;
  d.addEventListener('fullscreenchange', () => { fitFullscreenFrame(); syncControls(); });
  d.addEventListener('webkitfullscreenchange', () => { fitFullscreenFrame(); syncControls(); });
}
function exitAnyFullscreen(){
  const d = gameDoc();
  if(fullscreenElement(d)){ exitFullscreen(d); return true; }
  if(fullscreenElement(document)){ exitFullscreen(document); return true; }
  if(cell.frameBox.classList.contains('live-fullscreen')){ exitFallbackFullscreen(); return true; }
  return false;
}
ctlThemes.forEach(b => b.addEventListener('click', () => {
  lsSet('sneekie.theme', b.dataset.theme);                                // persists across the frequent iframe reloads
  const d = gameDoc(), gb = d && d.querySelector('#themes button[data-theme="' + b.dataset.theme + '"]');
  if(gb) gb.click();                                                      // apply to the running game now (reuses applyTheme)
  syncControls();
}));
ctlMute.addEventListener('click', () => {
  const d = gameDoc(), gm = d && d.getElementById('mute');
  if(gm) gm.click(); else lsSet('sneekie.muted', lsGet('sneekie.muted') === '1' ? '0' : '1');
  syncControls();
});
ctlFs.addEventListener('click', () => {
  if(exitAnyFullscreen()) return;
  requestFullscreen(cell.frameBox).catch(enterFallbackFullscreen);
});
document.addEventListener('fullscreenchange', () => { if(!fullscreenElement(document)) exitFallbackFullscreen(); fitFullscreenFrame(); syncControls(); });
document.addEventListener('webkitfullscreenchange', () => { if(!fullscreenElement(document)) exitFallbackFullscreen(); fitFullscreenFrame(); syncControls(); });
addEventListener('resize', fitFullscreenFrame);
addEventListener('keydown', e => {
  primeGameAudio(false, true);
  if(e.key === 'Escape' && cell.frameBox.classList.contains('live-fullscreen')){
    exitFallbackFullscreen();
  }
});
addEventListener('pointerdown', () => primeGameAudio(false, true));
addEventListener('touchstart', () => primeGameAudio(false, true), {passive:true});
primeGameAudio(true);
syncControls();

/* ---- viewer keyboard: step through levels (the game itself can't be steered — the iframe is inert) ---- */
function stepLevel(dir){
  const i = LEVEL_CHOICES.indexOf(activeLevel);
  const n = ((i < 0 ? 0 : i) + dir + LEVEL_CHOICES.length) % LEVEL_CHOICES.length;
  setLevel(LEVEL_CHOICES[n]);                 // wraps: after 32 back to 1, before 1 back to 32
}
document.addEventListener('keydown', e => {
  // Leave focused controls to handle their own Space/Arrow keys: the speed
  // slider, the theme/mute/fullscreen buttons, the level tabs, and links.
  // Without this, Space on a focused button both activated it and stepped the
  // level, and arrows moved levels instead of moving within the control.
  const t = e.target;
  if(t && t.closest && t.closest('a, button, input, select, textarea, [role="tab"]')) return;
  if(e.key === ' ' || e.key === 'Spacebar' || e.key === 'ArrowRight'){ e.preventDefault(); stepLevel(1); }
  else if(e.key === 'ArrowLeft'){ e.preventDefault(); stepLevel(-1); }
});

// start the selected level
updateLabel();
cell.frame.addEventListener('load', inject);
cell.frame.src = liveGameHref();
