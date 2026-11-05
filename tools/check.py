"""Release check: run this before every push. It should end with "All checks passed".

    python3 tools/check.py           # rules for every script; glitch and settings tests for the
                                     # scripts whose code differs from GitHub
    python3 tools/check.py --all     # glitch and settings tests for every script too (slow)
    python3 tools/check.py --quick   # rules only, no browser tests

Everything fails closed: if GitHub can't be reached, or a test crashes or reports nothing,
that's a failure, never a pass.

It checks, in order:
  scripts    each script parses, its header lines match CLAUDE.md, its version fallbacks match
             @version, and a changed script has a higher @version than the live one
  frame      panel rules from CLAUDE.md: menu wording, on/off wording, no dropdowns, Esc closes,
             footer, Troubleshooting (when the script has logging), static vs live icon tiles
  privacy    no personal info, Greasy Fork links, local paths or chat links in scripts, pages
             or tools
  pages      every page and README shows each script's current version; icons are in place;
             every script has a RUNS entry
  registry   every script is listed everywhere the tools need it (pages, screenshots, tests)
  commits    commits not yet pushed are by JigglyPug and carry no chat or session links
  generated  the pages rebuild to exactly what's committed (no hand edits, nothing stale)
  settings   tools/carry.py: settings and saved data survive the update (changed scripts)
  glitches   tools/audit.py: no visual glitches at laptop, desktop and phone sizes (changed scripts)
"""
import glob, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
args = sys.argv[1:]
RAW = 'https://raw.githubusercontent.com/JigglyPug/glassware/main'
HISTORY = re.compile(r'(?i)\b(before|from|since|until|earlier|older|used to|renamed|migrat\w*)\b')
STATIC = {'molten-tools', 'molten-for-reddit', 'molten-for-reddit-mobile', 'kaleidoscope', 'kaleidoscope-mobile'}
LIVE = {'prism', 'hourglass', 'looking-glass'}
fails = []; section = ''
def head(name): global section; section = name; print(f'\n{name}')
def ok(cond, what):
    if not cond: fails.append(f'{section}: {what}'); print(f'  ✗ {what}')
    return cond
def done(n): print(f'  ✓ {n} checks') if not any(f.startswith(section + ':') for f in fails) else None
def git(*a): return subprocess.run(['git', '-C', R] + list(a), capture_output=True, text=True)
def vtuple(v): return tuple(int(x) for x in re.findall(r'\d+', v))

paths = sorted(glob.glob(f'{R}/*/*/*.user.js'))
S = {p: open(p, encoding='utf-8').read() for p in paths}
def info(p): plat, slug = p.split('/')[-3:-1]; return plat, slug
def hdr(src, k):
    m = re.search(r'//\s*@' + k + r'\s+(.+)', src); return m.group(1).strip() if m else None

import carry   # shares the GitHub lookups, which fail closed
try: LIVE_SHA = carry.fetch_live()
except carry.GitError as e:
    print(f'✗ {e}\n\nCan\'t compare with the live versions, so nothing was checked.'); sys.exit(1)
print(f'Comparing against GitHub at {LIVE_SHA[:7]}')
def live(plat, slug): return carry.live_source(f'{plat}/{slug}')
changed = [f'{info(p)[0]}/{info(p)[1]}' for p in paths if live(*info(p)) != S[p]]

# ------------------------------------------------------------------ scripts
head('scripts'); n = 0
for p, src in S.items():
    plat, slug = info(p); v = hdr(src, 'version'); n += 8
    ok(subprocess.run(['node', '--check', p], capture_output=True).returncode == 0, f'{slug} has a syntax error (node --check)')
    ok(hdr(src, 'author') == 'JigglyPug', f'{slug}: @author should be JigglyPug')
    ok(hdr(src, 'license') == 'MIT', f'{slug}: @license should be MIT')
    ok(re.fullmatch(re.escape(f'{RAW}/assets/icons/{slug}.png') + r'\?v=\d+', hdr(src, 'icon') or ''), f'{slug}: @icon should be {RAW}/assets/icons/{slug}.png?v=N')
    ok(hdr(src, 'homepageURL') == f'https://jigglypug.github.io/glassware/{plat}/{slug}/', f'{slug}: @homepageURL is wrong')
    ok(hdr(src, 'supportURL') == 'https://github.com/JigglyPug/glassware/issues', f'{slug}: @supportURL is wrong')
    for k in ('updateURL', 'downloadURL'): ok(hdr(src, k) == f'{RAW}/{plat}/{slug}/{slug}.user.js', f'{slug}: @{k} is wrong')
    for fb in re.findall(r"GM_info\.script\.version\)\s*\|\|\s*'([0-9.]+)'", src): ok(fb == v, f'{slug}: version fallback {fb} should be {v}')
    old = live(plat, slug)
    if old is not None and old != src:
        ov = hdr(old, 'version'); n += 1
        ok(vtuple(v) > vtuple(ov), f'{slug} changed but @version {v} is not higher than the live {ov}')
done(n)

# ------------------------------------------------------------------ frame
head('frame'); n = 0
for p, src in S.items():
    plat, slug = info(p); name = hdr(src, 'name'); n += 6
    menus = re.findall(r"GM_registerMenuCommand\(\s*'([^']+)'", src)
    ok(menus and menus[0].startswith(f'Open {name.replace(" Mobile", "")}'), f'{slug}: first menu command should be "Open {name}" (has {menus[:1]})')
    for m in menus[1:]: ok(re.match(r'Turn .+ on/off( for this site)?$', m), f'{slug}: menu command "{m}" should read "Turn … on/off"')
    if 'Everything is' in src:
        ok('Everything is on. Turn off to stop every feature at once.' in src and 'Everything is off. Your settings are kept.' in src, f'{slug}: on/off card wording differs from CLAUDE.md')
    ok(not re.search(r"""(el|h)\(\s*'select'|createElement\(\s*'select'\)""", src), f'{slug}: uses a dropdown; use segmented buttons')
    ok(re.search(r"""['"]Escape['"]""", src), f'{slug}: Esc should close the panel')
    ok('or the Tampermonkey menu' in src or 'Open from the Tampermonkey menu' in src, f'{slug}: footer should read "Open from … or the Tampermonkey menu · v… "')
    if re.search(r'Log to the console|layout report|Diagnostics', src):
        ok('Troubleshooting' in src and not re.search(r"""label\(\s*'Diagnostics'|section\([^)]*'Diagnostics'""", src), f'{slug}: logging and diagnostics belong in a section named "Troubleshooting"')
    # No version numbers that someone has to remember to update. Code reads GM_info.script.version;
    # comments may only name a version as history ("from before 1.2.1", "links from 2.3.0"), which
    # stays true. A comment like "same as 2.7.5" goes stale the moment either side changes.
    body = src[src.index('==/UserScript=='):]
    code = re.sub(r'https?://\S+', '', body)
    comments = re.findall(r'/\*.*?\*/|//[^\n]*', code, flags=re.S)
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.S); code = re.sub(r'(?m)//.*$', '', code)
    code = re.sub(r"\|\|\s*'[0-9.]+'", '', code)                               # the checked fallbacks
    m = re.search(r'\b\d+\.\d+\.\d+\b', code)
    ok(not m, f'{slug}: hardcoded version "{m.group(0)}" in the code; read it from GM_info.script.version' if m else '')
    for c in comments:
        for line in c.splitlines():
            m = re.search(r'\b\d+\.\d+\.\d+\b', line)
            ok(not m or HISTORY.search(line), f'{slug}: comment names version {m.group(0) if m else ""} as if current ("{line.strip()[:70]}"); describe it without a version' if m else '')
    if slug in STATIC: ok('const ICON_SRC = ' in src, f'{slug}: static header tile should embed the app icon (python3 tools/panel_icons.py)')
    if slug in LIVE: ok('ICON_SRC' not in src and 'function glassGlyph(' in src, f'{slug}: live header tile should draw glassGlyph(), never the static icon image')
for f in ['CLAUDE.md', 'tools/readmes.py', 'tools/features.py', 'tools/site_themes.py']:
    for i, line in enumerate(open(f'{R}/{f}', encoding='utf-8'), 1):
        m = re.search(r'\b\d+\.\d+\.\d+\b', re.sub(r'https?://\S+', '', line)); n += 1
        ok(not m or HISTORY.search(line), f'{f}:{i} names version {m.group(0) if m else ""}; pages take versions from @version, so write it without one' if m else '')
done(n)

# ------------------------------------------------------------------ privacy
head('privacy'); n = 0
BAD = [(r'greasyfork', 'a Greasy Fork link'), (r'claude\.ai/code|Claude-Session|session_0', 'a chat or session link'),
       (r'(?i)\bpreston\b|\bbugg\b', 'a real name'), (r'/home/[a-z]|/Users/[A-Za-z]|C:\\\\Users', 'a local path'),
       (r'[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com)[A-Za-z0-9-]+\.(com|net|org|io|dev)\b', 'an email address'),
       (r'(?i)claude code|anthropic|co-authored-by', 'a mention of this workflow')]
files = [p for p in glob.glob(f'{R}/**/*', recursive=True) if os.path.isfile(p) and '/.git/' not in p and '__pycache__' not in p
         and re.search(r'\.(js|py|md|html|css|svg|txt|json)$', p)]
for f in files:
    t = open(f, encoding='utf-8', errors='ignore').read(); rel = os.path.relpath(f, R)
    for pat, what in BAD:
        if rel == 'tools/check.py' or (rel == 'CLAUDE.md' and what == 'a chat or session link'): continue   # these name the patterns
        if what == 'a mention of this workflow' and not rel.endswith('.user.js'): continue
        if what == 'an email address' and re.search(r'@(example|domain)\.', t): continue
        m = re.search(pat, t); n += 1
        ok(not m, f'{rel} contains {what}: "{m.group(0)}"' if m else '')
done(n)

# ------------------------------------------------------------------ pages
head('pages'); n = 0
src = open(f'{HERE}/readmes.py', encoding='utf-8').read(); ns = {'__file__': f'{HERE}/readmes.py'}
try: exec(src[:src.index('\nACCENT = {')], ns); RUNS = ns['RUNS']
except AssertionError as e: RUNS = {}; ok(False, f'readmes.py: {e}')
landing = open(f'{R}/docs/index.html', encoding='utf-8').read(); front = open(f'{R}/README.md', encoding='utf-8').read()
for p, s in S.items():
    plat, slug = info(p); v = hdr(s, 'version'); n += 7
    ok(f'{plat}/{slug}' in RUNS, f'{slug} needs a RUNS entry in tools/readmes.py')
    ok(f'Install-v{v}' in open(f'{R}/{plat}/{slug}/README.md', encoding='utf-8').read(), f'{slug}: README shows an old version (run python3 tools/pages.py)')
    ok(f'>v{v}<' in open(f'{R}/docs/{plat}/{slug}/index.html', encoding='utf-8').read(), f'{slug}: site page shows an old version (run python3 tools/pages.py)')
    ok(f'>v{v}<' in landing, f'{slug}: landing card shows an old version (run python3 tools/pages.py)')
    ok(f'Install-v{v}' in front, f'{slug}: front README card shows an old version (run python3 tools/pages.py)')
    ok(os.path.exists(f'{R}/assets/icons/{slug}.png'), f'{slug}: assets/icons/{slug}.png is missing')
    a, b = f'{R}/assets/icons/{slug}.png', f'{R}/docs/img/{slug}/icon.png'
    ok(os.path.exists(b) and open(a, 'rb').read() == open(b, 'rb').read(), f'{slug}: site icon is out of date (run python3 tools/pages.py)')
done(n)

# ------------------------------------------------------------------ registry
head('registry'); n = 0
from screens import JOBS
from features import F
from site_themes import THEME
folders = {f'{info(p)[0]}/{info(p)[1]}' for p in paths}
for name, reg in [('RUNS in tools/readmes.py', RUNS), ('S in tools/readmes.py', ns.get('S', {})), ('JOBS in tools/screens.py', JOBS),
                  ('F in tools/features.py', F), ('THEME in tools/site_themes.py', THEME)]:
    n += 2
    ok(not folders - set(reg), f'{name} is missing {sorted(folders - set(reg))}')
    ok(not set(reg) - folders, f'{name} lists scripts that don\'t exist: {sorted(set(reg) - folders)}')
for p in JOBS:
    n += 1
    if JOBS[p][3]: ok(p in carry.FIRST, f'{p} has tabs, so tools/carry.py FIRST needs its first tab\'s name')
for a, b in ns.get('PAIR', {}).items(): n += 1; ok(a in folders and b in folders, f'PAIR {a} <-> {b} names a script that doesn\'t exist')
done(n)

# ------------------------------------------------------------------ commits
head('commits'); n = 0
for line in git('log', '--format=%H%x09%ae%x09%B%x1e', 'origin/main..HEAD').stdout.split('\x1e'):
    if not line.strip(): continue
    sha, email, body = line.strip().split('\t', 2); n += 2
    ok(email == '352074181+JigglyPug@users.noreply.github.com', f'commit {sha[:7]} is not by JigglyPug\'s noreply address')
    ok(not re.search(r'claude\.ai|Claude-Session|session_0', body), f'commit {sha[:7]} has a chat or session link in its message')
print('  ✓ nothing waiting to push') if n == 0 else done(n)

# ------------------------------------------------------------------ settings + glitches
if '--quick' not in args:
    targets = [p for p in (list(RUNS) if '--all' in args else changed)]
    head('settings')
    if not targets: print('  ✓ no script differs from GitHub')
    else:
        for p in targets:
            try: probs, k = carry.check(p)
            except Exception as e: probs, k = [f'test could not run: {e}'], 0
            for x in probs: ok(False, f'{p.split("/")[1]}: {x}')
            if not probs: print(f'  ✓ {p.split("/")[1]}: {k} settings carry over')
    head('glitches')
    if not targets: print('  ✓ no script differs from GitHub')
    else:
        r = subprocess.run([sys.executable, f'{HERE}/audit.py'] + [p.split('/')[1] for p in targets], capture_output=True, text=True)
        ok(r.returncode == 0, f'the glitch check crashed (exit {r.returncode}): ' + (r.stderr.strip().splitlines() or ['no output'])[-1])
        cur = ''; seen = set()
        for l in r.stdout.splitlines():
            if l.startswith('== '): cur = l[3:].split(':')[0].split('/')[1]; seen.add(cur); (print(f'  ✓ {cur}: clean') if l.endswith('clean') else None)
            elif l.strip() and cur: ok(False, f'{cur}: {l.strip()}')
        for p in targets:   # every script asked about must report back; silence is not a pass
            ok(p.split('/')[1] in seen, f'{p.split("/")[1]}: the glitch check gave no result')

# ------------------------------------------------------------------ generated
if '--quick' not in args:
    head('generated')
    import shutil, tempfile, filecmp
    tmp = tempfile.mkdtemp(); copy = f'{tmp}/repo'
    shutil.copytree(R, copy, ignore=shutil.ignore_patterns('.git', '__pycache__'))
    r = subprocess.run([sys.executable, f'{copy}/tools/pages.py'], capture_output=True, text=True)
    if ok(r.returncode == 0, 'tools/pages.py failed: ' + (r.stderr.strip().splitlines() or ['no output'])[-1]):
        # text outputs only: the link-preview PNGs aren't byte-for-byte repeatable
        gen = [f for f in glob.glob(f'{copy}/**/*', recursive=True) if re.search(r'(README\.md|\.html|\.css|banner\.svg)$', f)]
        stale = [os.path.relpath(f, copy) for f in gen
                 if not os.path.exists(f'{R}/{os.path.relpath(f, copy)}') or not filecmp.cmp(f, f'{R}/{os.path.relpath(f, copy)}', shallow=False)]
        for f in stale: ok(False, f'{f} doesn\'t match what tools/pages.py builds (hand-edited or not rebuilt; run python3 tools/pages.py)')
        if not stale: print(f'  ✓ {len(gen)} generated files match')
    shutil.rmtree(tmp, ignore_errors=True)

print('\n' + ('All checks passed.' if not fails else f'{len(fails)} problem(s) to fix before pushing.'))
sys.exit(1 if fails else 0)
