'use strict';
/* bot-home.js — the lightweight JavaScript planner for the Live bot preview on the
   localized landing pages. It is intentionally small and greedy: each tick it reads
   the live board straight from game.js, runs a shortest-path search to the nearest
   ♥/♣, and otherwise picks the move that keeps the most open space. The full, tuned
   planner (time budget, multi-stage search, escape proofs) now lives only in the
   WebAssembly bot on bot.html; this one just has to look competent on the early demo
   levels at the fixed preview speed. game.js stays the only game engine; bot.js (the
   driver) presses the keys. */
(function(){
  const DIRS = [[72,-160],[80,160],[75,-2],[77,2]];   // DOS arrow scancodes + VRAM deltas
  const opp = {72:80, 80:72, 75:77, 77:75};
  const dirIdx = sc => sc===72?0 : sc===80?1 : sc===75?2 : 3;
  const isFood = c => c===3 || c===5;                 // ♥ heart / ♣ club
  const open = c => c===32 || c===1 || isFood(c);     // empty / ☺ smiley / food
  const rowOf = o => Math.trunc(o / 160) + 1;
  const colOf = o => Math.trunc((o % 160) / 2) + 1;

  function createJs(access){
    const board = new Uint8Array(4000);               // CP437 char per even VRAM offset
    let head = 0, tail = 0, dir = 72;
    const at = o => (o >= 0 && o < 4000) ? board[o] : 0;

    // An enemy arrow sitting on this cell, about to step into it, or about to wrap
    // around onto it (the 1988 arrow routines wrap rows 4..20 and cols 2/79). Mirrors
    // game.js so the preview stays safe on the arrow levels.
    const danger = o => {
      const r = rowOf(o), c = colOf(o);
      if(at(o)===24 || at(o)===26 || at(o)===27) return true;
      if(at(o+160)===24 || at(o-2)===26 || at(o+2)===27) return true;
      if(r===20 && c%2===0 && at((4-1)*160 + (c-1)*2)===24) return true;
      if(c===2 && r>=4 && r<=20 && at((r-1)*160 + (79-1)*2)===26) return true;
      if(c===79 && r>=4 && r<=20 && at((r-1)*160 + (2-1)*2)===27) return true;
      return false;
    };
    // Can the snake step into neighbour n (entered along delta d)? Empty, food, a
    // smiley, the moving tail, or a stone with an empty cell behind it to push into.
    const walkable = (n, d) => {
      if(n===tail) return true;
      const c = at(n);
      if(c===10) return at(n + d)===32;
      return open(c);
    };

    // Shortest path to the nearest ♥/♣, returning that path's first scancode. Routes
    // around ☺ smileys (eating one costs -50) and never reverses into the neck.
    const routeToFood = () => {
      const seen = new Set([head*4 + dirIdx(dir)]);
      const qo = [head], qd = [dir], qf = [null];
      for(let h=0; h<qo.length; h++){
        const o = qo[h], cd = qd[h], cf = qf[h];
        for(const [sc,d] of DIRS){
          if(sc===opp[cd]) continue;
          const n = o + d;
          if(danger(n) || !walkable(n, d)) continue;
          const first = cf ?? sc;
          if(isFood(at(n))) return first;
          if(at(n)===1) continue;                     // don't path through a smiley
          const key = n*4 + dirIdx(sc);
          if(seen.has(key)) continue;
          seen.add(key);
          qo.push(n); qd.push(sc); qf.push(first);
        }
      }
      return null;
    };

    // Open cells reachable from a starting cell (capped) — used to avoid boxing in.
    const space = start => {
      const seen = new Set([start]);
      const q = [start];
      for(let h=0; h<q.length && q.length<600; h++){
        const o = q[h];
        for(const [,d] of DIRS){
          const n = o + d;
          if(seen.has(n) || danger(n) || !walkable(n, d)) continue;
          seen.add(n); q.push(n);
        }
      }
      return q.length;
    };

    // No food reachable: keep moving, keep the most room, and dodge smileys.
    const survive = () => {
      let best = null, bs = -1;
      for(const [sc,d] of DIRS){
        if(sc===opp[dir]) continue;
        const n = head + d;
        if(danger(n) || !walkable(n, d)) continue;
        const c = at(n);
        const score = space(n)*10 + (isFood(c)?50:0) - (c===1?40:0) + (sc===dir?1:0);
        if(score > bs){ bs = score; best = sc; }
      }
      return best;
    };

    // One tick: snapshot the board, locate head/tail/heading, then route or survive.
    const decide = () => {
      const g = access.state();
      head = g.T[g.BTEL];
      tail = g.T[g.ETEL];
      const delta = head - g.T[g.BTEL - 1];
      dir = delta===-160 ? 72 : delta===160 ? 80 : delta===-2 ? 75 : 77;
      for(let o=0; o<4000; o+=2) board[o] = access.peek(o);
      return routeToFood() ?? survive();
    };

    return { decide };
  }

  window.SneekieBotJs = { create: createJs };
})();
