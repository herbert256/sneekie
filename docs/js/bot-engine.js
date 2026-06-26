'use strict';
/* bot-engine.js - WebAssembly planner glue for the Live bot. It loads
   bot-engine.wasm, copies one compact snapshot from the real game into the
   module's memory each tick, and returns one DOS arrow scancode. On browsers
   with enough logical cores it also starts a small Worker pool; each Worker
   owns a separate Wasm instance, so this is real parallel planning without
   SharedArrayBuffer or cross-origin-isolation requirements. It is the only
   planner: both the Bot page and the landing-page previews load it, and bot.js
   waits for it before driving. When it cannot load (e.g. from file://, where
   fetch of the .wasm is blocked), createWasm returns null and the bot stays
   idle. */
(function(){
  const BOARD_LEN = 4000;
  const BODY_CAP = 15001;
  const ENEMY_LEN = 81 * 4;
  const TRAIL_CAP = 128;
  const MODE_PLAN = [
    { mode:0, rank:1, budgetScale:1.00 }, // baseline full planner
    { mode:4, rank:0, budgetScale:1.70 }, // deeper full planner, preferred on equal tier
    { mode:5, rank:2, budgetScale:1.90 }, // deeper urgent/finish pressure
    { mode:3, rank:3, budgetScale:1.35 }  // aggressive stall breaker
  ];
  const MAX_WORKERS = 4;
  const defaultNow = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const scriptSrc = document.currentScript && document.currentScript.src;
  const wasmUrl = scriptSrc ? new URL('bot-engine.wasm', scriptSrc).href : 'bot-engine.wasm';
  const workerUrl = scriptSrc ? new URL('bot-engine-worker.js', scriptSrc).href : 'bot-engine-worker.js';
  const isArrowKey = sc => sc===72 || sc===80 || sc===75 || sc===77;
  const decisionSc = packed => packed ? packed & 0xff : 0;
  const decisionTier = packed => packed ? Math.floor(packed / 256) : Infinity;

  function pickWorkerCount(){
    if(typeof Worker !== 'function') return 0;
    if(window.SNEEKIE_BOT_FORCE_SINGLE === true) return 0;
    const cores = Math.max(1, Math.floor((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2));
    return Math.max(0, Math.min(MAX_WORKERS, cores - 1));
  }

  function chooseBest(results){
    let best = null;
    for(const result of results){
      if(!result || !isArrowKey(result.sc)) continue;
      if(!best ||
          result.tier < best.tier ||
          (result.tier === best.tier && result.rank < best.rank) ||
          (result.tier === best.tier && result.rank === best.rank && result.mode < best.mode) ||
          (result.tier === best.tier && result.rank === best.rank && result.mode === best.mode && result.slot < best.slot)){
        best = result;
      }
    }
    return best ? best.sc : null;
  }

  function createWasm(access){
    const now = access.now || defaultNow;
    let exports = null, board = null, body = null, enemy = null, trail = null, disabled = false;
    let workersStarted = false, workersDisabled = false, jobs = 0;
    const workers = [];
    const pending = new Map();
    const canLoad = typeof WebAssembly !== 'undefined' &&
      typeof WebAssembly.instantiate === 'function' &&
      typeof fetch === 'function' &&
      location.protocol !== 'file:';
    // When WebAssembly can never load here (e.g. from file://), hand back null so
    // the driver simply waits instead of driving with no planner.
    if(!canLoad) return null;

    const bindMemory = () => {
      const memory = exports && exports.memory;
      if(!memory || typeof exports.board_ptr !== 'function' ||
          typeof exports.body_ptr !== 'function' ||
          typeof exports.enemy_ptr !== 'function' ||
          typeof exports.trail_ptr !== 'function' ||
          typeof exports.decide !== 'function') throw new Error('missing wasm bot exports');
      board = new Uint16Array(memory.buffer, exports.board_ptr(), BOARD_LEN);
      body = new Int32Array(memory.buffer, exports.body_ptr(), BODY_CAP);
      enemy = new Int32Array(memory.buffer, exports.enemy_ptr(), ENEMY_LEN);
      trail = new Int32Array(memory.buffer, exports.trail_ptr(), TRAIL_CAP);
    };

    const init = canLoad ? (async () => {
      try {
        const response = await fetch(wasmUrl, { credentials:'same-origin' });
        if(!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        const result = await WebAssembly.instantiate(bytes, { env:{ now_ms:now } });
        exports = result.instance.exports;
        bindMemory();
        startWorkers();
      } catch(err) {
        disabled = true;
        stopWorkers();
        if(window.SNEEKIE_BOT_DEBUG) console.warn('Sneekie Wasm bot unavailable.', err);
      }
    })() : Promise.resolve();

    const copySnapshotToMemory = snapshot => {
      if(!exports) return false;
      if(board.buffer !== exports.memory.buffer) bindMemory();
      board.set(snapshot.board);
      body.set(snapshot.body.subarray(0, snapshot.len), 0);
      enemy.set(snapshot.enemy);
      trail.set(snapshot.trail.subarray(0, snapshot.trailLen), 0);
      return true;
    };

    const snapshot = options => {
      if(!exports) return null;
      const g = access.state();
      const boardCopy = new Uint16Array(BOARD_LEN);
      for(let o=0; o<BOARD_LEN; o+=2) boardCopy[o] = access.peek(o);
      const len = Math.max(2, Math.min(BODY_CAP, (g.BTEL|0) - (g.ETEL|0) + 1));
      const bodyCopy = new Int32Array(len);
      for(let i=0; i<len; i++) bodyCopy[i] = g.T[(g.ETEL|0) + i] | 0;
      const enemyCopy = new Int32Array(ENEMY_LEN);
      if(g.D){
        for(let i=0; i<=80; i++){
          const row = g.D[i];
          for(let j=0; j<4; j++) enemyCopy[i*4 + j] = row ? (row[j] | 0) : 0;
        }
      }
      const sourceTrail = options && Array.isArray(options.headTrail) ? options.headTrail : [];
      const start = Math.max(0, sourceTrail.length - TRAIL_CAP);
      const trailLen = Math.min(TRAIL_CAP, sourceTrail.length - start);
      const trailCopy = new Int32Array(trailLen);
      for(let i=0; i<trailLen; i++) trailCopy[i] = sourceTrail[start + i] | 0;
      return {
        board: boardCopy,
        body: bodyCopy,
        enemy: enemyCopy,
        trail: trailCopy,
        level: g.LEVEL|0,
        items: ((g.HART|0) + (g.KLAVER|0))|0,
        len,
        trailLen,
        bonus: g.BONUS|0,
        idle: options && Number.isFinite(options.idle) ? options.idle|0 : 0,
        looping: options && options.looping ? 1 : 0,
        budgetMs: options && Number.isFinite(options.budgetMs) ? Math.max(1, options.budgetMs) : 35,
        forceRisk: options && options.forceRisk === true ? 1 : 0
      };
    };

    const decideSingle = options => {
      if(disabled || !exports) return null;
      try {
        const snap = snapshot(options);
        if(!snap || !copySnapshotToMemory(snap)) return null;
        const packed = typeof exports.decide_mode === 'function' ?
          exports.decide_mode(0, snap.level, snap.items, snap.len, snap.idle, snap.looping,
            snap.trailLen, snap.budgetMs, snap.forceRisk, snap.bonus) :
          exports.decide(snap.level, snap.items, snap.len, snap.idle, snap.looping,
            snap.trailLen, snap.budgetMs, snap.forceRisk, snap.bonus);
        const sc = typeof exports.decide_mode === 'function' ? decisionSc(packed) : packed;
        if(sc === 0) return null;
        if(isArrowKey(sc)) return sc;
        disabled = true;
        stopWorkers();
        if(window.SNEEKIE_BOT_DEBUG) console.warn('Sneekie Wasm bot returned invalid scancode:', sc);
      } catch(err) {
        disabled = true;
        stopWorkers();
        if(window.SNEEKIE_BOT_DEBUG) console.warn('Sneekie Wasm bot failed.', err);
      }
      return null;
    };

    function startWorkers(){
      if(workersStarted || workersDisabled || !exports || typeof exports.decide_mode !== 'function') return;
      workersStarted = true;
      const count = pickWorkerCount();
      if(count <= 0) return;
      try {
        for(let slot=0; slot<count; slot++){
          const worker = new Worker(workerUrl);
          const state = { worker, slot, ready:false, busy:false, failed:false };
          worker.onmessage = event => handleWorkerMessage(state, event.data || {});
          worker.onerror = err => {
            state.failed = true;
            state.busy = false;
            if(window.SNEEKIE_BOT_DEBUG) console.warn('Sneekie Wasm worker failed.', err);
          };
          worker.postMessage({ type:'init', wasmUrl });
          workers.push(state);
        }
      } catch(err) {
        workersDisabled = true;
        stopWorkers();
        if(window.SNEEKIE_BOT_DEBUG) console.warn('Sneekie Wasm worker pool unavailable.', err);
      }
    }

    function stopWorkers(){
      workersDisabled = true;
      for(const state of workers){
        try { state.worker.terminate(); } catch(_err) {}
      }
      workers.length = 0;
      for(const entry of pending.values()) entry.resolve(null);
      pending.clear();
    }

    function handleWorkerMessage(state, message){
      if(message.type === 'ready'){
        state.ready = true;
        state.failed = false;
        return;
      }
      if(message.type === 'error'){
        state.failed = true;
        state.busy = false;
        const entry = pending.get(message.id);
        if(entry){
          pending.delete(message.id);
          entry.resolve(null);
        }
        if(window.SNEEKIE_BOT_DEBUG) console.warn('Sneekie Wasm worker error:', message.error);
        return;
      }
      if(message.type !== 'result') return;
      state.busy = false;
      const entry = pending.get(message.id);
      if(!entry) return;
      pending.delete(message.id);
      const packed = message.packed | 0;
      const sc = decisionSc(packed);
      entry.resolve(isArrowKey(sc) ? {
        sc,
        tier: decisionTier(packed),
        mode: entry.mode,
        rank: entry.rank,
        slot: state.slot
      } : null);
    }

    const decideParallel = async options => {
      if(disabled || !exports) return null;
      const ready = workers.filter(state => state.ready && !state.failed && !state.busy);
      if(ready.length === 0) return decideSingle(options);
      const snap = snapshot(options);
      if(!snap) return null;
      const planSource = snap.forceRisk ? MODE_PLAN : MODE_PLAN.filter(plan => plan.mode !== 3);
      const plans = planSource.slice(0, ready.length);
      const timeoutMs = Math.max(8, Math.max(...plans.map(plan => snap.budgetMs * plan.budgetScale)) + 12);
      const tasks = plans.map((plan, index) => new Promise(resolve => {
        const state = ready[index];
        const id = ++jobs;
        const jobSnap = Object.assign({}, snap, {
          budgetMs: Math.max(1, snap.budgetMs * plan.budgetScale)
        });
        state.busy = true;
        pending.set(id, { resolve, mode:plan.mode, rank:plan.rank });
        state.worker.postMessage({ type:'decide', id, mode:plan.mode, snap:jobSnap });
        setTimeout(() => {
          if(!pending.has(id)) return;
          pending.delete(id);
          resolve(null);
        }, timeoutMs);
      }));
      const results = await Promise.all(tasks);
      const best = chooseBest(results);
      return best === null ? decideSingle(options) : best;
    };

    const decide = options => {
      const readyWorkers = workers.filter(state => state.ready && !state.failed).length;
      if(readyWorkers > 0) return decideParallel(options);
      return decideSingle(options);
    };

    return {
      decide,
      ready:() => !!exports && !disabled,
      threads:() => Math.max(1, workers.filter(state => state.ready && !state.failed).length),
      init
    };
  }

  window.SneekieBotWasm = { create: createWasm };
})();
