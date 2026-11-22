"""Draws the site's app icon (what a browser shows when Glassware's site is installed as an app): the lava orb from the
site's top bar, glossy, on a smoked-glass tile. Writes assets/app/: icon-192.png and icon-512.png (rounded tile,
clear corners), maskable-512.png (full square, the orb inside the safe zone, for phones that cut their own shape) and
apple-touch-icon.png (180px, full square: iOS rounds it itself). pages.py copies them into docs/img/app/.
    python3 tools/build/app_icon.py"""
import os
import numpy as np
from PIL import Image, ImageFilter

R = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = f'{R}/assets/app'
S = 1024                                  # drawn large, then scaled down
STOPS = [(0.0, (255, 138, 61)), (0.55, (255, 45, 111)), (1.0, (122, 44, 255))]   # the top bar's orb


def ramp(t):
    t = np.clip(t, 0, 1); out = np.zeros(t.shape + (3,), np.float32)
    for (a, ca), (b, cb) in zip(STOPS, STOPS[1:]):
        k = np.clip((t - a) / (b - a), 0, 1)[..., None]; m = ((t >= a) & (t <= b))[..., None]
        out = np.where(m, np.array(ca) * (1 - k) + np.array(cb) * k, out)
    return out / 255


def blur(a, r):
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)); return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255


def draw(orb_r=0.30):
    y, x = (np.mgrid[0:S, 0:S] + 0.5) / S
    # smoked glass: deep plum, lighter toward the top left, a warm glow from the orb
    bg = np.stack([0.07 + 0.08 * (1 - y), 0.045 + 0.03 * (1 - y), 0.10 + 0.08 * (1 - x)], -1)
    d = np.hypot(x - 0.5, y - 0.5)
    glow = np.exp(-(d / 0.36) ** 2)[..., None] * np.array([1.0, 0.25, 0.45]) * 0.30
    corner = np.exp(-((x - 0.0) ** 2 + (y - 0.0) ** 2) / 0.10)[..., None] * np.array([1.0, 0.55, 0.25]) * 0.10
    img = bg + glow + corner
    # the orb: the gradient along the diagonal, shaded like a glossy sphere
    disc = np.clip((orb_r - d) * S / 1.5, 0, 1)
    base = ramp(((x - 0.5) + (y - 0.5)) / (4 * orb_r) + 0.5)
    nz = np.sqrt(np.clip(1 - (d / orb_r) ** 2, 0, 1))
    lx, ly = (x - 0.5) / orb_r, (y - 0.5) / orb_r
    lit = np.clip(-0.45 * lx - 0.55 * ly + 0.70 * nz, 0, 1)
    sphere = base * (0.55 + 0.6 * lit[..., None])
    rim = np.clip(1 - nz, 0, 1) ** 3 * 0.35
    sphere = sphere + rim[..., None] * np.array([1.0, 0.75, 0.9])
    img = img * (1 - disc[..., None]) + sphere * disc[..., None]
    # a soft highlight on the glass, upper left
    hx, hy = (x - (0.5 - orb_r * 0.36)) / (orb_r * 0.46), (y - (0.5 - orb_r * 0.46)) / (orb_r * 0.28)
    hl = blur(np.clip(1 - (hx ** 2 + hy ** 2), 0, 1) ** 0.6 * disc, S * 0.012) * 0.62
    img = img + hl[..., None]
    # a faint bloom around the orb
    img = img + blur(disc, S * 0.05)[..., None] * np.array([1.0, 0.3, 0.55]) * 0.22 * (1 - disc[..., None])
    return np.clip(img, 0, 1)


def tile(rgb, radius=0.225):
    """The rounded tile with clear corners and a thin bright edge on top, like the scripts' own icons."""
    y, x = (np.mgrid[0:S, 0:S] + 0.5) / S
    r = radius; qx, qy = np.maximum(np.abs(x - 0.5) - (0.5 - r), 0), np.maximum(np.abs(y - 0.5) - (0.5 - r), 0)
    sd = np.hypot(qx, qy) - r + np.minimum(np.maximum(np.abs(x - 0.5) - (0.5 - r), np.abs(y - 0.5) - (0.5 - r)), 0)
    a = np.clip(-sd * S / 1.5 + 0.5, 0, 1)
    edge = np.clip(1 - np.abs(sd * S + 3) / 3, 0, 1) * np.clip(1.2 - y * 1.6, 0, 1) * 0.35
    rgb = np.clip(rgb + edge[..., None], 0, 1)
    return np.dstack([rgb, a])


def save(arr, size, name):
    mode = 'RGBA' if arr.shape[2] == 4 else 'RGB'
    Image.fromarray((arr * 255 + 0.5).astype(np.uint8), mode).resize((size, size), Image.LANCZOS).save(f'{OUT}/{name}', optimize=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    t = tile(draw())
    save(t, 512, 'icon-512.png'); save(t, 192, 'icon-192.png')
    full = draw(0.27)                       # maskable: the orb well inside the middle 80%
    save(full, 512, 'maskable-512.png'); save(full, 180, 'apple-touch-icon.png')
    print('drew', ', '.join(sorted(os.listdir(OUT))))
