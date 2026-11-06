"""Put screenshots side by side, dark next to light, so a person can look at every one before a push.

    python3 tools/sheet.py              # every screenshot that differs from GitHub
    python3 tools/sheet.py prism        # every screenshot of these scripts
    python3 tools/sheet.py --all        # every screenshot of every script

Writes one page per capture (dark on the left, light on the right) to a temporary folder and
prints the paths. Tall captures are cut into parts, so every page can be looked at full size:
look at every page it prints. The checks only catch the problems they were written for;
looking catches the rest (a knob out of place, a color that's off, something missing), so this is a
required step before every push that changes a panel (CLAUDE.md).
"""
import glob, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
W = 700      # width of each capture on a page
PAGE = 1600  # tallest slice of a capture on one page: small enough that a viewer shows it at full size

def changed_images():
    out = subprocess.run(['git', '-C', R, 'diff', '--name-only', 'origin/main', '--', '*/*/images/*.webp'], capture_output=True, text=True).stdout.split()
    new = subprocess.run(['git', '-C', R, 'ls-files', '--others', '--exclude-standard', '--', '*/*/images/*.webp'], capture_output=True, text=True).stdout.split()
    return sorted(set(out + new))

def pages(folder, names, tmp):
    """One page per capture, dark next to light; a tall capture (a whole dashboard) is cut into
    slices of PAGE height, so no page ever has to shrink to a thumbnail to fit."""
    out = []
    for n in names:
        d, l = f'{R}/{folder}/images/{n}.webp', f'{R}/{folder}/images/{n}-light.webp'
        ims = [Image.open(x).convert('RGB') for x in (d, l) if os.path.exists(x)]
        if not ims: continue
        ims = [im.resize((W, round(im.height * W / im.width)), Image.LANCZOS) if im.width > W else im for im in ims]
        H = max(im.height for im in ims); k = (H + PAGE - 1) // PAGE
        for i in range(k):
            top, bot = i * PAGE, min(H, (i + 1) * PAGE)
            c = Image.new('RGB', (W * 2 + 30, bot - top + 34), (250, 250, 252)); dr = ImageDraw.Draw(c)
            dr.text((10, 8), f'{folder} / {n}   (dark | light)' + (f'   part {i + 1} of {k}' if k > 1 else ''), fill=(40, 40, 50))
            for j, im in enumerate(ims):
                if top < im.height: c.paste(im.crop((0, top, im.width, min(im.height, bot))), (10 + j * (W + 10), 28))
            f = f"{tmp}/{folder.split('/')[1]}-{n}" + (f'-{i + 1}' if k > 1 else '') + '.png'; c.save(f); out.append(f)
    return out

if __name__ == '__main__':
    args = sys.argv[1:]
    folders = sorted({os.path.dirname(p) for p in glob.glob(f'{R}/*/*/images')})
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
        for page in pages(f, names, tmp): print(page)
