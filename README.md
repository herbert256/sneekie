# Sneekie (1988)

A 32-level snake/maze game written in GW-BASIC in July 1988 by **HerbySoft**,
published in MS(X)DOS Computer Magazine, issue #25 (October 1988).

**Play it here: https://sneekie.xyz/**

In 2026 the printed listing was recovered by OCR and ported line for line to a
static browser version. The port keeps the original direct video-memory model:
the BASIC code POKEd characters straight into text VRAM at `&HB000`/`&HB800`,
and the JavaScript version keeps a matching byte array rendered with the real
IBM VGA 8x16 CP437 ROM font.

There is no framework, build step, package dependency, or dedicated automated
test suite. The published site lives in `docs/` and is served by GitHub Pages.
All site source editing now happens directly under `docs/`, including the
localized pages in `docs/en/`, `docs/nl/`, and `docs/uk/`.
The Live bot is the one exception with source outside `docs/`: its Rust planner
lives under `wasm/bot-engine/` and is checked in as `docs/js/bot-engine.wasm`,
with `docs/js/bot-engine.js` falling back to JavaScript when Wasm is unavailable.

## Controls

- **Arrow keys** steer the snake; swipe works on touch devices.
- **Tap / click** inside the game screen lets the snake walk toward that point.
- Hearts = +10 points, clubs = +25 points, smileys = -50 points, stones can be pushed.
- **Esc** on a keyboard gives up and costs one life. Touch layouts do not show Esc anymore;
  stuck detection flashes the screen red and offers an any-key restart when the snake is trapped.
- **F9** gives one extra life; **F10** skips the current level.
- Levels 1-8 are turn-based; from level 9 the snake moves by itself.
- Sound starts on at page load; the Sound button is session-only.
- Display themes: green, amber, and colorized CGA.
- Fullscreen gives the full monitor-shell experience.

## On the site

- **[Play](https://sneekie.xyz/)** - the game, including the 1988-style boot/GW-BASIC intro.
- **[History](https://sneekie.xyz/en/history)** - the story from the 1988 BASIC listing to the 2026 recovery.
- **[Magazine](https://sneekie.xyz/en/magazine)** - scans from the original 1988 publication.
- **[Source](https://sneekie.xyz/en/source)** - the recovered GW-BASIC listing.
- **[Manual](https://sneekie.xyz/en/manual)** - controls, scoring, maze layouts, and all 32 levels.
- **[Bot](https://sneekie.xyz/en/bot)** - the real game played live by a smart bot in the same page.
- **[How the bot thinks](https://sneekie.xyz/en/bot-thinking)** - route search, danger modeling, and fallback choices.
- **[Explained](https://sneekie.xyz/en/explained)** - an annotated walkthrough of the source.
- **[Migration](https://sneekie.xyz/en/migration)** - BASIC and JavaScript shown side by side.
- **[Visualizer](https://sneekie.xyz/en/vram)** - an interactive look at the text-VRAM trick.

## Layout

```
docs/
  index.html          # English standalone home page
  index_nl.html       # Dutch standalone home page
  index_uk.html       # Ukrainian standalone home page
  404.html            # root dramatic 404 page
  en/, nl/, uk/       # localized content pages
    404.html          # localized dramatic 404 pages
  css/                # shared site.css plus one page CSS file per page
  js/                 # shared runtime JS plus scripts for interactive/generated pages
  images/             # logo, social images, manual WebP clips, magazine scans, page art
  SNEEKIE.BAS         # recovered 1988 GW-BASIC source; the specification
  favicon.png
  site.webmanifest
  sw.js                # PWA service worker for offline play
wasm/
  bot-engine/          # Rust source for the Live bot WebAssembly planner
AGENTS.md             # guidance for Codex
CLAUDE.md             # guidance for Claude Code
```

The faithful game logic lives in `docs/js/game.js`. `docs/<lang>/game.html`
provides the game page markup. The root `docs/index*.html` files are localized
home pages that link to the matching game page; they use `docs/css/site.css` and
`docs/css/index.css` and do not use page JavaScript beyond inline service-worker
registration. Static prose/error pages (`history`, `bot-thinking`, `explained`,
`migration`, `404`) load no runtime JavaScript. Generated or interactive pages
keep the scripts they need (`game`, `source`, `manual`, `bot`, `magazine`,
`vram`).
`docs/css/game.css` styles the monitor shell, and `docs/css/site.css` styles the
static shared chrome used by the content pages.

## Maintenance

Shared header/footer/nav text is static HTML in the localized pages, not runtime
JavaScript. Runtime language metadata and dynamic UI strings live in `docs/js/i18n.js`
only for pages that still need translated runtime text (`game`, `source`, `bot`, and
`vram`). Edit localized pages directly under `docs/<lang>/` and keep the English,
Dutch, and Ukrainian versions aligned by hand.

`docs/sw.js` is a versioned PWA service worker. It precaches the static site for
offline play, serves images cache-first, serves HTML/CSS/JS with stale-while-
revalidate, and deletes obsolete `sneekie-*` caches when a new version activates.
Bump its `VERSION` and update `CORE_ASSETS` when changing existing precached files
or adding new offline-critical assets.

Useful checks after edits:

```sh
node --check docs/js/*.js docs/sw.js
```

When changing the Rust bot planner, rebuild the checked-in Wasm before testing
the browser pages:

```sh
cargo test --manifest-path wasm/bot-engine/Cargo.toml
cargo build --manifest-path wasm/bot-engine/Cargo.toml --release --target wasm32-unknown-unknown
wasm-opt -Oz wasm/bot-engine/target/wasm32-unknown-unknown/release/bot_engine.wasm -o docs/js/bot-engine.wasm
```
