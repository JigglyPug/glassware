"""The words people read: CLAUDE.md's "Words (panels, dashboards, pages)" rules, as a check.

    python3 tools/tests/words.py        # every script, the page data and the latest change-log entries

Scans the strings that sit where people read them, in every script: the title and description of the
settings-row helpers, `text:`, `title:`, `placeholder`, `hint:`, `desc:` and `aria-label` values, the
`data-axis` keys and `.sl` headings, and the text of `el(tag, class, text)`. Also the page data
(readmes.py and features.py) and the latest three entries of each CHANGES.md. Comments, console lines,
menu commands, CSS and the prompts Kaleidoscope writes for Claude aren't in those places, so they
aren't read.

Fails on:
- notation: a word ` = ` a word ("Off = …", "Lower = cheaper", "size = share"), `→`, a `·` in a key,
  aria-label, heading or setting description (two or more anywhere), "A bubble per …" shorthand in a key
  or aria-label, slash lists ("Calm / User / Crazy") and "30+" shorthand
- the plain-words list (seamless, smart, unlock, "speak for itself", "all caught up", cheering…),
  emoji, and an em dash between words
- a setting title starting with Enable, Turn on, Turn off or Allow, or ending in "?"
Allows: numbers with their math symbols ("1 = normal, 2 = twice as fast", "0 = clear", "× 100 px"),
figure rows (a lone ' → ', or an arrow between figures), the readout and tooltip lines (built by
functions, so no literal sits there), the footer, the fixed strings CLAUDE.md sets (Hourglass's on/off
card says "It unlocks at…"), a lone '—' for "no value yet", and marks the scripts draw themselves
(✦ ★ ↻ ↳ ♪ 🔍).

Before scanning it proves itself on SAMPLES: every bad one has to be caught and no good one may be.
"""
import glob, os, re, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); R = os.path.dirname(HERE)   # HERE is the tools folder

WORDS = ['seamless', 'effortless', 'powerful', 'smart', 'intelligent', 'unlock', 'unlocks', 'elevate', 'supercharge',
         'journey', 'all-in-one', 'next-level', 'oops', 'great job', "you're all set", 'all caught up', 'speak for itself']
ALLOW_PHRASES = [r'\bunlocks at\b']                     # Hourglass's on/off card during lockdown: the literal sense
MARKS = set('✦★↻↳♪→←↑↓↗⌂✓✗✕×⋯☀☾·…—–') | {'🔍'}
EMOJI = re.compile('[\U0001F300-\U0001FAFF☀-➿⬀-⯿]')
STR = r"""'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`"""
HELPERS = r'(?:tgl|row|ch|sl|lsl|toggleRow|sliderRow|selectRow|labelBlock|toggleBlock)'

def _strs(text):
    return [next(g for g in m.groups() if g is not None) for m in re.finditer(STR, text)]

def _expr(line, start):
    """The rest of a value starting at `start`, up to where its object or call closes (strings skipped)."""
    depth, i = 0, start
    while i < len(line):
        c = line[i]
        if c in '\'"`':
            m = re.compile(STR).match(line, i); i = m.end() if m else i + 1; continue
        if c in '([{': depth += 1
        elif c in ')]}':
            if depth == 0: break
            depth -= 1
        elif c in ',;' and depth == 0: break
        i += 1
    return line[start:i]

def _args(line, start):
    """The arguments of a call whose "(" ends just before `start`, split at its top-level commas."""
    out, depth, i, cur = [], 0, start, start
    while i < len(line):
        c = line[i]
        if c in '\'"`':
            m = re.compile(STR).match(line, i); i = m.end() if m else i + 1; continue
        if c in '([{': depth += 1
        elif c in ')]}':
            if depth == 0: break
            depth -= 1
        elif c == ',' and depth == 0: out.append(line[cur:i].strip()); cur = i + 1
        i += 1
    out.append(line[cur:i].strip())
    return out

def _clean(src):
    """The source with comments, console lines and menu commands blanked (same length, so offsets keep their lines)."""
    out = []
    for line in src.split('\n'):
        st = line.strip()
        if st.startswith(('//', '*', '/*')) or re.search(r'\blog\(|console\.|GM_registerMenuCommand|GM_info', st): out.append(' ' * len(line)); continue
        i, q = 0, None
        while i < len(line):   # a trailing // comment, outside strings
            c = line[i]
            if q:
                if c == '\\': i += 2; continue
                if c == q: q = None
            elif c in '\'"`': q = c
            elif line.startswith('//', i) and (i == 0 or line[i - 1] != ':'): line = line[:i] + ' ' * (len(line) - i); break
            i += 1
        out.append(line)
    return '\n'.join(out)

def ui_strings(src):
    """(line number, kind, string) for every string where people read it."""
    src = _clean(src); out = []
    line_of = lambda i: src.count('\n', 0, i) + 1
    def add(i, kind, t): out.append((line_of(i), kind, t))
    for m in re.finditer(r"""(?:\btext|\btitle|\bhint|\bdesc|'aria-label'|"aria-label"|\bplaceholder)\s*[:=]\s*""", src):
        key = m.group(0)
        kind = 'aria' if 'aria' in key else 'desc' if re.match(r'(hint|desc)', key) else 'placeholder' if key.startswith('placeholder') else 'text'
        before = src[max(0, m.start() - 160):m.start()]
        if kind == 'text' and before.rfind("'data-axis'") > before.rfind('h('): kind = 'axis'
        if kind == 'text' and re.search(r"class:\s*'sl'", before[-40:]): kind = 'heading'
        for t in _strs(_expr(src, m.end())): add(m.start(), kind, t)
    for m in re.finditer(r'\b' + HELPERS + r'\(', src):
        parts = _args(src, m.end())
        while parts and (re.fullmatch(r'[A-Za-z_.$]+', parts[0]) or re.fullmatch(r"'[a-z][a-zA-Z]*'", parts[0])): parts = parts[1:]   # a parent element, a settings key
        if parts: out += [(line_of(m.start()), 'title', t) for t in _strs(parts[0])]
        if len(parts) > 1 and not parts[1].startswith(('{', '[')) and not re.match(r'(\(\w*\)|\w+)\s*=>', parts[1]):
            for t in _strs(parts[1]): add(m.start(), 'desc', t)
    for m in re.finditer(r'(?<![\w.])h\(', src):   # h(tag, props, ...children): text children
        for c in _args(src, m.end())[2:]:
            if re.match(STR, c) or c.startswith('('): out += [(line_of(m.start()), 'text', t) for t in _strs(c) if not re.match(r'^[a-z]+$', t)]
    for m in re.finditer(r'\.(?:textContent|placeholder|title)\s*=\s*|\bsay\(', src):
        for t in _strs(_expr(src, m.end())): add(m.start(), 'text', t)
    for m in re.finditer(r"""\bel\(\s*'\w+'\s*,\s*'[^']*'\s*,\s*""", src):
        for t in _strs(_expr(src, m.end())): add(m.start(), 'text', t)
    return out

def problems(t, kind):
    """What's wrong with one string in a place people read, by CLAUDE.md's Words rules."""
    bad = []
    if not re.search(r'[A-Za-z]', t) or t.startswith(('#', '.', '[', 'http')) or re.search(r'[{};]\s*$|var\(|px;|rgba', t) or re.match(r'[a-z-]+:\S', t): return bad   # code and CSS
    low = t.lower()
    for m in re.finditer(r"(?<![\w×%.])([A-Za-z][\w']*)\s=\s", t):   # a word standing in for a sentence; numbers keep their symbols
        bad.append(f'notation "{m.group(0).strip()}": say it in words ("When off, …")'); break
    if '→' in t and not re.fullmatch(r'\s*→\s*', t) and not re.search(r'[\d%]\s*→\s*[\d<]', t): bad.append('"→" outside a figure row')
    suffix = t.startswith(' · ')   # a status tacked onto a value ("More like my recent · updated"): a readout
    dots = 0 if suffix else t.count(' · ') + t.startswith('· ') + t.endswith(' ·')
    if kind in ('aria', 'axis', 'heading', 'desc', 'title', 'placeholder') and dots and not re.match(r'Open from ', t): bad.append(f'"·" in a {kind}: use a sentence or a comma')
    elif dots >= 2 and not re.match(r'Open from ', t): bad.append('an "A · B · C" string')
    if kind in ('aria', 'axis') and re.match(r'(A|One) \w+ per ', t): bad.append('"A … per …" shorthand: "Each … is …"')
    if re.search(r'[A-Za-z]+ / [A-Za-z]+', t): bad.append('a slash list: use commas, "and" or "or"')
    if re.search(r'\b\d+[a-z]?\+(\s|$)', t): bad.append('"30+" shorthand: "30 or more"')
    if not any(re.search(a, low) for a in ALLOW_PHRASES):
        for w in WORDS:
            if re.search(r'(?<![\w-])' + re.escape(w) + r'(?![\w-])', low): bad.append(f'"{w}"'); break
    if any(EMOJI.match(ch) and ch not in MARKS for ch in t) or ('🔍' not in t and re.search('[\U0001F300-\U0001FAFF]', t)): bad.append('an emoji')
    if re.search(r'\w\s?—\s?\w', t): bad.append('an em dash between words: use a period or a comma')
    if kind == 'title' and (re.match(r'(Enable|Turn on|Turn off|Allow)\b', t) or t.rstrip().endswith('?')): bad.append('a setting title that starts with a verb like "Enable" or asks a question')
    return bad

def scan_script(src):
    return [(n, t, p) for n, kind, t in ui_strings(src) for p in problems(t, kind)]

def page_strings():
    """(where, string) for the page data: readmes.py's copy, features.py, the latest three change-log entries."""
    out = []
    sys.path.insert(0, os.path.join(HERE, 'build'))
    import features
    for p, items in features.F.items():
        for title, desc in items: out += [(f'features.py {p}', title), (f'features.py {p}', desc)]
    src = open(os.path.join(HERE, 'build', 'readmes.py'), encoding='utf-8').read()
    ns = {'__file__': os.path.join(HERE, 'build', 'readmes.py')}
    exec(src[:src.index('\nRUNS = {')], ns)
    for p, s in ns['S'].items():
        for k in ('tag', 'intro', 'getting_started', 'note'):
            if s.get(k): out.append((f'readmes.py {p} {k}', s[k]))
        if s.get('phone'): out.append((f'readmes.py {p} phone', s['phone'][0]))
        for f in s.get('features', []): out.append((f'readmes.py {p} features', f))
    for f in sorted(glob.glob(f'{R}/*/*/CHANGES.md')):
        entries = re.split(r'(?m)^## ', open(f, encoding='utf-8').read())[1:4]
        for e in entries:
            for line in re.findall(r'(?m)^- (.*)$', e): out.append((os.path.relpath(f, R), line))
    return out

SAMPLES = {   # (string, kind): bad ones need at least one problem, good ones none
    'bad': [("Off = clear glass over a plain black page", 'desc'), ("Lower = cheaper, choppier", 'desc'), ("size = share · faded = before", 'axis'),
            ("A bubble per category", 'axis'), ("Smart suggestions", 'text'), ("Enable autoplay", 'title'), ("Show the badge?", 'title'),
            ("Calm / User / Crazy profiles", 'text'), ("Sites you spend 30+ minutes on", 'text'), ("Share of your time · before → now", 'heading'),
            ("Leave empty to let your list speak for itself.", 'desc'), ("You're all caught up.", 'text'), ("Great job! ✨", 'text'),
            ("Fast — and light", 'text'), ("Places that moved · time a day · each day", 'text')],
    'good': [("1 = normal, 2 = twice as fast", 'desc'), ("0 = perfectly clear glass", 'desc'), ("× 100 px", 'desc'), (" → ", 'text'),
             ("48% → 50%", 'text'), ("Open from the lava button or the Tampermonkey menu · v", 'text'), ("Can't be turned off during lockdown. It unlocks at ", 'text'),
             ("—", 'text'), ("Show 🔍 next to the name", 'title'), ("The small ✦ button.", 'text'), ("When off, the glass sits over a plain black page", 'desc'),
             ("Each bubble is a category.", 'axis'), ("Pass · ", 'text'), (" · chat deleted", 'desc'), ("Maybe call it a night?", 'text'), ("Master on/off switch", 'text')],
}

def selftest():
    out = [f'misses the bad sample "{t}"' for t, k in SAMPLES['bad'] if not problems(t, k)]
    out += [f'flags the good sample "{t}": {problems(t, k)[0]}' for t, k in SAMPLES['good'] if problems(t, k)]
    js = "this.tgl('lavaOn', 'Lava background', 'Off = clear glass'),\nh('span', { 'data-axis': 'x', text: 'A bubble per category' })\nel('div', 'ytt-note', 'Smart suggestions')"
    if len(scan_script(js)) < 3: out.append('the script scan misses a settings row, a key or an el() note')
    return out

def run():
    """Every problem, as 'where: string: problem' lines (selftest failures first)."""
    out = ['words check: ' + x for x in selftest()]
    for p in sorted(glob.glob(f'{R}/*/*/*.user.js')) + [f'{HERE}/kit/template.js']:
        for n, t, prob in scan_script(open(p, encoding='utf-8').read()): out.append(f'{os.path.relpath(p, R)}:{n}: "{t[:70]}": {prob}')
    for where, t in page_strings():
        for prob in problems(t, 'text'): out.append(f'{where}: "{t[:70]}": {prob}')
    return out

if __name__ == '__main__':
    res = run()
    print('\n'.join(res) if res else 'clean')
    sys.exit(1 if res else 0)
