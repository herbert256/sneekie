'use strict';
/* bot.js — the Live bot, running in THIS page (no iframe, so it works from file://
   too). game.js renders the real game into #screen; this script reads game.js's
   globals (peek, T, BTEL, ETEL, LEVEL, HART, KLAVER, ZCORE) directly and steers via
   pushKey(). Level tabs jump the bot into the late-game mazes 26-32; the speed slider
   sets the pace. Wrapped in an IIFE so it never redeclares game.js's globals. */
(function(){
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---- speed: a 0-10 slider mapped to a per-move delay ---- */
  const SPEED_CHOICES = [10,10,20,30,49,50,60,70,80,90,100];
  const speed = document.getElementById('speed');
  const speedout = document.getElementById('speedout');
  let botSpeed = 50;
  function speedToDelay(value){ return Math.round(45 + 375 * Math.pow((100 - value) / 100, 1.6)); }
  function speedIndex(){
    const value = Number(speed.value);
    if(Number.isFinite(value)) return Math.max(0, Math.min(SPEED_CHOICES.length - 1, Math.round(value)));
    return SPEED_CHOICES.indexOf(50);
  }
  function updateSpeed(){
    const index = speedIndex();
    botSpeed = SPEED_CHOICES[index];
    speed.value = String(index);
    speedout.value = String(botSpeed);
    speedout.textContent = String(botSpeed);
    speed.setAttribute('aria-valuetext', String(botSpeed));
  }
  if(speed){
    speed.min = '0'; speed.max = String(SPEED_CHOICES.length - 1); speed.step = '1';
    speed.addEventListener('input', updateSpeed);
    updateSpeed();
  }
  function botDelay(){ return speedToDelay(botSpeed); }

  const DIRS = [[72,-160],[80,160],[75,-2],[77,2]];
  const keyOf = {72:' H', 80:' P', 75:' K', 77:' M'};
  const opp = {72:80, 80:72, 75:77, 77:75};

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

  /* ---- level tabs (26-32): which late-game maze the bot drops into ---- */
  const LEVELS = [26,27,28,29,30,31,32];
  let target = 26, pendingJump = 26;
  const tablist = document.getElementById('leveltabs');
  const pageLang = typeof window.sneekieLang === 'function' ? window.sneekieLang() : document.documentElement.lang;
  const levelPrefix = pageLang === 'uk' ? 'Рівень ' : 'Level ';
  const tabs = new Map();
  function markTabs(){ tabs.forEach((b, n) => b.setAttribute('aria-pressed', String(n === target))); }
  function wake(){ if(typeof ensureAudio === 'function') ensureAudio(); }   // audio needs a user gesture
  if(tablist){
    for(const n of LEVELS){
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.level = String(n);
      b.textContent = levelPrefix + n;
      b.addEventListener('click', () => { wake(); target = n; pendingJump = n; markTabs(); });
      tablist.appendChild(b); tabs.set(n, b);
    }
    markTabs();
  }
  addEventListener('pointerdown', wake);
  addEventListener('keydown', wake);

  /* ---- driver: drive game.js continuously, jumping to the selected level ----
     Each tick we press one key. The bot's own move keys dismiss the "Level n /
     press any key" popups. When the game ends, playLevels() returns and the
     FOR loop leaves LEVEL at 33, parking at "Play again (y/n)". That happens both
     on a final death (snake fully unwound, ETEL > BTEL) AND on a clean win where
     the bot clears the last level with the snake intact (ETEL <= BTEL) -- so we
     key off LEVEL > 32, not the snake state, or a clean win would freeze here. */
  const yesKey = () => (typeof gt === 'function' ? gt('yesInput') : 'y');
  (async () => {
    let idle = 0, prevScore = 0, over = 0;
    const headTrail = [];
    while(true){
      if(typeof LEVEL === 'undefined' || LEVEL < 1){ await sleep(botDelay()); continue; }   // wait for the game to start
      // game finished (final death or clean win) -> answer "play again", re-target.
      // Checked before the jump below so a tab click can't overwrite LEVEL first.
      if(LEVEL > 32){
        if(++over >= 4){ pushKey('\r'); pushKey(yesKey()); pendingJump = target; over = 0; }
        await sleep(botDelay()); continue;
      }
      over = 0;
      // mid-death unwind: snake is retracting -> wait it out, don't act on a half-state
      if(ETEL > BTEL){ await sleep(botDelay()); continue; }
      // jump to the selected level once the snake is safely in the move loop
      if(pendingJump !== null && BTEL > 2 && ETEL <= BTEL){
        LEVEL = pendingJump - 1; pushKey(' D');          // F10 skips straight into the target level
        pendingJump = null; idle = 0; headTrail.length = 0;
        await sleep(botDelay()); continue;
      }
      if(ZCORE > prevScore) idle = 0; else idle++;
      prevScore = ZCORE;
      headTrail.push(T[BTEL]);
      if(headTrail.length > 96) headTrail.shift();
      let repeats = 0;
      for(let i = 0; i < headTrail.length - 10; i++) if(headTrail[i] === T[BTEL]) repeats++;
      const looping = idle > 24 && repeats >= 2;
      const sc = decide(idle, looping);
      if(sc !== null) pushKey(keyOf[sc]);              // a safe move
      else if(BTEL <= 2) pushKey('\r');               // under the level popup -> any key dismisses it
      else pushKey('\x1b');                            // boxed mid-level -> give up like a player (ESC)
      await sleep(botDelay());
    }
  })();
})();
