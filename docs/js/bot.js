'use strict';
/* bot.js — the Live bot driver, running in THIS page (no iframe, so it works from
   file:// too). game.js renders the real game into #screen; bot-engine.js plans
   one scancode from a compact live snapshot, using WebAssembly when available
   and JavaScript otherwise; this script handles tabs, restarts, speed, and
   pushKey(). Wrapped in an IIFE so it never redeclares game.js globals. */
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
  const STARTUP_DELAY_MS = passivePreview ? 0 : 5000;
  const startupAt = now();
  const driveStartAt = startupAt + STARTUP_DELAY_MS;
  const startupGraceUntil = driveStartAt + 4000;
  const sleepForTick = started => sleep(Math.max(0, botDelay() - (now() - started)));
  const routeBudget = () => {
    const cap = now() < startupGraceUntil ? 10 : 28;
    return Math.max(8, Math.min(cap, botDelay() * 0.22));
  };
  const keyOf = {72:' H', 80:' P', 75:' K', 77:' M'};
  const waitingForKey = () =>
    typeof window.sneekieWaitingForKey === 'function' && window.sneekieWaitingForKey();
  const botText = key => (window.SNEEKIE_TEXT && window.SNEEKIE_TEXT[key]) || key;
  function showStartupProgress(){
    if(STARTUP_DELAY_MS <= 0) return null;
    const overlay = document.createElement('div');
    overlay.className = 'bot-startup';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-atomic', 'true');
    const panel = document.createElement('div');
    panel.className = 'bot-startup-panel';
    const text = document.createElement('p');
    text.className = 'bot-startup-text';
    text.textContent = botText('botLoading');
    const progress = document.createElement('div');
    progress.className = 'bot-startup-progress';
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-label', botText('botLoading'));
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '100');
    progress.setAttribute('aria-valuenow', '0');
    const fill = document.createElement('div');
    fill.className = 'bot-startup-progress-fill';
    progress.appendChild(fill);
    panel.appendChild(text);
    panel.appendChild(progress);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    const tick = () => {
      const progressValue = Math.max(0, Math.min(1, (now() - startupAt) / STARTUP_DELAY_MS));
      fill.style.transform = 'scaleX(' + progressValue.toFixed(3) + ')';
      progress.setAttribute('aria-valuenow', String(Math.round(progressValue * 100)));
      if(progressValue < 1) setTimeout(tick, 100);
      else {
        overlay.classList.add('is-done');
        setTimeout(() => overlay.remove(), 260);
      }
    };
    tick();
    return overlay;
  }
  const planner = window.SneekieBotEngine && window.SneekieBotEngine.create({
    now,
    peek: o => peek(o),
    state: () => ({ T, D, ETEL, BTEL, LEVEL, HART, KLAVER, BONUS })
  });
  showStartupProgress();

  /* ---- level tabs (26-32): which late-game maze the bot drops into ---- */
  const LEVELS = [26,27,28,29,30,31,32];
  const hasBotLevel = n => LEVELS.includes(n);
  const nextBotLevel = n => {
    const index = LEVELS.indexOf(n);
    return LEVELS[index >= 0 && index < LEVELS.length - 1 ? index + 1 : 0];
  };
  let target = 26, activeLevel = 26, pendingJump = 26, jumpingTo = null;
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
  const STALL_IDLE_LIMIT = 70;
  const STALL_LOOP_IDLE_LIMIT = 40;
  const PICKUP_STUCK_LIMIT = 320;
  const stepOf = {72:-160, 80:160, 75:-2, 77:2};
  const targetCellFor = sc => {
    const step = stepOf[sc];
    return step === undefined ? 0 : peek(T[BTEL] + step);
  };
  // Only real food (heart/club) counts as progress for the stuck safeguard.
  // A smiley (1) is worth -50, so letting it reset the counter let the bot
  // orbit forever nibbling smileys without ever tripping the restart.
  const isFoodCell = ch => ch === 3 || ch === 5;
  (async () => {
    let idle = 0, prevScore = 0, over = 0, deathQueued = false, gameEndQueued = false, forcedDeathQueued = false;
    let movesSincePickup = 0, safeguardStuckQueued = false, safeguardStuckWaitTicks = 0;
    let observedLive = null;
    const headTrail = [];
    const resetMoveCounters = () => {
      idle = 0;
      movesSincePickup = 0;
      safeguardStuckQueued = false;
      safeguardStuckWaitTicks = 0;
      headTrail.length = 0;
    };
    while(true){
      if(typeof LEVEL === 'undefined' || LEVEL < 1){ await sleep(botDelay()); continue; }   // wait for the game to start
      if(now() < driveStartAt){ await sleep(80); continue; } // let first paint/input settle before planning
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
        safeguardStuckQueued = false;
        safeguardStuckWaitTicks = 0;
        pushKey('\r');                                 // under the level popup -> any key dismisses it
        await sleepForTick(tickStarted); continue;
      }
      if(ZCORE > prevScore){
        idle = 0;
        movesSincePickup = 0;
        safeguardStuckQueued = false;
        safeguardStuckWaitTicks = 0;
      } else idle++;
      prevScore = ZCORE;
      headTrail.push(T[BTEL]);
      if(headTrail.length > 96) headTrail.shift();
      let repeats = 0;
      for(let i = 0; i < headTrail.length - 10; i++) if(headTrail[i] === T[BTEL]) repeats++;
      const looping = idle > 20 && repeats >= 2;
      if(movesSincePickup >= PICKUP_STUCK_LIMIT){
        if(!safeguardStuckQueued || ++safeguardStuckWaitTicks > 12){
          safeguardStuckQueued = true;
          safeguardStuckWaitTicks = 0;
          if(typeof window.sneekieRequestStuck === 'function') window.sneekieRequestStuck();
          else pushKey('\r');
        }
        await sleepForTick(tickStarted); continue;
      }
      // Stop orbiting forever with no progress. A short looping run (revisiting
      // the same cell) trips earlier than a plain no-score stall and switches to
      // riskier forced moves instead of the stuck/restart path.
      const stalled = idle > STALL_IDLE_LIMIT || (idle > STALL_LOOP_IDLE_LIMIT && repeats >= 3);
      const sc = planner ? planner.decide({ idle, looping, headTrail, budgetMs:routeBudget(), forceRisk:stalled }) : null;
      if(sc !== null){
        forcedDeathQueued = false;
        if(isFoodCell(targetCellFor(sc))){
          movesSincePickup = 0;
          safeguardStuckQueued = false;
          safeguardStuckWaitTicks = 0;
        } else movesSincePickup++;
        pushKey(keyOf[sc]);                            // a planned move; forced mode may accept risk
      }
      // No playable move remains. On the bot page this uses the normal snake
      // death sequence, not the modern stuck popup.
      else if(!forcedDeathQueued){
        forcedDeathQueued = true;
        if(typeof window.sneekieRequestBotDeath === 'function') window.sneekieRequestBotDeath();
        else pushKey('\x1b');
      }
      await sleepForTick(tickStarted);
    }
  })();
})();
