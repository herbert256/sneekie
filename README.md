# Sneekie (1988)

A 32-level snake/maze game written in GW-BASIC in July 1988 by **HerbySoft**,
published in MS(X)DOS Computer Magazine, issue #25 (October 1988).

**Play it here: https://sneekie.cc/**

In 2026 the printed listing was recovered by OCR and ported line for line to a
static browser version. The port keeps the original direct video-memory model:
the BASIC code POKEd characters straight into text VRAM at `&HB000`/`&HB800`,
and the JavaScript version keeps a matching byte array rendered with the real
IBM VGA 8x16 CP437 ROM font.

Since July 2026 the Play and Bot pages also carry a **1988/2026 switch**: next
to the faithful CRT port there is a full 3D remake (`docs/js/game3d.js`),
hand-written WebGL2 + Web Audio with no engine or library, built by Claude
Fable. Same rules, same maze archetypes, a realistic snake, a modern monitor
shell, swipe/tap controls, and its own autopilot on the Bot page. The home
pages stay 1988-only.

The website has no framework, build step, or package dependency. The published
pages live in `docs/`. The canonical site at https://sneekie.cc/ is served by
Cloudflare (see `wrangler.jsonc`); GitHub Pages builds the same `docs/` tree as a
mirror at https://herbert256.github.io/sneekie/. All site editing happens
directly under `docs/`, including the localized pages in `docs/en/`, `docs/nl/`,
and `docs/uk/`.
The Live bot is the one part with source outside `docs/`: its planner is written
in Rust under `wasm/bot-engine/`, compiled to the checked-in
`docs/js/bot-engine.wasm`, and loaded by `docs/js/bot-engine.js`. The Bot page
and all three landing pages run this same WebAssembly bot; the landing pages
lazy-load `game.js`, `bot-engine.js`, and `bot.js` inline and drive it in a
passive preview mode. A Rust test suite plus a Node simulator/tuner under
`tools/` keep the bot honest offline.

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

- **[Play](https://sneekie.cc/)** - the game, including the 1988-style boot/GW-BASIC intro,
  plus the 2026 3D remake behind the 1988/2026 switch.
- **[History](https://sneekie.cc/en/history)** - the story from the 1988 BASIC listing to the 2026 recovery.
- **[Magazine](https://sneekie.cc/en/magazine)** - scans from the original 1988 publication.
- **[Source](https://sneekie.cc/en/source)** - the recovered GW-BASIC listing.
- **[Manual](https://sneekie.cc/en/manual)** - controls, scoring, maze layouts, and all 32 levels.
- **[Bot](https://sneekie.cc/en/bot)** - the real game played live by a smart bot in the same page.
- **[How the bot thinks](https://sneekie.cc/en/bot-thinking)** - route search, danger modeling, and fallback choices.
- **[Explained](https://sneekie.cc/en/explained)** - an annotated walkthrough of the source.
- **[Migration](https://sneekie.cc/en/migration)** - BASIC and JavaScript shown side by side.
- **[Visualizer](https://sneekie.cc/en/vram)** - an interactive look at the text-VRAM trick.

## Layout

```
docs/
  index.html          # English standalone home page
  index_nl.html       # Dutch standalone home page
  index_uk.html       # Ukrainian standalone home page
  404.html            # root dramatic 404 page
  en/, nl/, uk/       # localized content pages (each with its own 404.html)
  css/                # shared site.css plus one page CSS file per page
  js/                 # game.js, game3d.js (2026 remake), the bot (bot.js/bot-engine.js + bot-engine.wasm), helpers
  images/             # logo, social/flag icons, manual WebP clips, magazine scans, page art
  SNEEKIE.BAS         # recovered 1988 GW-BASIC source; the specification
  favicon.png / .ico
  robots.txt, sitemap.xml
  sw.js               # cleanup shim for old service-worker installs
wasm/
  bot-engine/         # Rust source for the Live bot WebAssembly planner
tools/                # Node bot simulator + weight tuner (offline; not shipped)
wrangler.jsonc        # Cloudflare Workers config serving docs/ at sneekie.cc
CLAUDE.md             # guidance for Claude Code
```

The faithful game logic lives in `docs/js/game.js`. `docs/<lang>/game.html`
provides the game page markup. The root `docs/index*.html` files are localized
home pages that link to the matching game page; they use `docs/css/site.css` and
`docs/css/index.css` and only use inline JavaScript for the live home-page bot preview
and cleanup of old service-worker installs. Static prose/error pages (`history`,
`bot-thinking`, `explained`, `migration`, `source`, `404`) load no external runtime
JavaScript. Interactive pages keep the scripts they need (`game`, `manual`, `bot`,
`magazine`, `vram`).
`docs/css/game.css` styles the monitor shell, and `docs/css/site.css` styles the
static shared chrome used by the content pages.

## Maintenance

Shared header/footer/nav text is static HTML in the localized pages, not runtime
JavaScript. Runtime UI strings that JavaScript needs live inline in the localized
HTML pages that use them, usually as `window.SNEEKIE_TEXT`. The Source and
Migration pages carry their rendered code directly in HTML. Edit localized pages
directly under `docs/<lang>/` and keep the English, Dutch, and Ukrainian versions
aligned by hand.

Sneekie intentionally has no offline/PWA cache. `docs/sw.js` is only a cleanup shim:
it lets browsers with an older installed service worker delete `sneekie-*` caches,
unregister the worker, and reload back to normal network loading. Do not add precaching,
runtime caching, or service-worker registration back unless offline support is explicitly
restored.

Useful checks after edits:

```sh
node --check docs/js/*.js docs/sw.js
```

When changing the Rust bot planner, rebuild the checked-in Wasm before testing
the browser pages:

```sh
cargo test --manifest-path wasm/bot-engine/Cargo.toml
cargo build --manifest-path wasm/bot-engine/Cargo.toml --release --target wasm32-unknown-unknown
wasm-opt -O3 wasm/bot-engine/target/wasm32-unknown-unknown/release/bot_engine.wasm -o docs/js/bot-engine.wasm
```

The offline tools in `tools/` (a headless simulator and a hill-climbing weight
tuner) exercise the same `.wasm` without a browser. On macOS, if a `cc` shim on
your `PATH` shadows the system compiler and the host build fails, pass
`CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER=/usr/bin/cc` to the `cargo test` above.
