# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

Sneekie is a 32-level snake/maze game originally written in GW-BASIC in July 1988 by
HerbySoft and published in MS(X)DOS Computer Magazine no. 25. In 2026 it was
recovered by OCR from the magazine's printed listing and ported **line for line** to a
static browser version.

There is no framework, no package dependency, and no dedicated automated test suite. There is
no runtime app build step: the publishable pages are static files checked into `docs/`. The
localized pages are generated during maintenance with `tools/generate-locales.js`. The current
site is **not** a single inline HTML file anymore: it is a GitHub Pages site under `docs/`,
split into localized/page-specific HTML plus shared CSS/JS. The canonical 1988 source remains
`docs/SNEEKIE.BAS`; the faithful game port lives in `docs/js/game.js`.

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
  the static chrome, cleanup of old offline service-worker registrations/caches, and the shared
  BASIC tokenizer used by the listing pages. It must not create `header.top` or `<footer>`.
- `docs/js/i18n.js` - runtime language registry and dynamic UI strings used by JavaScript.
  Static header/footer/nav strings do **not** live here; they are build-time chrome strings in
  `tools/generate-locales.js`.
- `docs/js/<page>.js` - page-specific behavior. Keep shared utilities in `site.js` when they
  are used by more than one page.
- `docs/images/` - logo/social/icon PNGs, manual WebP clips, and magazine scans. `favicon.png` stays
  at `docs/favicon.png`.
- `docs/sw.js` - cleanup-only service worker shim. It unregisters old offline workers and deletes
  old `sneekie-offline-*` caches; do not add precaching or fetch handlers back.
- `tools/i18n-source/html/*.html` - editable source templates for localized pages. Edit these
  for translatable page content, then regenerate `docs/en/`, `docs/nl/`, and `docs/uk/`.
- `tools/generate-locales.js` - generates localized HTML pages, static shared chrome, canonical
  and hreflang links, and `docs/sitemap.xml`.
- `tools/verify-i18n.js` - verifies generated localization output, static chrome invariants,
  sitemap entries, offline-cleanup invariants, and that runtime `docs/js/i18n.js` does not regain
  static chrome strings.
- `tools/make-icons.py` - regenerates icon/social/logo PNGs using the CP437 font embedded in
  `docs/js/game.js`.

Only the iframe wrapper `docs/index.html` remains at the site root. Content pages live under
`docs/en/`, `docs/nl/`, and `docs/uk/`, so root-level links should include the language prefix;
links between content pages can use same-language relative `.html` paths.

To ship a change: edit source files, commit, and push to `master`. GitHub Pages is configured
to publish from `master` -> `/docs` (`gh api repos/herbert256/sneekie/pages` can verify this).
For localized page text, edit `tools/i18n-source/html/*.html`, run `node tools/generate-locales.js`,
verify with `node tools/verify-i18n.js`, then commit the regenerated `docs/<lang>/*.html`.

## Pages

- `docs/<lang>/source.html` + `docs/js/source.js` - syntax-highlighted recovered GW-BASIC
  listing. `source.js` embeds `docs/SNEEKIE.BAS` as base64 (so it renders from `file://` too),
  drops the first 10 banner lines for display, and shows only the BASIC line numbers. This page
  also carries the **Download** (`SNEEKIE.BAS`) and **Print** buttons.
- `docs/<lang>/explained.html` + `docs/js/explained.js` - annotated walkthrough of the same
  source. Prose lives in the `SECTIONS` array and `NOTES` map in `explained.js`; the BASIC is
  embedded as base64 and tokenized with the shared `tokenizeBasicLine` from `site.js`.
- `docs/<lang>/migration.html` + `docs/js/migration.js` - BASIC and JavaScript side by side.
  `migration.js` embeds both `docs/SNEEKIE.BAS` and `docs/js/game.js` as base64, then slices
  them by line ranges in `SECTIONS`. The embeds are a frozen snapshot co-calibrated with those
  ranges; if refreshing the page against newer `game.js`, regenerate the JS embed and re-check
  those line ranges together.
- `docs/<lang>/vram.html` + `docs/js/vram.js` - interactive visualization of the text-VRAM
  model. It is a focused sandbox, not the full game engine.
- `docs/<lang>/manual.html` + `docs/js/manual.js` - player manual with maze gallery and dialogs.
  Layout clips live in `docs/images/manual/scene-1..8.webp` (lossless animated WebP).
- `docs/<lang>/bot.html` + `docs/js/bot.js` - live bot demo. It hosts the real game in the same
  page, sets `window.SNEEKIE_SKIPBOOT = true`, and steers by reading `game.js` globals and
  calling `pushKey()`. Keep this page and `docs/<lang>/bot-thinking.html` in sync with
  `docs/js/bot.js` when planner behavior changes.
- `docs/<lang>/magazine.html` + `docs/js/magazine.js` - original magazine scans and translated
  page images. Media lives in `docs/images/magazine/`.
- `docs/<lang>/game.html` + `docs/js/game.js` - the playable port. Keep BASIC line-number
  comments and the original variable names when changing game behavior.
- `docs/index.html` - the root iframe wrapper for the playable port.

## Shared Chrome

All localized content pages carry one standard static top nav and footer in the HTML source.
Do not rely on `docs/js/site.js` to inject `header.top` or `<footer>`. When changing shared
chrome, update `chromeStrings`/`chromeNav` in `tools/generate-locales.js`, run
`node tools/generate-locales.js`, and commit every regenerated localized page. The top-left
brand is `docs/images/logo.png`, and the current page is marked with `aria-current="page"`.
The header nav is `game, history, source, manual, bot, magazine, explained, migration, vram`
(9 links, no buttons). `bot-thinking` is linked from `bot.html` but is not in the nav.

Download and Print live on the **Source** page (a `.toolbar`), not in the header. Print calls
`window.print()` directly (`source.css` `@media print` hides the chrome so only the listing
prints); Download is a plain `<a download>` to `SNEEKIE.BAS`. There is no `?print` routing.

## Translation & Generation

The checked-in `docs/en/`, `docs/nl/`, and `docs/uk/` pages are generated output. Their source
templates live in `tools/i18n-source/html/*.html`: the main English page body plus
`main-template-nl` and `main-template-uk` blocks where localized body content differs. The
generator also writes canonical links, hreflang alternates, static shared chrome, and the
sitemap.

`docs/js/i18n.js` is only for runtime language metadata and dynamic JavaScript strings
(game/source/manual/magazine/vram text). Static chrome strings live in `tools/generate-locales.js`.
`tools/verify-i18n.js` intentionally fails if generated pages still contain `data-i18n*`
attributes, if static chrome is missing, or if static chrome keys are reintroduced into
runtime `docs/js/i18n.js`.

The game page and plain Source listing keep the Green/Amber/White/CGA theme switcher
(`sneekie.theme`). The other doc pages use the fixed green CRT palette from `site.css`.
There is no Light/Dark mode.

## Source Embeds

`docs/SNEEKIE.BAS` is the frozen recovered 1988 source and is the specification for game
behavior. Keep its 10-line header intact because the display code uses `slice(10)`.

- `docs/js/source.js` and `docs/js/explained.js` each embed `docs/SNEEKIE.BAS` as base64 and
  key off it directly. The display code drops the 10-line header with `slice(10)`, so keep that
  header intact. `SNEEKIE.BAS` is permanently frozen, so these embeds normally do not need
  refreshing.
- `docs/js/migration.js` embeds **both** `docs/SNEEKIE.BAS` and `docs/js/game.js` as base64.
  The side-by-side view pairs hard-coded BASIC and JS line ranges, so the embeds are a frozen
  snapshot co-calibrated with those ranges. To refresh the migration page against newer
  `game.js`, regenerate the embedded JS base64 and re-check the `SECTIONS` ranges together.

## Running & Verification

No app build/lint/test commands exist. To preview, serve the site folder:

```sh
cd docs
python3 -m http.server
```

Then open `http://localhost:8000/`. You can also serve from the repo root and open
`/docs/index.html`.

Useful checks after edits:

```sh
node tools/generate-locales.js
node tools/verify-i18n.js
node --check docs/js/*.js docs/sw.js tools/generate-locales.js tools/verify-i18n.js
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
and localized runtime UI strings.

When changing behavior, decide whether you are fixing the faithful port or extending the modern
shell, and keep the BASIC line-number comments intact either way.
