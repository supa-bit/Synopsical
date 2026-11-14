#!/usr/bin/env python3
"""One-off local tool -- NOT part of the site's runtime or its "no
dependencies" pledge (see README). Run once by hand whenever the source
logo changes; needs Pillow (`pip install --user Pillow`), which nothing
else in the project needs or assumes.

Takes "icons/favicon-source.png" (the square icon artwork) and produces every favicon
asset the HTML <link> tags reference: a multi-resolution favicon.ico,
PNG favicons at the standard sizes, and the apple-touch-icon iOS looks
for by convention.
"""

import base64
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "icons" / "favicon-source.png"
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

print("Generating adaptive SVG favicon:")
# Embed the raster alpha mask so an SVG loaded as a browser icon has no
# external dependencies. Theme colors change without altering the artwork.
mark = base64.b64encode((ICONS / "favicon-192.png").read_bytes()).decode("ascii")
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <style>
    .tile {{ fill: none; }}
    .mark {{ fill: #0a29fa; }}
    @media (prefers-color-scheme: dark) {{
      .tile {{ fill: #111111; }}
      .mark {{ fill: #ffffff; }}
    }}
  </style>
  <defs>
    <mask id="mark" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64" style="mask-type: alpha">
      <image x="4" y="4" width="56" height="56" href="data:image/png;base64,{mark}"/>
    </mask>
  </defs>
  <rect class="tile" width="64" height="64" rx="12"/>
  <rect class="mark" width="64" height="64" mask="url(#mark)"/>
</svg>
'''
(ICONS / "favicon.svg").write_text(svg)
print("  icons/favicon.svg (blue in light mode; white on a dark tile in dark mode)")

print("Done.")
