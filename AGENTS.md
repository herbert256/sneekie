# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

Sneekie is a 32-level snake/maze game originally written in GW-BASIC in July 1988 by
HerbySoft and published in MS(X)DOS Computer Magazine no. 25. In 2026 it was
recovered by OCR from the magazine's printed listing and ported **line for line** to a
static browser version.

There is no framework, no package dependency, and no dedicated automated test suite. There is
no runtime app build step: the publishable pages are static files checked into `docs/`. All
site source editing now happens directly under `docs/`; there is no generator or `tools/`
workflow. The current site is **not** a single inline HTML file anymore: it is a GitHub Pages
site under `docs/`, split into localized/page-specific HTML plus shared CSS/JS. The canonical
1988 source remains `docs/SNEEKIE.BAS`; the faithful game port lives in `docs/js/game.js`.

## Layout & Deployment

The repository root **is** the git repo (remote `github.com:herbert256/sneekie`). The
publishable website lives in `docs/`, which is the GitHub Pages source. It is served at
https://sneekie.xyz/.

- `docs/index.html`, `docs/index_nl.html`, `docs/index_uk.html` - the three localized root
  landing pages (en/nl/uk). Each is a standalone full page (**not** an iframe wrapper): the
  standard static header/footer chrome, a hero "play" section whose CRT image links to the
  matching `<lang>/game.html`, and a topic-card grid linking to the content pages. They load
  `css/site.css` and `css/index.css` only; there is no `js/index.js`. Keep the inline service
  worker registration and JSON-LD structured-data block inline.
- `docs/<lang>/game.html` - the game page shell. It loads `../css/site.css`,
  `../css/game.css`, `../js/site.js`, and `../js/game.js` (the playable port only; no bot).
- `docs/<lang>/*.html` - localized content pages under `docs/en/`, `docs/nl/`, and `docs/uk/`:
  `game`, `history`, `source`, `manual`, `bot`, `bot-thinking`, `magazine`, `explained`,
  `migration`, and `vram`. Static prose/error pages (`history`, `bot-thinking`, `explained`,
  `migration`, and `404`) load no runtime JavaScript. Interactive/generated pages load `../js/i18n.js`,
  `../js/site.js`, and the page script they need (`game`, `source`, `manual`, `bot`,
  `magazine`, or `vram`).
- `docs/css/site.css` - shared variables, layout primitives, doc-page styling, static
  header/footer chrome, dialogs, buttons, and responsive rules.
- `docs/css/<page>.css` - page-specific styles.
  Keep shared visual language in `site.css`; only page-only layout and components belong in
  page CSS.
- `docs/js/site.js` - shared runtime behavior for JavaScript-backed pages: language helpers,
  clean-link normalization outside the static chrome, service-worker registration, and the
  shared BASIC tokenizer used by the listing pages. It must not create `header.top` or
  `<footer>`. Download and Print live on the Source page, not in the header.
- `docs/js/i18n.js` - runtime language registry and dynamic UI strings used by JavaScript.
  Static header/footer/nav strings do **not** live here; they are literal HTML in the localized
  pages under `docs/<lang>/`.
- `docs/js/<page>.js` - page-specific behavior. Keep shared utilities in `site.js` when they
  are used by more than one page.
- `docs/images/` - logo/social/icon PNGs, the manual layout clips and magazine scans (both
  WebP), localized home-title WebP images, and dramatic page hero/closing images.
  `favicon.png` stays at `docs/favicon.png`.
- `docs/sw.js` - versioned PWA service worker. It precaches the static site for offline play,
  deletes obsolete `sneekie-*` caches during activation, serves images cache-first, and serves
  HTML/CSS/JS with stale-while-revalidate. Bump `VERSION` and keep `CORE_ASSETS` in sync when
  changing existing precached files or adding new offline-critical assets.

The three localized landing pages (`docs/index.html`, `docs/index_nl.html`, `docs/index_uk.html`)
are the only normal HTML entry pages at the site root, plus the root `docs/404.html`. Content
pages live under `docs/en/`, `docs/nl/`, and `docs/uk/`, so root-level links should include the
language prefix; links between content pages can use same-language relative `.html` paths.

To ship a change: edit source files, commit, and push to `master`. GitHub Pages is configured
to publish from `master` -> `/docs` (`gh api repos/herbert256/sneekie/pages` can verify this).
For localized page text or chrome, edit the checked-in `docs/<lang>/*.html` files directly and
keep the English, Dutch, and Ukrainian pages aligned by hand.

## Pages

- `docs/<lang>/source.html` + `docs/js/source.js` - syntax-highlighted recovered GW-BASIC
  listing. `source.js` embeds `docs/SNEEKIE.BAS` as base64 (so it renders from `file://` too),
  drops the first 10 banner lines for display, and shows only the BASIC line numbers. This page
  also carries the **Download** (`SNEEKIE.BAS`) and **Print** buttons (a `.toolbar` near the
  top; `source.js` wires Print to `window.print()`).
- `docs/<lang>/explained.html` - static single-column annotated walkthrough of the same source.
  The TOC, section cards, BASIC listing, and amber line notes are rendered directly into each
  localized HTML page; these pages do not load runtime JavaScript.
- `docs/<lang>/migration.html` - static 1988 BASIC and 2026 JavaScript side-by-side pages.
  These pages do not load runtime JavaScript. The rendered code pairs were generated from the
  frozen base64 snapshots in `docs/js/migration.js`, not from the current live source files, so
  the hard-coded BASIC/JS line ranges remain co-calibrated.
- `docs/<lang>/vram.html` + `docs/js/vram.js` - interactive visualization of the text-VRAM
  model. It is a focused sandbox, not the full game engine.
- `docs/<lang>/manual.html` + `docs/js/manual.js` - player manual with maze gallery and dialogs.
  Layout clips live in `docs/images/manual/scene-1..8.webp` (lossless animated WebP).
- `docs/<lang>/bot.html` + `docs/js/bot.js` - the **Live bot** demo. It hosts the real game in the
  same page (no iframe, so it works from `file://`): it loads `../css/game.css` +
  `../js/game.js`, sets `window.SNEEKIE_SKIPBOOT = true` to skip the boot animation, then
  `bot.js` reads `game.js` globals directly and steers via `pushKey()`. Level tabs (26-32) jump
  the bot into a maze; a speed slider sets the pace. Body class is `page-index page-bot` (the
  game styling comes from `.page-index`; `bot.css` only adds the lead/speed/tabs/note). The
  page links to `bot-thinking.html`. Keep the planner in `bot.js` in sync with
  `bot-thinking.html`.
- `docs/<lang>/bot-thinking.html` - static prose explaining how the bot plans (no runtime JS).
  It is linked only from `bot.html`, not from the nav. Keep it in sync with the planner in
  `docs/js/bot.js` when planner behavior changes. CSS class is `.page-bot-thinking`.
- `docs/<lang>/magazine.html` + `docs/js/magazine.js` - original magazine scans and translated
  page images. Media lives in `docs/images/magazine/`. Reachable from the header.
- `docs/<lang>/game.html` + `docs/js/game.js` - the playable port. Keep BASIC line-number
  comments and the original variable names when changing game behavior.
- `docs/index.html` (+ `index_nl.html`, `index_uk.html`) - the localized root landing pages; the
  hero "play" image links into `<lang>/game.html` (see Layout & Deployment).
- `docs/404.html` and `docs/<lang>/404.html` - dramatic localized 404 pages styled by
  `docs/css/404.css`, using `docs/images/pages/404-lost-snake.webp`.

## Shared Chrome

All localized content pages carry one standard static top nav and footer in the HTML source.
Do not rely on `docs/js/site.js` to inject `header.top` or `<footer>`. When changing shared
chrome, edit every affected `docs/<lang>/*.html` page directly. The top-left brand is
`docs/images/logo.png`, and the current page is marked with `aria-current="page"`.
The header nav is `game, history, magazine, source, bot, manual, explained, migration, vram`
(9 links, no buttons). `bot` is the Live bot demo; `bot-thinking` marks `bot` current.

Download and Print live on the **Source** page (a `.toolbar`), not in the header. Print calls
`window.print()` directly (`source.css` `@media print` hides the chrome so only the listing
prints); Download is a plain `<a download>` to `SNEEKIE.BAS`. There is no `?print` routing.

## Translation

The checked-in `docs/en/`, `docs/nl/`, and `docs/uk/` pages are the editable source of truth.
When changing page copy, static chrome, canonical links, hreflang alternates, or the sitemap,
edit the corresponding files in `docs/` directly and keep all three languages consistent.

`docs/js/i18n.js` is only for runtime language metadata and dynamic JavaScript strings
(game/source/manual/bot/magazine/vram text). Static chrome strings and static prose
live in the HTML pages, not in runtime `docs/js/i18n.js`.

The game page and plain Source listing keep the Green/Amber/CGA theme switcher
(`sneekie.theme`). The other doc pages use the fixed green CRT palette from `site.css`.
There is no Light/Dark mode.

## Source Embeds

`docs/SNEEKIE.BAS` is the frozen recovered 1988 source and is the specification for game
behavior. The listing pages embed it as base64 (so every page also renders straight from
`file://`, not just over http):

- `docs/js/source.js` embeds `docs/SNEEKIE.BAS` as base64 and keys off it directly. The display
  code drops the 10-line header with `slice(10)`, so keep that header intact. `SNEEKIE.BAS` is
  permanently frozen, so this embed normally does not need refreshing.
- `docs/<lang>/explained.html` contains static rendered annotations for the same BASIC source.
  When changing those pages, keep the English, Dutch, and Ukrainian static listings aligned.
- `docs/<lang>/migration.html` contains static rendered side-by-side code pairs. They were
  generated from the frozen base64 snapshots in `docs/js/migration.js`, not from the current
  live `docs/SNEEKIE.BAS` or `docs/js/game.js`. When changing those pages, keep using that
  snapshot as the base unless deliberately recalibrating every BASIC/JS line range.

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
  `INKEY$` returned. Physical Escape gives up, F9 gives one extra life, and F10 skips the
  current level. Touch fullscreen controls intentionally expose only arrows plus F9/F10; stuck
  detection handles trapped touch players.
- **Audio mirrors `SOUND f,d`.** Web Audio square-wave oscillators reproduce GW-BASIC `SOUND`
  durations in 1/18.2-second ticks.

## Modern Additions

These intentionally go beyond the 1988 source: localStorage persistence for the theme and
high score (`sneekie.theme`, `sneekie.highscore`), theme switching and CGA colorization,
fullscreen, touch controls, click/tap route targeting, stuck detection with a red flash and
restart popup, responsive scaling, the on-page error banner, the CRT monitor shell, the short
1988-style BIOS/DOS/GW-BASIC boot animation, shared static nav/footer, page dialogs, localized
runtime UI strings, and PWA offline support. Sound starts on at page load; mute is a
session-only button state and `sneekie.muted` is cleared for old visitors.

When changing behavior, decide whether you are fixing the faithful port or extending the modern
shell, and keep the BASIC line-number comments intact either way.
