"""The prism cut: one image that shows a panel in light and dark at once, for the link previews
(the one place that can't follow a light/dark switch).

    python3 tools/prismcut.py light.webp dark.webp out.png [--accent '#ff9a3d'] [--lava]

The light capture fills the upper left and the dark one the lower right, split along a diagonal.
The seam is a thin line in the script's accent color with a faint glow, kept light enough that
text under it stays readable. --lava (the Molten scripts) makes the edge wavy with a few bubbles
drifting across it, each showing the other theme, like wax in a lava lamp. Both captures must be
the same size: same panel, same demo data, only the theme differs.
"""
import sys
import numpy as np
from PIL import Image

def hex_rgb(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)

def cut(light, dark, out=None, accent='#ffffff', lava=False):
    A = np.asarray(Image.open(light).convert('RGB'), np.float32)
    B = np.asarray(Image.open(dark).convert('RGB'), np.float32)
    if A.shape != B.shape: raise ValueError(f'captures differ in size: {A.shape} vs {B.shape}')
    h, w = A.shape[:2]
    x0, y0, x1, y1 = w * 0.72, 0.0, w * 0.28, float(h)            # top edge 72% across to bottom edge 28%
    dx, dy = x1 - x0, y1 - y0; L = (dx * dx + dy * dy) ** .5
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    d = ((xs - x0) * dy - (ys - y0) * dx) / L                     # signed distance from the line (px)
    t = ((xs - x0) * dx + (ys - y0) * dy) / (L * L)               # 0 at the top of the line, 1 at the bottom
    s = w / 1000                                                  # keeps the seam's look at any width (tall heroes too)
    if lava:
        # a slow wave along the edge, and wax bubbles that merge into it (smooth minimum)
        wave = (np.sin(t * 2 * np.pi * 2.1 + .6) * 16 + np.sin(t * 2 * np.pi * 4.7 + 2) * 6) * s
        field = d - wave
        rng = np.random.default_rng(7)
        k = 14 * s
        # only near the ends of the edge, so no wax drop sits on top of the panel's text
        for tt, side in [(rng.uniform(.03, .08), 1), (rng.uniform(.1, .14), -1), (rng.uniform(.86, .9), 1), (rng.uniform(.92, .97), -1)]:
            off = rng.uniform(26, 44) * s * side; r = rng.uniform(10, 16) * s
            cx, cy = x0 + dx * tt + dy / L * off, y0 + dy * tt - dx / L * off
            blob = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) - r
            if side > 0:   # a light bubble out on the dark side: smooth union with the light region (field < 0)
                hh = np.clip(.5 + .5 * (blob - field) / k, 0, 1); field = blob * (1 - hh) + field * hh - k * hh * (1 - hh)
            else:          # a dark bubble on the light side: smooth cut out of the light region
                hh = np.clip(.5 - .5 * (-blob - field) / k, 0, 1); field = (-blob) * (1 - hh) + field * hh + k * hh * (1 - hh)
        d = field
    m = np.clip(.5 - d / (1.1 * s), 0, 1)[..., None]              # 1 = light side, soft 1px edge
    img = A * m + B * (1 - m)
    col = hex_rgb(accent)
    # a thin, faint line: text under it stays readable
    core = np.exp(-(d / (0.9 * s)) ** 2)[..., None] * .55
    glow = np.exp(-(d / (6 * s)) ** 2)[..., None] * .12
    a = np.clip(core + glow, 0, .6)
    img = img * (1 - a) + col * a
    res = Image.fromarray(img.clip(0, 255).astype(np.uint8))
    if out: res.save(out)
    return res

if __name__ == '__main__':
    args = sys.argv[1:]
    acc = args[args.index('--accent') + 1] if '--accent' in args else '#ffffff'
    pos = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or args[i - 1] != '--accent')]
    cut(pos[0], pos[1], pos[2], acc, '--lava' in args)
