#!/usr/bin/env python3
"""Generate public/og-image.png (1200x630) used for Open Graph / Twitter cards.

Usage: python3 scripts/make-og-image.py
Requires Pillow (already available in the local Python).

The logo in scripts/assets/devcpp-logo.png is a high-resolution recreation of the
48px Dev-C++ icon; overwrite it with another square PNG to change the artwork.
"""

from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "og-image.png")
LOGO = os.path.join(ROOT, "scripts", "assets", "devcpp-logo.png")
FALLBACK_LOGO = os.path.join(ROOT, "public", "devcpp", "icons", "devcpp_48.png")

W, H = 1200, 630

# Override with SITE_URL=example.com when the deployment domain changes.
SITE_URL = (
    os.environ.get("SITE_URL", "https://devc.20110815.xyz")
    .replace("https://", "")
    .replace("http://", "")
    .rstrip("/")
)


def load(paths: list[str], size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    for path in paths:
        if not os.path.exists(path):
            continue
        try:
            return ImageFont.truetype(path, size, index=index)
        except Exception:
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default(size)


FONT_LATIN_BOLD = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf"]
FONT_LATIN = ["/System/Library/Fonts/Supplemental/Arial.ttf"]
FONT_CJK = [
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
]

f_eyebrow = load(FONT_LATIN_BOLD, 15)
f_title = load(FONT_LATIN_BOLD, 92)
f_lead = load(FONT_CJK, 38)
f_sub = load(FONT_CJK, 22)
f_chip = load(FONT_CJK, 16)
f_url = load(FONT_LATIN, 17)


def gradient() -> Image.Image:
    top, bottom = (5, 14, 34), (10, 43, 86)
    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        draw.line(
            [(0, y), (W, y)],
            fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)),
        )
    return img


def add_glow(img: Image.Image) -> Image.Image:
    mask = Image.new("L", (W, H), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.ellipse([-240, -360, 700, 460], fill=95)
    mdraw.ellipse([80, 190, 700, 810], fill=90)
    mdraw.ellipse([860, 200, 1500, 800], fill=55)
    mask = mask.filter(ImageFilter.GaussianBlur(130))
    glow = Image.new("RGB", (W, H), (34, 96, 205))
    return Image.composite(glow, img, mask)


def add_grid(img: Image.Image) -> Image.Image:
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    step = 48
    for x in range(0, W, step):
        draw.line([(x, 0), (x, H)], fill=(255, 255, 255, 7))
    for y in range(0, H, step):
        draw.line([(0, y), (W, y)], fill=(255, 255, 255, 7))
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")


def load_logo(size: int) -> Image.Image:
    path = LOGO if os.path.exists(LOGO) else FALLBACK_LOGO
    logo = Image.open(path).convert("RGBA")
    resample = Image.LANCZOS if path == LOGO else Image.NEAREST
    return logo.resize((size, size), resample)


def draw_logo(base: Image.Image) -> None:
    size = 300
    x, y = 78, 150
    logo = load_logo(size)

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse(
        [x - 70, y - 70, x + size + 70, y + size + 70], fill=(46, 118, 255, 80)
    )
    base.alpha_composite(glow.filter(ImageFilter.GaussianBlur(80)))

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    silhouette = Image.new("RGBA", (size, size), (0, 0, 0, 155))
    shadow.paste(silhouette, (x + 8, y + 18), logo)
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)))

    base.alpha_composite(logo, (x, y))


def draw_copy(base: Image.Image) -> None:
    draw = ImageDraw.Draw(base)
    left = 430

    eyebrow = "DEV-C++ 5.11  ·  WEBASSEMBLY"
    ex = left
    for ch in eyebrow:
        draw.text((ex, 120), ch, font=f_eyebrow, fill=(125, 173, 255))
        ex += draw.textlength(ch, font=f_eyebrow) + 2.1

    draw.text((left - 5, 143), "Dev-C++", font=f_title, fill=(255, 255, 255))
    draw.text((left, 268), "网页版 · 在线 C++ 编译器", font=f_lead, fill=(230, 239, 255))
    draw.text(
        (left, 330),
        "写代码 · 编译 · 运行，全在浏览器里",
        font=f_sub,
        fill=(158, 184, 222),
    )

    chips = ["免费", "无需安装", "本地编译"]
    cx = left
    for label in chips:
        tw = draw.textlength(label, font=f_chip)
        draw.rounded_rectangle(
            [cx, 388, cx + tw + 34, 428],
            radius=20,
            outline=(74, 120, 190),
            width=1,
        )
        draw.text((cx + 17, 396), label, font=f_chip, fill=(172, 204, 255))
        cx += tw + 34 + 12

    draw.text((left, 548), SITE_URL, font=f_url, fill=(118, 148, 194))


def main() -> None:
    img = add_grid(add_glow(gradient()))
    rgba = img.convert("RGBA")
    draw_logo(rgba)
    draw_copy(rgba)
    rgba.convert("RGB").save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({os.path.getsize(OUT) // 1024} KiB)")


if __name__ == "__main__":
    main()
