#!/usr/bin/env python3
"""Generate PWA icons for Bouli."""

from PIL import Image, ImageDraw
from math import cos, sin, sqrt
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), 'icons')
os.makedirs(OUT_DIR, exist_ok=True)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vertical_gradient(size, c_top, c_bottom):
    """Create a vertical gradient image."""
    img = Image.new('RGB', (size, size), c_top)
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        c = lerp(c_top, c_bottom, t)
        for x in range(size):
            px[x, y] = c
    return img


def make_round_mask(size, radius):
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def draw_dashed_line(d, p1, p2, color, width, dash=None, gap=None):
    """Draw a dashed line by drawing many small segments."""
    x1, y1 = p1
    x2, y2 = p2
    dx = x2 - x1
    dy = y2 - y1
    length = sqrt(dx * dx + dy * dy)
    if length < 1:
        return
    ux = dx / length
    uy = dy / length
    if dash is None:
        dash = max(8, int(length / 14))
    if gap is None:
        gap = max(5, int(length / 20))
    pos = 0.0
    while pos < length:
        a_t = pos
        b_t = min(pos + dash, length)
        ax = x1 + ux * a_t
        ay = y1 + uy * a_t
        bx = x1 + ux * b_t
        by = y1 + uy * b_t
        d.line([(ax, ay), (bx, by)], fill=color, width=width)
        pos += dash + gap


def draw_icon(size, maskable=False):
    """Render the Bouli logo at a given size."""
    bg_top = (15, 23, 42)        # slate-900
    bg_bottom = (30, 64, 175)    # blue-700-ish
    boule_main = (203, 213, 225) # slate-300 (silver)
    boule_dark = (71, 85, 105)
    jack_main = (249, 115, 22)   # orange-500
    jack_light = (253, 186, 116) # orange-300
    line_color = (96, 165, 250)  # blue-400
    white = (255, 255, 255)

    base = vertical_gradient(size, bg_top, bg_bottom)

    if not maskable:
        # Apply rounded rect mask
        radius = int(size * 0.22)
        mask = make_round_mask(size, radius)
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.paste(base, (0, 0), mask)
    else:
        # Full square (OS will mask it)
        out = base.convert('RGBA')

    d = ImageDraw.Draw(out)

    # Safe zone: 80% for maskable, 88% otherwise
    safe = 0.80 if maskable else 0.88
    sz = size * safe
    cx = size / 2
    cy = size / 2

    # Boule (lower-left) and cochonnet (upper-right) positions
    boule_x = cx - sz * 0.22
    boule_y = cy + sz * 0.18
    boule_r = sz * 0.20

    jack_x = cx + sz * 0.22
    jack_y = cy - sz * 0.20
    jack_r = sz * 0.10

    # Dashed measurement line between centers
    line_w = max(3, int(size * 0.022))
    draw_dashed_line(d, (boule_x, boule_y), (jack_x, jack_y), line_color, line_w)

    # Outline width scales with size
    outline_w = max(2, int(size * 0.018))

    # Boule body
    d.ellipse(
        (boule_x - boule_r, boule_y - boule_r, boule_x + boule_r, boule_y + boule_r),
        fill=boule_main, outline=white, width=outline_w,
    )
    # Boule shadow at bottom-right
    sh_offset = boule_r * 0.45
    sh_r = boule_r * 0.55
    d.pieslice(
        (boule_x - sh_r + sh_offset, boule_y - sh_r + sh_offset,
         boule_x + sh_r + sh_offset, boule_y + sh_r + sh_offset),
        0, 360, fill=boule_dark + (100,) if False else boule_dark,
    )
    # Re-draw boule body to clip the shadow into the circle
    # (simple approach: redraw with transparency overlay using mask)
    overlay = Image.new('RGBA', out.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse(
        (boule_x - boule_r, boule_y - boule_r, boule_x + boule_r, boule_y + boule_r),
        fill=boule_main + (255,),
    )
    # Shadow inside
    od.ellipse(
        (boule_x - boule_r * 0.55 + boule_r * 0.45,
         boule_y - boule_r * 0.55 + boule_r * 0.45,
         boule_x + boule_r * 0.55 + boule_r * 0.45,
         boule_y + boule_r * 0.55 + boule_r * 0.45),
        fill=boule_dark + (110,),
    )
    # Mask to circle
    boule_mask = Image.new('L', out.size, 0)
    bm = ImageDraw.Draw(boule_mask)
    bm.ellipse(
        (boule_x - boule_r, boule_y - boule_r, boule_x + boule_r, boule_y + boule_r),
        fill=255,
    )
    out.paste(overlay, (0, 0), boule_mask)
    # Outline (re-draw)
    d = ImageDraw.Draw(out)
    d.ellipse(
        (boule_x - boule_r, boule_y - boule_r, boule_x + boule_r, boule_y + boule_r),
        outline=white, width=outline_w,
    )
    # Highlight on boule
    h_r = boule_r * 0.28
    h_x = boule_x - boule_r * 0.38
    h_y = boule_y - boule_r * 0.38
    d.ellipse(
        (h_x - h_r, h_y - h_r, h_x + h_r, h_y + h_r),
        fill=(241, 245, 249),
    )

    # Cochonnet
    d.ellipse(
        (jack_x - jack_r, jack_y - jack_r, jack_x + jack_r, jack_y + jack_r),
        fill=jack_main, outline=white, width=outline_w,
    )
    # Cochonnet highlight
    jh_r = jack_r * 0.32
    jh_x = jack_x - jack_r * 0.35
    jh_y = jack_y - jack_r * 0.35
    d.ellipse(
        (jh_x - jh_r, jh_y - jh_r, jh_x + jh_r, jh_y + jh_r),
        fill=jack_light,
    )

    return out


def main():
    targets = [
        (192, 'icon-192.png', False),
        (512, 'icon-512.png', False),
        (180, 'apple-touch-icon.png', False),
        (192, 'icon-192-maskable.png', True),
        (512, 'icon-512-maskable.png', True),
        (32, 'favicon-32.png', False),
        (16, 'favicon-16.png', False),
    ]
    for size, fname, maskable in targets:
        img = draw_icon(size, maskable=maskable)
        img.save(os.path.join(OUT_DIR, fname), optimize=True)
        print(f'  {fname}  ({size}x{size}{" maskable" if maskable else ""})')

    # Also save a high-res master for marketing/screenshots
    img = draw_icon(1024, maskable=False)
    img.save(os.path.join(OUT_DIR, 'icon-1024.png'), optimize=True)
    print('  icon-1024.png  (1024x1024)')


if __name__ == '__main__':
    main()
