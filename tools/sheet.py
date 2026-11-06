"""Put screenshots side by side, dark next to light, so a person can look at every one before a push.

    python3 tools/sheet.py              # every screenshot that differs from GitHub
    python3 tools/sheet.py prism        # every screenshot of these scripts
    python3 tools/sheet.py --all        # every screenshot of every script

Writes one sheet per script (dark on the left, light on the right, one row per capture) to a
temporary folder and prints the paths. The checks only catch the problems they were written for;
looking catches the rest (a knob out of place, a color that's off, something missing), so this is a
required step before every push that changes a panel (CLAUDE.md).
"""
import glob, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
W = 520   # width of each capture on the sheet

def changed_images():
    out = subprocess.run(['git', '-C', R, 'diff', '--name-only', 'origin/main', '--', '*/*/images/*.webp'], capture_output=True, text=True).stdout.split()
    new = subprocess.run(['git', '-C', R, 'ls-files', '--others', '--exclude-standard', '--', '*/*/images/*.webp'], capture_output=True, text=True).stdout.split()
    return sorted(set(out + new))

def sheet(folder, names, out):
    rows = []
    for n in names:
        d, l = f'{R}/{folder}/images/{n}.webp', f'{R}/{folder}/images/{n}-light.webp'
        ims = [Image.open(x).convert('RGB') for x in (d, l) if os.path.exists(x)]
        for im in ims: im.thumbnail((W, 4000))
        rows.append((n, ims))
    h = sum(max(im.height for im in ims) + 34 for _, ims in rows if ims)
    c = Image.new('RGB', (W * 2 + 30, max(h, 1)), (250, 250, 252)); dr = ImageDraw.Draw(c); y = 0
    for n, ims in rows:
        if not ims: continue
        dr.text((10, y + 8), f'{folder} / {n}   (dark | light)', fill=(40, 40, 50))
        for i, im in enumerate(ims): c.paste(im, (10 + i * (W + 10), y + 28))
        y += max(im.height for im in ims) + 34
    c.save(out)

if __name__ == '__main__':
    args = sys.argv[1:]
    folders = sorted({os.path.dirname(os.path.dirname(p)) for p in glob.glob(f'{R}/*/*/images')})
    folders = [os.path.relpath(f, R) for f in folders]
    if '--all' in args: pick = {f: None for f in folders}
    elif args: pick = {f: None for f in folders if f.split('/')[1] in args}
    else:
        pick = {}
        for p in changed_images():
            f = '/'.join(p.split('/')[:2]); n = os.path.basename(p)[:-5].removesuffix('-light')
            pick.setdefault(f, set()).add(n)
    if not pick: print('no screenshots differ from GitHub'); sys.exit()
    tmp = tempfile.mkdtemp(prefix='sheets-')
    for f, names in pick.items():
        names = sorted(names) if names else sorted({os.path.basename(p)[:-5].removesuffix('-light') for p in glob.glob(f'{R}/{f}/images/*.webp')})
        out = f"{tmp}/{f.split('/')[1]}.png"; sheet(f, names, out); print(out)
