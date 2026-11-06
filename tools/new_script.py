"""Start a new Glassware script from one spec file, already on the frame, the glass recipe and the
light/dark rules, and listed everywhere the tools look.

    python3 tools/new_script.py tools/specs/<script>.json          # create it, capture it, build the pages
    python3 tools/new_script.py tools/specs/<script>.json --dry    # print what it would do

The spec (see tools/kit/example.json) holds everything that makes the script its own: name,
tagline, accent, icon colors and glyph, where it runs, its settings (sections of toggles, choices
and sliders, optionally on tabs), counters, the product copy and features for the pages, demo data
for the screenshots, and the feature code itself (start and apply). From it this:

  1. writes <folder>/<script>/<script>.user.js from tools/kit/template.js: header lines,
     the panel frame (header with icon tile and sun/moon switch, context line, tabs, on/off card,
     sections, Appearance, Troubleshooting, footer, menu commands, Esc), the glass recipe in both
     themes, settings that validate on load, cross-tab sync, counters
  2. picks the accent's companions: text on the accent, and a darker/lighter ink of the accent for
     light and dark glass (at least 4.5:1, so the audit's faint-text check passes)
  3. lists the script in every registry (S, RUNS, ACCENT in readmes.py; F in features.py; THEME
     in site_themes.py; JOBS in screens.py; FIRST in carry.py; STATIC in check.py; SCRIPTS in
     panel_icons.py; ICONS in icons.js) and writes its demo data to tools/seeds/
  4. draws the icon (node tools/icons.js <script>, scaled to 256px), embeds it in the header tile,
     captures the panel in both themes and rebuilds every page

Then run the audit and the release check like any other change. The script starts at 1.0.0.
"""
import json, os, re, subprocess, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)

# ---------------------------------------------------------------- colors
def rgb(hx): hx = hx.lstrip('#'); return [int(hx[i:i + 2], 16) for i in (0, 2, 4)]
def hexof(c): return '#' + ''.join(f'{max(0, min(255, round(v))):02x}' for v in c)
def lum(c):
    f = lambda v: (v / 255) / 12.92 if v / 255 <= .03928 else ((v / 255 + .055) / 1.055) ** 2.4
    r, g, b = c; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b)
def contrast(a, b): a, b = lum(a), lum(b); return (max(a, b) + .05) / (min(a, b) + .05)
def mix(a, b, t): return [x + (y - x) * t for x, y in zip(a, b)]
def ink_for(accent, bg, toward):
    """The accent, moved toward black or white just far enough to read on bg (4.5:1)."""
    a = rgb(accent)
    for i in range(101):
        c = mix(a, toward, i / 100)
        if contrast(c, bg) >= 4.5: return hexof(c)
    return hexof(toward)
LIGHT_GLASS, DARK_GLASS = [246, 246, 248], [24, 24, 30]   # the recipe's glass over a typical page

# ---------------------------------------------------------------- spec
KINDS = {'toggle', 'choice', 'slider'}
def load(path, fresh=True):
    s = json.load(open(path, encoding='utf-8'))
    need = ['slug', 'name', 'folder', 'runs', 'tagline', 'description', 'intro', 'sites', 'match', 'accent', 'theme', 'icon', 'sections', 'features']
    miss = [k for k in need if k not in s]
    if miss: sys.exit(f'spec is missing {miss}')
    if not re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', s['slug']): sys.exit('slug: lowercase words joined by -')
    if s['folder'] not in ('desktop', 'mobile'): sys.exit('folder: desktop or mobile')
    if s['runs'] not in ('both', 'desktop', 'phone'): sys.exit('runs: both, desktop or phone')
    if s['theme'] not in ('frost', 'molten', 'midnight'): sys.exit('theme: frost, molten or midnight')
    if fresh and os.path.exists(f"{R}/{s['folder']}/{s['slug']}"): sys.exit(f"{s['folder']}/{s['slug']} already exists")
    if re.search(r'(?i)claude|anthropic|greasy ?fork', json.dumps({k: v for k, v in s.items() if k not in ('start', 'apply')})):
        sys.exit('nothing about Claude or Greasy Fork in a script (CLAUDE.md)')
    tabs = s.get('tabs', [])
    keys = set()
    for sec in s['sections']:
        if tabs and sec.get('tab') not in tabs: sys.exit(f"section {sec['title']!r}: tab must be one of {tabs}")
        if sec['title'] in ('Appearance', 'Troubleshooting'): sys.exit('Appearance and Troubleshooting are added for you')
        for r in sec['rows']:
            if r['type'] not in KINDS: sys.exit(f"{r['key']}: type must be one of {sorted(KINDS)} (never a dropdown)")
            if r['key'] in keys or r['key'] in ('enabled', 'log', 'appearance', 'counts'): sys.exit(f"{r['key']}: key already used")
            keys.add(r['key'])
            if r['type'] == 'choice' and r['default'] not in [o[0] for o in r['options']]: sys.exit(f"{r['key']}: default isn't an option")
    for c in s.get('counters', []):
        if c['row'] not in keys: sys.exit(f"counter {c['key']}: row {c['row']!r} is not a setting")
    if len(s['features']) < 3: sys.exit('features: at least 3 (title, description) pairs for the pages')
    return s

# ---------------------------------------------------------------- the script
def script(s):
    a = s['accent']; ac = rgb(a)
    on = '#ffffff' if contrast(ac, [255] * 3) >= contrast(ac, [17] * 3) else '#111114'
    app = dict(name=s['name'], slug=s['slug'], tagline=s['tagline'], accent=a, rgb=','.join(map(str, ac)), on=on,
               ink=ink_for(a, LIGHT_GLASS, [0, 0, 0]), inkDark=ink_for(a, DARK_GLASS, [255, 255, 255]),
               tabs=s.get('tabs', []), master=s.get('master', True), counters=s.get('counters', []),
               sections=[dict(tab=sec.get('tab'), title=sec['title'], rows=sec['rows']) for sec in s['sections']])
    t = open(f'{HERE}/kit/template.js', encoding='utf-8').read()
    indent = lambda code: '\n'.join(('            ' + l) if l.strip() else '' for l in (code or '// nothing yet').splitlines())
    launcher = s.get('launcher')
    rep = {'__NAME__': s['name'], '__DESCRIPTION__': s['description'], '__SLUG__': s['slug'], '__FOLDER__': s['folder'],
           '__MATCH__': '\n'.join(f'// @match        {m}' for m in s['match']),
           '__APP__': json.dumps(app, ensure_ascii=False, indent=8).replace('\n}', '\n    }'),
           '__START__': indent(s.get('start')), '__APPLY__': indent(s.get('apply')),
           '__LAUNCHER__': f'{launcher} or the Tampermonkey menu' if launcher else 'the Tampermonkey menu',
           '__MASTER_MENU__': f"    GM_registerMenuCommand('Turn {s['name']} on/off', () => save({{ enabled: !loadSettings().enabled }}));\n" if app['master'] else ''}
    G = json.load(open(f'{HERE}/tokens.json', encoding='utf-8'))['glass']   # the glass recipe, from the design tokens
    for mode, P in (('light', 'L'), ('dark', 'D')):
        for k, v in G[mode].items(): rep[f'__{P}_{k.upper()}__'] = v
    rep['__BLUR__'] = f"blur({G['blur']}px) saturate({G['saturate']}%)"
    for k, v in rep.items(): t = t.replace(k, v)
    if '__' in re.sub(r'__[a-z]', '', t) and re.search(r'__[A-Z]+__', t): sys.exit('template placeholder left: ' + re.search(r'__[A-Z]+__', t).group(0))
    return t

# ---------------------------------------------------------------- registries
def insert_after(path, anchor, text):
    src = open(path, encoding='utf-8').read()
    if anchor not in src: sys.exit(f'{os.path.relpath(path, R)}: anchor {anchor!r} not found')
    i = src.index(anchor) + len(anchor)
    open(path, 'w', encoding='utf-8').write(src[:i] + text + src[i:])
def insert_before(path, anchor, text):
    src = open(path, encoding='utf-8').read()
    if anchor not in src: sys.exit(f'{os.path.relpath(path, R)}: anchor {anchor!r} not found')
    i = src.index(anchor)
    open(path, 'w', encoding='utf-8').write(src[:i] + text + src[i:])

def register(s):
    p = f"{s['folder']}/{s['slug']}"; slug = s['slug']; py = lambda v: repr(v)
    shots = [('main', s.get('shot', 'Settings panel'))] + [(t.lower().replace(' ', '-'), t) for t in s.get('tabs', [])[1:]]
    entry = (f"S[{py(p)}] = dict(name={py(s['name'])}, tag={py(s['tagline'])}, sites={py(s['sites'])},\n"
             + (f" getting_started={py(s['getting_started'])},\n" if s.get('getting_started') else '')
             + f" intro={py(s['intro'])},\n features=[\n"
             + ''.join(f"  {py('**' + t + '**: ' + d)},\n" for t, d in s['features'])
             + f" ],\n shots={py(shots)})\n\n")
    insert_before(f'{HERE}/readmes.py', '\n# Where each script runs.', '\n' + entry.rstrip('\n') + '\n')
    insert_after(f'{HERE}/readmes.py', 'RUNS = {', f"{py(p)}: {py(s['runs'])}, ")
    insert_after(f'{HERE}/readmes.py', 'ACCENT = {', f"{py(p)}:{py(s['accent'].lstrip('#').lower())}, ")
    insert_after(f'{HERE}/features.py', 'F = {\n', f"{py(p)}: [\n" + ''.join(f" ({py(t)}, {py(d)}),\n" for t, d in s['features']) + "],\n")
    insert_after(f'{HERE}/site_themes.py', 'THEME = {', f"\n {py(p)}: ({py(s['theme'])}, {py(s['accent'].lower())}),")
    extra_src = "['--seed', f'{HERE}/seeds/" + slug + ".json']" if s.get('seed') else '[]'
    insert_after(f'{HERE}/screens.py', 'JOBS = {\n', f"    {py(p)}: ({py(s.get('url', 'https://example.com/'))}, {py('Open ' + s['name'])}, {extra_src}, {py(s.get('tabs', [])[1:])}),\n")
    if s.get('tabs'): insert_after(f'{HERE}/carry.py', 'FIRST = {', f"{py(p)}: {py(s['tabs'][0])}, ")
    insert_after(f'{HERE}/check.py', "STATIC = {", f"{py(slug)}, ")
    insert_after(f'{HERE}/frame.py', "    'tools/kit/template': KIT,\n", f"    {py(p)}: KIT,\n")   # its shared controls stay stamped
    insert_after(f'{HERE}/panel_icons.py', "SCRIPTS = {   # static header tiles only\n", f"    {py(p)}: {py(slug)},\n")
    ic = s['icon']
    glyph = ic['glyph']   # JS: tube('<path>', { glow: g, w: 4, core: 1.5, fill: .07 }) and friends, with g the glow color
    insert_before(f'{HERE}/icons.js', "const HG = {",
                  f"const glyph_{slug.replace('-', '_')} = (g) => `${{{glyph}}}`;\n\n")
    insert_before(f'{HERE}/icons.js', "};\nICONS['molten-for-reddit-mobile']",
                  f"  {json.dumps(slug)}: icon({{ a: '{ic['a']}', b: '{ic['b']}', deep: '{ic['deep']}', rimA: '{ic['rimA']}', rimB: '{ic['rimB']}', glow: '{ic['glow']}', glyph: glyph_{slug.replace('-', '_')}('{ic.get('tube', ic['rimA'])}') }}),\n")
    if s.get('seed'): json.dump(s['seed'], open(f'{HERE}/seeds/{slug}.json', 'w'), indent=1)

def run(*cmd): print('$', ' '.join(cmd)); subprocess.run(cmd, cwd=R, check=True)

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args: sys.exit(__doc__)
    s = load(args[0]); p = f"{s['folder']}/{s['slug']}"
    js = script(s)
    if '--dry' in sys.argv: print(js); sys.exit()
    os.makedirs(f'{R}/{p}/images', exist_ok=True)
    open(f"{R}/{p}/{s['slug']}.user.js", 'w', encoding='utf-8').write(js)
    register(s)
    keep = f"{HERE}/specs/{s['slug']}.json"   # the record of how the script started
    if os.path.abspath(args[0]) != keep: os.makedirs(f'{HERE}/specs', exist_ok=True); open(keep, 'w', encoding='utf-8').write(open(args[0], encoding='utf-8').read())
    run('node', 'tools/icons.js', s['slug'])
    im = Image.open(f"{R}/assets/icons/{s['slug']}.png"); im.resize((256, 256), Image.LANCZOS).save(f"{R}/assets/icons/{s['slug']}.png")
    import panel_icons; panel_icons.patch(f"{R}/{p}/{s['slug']}.user.js", panel_icons.data_uri(s['slug']))
    run('node', '--check', f"{p}/{s['slug']}.user.js")
    run('python3', 'tools/screens.py', s['slug'])
    run('python3', 'tools/pages.py')
    print(f"\n{s['name']} is in place at {p}. Next: python3 tools/audit.py {s['slug']}, then python3 tools/check.py.")
