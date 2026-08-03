#!/usr/bin/env node
/*
  sim-3d-bot.mjs - headless simulator for the 2026 remake's autopilot.

  Extracts the real game-logic + planner functions straight out of
  docs/js/game3d.js (no copied code, so it cannot drift) and runs the bot
  over chosen levels/seeds without a browser, WebGL, or DOM. Rendering,
  audio, and HUD calls are stubbed; movement rules, layouts, gates, wisps,
  and the autopilot are the shipped code, byte for byte.

  Usage:
    node tools/sim-3d-bot.mjs                 # levels 1-8, 10 seeds each
    node tools/sim-3d-bot.mjs --levels 5,8 --seeds 25
    node tools/sim-3d-bot.mjs --levels 1-8 --seeds 10 --verbose
    node tools/sim-3d-bot.mjs --self-test     # focused planner invariants

  Like the game itself, a run ends on death (entombed / zapped / watchdog)
  or on a clear; each trial is a single life on a freshly built level.
*/
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'docs', 'js', 'game3d.js'), 'utf8');

/* ---- extract a top-level declaration by its exact header ---- */
function grab(header){
  const i = SRC.indexOf(header);
  if(i < 0) throw new Error('declaration not found in game3d.js: ' + header);
  const isFn = header.startsWith('function');
  let depth = 0, opened = false, j = i;
  while(j < SRC.length){
    const c = SRC[j], c2 = SRC[j + 1];
    if(c === '/' && c2 === '/'){ j = SRC.indexOf('\n', j); if(j < 0) j = SRC.length; continue; }
    if(c === '/' && c2 === '*'){ j = SRC.indexOf('*/', j) + 2; continue; }
    if(c === "'" || c === '"' || c === '`'){
      j++;
      while(j < SRC.length && SRC[j] !== c){ if(SRC[j] === '\\') j++; j++; }
      j++; continue;
    }
    if(c === '{' || c === '(' || c === '['){ depth++; opened = true; }
    else if(c === '}' || c === ')' || c === ']'){
      depth--;
      if(isFn && opened && depth === 0 && c === '}'){ j++; break; }
    } else if(c === ';' && depth === 0 && !isFn){ j++; break; }
    j++;
  }
  return SRC.slice(i, j) + '\n';
}

const HEADERS = [
  'const clamp', 'const lerp',
  'const GW', 'const EMPTY', 'const gxToWorld', 'const gyToWorld',
  'const grid', 'const gi', 'const inField',
  'const G = {', 'const tierOf',
  'function setCells', 'const wallSeg', 'const stoneAt',
  'function layOpen', 'function laySegments', 'function layRooms', 'function layZigzag',
  'function gateOpenAt', 'function applyGate', 'function layGates', 'function gateStep',
  'function makeWisp', 'function layRisers', 'function laySweepers', 'function layStoneGates',
  'const LAYOUTS',
  'function placeItem', 'function buildLevel',
  'function headWorld', 'function isPassableFor', 'function canLeaveBy', 'function isStuck',
  'function bump', 'function tryStep',
  'const bfsSeen', 'const bfsFirst', 'const bfsQueue', 'const DIRS',
  'function wispNear', 'function routeNext',
  'const BOT_STEP', 'const BOT_SKULL', 'const BOT_STONE', 'const BOT_HUG_WALL',
  'const BOT_HUG_BODY', 'const BOT_GATE', 'const BOT_WISP', 'const BOT_WISP_SOON',
  'const BOT_LANE',
  'const botGateCol', 'function botGateStone', 'function botGateJammed',
  'function botGatesLive', 'function botGatePass', 'function botFlood',
  'const botDist', 'const botFirst', 'const botSteps', 'function botWispD2',
  'function botLaneNear',
  'const botBandFree', 'const botBandGrow', 'const botBandBody', 'const botBandLoot',
  'const BOT_MIGRATE',
  'function botBandAt', 'function botBands(', 'function botBandShort',
  'const botHeap = [', 'function botHeapPush',
  'function botHeapPop', 'function botHugCost',
  'const botRegion', 'const BOT_OVERFILL', 'const BOT_TAILPULL', 'const BOT_CLUB_LATER',
  'const botVGrid', 'const botVIdx', 'const botRoute', 'const botBan ', 'const botPrev',
  'function botRouteSafe',
  'let botHuntOut', 'let botTarget', 'let botFedMark', 'let botFedAt',
  'function botHuntPass(', 'function botHunt(',
  'function botStepInfo', 'const botBodyIdx', 'function botChase',
  'function botEval', 'function botHot', 'function botSteer',
  'function updateWisps',
];

const prelude = `
'use strict';
/* seeded RNG so runs are reproducible: mulberry32 behind a Math proxy */
let __seed = 1;
function __rng(){
  __seed |= 0; __seed = (__seed + 0x6D2B79F5) | 0;
  let t = Math.imul(__seed ^ (__seed >>> 15), 1 | __seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const __Math = globalThis.Math;
const Math = new Proxy(__Math, { get: (t, k) => k === 'random' ? __rng : t[k] });
const BOT = true;
const COL = { heart: [0,0,0], club: [0,0,0], smiley: [0,0,0], wisp: [0,0,0] };
const cam = { shake: 0, kick: 0, roll: 0 };
const Snd = new Proxy({}, { get: () => () => {} });
const noop = () => {};
const hudLevel = noop, hudBonus = noop, hudLives = noop, hudScore = noop;
const hudToast = noop, hudFlash = noop, hudCard = noop, markLevelTabs = noop;
const floatLabel = noop, spawnBurst = noop, spawnShock = noop;
const tx = k => k;
function addScore(n){ G.score += n; }
function startDeath(cause){ if(G.state !== 'play') return; G.state = 'dying'; G.deathCause = cause; }
function startClear(){ if(G.state !== 'play') return; G.state = 'clear'; }
`;

const driver = `
/* replay the planner's decision inputs read-only (same helpers, same prep
   order as botSteer) so death spirals can be diagnosed step by step */
function probe(){
  const h = G.cells[0];
  botBodyIdx.fill(-1);
  for(let j = 0; j < G.cells.length; j++){ const c = G.cells[j]; botBodyIdx[gi(c.x, c.y)] = G.cells.length - 1 - j; }
  botBands();
  const reg = botFlood(gi(h.x, h.y), null, true);
  botRegion.set(bfsSeen);
  const tight = reg.area < G.cells.length + G.growPending + reg.grow + 20;
  const hunt = botHunt(tight);
  const parts = [];
  for(let d = 0; d < 4; d++){
    const dd = DIRS[d];
    const s = botStepInfo(dd);
    if(!s){ parts.push('NESW'[d] + ':--'); continue; }
    const ev = botEval(dd, s);
    const hot = botHot(s.nx, s.ny);
    const cls = (hot || !ev.okA) ? 0 : !ev.okB ? 1 : ev.loop ? 3 : 2;
    parts.push('NESW'[d] + ':' + (dd === hunt ? 'H' : '') + 'c' + cls +
      '/r' + ev.reserve + '/e' + ev.exits + '/' + ev.room + (hot ? '!' : ''));
  }
  const tg = botTarget >= 0 ? ' tgt(' + (botTarget % GW) + ',' + ((botTarget / GW) | 0) + ')' : '';
  return 'h(' + h.x + ',' + h.y + ') len=' + G.cells.length + ' grow=' + G.growPending +
    ' reg=' + reg.area + (tight ? ' TIGHT' : '') + tg + ' | ' + parts.join(' ');
}
function runLevel(level, seed, maxSteps){
  __seed = seed;
  G.level = level; G.score = 0; G.deathCause = '';
  buildLevel(level);
  G.state = 'play';
  G.time = 0; G.lastAdvance = 0; G.lastEatAt = -9;
  let steps = 0;
  const trail = [], probes = [];
  while(steps < maxSteps){
    trail.push(G.cells[0].x + ',' + G.cells[0].y + ':' + G.cells.length);
    if(trail.length > 60) trail.shift();
    if(PROBE){
      probes.push(probe());
      if(probes.length > 400) probes.shift();
    }
    const dt = G.stepDur;
    G.time += dt;
    G.gateAcc += dt;
    while(G.gateAcc >= G.gatePeriod){ G.gateAcc -= G.gatePeriod; gateStep(); }
    for(let k = 0; k < 4 && G.state === 'play'; k++) updateWisps(dt / 4);
    if(G.state !== 'play') break;
    tryStep();
    steps++;
    if(G.state !== 'play') break;
    if(G.time - G.lastAdvance > 5){ startDeath('watchdog'); break; }
  }
  return {
    level, seed, steps,
    outcome: G.state === 'clear' ? 'clear' : (G.state === 'play' ? 'timeout' : G.deathCause),
    score: G.score + (G.state === 'clear' ? G.bonus : 0),
    len: G.cells.length, hearts: G.heartsLeft, clubs: G.clubsLeft,
    map: G.state === 'clear' ? null : renderMap(),
    trail: G.state === 'clear' ? null : trail.join(' '),
    probes: G.state === 'clear' ? null : probes,
    gates: G.gates.map(g => g.x + '@' + g.gap).join(' '),
  };
}
function renderMap(){
  const CH = ['.', '#', 'o', 'H', 'C', 'x', 's'];
  const rows = [];
  const head = G.cells[0], tail = G.cells[G.cells.length - 1];
  for(let y = 0; y < GH; y++){
    let line = '';
    for(let x = 0; x < GW; x++){
      if(head && x === head.x && y === head.y) line += '@';
      else if(tail && x === tail.x && y === tail.y) line += 't';
      else line += CH[grid[gi(x, y)]] || '?';
    }
    rows.push(line);
  }
  for(const w of G.wisps){
    const x = Math.round(w.x), y = Math.round(w.y);
    if(y >= 0 && y < GH && x >= 0 && x < GW) rows[y] = rows[y].slice(0, x) + '*' + rows[y].slice(x + 1);
  }
  return rows.join('\\n');
}
function plannerScenarios(){
  const reset = cells => {
    grid.fill(EMPTY);
    for(let x = 0; x < GW; x++){ grid[gi(x, 0)] = WALL; grid[gi(x, GH - 1)] = WALL; }
    for(let y = 0; y < GH; y++){ grid[gi(0, y)] = WALL; grid[gi(GW - 1, y)] = WALL; }
    G.cells = cells.map(([x, y]) => ({ x, y }));
    for(const c of G.cells) grid[gi(c.x, c.y)] = SNAKE;
    G.dir = { x: 1, y: 0 }; G.growPending = 0;
    G.gates = []; G.wisps = []; G.gateAcc = 0; G.gatePeriod = 0.95;
    G.stepDur = 1 / 5.2; G.time = 0; G.lastEatAt = -9;
  };
  const chose = (name, x, y) => {
    botSteer();
    return { name, pass: G.dir.x === x && G.dir.y === y, got: G.dir.x + ',' + G.dir.y };
  };
  const tests = [];

  // The tempting heart is a sealed finger. A return lane around the body
  // must beat the immediate score.
  reset([[5,5],[4,5],[3,5],[2,5]]);
  grid[gi(6,5)] = HEART;
  grid[gi(6,4)] = WALL; grid[gi(7,5)] = WALL; grid[gi(6,6)] = WALL;
  tests.push(chose('return path beats adjacent heart', 0, -1));

  // Both routes can reach the tail, but the direct heart enters a one-cell
  // tunnel. Keep the lateral row and approach it from open ground instead.
  reset([[5,5],[4,5],[3,5],[2,5]]);
  grid[gi(6,5)] = HEART;
  grid[gi(6,4)] = WALL; grid[gi(6,6)] = WALL;
  tests.push(chose('lateral escape row beats direct food', 0, -1));

  // Skull and stone costs are prices, never prohibitions: when either is
  // the bridge to food and open ground the planner must take it.
  reset([[5,5],[4,5],[3,5],[2,5]]);
  grid[gi(5,4)] = WALL; grid[gi(5,6)] = WALL;
  grid[gi(6,5)] = SMILEY; grid[gi(8,5)] = HEART;
  tests.push(chose('skull may buy the escape route', 1, 0));

  reset([[5,5],[4,5],[3,5],[2,5]]);
  grid[gi(5,4)] = WALL; grid[gi(5,6)] = WALL;
  grid[gi(6,5)] = STONE; grid[gi(8,5)] = HEART;
  tests.push(chose('stone may be moved for later access', 1, 0));

  // Hearts before clovers: a heart spawns a NEW clover somewhere random, so
  // clear hearts while the tail is short — the nearer clover must lose to a
  // heart a stretch further away.
  reset([[5,5],[4,5],[3,5],[2,5]]);
  grid[gi(8,5)] = CLUB; grid[gi(5,13)] = HEART;
  tests.push(chose('nearby clover loses to farther heart', 0, 1));
  return tests;
}
return { runLevel, plannerScenarios };
`;

const PROBE = process.argv.includes('--probe');
const body = prelude + `const PROBE = ${PROBE};\n` + HEADERS.map(grab).join('') + driver;
let sim;
try {
  sim = new Function(body)();
} catch (err) {
  console.error('failed to assemble simulator from game3d.js:', err.message);
  process.exit(1);
}

/* ---- CLI ---- */
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const verbose = args.includes('--verbose');
const seeds = Number(opt('seeds', 10));
const maxSteps = Number(opt('steps', 60000));
const levelSpec = opt('levels', '1-8');
const levels = [];
for(const part of levelSpec.split(',')){
  const m = part.match(/^(\d+)-(\d+)$/);
  if(m) for(let l = +m[1]; l <= +m[2]; l++) levels.push(l);
  else levels.push(+part);
}

if(args.includes('--self-test')){
  const tests = sim.plannerScenarios();
  for(const t of tests) console.log(`${t.pass ? 'ok' : 'FAIL'}  ${t.name}${t.pass ? '' : ` (chose ${t.got})`}`);
  if(tests.some(t => !t.pass)) process.exitCode = 1;
  if(args.length === 1) process.exit();
}

let allClears = 0, allRuns = 0;
for(const level of levels){
  const runs = [];
  for(let s = 1; s <= seeds; s++) runs.push(sim.runLevel(level, s * 7919 + level, maxSteps));
  const clears = runs.filter(r => r.outcome === 'clear');
  const causes = {};
  for(const r of runs) if(r.outcome !== 'clear') causes[r.outcome] = (causes[r.outcome] || 0) + 1;
  const avgScore = Math.round(runs.reduce((a, r) => a + r.score, 0) / runs.length);
  const avgLen = Math.round(runs.reduce((a, r) => a + r.len, 0) / runs.length);
  allClears += clears.length; allRuns += runs.length;
  console.log(
    `level ${String(level).padStart(2)}: ${clears.length}/${runs.length} cleared` +
    `  avg score ${String(avgScore).padStart(6)}  avg len ${String(avgLen).padStart(3)}` +
    (Object.keys(causes).length ? `  deaths: ${Object.entries(causes).map(([c, n]) => `${c}×${n}`).join(' ')}` : '')
  );
  if(verbose) for(const r of runs.filter(x => x.outcome !== 'clear')){
    console.log(`   seed ${r.seed}: ${r.outcome} after ${r.steps} steps, len ${r.len}, ${r.hearts} hearts + ${r.clubs} clubs left`);
    if(args.includes('--map') && r.map){
      console.log(r.map.replace(/^/gm, '   '));
      console.log('   gates: ' + r.gates);
      if(r.trail) console.log(('last steps: ' + r.trail).replace(/^/gm, '   '));
      if(r.probes) for(const p of r.probes) console.log('   ' + p);
    }
  }
}
console.log(`total: ${allClears}/${allRuns} cleared`);
