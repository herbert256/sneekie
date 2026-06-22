'use strict';
/* bot-engine.js - planner for the Live bot. It reads one compact snapshot from the
   real game each tick, searches that snapshot, and returns one DOS arrow scancode.
   game.js remains the only game engine; bot.js still presses normal keys. */
(function(){
  const DIRS = [[72,-160],[80,160],[75,-2],[77,2]];
  const STEP = {72:-160, 80:160, 75:-2, 77:2};
  const opp = {72:80, 80:72, 75:77, 77:75};
  const isFood = c => c===3 || c===5;
  const open = c => c===32 || c===1 || isFood(c);
  const rowOf = o => Math.trunc(o / 160) + 1;
  const colOf = o => Math.trunc((o % 160) / 2) + 1;
  const visitKey = (o, sc) => o * 100 + sc;
  const dirIdx = sc => sc===72?0:sc===80?1:sc===75?2:3;
  const stateKey = st => (((((st.head>>1)*4 + dirIdx(st.dir))*2000 + (st.body[0]>>1))*2000 + (st.body[st.body.length-2]>>1))*16000 + st.body.length);
  const defaultNow = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const scriptSrc = document.currentScript && document.currentScript.src;
  const wasmUrl = scriptSrc ? new URL('bot-engine.wasm', scriptSrc).href : 'bot-engine.wasm';
  const isArrowKey = sc => sc===72 || sc===80 || sc===75 || sc===77;

  function createJs(access){
    const board = new Uint16Array(4000);
    const dangerSeen = new Uint16Array(4000);
    const dangerVals = new Uint8Array(4000);
    const now = access.now || defaultNow;
    let dangerGen = 1, routeDeadline = 0, model = null;

    const routeTimeUp = () => routeDeadline > 0 && now() >= routeDeadline;
    const baseCell = o => (o >= 0 && o < board.length) ? board[o] : 0;
    const resetDanger = () => {
      dangerGen++;
      if(dangerGen >= 65535){ dangerSeen.fill(0); dangerGen = 1; }
    };
    const capture = () => {
      const g = access.state();
      for(let o=0; o<board.length; o+=2) board[o] = access.peek(o);
      const body = [], bodySet = new Set();
      for(let i=g.ETEL; i<=g.BTEL; i++){
        const off = g.T[i];
        body.push(off);
        bodySet.add(off);
      }
      const delta = g.T[g.BTEL] - g.T[g.BTEL - 1];
      const dir = delta===-160 ? 72 : delta===160 ? 80 : delta===-2 ? 75 : 77;
      return { level:g.LEVEL, items:g.HART + g.KLAVER, body, bodySet, head:g.T[g.BTEL], dir };
    };
    const rawDanger = o => {
      const r = rowOf(o), c = colOf(o);
      if(baseCell(o)===24 || baseCell(o)===26 || baseCell(o)===27) return true;
      if(baseCell(o+160)===24 || baseCell(o-2)===26 || baseCell(o+2)===27) return true;
      if(r===20 && c%2===0 && baseCell((4-1)*160 + (c-1)*2)===24) return true;
      if(c===2 && r>=4 && r<=20 && baseCell((r-1)*160 + (79-1)*2)===26) return true;
      if(c===79 && r>=4 && r<=20 && baseCell((r-1)*160 + (2-1)*2)===27) return true;
      return false;
    };
    const danger = o => {
      if(o >= 0 && o < dangerSeen.length && dangerSeen[o] === dangerGen) return dangerVals[o] === 1;
      const v = rawDanger(o);
      if(o >= 0 && o < dangerSeen.length){ dangerSeen[o] = dangerGen; dangerVals[o] = v ? 1 : 0; }
      return v;
    };
    const makeState = () => ({
      head:model.head,
      body:model.body,
      bodySet:model.bodySet,
      dir:model.dir,
      cells:new Map(),
      first:null,
      dist:0,
      ate:0,
      points:0,
      smiles:0,
      stones:0
    });
    const cell = (st,o) => {
      const c = st.cells.get(o);
      return c === undefined ? baseCell(o) : c;
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
    const spaceInfo = (st, limited = true) => {
      const tail = st.body[0], seen = new Set([visitKey(st.head, st.dir)]), cells = new Set([st.head]), qo = [st.head], qd = [st.dir];
      let h = 0, tailReach = st.head === tail;
      while(h<qo.length && (!limited || !routeTimeUp())){
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
        if(routeTimeUp()) return best;
        const next = [];
        for(const st of frontier){
          if(routeTimeUp()) return best;
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
    const escapeProof = (start, minSpace, limit, allowSmile) => {
      let frontier = [start], seen = new Set([stateKey(start)]);
      let best = { ok:false, depth:0, space:0, tailReach:false, exits:0 };
      for(let depth=1; depth<=limit; depth++){
        if(routeTimeUp()) return best;
        const next = [];
        for(const st of frontier){
          if(routeTimeUp()) return best;
          for(const ns of legal(st, allowSmile)){
            const key = stateKey(ns);
            if(seen.has(key)) continue;
            seen.add(key);
            const exits = legalCount(ns, true);
            if(!exits) continue;
            const info = spaceInfo(ns);
            if(info.space > best.space || (info.tailReach && !best.tailReach)){
              best = { ok:false, depth, space:info.space, tailReach:info.tailReach, exits };
            }
            const openRegion = exits >= 2 && info.space >= minSpace + (depth <= 2 ? 28 : 12);
            const movingTail = info.tailReach && info.space >= Math.min(minSpace + 8, 150);
            if(openRegion || movingTail) return { ok:true, depth, space:info.space, tailReach:info.tailReach, exits };
            next.push([ns, info.space + exits*45 + (info.tailReach ? 220 : 0) - ns.smiles*30 - ns.stones*3]);
          }
        }
        if(!next.length) return best;
        next.sort((a,b) => b[1] - a[1]);
        frontier = next.slice(0,48).map(x => x[0]);
      }
      return best;
    };
    const returnBuffer = (len, few) => (len >= 120 ? 190 : len >= 80 ? 155 : len >= 45 ? 124 : 96) + (few ? 32 : 0);
    const returnRoom = (info, exits, len, few) =>
      info.tailReach || (exits >= 3 && info.space >= len + returnBuffer(len, few) + 72);
    const needsBreathing = () => {
      const st = makeState(), few = model.items <= 6, exits = legalCount(st, true);
      if(exits <= 1) return true;
      const info = spaceInfo(st, true), len = st.body.length;
      return (!info.tailReach && info.space < len + (few ? 132 : 96)) ||
        (len >= 58 && (exits <= 2 || info.space < len + 150)) ||
        (len >= 96 && exits <= 3);
    };
    const nearFood = allowSmile => {
      const start = makeState(), q = [start], seen = new Set([stateKey(start)]), few = model.items<=6;
      const cycle = (model.level-1) % 16, arrowLevel = cycle===5 || cycle===6 || cycle===13 || cycle===14;
      const maxDepth = few ? 12 : 9;
      let h = 0, best = null, bs = -1e18;
      while(h<q.length && h<260 && !routeTimeUp()){
        const st = q[h++];
        if(st.dist >= maxDepth) continue;
        for(const [sc] of DIRS){
          if(routeTimeUp()) return best;
          const ns = move(st, sc, allowSmile); if(!ns) continue;
          if(allowSmile && ns.smiles > 1) continue;
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
            const escape = escapeProof(ns, minSpace, few ? 10 : (arrowLevel ? 5 : 7), allowSmile);
            if(!escape.ok) continue;
            const returnOpen = rt || escape.tailReach;
            if(!returnOpen) continue;
            if(live < (few ? 8 : (arrowLevel ? 4 : 6)) && !(returnOpen && exits > 1)) continue;
            const smileCredit = ns.smiles && !rt && escape.tailReach ? ns.smiles*1500 : 0;
            const score = -ns.dist*6200 + (rt?32000:0) + live*2600 + exits*1600 +
              sp*8 + escape.space*4 + (escape.tailReach?8000:0) + ns.points*120 -
              ns.smiles*8500 + smileCredit - ns.stones*45 - (exits===1?9000:0);
            if(score > bs){ bs = score; best = ns.first; }
          } else q.push(ns);
        }
      }
      return best;
    };
    const routeFood = allowSmile => {
      const start = makeState(), q = [start], seen = new Set(), few = model.items<=6;
      const cycle = (model.level-1) % 16, arrowLevel = cycle===5 || cycle===6 || cycle===13 || cycle===14;
      const maxDepth = few ? 115 : 78; let h = 0, checked = 0, best = null, bs = -1e18;
      seen.add(stateKey(start));
      while(h<q.length && h<950 && !routeTimeUp()){
        const st = q[h++];
        if(st.dist >= maxDepth) continue;
        for(const [sc] of DIRS){
          if(routeTimeUp()) return best;
          const ns = move(st, sc, allowSmile); if(!ns) continue;
          if(allowSmile && ns.smiles > 1) continue;
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
            const escape = escapeProof(ns, minSpace, few ? 16 : (arrowLevel ? 8 : 12), allowSmile);
            if(!escape.ok) continue;
            const returnOpen = rt || escape.tailReach;
            if(!returnOpen) continue;
            const corridorOk = exits > 1 || arrowLevel || (live >= horizon && rt && sp >= minSpace + 50);
            if(corridorOk && live >= (few ? 14 : (arrowLevel ? 7 : 10)) && ((rt && sp >= minSpace) || sp >= minSpace + 42)){
              const smileCredit = ns.smiles && !rt && escape.tailReach ? ns.smiles*2600 : 0;
              const score = (rt?140000:0) + live*5600 + exits*2400 + sp*16 +
                escape.space*8 + (escape.tailReach?42000:0) + ns.points*150 -
                ns.dist*260 - ns.smiles*11500 + smileCredit - ns.stones*55 - (exits===1?18000:0);
              if(score > bs){ bs = score; best = ns.first; }
            }
            if(checked >= 28 && best !== null) return best;
          } else q.push(ns);
        }
      }
      return best;
    };
    const pressureFood = (allowSmile, urgent) => {
      const start = makeState(), q = [start], seen = new Set([stateKey(start)]), few = model.items<=6;
      const cycle = (model.level-1) % 16, arrowLevel = cycle===5 || cycle===6 || cycle===13 || cycle===14;
      const maxDepth = few ? (urgent ? 125 : 100) : (urgent ? 88 : 70);
      const scanLimit = urgent ? 1050 : 720, checkLimit = urgent ? 38 : 22;
      let h = 0, checked = 0, best = null, bs = -1e18;
      while(h<q.length && h<scanLimit && !routeTimeUp()){
        const st = q[h++];
        if(st.dist >= maxDepth) continue;
        for(const [sc] of DIRS){
          if(routeTimeUp()) return best;
          const ns = move(st, sc, allowSmile); if(!ns) continue;
          if(allowSmile && ns.smiles > (urgent || few ? 2 : 1)) continue;
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
            const escape = escapeProof(ns, minSpace, urgent ? (arrowLevel ? 5 : 7) : (arrowLevel ? 7 : 9), allowSmile);
            if(!escape.ok) continue;
            const returnOpen = rt || escape.tailReach;
            const roomyNoTail = !returnOpen && exits >= 3 && sp >= ns.body.length + returnBuffer(ns.body.length, few) + (urgent ? 54 : 86);
            if(!returnOpen && !roomyNoTail && (!urgent || ns.body.length >= 58)) continue;
            if(live < (urgent ? 3 : 5) && exits < 2 && !returnOpen) continue;
            const trapCost = exits===1 ? (urgent ? 3800 : 9000) : 0;
            const smileCost = urgent ? 5800 : 8000;
            const smileCredit = ns.smiles && !rt && escape.tailReach ? ns.smiles*(urgent ? 3200 : 2200) : 0;
            const score = (rt?36000:0) + live*3600 + exits*2100 + sp*13 +
              escape.space*6 + (escape.tailReach?9000:0) + ns.points*230 -
              ns.dist*(urgent?110:190) - ns.smiles*smileCost + smileCredit - ns.stones*40 - trapCost;
            if(score > bs){ bs = score; best = ns.first; }
            if(checked >= checkLimit && best !== null) return best;
          } else q.push(ns);
        }
      }
      return best;
    };
    const survivalMove = (smileChoices = [false]) => {
      const st = makeState();
      for(const allowSmile of smileChoices){
        let best = null, bs = -1e18;
        for(const ns of legal(st, allowSmile)){
          const c = cell(st, st.head + STEP[ns.first]), exits = legalCount(ns, true);
          if(!exits) continue;
          const info = spaceInfo(ns, false);
          const sp = info.space;
          const room = returnRoom(info, exits, ns.body.length, model.items <= 6);
          const smilePenalty = c===1 ? (room ? 4500 : 10500) : 0;
          const score = sp*24 + exits*900 + (isFood(c)?2200:0) + (info.tailReach?6500:0) -
            smilePenalty - ns.stones*35 + (ns.first===st.dir?40:0);
          if(score > bs){ bs = score; best = ns.first; }
        }
        if(best !== null) return best;
      }
      return null;
    };
    const foodDistance = (st, limit) => {
      const seen = new Set([visitKey(st.head, st.dir)]), qo = [st.head], qd = [st.dir], dist = [0];
      let h = 0;
      while(h < qo.length && h < limit){
        const o = qo[h], dir = qd[h], d0 = dist[h++];
        for(const [sc,d] of DIRS){
          if(sc===opp[dir]) continue;
          const n = o + d;
          if(danger(n) || st.bodySet.has(n)) continue;
          const c = cell(st,n);
          if(isFood(c)) return d0 + 1;
          if(!open(c)) continue;
          const key = visitKey(n, sc);
          if(seen.has(key)) continue;
          seen.add(key);
          qo.push(n); qd.push(sc); dist.push(d0 + 1);
        }
      }
      return Infinity;
    };
    const pressureStep = (smileChoices = [false]) => {
      const st = makeState();
      for(const allowSmile of smileChoices){
        let best = null, bs = -1e18;
        for(const ns of legal(st, allowSmile)){
          const c = cell(st, st.head + STEP[ns.first]), exits = legalCount(ns, true);
          if(!exits) continue;
          const info = spaceInfo(ns, false), dist = isFood(c) ? 0 : foodDistance(ns, 260);
          if(!Number.isFinite(dist)) continue;
          const room = returnRoom(info, exits, ns.body.length, model.items <= 6);
          const smilePenalty = c===1 ? (room ? 3000 : 8000) : 0;
          const score = -dist*1700 + info.space*9 + exits*1500 + (info.tailReach?7000:0) +
            (isFood(c)?24000:0) - smilePenalty -
            ns.stones*70 + (ns.first===st.dir?60:0);
          if(score > bs){ bs = score; best = ns.first; }
        }
        if(best !== null) return best;
      }
      return null;
    };
    const riskyMove = () => {
      const st = makeState();
      let best = null, bs = -1e18;
      for(const allowReverse of [false, true]){
        for(const [sc,d] of DIRS){
          if(!allowReverse && sc===opp[st.dir]) continue;
          const n = st.head + d, c = cell(st,n);
          const targetArrow = c===24 || c===26 || c===27;
          let viable = false, pushed = false;
          if(c===10){
            const nn = n + d;
            viable = !st.bodySet.has(nn) && cell(st,nn)===32;
            pushed = viable;
          } else viable = open(c) || targetArrow;
          if(!viable) continue;
          const targetDanger = targetArrow || danger(n);
          const ns = targetDanger ? null : move(st, sc, true);
          let score = 0;
          if(isFood(c)) score += 90000;
          else if(c===1) score += 18000;
          else if(c===32) score += 4000;
          else if(targetArrow) score += 1000;
          if(ns){
            const exits = legalCount(ns, true), info = spaceInfo(ns, false);
            const dist = isFood(c) ? 0 : foodDistance(ns, 160);
            score += info.space*6 + exits*1200 + (info.tailReach?3000:0);
            if(Number.isFinite(dist)) score += Math.max(0, 18 - dist)*220;
          }
          if(targetDanger) score -= isFood(c) ? 2500 : 8500;
          if(pushed) score -= 1200;
          if(sc===st.dir) score += 350;
          if(allowReverse) score -= 20000;
          if(score > bs){ bs = score; best = sc; }
        }
        if(best !== null) return best;
      }
      return null;
    };
    const lastChanceMove = () => {
      const st = makeState();
      for(const allowSmile of [false, true]){
        let best = null, bs = -1e18;
        for(const ns of legal(st, allowSmile)){
          const c = cell(st, st.head + STEP[ns.first]), exits = legalCount(ns, true);
          const info = spaceInfo(ns, false);
          const dist = isFood(c) ? 0 : foodDistance(ns, 180);
          const room = returnRoom(info, exits, ns.body.length, model.items <= 6);
          const smilePenalty = c===1 ? (room ? 1500 : 6000) : 0;
          const score = info.space*14 + exits*2200 + (info.tailReach?9000:0) +
            (Number.isFinite(dist) ? Math.max(0, 20 - dist)*180 : 0) +
            (isFood(c)?6000:0) - smilePenalty - ns.stones*45 +
            (ns.first===st.dir?80:0);
          if(score > bs){ bs = score; best = ns.first; }
        }
        if(best !== null) return best;
      }
      return null;
    };
    const decide = options => {
      model = capture();
      resetDanger();
      const urgent = options.idle >= 18 || options.looping;
      const forceRisk = options && options.forceRisk === true;
      const tryPlan = fn => routeTimeUp() ? null : fn();
      routeDeadline = now() + options.budgetMs;
      let proved = null;
      try {
        if(forceRisk){
          proved = tryPlan(() => pressureFood(true, true)) ??
            tryPlan(() => nearFood(true)) ??
            tryPlan(() => routeFood(true));
        } else {
          const constrained = needsBreathing();
          proved = constrained
            ? tryPlan(() => nearFood(false)) ??
              tryPlan(() => routeFood(false)) ??
              tryPlan(() => pressureFood(false, urgent))
            : tryPlan(() => nearFood(false)) ??
              tryPlan(() => routeFood(false)) ??
              tryPlan(() => pressureFood(false, urgent));
        }
      } finally {
        routeDeadline = 0;
      }
      if(forceRisk) return proved ?? pressureStep([false, true]) ?? riskyMove() ?? survivalMove([false, true]) ?? lastChanceMove();
      return proved ?? (urgent ? pressureStep() : null) ?? survivalMove() ?? lastChanceMove();
    };

    return { decide };
  }

  function createWasm(access){
    const now = access.now || defaultNow;
    let exports = null, board = null, body = null, enemy = null, trail = null, disabled = false;
    const canLoad = typeof WebAssembly !== 'undefined' &&
      typeof WebAssembly.instantiate === 'function' &&
      typeof fetch === 'function' &&
      window.SNEEKIE_BOT_FORCE_JS !== true &&
      window.SNEEKIE_PASSIVE_PREVIEW !== true &&
      location.protocol !== 'file:';

    const bindMemory = () => {
      const memory = exports && exports.memory;
      if(!memory || typeof exports.board_ptr !== 'function' ||
          typeof exports.body_ptr !== 'function' ||
          typeof exports.enemy_ptr !== 'function' ||
          typeof exports.trail_ptr !== 'function' ||
          typeof exports.decide !== 'function') throw new Error('missing wasm bot exports');
      board = new Uint16Array(memory.buffer, exports.board_ptr(), 4000);
      body = new Int32Array(memory.buffer, exports.body_ptr(), 15001);
      enemy = new Int32Array(memory.buffer, exports.enemy_ptr(), 81 * 4);
      trail = new Int32Array(memory.buffer, exports.trail_ptr(), 128);
    };

    const init = canLoad ? (async () => {
      try {
        const response = await fetch(wasmUrl, { credentials:'same-origin' });
        if(!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        const result = await WebAssembly.instantiate(bytes, { env:{ now_ms:now } });
        exports = result.instance.exports;
        bindMemory();
      } catch(err) {
        disabled = true;
        if(window.SNEEKIE_BOT_DEBUG) console.warn('Sneekie Wasm bot unavailable; using JavaScript planner.', err);
      }
    })() : Promise.resolve();

    const copySnapshot = options => {
      if(!exports) return null;
      if(board.buffer !== exports.memory.buffer) bindMemory();
      const g = access.state();
      for(let o=0; o<4000; o+=2) board[o] = access.peek(o);
      const len = Math.max(2, Math.min(15001, (g.BTEL|0) - (g.ETEL|0) + 1));
      for(let i=0; i<len; i++) body[i] = g.T[(g.ETEL|0) + i] | 0;
      if(g.D){
        for(let i=0; i<=80; i++){
          const row = g.D[i];
          for(let j=0; j<4; j++) enemy[i*4 + j] = row ? (row[j] | 0) : 0;
        }
      } else enemy.fill(0);
      const sourceTrail = options && Array.isArray(options.headTrail) ? options.headTrail : [];
      const start = Math.max(0, sourceTrail.length - trail.length);
      let trailLen = 0;
      for(let i=start; i<sourceTrail.length && trailLen<trail.length; i++, trailLen++){
        trail[trailLen] = sourceTrail[i] | 0;
      }
      return { level:g.LEVEL|0, items:((g.HART|0) + (g.KLAVER|0))|0, len, trailLen };
    };

    const decide = options => {
      if(disabled || !exports) return null;
      try {
        const snapshot = copySnapshot(options);
        if(!snapshot) return null;
        const sc = exports.decide(
          snapshot.level,
          snapshot.items,
          snapshot.len,
          options && Number.isFinite(options.idle) ? options.idle|0 : 0,
          options && options.looping ? 1 : 0,
          snapshot.trailLen,
          options && Number.isFinite(options.budgetMs) ? Math.max(1, options.budgetMs) : 35,
          options && options.forceRisk === true ? 1 : 0
        );
        if(sc === 0) return null;
        if(isArrowKey(sc)) return sc;
        disabled = true;
        if(window.SNEEKIE_BOT_DEBUG) console.warn('Sneekie Wasm bot returned invalid scancode:', sc);
      } catch(err) {
        disabled = true;
        if(window.SNEEKIE_BOT_DEBUG) console.warn('Sneekie Wasm bot failed; using JavaScript planner.', err);
      }
      return null;
    };

    return { decide, ready:() => !!exports && !disabled, init };
  }

  function create(access){
    const js = createJs(access);
    const wasm = createWasm(access);
    return {
      decide(options){
        // The Wasm engine handles forceRisk too now (it has its own escape
        // ladder), so it stays in charge when stuck instead of dropping to the
        // weaker JS planner. JS remains the fallback when Wasm is unavailable.
        const sc = wasm.decide(options);
        return isArrowKey(sc) ? sc : js.decide(options);
      }
    };
  }

  window.SneekieBotEngine = { create };
})();
