#!/usr/bin/env python3
"""Generate the PokeRouter iOS app icon.

Produces a single 1024x1024 opaque PNG for the modern single-size iOS app
icon slot. The artwork is original and trademark-safe: a winding multi-stop
route ending in a map pin — it evokes "find the stops along your way" without
using any Pokemon trademarks (no Poke Ball, logos, or characters). The palette
is derived from the app's AccentColor (warm orange).

Rendered at 3x supersample and downsampled with LANCZOS for crisp edges, then
flattened to RGB (no alpha) so Apple's icon validation accepts it.

Usage:
    python3 ios/Tools/make_app_icon.py

Requires Pillow (PIL).
"""

from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024          # final icon size
SS = 3               # supersample factor
W = SIZE * SS        # working canvas size

# Palette (AccentColor is sRGB r=0.900 g=0.500 b=0.250 -> ~ (230,128,64)).
BG_TOP = (250, 174, 84)    # light warm orange
BG_BOT = (206, 76, 50)     # deep terracotta
ROUTE = (255, 251, 242)    # warm cream
ACCENT = (230, 128, 64)    # brand accent

ICON_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "PokeRouter",
    "Resources",
    "Assets.xcassets",
    "AppIcon.appiconset",
    "AppIcon-1024.png",
)


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw_gradient(draw: ImageDraw.ImageDraw) -> None:
    """Top-to-bottom warm gradient background (opaque, full bleed)."""
    for y in range(W):
        draw.line([(0, y), (W, y)], fill=lerp(BG_TOP, BG_BOT, y / (W - 1)))


def route_points() -> list[tuple[float, float]]:
    """Sample a smooth S-shaped route from lower-left to upper-right."""
    ax, ay = 238 * SS, 792 * SS
    bx, by = 790 * SS, 308 * SS
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy)
    px, py = -dy / length, dx / length  # unit perpendicular
    amp = 98 * SS
    n = 240
    pts: list[tuple[float, float]] = []
    for i in range(n + 1):
        t = i / n
        base_x = ax + dx * t
        base_y = ay + dy * t
        off = amp * math.sin(2 * math.pi * t)  # one full wave -> gentle S
        pts.append((base_x + px * off, base_y + py * off))
    return pts


def point_at(pts: list[tuple[float, float]], t: float) -> tuple[float, float]:
    idx = max(0, min(len(pts) - 1, round(t * (len(pts) - 1))))
    return pts[idx]


def stroke(img: Image.Image, pts, width: int, color, blur: int = 0, dx: int = 0, dy: int = 0) -> None:
    """Draw a clean, seam-free thick stroke by stamping overlapping discs.

    PIL's ``line(joint="curve")`` leaves hatching artifacts on a dense, thick
    polyline; stamping opaque discs along the path avoids that entirely and
    gives round caps for free.
    """
    layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r = width / 2
    for x, y in pts:
        x += dx
        y += dy
        d.ellipse([x - r, y - r, x + r, y + r], fill=color)
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    img.alpha_composite(layer)


def draw_node(d: ImageDraw.ImageDraw, x: float, y: float, r: float) -> None:
    """A waypoint dot: cream disc, accent ring, cream center."""
    d.ellipse([x - r, y - r, x + r, y + r], fill=ROUTE + (255,))
    r2 = r * 0.64
    d.ellipse([x - r2, y - r2, x + r2, y + r2], fill=ACCENT + (255,))
    r3 = r * 0.28
    d.ellipse([x - r3, y - r3, x + r3, y + r3], fill=ROUTE + (255,))


def draw_pin(img: Image.Image, tip_x: float, tip_y: float) -> None:
    """A destination map pin (teardrop) with its tip on the route end."""
    layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    head_r = 86 * SS
    cx = tip_x
    cy = tip_y - head_r * 2.05
    ang = math.radians(36)
    lx = cx - head_r * math.sin(ang)
    ly = cy + head_r * math.cos(ang)
    rx = cx + head_r * math.sin(ang)
    ry = cy + head_r * math.cos(ang)
    d.polygon([(lx, ly), (rx, ry), (tip_x, tip_y)], fill=ROUTE + (255,))
    d.ellipse([cx - head_r, cy - head_r, cx + head_r, cy + head_r], fill=ROUTE + (255,))
    ir = head_r * 0.5
    d.ellipse([cx - ir, cy - ir, cx + ir, cy + ir], fill=ACCENT + (255,))
    img.alpha_composite(layer)


def main() -> None:
    img = Image.new("RGBA", (W, W), (0, 0, 0, 255))
    draw_gradient(ImageDraw.Draw(img))

    pts = route_points()
    route_w = 80 * SS
    stroke(img, pts, route_w, (110, 28, 14, 150), blur=10 * SS, dx=6 * SS, dy=12 * SS)  # shadow
    stroke(img, pts, route_w, ROUTE + (255,))  # route

    d = ImageDraw.Draw(img)
    sx, sy = pts[0]
    draw_node(d, sx, sy, 50 * SS)             # start
    for t in (0.34, 0.66):                     # intermediate stops
        x, y = point_at(pts, t)
        draw_node(d, x, y, 46 * SS)
    ex, ey = pts[-1]
    draw_pin(img, ex, ey)                       # destination

    out = img.convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)
    out.save(os.path.normpath(ICON_PATH), "PNG")
    print(f"wrote {os.path.normpath(ICON_PATH)} ({out.size[0]}x{out.size[1]}, mode={out.mode})")


if __name__ == "__main__":
    main()
