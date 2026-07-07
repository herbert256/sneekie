# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sneekie is a 32-level snake/maze game originally written in GW-BASIC in July 1988 by
HerbySoft and published in MS(X)DOS Computer Magazine no. 25. In 2026 it was
recovered by OCR from the magazine's printed listing and ported **line for line** to a
static browser version.

The website itself has no framework, no package dependency, no site generator, and no runtime
build step: the publishable pages are static files checked into `docs/`, and all site editing
happens directly under `docs/`. The one compiled component is the Live bot's planner: its Rust
source lives in `wasm/bot-engine/` and ships as the checked-in `docs/js/bot-engine.wasm`. That
engine has a `cargo test` suite and an offline Node simulator/tuner under `tools/` (see **Live
bot engine** below). The current site is **not** a single inline HTML file anymore: it is a
static site under `docs/`, split into localized/page-specific HTML plus shared CSS/JS. The
canonical 1988 source remains `docs/SNEEKIE.BAS`; the faithful game port lives in
`docs/js/game.js`.

## Layout & Deployment

The repository root **is** the git repo (remote `github.com:herbert256/sneekie`). The
publishable website lives in `docs/`. The canonical site at https://sneekie.cc/ is served by
**Cloudflare**: the root `wrangler.jsonc` publishes `docs/` as Cloudflare Workers static assets
(project name `sneekie`), and `server: cloudflare` in the live response headers confirms it.
GitHub Pages also builds the same `master` -> `/docs` tree as a **mirror** at
https://herbert256.github.io/sneekie/ (its custom-domain CNAME is unset). Clean URLs (dropping
the `.html`) resolve on `sneekie.cc` because Cloudflare serves them; `docs/js/site.js` only
rewrites in-page links to clean form when `location.hostname` is `sneekie.cc`/`www.sneekie.cc`,
so keep `.html` in the checked-in `href`s.

- `docs/index.html`, `docs/index_nl.html`, `docs/index_uk.html` - the three localized root
  landing pages (en/nl/uk). Each is a standalone full page (**not** an iframe wrapper): the
  standard static header/footer chrome, a hero "play" section whose CRT image links to the
  matching `<lang>/game.html`, and a topic-card grid linking to the content pages. They load
  `css/site.css` and `css/index.css`; there is no `js/index.js`. The live bot preview scripts
  (`game.js`, `bot-engine.js`, and `bot.js`) are lazy-loaded from inline code after the page is
  loaded/idle. The index preview runs the same Rust/WebAssembly bot (`bot-engine.js`) as the Bot
  page, in passive preview mode. Keep the inline service-worker cleanup
  and JSON-LD structured-data block inline.
- `docs/<lang>/game.html` - the game page shell. It loads `../css/site.css`,
  `../css/game.css`, `../js/site.js`, and `../js/game.js` (the playable port only — no bot).
- `docs/<lang>/*.html` - localized content pages under `docs/en/`, `docs/nl/`, and `docs/uk/`:
  `game`, `history`, `source`, `manual`, `bot`, `bot-thinking`, `magazine`, `explained`,
  `migration`, and `vram`. Static prose/error pages (`history`, `bot-thinking`, `explained`,
  `migration`, `source`, and `404`) load no external runtime JavaScript. JavaScript-backed
  pages load `../js/site.js` and the page script they need (`game`, `manual`, `bot`,
  `magazine`, or `vram`). Runtime UI text for `game`, `bot`, and `vram` is provided inline in
  the localized HTML pages as `window.SNEEKIE_TEXT`.
- `docs/css/site.css` - shared variables, layout primitives, doc-page styling, static
  header/footer chrome, dialogs, buttons, and responsive rules.
- `docs/css/<page>.css` - page-specific styles.
  Keep shared visual language in `site.css`; only page-only layout and components belong in
  page CSS.
- `docs/js/site.js` - shared runtime behavior for JavaScript-backed pages: localStorage
  helpers, clean-link normalization outside the static chrome, and old service-worker cleanup.
  It must not create `header.top` or `<footer>`. (Download + Print live on the Source page, not
  the header.)
- `docs/js/<page>.js` - page-specific behavior. Keep shared utilities in `site.js` when they
  are used by more than one page.
- `docs/images/` - logo/social/icon PNGs (`logo.png`, `og.png`, `apple-touch-icon.png`),
  `flags/` (the gb/nl/ua language-switch SVGs), `manual/` layout clips (lossless animated
  WebP), `magazine/` scans (full + `.thumb` WebP), and `pages/` art (per-page hero/closing
  images, the History illustrations, the 404 snake, and the vram font-explorer figure).
  `favicon.png` and `favicon.ico` stay at `docs/`.
- `docs/sw.js` - cleanup shim for visitors who still have an older Sneekie service worker
  installed. It deletes `sneekie-*` caches, unregisters itself, and does not intercept fetches.
  The site intentionally has no offline/PWA cache; do not add service-worker registration,
  precaching, or runtime caching back unless offline support is explicitly restored.

The three localized landing pages (`docs/index.html`, `docs/index_nl.html`, `docs/index_uk.html`)
are the only HTML at the site root. Content pages live under `docs/en/`, `docs/nl/`, and
`docs/uk/`, so root-level links should include the language prefix; links between content pages
can use same-language relative `.html` paths.

To ship a change: edit source files, commit, and push to `master`. GitHub Pages publishes the
mirror from `master` -> `/docs` automatically (`gh api repos/herbert256/sneekie/pages` verifies
it). The canonical `sneekie.cc` is fronted by Cloudflare from the root `wrangler.jsonc`
(`docs/` as static assets); a Cloudflare deploy (e.g. `wrangler deploy`, or its Git integration
on push) republishes it. When only the Wasm bot changed, rebuild `docs/js/bot-engine.wasm`
first (see **Live bot engine**). For localized page text or chrome, edit the checked-in
`docs/<lang>/*.html` files directly and keep the English, Dutch, and Ukrainian pages aligned by
hand.

## Pages

- `docs/<lang>/source.html` - fully static, syntax-highlighted recovered GW-BASIC listing.
  The rendered listing is checked into each localized HTML file directly, after dropping the
  first 10 banner lines and showing only the BASIC line numbers. This page also carries the
  **Download** (`SNEEKIE.BAS`) and **Print** buttons (a `.toolbar` near the top; a small inline
  script wires Print to `window.print()` and handles the Green/Amber/CGA source theme).
- `docs/<lang>/explained.html` - static single-column annotated walkthrough of the same source.
  The TOC, section cards, BASIC listing, and amber line notes are rendered directly into each
  localized HTML page; these pages do not load runtime JavaScript.
- `docs/<lang>/migration.html` - static 1988 BASIC and 2026 JavaScript side-by-side pages.
  These pages do not load runtime JavaScript. The rendered code pairs are checked into each
  localized HTML file directly; keep the hard-coded BASIC/JS line ranges co-calibrated when
  editing the inline snippets.
- `docs/<lang>/vram.html` + `docs/js/vram.js` - interactive visualization of the text-VRAM
  model. It is a focused sandbox, not the full game engine.
- `docs/<lang>/manual.html` + `docs/js/manual.js` - player manual with maze gallery and dialogs.
  Layout clips live in `docs/images/manual/scene-1..8.webp` (lossless animated WebP).
- `docs/<lang>/bot.html` - the **Live bot** demo. It hosts the real game in the
  SAME page (no iframe): it loads `../css/bot.css` + `../js/game.js`
  (which render the game into `#screen`), sets `window.SNEEKIE_SKIPBOOT = true` to skip the boot
  animation, then loads the planner and the driver. `bot-engine.js` loads the Rust/WebAssembly
  planner (`window.SneekieBotWasm`, backed by `bot-engine.wasm`, preloaded from the page head)
  and, when the machine has spare logical cores, a small Worker pool (`bot-engine-worker.js`,
  one extra Wasm instance per Worker) for parallel planning. `bot.js` is the driver: it
  reads `game.js`'s globals directly, waits for the Wasm planner before driving, and steers via
  `pushKey()`. The Wasm bot needs http(s); when WebAssembly cannot load (e.g. on `file://`) the
  bot stays idle and reports "bot unavailable". Level
  tabs (2-8) jump the bot into an early maze; a speed slider sets the pace. Body class is
  `page-doc page-bot`, and `bot.css` carries its own copy of the CRT/game-shell styling plus
  the lead/speed/tabs/note. The page links to `bot-thinking.html`. Keep the planner
  (`bot-engine.js`) and the driver (`bot.js`) in sync with `bot-thinking.html`.
- `docs/<lang>/bot-thinking.html` - static prose explaining how that bot plans (no runtime JS).
  It is linked only from `bot.html`, not from the nav. Keep it in sync with the planner in
  `docs/js/bot-engine.js` (and the driver in `docs/js/bot.js`) when
  planner behavior changes. (CSS class is `.page-bot-thinking`.)
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
The header nav has 9 links (no buttons), labelled `▶ Play, History, Magazine, Source, Bot,
Manual, Explained, Migration, Visualizer` (the underlying files are `game, history, magazine,
source, bot, manual, explained, migration, vram`). `Bot` is the Live bot demo; the
`bot-thinking` page marks `Bot` current. To the right of the nav is a `.lang-switch` row of
three flag links (`docs/images/flags/gb.svg`, `nl.svg`, `ua.svg`) pointing at the en/nl/uk copy
of the current page, with `aria-current="true"` on the active language.

Download and Print live on the **Source** page (a `.toolbar`), not in the header. Print calls
`window.print()` directly (`source.css` `@media print` hides the chrome so only the listing
prints); Download is a plain `<a download>` to `SNEEKIE.BAS`. There is no `?print` routing.

## Translation

The checked-in `docs/en/`, `docs/nl/`, and `docs/uk/` pages are the editable source of truth.
When changing page copy, static chrome, canonical links, hreflang alternates, or the sitemap,
edit the corresponding files in `docs/` directly and keep all three languages consistent.

Runtime UI strings that JavaScript needs live inline in the localized HTML page that uses
them, usually as `window.SNEEKIE_TEXT` before the page script. Static chrome strings and static
prose live directly in the HTML pages.

The game page and plain Source listing keep the Green/Amber/CGA theme switcher
(`sneekie.theme`). The other doc pages use the fixed green CRT palette from `site.css`.
There is no Light/Dark mode.

## Source Embeds

`docs/SNEEKIE.BAS` is the frozen recovered 1988 source and is the specification for game
behavior. The Source pages carry checked-in rendered HTML based on that frozen listing:

- `docs/<lang>/source.html` contains the static rendered source listing. The rendered content
  drops the 10-line header, so keep that header intact in `docs/SNEEKIE.BAS`. `SNEEKIE.BAS` is
  permanently frozen, so this rendered listing normally does not need refreshing.
- `docs/<lang>/explained.html` contains static rendered annotations for the same BASIC source.
  When changing those pages, keep the English, Dutch, and Ukrainian static listings aligned.
- `docs/<lang>/migration.html` contains static rendered side-by-side code pairs. The BASIC and
  JavaScript snippets are checked into the HTML directly, based on the frozen migration snapshot
  rather than the current live `docs/SNEEKIE.BAS` or `docs/js/game.js`. When changing those
  pages, edit all three localized files and keep every BASIC/JS line range co-calibrated.

## Live bot engine (Rust/Wasm)

The Live bot (Bot page + landing-page previews) is planned by a Rust engine compiled to
WebAssembly, not by JavaScript. The source of truth is `wasm/bot-engine/`; the shipped artifact
is the checked-in `docs/js/bot-engine.wasm`. Editing the Rust does nothing until you rebuild the
`.wasm`, so keep the two in sync.

- `wasm/bot-engine/src/ffi.rs` - the C ABI the browser calls. It exposes fixed static buffers
  (`board_ptr`, `body_ptr`, `enemy_ptr`, `trail_ptr`, `weights_ptr`, `route_ptr`) that JS fills
  each tick, plus `decide(...)` / `decide_mode(mode, ...)`, which return one packed
  `tier*256 + scancode` decision and publish the committed route into the route buffer.
- `wasm/bot-engine/src/lib.rs` - board constants (the 4000-cell VRAM mirror, DOS arrow deltas,
  danger-mask depth) and the `now_ms` host import used for the per-tick planning deadline.
- `wasm/bot-engine/src/planner/` - the planner, split into `core` (the decide loop and tiered
  fallbacks), `board` (per-level classification: arrow / open / room-door layouts), `food` +
  `movement` + `space` (route search, the move engine, and flood/escape space analysis),
  `region` + `doors` + `tour` (region-sweep discipline, chokepoint reservation, and the
  end-game full-tour finisher), `smile` (smiley `-50` discipline), and `fallback` (survival
  guards). `planner/tests.rs` is the `cargo test` suite.
- Scoring is driven by 27 tunable weights (`W_DEFAULTS` and the `W_*` index constants in
  `planner/mod.rs`). The page always runs the compiled-in defaults; the `weights_ptr` buffer is
  only used by the offline tuner.

Offline bot tooling lives in `tools/` (Node, no dependencies):

- `tools/sim-wasm-bot.mjs` - headless simulator that loads a `.wasm` and runs the bot across
  chosen levels/seeds, reporting clears/score. Use it to check a build without a browser.
- `tools/tune-bot-weights.mjs` - hill-climbs the weight vector via the simulator and writes the
  best result to `tools/bot-weights.best.json`. To ship a tuned vector, copy its numbers into
  `W_DEFAULTS` in `planner/mod.rs` and rebuild. Keep `W_DEFAULTS`, the `W_*` index constants,
  and the tuner's `DEFAULTS`/`NAMES` arrays in sync.

Rebuild the shipped Wasm after any Rust change:

```sh
cargo test --manifest-path wasm/bot-engine/Cargo.toml
cargo build --manifest-path wasm/bot-engine/Cargo.toml --release --target wasm32-unknown-unknown
wasm-opt -O3 wasm/bot-engine/target/wasm32-unknown-unknown/release/bot_engine.wasm -o docs/js/bot-engine.wasm
```

On this machine a `~/scripts/cc` shim shadows the system compiler and breaks the host `cargo
test` build; pass `CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER=/usr/bin/cc` to work around it. Keep
`bot-engine.js` (the loader + Worker pool), `bot.js` (the driver), and `bot-thinking.html` in
sync with planner behavior.

## Running & Verification

The site has no build/lint/test step. The only build is the Rust bot's Wasm (see the **Live bot
engine** section above), which carries its own `cargo test` suite. To preview, serve the site
folder:

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
runtime UI strings, and old service-worker/cache cleanup. Sound starts on at page load; mute is
a session-only button state and `sneekie.muted` is cleared for old visitors.

When changing behavior, decide whether you are fixing the faithful port or extending the modern
shell, and keep the BASIC line-number comments intact either way.
