"""Check every phone sheet with real touches: taps, scrolling, and the handle.

    python3 tools/tests/touchtest.py [script ...]      # every script that runs on phones, or the ones named
    python3 tools/tests/touchtest.py --file <copy.user.js> <script>   # an older copy in place of one script

Each script that runs on a phone is opened on a stand-in page in a phone-sized touch browser, and
tools/tests/touch_drive.js works its sheet the way a thumb does (CDP touch events, not mouse clicks):
- a tap on a switch flips it, a tap on another tab opens it
- a drag inside the sheet scrolls the sheet, and the page behind it doesn't move
- none of those touches, taps or clicks reach the page behind (a listener on the page's document)
- a short pull on the handle springs back; a long one closes the sheet
It fails on any of those, or an uncaught error. Prints "clean" for each script, or what went wrong.
"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); R = os.path.dirname(HERE)   # HERE is the tools folder
sys.path[:0] = [HERE] + [os.path.join(HERE, d) for d in ('lib', 'build', 'tests')]
from screens import JOBS

# where each phone sheet is opened (the scripts that run on phones; RUNS in tools/build/readmes.py)
# Hourglass's demo data has a weekday lockdown; the test runs at whatever time it is, so its copy is disarmed
# (during a lockdown the block screen is up and the sheet isn't what's being tested)
import tempfile
_hg = json.load(open(f'{HERE}/seeds/hourglass.json')); _hg['settings'] = dict(_hg['settings'], armed=False)
HG_SEED = os.path.join(tempfile.gettempdir(), 'glassware-touch-hourglass.json'); json.dump(_hg, open(HG_SEED, 'w'))
PHONE = {'desktop/hourglass': ('https://www.youtube.com/', 'Open', ['--seed', HG_SEED]),
         'desktop/looking-glass': ('https://example.com/', 'Open', []),
         'mobile/kaleidoscope-mobile': (JOBS['mobile/kaleidoscope-mobile'][0], 'Open', []),
         'mobile/molten-for-reddit-mobile': ('https://www.reddit.com/', 'Open', ['--seed', f'{HERE}/seeds/molten.json'])}

def run(p, script=None):
    url, cmd, extra = PHONE[p]
    script = script or f'{R}/{p}/{p.split("/")[1]}.user.js'
    r = subprocess.run(['node', f'{HERE}/lib/shot.js', script, url, '/dev/null', '--mobile', '--cmd', cmd, *extra, '--drive', f'{HERE}/tests/touch_drive.js'],
                       capture_output=True, text=True, timeout=180)
    line = next((l for l in r.stdout.splitlines() if l.startswith('EVAL ')), None)
    if not line: return [f'could not run: {(r.stderr or r.stdout).strip()[-200:]}']
    v = json.loads(line[5:]); probs = []
    if not v.get('opened'): return ['the sheet didn\'t open']
    if 'switchTap' in v and v['switchTap']['before'] == v['switchTap']['after']: probs.append('a tap on a switch didn\'t flip it')
    if 'tabTap' in v and not v['tabTap']['selected']: probs.append(f'a tap on the {v["tabTap"]["tab"]} tab didn\'t open it')
    if 'switchTap' not in v and 'tabTap' not in v: probs.append('found no switch or tab to tap (the test reached nothing)')
    if 'scroll' in v:
        if v['scroll']['sheetMoved'] <= 0: probs.append('a drag inside the sheet didn\'t scroll it')
        if v['scroll']['pageMoved'] != 0: probs.append(f'a drag inside the sheet scrolled the page behind ({v["scroll"]["pageMoved"]}px)')
    if v.get('leaks'): probs.append('touches inside the sheet reached the page behind: ' + ', '.join(sorted(set(v['leaks']))))
    if not v.get('shortPullOpen'): probs.append('a short pull on the handle didn\'t spring back')
    if not v.get('swipeClosed'): probs.append('pulling the handle down didn\'t close the sheet')
    probs += [f'uncaught: {e[:120]}' for e in v.get('errs', [])]
    return probs

if __name__ == '__main__':
    a = sys.argv[1:]
    if '--file' in a:
        i = a.index('--file'); f, name = a[i + 1], a[i + 2]; targets = [(p, f) for p in PHONE if p.split('/')[1] == name]
    else: targets = [(p, None) for p in PHONE if not a or p.split('/')[1] in a]
    bad = False
    from par import pmap
    for (p, f), probs in zip(targets, pmap(lambda t: run(*t), targets)):
        bad |= bool(probs)
        print(f'== {p.split("/")[1]} on a phone: ' + ('clean' if not probs else '; '.join(probs)))
    sys.exit(1 if bad else 0)
