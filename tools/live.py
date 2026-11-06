"""Check every panel updates on the spot: nothing should wait for a tab switch, a reopen or a refresh.

    python3 tools/live.py              # every script
    python3 tools/live.py kaleidoscope # just these (folder names)

For every tab, it changes each control twice (there and back), reads what every control and the
panel's text show, then closes and reopens the panel and reads them again. Anything that differs
only caught up after the reopen: a toggle that didn't flip with its partner (the sun/moon switch
and "Match my device"), a color swatch or status line that stayed stale, a section that should
have appeared. Then the same again with the change made in one tab and read in a second open
tab of the site (settings reach every open tab live). Prints one line per problem; "clean" otherwise.
"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from screens import JOBS, CLOCK
from carry import FIRST

def live(p, two=False):
    url, cmd, extra, tabs = JOBS[p]; slug = p.split('/')[1]
    tabs = ['main'] + list(JOBS[p][3])
    args = ['node', f'{HERE}/shot.js', f'{R}/{p}/{slug}.user.js', url, '/dev/null', '--cmd', cmd, '--live', '--clock', CLOCK, '--vh', '1400',
            '--tabs', ','.join(tabs)] + extra + (['--twotab'] if two else [])
    r = subprocess.run(args, capture_output=True, text=True, timeout=1500)
    line = next((l for l in r.stdout.splitlines() if l.startswith('LIVE ')), None)
    if line is None: return [f'could not run: {(r.stderr or r.stdout)[-300:]}']
    return json.loads(line[5:])

if __name__ == '__main__':
    only = sys.argv[1:]; bad = 0
    from concurrent.futures import ThreadPoolExecutor
    ps = [p for p in JOBS if not only or p.split('/')[1] in only]
    runs = [(p, two) for p in ps for two in (False, True)]
    with ThreadPoolExecutor(4) as ex:
        for (p, two), res in zip(runs, ex.map(lambda a: live(*a), runs)):
            p = p + (' (second tab)' if two else '')
            print(f'== {p}: ' + ('clean' if not res else f'{len(res)} issue(s)'))
            for x in res: print('   ' + x)
            bad += bool(res)
    sys.exit(1 if bad else 0)
