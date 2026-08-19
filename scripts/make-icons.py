#!/usr/bin/env python3
"""Red Glass icons: tall red glass with a sipper (straw), flat bold style."""

from PIL import Image, ImageDraw

# Palette from the inspiration photo: amber glass, iced drink, brass straw.
PAPER = (247, 242, 238, 255)      # warm linen
INK = (38, 24, 19, 255)           # deep coffee outline
RED = (146, 52, 31, 255)          # amber-red liquid
RED_DEEP = (106, 35, 22, 255)     # liquid shade
STRAW = (198, 149, 61, 255)       # brass straw
STRAW_STRIPE = (240, 214, 158, 255)
GLASS = (252, 248, 244, 255)
HIGHLIGHT = (255, 255, 255, 80)
ICE = (250, 243, 235, 215)


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

    # brass straw with a bend (like the photo): angled top, straighter run below
    straw_color = ink if mono else STRAW
    straw_pts = [pt(716, 92), pt(600, 260), pt(560, 730)]
    d.line(straw_pts, fill=straw_color, width=int(46 * s), joint="curve")
    if not mono:
        d.line([pt(700, 116), pt(652, 186)], fill=STRAW_STRIPE, width=int(13 * s))

    # glass body: tall, slightly tapered
    d.polygon([pt(340, 190), pt(684, 190), pt(650, 880), pt(374, 880)], fill=glass_fill)

    # red liquid: from just below rim to bottom
    d.polygon([pt(354, 300), pt(670, 300), pt(646, 858), pt(378, 858)], fill=red)
    # deeper shade at bottom third
    d.polygon([pt(368, 660), pt(656, 660), pt(646, 858), pt(378, 858)], fill=deep)
    if not mono:
        # ice cubes floating near the surface
        d.rounded_rectangle(box(420, 330, 520, 424), radius=18 * s, fill=ICE)
        d.rounded_rectangle(box(534, 356, 616, 434), radius=16 * s, fill=ICE)
        # glass highlight stripe
        d.line([pt(410, 330), pt(424, 820)], fill=HIGHLIGHT, width=int(34 * s))

    # straw visible through the liquid (redraw the submerged run in front)
    d.line([pt(575, 302), pt(560, 730)], fill=straw_color, width=int(46 * s))

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
