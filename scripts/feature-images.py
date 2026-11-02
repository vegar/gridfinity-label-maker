"""Crop and compress the screenshots from feature-shots.cjs into public/features/*.webp."""
import sys
from pathlib import Path
from PIL import Image, ImageChops

SRC = Path("feature-shots")
OUT = Path("public/features")
OUT.mkdir(parents=True, exist_ok=True)

# 3D views: crop to the labels, leaving out the controls along the bottom.
CANVAS = {"holders", "segments", "stacked", "colours", "symbols", "print-bed", "print-bed-p1s"}
# The labels with the view's controls stacked below them.
STACK = {"preview"}
# Only the top of a tall screenshot, in pixels.
TOP = {"colour-props": 290}
MAX_WIDTH = 1100
# Screenshots with small print keep their full 2× size.
FULL_SIZE = {"clone-dialog"}


def content_box(img, bottom_cut=0, pad=24):
    rgb = img.convert("RGB")
    bg = Image.new("RGB", rgb.size, rgb.getpixel((4, 4)))
    diff = ImageChops.difference(rgb, bg).convert("L").point(lambda v: 255 if v > 12 else 0)
    if bottom_cut:
        diff.paste(0, (0, rgb.height - bottom_cut, rgb.width, rgb.height))
    l, t, r, b = diff.getbbox()
    return max(0, l - pad), max(0, t - pad), min(rgb.width, r + pad), min(rgb.height, b + pad)


for png in sorted(SRC.glob("*.png")):
    img = Image.open(png)
    if png.stem in CANVAS:
        img = img.crop(content_box(img, bottom_cut=200, pad=40))
    elif png.stem in STACK:
        labels = img.crop(content_box(img, bottom_cut=200, pad=40))
        bottom = img.crop((0, img.height - 200, img.width, img.height))
        controls = bottom.crop(content_box(bottom, pad=24))
        stacked = Image.new("RGB", (max(labels.width, controls.width), labels.height + controls.height), img.getpixel((4, 4)))
        stacked.paste(labels, ((stacked.width - labels.width) // 2, 0))
        stacked.paste(controls, ((stacked.width - controls.width) // 2, labels.height))
        img = stacked
    elif png.stem in TOP:
        img = img.crop((0, 0, img.width, TOP[png.stem]))
    if img.width > MAX_WIDTH and png.stem not in FULL_SIZE:
        img = img.resize((MAX_WIDTH, round(img.height * MAX_WIDTH / img.width)), Image.LANCZOS)
    out = OUT / f"{png.stem}.webp"
    img.convert("RGB").save(out, "WEBP", quality=80, method=6)
    print(f"{out}  {img.width}×{img.height}  {out.stat().st_size // 1024} KB")
