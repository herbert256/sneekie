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

## Controls

- **Arrow keys** steer the snake; swipe works on touch devices.
- Hearts = +10 points, clubs = +25 points, smileys = -50 points, stones can be pushed.
- **Esc** gives up when stuck and costs one life.
- Levels 1-8 are turn-based; from level 9 the snake moves by itself.
- Display themes: green, amber, white monochrome, and colorized CGA.
- Fullscreen gives the full monitor-shell experience.

## On the site

- **[Play](https://sneekie.xyz/)** - the game, including the 1988-style boot/GW-BASIC intro.
- **[Manual](https://sneekie.xyz/html/manual.html)** - controls, scoring, maze layouts, and all 32 levels.
- **[Live](https://sneekie.xyz/html/live.html)** - the real game played by a smart bot in your browser.
- **[Bot](https://sneekie.xyz/html/bot.html)** - how the live bot reads VRAM and plans moves.
- **[Magazine](https://sneekie.xyz/html/magazine.html)** - scans from the original 1988 publication.
- **[Source](https://sneekie.xyz/html/source.html)** - the recovered GW-BASIC listing.
- **[Explained](https://sneekie.xyz/html/explained.html)** - an annotated walkthrough of the source.
- **[Migration](https://sneekie.xyz/html/migration.html)** - BASIC and JavaScript shown side by side.
- **[Visualizer](https://sneekie.xyz/html/vram.html)** - an interactive look at the text-VRAM trick.

## Layout

```
docs/
  index.html          # game page shell
  html/               # the eight secondary pages
  css/                # shared site.css plus one page CSS file per page
  js/                 # shared site.js plus one page JS file per page
  images/             # logo, social images, manual GIFs, magazine scans
  SNEEKIE.BAS         # recovered 1988 GW-BASIC source; the specification
  favicon.png
  site.webmanifest
  sw.js
tools/
  make-icons.py       # regenerates icon/social PNG assets from the CP437 font
AGENTS.md             # guidance for Codex
CLAUDE.md             # guidance for Claude Code
```

The faithful game logic lives in `docs/js/index.js`. `docs/index.html` provides
the game page markup, `docs/css/index.css` styles the monitor shell, and
`docs/css/site.css` plus `docs/js/site.js` provide shared site chrome used by
all nine pages.
