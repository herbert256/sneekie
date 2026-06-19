# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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
  around the localized game page. It loads `css/index.css` and `js/index.js`; keep the JSON-LD
  structured-data script inline for search crawlers.
- `docs/<lang>/game.html` - the game page shell. It loads `../css/site.css`,
  `../css/game.css`, `../js/site.js`, and `../js/game.js`.
- `docs/<lang>/*.html` - localized content pages under `docs/en/`, `docs/nl/`, and `docs/uk/`:
  `game`, `history`, `source`, `manual`, `bot`, `bot-thinking`, `magazine`, `explained`,
  `migration`, and `vram`. Each content page loads `../css/site.css`, page-specific CSS when
  present (`game` uses `../css/game.css`), `../js/site.js`, and its own page JS.
- `docs/css/site.css` - shared variables, layout primitives, doc-page styling, static
  header/footer chrome, dialogs, buttons, and responsive rules.
- `docs/css/<page>.css` - page-specific styles.
  Keep shared visual language in `site.css`; only page-only layout and components belong in
  page CSS.
- `docs/js/site.js` - shared site behavior: language helpers, clean-link normalization outside
  the static chrome, service-worker registration, and the shared BASIC tokenizer used by the
  listing pages. It must not create `header.top` or `<footer>`.
- `docs/js/<page>.js` - page-specific behavior. Keep shared utilities in `site.js` when they
  are used by more than one page.
- `docs/images/` - logo/social/icon PNGs, manual GIFs, and magazine scans. `favicon.png` stays
  at `docs/favicon.png`.
- `docs/sw.js` - service worker precache. Bump `CACHE_NAME` when changing existing precached
  files so deployed users do not keep stale assets.
- `tools/make-icons.py` - regenerates icon/social/logo PNGs using the CP437 font embedded in
  `docs/js/game.js`.

Only the iframe wrapper `docs/index.html` remains at the site root. Content pages live under
`docs/en/`, `docs/nl/`, and `docs/uk/`, so root-level links should include the language prefix;
links between content pages can use same-language relative `.html` paths.

To ship a change: edit under `docs/`, commit, and push to `master`. GitHub Pages is configured
to publish from `master` -> `/docs` (`gh api repos/herbert256/sneekie/pages` can verify this).

## Pages

- `docs/<lang>/source.html` + `docs/js/source.js` - syntax-highlighted recovered GW-BASIC
  listing. `source.js` fetches `docs/SNEEKIE.BAS` at runtime, drops the first 10 banner
  lines for display, and shows only the BASIC line numbers.
- `docs/<lang>/explained.html` + `docs/js/explained.js` - annotated walkthrough of the same
  source. Prose lives in the `SECTIONS` array and `NOTES` map in `explained.js`.
- `docs/<lang>/migration.html` + `docs/js/migration.js` - BASIC and JavaScript side by side.
  `migration.js` embeds both `docs/SNEEKIE.BAS` and `docs/js/game.js` as base64, then slices
  them by line ranges in `SECTIONS`. If either source changes substantially, regenerate the
  embedded copy and re-check those line ranges.
- `docs/<lang>/vram.html` + `docs/js/vram.js` - interactive visualization of the text-VRAM
  model. It is a focused sandbox, not the full game engine.
- `docs/<lang>/manual.html` + `docs/js/manual.js` - player manual with maze gallery and dialogs.
  Layout GIFs live in `docs/images/manual/scene-1..8.gif`.
- `docs/<lang>/bot.html` + `docs/js/bot.js` - live bot demo. Keep this page and
  `docs/<lang>/bot-thinking.html` in sync with `docs/js/bot.js` when planner behavior changes.
- `docs/<lang>/magazine.html` + `docs/js/magazine.js` - original magazine scans and translated
  page images. Media lives in `docs/images/magazine/`.
- `docs/<lang>/game.html` + `docs/js/game.js` - the playable port. Keep BASIC line-number
  comments and the original variable names when changing game behavior.
- `docs/index.html` - the root iframe wrapper for the playable port.

## Shared Chrome

All localized content pages carry one standard static top nav and footer in the HTML source.
Do not rely on `docs/js/site.js` to inject `header.top` or `<footer>`. When changing shared
chrome, update every localized HTML page together. The top-left brand is `docs/images/logo.png`,
and the current page is marked with `aria-current="page"`.

The print button always prints the Source page. From the root iframe shell it is not shown;
from `game.html` and the other content pages it navigates to `source.html?print`.

The game page and plain Source listing keep the Green/Amber/White/CGA theme switcher
(`sneekie.theme`). The other doc pages use the fixed green CRT palette from `site.css`.
There is no Light/Dark mode.

## Source Embeds

`docs/SNEEKIE.BAS` is the frozen recovered 1988 source and is the specification for game
behavior. Keep its 10-line header intact because the display code uses `slice(10)`.

- `docs/js/source.js` and `docs/js/explained.js` fetch `docs/SNEEKIE.BAS` at runtime. The
  service worker precaches the BASIC file, so these pages still work offline after install.
- `docs/js/migration.js` embeds both `docs/SNEEKIE.BAS` and `docs/js/game.js` as base64. If
  either file changes, regenerate those embedded copies and update `SECTIONS` if line ranges
  shifted.

## Running & Verification

No build/lint/test commands exist. To preview, serve the site folder:

```sh
cd docs
python3 -m http.server
```

Then open `http://localhost:8000/`. You can also serve from the repo root and open
`/docs/index.html`.

The service worker precaches production clean URL variants such as `en/manual`; those resolve
on GitHub Pages/Cloudflare but return 404 under a plain `python3 -m http.server`. Use the `.html`
paths for local manual testing, or test clean URL caching against production.

Useful checks after edits:

```sh
node --check docs/js/*.js docs/sw.js
```

For frontend changes, verify the relevant pages in a browser at desktop and mobile widths.
`docs/<lang>/game.html` surfaces runtime JS errors through an on-page error banner.

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
short 1988-style BIOS/DOS/GW-BASIC boot animation, shared static nav/footer, page dialogs,
the service worker cache, and English UI strings.

When changing behavior, decide whether you are fixing the faithful port or extending the modern
shell, and keep the BASIC line-number comments intact either way.
