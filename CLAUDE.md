# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sneekie is a 32-level snake/maze game originally written in GW-BASIC in July 1988 by
HerbySoft and published in MS(X)DOS Computer Magazine no. 25. In 2026 it was
recovered by OCR from the magazine's printed listing and ported **line for line** to a
static browser version.

There is no framework, no build step, no package dependency, and no dedicated automated
test suite. The current site is **not** a single inline HTML file anymore: it is a GitHub
Pages site under `docs/`, split into shared and page-specific HTML/CSS/JS files. The
canonical 1988 source remains `docs/SNEEKIE.BAS`; the faithful game port lives in
`docs/js/game.js`.

## Layout & Deployment

The repository root **is** the git repo (remote `github.com:herbert256/sneekie`). The
publishable website lives in `docs/`, which is the GitHub Pages source. It is served at
https://sneekie.xyz/.

- `docs/index.html` - the root Play entry shell. It is intentionally only an iframe wrapper
  around `html/game.html`. It loads `css/index.css` and `js/index.js`; keep the JSON-LD
  structured-data script inline for search crawlers.
- `docs/html/game.html` - the game page shell. It loads `../css/site.css`,
  `../css/game.css`, `../js/site.js`, `../js/game.js`, and `../js/auto.js` (the "Auto mode" bot).
- `docs/html/*.html` - the game page plus the secondary content pages: `manual`, `bot`,
  `magazine`, `source`, `explained`, `vram`, and `history`. Each content page loads
  `../css/site.css`, page-specific CSS when present (`game` uses `../css/game.css`),
  `../js/site.js`, and its own page JS. `bot` has no page JS (it loads only `site.js`).
- `docs/css/site.css` - shared variables, layout primitives, doc-page styling, injected
  header/footer chrome, dialogs, buttons, and responsive rules.
- `docs/css/<page>.css` - page-specific styles.
  Keep shared visual language in `site.css`; only page-only layout and components belong in
  page CSS.
- `docs/js/site.js` - shared site behavior: injects the standard `header.top` and footer,
  marks the current nav link, registers the service worker, and exposes the shared BASIC
  tokenizer used by the listing pages. (Download + Print live on the Source page, not the header.)
- `docs/js/<page>.js` - page-specific behavior. Keep shared utilities in `site.js` when they
  are used by more than one page.
- `docs/images/` - logo/social/icon PNGs, the manual layout clips and magazine scans (both
  WebP). `favicon.png` stays
  at `docs/favicon.png`.
- `docs/sw.js` - service worker precache. Bump `CACHE_NAME` when changing existing precached
  files so deployed users do not keep stale assets.
- `tools/make-icons.py` - regenerates icon/social/logo PNGs using the CP437 font embedded in
  `docs/js/game.js`.

Only the iframe wrapper `docs/index.html` remains at the site root. Content pages live under
`docs/html/`, so root-level links should use `html/<page>.html`; links between content pages
can use `<page>.html`.

To ship a change: edit under `docs/`, commit, and push to `master`. GitHub Pages is configured
to publish from `master` -> `/docs` (`gh api repos/herbert256/sneekie/pages` can verify this).

## Pages

- `docs/html/source.html` + `docs/js/source.js` - syntax-highlighted recovered GW-BASIC
  listing. `source.js` `fetch`es `docs/SNEEKIE.BAS`, drops the first 10 banner lines for
  display, and shows only the BASIC line numbers. This page also carries the **Download**
  (`SNEEKIE.BAS`) and **Print** buttons (a `.toolbar` near the top; `source.js` wires Print to
  `window.print()`).
- `docs/html/explained.html` + `docs/js/explained.js` + `docs/js/migration.js` - one page with
  two stacked halves: the annotated single-column walkthrough (prose in the `SECTIONS` array
  and `NOTES` map in `explained.js`, rendered into `#listing`/`#toc-list`), then the BASIC↔JS
  side-by-side view (`migration.js`, rendered into `#pairs`/`#mig-toc-list`). `migration.js`
  uses `MIG_SECTIONS`/`migTocList` so it does not collide with `explained.js`'s `SECTIONS`/
  `tocList` when both load on the same page.
- `docs/html/vram.html` + `docs/js/vram.js` - interactive visualization of the text-VRAM
  model. It is a focused sandbox, not the full game engine.
- `docs/html/manual.html` + `docs/js/manual.js` - player manual with maze gallery and dialogs.
  Layout clips live in `docs/images/manual/scene-1..8.webp` (lossless animated WebP).
- `docs/js/auto.js` - the "Auto mode" bot, loaded by `game.html` after `game.js`. The `Auto`
  toggle in `#controls` runs the planner in the SAME window (no iframe/eval), reading
  `game.js`'s globals and steering via `pushKey()`. Everything is wrapped in an IIFE so it
  never redeclares those globals. (This replaced the old standalone Live page.)
- `docs/html/bot.html` - explanation of the Auto-mode bot (loads only `site.js`; no page JS).
  Keep this page in sync with the planner in `docs/js/auto.js` when planner behavior changes.
- `docs/html/magazine.html` + `docs/js/magazine.js` - original magazine scans and translated
  page images. Media lives in `docs/images/magazine/`. Reachable from the header.
- `docs/html/game.html` + `docs/js/game.js` - the playable port. Keep BASIC line-number
  comments and the original variable names when changing game behavior.
- `docs/index.html` - the root iframe wrapper for the playable port.

## Shared Chrome

All content pages share one standard top nav and footer injected by `docs/js/site.js`;
do not copy-paste `header.top` or `<footer>` markup back into the HTML files. The top-left
brand is `docs/images/logo.png`, and the current page is marked with `aria-current="page"`.
The header nav is `game, history, source, manual, magazine, explained, vram` (7 links, no
buttons).

Download and Print live on the **Source** page (a `.toolbar`), not in the header. Print calls
`window.print()` directly (`source.css` `@media print` hides the chrome so only the listing
prints); Download is a plain `<a download>` to `SNEEKIE.BAS`. There is no `?print` routing.

The game page and plain Source listing keep the Green/Amber/White/CGA theme switcher
(`sneekie.theme`). The other doc pages use the fixed green CRT palette from `site.css`.
There is no Light/Dark mode.

## Source Embeds

`docs/SNEEKIE.BAS` is the frozen recovered 1988 source and is the specification for game
behavior. The source-listing pages render it at runtime:

- `docs/js/source.js` and `docs/js/explained.js` `fetch('../SNEEKIE.BAS')` (the service worker
  caches it, so offline still works) and key off it directly — no embedded copy. The display
  code drops the 10-line header with `slice(10)`, so keep that header intact. (This means
  those two pages need the file served over http(s), not opened via `file://`.)
- `docs/js/migration.js` (the side-by-side view, now loaded by `explained.html`) still embeds
  **both** `docs/SNEEKIE.BAS` and `docs/js/game.js` as base64. This is deliberate: the view
  pairs hard-coded BASIC and JS line ranges (`MIG_SECTIONS`), so the embeds are a frozen
  snapshot co-calibrated with those ranges — fetching a live, changing `game.js` would silently
  misalign them. To refresh it against a newer `game.js`, regenerate the embedded JS base64 and
  re-check the `MIG_SECTIONS` ranges together.

## Running & Verification

No build/lint/test commands exist. To preview, serve the site folder:

```sh
cd docs
python3 -m http.server
```

Then open `http://localhost:8000/`. You can also serve from the repo root and open
`/docs/index.html`.

Useful checks after edits:

```sh
node --check docs/js/*.js docs/sw.js
```

For frontend changes, verify the relevant pages in a browser at desktop and mobile widths.
`docs/html/game.html` surfaces runtime JS errors through an on-page error banner.

## Architecture

The port's organizing principle is that **it emulates the original's direct video-memory
model rather than building a modern game-object model.** Everything follows from that.

- **VRAM is the game state.** The 1988 code POKEd CP437 character codes straight into PC
  text-mode video RAM at `&HB000`/`&HB800`. The port keeps `vram`, a `Uint8Array(4000)` with
  the same layout: `offset = (row-1)*160 + (col-1)*2`; even byte = CP437 char code, odd byte
  = attribute. All game logic reads and writes the playfield through `peek(off)` and
  `poke(off, v)`.
- **Rendering is decoupled from logic.** `poke` adds changed cells to a `dirty` set; a
  `requestAnimationFrame` loop redraws dirty cells with `drawCell`. Glyphs come from the IBM
  VGA 8x16 CP437 ROM font embedded in `docs/js/game.js`.
- **The BASIC's line-numbered control flow is preserved.** `program()` calls `playLevels()`,
  helpers are named after BASIC line numbers (`lay1230`, `sub1830`, etc.), and comments cite
  original line ranges. Preserve this convention.
- **Two dispatch tables reproduce `ON LEVEL GOSUB`.** `CFG[]` handles per-level speed, item
  count, bonus decrement, and wall layout. `ENEMY[]` handles per-tick enemy routines.
- **Game-state variables keep BASIC names.** Examples: `T`, `S`, `B`, `D`, `ZORE`, `ZCORE`,
  `LIVE`, `LEVEL`, `BTEL`, `ETEL`, `E`, `F`, `HART`, `KLAVER`, `BONUS`, `AANTAL`, `BMIN`,
  `Z`, and `K1`.
- **Async emulates blocking BASIC I/O.** The Promise-based keyboard buffer (`kbuf`, `pushKey`,
  `keyOrTimeout`, `waitKey`) stands in for `INKEY$`/`INPUT$`; `throw DEATH` mirrors the BASIC
  death jump.
- **Input mirrors DOS scancodes.** Arrow keys map to the two-byte extended-key strings DOS
  `INKEY$` returned; Escape and the F9/F10 cheats are preserved.
- **Audio mirrors `SOUND f,d`.** Web Audio square-wave oscillators reproduce GW-BASIC `SOUND`
  durations in 1/18.2-second ticks.

## Modern Additions

These intentionally go beyond the 1988 source: localStorage persistence (`sneekie.theme`,
`sneekie.muted`, `sneekie.highscore`), theme switching and CGA colorization, fullscreen,
touch controls, responsive scaling, the on-page error banner, the CRT monitor shell, the
short 1988-style BIOS/DOS/GW-BASIC boot animation, shared injected nav/footer, page dialogs,
the service worker cache, and English UI strings.

When changing behavior, decide whether you are fixing the faithful port or extending the modern
shell, and keep the BASIC line-number comments intact either way.
