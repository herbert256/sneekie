# Sneekie (1988)

A 32-level snake/maze game written in GW-BASIC in July 1988 by **HerbySoft**,
published in MS(X)DOS Computer Magazine, issue #25 (October 1988).

**Play it here: https://herbert256.github.io/sneekie/**

In 2026 the game's printed listing was recovered by OCR and ported,
line for line, to a single self-contained HTML page — same game logic, same direct
video-memory model (the original POKEd characters straight into text VRAM at
`&HB000`/`&HB800`), rendered with the real IBM VGA 8×16 CP437 ROM font.

## Controls

- **Arrow keys** steer the snake (swipe on touch devices)
- ♥ = +10 points · ♣ = +25 points · ☺ = −50 points · ◙ = pushable stone
- **ESC** = give up when stuck (costs a life)
- Levels 1–8 are turn-based; from level 9 the snake moves by itself, faster and faster
- Display themes: green/amber/white monochrome, or the colorized CGA mode
- Fullscreen button for the full 1988-monitor experience

## Layout

The published website lives in [`docs/`](docs/) — GitHub Pages serves it at the link above.
The rest of the repository is the source and provenance behind it.

```
docs/                 ← the live site (GitHub Pages source)
  index.html          ← the game, one file, no dependencies
  source.html         ← the original source, syntax-highlighted (a pretty-printed listing)
  SNEEKIE.BAS         ← the OCR'd GW-BASIC source — the spec (downloadable from the listing)
CLAUDE.md             ← notes for working in this repo
```

The game's source was recovered by OCR from the magazine's printed listing into
`docs/SNEEKIE.BAS`, then ported line for line into `docs/index.html`.
