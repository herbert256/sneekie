'use strict';
/* bot.js — the Live bot driver, running in THIS page (no iframe, so it works from
   file:// too for the landing-page preview). game.js renders the real game into
   #screen; the loaded planner turns a compact live snapshot into one scancode.
   Bot pages load the Wasm planner (bot-engine.js); index previews load the
   JavaScript planner (bot-home.js). This script handles tabs, restarts, speed,
   and pushKey(). Wrapped in an IIFE so it never redeclares game.js globals. */
(function(){
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---- speed: a 0-10 slider mapped to a per-move delay ---- */
  const SPEED_CHOICES = [10,10,20,30,49,50,60,70,80,90,100];
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
  const routeBudget = () => {
    const cap = now() < startupGraceUntil ? 10 : 28;
    return Math.max(8, Math.min(cap, botDelay() * 0.22));
  };
  const keyOf = {72:' H', 80:' P', 75:' K', 77:' M'};
  const waitingForKey = () =>
    typeof window.sneekieWaitingForKey === 'function' && window.sneekieWaitingForKey();
  const botText = key => (window.SNEEKIE_TEXT && window.SNEEKIE_TEXT[key]) || key;
  function delayedLoadingStatus(isReady){
    if(passivePreview) return { done(){} };
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
      }
    };
  }
  // Wire the planner this page loaded. Bot pages now load only the Wasm planner
  // and wait for bot-engine.wasm before driving; index previews load only the
  // JavaScript planner so they still work from file://.
  function createPlanner(access){
    const wasm = window.SneekieBotWasm && window.SneekieBotWasm.create(access);
    return wasm || (window.SneekieBotJs && window.SneekieBotJs.create(access)) || null;
  }
  const planner = createPlanner({
    now,
    peek: o => peek(o),
    state: () => ({ T, D, ETEL, BTEL, LEVEL, HART, KLAVER, BONUS })
  });
  const plannerReady = () => planner && (typeof planner.ready !== 'function' || planner.ready());
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
  const stepOf = {72:-160, 80:160, 75:-2, 77:2};
  const targetCellFor = sc => {
    const step = stepOf[sc];
    return step === undefined ? 0 : peek(T[BTEL] + step);
  };
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
    for(const sc of [72, 80, 75, 77]){
      const step = stepOf[sc], ch = peek(head + step);
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
  (async () => {
    let idle = 0, prevScore = 0, over = 0, deathQueued = false, gameEndQueued = false, forcedDeathQueued = false;
    let movesSincePickup = 0;
    let observedLive = null;
    const headTrail = [];
    const resetMoveCounters = () => {
      idle = 0;
      movesSincePickup = 0;
      headTrail.length = 0;
    };
    while(true){
      if(typeof LEVEL === 'undefined' || LEVEL < 1){ await sleep(botDelay()); continue; }   // wait for the game to start
      if(!plannerReady()){ await sleep(80); continue; }      // wait for bot-engine.wasm on the Bot page
      loadingStatus.done();
      // game finished (final death or clean win) -> answer "play again", re-target.
      // Checked before the jump below so a tab click can't overwrite LEVEL first.
      if(LEVEL > 32){
        if(++over >= 4){
          if(!gameEndQueued){ queueNextLevel(); gameEndQueued = true; }
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
          queueNextLevel();
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
      // the snake anymore. When either trips we stop asking the Wasm/JS planner
      // and just make a random legal move in JavaScript, so the snake keeps
      // wandering. The planner is also never allowed to force a death: if it
      // returns no move we fall back to that same random move. The snake only
      // dies when it is REALLY stuck -- when no legal move exists at all.
      const stalled = idle > STALL_IDLE_LIMIT || (idle > STALL_LOOP_IDLE_LIMIT && repeats >= 3);
      const fallbackRandom = stalled || movesSincePickup >= PICKUP_STUCK_LIMIT;
      let sc = fallbackRandom ? null : await planner.decide({ idle, looping, headTrail, budgetMs:routeBudget() });
      if(sc === null) sc = randomLegalScancode();      // planner gave up or a safeguard tripped
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
        else pushKey('\x1b');
      }
      await sleepForTick(tickStarted);
    }
  })();
})();
