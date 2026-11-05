"""Release check: run this before every push. It should end with "All checks passed".

    python3 tools/check.py           # rules for every script; glitch and settings tests for the
                                     # scripts whose code differs from GitHub
    python3 tools/check.py --all     # glitch and settings tests for every script too (slow)
    python3 tools/check.py --quick   # rules only, no browser tests

It checks, in order:
  scripts    each script parses, its header lines match CLAUDE.md, its version fallbacks match
             @version, and a changed script has a higher @version than the live one
  frame      panel rules from CLAUDE.md: menu wording, on/off wording, no dropdowns, Esc closes,
             footer, Troubleshooting (when the script has logging), static vs live icon tiles
  privacy    no personal info, Greasy Fork links, local paths or chat links in scripts, pages
             or tools
  pages      every page and README shows each script's current version; icons are in place;
             every script has a RUNS entry
  commits    commits not yet pushed are by JigglyPug and carry no chat or session links
  settings   tools/carry.py: settings and saved data survive the update (changed scripts)
  glitches   tools/audit.py: no visual glitches at laptop, desktop and phone sizes (changed scripts)
"""
import glob, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
args = sys.argv[1:]
RAW = 'https://raw.githubusercontent.com/JigglyPug/glassware/main'
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

git('fetch', '-q', 'origin')
def live(plat, slug):
    r = git('show', f'origin/main:{plat}/{slug}/{slug}.user.js'); return r.stdout if r.returncode == 0 else None
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
    if slug in STATIC: ok('const ICON_SRC = ' in src, f'{slug}: static header tile should embed the app icon (python3 tools/panel_icons.py)')
    if slug in LIVE: ok('ICON_SRC' not in src and 'function glassGlyph(' in src, f'{slug}: live header tile should draw glassGlyph(), never the static icon image')
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
        import carry
        for p in targets:
            probs, k = carry.check(p)
            for x in probs: ok(False, f'{p.split("/")[1]}: {x}')
            if not probs: print(f'  ✓ {p.split("/")[1]}: {k} settings carry over')
    head('glitches')
    if not targets: print('  ✓ no script differs from GitHub')
    else:
        r = subprocess.run([sys.executable, f'{HERE}/audit.py'] + [p.split('/')[1] for p in targets], capture_output=True, text=True)
        cur = ''
        for l in r.stdout.splitlines():
            if l.startswith('== '): cur = l[3:].split(':')[0].split('/')[1]; (print(f'  ✓ {cur}: clean') if l.endswith('clean') else None)
            elif l.strip() and cur: ok(False, f'{cur}: {l.strip()}')

print('\n' + ('All checks passed.' if not fails else f'{len(fails)} problem(s) to fix before pushing.'))
sys.exit(1 if fails else 0)
