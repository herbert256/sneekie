# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sneekie is a 32-level snake/maze game originally written in GW-BASIC in July 1988 by
Herbert Groot Jebbink ("HerbySoft") and published on the MCMPC-D2 diskette. In 2026 it
was recovered from the original 720 KB floppy image and ported **line for line** to a
single self-contained HTML page. There is no framework, no build step, no dependencies,
and no test suite — `docs/index.html` is the entire program.

## Layout & deployment

The repository root **is** the git repo (remote `github.com:herbert256/sneekie`). The
publishable website lives in `docs/`, which is the GitHub Pages source — it is served at
https://herbert256.github.io/sneekie/.

- `docs/index.html` — the game. One file, all HTML/CSS/JS inline. **This is the single
  canonical copy** — edit it directly; there is no second copy to keep in sync.
- `docs/SNEEKIE.BAS.html` — the original source, syntax-highlighted (a self-contained
  pretty-printed listing; embeds the `.BAS` text as base64 and tokenizes it in JS). The nav
  label is **Source**. The rendered listing drops the first 10 banner lines (starts at `10 REM`)
  and shows only the BASIC line numbers — there is no separate sequential gutter.
- `docs/SNEEKIE.BAS.explained.html` — the same source as an annotated walkthrough: a
  "big idea" primer, variable/character glossaries, per-routine section cards, and inline
  `↳` notes on individual lines. Same embedded-base64 + tokenizer approach as the listing;
  the prose lives in its `SECTIONS` array (by BASIC line) and `NOTES` map (by line number).
- `docs/SNEEKIE.BAS.migration.html` — the BASIC source and the JS port shown **side by side**,
  with an intro on the new architecture. Embeds *both* sources as base64 (the BASIC, and the
  port's `<script>` body extracted from `index.html`) and slices them by line range per
  `SECTIONS` pairing; has its own small JS tokenizer alongside the shared BASIC one. Note: the
  JS line ranges are a snapshot of `index.html`'s script — if that script changes substantially,
  re-check the ranges (regenerate with the same `<script>`-body extraction).
- `docs/vram.html` — an interactive visualization of the text-VRAM model: steer a small snake
  and watch the rendered screen and the raw `poke`/`peek` bytes change in lock-step, with an
  inspector that computes the offset formula live. A focused sandbox (empty/heart/wall only)
  that reuses the embedded font; not the full game engine.
- `docs/SNEEKIE.BAS.txt` — a served copy of the source, linked for download from the listings.
- `docs/favicon.png`, `docs/apple-touch-icon.png`, `docs/og.png` — site icon + social card,
  drawn with the game's own CP437 font. Regenerate with `python3 tools/make-icons.py` (pure
  Python, no deps; reads the font straight out of `docs/index.html`). All four pages carry
  matching `<link rel="icon">` + Open Graph / Twitter meta pointing at `og.png`.
- `SNEEKIE.BAS.txt` (root) — the canonical detokenized 1988 GW-BASIC source, kept next to
  the floppy it came from. This is the **specification**: the game's JS is a faithful port
  of it, so read it to understand intended behavior and to check that changes stay true to
  the original. It is a frozen 1988 artifact; the `docs/` copy is identical.
- `MCMPC-D2.dsk` (root) — the original FAT12 floppy image the `.BAS` was detokenized from.
  Provenance; not served.

To ship a change: edit under `docs/`, commit, push to `master`. GitHub Pages is configured
to publish from `master` → `/docs` (`gh api repos/herbert256/sneekie/pages` to verify).

All five pages share one standard top nav (`header.top`) **and the same green-phosphor CRT
look**: the same page links (current page marked `aria-current="page"`) plus a `#print` button that **always prints the Source page** (`SNEEKIE.BAS.html`; the other
four pages navigate there with `?print`, which auto-prints). There is **no Light/Dark mode** anywhere. The game + plain listing keep the Green/Amber/White/CGA
`#themes` switcher (`sneekie.theme`); the three doc pages are a fixed green palette with no
switcher. The doc pages keep a readable **sans-serif for prose** (code stays monospace); their
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
  `(LEVEL-1) % 16` — levels 17-32 reuse the 16 layouts but with the faster `Z` values.

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
the on-page error banner, the title-bar canvas, and English UI strings (the original was
Dutch). When changing behavior, decide whether you're fixing the *port* (match the BASIC) or
extending the *modern shell* — and preserve the line-number comments either way.
