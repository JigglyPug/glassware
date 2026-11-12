"""Check every panel updates on the spot: nothing should wait for a tab switch, a reopen or a refresh.

    python3 tools/tests/live.py              # every script
    python3 tools/tests/live.py kaleidoscope # just these (folder names)

For every tab, it changes each control twice (there and back), reads what every control and the
panel's text show, then closes and reopens the panel and reads them again. Anything that differs
only caught up after the reopen: a toggle that didn't flip with its partner (the sun/moon switch
and "Match my device"), a color swatch or status line that stayed stale, a section that should
have appeared. Then the same again with the change made in one tab and read in a second open
tab of the site (settings reach every open tab live). Prints one line per problem; "clean" otherwise.
"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); R = os.path.dirname(HERE)   # HERE is the tools folder
sys.path[:0] = [HERE] + [os.path.join(HERE, d) for d in ('lib', 'build', 'tests')]
from screens import JOBS, CLOCK
from carry import FIRST

def tabs_of(p): return ['main'] + list(JOBS[p][3])

SLICES = 3   # a tab's controls are shared out over this many browsers

def live(p, two=False, tabs=None, part=None):
    """One browser run: the tabs given (all of them by default), changed and checked one after another."""
    url, cmd, extra, _ = JOBS[p]; slug = p.split('/')[1]
    tabs = tabs or tabs_of(p)
    args = ['node', f'{HERE}/lib/shot.js', f'{R}/{p}/{slug}.user.js', url, '/dev/null', '--cmd', cmd, '--live', '--clock', CLOCK, '--vh', '1400',
            '--tabs', ','.join(tabs)] + extra + (['--twotab'] if two else []) + (['--slice', f'{part}/{SLICES}'] if part is not None else [])
    r = subprocess.run(args, capture_output=True, text=True, timeout=1500)
    line = next((l for l in r.stdout.splitlines() if l.startswith('LIVE ')), None)
    if line is None: return [f'could not run: {(r.stderr or r.stdout)[-300:]}']
    return json.loads(line[5:])

if __name__ == '__main__':
    only = sys.argv[1:]; bad = 0
    from par import pmap
    ps = [p for p in JOBS if not only or p.split('/')[1] in only]
    runs = [(p, two) for p in ps for two in (False, True)]
    # every tab of a panel starts from a fresh page anyway, so each gets a browser of its own, several at once
    jobs = [(p, two, [t], k) for p, two in runs for t in tabs_of(p) for k in range(SLICES)]
    got = dict(zip([(p, two, t[0], k) for p, two, t, k in jobs], pmap(lambda a: live(*a), jobs)))
    for p, two in runs:
        res = list(dict.fromkeys(x for t in tabs_of(p) for k in range(SLICES) for x in got[(p, two, t, k)]))
        p = p + (' (second tab)' if two else '')
        print(f'== {p}: ' + ('clean' if not res else f'{len(res)} issue(s)'))
        for x in res: print('   ' + x)
        bad += bool(res)
    sys.exit(1 if bad else 0)
