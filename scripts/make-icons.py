#!/usr/bin/env python3
"""Generate LabNote app icons: test tube + phase-color bubbles on warm graph paper."""

from PIL import Image, ImageDraw

PAPER = (251, 250, 247, 255)      # light background
INK = (28, 27, 24, 255)           # outline
GRID = (231, 228, 219, 255)       # faint graph-paper grid
LIQUID = (42, 120, 214, 255)      # tint blue
BUBBLES = [(27, 175, 122, 255), (235, 104, 52, 255), (237, 161, 0, 255)]  # aqua/orange/yellow
WHITE = (255, 255, 255, 255)


def draw_grid(d: ImageDraw.ImageDraw, size: int, step: int) -> None:
    for x in range(0, size + 1, step):
        d.line([(x, 0), (x, size)], fill=GRID, width=4)
        d.line([(0, x), (size, x)], fill=GRID, width=4)


def draw_tube(d: ImageDraw.ImageDraw, s: float = 1.0, ox: float = 0, oy: float = 0,
              outline=INK, liquid=LIQUID, bubbles=BUBBLES, fill_tube=WHITE) -> None:
    """Test tube in a 1024-unit design space, scaled by s, offset by (ox, oy)."""
    def pt(x, y):
        return (x * s + ox, y * s + oy)

    def box(x0, y0, x1, y1):
        return [pt(x0, y0), pt(x1, y1)]

    w = max(2, int(26 * s))
    # tube body (rounded rect, big bottom radius)
    d.rounded_rectangle(box(402, 150, 622, 880), radius=110 * s, fill=fill_tube,
                        outline=outline, width=w)
    # liquid: clip to lower tube via rounded rect inset
    d.rounded_rectangle(box(402 + 26, 520, 622 - 26, 880 - 26), radius=84 * s, fill=liquid)
    # square off the liquid's top edge (cover the inset radius zone)
    d.rectangle(box(402 + 26, 520, 622 - 26, 615), fill=liquid)
    # bubbles above the liquid
    for i, color in enumerate(bubbles):
        cx, cy, r = [(468, 430, 26), (556, 350, 20), (500, 264, 14)][i]
        d.ellipse(box(cx - r, cy - r, cx + r, cy + r), fill=color)
    # rim: slight flare
    d.rounded_rectangle(box(374, 128, 650, 196), radius=34 * s, fill=fill_tube,
                        outline=outline, width=w)
    # measurement ticks
    for ty in (600, 680, 760):
        d.line([pt(576, ty), pt(622 - w, ty)], fill=outline, width=max(2, int(14 * s)))


def make(path: str, size: int, *, grid: bool, bg, tube_scale: float, mono: bool = False,
         transparent: bool = False) -> None:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0) if transparent else bg)
    d = ImageDraw.Draw(img)
    if grid:
        draw_grid(d, size, size // 8)
    s = (size / 1024) * tube_scale
    off = (size - 1024 * s) / 2
    if mono:
        draw_tube(d, s, off, off, outline=WHITE, liquid=WHITE, bubbles=[WHITE] * 3,
                  fill_tube=(255, 255, 255, 0))
    else:
        draw_tube(d, s, off, off)
    img.save(path)
    print(f"wrote {path} ({size}x{size})")


make("assets/images/icon.png", 1024, grid=True, bg=PAPER, tube_scale=0.92)
make("assets/images/splash-icon.png", 512, grid=False, bg=PAPER, tube_scale=1.0, transparent=True)
make("assets/images/android-icon-foreground.png", 1024, grid=False, bg=PAPER, tube_scale=0.62,
     transparent=True)
make("assets/images/android-icon-monochrome.png", 1024, grid=False, bg=PAPER, tube_scale=0.62,
     mono=True, transparent=True)
make("assets/images/favicon.png", 96, grid=False, bg=PAPER, tube_scale=1.0)

# android background: plain paper
bgimg = Image.new("RGBA", (1024, 1024), PAPER)
bgimg.save("assets/images/android-icon-background.png")
print("wrote assets/images/android-icon-background.png")
