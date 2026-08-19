#!/usr/bin/env python3
"""Red Glass icons: tall red glass with a sipper (straw), flat bold style."""

from PIL import Image, ImageDraw

PAPER = (251, 247, 245, 255)      # warm paper
INK = (30, 24, 24, 255)           # outline ink
RED = (200, 53, 59, 255)          # glass red
RED_DEEP = (166, 38, 44, 255)     # liquid shade
STRAW = (30, 24, 24, 255)
STRAW_STRIPE = (255, 255, 255, 255)
GLASS = (255, 255, 255, 255)
HIGHLIGHT = (255, 255, 255, 90)


def draw_glass(d: ImageDraw.ImageDraw, s: float = 1.0, ox: float = 0, oy: float = 0,
               mono=None) -> None:
    """Tall glass + straw in 1024-unit space scaled by s offset (ox, oy)."""
    def pt(x, y):
        return (x * s + ox, y * s + oy)

    def box(x0, y0, x1, y1):
        return [pt(x0, y0), pt(x1, y1)]

    ink = mono or INK
    red = mono or RED
    deep = mono or RED_DEEP
    glass_fill = (255, 255, 255, 0) if mono else GLASS
    w = max(2, int(26 * s))

    # straw: one continuous line from top-right down into the glass
    straw_top = (704, 84)
    straw_bottom = (556, 730)
    straw_color = ink if mono else STRAW
    d.line([pt(*straw_top), pt(*straw_bottom)], fill=straw_color, width=int(46 * s))
    if not mono:
        d.line([pt(690, 112), pt(666, 216)], fill=STRAW_STRIPE, width=int(14 * s))

    # glass body: tall, slightly tapered
    d.polygon([pt(340, 190), pt(684, 190), pt(650, 880), pt(374, 880)], fill=glass_fill)

    # red liquid: from just below rim to bottom
    d.polygon([pt(354, 300), pt(670, 300), pt(646, 858), pt(378, 858)], fill=red)
    # deeper shade at bottom third
    d.polygon([pt(368, 660), pt(656, 660), pt(646, 858), pt(378, 858)], fill=deep)
    if not mono:
        # glass highlight stripe
        d.line([pt(410, 330), pt(424, 820)], fill=HIGHLIGHT, width=int(34 * s))

    # straw visible through the liquid (redraw the submerged run in front)
    d.line([pt(608, 300), pt(*straw_bottom)], fill=straw_color, width=int(46 * s))

    # glass outline: rounded joints, drawn last so the rim overlaps the straw
    d.line(
        [pt(340, 190), pt(374, 880), pt(650, 880), pt(684, 190), pt(340, 190)],
        fill=ink, width=w, joint="curve",
    )


def make(path: str, size: int, *, bg, scale: float, mono: bool = False,
         transparent: bool = False) -> None:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0) if transparent else bg)
    d = ImageDraw.Draw(img)
    s = (size / 1024) * scale
    off = (size - 1024 * s) / 2
    draw_glass(d, s, off, off, mono=(255, 255, 255, 255) if mono else None)
    img.save(path)
    print(f"wrote {path}")


make("assets/images/icon.png", 1024, bg=PAPER, scale=0.94)
make("assets/images/splash-icon.png", 512, bg=PAPER, scale=1.0, transparent=True)
make("assets/images/android-icon-foreground.png", 1024, bg=PAPER, scale=0.6, transparent=True)
make("assets/images/android-icon-monochrome.png", 1024, bg=PAPER, scale=0.6, mono=True,
     transparent=True)
make("assets/images/favicon.png", 96, bg=PAPER, scale=1.0)

bgimg = Image.new("RGBA", (1024, 1024), PAPER)
bgimg.save("assets/images/android-icon-background.png")
print("wrote assets/images/android-icon-background.png")
