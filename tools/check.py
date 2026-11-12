"""Release check: run this before every push. It should end with "All checks passed".

    python3 tools/check.py           # rules for every script; glitch and settings tests for the
                                     # scripts whose code differs from GitHub
    python3 tools/check.py --all     # glitch and settings tests for every script too (slow)
    python3 tools/check.py --quick   # rules only, no browser tests
    python3 tools/check.py --quick --ci   # what GitHub runs on every push (.github/workflows/checks.yml):
                                     # everything but the glitch check, the performance test and the
                                     # screenshot comparison

Everything fails closed: if GitHub can't be reached, or a test crashes or reports nothing,
that's a failure, never a pass.

It checks, in order:
  scripts    each script parses, its header lines match CLAUDE.md, its version fallbacks match
             @version, and a changed script has a higher @version than the live one
  frame      panel rules from CLAUDE.md: menu wording, on/off wording, no dropdowns, Esc closes,
             footer, Troubleshooting (when the script has logging), static vs live icon tiles; also
             run on a script freshly made by tools/new_script.py from tools/kit/example.json; the
             shared controls match tools/frame.py in every script and aren't styled anywhere else
  theme      light and dark from CLAUDE.md: the sun/moon switch, Appearance and "Match my device",
             appearance defaults to auto and follows the device live, the glass recipe numbers, and
             a -light twin for every screenshot, selection and focus rings in the accent
  tokens     CLAUDE.md's tables match tools/lib/tokens.json, and no tool keeps its own copy of a token
  tools      the development tools' pins agree (package.json, its lockfile, requirements.txt);
             warns when what's installed differs
  permissions  every @grant is used; @connect * scripts only request public addresses
  privacy    no personal info, Greasy Fork links, local paths or chat links in scripts, pages
             or tools
  pages      every page and README shows each script's current version; icons are in place;
             every script has a RUNS entry
  registry   every script is listed everywhere the tools need it (pages, screenshots, tests)
  commits    commits not yet pushed are by JigglyPug and carry no chat or session links
  generated  the pages rebuild to exactly what's committed (no hand edits, nothing stale)
  changes    each script's CHANGES.md starts at its @version, newest first, every entry with a line
  touch      tools/tests/touchtest.py: every phone sheet with real touches: taps work, a scroll stays in the
             sheet, nothing reaches the page, the handle swipes it closed (phone scripts changed)
  settings   tools/tests/carry.py: settings and saved data survive the update, from the live version and from
             several releases back (changed scripts)
  glitches   tools/tests/audit.py: no visual glitches at laptop, desktop and phone sizes, glass on the
             recipe, nothing faint or hard to see, in both themes (changed scripts)
  network    tools/tests/nettest.py: Prism, Looking-Glass and Kaleidoscope (both) cope with requests that hang, fail,
             return junk or drop (when one of them or the test changed)
  hand-off   tools/tests/ownertest.py: Prism keeps standing by for a script that holds the title bar, also
             after being switched off and on (when Prism or the test changed)
  logging    tools/tests/logtest.py: with logging on, Molten Tools never prints an account's name, handle,
             email or id (when Molten Tools changed)
  kaleidoscope  tools/tests/boardtest.py: a hostile board can't send anything out; tools/tests/handofftest.py:
             a prompt goes only to the claude.ai tab opened for it (when Kaleidoscope changed)
  dashboard  the demo history matches its generator; tools/tests/dash.py: every Hourglass card answers
             its question in a sentence that names the change, no figure on two cards, labelled
             axes; tools/tests/importtest.py: Import settings keeps any file it's given in range, skips what
             it can't read and won't read one over 1 MB (when Hourglass changed)
  live       tools/tests/live.py: every control updates the panel on the spot, in the same tab and in a
             second open tab, with nothing waiting for a reopen (changed scripts)
  performance  tools/tests/perf.py: over a long session nothing a script leaves behind keeps growing
             (memory, elements, listeners, timers, page watchers) and it stays within its time
             budgets; the test proves itself on a deliberately bad script first (changed scripts,
             or when the test itself changed)
  screenshots the committed panel screenshots still match the panels (changed scripts)

GitHub skips the glitch check (phone sizes draw in Roboto), the performance test (shared machines time
unevenly). It compares screenshots too; only Kaleidoscope's two panels are report-only there (issue #3).
"""
import glob, json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path[:0] = [HERE] + [os.path.join(HERE, d) for d in ('lib', 'build', 'tests')]
args = sys.argv[1:]
RAW = 'https://raw.githubusercontent.com/JigglyPug/glassware/main'
HISTORY = re.compile(r'(?i)\b(before|from|since|until|earlier|older|used to|renamed|migrat\w*)\b')
STATIC = {'molten-tools', 'molten-for-reddit', 'molten-for-reddit-mobile', 'kaleidoscope', 'kaleidoscope-mobile'}
LIVE = {'prism', 'hourglass', 'looking-glass'}
fails = []; section = ''
import time as _time
TIMES = []   # (section, when it started): the slow ones are listed at the end
def head(name): global section; section = name; TIMES.append((name, _time.time())); print(f'\n{name}')
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
    m = re.search(r'(?m)^//[ \t]*@' + k + r'(?:[ \t]+(.*?))?[ \t]*$', src); return (m.group(1) or '') if m else None   # one line only: an empty @namespace is valid

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
    # settings under a switch fold away while it's off (data-fold), never just dimmed (tools/tests/live.py checks the panels)
    n += 1; ok(not re.search(r"\? '' : '[\w-]*off'\)|\? '[\w-]*off' : ''\)", src), f"{slug}: a group is dimmed with an 'off' class by its switch: fold it away instead (data-fold; CLAUDE.md, the panel frame)")
    # CHANGES.md: every release says what changed, in words a person reads; the newest is this @version
    cf = f'{R}/{plat}/{slug}/CHANGES.md'; n += 1
    if not os.path.exists(cf): ok(False, f'{slug}: no CHANGES.md'); continue
    ct = open(cf, encoding='utf-8').read()
    heads = re.findall(r'(?m)^## (\S+) · (\d{4}-\d\d-\d\d)$', ct)
    vs = [x[0] for x in heads]
    if not heads: ok(False, f'{slug}: CHANGES.md has no "## <version> · <date>" entries'); continue
    n += 4
    ok(vs[0] == v, f'{slug}: CHANGES.md starts at {vs[0]}, but @version is {v}: add an entry saying what {v} changes')
    ok(all(vtuple(a) > vtuple(b) for a, b in zip(vs, vs[1:])), f'{slug}: CHANGES.md versions should go newest first, each once')
    ok(all(a[1] >= b[1] for a, b in zip(heads, heads[1:])), f'{slug}: CHANGES.md dates should go newest first')
    bodies = re.split(r'(?m)^## .*$', ct)[1:]
    ok(all(re.search(r'(?m)^- \S', b) for b in bodies), f'{slug}: every CHANGES.md entry needs at least one "- " line')
done(n)

# The new-script kit (tools/new_script.py) must keep producing scripts that pass every rule below,
# so its example spec is generated here and checked with the real scripts.
import json, new_script
_kit = new_script.load(f'{HERE}/kit/example.json', fresh=False); _kit['slug'] = 'kit-example'
KIT = {f"{R}/{_kit['folder']}/kit-example/kit-example.user.js": new_script.script(_kit)}
import tempfile
with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as _f: _f.write(next(iter(KIT.values())))

# ------------------------------------------------------------------ frame
head('frame'); n = 0
# the shared controls are stamped from tools/frame.py: every copy must match it, and nothing else may style them
r = subprocess.run([sys.executable, f'{HERE}/frame.py', '--check'], capture_output=True, text=True); n += 1
ok(r.returncode == 0, 'shared panel frame: ' + ('; '.join(l[2:] for l in r.stdout.splitlines() if l.startswith('✗'))[:400] or r.stderr.strip()[-300:]))
import frame as _frame
for p in paths:
    n += 1; ok(f'{info(p)[0]}/{info(p)[1]}' in _frame.FRAMES, f'{info(p)[1]}: list it in FRAMES in tools/frame.py so its shared controls are stamped')
ok(subprocess.run(['node', '--check', _f.name], capture_output=True).returncode == 0, 'tools/kit/template.js makes a script with a syntax error (python3 tools/new_script.py tools/kit/example.json --dry)'); n += 1
for p, src in {**S, **KIT}.items():
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
for f in ['CLAUDE.md', 'tools/build/readmes.py', 'tools/build/features.py', 'tools/build/site_themes.py']:
    for i, line in enumerate(open(f'{R}/{f}', encoding='utf-8'), 1):
        m = re.search(r'\b\d+\.\d+\.\d+\b', re.sub(r'https?://\S+', '', line)); n += 1
        ok(not m or HISTORY.search(line), f'{f}:{i} names version {m.group(0) if m else ""}; pages take versions from @version, so write it without one' if m else '')
done(n)

# ------------------------------------------------------------------ theme
# The glass recipe and light/dark rules in CLAUDE.md. tools/tests/audit.py checks the same recipe on the
# rendered panels (opacity and blur of every frosted surface, faint text) in both themes.
head('theme'); n = 0
TOKENS = json.load(open(f'{HERE}/lib/tokens.json', encoding='utf-8')); G = TOKENS['glass']   # tools/lib/tokens.json
RECIPE = [(G['light']['edge'], 'light edge'), (G['dark']['edge'], 'dark edge'), (G['dark']['highlight'], 'dark top highlight'),
          (G['light']['drop'], 'light drop shadow'), (G['dark']['drop'], 'dark drop shadow')]
TEXT = [(G['light']['text'], 'light text'), (G['dark']['text'], 'dark text'), (G['light']['sub'], 'light secondary text'), (G['dark']['sub'], 'dark secondary text')]
BLUR = f"blur({G['blur']}px) saturate({G['saturate']}%)"
op = lambda v: ('%g' % v).lstrip('0')   # .84, .8
for p, src in {**S, **KIT}.items():
    plat, slug = info(p); n += 7
    ok("'Dark mode'" in src, f'{slug}: header needs the sun/moon switch (aria-label "Dark mode")')
    ok("'Appearance'" in src and 'Match my device' in src, f'{slug}: needs an "Appearance" section with a "Match my device" toggle')
    ok(re.search(r"appearance\W{1,6}'auto'|'appearance',\s*'auto'", src), f"{slug}: appearance should default to 'auto' (follow the device)")
    ok('prefers-color-scheme: dark' in src and re.search(r"addEventListener(\?\.)?\(\s*'change'", src), f'{slug}: should follow the device live (a prefers-color-scheme change listener)')
    bad = [m.group(0) for m in re.finditer(r'blur\([^)]*\)\s*saturate\(' + str(G['saturate']) + r'%\)', src) if m.group(0).replace(' ', '') != BLUR.replace(' ', '')]
    ok(not bad, f'{slug}: glass blur should be {BLUR}, found {bad[:1]}')
    ok(re.search(r'rgba\((2[4-5]\d),\s*(2[4-5]\d),\s*(2[4-5]\d),\s*' + re.escape(op(G['opacity']['light'])) + r'\)', src), f"{slug}: light glass should be {G['light']['glass']} (or tinted, at {op(G['opacity']['light'])})")
    ok(re.search(r'rgba\(([0-4]?\d),\s*([0-4]?\d),\s*([0-4]?\d),\s*' + re.escape(op(G['opacity']['dark'])) + r'\)', src), f"{slug}: dark glass should be {G['dark']['glass']} (or tinted, at {op(G['opacity']['dark'])})")
    # Selection and focus rings use the accent. Browsers that darken light pages themselves (some
    # phone browsers) leave outlines alone, so a black or text-colored ring vanishes there.
    m = re.search(r"outline:\s*[^;'\"}]*?(var\(--(?:[a-z]+-)?(?:text|sub|title|strong|muted|dim|line|ctl)\b|#(?:000|000000|fff|ffffff|1d1d1f)\b|rgba?\((?:0,\s*0,\s*0|255,\s*255,\s*255)\b)", src, re.I)
    n += 1; ok(not m, f'{slug}: outline in a neutral color ({m.group(0) if m else ""}); selection and focus rings use the accent')
    for tok, what in RECIPE + ([] if slug.startswith('kaleidoscope') else TEXT):
        n += 1; ok(tok in src, f'{slug}: missing the recipe\'s {what} {tok}')
    for img in glob.glob(f'{R}/{plat}/{slug}/images/*.webp'):
        if img.endswith('-light.webp') or img.endswith('-cut.webp'): continue   # a cut is both themes already
        n += 1; ok(os.path.exists(img[:-5] + '-light.webp'), f'{slug}: {os.path.basename(img)} has no light twin (python3 tools/screens.py {slug})')
done(n)

# ------------------------------------------------------------------ tokens
# tools/lib/tokens.json is the one source of the design numbers: CLAUDE.md's tables must say the same, and
# no tool may keep its own copy of a token value (it reads the file instead).
head('tokens'); n = 0
doc = open(f'{R}/CLAUDE.md', encoding='utf-8').read()
ROWS = {'glass': 'glass', 'edge': 'edge', 'top highlight (inset)': 'highlight', 'drop shadow': 'drop', 'text': 'text', 'secondary text': 'sub'}
for row, key in ROWS.items():
    n += 1; want = f"| {row} | `{G['light'][key]}` | `{G['dark'][key]}` |"
    ok(want in doc, f'CLAUDE.md glass table: the "{row}" row should read {want} (tools/lib/tokens.json)')
C = TOKENS['controls']; tg = C['toggle']; SH = TOKENS['shape']
for want in [f"backdrop-filter: blur({G['blur']}px) saturate({G['saturate']}%)", f"{round(G['opacity']['light'] * 100)}% light, {round(G['opacity']['dark'] * 100)}% dark",
             f"| icon tile | {C['tile']['size']}×{C['tile']['size']}, {C['tile']['radius']}px corners |",
             f"| name / tagline | {C['name']}px semibold / {C['tagline']}px",
             f"| sun/moon switch | {C['mode']['w']}×{C['mode']['h']} track, {C['mode']['knob']}px knob",
             f"| close button | {C['close']['desktop']}×{C['close']['desktop']} round, {C['close']['gap']}px after the switch | {C['close']['phone']}×{C['close']['phone']} |",
             f"| toggle | {tg['desktop']['w']}×{tg['desktop']['h']} track, {tg['desktop']['knob']}px knob, 2px in | {tg['phone']['w']}×{tg['phone']['h']}, {tg['phone']['knob']}px knob |",
             f"| panel | {SH['panel']['width']}px wide (Hourglass 760px), {SH['panel']['radius']}px corners; phone sheets {SH['panel']['sheet']}px top corners |",
             f"| insets | icon tile and close button {SH['inset']['head']}px from the panel's edges; tab bar {SH['inset']['tabs']}px from each side |",
             "| corner scale | " + ' · '.join(f"{v} {k}" for k, v in SH['radius'].items()) + " |",
             f"text under {TOKENS['contrast']['text']}:1", f"marks under\n  {TOKENS['contrast']['mark']}:1".replace('\\n', '\n')]:
    n += 1; ok(want.replace('\n  ', ' ') in doc.replace('\n  ', ' '), f'CLAUDE.md should say "{want.strip()}" (tools/lib/tokens.json)')
for m in ('light', 'dark'):   # the glass color and the opacity token must agree
    n += 1; a = re.search(r',\s*([\d.]+)\)$', G[m]['glass'])
    ok(a and abs(float(a.group(1)) - G['opacity'][m]) < 1e-9, f"tools/lib/tokens.json: {m} glass {G[m]['glass']} doesn't match its opacity {G['opacity'][m]}")
tpl = open(f'{R}/tools/kit/template.js', encoding='utf-8').read()
for ph in ('__W_PANEL__', '__R_PANEL__', '__R_SHEET__', '__R_CARD__', '__I_HEAD__', '__I_TABS__'):
    n += 1; ok(ph in tpl, f'tools/kit/template.js should take the panel shape from the tokens ({ph})')
copies = [G[m][k] for m in ('light', 'dark') for k in ('glass', 'sub')] + [f"blur({G['blur']}px)"]
# (the tools that build or test panels; the README banners have their own page palettes)
for f in ['tools/frame.py', 'tools/lib/shot.js', 'tools/build/prismcut.py', 'tools/new_script.py', 'tools/kit/template.js', 'tools/tests/audit.py', 'tools/tests/live.py']:
    t = open(f'{R}/{f}', encoding='utf-8').read(); n += 1
    hit = [c for c in copies if c in t]
    ok(not hit, f'{f} keeps its own copy of a design token ({hit[:1]}); read it from tools/lib/tokens.json')
done(n)

# ------------------------------------------------------------------ privacy
head('privacy'); n = 0
BAD = [(r'greasyfork', 'a Greasy Fork link'), (r'claude\.ai/code|Claude-Session|session_0', 'a chat or session link'),
       (r'(?i)\bpreston\b|\bbugg\b', 'a real name'), (r'/home/[a-z]|/Users/[A-Za-z]|C:\\\\Users', 'a local path'),
       (r'[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com)[A-Za-z0-9-]+\.(com|net|org|io|dev)\b', 'an email address'),
       (r'(?i)claude code|anthropic|co-authored-by', 'a mention of this workflow')]
# the repo's own files (tracked, or new and not ignored): never installed packages like node_modules
files = [f'{R}/{p}' for p in git('ls-files', '--cached', '--others', '--exclude-standard').stdout.split('\n')
         if p and re.search(r'\.(js|py|md|html|css|svg|txt|json|yml)$', p) and os.path.isfile(f'{R}/{p}')]
for f in files:
    t = open(f, encoding='utf-8', errors='ignore').read(); rel = os.path.relpath(f, R)
    for pat, what in BAD:
        if rel == 'tools/check.py' or (rel == 'CLAUDE.md' and what == 'a chat or session link'): continue   # these name the patterns
        if what == 'a mention of this workflow' and not rel.endswith('.user.js'): continue
        if what == 'an email address' and re.search(r'@(example|domain)\.', t): continue
        m = re.search(pat, t); n += 1
        ok(not m, f'{rel} contains {what}: "{m.group(0)}"' if m else '')
# console logging is off unless someone turns it on, and never names an account (a shared console capture
# shouldn't): a debug or logging setting that defaults to true, or a log line that prints a saved account name
for f in sorted(glob.glob(f'{R}/*/*/*.user.js')):
    t = open(f, encoding='utf-8').read(); rel = os.path.relpath(f, R); n += 2
    m = re.search(r"""(?:gmGet|GM_getValue|get)\(\s*'[^']*(?:[Dd]ebug|[Ll]og)[^']*'\s*,\s*true\s*\)""", t)
    ok(not m, f'{rel}: console logging is on by default ({m.group(0)}); default it to off' if m else '')
    # any logging or failure-reporting call (log, glog, fail, warn, console.*) with an account name in it
    m = re.search(r"\b(?:\w*log\w*|fail|warn\w*|error|debug|console\.\w+)\([^\n]*\b(?:cfg|acct|account|priv)\.(?:name|email|handle|found)\b(?!\.length)", t)
    ok(not m, f'{rel}: a log line prints an account name ({m.group(0)}); leave names out of logs' if m else '')
done(n)

# ------------------------------------------------------------------ tools
# the development tools are pinned (package.json + package-lock.json, requirements.txt); a different
# installed version can change screenshots, so say so (a warning, not a failure)
head('tools'); n = 0
# requirements.in holds the chosen pins; requirements.txt is the full lock made from it, every package hashed
import re as _re
pin_re = _re.compile(r'^([A-Za-z0-9_.-]+)==([^\s\\;]+)')
def locked(name, src):
    """The pins chosen in <src>; the lock <name> made from them, every package hashed."""
    global n
    lock_txt = open(f'{HERE}/{name}').read()
    pins = {m.group(1).lower(): m.group(2) for m in map(pin_re.match, lock_txt.splitlines()) if m}
    chosen = {m.group(1).lower(): m.group(2) for m in map(pin_re.match, open(f'{HERE}/{src}').read().splitlines()) if m}
    blocks = _re.split(r'\n(?=[A-Za-z0-9_.-]+==)', lock_txt)
    unhashed = [b.split('==')[0].split('\n')[-1] for b in blocks if '==' in b and '--hash=sha256:' not in b]
    n += 2
    ok(all(pins.get(k) == v for k, v in chosen.items()), f'{name} is out of step with {src} ({chosen}): run uv pip compile (see {src})')
    ok(not unhashed, f'{name} has packages without hashes: {unhashed}')
    return pins
pins = locked('requirements.txt', 'requirements.in')
locked('requirements-audit.txt', 'requirements-audit.in')     # pip-audit, which GitHub's "audit" job runs
# GitHub's "audit" job checks both locks and the Node lock for known vulnerabilities, weekly and on every push
wf = open(f'{R}/.github/workflows/checks.yml').read()
n += 1
ok(all(x in wf for x in ('\n  audit:', 'working-directory: tools', 'npm audit', 'pip-audit -r requirements.txt --require-hashes', 'pip-audit -r requirements-audit.txt --require-hashes', 'schedule:')),
   ".github/workflows/checks.yml has lost its audit job (npm audit and pip-audit on both locks, weekly too)")
# a pin changed: look for known vulnerabilities here too, before it ships (fails closed if the checker is missing).
# Not on GitHub (--ci): there the "audit" job does it, with pip-audit installed from its own lock.
pinfiles = ['tools/package-lock.json', 'tools/requirements.txt', 'tools/requirements-audit.txt']
if '--ci' not in args and ('--all' in args or git('diff', '--quiet', 'origin/main', '--', *pinfiles).returncode != 0):
    n += 2
    r = subprocess.run(['npm', 'audit', '--audit-level=low'], cwd=HERE, capture_output=True, text=True)
    clean = r.returncode == 0
    ok(clean, 'npm audit: ' + ((r.stdout.strip().splitlines() or ['no output'])[-1]))
    try:
        r = subprocess.run(['pip-audit', '-r', f'{HERE}/requirements.txt', '-r', f'{HERE}/requirements-audit.txt', '--require-hashes', '--disable-pip'],
                           capture_output=True, text=True, timeout=600)
        clean &= r.returncode == 0
        ok(r.returncode == 0, 'pip-audit: ' + (((r.stdout.strip() or r.stderr.strip()).splitlines() or ['no output'])[-1]))
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        clean = False; ok(False, f'a pin changed and pip-audit could not run ({type(e).__name__}; install it from requirements-audit.txt)')
    if clean: print('  ✓ the changed pins have no known vulnerabilities (npm audit, pip-audit)')
pkg = json.load(open(f'{HERE}/package.json')); lock = json.load(open(f'{HERE}/package-lock.json'))
npin = pkg['devDependencies']['playwright']
n += 2
ok(lock['packages'].get('node_modules/playwright', {}).get('version') == npin, 'package-lock.json is out of step with package.json (run npm install --package-lock-only)')
ok(pins.get('playwright') == npin, f'requirements.txt pins playwright {pins.get("playwright")}, package.json {npin}: keep them the same')
try:
    import importlib.metadata as md
    have = {k: md.version(k) for k in pins}
except Exception as e: have = {}
r = subprocess.run(['node', '-e', "console.log(require('playwright/package.json').version)"], capture_output=True, text=True)
have['playwright (node)'] = r.stdout.strip() or 'missing'
for k, v in have.items():
    want = pins.get(k.split(' ')[0])
    if v != want: print(f'  ⚠ {k} {v} is installed; the pinned version is {want} (screenshots may differ)')
# main is protected against force pushes and deletion and takes only commits whose checks passed (a
# ruleset, set by hand in the repo's settings; tools/push.py is how changes reach it)
r = subprocess.run(['gh', 'api', 'repos/JigglyPug/glassware/rules/branches/main'], capture_output=True, text=True)
try: kinds = {x.get('type') for x in json.loads(r.stdout)}
except ValueError: kinds = None
if kinds is None: print("  ⚠ couldn't read main's rules from GitHub")
elif not {'non_fast_forward', 'deletion'} <= kinds: print('  ⚠ main has no ruleset blocking force pushes and deletion (repo Settings → Rules → Rulesets)')
elif 'required_status_checks' not in kinds: print("  ⚠ main doesn't require the checks to pass before it moves (repo Settings → Rules → Rulesets)")
done(n)

# ------------------------------------------------------------------ permissions
# every @grant is used (nothing asked for that isn't needed), and a script that may reach any site
# (@connect *) sends its requests through gwPublicUrl: public http(s) addresses only, never this
# computer or a private network unless the page itself is on one. The helper is the same everywhere.
head('permissions'); n = 0
helpers = {}
for f in sorted(glob.glob(f'{R}/*/*/*.user.js')):
    t = open(f, encoding='utf-8').read(); rel = os.path.relpath(f, R); code = re.sub(r'^// @.*$', '', t, flags=re.M)
    for g in re.findall(r'^// @grant\s+(\S+)', t, re.M):
        if g == 'none': continue
        n += 1; ok(g.split('.')[-1] in code, f'{rel}: @grant {g} is never used; remove it')
    if re.search(r'^// @connect\s+\*\s*$', t, re.M):
        n += 1; m = re.search(r'\n    function gwPublicUrl\(u\) \{.*?\n    \}\n', t, re.S)
        ok(m and t.count('gwPublicUrl(') >= 2, f'{rel}: @connect * without gwPublicUrl() guarding its requests')
        if m: helpers[rel] = m.group(0)
n += 1; ok(len(set(helpers.values())) <= 1, 'gwPublicUrl() differs between ' + ', '.join(helpers) + '; keep one copy of it everywhere')
if helpers:
    CASES = [('https://example.com/a.png', 'https://pub.example/', True), ('http://192.168.1.1/x', 'https://pub.example/', False),
             ('http://localhost:8080/m.json', 'https://pub.example/', False), ('http://127.0.0.1/', 'https://pub.example/', False),
             ('http://[::1]/', 'https://pub.example/', False), ('file:///etc/passwd', 'https://pub.example/', False),
             ('http://10.0.0.5/i.png', 'http://10.0.0.2/', True), ('http://172.20.1.1/', 'https://pub.example/', False),
             ('http://169.254.169.254/latest/', 'https://pub.example/', False), ('http://router.local/', 'https://pub.example/', False),
             ('http://0.0.0.0:8000/', 'https://pub.example/', False)]
    js = next(iter(helpers.values())) + '\nconst out = []; for (const [u, page] of ' + json.dumps([c[:2] for c in CASES]) + \
         ') { global.location = new URL(page); out.push(!!gwPublicUrl(u)); } console.log(JSON.stringify(out));'
    r = subprocess.run(['node', '-e', js], capture_output=True, text=True)
    try: got = json.loads(r.stdout)
    except ValueError: got = []; ok(False, 'gwPublicUrl() test could not run: ' + r.stderr[-200:])
    for (u, page, want), g in zip(CASES, got):
        n += 1; ok(g == want, f'gwPublicUrl("{u}") on {page} should {"allow" if want else "refuse"} it')
done(n)

# ------------------------------------------------------------------ pages
head('pages'); n = 0
src = open(f'{HERE}/build/readmes.py', encoding='utf-8').read(); ns = {'__file__': f'{HERE}/build/readmes.py'}
try: exec(src[:src.index('\nACCENT = {')], ns); RUNS = ns['RUNS']
except AssertionError as e: RUNS = {}; ok(False, f'readmes.py: {e}')
landing = open(f'{R}/docs/index.html', encoding='utf-8').read(); front = open(f'{R}/README.md', encoding='utf-8').read()
for p, s in S.items():
    plat, slug = info(p); v = hdr(s, 'version'); n += 7
    ok(f'{plat}/{slug}' in RUNS, f'{slug} needs a RUNS entry in tools/build/readmes.py')
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
# every script that runs on a phone (and the kit) uses the stamped sheet handling, and is in tools/tests/touchtest.py
import touchtest
for p, src in {**S, **KIT}.items():
    plat, slug = info(p); key = f'{plat}/{slug}'
    if key in RUNS and RUNS[key] == 'desktop': continue
    n += 1; ok(src.count('gwSheetGestures(') >= 2, f'{slug} runs on phones: its sheet should call gwSheetGestures() (the stamped touch handling; tools/frame.py)')
    if key in RUNS: n += 1; ok(key in touchtest.PHONE, f'{slug} runs on phones: add it to PHONE in tools/tests/touchtest.py')
from screens import JOBS
from features import F
from site_themes import THEME
folders = {f'{info(p)[0]}/{info(p)[1]}' for p in paths}
for name, reg in [('RUNS in tools/build/readmes.py', RUNS), ('S in tools/build/readmes.py', ns.get('S', {})), ('JOBS in tools/screens.py', JOBS),
                  ('F in tools/build/features.py', F), ('THEME in tools/build/site_themes.py', THEME)]:
    n += 2
    ok(not folders - set(reg), f'{name} is missing {sorted(folders - set(reg))}')
    ok(not set(reg) - folders, f'{name} lists scripts that don\'t exist: {sorted(set(reg) - folders)}')
for p in JOBS:
    n += 1
    if JOBS[p][3]: ok(p in carry.FIRST, f'{p} has tabs, so tools/tests/carry.py FIRST needs its first tab\'s name')
import panel_icons
icons_js = open(f'{HERE}/icons.js', encoding='utf-8').read()
for p in folders:
    slug = p.split('/')[1]; n += 3
    ok(slug in STATIC or slug in LIVE, f'{slug}: add it to STATIC or LIVE at the top of tools/check.py (CLAUDE.md: header icon tiles)')
    ok(re.search(r"(?m)^\s*(ICONS\[)?['\"]" + re.escape(slug) + r"['\"]", icons_js), f'{slug}: tools/icons.js has no icon for it')
    ok(slug not in STATIC or p in panel_icons.SCRIPTS, f'{slug}: static tile, so tools/panel_icons.py SCRIPTS needs it')
for a, b in ns.get('PAIR', {}).items(): n += 1; ok(a in folders and b in folders, f'PAIR {a} <-> {b} names a script that doesn\'t exist')
done(n)

# ------------------------------------------------------------------ commits
head('commits'); n = 0
for line in git('log', '--format=%H%x09%ae%x09%B%x1e', 'origin/main..HEAD').stdout.split('\x1e'):
    if not line.strip(): continue
    sha, email, body = line.strip().split('\t', 2); n += 2
    ok(email == '352074181+JigglyPug@users.noreply.github.com', f'commit {sha[:7]} is not by JigglyPug\'s noreply address')
    ok(not re.search(r'claude\.ai/|Claude-Session|session_0', body), f'commit {sha[:7]} has a chat or session link in its message')
print('  ✓ nothing waiting to push') if n == 0 else done(n)

# ------------------------------------------------------------------ settings + glitches
# GitHub (--ci) runs these too: settings carry-over, live updates and the generated pages.
# The glitch check and the performance test stay here (Roboto for phones; shared machines time unevenly).
FULL = '--quick' not in args or '--ci' in args
targets = [p for p in (list(RUNS) if '--all' in args else changed)]
if FULL:
    head('settings')
    if not targets: print('  ✓ no script differs from GitHub')
    else:
        # from the live version, and from CARRY_BACK releases before it: people who skipped updates (browser
        # closed for weeks, Tampermonkey's updates off) jump several versions at once. All side by side.
        from par import pmap
        def carried(job):
            p, back = job
            try:
                v = carry.old_source(p, back)[1] if back else None
                if back and v is None: return None                 # too new to have that many releases
                return carry.check(p, back) + (v,)
            except Exception as e: return [f'test could not run: {e}'], 0, '?' if back else None
        jobs = [(p, back) for p in targets for back in (0, carry.CARRY_BACK)]
        for (p, back), res in zip(jobs, pmap(carried, jobs, 3)):
            if res is None: continue
            probs, k, v = res
            for x in probs: ok(False, f'{p.split("/")[1]}{f" from {v}" if back else ""}: {x}')
            if probs: continue
            if back: print(f'  ✓ {p.split("/")[1]}: {k} settings carry over from {v} too')
            else: print(f'  ✓ {p.split("/")[1]}: ' + ('new script, nothing to carry over yet' if k is None else f'{k} settings carry over'))
if '--quick' not in args:
    head('glitches')
    if not targets: print('  ✓ no script differs from GitHub')
    else:
        r = subprocess.run([sys.executable, f'{HERE}/tests/audit.py'] + [p.split('/')[1] for p in targets], capture_output=True, text=True)
        ok(r.returncode == 0, f'the glitch check crashed (exit {r.returncode}): ' + (r.stderr.strip().splitlines() or ['no output'])[-1])
        cur = ''; seen = set()
        for l in r.stdout.splitlines():
            if l.startswith('== '): cur = l[3:].split(':')[0].split('/')[1]; seen.add(cur); (print(f'  ✓ {cur}: clean') if l.endswith('clean') else None)
            elif l.strip() and cur: ok(False, f'{cur}: {l.strip()}')
        for p in targets:   # every script asked about must report back; silence is not a pass
            ok(p.split('/')[1] in seen, f'{p.split("/")[1]}: the glitch check gave no result')

# ------------------------------------------------------------------ dashboard
head('dashboard')
# the demo history is written by its generator, never by hand
import importlib.util
spec = importlib.util.spec_from_file_location('hgseed', f'{HERE}/seeds/hourglass.py'); hgseed = importlib.util.module_from_spec(spec); spec.loader.exec_module(hgseed)
ok(json.load(open(f'{HERE}/seeds/hourglass.json')) == json.loads(json.dumps(hgseed.make('habit'))),
   'tools/seeds/hourglass.json differs from what tools/seeds/hourglass.py writes (run python3 tools/seeds/hourglass.py)')
if not any(f.startswith('dashboard:') for f in fails): print('  ✓ the demo history matches its generator')
if '--ci' in args or ('--quick' not in args and ('--all' in args or 'desktop/hourglass' in changed)):
    r = subprocess.run([sys.executable, f'{HERE}/tests/dash.py'], capture_output=True, text=True)
    runs = 0
    for l in r.stdout.splitlines():
        if l.startswith('== '): runs += 1; (print(f'  ✓ {l[3:].split(":")[0]}: every card answers its question') if l.endswith('clean') else None)
        elif l.strip(): ok(False, f'hourglass dashboard: {l.strip()}')
    want = 2 * len(hgseed.PLANTED)
    ok(runs == want, f'the dashboard test reported {runs} of {want} runs: ' + (r.stderr.strip().splitlines() or ['no output'])[-1])
    # tools/tests/importtest.py: Import settings takes any file (damaged, from another app, huge) without harm
    r = subprocess.run([sys.executable, f'{HERE}/tests/importtest.py'], capture_output=True, text=True)
    runs = [l for l in r.stdout.splitlines() if l.startswith('== ')]
    for l in runs:
        if not l.endswith('clean'): ok(False, l[3:])
    ok(len(runs) >= 9, f'the import test reported {len(runs)} of 9 cases: ' + (r.stderr.strip().splitlines() or ['no output'])[-1])
    if len(runs) >= 9 and r.returncode == 0: print('  ✓ hourglass import: damaged, foreign, out-of-range and oversized files change nothing they shouldn\'t')

# ------------------------------------------------------------------ kaleidoscope
# a board is AI-written code: tools/tests/boardtest.py proves a hostile one can't send anything out, and
# tools/tests/handofftest.py that a prompt only goes to the claude.ai tab Kaleidoscope opened for it
if '--ci' in args or ('--quick' not in args and ('--all' in args or 'desktop/kaleidoscope' in changed)):
    head('kaleidoscope')
    for tool, goods in (('boardtest.py', ["a hostile board gets nothing out; covers, the API and AniList links still work"]),
                        ('handofftest.py', ["a prompt goes only to the claude.ai tab opened for it",
                                            "a blocked or closed Claude tab ends cleanly, with a message",
                                            "damaged hand-off storage is cleared or skipped, never breaks a page"])):
        r = subprocess.run([sys.executable, f'{HERE}/tests/{tool}'], capture_output=True, text=True)
        lines = [l for l in r.stdout.splitlines() if l.strip()]
        runs = [l for l in lines if l.startswith('== ')]
        ok(len(runs) >= len(goods), f'tools/{tool} reported {len(runs)} of {len(goods)} parts: ' + ((r.stderr.strip().splitlines() or ['no output'])[-1]))
        for l in lines:
            if l.startswith('== ') and l.endswith('clean'): print('  ✓ ' + (goods[runs.index(l)] if runs.index(l) < len(goods) else l[3:]))
            elif not l.startswith('== '): ok(False, l[3:].split(':')[0] + ': ' + l.strip() if l.startswith('== ') else 'kaleidoscope: ' + l.strip())

# ------------------------------------------------------------------ touch
# tools/tests/touchtest.py: every phone sheet with real touches (taps, a scroll inside, the handle), none reaching the page
TOUCHES = list(touchtest.PHONE)
touch_tool = git('diff', '--quiet', 'origin/main', '--', 'tools/tests/touchtest.py', 'tools/tests/touch_drive.js', 'tools/frame.py').returncode != 0
if '--ci' in args or ('--quick' not in args and ('--all' in args or touch_tool or any(p in changed for p in TOUCHES))):
    head('touch')
    r = subprocess.run([sys.executable, f'{HERE}/tests/touchtest.py'], capture_output=True, text=True)
    runs = [l for l in r.stdout.splitlines() if l.startswith('== ')]
    for l in runs: ok(l.endswith('clean'), 'touch: ' + l[3:]) if not l.endswith('clean') else print('  ✓ ' + l[3:].replace(': clean', ': taps, scrolling, the handle; nothing reaches the page'))
    ok(len(runs) == len(TOUCHES), f'the touch test reported {len(runs)} of {len(TOUCHES)} sheets: ' + (r.stderr.strip().splitlines() or ['no output'])[-1])

# ------------------------------------------------------------------ network
# tools/tests/nettest.py: Prism, Looking-Glass and Kaleidoscope (both) cope when requests hang, fail, return junk or drop
NETS = ['desktop/prism', 'desktop/looking-glass', 'desktop/kaleidoscope', 'mobile/kaleidoscope-mobile']
net_tool = git('diff', '--quiet', 'origin/main', '--', 'tools/tests/nettest.py').returncode != 0
if '--ci' in args or ('--quick' not in args and ('--all' in args or net_tool or any(p in changed for p in NETS))):
    head('network')
    r = subprocess.run([sys.executable, f'{HERE}/tests/nettest.py'], capture_output=True, text=True)
    seen = 0
    for l in r.stdout.splitlines():
        if not l.startswith('== '): continue
        seen += 1
        if not l.endswith('clean'): ok(False, 'network: ' + l[3:])
    ok(seen == 24, f'the network test reported {seen} of 24 cases: ' + (r.stderr.strip().splitlines() or ['no output'])[-1])
    if seen == 24 and r.returncode == 0:
        print('  ✓ 4 scripts × 5 ways the network fails: no errors, every one falls back')
        print('  ✓ Prism and Looking-Glass: nothing used that came back from a private address after a redirect')

# ------------------------------------------------------------------ hand-off
# tools/tests/ownertest.py: Prism stands by while another script holds the title bar, also after being
# switched off and back on (everywhere or for the site), and takes it back once the other lets go
owner_tool = git('diff', '--quiet', 'origin/main', '--', 'tools/tests/ownertest.py').returncode != 0
if '--ci' in args or ('--quick' not in args and ('--all' in args or owner_tool or 'desktop/prism' in changed)):
    head('hand-off')
    r = subprocess.run([sys.executable, f'{HERE}/tests/ownertest.py'], capture_output=True, text=True)
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    for l in lines:
        if not l.startswith('== '): ok(False, l.strip())
    ok(r.returncode == 0 or any(not l.startswith('== ') for l in lines), 'the hand-off test failed: ' + ((r.stderr.strip().splitlines() or ['no output'])[-1]))
    if r.returncode == 0: print('  ✓ prism: stands by for another script, also after being switched off and on')

# ------------------------------------------------------------------ logging
# tools/tests/logtest.py: with every logging switch on, Molten Tools' account paths never print an account's
# name, handle, email or id (and giving up on a missing account doesn't bounce between pages)
if '--ci' in args or ('--quick' not in args and ('--all' in args or 'desktop/molten-tools' in changed)):
    head('logging')
    r = subprocess.run([sys.executable, f'{HERE}/tests/logtest.py'], capture_output=True, text=True)
    seen = 0
    for l in r.stdout.splitlines():
        if l.startswith('== '): seen += 1; (print(f'  ✓ {l[3:].split(": ")[0]}: no account names in the console') if l.endswith('clean') else None)
        elif l.strip(): ok(False, 'molten-tools logging: ' + l.strip())
    ok(seen >= 5, f'the logging test reported {seen} of 5 paths: ' + (r.stderr.strip().splitlines() or ['no output'])[-1])

# ------------------------------------------------------------------ screenshots
if FULL:
    head('live')
    if not targets: print('  ✓ no script differs from GitHub')
    else:
        r = subprocess.run([sys.executable, f'{HERE}/tests/live.py'] + [p.split('/')[1] for p in targets], capture_output=True, text=True)
        cur = ''; seen = 0
        for l in r.stdout.splitlines():
            if l.startswith('== '): cur = l[3:].split(':')[0].split('/')[-1]; seen += 1; (print(f'  ✓ {cur}: updates live') if l.endswith('clean') else None)
            elif l.strip(): ok(False, f'{cur}: {l.strip()}')
        ok(seen == 2 * len(targets), f'the live-update test reported {seen} of {2 * len(targets)} runs: ' + (r.stderr.strip().splitlines() or ['no output'])[-1])
if '--quick' not in args:
    head('performance')
    # tools/tests/perf.py: a long session on each changed script's site; nothing it leaves behind keeps
    # growing and it stays within its time budgets. The test proves itself on a deliberately bad
    # script first, so it also runs (that part alone) when only the test changed.
    perf_tools = git('diff', '--quiet', 'origin/main', '--', 'tools/tests/perf.py', 'tools/lib/shot.js').returncode != 0
    if not targets and not perf_tools: print('  ✓ no script differs from GitHub')
    else:
        names = [p.split('/')[1] for p in targets]
        r = subprocess.run([sys.executable, f'{HERE}/tests/perf.py'] + (names or ['--selftest']), capture_output=True, text=True)
        seen = 0
        for l in r.stdout.splitlines():
            if not l.startswith('== '): continue
            seen += 1; name, res = l[3:].split(': ', 1)
            if name == 'selftest': (print('  ✓ the test catches a leaky, slow script') if res.startswith('every budget') else ok(False, f'tools/tests/perf.py self-test: {res}'))
            elif res == 'clean': print(f'  ✓ {name.split("/")[-1]}: no leaks, within its time budgets')
            else: ok(False, f'{name.split("/")[-1]}: {res}')
        ok(seen == 1 + len(targets), f'the performance test reported {seen} of {1 + len(targets)} runs: ' + (r.stderr.strip().splitlines() or ['no output'])[-1])
# On GitHub a mismatch fails too, except for the two Kaleidoscope panels (issue #3): there the same font
# files draw the footer line one pixel further right after its ✦ than here, so for those a mismatch is
# only reported, with the differing strip and the fonts used printed to the log. Locally every one fails.
ON_GITHUB = '--ci' in args and bool(os.environ.get('GITHUB_ACTIONS'))
SHOT_REPORT_ONLY = {'desktop/kaleidoscope', 'mobile/kaleidoscope-mobile'}
if FULL:
    head('screenshots')
    # Recapture each panel in a scratch folder and compare with the committed image. Captures repeat
    # exactly (fixed clock, demo data, animations stopped), so any difference means the panel changed
    # and its screenshots weren't recaptured (python3 tools/screens.py <script>). When what draws them
    # changes (the fonts, the capture tools), every script's screenshots are compared.
    shot_tools = git('diff', '--quiet', 'origin/main', '--', 'tools/lib/fonts.conf', 'tools/lib/shot.js', 'tools/screens.py').returncode != 0
    targets = [p for p in (list(RUNS) if '--all' in args or shot_tools else changed)]
    if not targets: print('  ✓ no script differs from GitHub')
    else:
        import tempfile, screens
        from PIL import Image, ImageChops
        why = {}
        def same(a, b):
            A, B = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
            if A.size != B.size: why[a] = f'size {A.size} vs {B.size}'; return False
            d = ImageChops.difference(A, B).convert('L').point(lambda x: 255 if x > 40 else 0)
            n = sum(1 for v in d.get_flattened_data() if v)
            why[a] = f'{n / (A.size[0] * A.size[1]):.2%} of pixels differ, in the box {d.getbbox()} of {A.size}'
            return n <= A.size[0] * A.size[1] * 0.0005
        from par import pmap
        screens.QUIET = True
        def capture(p):
            tmp = tempfile.mkdtemp()
            try:
                screens.run(p, tmp)
                if p == 'desktop/hourglass': screens.hourglass_phone(tmp)
            except Exception as e: return e
            return tmp
        for p, tmp in zip(targets, pmap(capture, targets, 3)):
            if isinstance(tmp, Exception):
                ok(False, f'{p.split("/")[1]}: screenshots could not be captured: {tmp}'); continue
            got = sorted(f for f in os.listdir(tmp) if f.endswith('.webp'))
            ok(got, f'{p.split("/")[1]}: the capture produced no screenshots')
            stale = [f for f in got if not os.path.exists(f'{R}/{p}/images/{f}') or not same(f'{tmp}/{f}', f'{R}/{p}/images/{f}')]
            for f in stale:
                msg = f'{p.split("/")[1]}: {f} doesn\'t match the panel any more ({why.get(f"{tmp}/{f}", "not committed")}; run python3 tools/screens.py {p.split("/")[1]})'
                if not (ON_GITHUB and p in SHOT_REPORT_ONLY): ok(False, msg); continue
                print('  ⚠ ' + msg)
                try:   # the strip that differs, as drawn here and as committed, small enough to read back out of the log
                    import base64, io
                    A, B = Image.open(f'{tmp}/{f}').convert('RGB'), Image.open(f'{R}/{p}/images/{f}').convert('RGB')
                    x0, y0, x1, y1 = ImageChops.difference(A, B).convert('L').point(lambda x: 255 if x > 40 else 0).getbbox()
                    y1 = min(y1, y0 + 60); box = (max(0, x0 - 20), max(0, y0 - 10), min(A.size[0], x1 + 20), y1 + 10)
                    both = Image.new('RGB', (box[2] - box[0], 2 * (box[3] - box[1]) + 4), 'white'); both.paste(A.crop(box), (0, 0)); both.paste(B.crop(box), (0, box[3] - box[1] + 4))
                    buf = io.BytesIO(); both.save(buf, 'PNG', optimize=True); print(f'    CROP {p.split("/")[1]}/{f} ' + base64.b64encode(buf.getvalue()).decode())
                except Exception as e: print(f'    (no crop: {e})')
            if ON_GITHUB and p in SHOT_REPORT_ONLY and stale:   # and which fonts drew this panel there (tools/tests/fontsused.js), to compare with here
                url, cmd, extra, _ = screens.JOBS[p]
                r = subprocess.run(['node', f'{HERE}/lib/shot.js', f'{R}/{p}/{p.split("/")[1]}.user.js', url, '/dev/null', '--cmd', cmd, *extra, '--drive', f'{HERE}/tests/fontsused.js'], capture_output=True, text=True)
                print('    FONTS ' + next((l[5:] for l in r.stdout.splitlines() if l.startswith('EVAL ')), 'could not run'))
                import hashlib   # and the files themselves, to tell a different file from a different machine
                for ff in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/opentype/inter/Inter-Regular.otf'):
                    print(f'    FILE {os.path.basename(ff)} ' + (hashlib.md5(open(ff, 'rb').read()).hexdigest() if os.path.exists(ff) else 'missing'))
                continue
            if got and not stale: print(f'  ✓ {p.split("/")[1]}: {len(got)} screenshots match')

# ------------------------------------------------------------------ generated
if FULL:
    head('generated')
    import shutil, tempfile, filecmp
    tmp = tempfile.mkdtemp(); copy = f'{tmp}/repo'
    shutil.copytree(R, copy, ignore=shutil.ignore_patterns('.git', '__pycache__'))
    r = subprocess.run([sys.executable, f'{copy}/tools/pages.py'], capture_output=True, text=True)
    if ok(r.returncode == 0, 'tools/pages.py failed: ' + ' / '.join((r.stderr.strip().splitlines() or ['no output'])[-4:])):
        # text outputs only: the link-preview PNGs aren't byte-for-byte repeatable
        gen = [f for f in glob.glob(f'{copy}/**/*', recursive=True) if re.search(r'(README\.md|\.html|\.css|banner\.svg|-cut\.webp)$', f)]
        stale = [os.path.relpath(f, copy) for f in gen
                 if not os.path.exists(f'{R}/{os.path.relpath(f, copy)}') or not filecmp.cmp(f, f'{R}/{os.path.relpath(f, copy)}', shallow=False)]
        for f in stale: ok(False, f'{f} doesn\'t match what tools/pages.py builds (hand-edited or not rebuilt; run python3 tools/pages.py)')
        if not stale: print(f'  ✓ {len(gen)} generated files match')
    shutil.rmtree(tmp, ignore_errors=True)

TIMES.append(('', _time.time()))
slow = [(b[1] - a[1], a[0]) for a, b in zip(TIMES, TIMES[1:]) if b[1] - a[1] >= 20]
if slow: print(f'\ntook {(TIMES[-1][1] - TIMES[0][1]) / 60:.0f} min: ' + ', '.join(f'{n} {t / 60:.1f}' for t, n in sorted(slow, reverse=True)))
print('\n' + ('All checks passed.' if not fails else f'{len(fails)} problem(s) to fix before pushing.'))
sys.exit(1 if fails else 0)
