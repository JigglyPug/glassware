"""Recapture every panel screenshot from the current scripts and install them as images.

    python3 tools/screens.py            # all scripts
    python3 tools/screens.py prism      # just one (folder name)

Each panel is opened in a stubbed page by shot.js, captured at full height, cropped to
the panel, saved as WebP in <platform>/<script>/images/, and the landing-page card is
cut from the top of the lead image. Hourglass also gets its phone shots (dashboard,
schedule, block screen, late-night nudge), and Molten for Discord its favorites list on hover.
Run tools/pages.py afterwards to copy the images into the site.
"""
import os, subprocess, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
from par import pmap
QUIET = False   # tools/check.py sets this: it captures several scripts at once and prints its own lines

def cap(args):
    """Run one capture; fail if its picture is cut off (shot.js prints CLIPPED when the panel still scrolls)."""
    r = subprocess.run(args, check=True, capture_output=True, text=True)
    clipped = [l for l in r.stdout.splitlines() if l.startswith('CLIPPED')]
    if clipped: raise RuntimeError('\n'.join(clipped))
    return r
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
CLOCK = '2026-11-03T20:40:00-05:00'   # evening: outside Hourglass's demo lockdown, so every tab is open
ANI = 'https://anilist.co/user/JigglyPug/animelist'

# folder: (url, menu command prefix, extra flags, [tabs]); lead image is the first capture
JOBS = {
    'desktop/molten-for-discord': ('https://discord.com/channels/@me', 'Open Molten for Discord', ['--seed', f'{HERE}/seeds/molten-for-discord.json'], ['Lava', 'Favorites', 'Messages', 'Reminders', 'Activity', 'Privacy']),
    'desktop/prism':          ('https://example.com/', 'Open Prism', [], []),
    'desktop/hourglass':      ('https://www.youtube.com/', 'Open', ['--seed', f'{HERE}/seeds/hourglass.json'], ['Schedule', 'Sites', 'Settings']),
    'desktop/looking-glass':  ('https://example.com/', 'Open Looking', ['--video'], []),
    'desktop/molten-tools':   ('https://www.youtube.com/', 'Open Molten', ['--seed', f'{HERE}/seeds/molten.json', '--seedls', f'{HERE}/seeds/molten-ls.json'], ['General', 'Account', 'Quality']),
    'desktop/molten-for-reddit': ('https://www.reddit.com/', 'Open Molten', ['--seed', f'{HERE}/seeds/molten.json'], ['General', 'Video', 'Reddit', 'Search']),
    'desktop/kaleidoscope':   (ANI, 'Open Kaleidoscope', [], ['Sequels', 'Settings']),
    'mobile/kaleidoscope-mobile': (ANI, 'Open Kaleidoscope', ['--mobile'], ['Sequels', 'Settings']),
    'mobile/molten-for-reddit-mobile': ('https://www.reddit.com/', 'Open Molten', ['--mobile', '--seed', f'{HERE}/seeds/molten.json'], ['General', 'Video', 'Reddit', 'Search']),
}
# the Molten panels open on their Lava tab, so the first capture is saved as lava.webp
FIRST = {'desktop/molten-tools': 'lava', 'desktop/molten-for-reddit': 'lava', 'mobile/molten-for-reddit-mobile': 'lava'}

def webp(src, dst):
    im = Image.open(src).convert('RGB')
    if im.width > 1400: im = im.resize((1400, round(im.height * 1400 / im.width)), Image.LANCZOS)
    im.save(dst, 'WEBP', quality=90, method=6)

# Every screenshot is taken twice: dark (<name>.webp) and light (<name>-light.webp). The panels follow
# the device's light or dark setting by default, so the capture just sets the browser's.
THEMES = (('dark', ''), ('light', '-light'))

NUDGE = ("(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));__clickTab('Settings');await w(600);"
         "const b=__all().find(e=>e.tagName==='BUTTON'&&e.textContent.trim()==='Preview');b.scrollIntoView();b.click();await w(300);"
         "const x=__all().find(e=>e.tagName==='BUTTON'&&/^close/i.test(e.getAttribute('aria-label')||''));x&&x.click();})()")

def hourglass_phone(imgs=None):
    js = f'{R}/desktop/hourglass/hourglass.user.js'; imgs = imgs or f'{R}/desktop/hourglass/images'
    seed = ['--seed', f'{HERE}/seeds/hourglass.json']
    def one(ts):
        theme, sfx = ts
        tmp = tempfile.mkdtemp()
        cap(['node', f'{HERE}/lib/shot.js', js, 'https://www.youtube.com/', f'{tmp}/phone.png', '--cmd', 'Open', '--mobile', '--crop', '--theme', theme,
                        '--vh', '4800', '--clipsel', '.frame.m .panel', '--clock', CLOCK, '--tabs', 'Schedule'] + seed)
        # the block screen: a weekday morning, inside the demo lockdown
        cap(['node', f'{HERE}/lib/shot.js', js, 'https://www.youtube.com/', f'{tmp}/block.png', '--cmd', 'none', '--mobile', '--theme', theme,
                        '--clock', '2026-11-03T11:48:00-05:00'] + seed)
        webp(f'{tmp}/phone.png', f'{imgs}/phone-dashboard{sfx}.webp'); webp(f'{tmp}/phone-schedule.png', f'{imgs}/phone-schedule{sfx}.webp')
        # the late-night nudge, from the Preview button in Settings, at 11:40 PM
        cap(['node', f'{HERE}/lib/shot.js', js, 'https://www.youtube.com/', f'{tmp}/nudge.png', '--cmd', 'Open', '--mobile', '--theme', theme,
                        '--clock', '2026-11-03T23:40:00-05:00', '--eval', NUDGE] + seed)
        webp(f'{tmp}/block.png', f'{imgs}/phone-block{sfx}.webp'); webp(f'{tmp}/nudge.png', f'{imgs}/phone-nudge{sfx}.webp')
    pmap(one, THEMES)
    if not QUIET: print('captured desktop/hourglass phone shots')

# Molten for Discord's favorites list, the one that drops out of the lava button when you point at it:
# opened by pointing at the button, cropped to the button and the list together
FLY = ("(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<30&&!document.getElementById('mfd-lava');i++)await w(200);"
       "const b=document.getElementById('mfd-lava');b.dispatchEvent(new MouseEvent('mouseenter'));await w(1200);"
       "const f=__all().find(e=>e.classList&&e.classList.contains('fly'));if(!f)return 'no list';"
       # measured once it has finished bursting open (a busy machine may still be mid-animation; the blobs' endless drift isn't waited for), and again until it holds still
       "await Promise.all([f,b].flatMap(e=>e.getAnimations({subtree:true})).filter(x=>x.effect&&x.effect.getComputedTiming().iterations!==Infinity).map(x=>x.finished.catch(()=>{})));"
       "let last='';for(let i=0;i<40;i++){const k=JSON.stringify([b.getBoundingClientRect(),f.getBoundingClientRect()]);if(k===last)break;last=k;await w(100);}"
       "const a=b.getBoundingClientRect(),c=f.getBoundingClientRect(),d=document.createElement('div');d.className='mfd-shotbox';"
       "const l=Math.round(Math.min(a.left,c.left)),t=Math.round(Math.min(a.top,c.top));"
       "d.style.cssText='position:fixed;pointer-events:none;left:'+l+'px;top:'+t+'px;width:'+Math.round(Math.max(a.right,c.right)-l)+'px;height:'+Math.round(Math.max(a.bottom,c.bottom)-t)+'px';"
       "document.body.append(d);return 'ok';})()")

def discord_fly(imgs=None):
    js = f'{R}/desktop/molten-for-discord/molten-for-discord.user.js'; imgs = imgs or f'{R}/desktop/molten-for-discord/images'
    def one(ts):
        theme, sfx = ts
        tmp = tempfile.mkdtemp()
        r = cap(['node', f'{HERE}/lib/shot.js', js, 'https://discord.com/channels/101010101010101010/111111111111111111', f'{tmp}/fly.png', '--cmd', 'none',
                 '--crop', '--clipsel', '.mfd-shotbox', '--clock', CLOCK, '--theme', theme, '--seed', f'{HERE}/seeds/molten-for-discord.json', '--eval', FLY, '--print'])
        if 'EVAL "ok"' not in r.stdout: raise RuntimeError('the favorites list didn\'t open: ' + next((l for l in r.stdout.splitlines() if l.startswith('EVAL')), 'no answer'))
        webp(f'{tmp}/fly.png', f'{imgs}/quick-favorites{sfx}.webp')
    pmap(one, THEMES)
    if not QUIET: print('captured desktop/molten-for-discord favorites on hover')

def run(p, imgs=None):
    """Capture one script's panels into its images folder (or into imgs, to compare without touching it)."""
    url, cmd, extra, tabs = JOBS[p]; slug = p.split('/')[1]; mobile = '--mobile' in extra
    imgs = imgs or f'{R}/{p}/images'; os.makedirs(imgs, exist_ok=True)
    lead = FIRST.get(p, 'main')
    def one(ts):
        theme, sfx = ts
        tmp = tempfile.mkdtemp(); out = f'{tmp}/{slug}.png'
        args = ['node', f'{HERE}/lib/shot.js', f'{R}/{p}/{slug}.user.js', url, out, '--cmd', cmd, '--crop', '--clock', CLOCK, '--theme', theme,
                '--vh', '2600' if mobile else '3000'] + extra + (['--tabs', ','.join(tabs)] if tabs else [])
        cap(args)
        webp(out, f'{imgs}/{lead}{sfx}.webp')
        for t in tabs:
            webp(f'{tmp}/{slug}-{t.lower()}.png', f'{imgs}/{t.lower()}{sfx}.webp')
        im = Image.open(f'{imgs}/{lead}{sfx}.webp').convert('RGB'); w, h = im.size; ch = min(h, int(w * 0.8))
        im.crop((0, 0, w, ch)).resize((800, round(ch * 800 / w)), Image.LANCZOS).save(f'{imgs}/card{sfx}.webp', 'WEBP', quality=90, method=6)
    pmap(one, THEMES)
    if not QUIET: print('captured', p, [lead] + [t.lower() for t in tabs], 'in dark and light')

if __name__ == '__main__':
    want = sys.argv[1:]
    for p in JOBS:
        if not want or p.split('/')[1] in want: run(p)
    if not want or 'hourglass' in want: hourglass_phone()
    if not want or 'molten-for-discord' in want: discord_fly()
