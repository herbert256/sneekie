'use strict';
/* bot-engine.js - WebAssembly planner glue for the Live bot. It loads
   bot-engine.wasm, copies one compact snapshot from the real game into the
   module's memory each tick, and returns one DOS arrow scancode. It is loaded
   only on the Bot page; bot.js (the driver) waits for it before driving. */
(function(){
  const defaultNow = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const scriptSrc = document.currentScript && document.currentScript.src;
  const wasmUrl = scriptSrc ? new URL('bot-engine.wasm', scriptSrc).href : 'bot-engine.wasm';
  const isArrowKey = sc => sc===72 || sc===80 || sc===75 || sc===77;

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
        if(window.SNEEKIE_BOT_DEBUG) console.warn('Sneekie Wasm bot unavailable.', err);
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
      return { level:g.LEVEL|0, items:((g.HART|0) + (g.KLAVER|0))|0, len, trailLen, bonus:g.BONUS|0 };
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
          options && options.forceRisk === true ? 1 : 0,
          snapshot.bonus
        );
        if(sc === 0) return null;
        if(isArrowKey(sc)) return sc;
        disabled = true;
        if(window.SNEEKIE_BOT_DEBUG) console.warn('Sneekie Wasm bot returned invalid scancode:', sc);
      } catch(err) {
        disabled = true;
        if(window.SNEEKIE_BOT_DEBUG) console.warn('Sneekie Wasm bot failed.', err);
      }
      return null;
    };

    return { decide, ready:() => !!exports && !disabled, init };
  }

  window.SneekieBotWasm = { create: createWasm };
})();
