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
  let botSpeed = SPEED_CHOICES.includes(configuredSpeed) ? configuredSpeed : 50;
  const silentWake = window.SNEEKIE_BOT_SILENT === true;
  function speedToDelay(value){ return Math.round(45 + 375 * Math.pow((100 - value) / 100, 1.6)); }
  function speedIndex(){
    if(!speed){
      const index = SPEED_CHOICES.indexOf(botSpeed);
      return index >= 0 ? index : SPEED_CHOICES.indexOf(50);
    }
    const value = Number(speed.value);
    if(Number.isFinite(value)) return Math.max(0, Math.min(SPEED_CHOICES.length - 1, Math.round(value)));
    return SPEED_CHOICES.indexOf(50);
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
  const sleepForTick = started => sleep(Math.max(0, botDelay() - (now() - started)));
  const routeBudget = () => Math.max(14, Math.min(32, botDelay() * 0.25));
  const keyOf = {72:' H', 80:' P', 75:' K', 77:' M'};
  const waitingForKey = () =>
    typeof window.sneekieWaitingForKey === 'function' && window.sneekieWaitingForKey();
  const planner = window.SneekieBotEngine && window.SneekieBotEngine.create({
    now,
    peek: o => peek(o),
    state: () => ({ T, D, ETEL, BTEL, LEVEL, HART, KLAVER })
  });

  /* ---- level tabs (26-32): which late-game maze the bot drops into ---- */
  const LEVELS = [26,27,28,29,30,31,32];
  const hasBotLevel = n => LEVELS.includes(n);
  const nextBotLevel = n => {
    const index = LEVELS.indexOf(n);
    return LEVELS[index >= 0 && index < LEVELS.length - 1 ? index + 1 : 0];
  };
  let target = 26, activeLevel = 26, pendingJump = 26, jumpingTo = null;
  const tablist = document.getElementById('leveltabs');
  const pageLang = typeof window.sneekieLang === 'function' ? window.sneekieLang() : document.documentElement.lang;
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
  const yesKey = () => (typeof gt === 'function' ? gt('yesInput') : 'y');
  (async () => {
    let idle = 0, prevScore = 0, over = 0, deathQueued = false, gameEndQueued = false, escapeQueued = false;
    let observedLive = null;
    const headTrail = [];
    while(true){
      if(typeof LEVEL === 'undefined' || LEVEL < 1){ await sleep(botDelay()); continue; }   // wait for the game to start
      // game finished (final death or clean win) -> answer "play again", re-target.
      // Checked before the jump below so a tab click can't overwrite LEVEL first.
      if(LEVEL > 32){
        if(++over >= 4){
          if(!gameEndQueued){ queueNextLevel(); gameEndQueued = true; }
          escapeQueued = false;
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
          escapeQueued = false;
          idle = 0; headTrail.length = 0;
          observedLive = LIVE;
          pushKey('\r');
        }
        await sleep(botDelay()); continue;
      }
      // deathSeq() can finish and rebuild the same BASIC level between bot ticks.
      // The lower life count is the stable signal that the previous level failed.
      if(observedLive !== null && LIVE < observedLive && pendingJump === null && jumpingTo === null){
        queueNextLevel();
        escapeQueued = false;
        idle = 0; headTrail.length = 0;
      }
      observedLive = LIVE;
      deathQueued = false;
      gameEndQueued = false;
      if(jumpingTo !== null){
        if(LEVEL === jumpingTo){
          activeLevel = LEVEL;
          target = LEVEL;
          jumpingTo = null;
          escapeQueued = false;
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
        pendingJump = null; escapeQueued = false; idle = 0; headTrail.length = 0;
        await sleep(botDelay()); continue;
      }
      const tickStarted = now();
      if(waitingForKey()){
        escapeQueued = false;
        pushKey('\r');                                 // under the level popup -> any key dismisses it
        await sleepForTick(tickStarted); continue;
      }
      if(ZCORE > prevScore) idle = 0; else idle++;
      prevScore = ZCORE;
      headTrail.push(T[BTEL]);
      if(headTrail.length > 96) headTrail.shift();
      let repeats = 0;
      for(let i = 0; i < headTrail.length - 10; i++) if(headTrail[i] === T[BTEL]) repeats++;
      const looping = idle > 20 && repeats >= 2;
      const stalled = idle > 180 || (idle > 96 && repeats >= 4);
      const sc = stalled ? null : (planner ? planner.decide({ idle, looping, budgetMs:routeBudget() }) : null);
      if(sc !== null){
        escapeQueued = false;
        pushKey(keyOf[sc]);                            // a safe move
      }
      else if(!escapeQueued){
        escapeQueued = true;
        idle = 0; headTrail.length = 0;
        pushKey('\x1b');                              // no survivable move -> give up like a player (ESC)
      }
      await sleepForTick(tickStarted);
    }
  })();
})();
