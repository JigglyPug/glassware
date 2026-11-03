"""Recapture every panel screenshot from the current scripts and install them as images.

    python3 tools/screens.py            # all scripts
    python3 tools/screens.py prism      # just one (folder name)

Each panel is opened in a stubbed page by shot.js, captured at full height, cropped to
the panel, saved as WebP in <platform>/<script>/images/, and the landing-page card is
cut from the top of the lead image. Hourglass's phone-*.webp shots (block screen,
late-night nudge, phone dashboard/schedule) are captured by hand and are not touched.
Run tools/pages.py afterwards to copy the images into the site.
"""
import os, subprocess, sys, tempfile
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
CLOCK = '2026-11-03T20:40:00-05:00'   # evening: outside Hourglass's demo lockdown, so every tab is open
ANI = 'https://anilist.co/user/JigglyPug/animelist'

# folder: (url, menu command prefix, extra flags, [tabs]); lead image is the first capture
JOBS = {
    'desktop/prism':          ('https://example.com/', 'Prism', [], []),
    'desktop/hourglass':      ('https://www.youtube.com/', 'Open', ['--seed', f'{HERE}/seeds/hourglass.json'], ['Schedule', 'Sites', 'Settings']),
    'desktop/looking-glass':  ('https://example.com/', 'Open Looking', ['--video'], []),
    'desktop/molten-tools':   ('https://www.youtube.com/', 'Open Molten', [], ['General', 'Account', 'Quality']),
    'desktop/molten-for-reddit': ('https://www.reddit.com/', 'Open Molten', [], ['General', 'Video', 'Reddit', 'Search']),
    'desktop/kaleidoscope':   (ANI, 'Open Kaleidoscope', [], ['Sequels', 'Settings']),
    'mobile/kaleidoscope-mobile': (ANI, 'Open Kaleidoscope', ['--mobile'], ['Sequels', 'Settings']),
    'mobile/molten-for-reddit-mobile': ('https://www.reddit.com/', 'Open Molten', ['--mobile'], ['General', 'Video', 'Reddit', 'Search']),
}
# the Molten panels open on their Lava tab, so the first capture is saved as lava.webp
FIRST = {'desktop/molten-tools': 'lava', 'desktop/molten-for-reddit': 'lava', 'mobile/molten-for-reddit-mobile': 'lava'}

def webp(src, dst):
    im = Image.open(src).convert('RGB')
    if im.width > 1400: im = im.resize((1400, round(im.height * 1400 / im.width)), Image.LANCZOS)
    im.save(dst, 'WEBP', quality=90, method=6)

def run(p):
    url, cmd, extra, tabs = JOBS[p]; slug = p.split('/')[1]; mobile = '--mobile' in extra
    tmp = tempfile.mkdtemp(); out = f'{tmp}/{slug}.png'
    args = ['node', f'{HERE}/shot.js', f'{R}/{p}/{slug}.user.js', url, out, '--cmd', cmd, '--crop', '--clock', CLOCK,
            '--vh', '2600' if mobile else '3000'] + extra + (['--tabs', ','.join(tabs)] if tabs else [])
    subprocess.run(args, check=True, capture_output=True)
    imgs = f'{R}/{p}/images'; os.makedirs(imgs, exist_ok=True)
    lead = FIRST.get(p, 'main')
    webp(out, f'{imgs}/{lead}.webp')
    for t in tabs:
        webp(f'{tmp}/{slug}-{t.lower()}.png', f'{imgs}/{t.lower()}.webp')
    im = Image.open(f'{imgs}/{lead}.webp').convert('RGB'); w, h = im.size; ch = min(h, int(w * 0.8))
    im.crop((0, 0, w, ch)).resize((800, round(ch * 800 / w)), Image.LANCZOS).save(f'{imgs}/card.webp', 'WEBP', quality=90, method=6)
    print('captured', p, [lead] + [t.lower() for t in tabs])

if __name__ == '__main__':
    want = sys.argv[1:]
    for p in JOBS:
        if not want or p.split('/')[1] in want: run(p)
