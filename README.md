# Sneekie (1988)

A 32-level snake/maze game written in GW-BASIC in July 1988 by **Herbert Groot Jebbink** ("HerbySoft"),
published on the MSX/MS-DOS Computer Magazine diskette MCMPC-D2 (issue #25, October 1988).

**Play it here: https://herbert256.github.io/sneekie/**

In 2026 the game was recovered from the original 720 KB floppy disk image and ported,
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

## Files

- `index.html` — the game, one file, no dependencies
- `SNEEKIE.BAS.txt` — the original 1988 GW-BASIC source, detokenized from the floppy image
