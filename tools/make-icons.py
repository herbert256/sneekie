#!/usr/bin/env python3
"""
Generate Sneekie's favicon, apple-touch-icon and social (og:image),
drawn with the game's own embedded IBM VGA 8x16 CP437 ROM font so they
match the on-page "♥ SNEEKIE ♥" title.

No third-party deps: the PNGs are written with a tiny hand-rolled encoder.
The font is read straight out of docs/index.html, so this stays in sync
with the game. Run from the repo root:

    python3 tools/make-icons.py
"""
import base64, re, struct, zlib, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

# ---- pull the CP437 font out of the game (the atob('...') for const FONT) ----
html = (DOCS / "index.html").read_text(encoding="utf-8")
m = re.search(r"const FONT = Uint8Array\.from\(atob\('([A-Za-z0-9+/=]+)'\)", html)
FONT = base64.b64decode(m.group(1))            # 4096 bytes = 256 glyphs x 16 rows

HEART = 3          # CP437 ♥
BLOCK = 219        # CP437 █  (snake head)
# snake-body box pieces
BAR_H, BAR_V = 205, 186
CORNER_NE = 187    # ╗

# ---- a minimal truecolor PNG encoder (RGB, 8-bit) ----
def write_png(path, w, h, rgb):
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    raw = bytearray()
    for y in range(h):
        raw.append(0)                          # filter: none
        raw += rgb[y * w * 3:(y + 1) * w * 3]
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)

class Canvas:
    def __init__(self, w, h, bg=(0, 0, 0)):
        self.w, self.h = w, h
        self.buf = bytearray(bg * (w * h))
    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            i = (y * self.w + x) * 3
            self.buf[i:i + 3] = bytes(c)
    def glyph(self, gx, gy, code, scale, color):
        for row in range(16):
            bits = FONT[code * 16 + row]
            for col in range(8):
                if bits & (0x80 >> col):
                    for sy in range(scale):
                        for sx in range(scale):
                            self.px(gx + col * scale + sx, gy + row * scale + sy, color)
    def text(self, x, y, s, scale, color, hearts=None):
        cx = x
        for ch in s:
            code = HEART if ch == "♥" else ord(ch)
            self.glyph(cx, y, code, scale, hearts if (ch == "♥" and hearts) else color)
            cx += 8 * scale
    def text_w(self, s, scale):
        return len(s) * 8 * scale
    def scanlines(self, drop=0.16):
        for y in range(0, self.h, 2):
            for x in range(self.w):
                i = (y * self.w + x) * 3
                for k in range(3):
                    self.buf[i + k] = int(self.buf[i + k] * (1 - drop))
    def save(self, name):
        write_png(DOCS / name, self.w, self.h, bytes(self.buf))
        print("wrote", name, f"{self.w}x{self.h}")

GREEN = (125, 255, 125)
RED   = (255, 94, 94)
DIMG  = (108, 150, 116)
GREY  = (110, 118, 122)
BG    = (8, 13, 11)

def icon(size):
    """The game's own 'S' in phosphor green, with a red ♥ tucked in the corner."""
    c = Canvas(size, size, BG)
    ss = 2 if size <= 40 else max(2, round(size * 0.50 / 16))   # 'S' scale
    hs = 1 if size <= 40 else max(1, round(size * 0.26 / 16))   # heart scale
    sw, sh = 8 * ss, 16 * ss
    hw, hh = 8 * hs, 16 * hs
    pad = max(1, size // 16)
    c.glyph((size - sw) // 2 - (hw // 3), (size - sh) // 2, ord("S"), ss, GREEN)
    c.glyph(size - hw - pad, size - hh - pad, HEART, hs, RED)
    return c

# favicon + apple-touch share the snake mark
icon(32).save("favicon.png")
icon(180).save("apple-touch-icon.png")

# ---- social card 1200x630 ----
og = Canvas(1200, 630, BG)
# faint top-down darkening so the title sits in light
for y in range(og.h):
    f = 1.0 - 0.10 * (y / og.h)
    for x in range(og.w):
        i = (y * og.w + x) * 3
        for k in range(3):
            og.buf[i + k] = int(og.buf[i + k] * f)
title = "♥ SNEEKIE ♥"
ts = 11
og.text((og.w - og.text_w(title, ts)) // 2, 196, title, ts, GREEN, hearts=RED)
sub = "a snake & maze game from 1988"
ss = 4
og.text((og.w - og.text_w(sub, ss)) // 2, 392, sub, ss, DIMG)
url = "herbert256.github.io/sneekie"
us = 3
og.text((og.w - og.text_w(url, us)) // 2, 470, url, us, GREY)
og.scanlines()
og.save("og.png")

print("done")
