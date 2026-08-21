#!/usr/bin/env python3
"""One-off local tool -- NOT part of the site's runtime or its "no
dependencies" pledge (see README). Run once by hand whenever the source
logo changes; needs Pillow (`pip install --user Pillow`), which nothing
else in the project needs or assumes.

Takes "Logo 1.1.png" (the source artwork) and produces every favicon
asset the HTML <link> tags reference: a multi-resolution favicon.ico,
PNG favicons at the standard sizes, and the apple-touch-icon iOS looks
for by convention.
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "Logo 1.1.png"
ICONS = ROOT / "icons"
ICONS.mkdir(exist_ok=True)

src = Image.open(SRC).convert("RGBA")

def save_png(size, path):
    img = src.resize((size, size), Image.LANCZOS)
    img.save(path)
    print(f"  {path.relative_to(ROOT)}  ({size}x{size})")

print("Generating favicon PNGs:")
save_png(16, ICONS / "favicon-16.png")
save_png(32, ICONS / "favicon-32.png")
save_png(192, ICONS / "favicon-192.png")
save_png(512, ICONS / "favicon-512.png")
save_png(180, ROOT / "apple-touch-icon.png")  # root path is what iOS looks for by default

print("Generating favicon.ico (16/32/48 bundled together):")
src.save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print(f"  {(ROOT / 'favicon.ico').relative_to(ROOT)}")

print("Done.")
