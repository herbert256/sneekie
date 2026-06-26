#!/usr/bin/env node
'use strict';

import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const BOARD_LEN = 4000;
const BODY_CAP = 15001;
const ENEMY_LEN = 81 * 4;
const TRAIL_CAP = 128;
const DIRS = [[72, -160], [80, 160], [75, -2], [77, 2]];
const STEP = new Map(DIRS);
const KEY_NAME = new Map([[72, 'U'], [80, 'D'], [75, 'L'], [77, 'R']]);
const OPP = new Map([[72, 80], [80, 72], [75, 77], [77, 75]]);
const MODE_PLAN = [
  { mode:0, rank:1, budgetScale:1.00 },
  { mode:4, rank:0, budgetScale:1.70 },
  { mode:5, rank:2, budgetScale:1.90 },
  { mode:3, rank:3, budgetScale:1.35 }
];
const DATA1500 = [15,5,6,10,9,35,6,20,9,75,6,40,9,55,6,70,9,65,18,10,15,55,18,20,
  15,65,18,30,15,75,18,40,9,45,12,20,9,15,12,30,9,15,18,50,9,15,6,50,9,15,18,60];

function parseArgs(){
  const args = {
    wasm: 'docs/js/bot-engine.wasm',
    levels: [26, 27, 28, 29, 30, 31, 32],
    seeds: 20,
    startSeed: 1,
    maxTicks: 6000,
    budgetMs: 55,
    modes: 'page',
    json: false,
    dumpBoard: false,
    traceFailures: 0
  };
  for(let i = 2; i < process.argv.length; i++){
    const arg = process.argv[i];
    const next = () => process.argv[++i];
    if(arg === '--wasm') args.wasm = next();
    else if(arg === '--levels') args.levels = next().split(',').map(Number).filter(Boolean);
    else if(arg === '--seeds') args.seeds = Number(next());
    else if(arg === '--start-seed') args.startSeed = Number(next());
    else if(arg === '--max-ticks') args.maxTicks = Number(next());
    else if(arg === '--budget-ms') args.budgetMs = Number(next());
    else if(arg === '--modes') args.modes = next();
    else if(arg === '--json') args.json = true;
    else if(arg === '--dump-board') args.dumpBoard = true;
    else if(arg === '--trace-failures') args.traceFailures = Number(next());
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function mulberry32(seed){
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function off(row, col){ return (row - 1) * 160 + (col - 1) * 2; }
function rowOf(o){ return Math.trunc(o / 160) + 1; }
function colOf(o){ return Math.trunc((o % 160) / 2) + 1; }
function isFood(c){ return c === 3 || c === 5; }
function open(c){ return c === 32 || c === 1 || isFood(c); }
function isArrowKey(sc){ return sc === 72 || sc === 80 || sc === 75 || sc === 77; }
function decisionSc(packed){ return packed ? packed & 0xff : 0; }
function decisionTier(packed){ return packed ? Math.floor(packed / 256) : Infinity; }

function chooseBest(results){
  let best = null;
  for(const result of results){
    if(!result || !isArrowKey(result.sc)) continue;
    if(!best ||
        result.tier < best.tier ||
        (result.tier === best.tier && result.rank < best.rank) ||
        (result.tier === best.tier && result.rank === best.rank && result.mode < best.mode)){
      best = result;
    }
  }
  return best ? best.sc : 0;
}

class WasmBot {
  constructor(exports){
    this.exports = exports;
    this.bind();
  }

  static async load(path){
    const bytes = await readFile(path);
    const result = await WebAssembly.instantiate(bytes, { env: { now_ms: () => performance.now() } });
    return new WasmBot(result.instance.exports);
  }

  bind(){
    const memory = this.exports.memory;
    this.board = new Uint16Array(memory.buffer, this.exports.board_ptr(), BOARD_LEN);
    this.body = new Int32Array(memory.buffer, this.exports.body_ptr(), BODY_CAP);
    this.enemy = new Int32Array(memory.buffer, this.exports.enemy_ptr(), ENEMY_LEN);
    this.trail = new Int32Array(memory.buffer, this.exports.trail_ptr(), TRAIL_CAP);
  }

  decide(game, opts){
    if(this.board.buffer !== this.exports.memory.buffer) this.bind();
    this.board.fill(0);
    for(let o = 0; o < BOARD_LEN; o += 2) this.board[o] = game.peek(o);
    const len = Math.max(2, Math.min(BODY_CAP, game.BTEL - game.ETEL + 1));
    for(let i = 0; i < len; i++) this.body[i] = game.T[game.ETEL + i] | 0;
    this.enemy.fill(0);
    for(let i = 0; i <= 80; i++){
      for(let j = 0; j < 4; j++) this.enemy[i * 4 + j] = game.D[i][j] | 0;
    }
    const sourceTrail = opts.headTrail || [];
    const start = Math.max(0, sourceTrail.length - TRAIL_CAP);
    let trailLen = 0;
    for(let i = start; i < sourceTrail.length && trailLen < TRAIL_CAP; i++, trailLen++){
      this.trail[trailLen] = sourceTrail[i] | 0;
    }
    const common = [
      game.level,
      game.HART + game.KLAVER,
      len,
      opts.idle | 0,
      opts.looping ? 1 : 0,
      trailLen,
      opts.forceRisk ? 1 : 0,
      game.BONUS | 0
    ];
    if(opts.modes === 'single' || typeof this.exports.decide_mode !== 'function'){
      return this.exports.decide(
        common[0], common[1], common[2], common[3], common[4], common[5],
        opts.budgetMs, common[6], common[7]
      ) | 0;
    }
    const plans = opts.modes === 'forced' ? [MODE_PLAN[3]] : MODE_PLAN;
    const results = plans.map(plan => {
      const packed = this.exports.decide_mode(
        plan.mode, common[0], common[1], common[2], common[3], common[4], common[5],
        Math.max(1, opts.budgetMs * plan.budgetScale), common[6], common[7]
      ) | 0;
      const sc = decisionSc(packed);
      return isArrowKey(sc) ? { sc, tier: decisionTier(packed), mode: plan.mode, rank: plan.rank } : null;
    });
    return chooseBest(results);
  }
}

class Game {
  constructor(level, seed){
    this.level = level;
    this.rnd = mulberry32((seed * 2654435761 + level * 1013904223) >>> 0);
    this.board = new Uint16Array(BOARD_LEN);
    this.T = new Int32Array(BODY_CAP);
    this.B = new Int32Array(11);
    this.D = Array.from({ length: 81 }, () => new Int32Array(4));
    this.score = 0;
    this.BTEL = 0;
    this.ETEL = 0;
    this.E = 72;
    this.F = 72;
    this.HART = 0;
    this.KLAVER = 0;
    this.AANTAL = 0;
    this.BMIN = 0;
    this.BONUS = 0;
    this.K1 = 0;
    this.event = '';
    this.initLevel();
  }

  peek(o){ return o >= 0 && o < BOARD_LEN ? this.board[o] : 0; }
  poke(o, v){ if(o >= 0 && o < BOARD_LEN) this.board[o] = v; }
  pcAt(row, col, code){ this.poke(off(row, col), code); }
  stone(col, row){ this.pcAt(row, col, 10); }
  psAt(row, col, text){ for(let i = 0; i < text.length; i++) this.pcAt(row, col + i, text.charCodeAt(i)); }
  spaces(row, col, n){ for(let i = 0; i < n; i++) this.pcAt(row, col + i, 32); }
  scoreBy(v){ this.score += v; }

  initLevel(){
    this.board.fill(32);
    for(let row = 4; row <= 20; row++){
      this.pcAt(row, 1, 179);
      this.spaces(row, 2, 78);
      this.pcAt(row, 80, 179);
    }
    this.pcAt(3, 1, 195);
    for(let col = 2; col <= 79; col++) this.pcAt(3, col, 196);
    this.pcAt(3, 80, 180);
    this.pcAt(21, 1, 195);
    for(let col = 2; col <= 79; col++) this.pcAt(21, col, 196);
    this.pcAt(21, 80, 180);

    this.T[1] = 2000;
    this.T[2] = 1840;
    this.BTEL = 2;
    this.ETEL = 1;
    this.poke(this.T[this.BTEL], 219);
    this.poke(this.T[this.ETEL], 186);
    this.E = 72;
    this.F = 72;
    this.HART = 0;
    this.KLAVER = 0;
    this.configure();
    for(let i = 1; i <= this.AANTAL; i++){
      this.place(1);
      this.place(3);
      if(this.K1 === 1) this.HART++;
    }
  }

  configure(){
    switch((this.level - 1) % 16){
      case 0: this.AANTAL = 75; this.BMIN = 10; break;
      case 1: this.AANTAL = 75; this.BMIN = 10; this.lay1230(); break;
      case 2: this.AANTAL = 75; this.BMIN = 10; this.lay1500(); break;
      case 3: this.AANTAL = 50; this.BMIN = 10; this.lay1400(); break;
      case 4: this.AANTAL = 50; this.BMIN = 10; this.lay1670(); break;
      case 5: this.AANTAL = 50; this.BMIN = 10; this.lay1810(); break;
      case 6: this.AANTAL = 50; this.BMIN = 10; this.lay1920(); break;
      case 7: this.AANTAL = 50; this.BMIN = 10; this.lay1750(); break;
      case 8: this.AANTAL = 125; this.BMIN = 5; break;
      case 9: this.AANTAL = 125; this.BMIN = 5; this.lay1230(); break;
      case 10: this.AANTAL = 125; this.BMIN = 5; this.lay1500(); break;
      case 11: this.AANTAL = 100; this.BMIN = 5; this.lay1400(); break;
      case 12: this.AANTAL = 100; this.BMIN = 5; this.lay1670(); break;
      case 13: this.AANTAL = 100; this.BMIN = 5; this.lay1810(); break;
      case 14: this.AANTAL = 100; this.BMIN = 5; this.lay1920(); break;
      case 15: this.AANTAL = 100; this.BMIN = 5; this.lay1750(); break;
    }
  }

  place(code){
    this.K1 = 0;
    let k = Math.trunc(this.rnd() * 2720 + 480);
    if(k % 2 === 1) k++;
    if(this.peek(k) === 32){
      this.poke(k, code);
      this.K1 = 1;
    }
  }

  lay1230(){
    for(let i = 1; i <= 39; i++){ this.pcAt(8, 1 + i, 196); this.pcAt(16, 80 - i, 196); }
    for(let i = 0; i <= 8; i++){
      this.pcAt(21 - i, 11, 179); this.pcAt(3 + i, 70, 179); this.pcAt(21 - i, 26, 179);
      this.pcAt(3 + i, 55, 179); this.pcAt(15, 22 + i, 196); this.pcAt(6, 51 + i, 196);
      this.pcAt(15, 7 + i, 196); this.pcAt(6, 66 + i, 196); this.pcAt(18, 7 + i, 196);
      this.pcAt(9, 66 + i, 196); this.pcAt(18, 22 + i, 196); this.pcAt(9, 51 + i, 196);
      for(let i1 = 6; i1 <= 10; i1++){
        this.pcAt(i1, 5 + i * 4, 179); this.pcAt(8 + i1, 44 + i * 4, 179);
      }
      this.pcAt(8, 5 + i * 4, 197); this.pcAt(16, 44 + i * 4, 197);
    }
    this.pcAt(3,70,194); this.pcAt(21,11,193); this.pcAt(3,55,194);
    this.pcAt(15,26,197); this.pcAt(6,55,197); this.pcAt(18,26,197);
    this.pcAt(9,55,197); this.pcAt(15,11,197); this.pcAt(6,70,197);
    this.pcAt(18,11,197); this.pcAt(9,70,197); this.pcAt(21,26,193);
  }

  lay1400(){
    for(let y = 4; y <= 20; y += 2){
      for(let i = 0; i <= 1; i++){
        let q = 1;
        for(let a = 1; a <= 6; a++){
          if(q === 1){ q = 0; y += 1; } else { q = 1; y -= 1; }
          if(y < 21) this.stone(17 + a + 40 * i, y);
        }
      }
    }
    for(let x = 2; x <= 78; x += 2){
      for(let i = 0; i <= 1; i++){
        let y = 7 + 8 * i; this.stone(x, y);
        y = 8 + 8 * i; x += 1; this.stone(x, y);
        y = 9 + 8 * i; x -= 1; this.stone(x, y);
      }
    }
  }

  lay1500(){
    for(let i = 2; i <= 79; i++) for(let i1 = 1; i1 <= 2; i1++) this.pcAt(3 + 6 * i1, i, 196);
    for(let i = 4; i <= 20; i++) for(let i1 = 1; i1 <= 7; i1++){
      this.pcAt(3, 10 * i1, 194); this.pcAt(21, 10 * i1, 193);
      this.pcAt(i, 10 * i1, 179);
      for(let i2 = 1; i2 <= 2; i2++){
        this.pcAt(3 + 6 * i2, 10 * i1, 197); this.pcAt(3 + 6 * i2, 80, 180);
        this.pcAt(3 + 6 * i2, 1, 195);
      }
    }
    let p = 0;
    for(let i = 1; i <= 13; i++){
      const c1 = DATA1500[p++], c2 = DATA1500[p++], c3 = DATA1500[p++], c4 = DATA1500[p++];
      this.pcAt(c1, c2, 32); this.pcAt(c1, c2 - 1, 180);
      this.pcAt(c1, c2 + 2, 195); this.pcAt(c1, c2 + 1, 32);
      this.pcAt(c3 + 2, c4, 194); this.pcAt(c3 + 1, c4, 32);
      this.pcAt(c3, c4, 32); this.pcAt(c3 - 1, c4, 193);
    }
  }

  lay1670(){
    for(let i = 1; i <= 9; i++){
      this.B[i] = 6 + i;
      this.pcAt(3, 8 * i, 194);
      for(let i1 = 4; i1 <= 20; i1++) this.pcAt(i1, 8 * i, 179);
      this.pcAt(21, 8 * i, 193); this.pcAt(this.B[i] - 1, i * 8, 193);
      for(let i1 = 0; i1 <= 2; i1++) this.pcAt(this.B[i] + i1, i * 8, 32);
      this.pcAt(this.B[i] + 3, i * 8, 194);
    }
  }

  lay1750(){
    this.lay1670();
    for(let i1 = 4; i1 <= 20; i1 += 2) for(let i2 = 0; i2 <= 9; i2++){
      this.stone(i2 * 8 + 3, i1); this.stone(i2 * 8 + 5, i1);
      if(i1 < 20) this.stone(i2 * 8 + 4, i1 + 1);
    }
  }

  lay1810(){
    for(let i = 2; i <= 79; i += 2){ this.D[i][1] = 5 + Math.trunc(this.rnd() * 14); this.D[i][2] = 32; }
    this.sub1830();
  }

  lay1920(){
    for(let i = 4; i <= 20; i++) for(let a = 0; a <= 1; a++){
      this.D[i + a * 20][1] = Math.round(this.rnd() * 38 * 2 + 2 + a);
      this.D[i + a * 20][2] = 32;
    }
    this.D[12][1] = 14; this.D[13][1] = 6; this.D[32][1] = 65; this.D[33][1] = 55;
    this.sub1970();
  }

  updateEnemy(){
    switch((this.level - 1) % 16){
      case 4:
      case 7:
      case 12:
      case 15:
        this.sub2130();
        break;
      case 5:
      case 13:
        this.sub1830();
        break;
      case 6:
      case 14:
        this.sub1970();
        break;
    }
  }

  sub1830(){
    for(let i = 2; i <= 78; i += 2){
      let i2 = (this.D[i][1] - 1) * 160 + (i - 1) * 2;
      if(this.D[i][1] === 4){ this.poke(i2, this.D[i][2]); this.D[i][1] = 21; i2 += 2720; }
      if(this.peek(i2 - 160) === 219) throw new Error('arrow-up');
      if(this.peek(i2 - 160) > 100) continue;
      if(this.D[i][1] !== 21) this.poke(i2, this.D[i][2]);
      this.D[i][1] -= 1; this.D[i][2] = this.peek(i2 - 160);
      this.poke(i2 - 160, 24);
    }
  }

  sub1970(){
    for(let i = 4; i <= 20; i++){
      let i2 = (i - 1) * 160 + (this.D[i][1] - 1) * 2;
      if(this.D[i][1] === 79){ this.poke(i2, this.D[i][2]); this.D[i][1] = 1; i2 -= 156; }
      let d = this.peek(i2 + 2);
      if(d === 219) throw new Error('arrow-right');
      if(d === 27){ this.poke(i2 + 2, this.D[i + 20][2]); this.D[i + 20][2] = 26; }
      if(d <= 100){
        if(this.D[i][1] !== 1) this.poke(i2, this.D[i][2]);
        this.D[i][1] += 1; this.D[i][2] = this.peek(i2 + 2);
        this.poke(i2 + 2, 26);
      }
      const l = i + 20;
      i2 = (i - 1) * 160 + (this.D[l][1] - 1) * 2;
      if(this.D[l][1] === 2){ this.poke(i2, this.D[l][2]); this.D[l][1] = 80; i2 += 156; }
      d = this.peek(i2 - 2);
      if(d === 219) throw new Error('arrow-left');
      if(!(d > 100 || d === 26)){
        if(this.D[l][1] !== 80) this.poke(i2, this.D[l][2]);
        this.D[l][1] -= 1; this.D[l][2] = this.peek(i2 - 2);
        this.poke(i2 - 2, 27);
      }
    }
  }

  sub2130(){
    for(let d1 = 1; d1 <= 9; d1++){
      const d2 = (this.B[d1] - 1) * 160 + (d1 * 8 - 1) * 2;
      if(this.B[d1] === 4){
        const a = this.peek(d2 + 2080) + this.peek(d2 + 2240) + this.peek(d2 + 2400);
        if(a !== 96) continue;
        this.poke(d2 + 2560, 179); this.poke(d2 + 2080, 179); this.poke(d2 + 2240, 179); this.poke(d2 + 2400, 179);
        this.poke(d2, 32); this.poke(d2 + 160, 32); this.poke(d2 + 320, 32); this.poke(d2 + 1920, 179);
      }
      const a = this.peek(d2) + this.peek(d2 + 160) + this.peek(d2 + 320);
      if(a !== 96) continue;
      if(this.B[d1] !== 4) this.poke(d2 - 160, 179);
      this.poke(d2, 193); this.poke(d2 + 160, 32); this.poke(d2 + 320, 32); this.poke(d2 + 480, 32);
      this.poke(d2 + 640, 194);
      this.B[d1] += 1; if(this.B[d1] === 17) this.B[d1] = 4;
    }
  }

  routeArrowNextUnsafe(idx){
    const row = Math.trunc(idx / 80) + 1;
    const col = idx % 80 + 1;
    const mode = (this.level - 1) % 16;
    if(mode === 5 || mode === 13){
      if(col < 2 || col > 78 || col % 2 !== 0) return false;
      return row === (this.D[col][1] === 4 ? 20 : this.D[col][1] - 1);
    }
    if(mode === 6 || mode === 14){
      if(row < 4 || row > 20) return false;
      const rightNext = this.D[row][1] === 79 ? 2 : this.D[row][1] + 1;
      const leftNext = this.D[row + 20][1] === 2 ? 79 : this.D[row + 20][1] - 1;
      return col === rightNext || col === leftNext;
    }
    return false;
  }

  isSafeMove(sc){
    const a = this.T[this.BTEL] + STEP.get(sc);
    if(this.routeArrowNextUnsafe(a >> 1)) return false;
    const d = this.peek(a);
    if(d === 32 || d === 5 || d === 3 || d === 1) return true;
    if(d !== 10) return false;
    const ta = a + STEP.get(sc);
    return this.peek(ta) === 32;
  }

  isStuck(){
    return this.BTEL > 0 && !DIRS.some(([sc]) => this.isSafeMove(sc));
  }

  randomLegalScancode(){
    const head = this.T[this.BTEL];
    const food = [], plain = [], smile = [];
    for(const [sc, d] of DIRS){
      const ch = this.peek(head + d);
      if(ch === 3 || ch === 5) food.push(sc);
      else if(ch === 32) plain.push(sc);
      else if(ch === 10){
        if(this.peek(head + d * 2) === 32) plain.push(sc);
      } else if(ch === 1) {
        smile.push(sc);
      }
    }
    const tier = food.length ? food : plain.length ? plain : smile;
    return tier.length ? tier[Math.trunc(this.rnd() * tier.length)] : 0;
  }

  step(sc){
    if(this.isStuck()) return { done: true, result: 'stuck' };
    if(sc === 72 || sc === 80 || sc === 75 || sc === 77) this.E = sc;
    let a = this.T[this.BTEL];
    if(this.E === 80) a += 160; else if(this.E === 72) a -= 160;
    if(this.E === 77) a += 2; else if(this.E === 75) a -= 2;
    const d = this.peek(a);
    let blocked = false;
    if(d === 32){
      this.poke(this.T[this.ETEL], 32);
      this.ETEL++;
    } else if(d === 5){
      this.place(1);
      this.scoreBy(25);
      this.KLAVER--;
    } else if(d === 3){
      if(this.level > 16){ this.place(5); if(this.K1 === 1) this.KLAVER++; }
      this.place(1);
      this.scoreBy(10);
      this.HART--;
    } else if(d === 10){
      let ta = a;
      if(this.E === 80) ta += 160; else if(this.E === 72) ta -= 160;
      if(this.E === 77) ta += 2; else if(this.E === 75) ta -= 2;
      if(this.peek(ta) !== 32) blocked = true;
      else {
        this.poke(ta, 10);
        this.poke(this.T[this.ETEL], 32);
        this.ETEL++;
      }
    } else if(d === 1){
      this.scoreBy(-50);
      this.place(1);
    } else if(d === 24 || d === 26 || d === 27){
      return { done: true, result: `hit-arrow-${d}` };
    } else {
      blocked = true;
    }
    if(blocked){
      this.E = this.F;
      this.scoreBy(-this.BMIN);
      return { done: false, blocked: true };
    }
    this.poke(this.T[this.BTEL], this.E === 77 || this.E === 75 ? 205 : 186);
    this.BTEL++;
    this.T[this.BTEL] = a;
    this.F = this.E;
    this.poke(this.T[this.BTEL], 219);
    try {
      this.updateEnemy();
    } catch(err) {
      return { done: true, result: err.message };
    }
    if(this.HART + this.KLAVER <= 0) return { done: true, result: 'clear' };
    return { done: false, ate: isFood(d), smile: d === 1, stone: d === 10 };
  }
}

function summarizeTrail(trail){
  return trail.slice(-24).map(o => `${rowOf(o)},${colOf(o)}`).join(' ');
}

function boardDump(game){
  const rows = [];
  for(let row = 3; row <= 21; row++){
    let line = '';
    for(let col = 1; col <= 80; col++){
      const ch = game.peek(off(row, col));
      if(ch === 219) line += '@';
      else if(ch === 186 || ch === 205) line += 'o';
      else if(ch === 3) line += 'h';
      else if(ch === 5) line += 'c';
      else if(ch === 1) line += ':';
      else if(ch === 10) line += '*';
      else if(ch === 24) line += '^';
      else if(ch === 26) line += '>';
      else if(ch === 27) line += '<';
      else if(ch === 179 || ch === 180 || ch === 193 || ch === 194 || ch === 195 || ch === 196 || ch === 197) line += '#';
      else line += '.';
    }
    rows.push(line.replace(/\.+$/g, ''));
  }
  return rows.join('\n');
}

function resultRow(game, args, data){
  const row = {
    level: data.level,
    seed: data.seed,
    result: data.result,
    ticks: data.ticks,
    score: game.score,
    foods: data.foods,
    smiles: data.smiles,
    stones: data.stones,
    blocked: data.blocked,
    nulls: data.nulls,
    bodyLen: game.BTEL - game.ETEL + 1,
    items: game.HART + game.KLAVER,
    idle: data.idle,
    head: game.T[game.BTEL],
    row: rowOf(game.T[game.BTEL]),
    col: colOf(game.T[game.BTEL]),
    ms: Math.round(performance.now() - data.started),
    moves: data.moves.join(''),
    trail: summarizeTrail(data.headTrail)
  };
  if(args.dumpBoard) row.board = boardDump(game);
  return row;
}

async function runOne(bot, level, seed, args){
  const game = new Game(level, seed);
  let idle = 0, prevScore = 0, nulls = 0, blocked = 0, smiles = 0, stones = 0, foods = 0;
  let movesSincePickup = 0;
  const headTrail = [];
  const moves = [];
  const started = performance.now();
  for(let tick = 1; tick <= args.maxTicks; tick++){
    if(game.score > prevScore) idle = 0; else idle++;
    prevScore = game.score;
    headTrail.push(game.T[game.BTEL]);
    if(headTrail.length > 128) headTrail.shift();
    let repeats = 0;
    for(let i = 0; i < Math.min(headTrail.length - 10, 96); i++) if(headTrail[i] === game.T[game.BTEL]) repeats++;
    const looping = idle > 20 && repeats >= 2;
    const stalled = idle > 120 || (idle > 24 && repeats >= 3);
    const forceRisk = stalled || movesSincePickup >= 250;
    let sc = bot.decide(game, {
      idle,
      looping,
      headTrail,
      budgetMs: args.budgetMs,
      forceRisk,
      modes: args.modes
    });
    if(sc === 0){
      nulls++;
      sc = game.randomLegalScancode();
    }
    const before = game.T[game.BTEL];
    const step = game.step(sc);
    if(sc !== 0) moves.push(KEY_NAME.get(sc) || `?${sc}`);
    if(moves.length > 96) moves.shift();
    if(step.blocked) blocked++;
    if(step.smile) smiles++;
    if(step.stone) stones++;
    if(step.ate) foods++;
    if(step.ate) movesSincePickup = 0;
    else movesSincePickup++;
    if(step.done){
      return resultRow(game, args, {
        level, seed, result: step.result, ticks: tick, foods, smiles, stones,
        blocked, nulls, idle, started, moves, headTrail, before
      });
    }
  }
  return resultRow(game, args, {
    level, seed, result: 'timeout', ticks: args.maxTicks, foods, smiles, stones,
    blocked, nulls, idle, started, moves, headTrail
  });
}

function printSummary(results, traceFailures){
  const byLevel = new Map();
  for(const r of results){
    if(!byLevel.has(r.level)) byLevel.set(r.level, []);
    byLevel.get(r.level).push(r);
  }
  for(const [level, rows] of byLevel){
    const total = rows.length;
    const counts = new Map();
    for(const r of rows) counts.set(r.result, (counts.get(r.result) || 0) + 1);
    const avgTicks = Math.round(rows.reduce((a, r) => a + r.ticks, 0) / total);
    const avgItems = (rows.reduce((a, r) => a + r.items, 0) / total).toFixed(1);
    const avgSmiles = (rows.reduce((a, r) => a + r.smiles, 0) / total).toFixed(1);
    const countText = [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(`level ${level}: ${countText} avgTicks=${avgTicks} avgItemsLeft=${avgItems} avgSmiles=${avgSmiles}`);
  }
  const failures = results.filter(r => r.result !== 'clear');
  console.log(`total: clear=${results.length - failures.length}/${results.length} failures=${failures.length}`);
  for(const r of failures.slice(0, traceFailures)){
    console.log(`fail L${r.level} seed=${r.seed} ${r.result} ticks=${r.ticks} idle=${r.idle} items=${r.items} body=${r.bodyLen} score=${r.score} blocked=${r.blocked} nulls=${r.nulls} head=${r.row},${r.col}`);
    console.log(`  moves=${r.moves}`);
    console.log(`  trail=${r.trail}`);
    if(r.board) console.log(r.board);
  }
}

async function main(){
  const args = parseArgs();
  const bot = await WasmBot.load(args.wasm);
  const results = [];
  for(const level of args.levels){
    for(let i = 0; i < args.seeds; i++){
      const seed = args.startSeed + i;
      results.push(await runOne(bot, level, seed, args));
    }
  }
  if(args.json) console.log(JSON.stringify(results, null, 2));
  else printSummary(results, args.traceFailures);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
