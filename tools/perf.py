"""How much each script costs over a long session, and whether anything it leaves behind keeps growing.

    python3 tools/perf.py [script ...]          # all scripts if none named
    python3 tools/perf.py --table [script ...]  # print every number, not just problems
    python3 tools/perf.py --selftest            # only prove the test catches a leaky, slow script

Opens each script on a stand-in page of its site and runs a long session on it (shot.js --perf):
40 rounds, each adding 200 feed items of the kind the site uses (YouTube's video and comment
renderers, Reddit's posts and comments, plain cards elsewhere, each with a link and an image, and a
video in every 25th, since feeds share a few players), changing some text, dropping the oldest past
400, and moving to a new page the way the site's app does. Then it waits with nothing changing, and
again with the tab in the background. The same session runs without any script, once per site, so
only the script's own share counts.

It reports, against that baseline:
- script time per round of page changes
- script time per second while nothing changes (its timers), and the same with the tab hidden
- growth from rounds 10-15 to rounds 30-40 in memory (after garbage collection), page elements
  (shadow roots included), event listeners, repeating timers and page watchers (MutationObservers
  still watching something on the page): anything that keeps climbing is a leak
- page work: how much longer the page's own changes take with the script on (the style and layout
  its CSS and layers add); reported with no budget, since it's the cost of what the script draws
and fails on anything over BUDGET (CLAUDE.md, Performance). Before measuring, it runs a deliberately
bad script (SELFTEST) and fails unless every budget catches it.

The pages are stand-ins, not the real sites, and timings move by a millisecond or so between runs,
so the budgets sit at about twice what the scripts cost today: they catch a new leak or a timer that
suddenly costs much more, not small drifts. Runs one browser at a time (two at once slow each other
down and the numbers stop meaning anything): about five minutes for all scripts.
"""
import json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from screens import JOBS

BUDGET = {
    'ms_per_round': 5.0,      # script time per round of 200 new items, text changes and a page change
    'idle_ms_per_s': 6.0,     # script time each second while nothing on the page changes (timers)
    'hidden_ms_per_s': 2.0,   # the same with the tab in the background
    'heap_mb': 2.0,           # memory still held at the end that wasn't there early on
    'nodes': 300,             # page elements added and never removed
    'listeners': 150,         # event listeners piling up
    'intervals': 0,           # repeating timers started and never stopped
    'observers': 0,           # page watchers piling up
}
TAGS = {
    'youtube.com': ['ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer', 'ytd-comment-thread-renderer'],
    'reddit.com': ['shreddit-post', 'shreddit-comment', 'article', 'faceplate-partial'],
}
ROUNDS, QUIET = 40, 8

# Leaks everything the test looks for, on every page change, and wastes time on every one.
SELFTEST = """// ==UserScript==
// @name selftest
// ==/UserScript==
const keep = [];
const busy = ms => { const t = performance.now(); while (performance.now() - t < ms) {} };
addEventListener('popstate', () => {
  busy(12);
  setInterval(() => busy(0.3), 1000);
  new MutationObserver(() => {}).observe(document.body, { childList: true });
  for (let i = 0; i < 10; i++) document.addEventListener('click', () => {});
  const s = document.createElement('span'); s.hidden = true; s.innerHTML = '<i></i>'.repeat(20); document.body.append(s);
  keep.push(new Array(20000).fill(0).map((_, i) => ({ i })));
});
"""

def job(p):
    url, cmd, extra, tabs = JOBS[p]
    host = url.split('/')[2]
    tags = next((v for k, v in TAGS.items() if host.endswith(k)), ['div'])
    keep = [a for i, a in enumerate(extra) if a == '--mobile' or a in ('--seed', '--seedls') or (i and extra[i - 1] in ('--seed', '--seedls'))]
    return url, tags, keep

def run(src, url, tags, keep, base=False):
    args = ['node', f'{HERE}/shot.js', src, url, '/dev/null', '--perf', '--rounds', str(ROUNDS), '--quiet', str(QUIET),
            '--tags', json.dumps(tags)] + keep + (['--noscript'] if base else [])
    r = subprocess.run(args, capture_output=True, text=True, timeout=600)
    line = next((l for l in r.stdout.splitlines() if l.startswith('PERF ')), None)
    if not line: raise RuntimeError(f'{os.path.basename(src)}: no measurements\n' + (r.stderr or r.stdout)[-400:])
    return json.loads(line[5:])

_bases = {}
def baseline(src, url, tags, keep):
    # the page without any script; the same for every script on that page (seeds only reach a script)
    k = (url, json.dumps(tags), '--mobile' in keep)
    if k not in _bases: _bases[k] = run(src, url, tags, [a for a in keep if a == '--mobile'], base=True)
    return _bases[k]

def compare(s, b):
    # samples: [0] before, [1..8] every 5 rounds, [-2] after the quiet stretch, [-1] after it hidden
    ses, bes = s[:-2], b[:-2]
    early = lambda x, k: sum(y[k] for y in x[2:4]) / 2      # rounds 10-15
    late = lambda x, k: sum(y[k] for y in x[-3:]) / 3       # rounds 30-40
    grow = lambda k: (late(ses, k) - early(ses, k)) - (late(bes, k) - early(bes, k))
    busy = lambda x: x[-1]['script'] - x[0]['script']
    still = lambda x, i: (x[i]['script'] - x[i - 1]['script']) / x[i]['quiet']
    return {
        'ms_per_round': round((busy(ses) - busy(bes)) / ROUNDS * 1000, 2),
        'idle_ms_per_s': round((still(s, -2) - still(b, -2)) * 1000, 2),
        'hidden_ms_per_s': round((still(s, -1) - still(b, -1)) * 1000, 2),
        'heap_mb': round(grow('heap') / 1048576, 2),
        'nodes': int(grow('dom')),
        'listeners': int(grow('listeners')),
        'intervals': int(ses[-1]['iv'] - ses[2]['iv']),
        'observers': int(ses[-1]['obs'] - ses[2]['obs']),
        'page_work_pct': round((ses[-1]['work'] / bes[-1]['work'] - 1) * 100),
        'running': {'intervals': ses[-1]['iv'], 'observers': ses[-1]['obs']},
    }

def measure(p, root=R):
    url, tags, keep = job(p)
    src = f'{root}/{p}/{p.split("/")[1]}.user.js'
    return compare(run(src, url, tags, keep), baseline(src, url, tags, keep))

def problems(res):
    return [f'{k} {res[k]} (budget {v})' for k, v in BUDGET.items() if res[k] > v]

def selftest():
    """The bad script must trip every budget; returns what it missed."""
    with tempfile.NamedTemporaryFile('w', suffix='.user.js', delete=False) as f: f.write(SELFTEST)
    try:
        url, tags, keep = 'https://example.com/', ['div'], []
        res = compare(run(f.name, url, tags, keep), baseline(f.name, url, tags, keep))
    finally: os.unlink(f.name)
    tripped = {x.split()[0] for x in problems(res)}
    return [k for k in BUDGET if k not in tripped], res

if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if not a.startswith('--')]
    missed, res = selftest()
    print('== selftest: ' + ('every budget catches the bad script' if not missed else 'MISSED ' + ', '.join(missed)))
    if '--table' in sys.argv or missed: print('   ' + json.dumps(res))
    bad = bool(missed)
    if '--selftest' not in sys.argv:
        for p in [p for p in JOBS if not names or p.split('/')[1] in names]:
            res = measure(p); probs = problems(res); bad |= bool(probs)
            print(f'== {p}: ' + ('clean' if not probs else '; '.join(probs)))
            if '--table' in sys.argv: print('   ' + json.dumps(res))
    sys.exit(1 if bad else 0)
