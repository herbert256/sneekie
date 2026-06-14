# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

Sneekie is a 32-level snake/maze game originally written in GW-BASIC in July 1988 by
HerbySoft and published in MS(X)DOS Computer Magazine no. 25. In 2026 it
was recovered by OCR from the magazine's printed listing and ported **line for line** to a
single self-contained HTML page. There is no framework, no build step, no dependencies,
and no test suite — `docs/index.html` is the entire program.

## Layout & deployment

The repository root **is** the git repo (remote `github.com:herbert256/sneekie`). The
publishable website lives in `docs/`, which is the GitHub Pages source — it is served at
https://herbert256.github.io/sneekie/.

- `docs/index.html` — the game. One file, all HTML/CSS/JS inline. **This is the single
  canonical copy** — edit it directly; there is no second copy to keep in sync.
- `docs/source.html` — the original source, syntax-highlighted (a self-contained
  pretty-printed listing; embeds the `.BAS` text as base64 and tokenizes it in JS). The nav
  label is **Source**. The rendered listing drops the first 10 banner lines (starts at `10 REM`)
  and shows only the BASIC line numbers — there is no separate sequential gutter.
- `docs/explained.html` — the same source as an annotated walkthrough: a
  "big idea" primer, variable/character glossaries, per-routine section cards, and inline
  `↳` notes on individual lines. Same embedded-base64 + tokenizer approach as the listing;
  the prose lives in its `SECTIONS` array (by BASIC line) and `NOTES` map (by line number).
- `docs/migration.html` — the BASIC source and the JS port shown **side by side**,
  with an intro on the new architecture. Embeds *both* sources as base64 (the BASIC, and the
  port's `<script>` body extracted from `index.html`) and slices them by line range per
  `SECTIONS` pairing; has its own small JS tokenizer alongside the shared BASIC one. Note: the
  JS line ranges are a snapshot of `index.html`'s script — if that script changes substantially,
  re-check the ranges (regenerate with the same `<script>`-body extraction).
- `docs/vram.html` — an interactive visualization of the text-VRAM model: steer a small snake
  and watch the rendered screen and the raw `poke`/`peek` bytes change in lock-step, with an
  inspector that computes the offset formula live. A focused sandbox (empty/heart/wall only)
  that reuses the embedded font; not the full game engine.
- `docs/manual.html` — a player-facing **user manual** (nav label **Manual**): goal, controls,
  scoring, lives, a gallery of the 8 maze layouts, and a 32-level breakdown. The gallery shows
  one **full-length autoplay gameplay GIF per layout** (`docs/manual/scene-1..8.gif`, 640×384 — the long clips
  that used to be the Demo page, hundreds of moves each); **clicking a layout image pops up a big version**
  (X / Esc / backdrop to close). They were produced by a smart autoplay bot
  (BFS-to-heart, stone-pushing, tail-reach anti-trap, arrow-dodging) driven via the browser:
  frames rebuilt from `vram` into a `willReadFrequently` canvas (the game canvas reads back blank
  in a hidden tab), captured straight to PNGs through a throwaway local upload server, then
  encoded with ImageMagick (`magick -delay 13 -loop 0 ... -layers optimize`). Same green doc-page
  styling as the other doc pages.
- `docs/live.html` — a **Live** page (nav label **Live**): **one** copy of the *real* game running live,
  with **16 level tabs** for the levels it showcases — **1–8** (gentle, turn-based) and **25–32** (the brutal
  back half) — a **bot-speed slider**, and, below the screen, the **same six controls as the game**
  (Green/Amber/White/CGA, Sound, Fullscreen). The single cell is an `<iframe src="index.html">` with a smarter
  bot `eval`'d into it (so it can read the game's `const`/`let` globals by name, which are *not* window
  properties). The bot is embedded as a string in `live.html` and injected on every iframe `load` (with CSS
  that hides the game chrome and the bezel padding, keeping the full 640×384 canvas). The selected tab sets
  `TARGET`, and the iframe **jumps straight there without grinding levels**: it dismisses level 1, sets
  `LEVEL = TARGET - 1` and presses F10 once, so the game's `for(LEVEL…)` loop lands on `TARGET`. The bot
  (BFS-to-food, tail-reach safety, **eats a smiley to escape a trap**, endgame aggression) plays that one
  level, driving via `pushKey` and reading `parent.botDelay()` each move; the slider maps 0–100 to a
  slow-to-fast delay without restarting. The six controls drive the iframe's own hidden buttons (theme/sound)
  and fullscreen the `.frame` box. **The viewer can't steer the game** — the iframe is inert
  (`pointer-events:none` + `tabindex=-1`); instead a page-level keydown steps the shown level (**Space / →**
  next, **←** previous, wrapping after 32 back to 1). It posts status to `parent.botStatus(…)` and does **not**
  advance on a win: a clean clear (`LEVEL===TARGET+1 && LIVE>0`) → `parent.botEnd(…, true)` → **green** flash;
  getting stuck (`BTEL` stops advancing, no safe move, ~26 s with no **score** gain — counting items is wrong
  because a heart spawns a club — or a game-over) → `parent.botEnd(…, false)` → **red** flash. Either flash
  pulses the overlay four times, then reloads the iframe (re-injecting the bot, re-jumping to the same level);
  changing tabs bumps a `gen` counter so in-flight flash reloads are ignored. Foreground only (background tabs
  throttle and pause the game).
- `docs/bot.html` — a **Bot** page (nav label **Bot**) that explains the smart bot embedded in
  `live.html`: where it runs, how it reads VRAM and the snake arrays, how it models arrows, simulates
  moves and pushed stones, searches for food, checks tail reach/open space/survival depth, scores
  candidate routes, falls back to tail-following, and decides when a level is cleared or stuck. Keep
  this page in sync with the `BOT` string in `docs/live.html` when the planner changes.
- `docs/magazine.html` — a **Magazine** page (nav label **Magazine**): the original 1988 publication of
  Sneekie as a **type-in program** in *MS(X)DOS Computer Magazine* no. 25. A thumbnail grid of the **cover +
  pages 58–63** (`docs/magazine/{cover,p58..p63}.jpg` full + `*.thumb.jpg`); clicking any page opens it in
  **real browser fullscreen** (`requestFullscreen` on a bare `#page-fs` box — just the page on black, no
  chrome or caption; Esc exits, with a fixed-overlay fallback). Below the scans, two English takes on the
  Dutch feature: an **original-words recap** (explicitly *not* a verbatim translation of the magazine's
  editorial) and a **"translated scans"** pair — copies of pages 58/59 with the text rendered in English
  (`magazine/p58.en.jpg`, `p59.en.jpg` + thumbs). Page images were rasterised from a scan of the issue with
  **pypdfium2** (~168 dpi, in a throwaway venv); the full 100-page magazine is not committed. Same green
  doc-page styling.
- `docs/SNEEKIE.BAS` — the canonical 1988 GW-BASIC source, recovered by OCR from the magazine listing (served,
  linked for download from the listings). This is the **specification**: the game's JS is a faithful port of it,
  so read it to understand intended behavior and to check that changes stay true to the original. A frozen 1988
  artifact. Its first 10 lines are a `'`-comment header; the listing pages (`source`/`explained`/`migration`)
  **embed this whole file as base64**, so if you edit it, regenerate those `B64`/`atob(...)` blobs — and keep the
  header at 10 lines so `slice(10)` and migration's absolute `SECTIONS` line ranges stay valid.
- `docs/favicon.png`, `docs/apple-touch-icon.png`, `docs/og.png` — site icon + social card,
  drawn with the game's own CP437 font. Regenerate with `python3 tools/make-icons.py` (pure
  Python, no deps; reads the font straight out of `docs/index.html`). Every page carries
  matching `<link rel="icon">` + Open Graph / Twitter meta pointing at `og.png`.

To ship a change: edit under `docs/`, commit, push to `master`. GitHub Pages is configured
to publish from `master` → `/docs` (`gh api repos/herbert256/sneekie/pages` to verify).

All nine pages share one standard top nav (`header.top`) **and the same green-phosphor CRT
look**: the same page links (current page marked `aria-current="page"`) plus a `#print` button that **always prints the Source page** (`source.html`; the other
eight pages navigate there with `?print`, which auto-prints). There is **no Light/Dark mode** anywhere. The game + plain listing keep the Green/Amber/White/CGA
`#themes` switcher (`sneekie.theme`); the doc pages (Manual, Live, Bot, Magazine, Explained, Migration, Visualizer)
are a fixed green palette with no switcher. The doc pages keep a readable **sans-serif for prose** (code stays monospace); their
colours are driven by CSS vars in `:root` (token classes `ln/kw/fn/str/num/com/id/op/pn` = a
fixed green set, like the listing's green theme), so re-theming is mostly editing `:root`. On the
game + listing the page title lives in a separate `header.hero` (renamed so the generic
`header{}` rules don't style the nav bar).

## Running it

No build/lint/test commands exist. To preview, serve the site folder:
`python3 -m http.server` from `docs/` (or from the root and open `/docs/index.html`), then
open it in a browser. Verify changes by playing in the browser; the page surfaces JS errors
via a `window.onerror` banner rather than failing silently (`docs/index.html`, near the top).

## Architecture

The port's organizing principle is that **it emulates the original's direct video-memory
model rather than building a modern game-object model.** Everything follows from that.

- **VRAM is the game state.** The 1988 code POKEd CP437 character codes straight into PC
  text-mode video RAM at `&HB000`/`&HB800`. The port keeps `vram`, a `Uint8Array(4000)`
  with the *same* layout: `offset = (row-1)*160 + (col-1)*2`; even byte = CP437 char code,
  odd byte = attribute (only `7` normal / `15` bright occur). All game logic — snake
  movement, collision, item pickup, walls, pushable stones, enemy arrows — reads and writes
  the playfield through `peek(off)` / `poke(off, v)`. There is no separate model of "where
  the snake is"; you find out by peeking the bytes, exactly as the BASIC did.

- **Rendering is decoupled from logic.** `poke` adds changed cells to a `dirty` set; a
  `requestAnimationFrame` loop redraws only dirty cells (`drawCell`). Glyphs come from the
  real IBM VGA 8×16 CP437 ROM font, embedded as a 4096-byte base64 `FONT` array and
  pre-rendered into per-color "atlas" canvases by `buildAtlas`. Themes (`THEMES`):
  green/amber/white monochrome plus a colorized CGA mode; in CGA mode `cgaColor(ch, at)`
  picks a color per character class.

- **The BASIC's line-numbered control flow is preserved, and names cite line numbers.**
  `program()` (boot + restart loop, lines 80-230/1090-1130) calls `playLevels()` (the
  `FOR LEVEL=1 TO 32` loop, 240-1080), which contains the move loop (420-1020). Helpers are
  named after their BASIC line: `lay1230`/`lay1400`/`lay1500`/… draw per-level maze walls;
  `sub1830`/`sub1970`/`sub2130` animate per-level enemies (moving arrows, gates);
  `keyOrTimeout` is lines 430-460; `deathSeq` is 510-630. Comments throughout cite the
  original line numbers — keep that convention when editing.

- **Two dispatch tables reproduce the `ON LEVEL GOSUB` lines.** `CFG[]` (line 310: per-level
  speed `Z`, item count `AANTAL`, bonus decrement `BMIN`, and which `lay*` walls to draw)
  and `ENEMY[]` (line 1010: which `sub*` enemy routine runs each tick) are both indexed by
  `(LEVEL-1) % 16`. There are only **8 distinct wall layouts** (one is "no walls"); they cycle
  every 8 levels (`(LEVEL-1) % 8`), so each layout is used **4 times** across the 32 levels.
  The 16 `CFG` entries are those 8 layouts ×2 speed regimes: levels 1-8 are turn-based
  (`Z=999`, snake waits for a key), levels 9-16 are the same layouts auto-moving and speeding
  up (`Z` 0.4-1.2 s). Levels 17-32 are an **exact repeat** of 1-16 (the `ON LEVEL GOSUB` list
  is the 16 targets written out twice) — not faster.

- **Game-state variables keep the exact BASIC names** so the port reads against the source:
  `T` (snake cell offsets), `S` (popup backup), `B` (gate positions), `D` (arrows),
  `ZORE`/`ZCORE` (highscore/score), `LIVE`, `LEVEL`, `BTEL`/`ETEL` (snake head/tail
  indices), `E`/`F` (current/previous direction scancode), `HART`/`KLAVER` (hearts/clubs
  remaining), `BONUS`, `AANTAL`, `BMIN`, `Z`, `K1`.

- **Async emulates blocking BASIC I/O.** GW-BASIC's `INKEY$`/`INPUT$` blocked; here the main
  loop is `async` and a Promise-based keyboard buffer (`kbuf`, `pushKey`, `keyOrTimeout`,
  `waitKey`) mimics the BIOS buffer and the per-level `INKEY$` timeout. Death is signalled
  by `throw DEATH` (a sentinel) caught in the move loop, standing in for the BASIC's
  `GOTO 510` / `RETURN 510`.

- **Input mirrors DOS scancodes.** `keydown` maps arrows to the two-byte extended-key
  strings DOS `INKEY$` returned (`'\0H'`/`'\0P'`/`'\0K'`/`'\0M'` = up/down/left/right, scan
  72/80/75/77), plus Escape and the cheats F9 (extra life, scan 67) / F10 (skip level, scan
  68). Touch: swipe = direction, tap = key.

- **Audio mirrors `SOUND f,d`.** `sound(freq, ticks)` reproduces GW-BASIC `SOUND` (duration
  in 1/18.2 s ticks) with Web Audio square-wave oscillators; `playDrained` mirrors
  `IF PLAY(0)<>0 GOTO 540`.

## Modern additions (beyond the faithful port)

These deviate from the 1988 source intentionally: localStorage persistence (keys
`sneekie.theme`, `sneekie.muted`, `sneekie.highscore` — the persisted highscore is new),
theme switching + CGA colorization, fullscreen, touch controls, responsive scaling (`fit`),
the on-page error banner, the title-bar canvas, the CRT-monitor shell (molded `#bezel`, recessed
`#tube`/`#glass` with scanlines, and a `#panel` control chin), and English UI strings (the original
was Dutch). When changing behavior, decide whether you're fixing the *port* (match the BASIC) or
extending the *modern shell* — and preserve the line-number comments either way.
