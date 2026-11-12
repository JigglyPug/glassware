"""Settings carry-over test: do people's settings and saved data survive an update?

    python3 tools/tests/carry.py              # every script whose code differs from GitHub
    python3 tools/tests/carry.py --all        # every script
    python3 tools/tests/carry.py prism        # just one (folder name)
    python3 tools/tests/carry.py --all --back 5   # from 5 releases before the live one (several updates skipped)

For each script it takes the version that's live on GitHub (origin/main) and:
  1. opens its panel, changes every setting it can (switches, choices, sliders) on every tab,
     and keeps what it saved, exactly as Tampermonkey would;
  2. reopens the live version with that saved data, and notes what every control shows;
  3. opens the new version with the same saved data, and notes what every control shows.
In 2 and 3, settings that fold away while their feature is off are read too: each switch that's off
is turned on for a moment, the controls it reveals are noted, and it's turned back off.
Any setting that shows differently in 3 than in 2 didn't carry over. Saved data the live
version reads but the new one never looks at is flagged too (that's how history or boards get
lost). It also checks that @name and @namespace haven't changed, since Tampermonkey would
install the new version as a separate script with fresh settings.

A deliberate change (a setting really was retired) goes in tools/tests/settings_ok.txt as
"<script> | <the line this prints>" so it stops being flagged.
"""
import json, os, re, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); R = os.path.dirname(HERE)   # HERE is the tools folder
sys.path[:0] = [HERE] + [os.path.join(HERE, d) for d in ('lib', 'build', 'tests')]
from screens import JOBS, CLOCK

FIRST = {'desktop/hourglass': 'Dashboard', 'desktop/molten-tools': 'Lava', 'desktop/molten-for-reddit': 'Lava',
         'mobile/molten-for-reddit-mobile': 'Lava', 'desktop/kaleidoscope': 'Recommend', 'mobile/kaleidoscope-mobile': 'Recommend'}
OK_FILE = f'{HERE}/tests/settings_ok.txt'
CARRY_BACK = 4   # tools/check.py also starts from this many releases before the live one

def git(*a): return subprocess.run(['git', '-C', R] + list(a), capture_output=True, text=True)

class GitError(RuntimeError): pass

def fetch_live():
    """Fetch GitHub's main branch. Raises GitError if that fails, so nothing compares against a
    stale copy. Returns the commit being compared against."""
    r = git('fetch', '-q', 'origin', 'main')
    if r.returncode != 0: raise GitError("couldn't fetch from GitHub (offline or signed out?): " + (r.stderr.strip() or 'git fetch failed'))
    r = git('rev-parse', '--verify', '-q', 'origin/main')
    if r.returncode != 0: raise GitError('origin/main is missing after fetching')
    return r.stdout.strip()

def live_source(p):
    """The live (origin/main) copy of a script; None only when the script truly isn't on GitHub yet."""
    path = f'origin/main:{p}/{p.split("/")[1]}.user.js'
    if git('cat-file', '-e', path).returncode != 0:
        if git('rev-parse', '--verify', '-q', 'origin/main').returncode != 0: raise GitError('origin/main is missing')
        return None                                   # really not on GitHub yet: a new script
    r = git('show', path)
    if r.returncode != 0: raise GitError(f"couldn't read the live {p}: {r.stderr.strip()}")
    return r.stdout

def releases(p):
    """Every released version of a script on GitHub, newest first: [(version, commit)], the commit
    being the first one that shipped that version."""
    path = f'{p}/{p.split("/")[1]}.user.js'
    r = git('log', '--format=%H', 'origin/main', '--', path)
    if r.returncode != 0: raise GitError(f"couldn't read {p}'s history: {r.stderr.strip()}")
    out = []
    for c in r.stdout.split():
        src = git('show', f'{c}:{path}')
        if src.returncode != 0: continue                   # moved or deleted at that commit
        v = header(src.stdout, 'version')
        if not v: continue
        if out and out[-1][0] == v: out[-1] = (v, c)        # same version, an earlier commit: keep the first that shipped it
        elif not any(x[0] == v for x in out): out.append((v, c))
    return out

def old_source(p, back):
    """The script as it was <back> releases before the live one (0 = live); None if it's that new."""
    rel = releases(p)
    if back >= len(rel): return None, None
    v, c = rel[back]
    return git('show', f'{c}:{p}/{p.split("/")[1]}.user.js').stdout, v

def header(src, key):
    m = re.search(r'(?m)^//[ \t]*@' + key + r'(?:[ \t]+(.*?))?[ \t]*$', src); return (m.group(1) or '') if m else None   # one line only: an empty @namespace is valid

def run(script, p, mode, seed=None, seedls=None):
    url, cmd, extra, tabs = JOBS[p]
    tabs = ([FIRST[p]] + tabs) if p in FIRST else tabs
    args = ['node', f'{HERE}/lib/shot.js', script, url, '/dev/null', '--cmd', cmd, '--' + mode, '--clock', CLOCK, '--vh', '1400']
    if seed:   # the saved data replaces any demo seed (storage and page storage both)
        for flag in ('--seed', '--seedls'):
            i = extra.index(flag) if flag in extra else -1
            extra = extra[:i] + extra[i + 2:] if i >= 0 else extra
        args += extra + ['--seed', seed]
    else: args += extra
    if seedls: args += ['--seedls', seedls]
    if tabs: args += ['--tabs', ','.join(tabs)]
    r = subprocess.run(args, capture_output=True, text=True, timeout=240)
    line = next((l for l in r.stdout.splitlines() if l.startswith('CARRY ')), None)
    # only a run that finished cleanly and reported everything counts
    if r.returncode != 0 or line is None:
        raise RuntimeError(f'browser run failed ({mode}, exit {r.returncode}): ' + (r.stderr or r.stdout)[-400:])
    out = json.loads(line[6:])
    if not all(k in out for k in ('state', 'gm', 'ls', 'reads')) or not out['state']:
        raise RuntimeError(f'browser run ({mode}) reported no settings; the panel probably didn\'t open')
    return out

def check(p, back=0):
    """Returns a list of problems (strings) for one script. back: start from the version that many
    releases before the live one (people who skipped updates, or whose browser was off for weeks)."""
    slug = p.split('/')[1]; new_path = f'{R}/{p}/{slug}.user.js'
    old_src = live_source(p) if not back else old_source(p, back)[0]
    if old_src is None: return [], None              # a brand-new script has nobody to carry over
    new_src = open(new_path, encoding='utf-8').read()
    probs = []
    for k in ('name', 'namespace'):
        if header(old_src, k) != header(new_src, k):
            probs.append(f'@{k} changed ({header(old_src, k)} -> {header(new_src, k)}): Tampermonkey would install a second copy with fresh settings')
    tmp = tempfile.mkdtemp(); old_path = f'{tmp}/{slug}.live.user.js'
    open(old_path, 'w', encoding='utf-8').write(old_src)
    used = run(old_path, p, 'exercise')               # 1. change everything on the live version
    gm, ls = f'{tmp}/gm.json', f'{tmp}/ls.json'
    json.dump(used['gm'], open(gm, 'w')); json.dump(used['ls'], open(ls, 'w'))
    from par import pmap                              # 2. live version, reopened with that data; 3. new version, same data
    before, after = pmap(lambda path: run(path, p, 'state', gm, ls), [old_path, new_path])
    a = {x['key']: x['value'] for x in before['state']}; b = {x['key']: x['value'] for x in after['state']}
    bpos = {x['pos']: x for x in after['state']}
    for x in before['state']:
        k, v = x['key'], x['value']
        if k in b:
            if b[k] != v: probs.append(f'"{k}" didn\'t carry over: was {v!r}, new version shows {b[k]!r}')
            continue
        # labels can include the current choice's description, so fall back to the control's position
        y = bpos.get(x['pos'])
        if y and y['key'] not in a and y['value'] != v: probs.append(f'"{k}" didn\'t carry over: was {v!r}, new version shows {y["value"]!r}')
        elif not y or y['key'] in a: probs.append(f'can\'t find "{k}" in the new version (renamed or moved? check it by hand)')
    saved = {'gm:' + k for k in used['gm']} | {'ls:' + k for k in used['ls']}
    for k in sorted((set(before['reads']) & saved) - set(after['reads'])):
        probs.append(f'saved data "{k[3:]}" is no longer read by the new version')
    ok = set()
    if os.path.exists(OK_FILE):
        ok = {l.strip() for l in open(OK_FILE, encoding='utf-8') if '|' in l and not l.lstrip().startswith('#')}
    return [x for x in probs if f'{slug} | {x}' not in ok], len(a)

def changed():
    fetch_live()
    out = []
    for p in JOBS:
        slug = p.split('/')[1]; src = live_source(p)
        if src is not None and src != open(f'{R}/{p}/{slug}.user.js', encoding='utf-8').read(): out.append(p)
    return out

if __name__ == '__main__':
    args = sys.argv[1:]
    try: print('comparing against GitHub at', fetch_live()[:7])
    except GitError as e: print('✗', e); sys.exit(1)
    # --back N: start from N releases before the live version instead (several updates skipped at once)
    back = int(args[args.index('--back') + 1]) if '--back' in args else 0
    targets = list(JOBS) if '--all' in args else [p for p in JOBS if p.split('/')[1] in args] or changed()
    bad = 0
    if not targets: print('no script differs from GitHub; nothing to check')
    for p in targets:
        frm = ''
        try:
            if back:
                v = old_source(p, back)[1]
                if v is None: print(f'== {p}: fewer than {back + 1} releases; skipped'); continue
                frm = f' from {v}'
            probs, n = check(p, back)
        except Exception as e: probs, n = [f'test could not run: {e}'], 0
        print(f'== {p}{frm}: ' + ('new script, nothing to carry over yet' if n is None else 'settings carry over' if not probs else f'{len(probs)} problem(s)') + ('' if n is None else f' ({n} settings checked)'))
        for x in probs: print('   ' + x)
        bad += bool(probs)
    sys.exit(1 if bad else 0)
