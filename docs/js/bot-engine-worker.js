'use strict';
/* bot-engine-worker.js - Worker-side Wasm planner instance for the Live bot.
   Each worker owns independent Wasm memory, receives a snapshot from
   bot-engine.js, evaluates one planner mode, and returns a tagged decision. */
(function(){
  const BOARD_LEN = 4000;
  const BODY_CAP = 15001;
  const ENEMY_LEN = 81 * 4;
  const TRAIL_CAP = 128;
  const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  let exports = null, board = null, body = null, enemy = null, trail = null;

  function bindMemory(){
    const memory = exports && exports.memory;
    if(!memory || typeof exports.board_ptr !== 'function' ||
        typeof exports.body_ptr !== 'function' ||
        typeof exports.enemy_ptr !== 'function' ||
        typeof exports.trail_ptr !== 'function' ||
        typeof exports.decide_mode !== 'function') throw new Error('missing wasm bot worker exports');
    board = new Uint16Array(memory.buffer, exports.board_ptr(), BOARD_LEN);
    body = new Int32Array(memory.buffer, exports.body_ptr(), BODY_CAP);
    enemy = new Int32Array(memory.buffer, exports.enemy_ptr(), ENEMY_LEN);
    trail = new Int32Array(memory.buffer, exports.trail_ptr(), TRAIL_CAP);
  }

  function copySnapshot(snap){
    if(board.buffer !== exports.memory.buffer) bindMemory();
    board.set(snap.board);
    body.set(snap.body.subarray(0, snap.len), 0);
    enemy.set(snap.enemy);
    trail.set(snap.trail.subarray(0, snap.trailLen), 0);
  }

  async function init(wasmUrl){
    const response = await fetch(wasmUrl, { credentials:'same-origin' });
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const result = await WebAssembly.instantiate(bytes, { env:{ now_ms:now } });
    exports = result.instance.exports;
    bindMemory();
  }

  self.onmessage = event => {
    const message = event.data || {};
    if(message.type === 'init'){
      init(message.wasmUrl)
        .then(() => self.postMessage({ type:'ready' }))
        .catch(err => self.postMessage({ type:'error', id:message.id || 0, error:String(err && err.message || err) }));
      return;
    }
    if(message.type !== 'decide') return;
    try {
      if(!exports) throw new Error('worker not ready');
      copySnapshot(message.snap);
      const s = message.snap;
      const packed = exports.decide_mode(
        message.mode | 0,
        s.level | 0,
        s.items | 0,
        s.len | 0,
        s.idle | 0,
        s.looping | 0,
        s.trailLen | 0,
        Math.max(1, Number(s.budgetMs) || 35),
        s.forceRisk | 0,
        s.bonus | 0
      );
      self.postMessage({ type:'result', id:message.id, packed:packed | 0 });
    } catch(err) {
      self.postMessage({ type:'error', id:message.id, error:String(err && err.message || err) });
    }
  };
})();
