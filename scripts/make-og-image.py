#!/usr/bin/env python3
"""Generate public/og-image.png (1200x630) used for Open Graph / Twitter cards.

Usage: python3 scripts/make-og-image.py
Requires Pillow (already available in the local Python).
"""

from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "og-image.png")
ICON = os.path.join(ROOT, "public", "devcpp", "icons", "devcpp_32.png")

W, H = 1200, 630

# Override with SITE_URL=example.com when the deployment domain changes.
SITE_URL = (
    os.environ.get("SITE_URL", "https://devcppweb.vercel.app")
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
FONT_MONO = ["/System/Library/Fonts/Menlo.ttc"]

f_eyebrow = load(FONT_LATIN_BOLD, 15)
f_title = load(FONT_LATIN_BOLD, 94)
f_cjk_title = load(FONT_CJK, 62)
f_sub = load(FONT_CJK, 25)
f_chip = load(FONT_CJK, 16)
f_url = load(FONT_LATIN, 17)

f_win_title = load(FONT_LATIN, 13)
f_menu = load(FONT_LATIN, 11)
f_code = load(FONT_MONO, 13)
f_status = load(FONT_LATIN, 11)


def gradient() -> Image.Image:
    top, bottom = (5, 15, 36), (10, 42, 84)
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
    mdraw.ellipse([-260, -360, 720, 480], fill=95)
    mdraw.ellipse([820, 180, 1480, 780], fill=60)
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


def draw_window(base: Image.Image) -> None:
    x, y, w, h = 632, 126, 502, 386
    radius = 6

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [x + 8, y + 16, x + w + 16, y + h + 24], radius=10, fill=(0, 0, 0, 150)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    base.alpha_composite(shadow)

    draw = ImageDraw.Draw(base)
    draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=(212, 208, 200))

    title_h, menu_h, status_h = 32, 25, 24

    # 标题栏：经典 Dev-C++ 蓝色渐变
    title = Image.new("RGB", (w, title_h))
    tdraw = ImageDraw.Draw(title)
    for tx in range(w):
        t = tx / (w - 1)
        tdraw.line(
            [(tx, 0), (tx, title_h)],
            fill=tuple(round(a + (b - a) * t) for a, b in zip((10, 36, 106), (166, 202, 240))),
        )
    base.paste(title, (x, y))

    if os.path.exists(ICON):
        icon = Image.open(ICON).convert("RGBA").resize((18, 18), Image.LANCZOS)
        base.paste(icon, (x + 7, y + 7), icon)
    draw.text((x + 32, y + 8), "Dev-C++ 5.11  ·  hello.cpp", font=f_win_title, fill=(255, 255, 255))

    # 右上角窗口按钮
    for i, glyph in enumerate("—□✕"):
        bx = x + w - 74 + i * 24
        draw.rectangle([bx, y + 6, bx + 18, y + 24], fill=(212, 208, 200), outline=(130, 130, 130))
        gb = draw.textbbox((0, 0), glyph, font=f_menu)
        draw.text(
            (bx + (18 - (gb[2] - gb[0])) / 2, y + 9),
            glyph,
            font=f_menu,
            fill=(20, 20, 20),
        )

    # 菜单栏
    menu_y = y + title_h
    draw.rectangle([x, menu_y, x + w, menu_y + menu_h], fill=(236, 233, 216))
    draw.line([(x, menu_y + menu_h), (x + w, menu_y + menu_h)], fill=(150, 150, 150))
    mx = x + 10
    for item in ["File", "Edit", "Search", "View", "Project", "Execute", "Tools", "Window", "Help"]:
        draw.text((mx, menu_y + 6), item, font=f_menu, fill=(30, 30, 30))
        mx += round(draw.textlength(item, font=f_menu)) + 16

    # 编辑区
    ed_y = menu_y + menu_h
    ed_h = h - title_h - menu_h - status_h
    draw.rectangle([x + 1, ed_y, x + w - 1, ed_y + ed_h], fill=(30, 30, 30))
    draw.line([(x + 42, ed_y), (x + 42, ed_y + ed_h)], fill=(60, 60, 60))

    plain, kw, fn, string = "#d4d4d4", "#569cd6", "#dcdcaa", "#ce9178"
    code = [
        [("#include ", kw), ("<iostream>", string)],
        [("using namespace ", kw), ("std", plain), (";", plain)],
        [],
        [("int ", kw), ("main", fn), ("() {", plain)],
        [("    ", plain), ("cout", fn), (" << ", plain), ('"Hello, Dev-C++!"', string), (";", plain)],
        [("    ", plain), ("return", kw), (" ", plain), ("0", "#b5cea8"), (";", plain)],
        [("}", plain)],
    ]
    line_h = 21
    for i, segments in enumerate(code):
        ly = ed_y + 12 + i * line_h
        draw.text((x + 12, ly - 1), str(i + 1), font=f_code, fill=(110, 118, 128))
        cx = x + 54
        for text, color in segments:
            draw.text((cx, ly), text, font=f_code, fill=color)
            cx += draw.textlength(text, font=f_code)

    # 状态栏
    st_y = y + h - status_h
    draw.rectangle([x + 1, st_y, x + w - 1, y + h - 1], fill=(212, 208, 200))
    draw.line([(x, st_y), (x + w, st_y)], fill=(150, 150, 150))
    draw.text((x + 10, st_y + 6), "Compiling hello.cpp ... 0 errors, 0 warnings", font=f_status, fill=(30, 30, 30))
    draw.text((x + w - 92, st_y + 6), "Ln 5, Col 31", font=f_status, fill=(30, 30, 30))

    # 外框 3D 高光
    draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, outline=(120, 120, 120))


def draw_copy(base: Image.Image) -> None:
    draw = ImageDraw.Draw(base)
    left = 74

    eyebrow = "DEV-C++ 5.11  ·  WEBASSEMBLY"
    ex = left
    for ch in eyebrow:
        draw.text((ex, 86), ch, font=f_eyebrow, fill=(125, 173, 255))
        ex += draw.textlength(ch, font=f_eyebrow) + 2.1

    draw.text((left - 4, 112), "Dev-C++", font=f_title, fill=(255, 255, 255))
    draw.text((left, 218), "网页版", font=f_cjk_title, fill=(138, 180, 255))

    draw.text((left, 312), "在线 C++ 编译器", font=f_sub, fill=(225, 235, 252))
    draw.text((left, 350), "写代码 · 编译 · 运行，全在浏览器里", font=f_sub, fill=(160, 184, 220))

    chips = ["免费", "无需安装", "本地编译"]
    cx = left
    for label in chips:
        tw = draw.textlength(label, font=f_chip)
        draw.rounded_rectangle(
            [cx, 408, cx + tw + 34, 448],
            radius=20,
            fill=(19, 52, 104, 0),
            outline=(72, 116, 184),
            width=1,
        )
        draw.text((cx + 17, 416), label, font=f_chip, fill=(170, 202, 255))
        cx += tw + 34 + 12

    draw.text((left, 540), SITE_URL, font=f_url, fill=(120, 150, 195))


def main() -> None:
    img = gradient()
    img = add_glow(img)
    img = add_grid(img)
    rgba = img.convert("RGBA")
    draw_window(rgba)
    draw_copy(rgba)
    rgba.convert("RGB").save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({os.path.getsize(OUT) // 1024} KiB)")


if __name__ == "__main__":
    main()
