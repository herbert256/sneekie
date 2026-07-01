#!/usr/bin/env node
// Offline tuner for the Wasm bot's scoring weights.
//
// The planner compiles with default weights; this script hill-climbs a better
// vector by running tools/sim-wasm-bot.mjs with `--weights` overrides and
// scoring the outcome (level clears first, then fewest items stranded, then
// total score). Run it overnight for real gains:
//
//   node tools/tune-bot-weights.mjs \
//     --wasm wasm/bot-engine/target/wasm32-unknown-unknown/release/bot_engine.wasm \
//     --levels 2,3,4,5,6,7,8 --seeds 4 --budget-ms 12 --iters 200
//
// The best vector lands in tools/bot-weights.best.json (see --out). To ship a
// tuned vector, copy its values into W_DEFAULTS in
// wasm/bot-engine/src/planner/mod.rs and rebuild -- the page always runs the
// compiled-in defaults.
//
// KEEP IN SYNC with W_DEFAULTS in wasm/bot-engine/src/planner/mod.rs.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NAMES = [
  'near_dist', 'near_tail', 'route_tail', 'route_live', 'route_exits',
  'route_space', 'route_escape_tail', 'route_points', 'route_dist',
  'pressure_tail', 'pressure_points', 'pressure_dist_urgent', 'pressure_dist',
  'local_bias_route', 'local_bias_cap_route', 'cluster_damp_floor',
  'corner_scale_confined', 'corner_scale_open', 'region_base',
  'region_per_food', 'smile_cost_near', 'smile_cost_route',
  'smile_cost_pressure_urgent', 'smile_cost_pressure',
  'return_debt_pressure_urgent', 'local_bias_pressure', 'region_focus_debt'
];
const DEFAULTS = [
  6400, 46000, 145000, 6100, 2700, 18, 44000, 170, 230,
  58000, 250, 95, 170, 900, 55000, 48, 130, 20, 6000,
  2500, 11000, 14000, 7500, 10500, 30000, 700, 9000
];

function parseArgs(){
  const args = {
    wasm: 'wasm/bot-engine/target/wasm32-unknown-unknown/release/bot_engine.wasm',
    levels: '2,3,4,5,6,7,8',
    seeds: 4,
    budgetMs: 12,
    maxTicks: 6000,
    iters: 100,
    sigma: 0.18,
    out: 'tools/bot-weights.best.json',
    start: null
  };
  for(let i = 2; i < process.argv.length; i++){
    const arg = process.argv[i];
    const next = () => process.argv[++i];
    if(arg === '--wasm') args.wasm = next();
    else if(arg === '--levels') args.levels = next();
    else if(arg === '--seeds') args.seeds = Number(next());
    else if(arg === '--budget-ms') args.budgetMs = Number(next());
    else if(arg === '--max-ticks') args.maxTicks = Number(next());
    else if(arg === '--iters') args.iters = Number(next());
    else if(arg === '--sigma') args.sigma = Number(next());
    else if(arg === '--out') args.out = next();
    else if(arg === '--start') args.start = next();
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function evaluate(vector, args, weightsFile){
  writeFileSync(weightsFile, JSON.stringify(vector));
  const run = spawnSync('node', [
    'tools/sim-wasm-bot.mjs',
    '--wasm', args.wasm,
    '--levels', args.levels,
    '--seeds', String(args.seeds),
    '--budget-ms', String(args.budgetMs),
    '--max-ticks', String(args.maxTicks),
    '--modes', 'single',
    '--weights', weightsFile,
    '--json'
  ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if(run.status !== 0) throw new Error(`sim failed: ${run.stderr}`);
  const results = JSON.parse(run.stdout);
  const clears = results.filter(r => r.result === 'clear').length;
  const itemsLeft = results.reduce((s, r) => s + (r.items || 0), 0);
  const score = results.reduce((s, r) => s + (r.score || 0), 0);
  // Clears dominate, stranded items are the tie-breaker, points come last.
  const objective = clears * 1_000_000 - itemsLeft * 500 + score / 10;
  return { objective, clears, itemsLeft, score, runs: results.length };
}

function perturb(vector, sigma, rand){
  // Log-normal jitter on a random subset keeps signs and relative scale sane.
  const out = vector.slice();
  const touches = 1 + Math.floor(rand() * 4);
  for(let t = 0; t < touches; t++){
    const i = Math.floor(rand() * out.length);
    const u1 = Math.max(rand(), 1e-9), u2 = rand();
    const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    out[i] = Math.max(0, Math.round(out[i] * Math.exp(sigma * gauss)));
  }
  return out;
}

async function main(){
  const args = parseArgs();
  const weightsFile = join(mkdtempSync(join(tmpdir(), 'sneekie-tune-')), 'weights.json');
  let seed = 0x9e3779b9;
  const rand = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
    return seed / 0x100000000;
  };
  let best = args.start ? JSON.parse(readFileSync(args.start, 'utf8')) : DEFAULTS.slice();
  console.log('evaluating starting vector...');
  let bestEval = evaluate(best, args, weightsFile);
  console.log(`start: clears=${bestEval.clears}/${bestEval.runs} itemsLeft=${bestEval.itemsLeft} score=${bestEval.score}`);
  writeFileSync(args.out, JSON.stringify(best));
  for(let iter = 1; iter <= args.iters; iter++){
    const cand = perturb(best, args.sigma, rand);
    const ev = evaluate(cand, args, weightsFile);
    const better = ev.objective > bestEval.objective;
    console.log(`iter ${iter}: clears=${ev.clears}/${ev.runs} itemsLeft=${ev.itemsLeft} score=${ev.score}${better ? '  <-- new best' : ''}`);
    if(better){
      best = cand;
      bestEval = ev;
      writeFileSync(args.out, JSON.stringify(best));
      const diff = best.map((v, i) => v !== DEFAULTS[i] ? `${NAMES[i]}=${v}` : null).filter(Boolean);
      console.log(`  changed vs defaults: ${diff.join(', ') || '(none)'}`);
    }
  }
  console.log(`done. best: clears=${bestEval.clears}/${bestEval.runs} itemsLeft=${bestEval.itemsLeft} score=${bestEval.score}`);
  console.log(`best vector written to ${args.out}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
