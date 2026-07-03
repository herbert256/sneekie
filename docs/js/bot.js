'use strict';
/* bot.js — the Live bot driver, running in THIS page (no iframe). game.js renders
   the real game into #screen; the Wasm planner turns a compact live snapshot into
   one scancode. The Bot page and the landing-page previews both load bot-engine.js
   and wait for bot-engine.wasm before driving; when WebAssembly cannot load (e.g.
   from file://) the bot stays idle. This script handles tabs, restarts, speed, and
   pushKey(). Wrapped in an IIFE so it never redeclares game.js globals. */
(function(){
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---- speed: a 0-10 slider mapped to a per-move delay ---- */
  const SPEED_CHOICES = [0,10,20,30,40,50,60,70,80,90,100];
  const speed = document.getElementById('speed');
  const speedout = document.getElementById('speedout');
  const configuredSpeed = Number(window.SNEEKIE_BOT_SPEED);
  let botSpeed = SPEED_CHOICES.includes(configuredSpeed) ? configuredSpeed : 70;
  const silentWake = window.SNEEKIE_BOT_SILENT === true;
  function speedToDelay(value){ return Math.round(45 + 375 * Math.pow((100 - value) / 100, 1.6)); }
  function speedIndex(){
    if(!speed){
      const index = SPEED_CHOICES.indexOf(botSpeed);
      return index >= 0 ? index : SPEED_CHOICES.indexOf(70);
    }
    const value = Number(speed.value);
    if(Number.isFinite(value)) return Math.max(0, Math.min(SPEED_CHOICES.length - 1, Math.round(value)));
    return SPEED_CHOICES.indexOf(70);
  }
  function updateSpeed(){
    const index = speedIndex();
    botSpeed = SPEED_CHOICES[index];
    speed.value = String(index);
    if(speedout){
      speedout.value = String(botSpeed);
      speedout.textContent = String(botSpeed);
    }
    speed.setAttribute('aria-valuetext', String(botSpeed));
  }
  if(speed){
    speed.min = '0'; speed.max = String(SPEED_CHOICES.length - 1); speed.step = '1';
    speed.addEventListener('input', updateSpeed);
    updateSpeed();
  }
  function botDelay(){ return speedToDelay(botSpeed); }
  const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const passivePreview = window.SNEEKIE_PASSIVE_PREVIEW === true;
  const startupAt = now();
  const startupGraceUntil = startupAt + 4000;
  const sleepForTick = started => sleep(Math.max(0, botDelay() - (now() - started)));
  const routeBudget = urgent => {
    const cap = now() < startupGraceUntil ? 10 : urgent ? 42 : 28;
    return Math.max(8, Math.min(cap, botDelay() * (urgent ? 0.34 : 0.22)));
  };
  const keyOf = {72:' H', 80:' P', 75:' K', 77:' M'};
  const waitingForKey = () =>
    typeof window.sneekieWaitingForKey === 'function' && window.sneekieWaitingForKey();
  const botText = key => (window.SNEEKIE_TEXT && window.SNEEKIE_TEXT[key]) || key;
  function delayedLoadingStatus(isReady){
    if(passivePreview) return { done(){}, fail(){} };
    let shown = null, finished = false;
    const timer = setTimeout(() => {
      if(finished || isReady()) return;
      shown = document.createElement('div');
      shown.className = 'bot-loading';
      shown.setAttribute('role', 'status');
      shown.setAttribute('aria-live', 'polite');
      shown.setAttribute('aria-atomic', 'true');
      shown.textContent = botText('botLoading');
      document.body.appendChild(shown);
    }, 450);
    return {
      done(){
        if(finished) return;
        finished = true;
        clearTimeout(timer);
        if(shown){
          shown.classList.add('is-done');
          setTimeout(() => shown.remove(), 220);
        }
      },
      // The planner can never become ready (wasm failed to load, or it tripped
      // mid-session): swap the "loading" toast for a final status instead of
      // letting it claim to load forever.
      fail(message){
        if(finished) return;
        finished = true;
        clearTimeout(timer);
        if(!shown){
          shown = document.createElement('div');
          shown.className = 'bot-loading';
          shown.setAttribute('role', 'status');
          shown.setAttribute('aria-live', 'polite');
          shown.setAttribute('aria-atomic', 'true');
          document.body.appendChild(shown);
        }
        shown.textContent = message;
      }
    };
  }
  // Wire the Wasm planner. Both the Bot page and the landing-page previews load
  // bot-engine.js and wait for bot-engine.wasm before driving.
  function createPlanner(access){
    return (window.SneekieBotWasm && window.SneekieBotWasm.create(access)) || null;
  }
  const planner = createPlanner({
    now,
    peek: o => peek(o),
    state: () => ({ T, D, ETEL, BTEL, LEVEL, HART, KLAVER, BONUS })
  });
  const plannerReady = () => planner && (typeof planner.ready !== 'function' || planner.ready());
  const plannerFailed = () => !planner || (typeof planner.failed === 'function' && planner.failed());
  const loadingStatus = delayedLoadingStatus(plannerReady);

  /* ---- level tabs (2-8): which early maze the bot drops into ---- */
  const LEVELS = [2,3,4,5,6,7,8];
  const hasBotLevel = n => LEVELS.includes(n);
  const nextBotLevel = n => {
    const index = LEVELS.indexOf(n);
    return LEVELS[index >= 0 && index < LEVELS.length - 1 ? index + 1 : 0];
  };
  let target = 2, activeLevel = 2, pendingJump = 2, jumpingTo = null;
  const tablist = document.getElementById('leveltabs');
  const pageLang = window.SNEEKIE_LANG || document.documentElement.lang || 'en';
  const levelPrefix = pageLang === 'uk' ? 'Рівень ' : 'Level ';
  const tabs = new Map();
  function markTabs(){ tabs.forEach((b, n) => b.setAttribute('aria-pressed', String(n === target))); }
  function queueLevel(n){
    // target is the requested tab; activeLevel is only updated once the game reaches it.
    target = n;
    pendingJump = n;
    jumpingTo = null;
    markTabs();
  }
  function queueNextLevel(){ queueLevel(nextBotLevel(activeLevel)); }
  function wake(){ if(!silentWake && typeof ensureAudio === 'function') ensureAudio(); }   // audio needs a user gesture
  if(tablist){
    for(const n of LEVELS){
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.level = String(n);
      b.textContent = levelPrefix + n;
      b.addEventListener('click', () => { wake(); queueLevel(n); });
      tablist.appendChild(b); tabs.set(n, b);
    }
    markTabs();
  }
  if(!silentWake){
    addEventListener('pointerdown', wake);
    addEventListener('keydown', wake);
  }

  /* ---- driver: drive game.js continuously, jumping to the selected level ----
     Each tick we press one key. The bot's own move keys dismiss the "Level n /
     press any key" popups. When the game ends, playLevels() returns and the
     FOR loop leaves LEVEL at 33, parking at "Play again (y/n)". That happens both
     on a final death (snake fully unwound, ETEL > BTEL) AND on a clean win where
     the bot clears the last level with the snake intact (ETEL <= BTEL) -- so we
     key off LEVEL > 32, not the snake state, or a clean win would freeze here. */
  const yesKey = () => {
    const key = typeof gt === 'function' ? gt('yesInput') : 'y';
    return key && key !== 'yesInput' ? key : 'y';
  };
  window.SNEEKIE_BOT_DRIVES_GAME = true;
  const STALL_IDLE_LIMIT = 120;
  const STALL_LOOP_IDLE_LIMIT = 24;
  const PICKUP_STUCK_LIMIT = 250;
  const DIRS = [72, 80, 75, 77];
  const stepOf = {72:-160, 80:160, 75:-2, 77:2};
  const oppositeOf = {72:80, 80:72, 75:77, 77:75};
  const isArrowScancode = sc => sc === 72 || sc === 80 || sc === 75 || sc === 77;
  const targetCellFor = sc => {
    const step = stepOf[sc];
    return step === undefined ? 0 : peek(T[BTEL] + step);
  };
  const arrowNextUnsafe = off =>
    typeof routeArrowNextUnsafe === 'function' && routeArrowNextUnsafe(off >> 1);
  // A move the snake can make right now without walking into a wall, its own
  // body, or an enemy arrow: an empty cell, a heart/club/smiley, or a stone
  // with an empty cell behind it (so it can be pushed). The random fallback
  // below uses this so the bot keeps wandering instead of giving up -- the
  // snake only dies when NO such move exists (it is really stuck).
  // The random wander fallback used while stalled. It is tiered so the dumb
  // wander still does the obvious right things: grab an adjacent heart/club (a
  // free pickup that also breaks the stall), otherwise step onto empty space or
  // push a stone, and only ever step onto a -50 smiley as a true last resort
  // when no other legal move exists. Earlier this picked uniformly across all
  // legal cells, so a long random stall nibbled a pile of smileys (one L2 stall
  // ate ~19, tanking the score) for no reason. Entropy is preserved by picking
  // randomly WITHIN the best available tier, so it still escapes orbits.
  const randomLegalScancode = () => {
    const head = T[BTEL];
    const food = [], plain = [], smile = [];
    for(const sc of DIRS){
      const step = stepOf[sc], ch = peek(head + step);
      if(arrowNextUnsafe(head + step)) continue;
      if(ch === 3 || ch === 5) food.push(sc);                          // heart/club: free pickup
      else if(ch === 32) plain.push(sc);                               // empty
      else if(ch === 10){ if(peek(head + step * 2) === 32) plain.push(sc); } // pushable stone
      else if(ch === 1) smile.push(sc);                                // smiley: -50, last resort
    }
    const tier = food.length ? food : plain.length ? plain : smile;
    return tier.length ? tier[Math.floor(Math.random() * tier.length)] : null;
  };
  // Only real food (heart/club) counts as progress for the no-food safeguard.
  // A smiley (1) is worth -50, so letting it reset the counter let the bot
  // orbit forever nibbling smileys without ever tripping the fallback.
  const isFoodCell = ch => ch === 3 || ch === 5;
  const isOpenCell = ch => ch === 32 || ch === 1 || isFoodCell(ch);
  const legalMove = sc => {
    if(!isArrowScancode(sc)) return false;
    const head = T[BTEL], step = stepOf[sc], next = head + step;
    if(arrowNextUnsafe(next)) return false;
    const ch = peek(next);
    if(isOpenCell(ch)) return true;
    return ch === 10 && peek(next + step) === 32;
  };
  const bodySet = () => {
    const body = new Set();
    for(let i = ETEL; i <= BTEL; i++) body.add(T[i]);
    return body;
  };
  const foodDistanceFrom = (head, dir, body, cellAt, noSmile, limit = 1600) => {
    const seen = new Set([head + ':' + dir]);
    const q = [[head, dir, 0]];
    let scanned = 0;
    while(q.length && scanned < limit){
      const [off, currentDir, dist] = q.shift();
      scanned++;
      for(const sc of DIRS){
        if(sc === oppositeOf[currentDir]) continue;
        const next = off + stepOf[sc];
        if(next < 0 || next >= 4000 || body.has(next)) continue;
        const ch = cellAt(next);
        if(isFoodCell(ch)) return dist + 1;
        if(noSmile ? ch !== 32 : !isOpenCell(ch)) continue;
        const key = next + ':' + sc;
        if(!seen.has(key)){
          seen.add(key);
          q.push([next, sc, dist + 1]);
        }
      }
    }
    return Infinity;
  };
  const currentFoodDistance = noSmile =>
    foodDistanceFrom(T[BTEL], F, bodySet(), off => peek(off), noSmile, 1600);
  const projectedState = sc => {
    if(!legalMove(sc)) return null;
    const step = stepOf[sc], head = T[BTEL], next = head + step, first = peek(next);
    const body = bodySet();
    if(first === 32 || first === 10) body.delete(T[ETEL]);
    body.add(next);
    const empty = new Set();
    const stones = new Set();
    if(first === 10){
      empty.add(next);
      stones.add(next + step);
    }
    const cellAt = off => stones.has(off) ? 10 : empty.has(off) ? 32 : peek(off);
    return { head: next, dir: sc, body, cellAt, first };
  };
  const projectedFoodDistance = (sc, noSmile) => {
    const projected = projectedState(sc);
    if(!projected) return Infinity;
    if(isFoodCell(projected.first)) return 0;
    return foodDistanceFrom(projected.head, projected.dir, projected.body, projected.cellAt, noSmile, 1600);
  };
  const projectedLegalCount = sc => {
    const projected = projectedState(sc);
    if(!projected) return 0;
    let count = 0;
    for(const nextSc of DIRS){
      if(nextSc === oppositeOf[projected.dir]) continue;
      const step = stepOf[nextSc], next = projected.head + step;
      if(next < 0 || next >= 4000 || arrowNextUnsafe(next) || projected.body.has(next)) continue;
      const ch = projected.cellAt(next);
      if(isOpenCell(ch)) count++;
      else if(ch === 10 && !projected.body.has(next + step) && projected.cellAt(next + step) === 32) count++;
    }
    return count;
  };
  const projectedSpace = sc => {
    const projected = projectedState(sc);
    if(!projected) return 0;
    const seen = new Set([projected.head]);
    const q = [projected.head];
    while(q.length && seen.size < 4000){
      const off = q.shift();
      for(const nextSc of DIRS){
        const next = off + stepOf[nextSc];
        if(next < 0 || next >= 4000 || seen.has(next) || projected.body.has(next)) continue;
        if(!isOpenCell(projected.cellAt(next))) continue;
        seen.add(next);
        q.push(next);
      }
    }
    return seen.size;
  };
  const openBoardLevel = () => [0, 5, 6, 8, 13, 14].includes((LEVEL - 1) % 16);
  const preserveFoodRoute = sc => {
    if(!legalMove(sc)) return sc;
    // On the walled mazes a planner smiley landing is deliberate (an escape
    // bridge that keeps the return path), so trust it. On the open arrow
    // boards nothing walls the snake in, so keep steering off smileys there.
    if(targetCellFor(sc) === 1 && !openBoardLevel()) return sc;
    const exits = projectedLegalCount(sc);
    const currentClean = currentFoodDistance(true);
    const currentFood = currentClean < Infinity ? currentClean : currentFoodDistance(false);
    if(currentFood === Infinity && exits > 0) return sc;
    const nextClean = projectedFoodDistance(sc, true);
    const nextFood = nextClean < Infinity ? nextClean : projectedFoodDistance(sc, false);
    const bodyLen = BTEL - ETEL + 1;
    const roomyEnough = Math.max(800, bodyLen + 8);
    const chosenSpace = projectedSpace(sc);
    const losesClean = currentClean < Infinity && nextClean === Infinity;
    const losesFood = currentFood < Infinity && nextFood === Infinity;
    if(bodyLen <= 24 && losesClean && !losesFood && chosenSpace >= roomyEnough && exits > 0) return sc;
    if((currentClean >= Infinity || nextClean < Infinity) &&
        (currentFood >= Infinity || nextFood < Infinity) &&
        exits > 0) return sc;

    let best = null, bestScore = -Infinity;
    for(const cand of DIRS){
      if(!legalMove(cand)) continue;
      const candExits = projectedLegalCount(cand);
      if(candExits <= 0) continue;
      // Never redirect a roomy planner move into a cramped pocket.
      if(chosenSpace >= bodyLen + 8 && projectedSpace(cand) < bodyLen + 8) continue;
      const clean = projectedFoodDistance(cand, true);
      const food = clean < Infinity ? clean : projectedFoodDistance(cand, false);
      if(currentClean < Infinity && clean === Infinity) continue;
      if(currentFood < Infinity && food === Infinity) continue;
      const ch = targetCellFor(cand);
      const dist = currentClean < Infinity ? clean : food;
      const score = (isFoodCell(ch) ? 120000 : 0)
        + (clean < Infinity ? 60000 : 0)
        + candExits * 12000
        - (ch === 1 ? 18000 : 0)
        - dist * 1800
        + (cand === F ? 250 : 0);
      if(score > bestScore){
        bestScore = score;
        best = cand;
      }
    }
    return best || sc;
  };
  (async () => {
    let idle = 0, prevScore = 0, over = 0, deathQueued = false, gameEndQueued = false, forcedDeathQueued = false;
    let movesSincePickup = 0;
    let observedLive = null;
    const headTrail = [];
    // Route commitment: the planner returns its whole certified route, and the
    // driver replays it step by step (re-validating each move) instead of
    // replanning from scratch every tick. Cleared on any surprise.
    let committedRoute = [];
    const resetMoveCounters = () => {
      idle = 0;
      movesSincePickup = 0;
      headTrail.length = 0;
      committedRoute = [];
    };
    while(true){
      if(typeof LEVEL === 'undefined' || LEVEL < 1){ await sleep(botDelay()); continue; }   // wait for the game to start
      if(plannerFailed()){
        // bot-engine.wasm cannot load here (file://, fetch failure) or the
        // planner tripped mid-session. The bot stays idle by design; say so.
        loadingStatus.fail(botText('botUnavailable'));
        const screen = passivePreview && document.getElementById('screen');
        if(screen) screen.setAttribute('aria-label', botText('botUnavailable'));
        return;
      }
      if(!plannerReady()){ await sleep(80); continue; }      // wait for bot-engine.wasm to load
      loadingStatus.done();
      // game finished (final death or clean win) -> answer "play again", re-target.
      // Checked before the jump below so a tab click can't overwrite LEVEL first.
      if(LEVEL > 32){
        if(++over >= 4){
          // Don't overwrite a level tab the user clicked during the game-over
          // window (same guard as the LIVE-drop path below).
          if(!gameEndQueued){
            if(pendingJump === null && jumpingTo === null) queueNextLevel();
            gameEndQueued = true;
          }
          forcedDeathQueued = false;
          resetMoveCounters();
          pushKey('\r'); pushKey(yesKey()); over = 0;
        }
        observedLive = LIVE;
        await sleep(botDelay()); continue;
      }
      over = 0;
      // mid-death unwind or restart popup: advance to the next bot level, then
      // dismiss the popup/next-level prompt so the normal jump path can take over.
      if(ETEL > BTEL){
        if(!deathQueued){
          // Keep a user's pending tab click instead of overwriting it while
          // the snake unwinds.
          if(pendingJump === null && jumpingTo === null) queueNextLevel();
          gameEndQueued = true;
          deathQueued = true;
          forcedDeathQueued = false;
          resetMoveCounters();
          observedLive = LIVE;
          pushKey('\r');
        }
        await sleep(botDelay()); continue;
      }
      // deathSeq() can finish and rebuild the same BASIC level between bot ticks.
      // The lower life count is the stable signal that the previous level failed.
      if(observedLive !== null && LIVE < observedLive && pendingJump === null && jumpingTo === null){
        queueNextLevel();
        forcedDeathQueued = false;
        resetMoveCounters();
      }
      observedLive = LIVE;
      deathQueued = false;
      gameEndQueued = false;
      if(jumpingTo !== null){
        if(LEVEL === jumpingTo){
          activeLevel = LEVEL;
          target = LEVEL;
          jumpingTo = null;
          forcedDeathQueued = false;
          resetMoveCounters();
          markTabs();
        } else {
          await sleep(botDelay()); continue;
        }
      } else if(pendingJump === null && hasBotLevel(LEVEL) && activeLevel !== LEVEL){
        activeLevel = LEVEL;
        target = LEVEL;
        markTabs();
      } else if(pendingJump === null && !hasBotLevel(LEVEL)){
        // A clean clear of level 8 rolls the game into level 9+, which the
        // page does not advertise (and where the game's own auto-move outruns
        // slow slider speeds). Wrap back into the 2-8 rotation instead.
        queueNextLevel();
      }
      // jump to the selected level once the game has built the current level.
      // The request may be queued while the "Level n" popup is waiting; Enter
      // dismisses that popup and game.js consumes the request at the move loop.
      if(pendingJump !== null && ETEL <= BTEL &&
          (typeof window.sneekieRequestLevel === 'function' || BTEL > 2)){
        jumpingTo = pendingJump;
        if(typeof window.sneekieRequestLevel === 'function'){
          window.sneekieRequestLevel(pendingJump);
          pushKey('\r');
        }
        else { LEVEL = pendingJump - 1; pushKey(' D'); } // F10 skips straight into the target level
        pendingJump = null; forcedDeathQueued = false; resetMoveCounters();
        await sleep(botDelay()); continue;
      }
      const tickStarted = now();
      if(waitingForKey()){
        forcedDeathQueued = false;
        pushKey('\r');                                 // under the level popup -> any key dismisses it
        await sleepForTick(tickStarted); continue;
      }
      if(ZCORE > prevScore){
        idle = 0;
        movesSincePickup = 0;
      } else idle++;
      prevScore = ZCORE;
      headTrail.push(T[BTEL]);
      if(headTrail.length > 96) headTrail.shift();
      let repeats = 0;
      for(let i = 0; i < headTrail.length - 10; i++) if(headTrail[i] === T[BTEL]) repeats++;
      const looping = idle > 20 && repeats >= 2;
      // Two situations used to make the snake give up here: a long run with no
      // real food eaten, or a stall (orbiting with no score gain). Neither kills
      // the snake anymore. When either trips, keep the Wasm planner in charge but
      // mark the decision as force-risk so its loop-breaking, strict-space, and
      // return-path scoring get much heavier. Random wandering is now only a last
      // fallback when the planner cannot find a move at all.
      const stalled = idle > STALL_IDLE_LIMIT || (idle > STALL_LOOP_IDLE_LIMIT && repeats >= 3);
      const forceRisk = stalled || movesSincePickup >= PICKUP_STUCK_LIMIT;
      let sc = null;
      if(forceRisk || looping) committedRoute = [];
      if(committedRoute.length){
        // Replay the committed route while each step is still legal and the
        // route-preservation check agrees; any disagreement drops the route.
        const cand = committedRoute[0];
        if(legalMove(cand) && preserveFoodRoute(cand) === cand){
          committedRoute.shift();
          sc = cand;
        } else committedRoute = [];
      }
      if(sc === null){
        const plan = await planner.decide({
          idle,
          looping,
          headTrail,
          budgetMs:routeBudget(forceRisk),
          forceRisk
        });
        if(plan && plan.sc){
          sc = preserveFoodRoute(plan.sc);
          // Commit the rest of the route only when the first move survived the
          // driver checks unchanged; cap the replay so it stays adaptive.
          committedRoute = (sc === plan.sc && Array.isArray(plan.route)) ?
            plan.route.slice(1, 25) : [];
        } else {
          sc = randomLegalScancode();                  // planner gave up or a safeguard tripped
          committedRoute = [];
        }
      }
      if(sc !== null){
        forcedDeathQueued = false;
        if(isFoodCell(targetCellFor(sc))) movesSincePickup = 0;
        else movesSincePickup++;
        pushKey(keyOf[sc]);
      }
      // No legal move remains -> the snake is really stuck. Only now use the
      // stuck path, including the red flash before the normal death unwind.
      else if(!forcedDeathQueued){
        forcedDeathQueued = true;
        if(typeof window.sneekieRequestStuck === 'function') window.sneekieRequestStuck();
      }
      await sleepForTick(tickStarted);
    }
  })();
})();
