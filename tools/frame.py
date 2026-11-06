"""The shared panel frame: one definition of the controls every panel has, stamped into all scripts.

    python3 tools/frame.py           # stamp the current frame into every script
    python3 tools/frame.py --check   # exit 1 if any script's stamped copy differs (tools/check.py runs this)

Every panel's sun/moon switch, close button and on/off toggles are written here once, with the
sizes from CLAUDE.md (control sizes), and stamped into each script between the markers
`glassware:frame start` and `glassware:frame end`, adapted to that script's class names, color
variables and CSS style. Change the frame here, run this, recapture and ship; never edit a stamped
block by hand (the check fails), and never style these controls outside it (the check fails too).

The close button's icon is stamped the same way (`gwCloseIcon()`, between `glassware:icon` markers),
so every panel draws the same ×.
"""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)

# Each script: how its panel names things. root: the element holding the theme variables;
# dark: the selector when dark glass is on; vars: its color variables for the frame's roles
# (ctl: control background, hi: hover, text, sub, knob: the sun/moon knob, off: toggle off,
# on: toggle on, the accent); mode/knob/sun/moon/x: class names; toggle: (kind, selector) where
# kind is 'button' (role=switch, aria-checked) or 'checkbox' (input, :checked);
# gap: the header's own flex gap (the close button sits 8px after the switch either way);
# phone: when phone sizes apply ('always', a selector prefix for an ancestor class, an @media
# query, or None for desktop-only scripts); css: 'template' (a `...` stylesheet) or 'concat'
# ('rule' + lines); page: True when the panel lives in the page (not a shadow root), so every
# declaration gets !important against the site's own CSS.
SHADOW = dict(gap=11, mode='.mode', knob='.knob', sun='.sun', moon='.moon', x='.x', toggle=('button', '.sw'), css='template', page=False)
MOLTEN = dict(gap=0, root='#ytt-panel', dark='#ytt-panel[data-theme=dark]', mode='.ytt-mode', knob='.ytt-knob', sun='.ytt-sun', moon='.ytt-moon',
              x='.ytt-x', toggle=('checkbox', 'input.ytt-switch'), css='concat', page=True,
              vars=dict(ctl='var(--mt-ctl-hi)', hi='var(--mt-btn-hi)', text='var(--mt-text)', sub='var(--mt-sub)', knob='var(--mt-knob)',
                        off='var(--mt-sw-off)', on="' + ACCENT + '"))
KALEIDO = dict(gap=0, root='#kaleidoscope-panel', dark='#kaleidoscope-panel[data-theme=dark]', mode='.kld-mode-sw', knob='.kld-knob', sun='.kld-sun', moon='.kld-moon',
               x='.kld-x', toggle=('checkbox', 'input.kld-switch'), css='concat', page=True,
               vars=dict(ctl='var(--k-well)', hi='var(--k-well-hi)', text='var(--k-strong)', sub='var(--k-muted)', knob='var(--k-knob)',
                         off='var(--k-sw-off)', on="' + ACCENT + '"))
SHADOW_VARS = dict(ctl='var(--ctl)', hi='var(--ctl-hi)', text='var(--text)', sub='var(--sub)', knob='var(--knob)', off='var(--sw-off)', on='var(--fill)')
# The kit's template (tools/kit/template.js) and every script made from it
KIT = dict(SHADOW, root='.panel', dark='.panel[data-theme=dark]', phone='@media (max-width:600px)',
           vars=dict(SHADOW_VARS, on='var(--a)'))
FRAMES = {
    'tools/kit/template': KIT,
    'desktop/prism':          dict(SHADOW, root='.panel', dark='.panel[data-theme=dark]', vars=SHADOW_VARS, phone=None),
    'desktop/hourglass':      dict(SHADOW, root='.vars', dark='.vars[data-theme=dark]', vars=SHADOW_VARS, phone='.m'),
    'desktop/looking-glass':  dict(SHADOW, root='.vars', dark='.vars[data-theme=dark]', vars=SHADOW_VARS, phone='@media (max-width:620px)'),
    'desktop/molten-tools':   dict(MOLTEN, phone=None),
    'desktop/molten-for-reddit': dict(MOLTEN, phone=None),
    'mobile/molten-for-reddit-mobile': dict(MOLTEN, phone='always'),
    'desktop/kaleidoscope':   dict(KALEIDO, phone=None),
    'mobile/kaleidoscope-mobile': dict(KALEIDO, phone='always'),
}

# ---------------------------------------------------------------- the frame (CLAUDE.md: control sizes)
import json
TOK = json.load(open(f'{HERE}/tokens.json', encoding='utf-8'))['controls']   # tools/tokens.json
_t = TOK['toggle']
SIZES = dict(desktop=dict(x=TOK['close']['desktop'], sw=(_t['desktop']['w'], _t['desktop']['h']), swk=_t['desktop']['knob']),
             phone=dict(x=TOK['close']['phone'], sw=(_t['phone']['w'], _t['phone']['h']), swk=_t['phone']['knob']))
MODE = (TOK['mode']['w'], TOK['mode']['h']); MODE_KNOB = TOK['mode']['knob']; GAP = TOK['close']['gap']

def rules(f, size):
    v = f['vars']; s = SIZES[size]; R0 = f['root']; D = f['dark']
    kind, T = f['toggle']; on = '[aria-checked=true]' if kind == 'button' else ':checked'
    sw_w, sw_h = s['sw']; k = s['swk']; pad = (sw_h - k) // 2; travel = sw_w - k - 2 * pad
    m_pad = (MODE[1] - MODE_KNOB) // 2
    reset = 'box-sizing:border-box;min-width:0;min-height:0;max-height:none;line-height:1;text-transform:none;letter-spacing:normal'
    out = []
    if size == 'desktop' or f['phone'] == 'always':
        out += [
            (f"{R0} {f['mode']}", f"position:relative;flex:none;display:flex;align-items:center;justify-content:space-between;width:{MODE[0]}px;height:{MODE[1]}px;"
                                  f"margin:0 0 0 auto;padding:0 7px;border:0;border-radius:{MODE[1] // 2}px;background:{v['ctl']};color:{v['sub']};cursor:pointer;{reset}"),
            (f"{R0} {f['mode']} svg", "position:relative;z-index:1;flex:none;display:block;width:13px;height:13px;transition:color .18s"),
            (f"{R0} {f['mode']} {f['knob']}", f"position:absolute;top:{m_pad}px;left:{m_pad}px;width:{MODE_KNOB}px;height:{MODE_KNOB}px;border-radius:50%;"
                                              f"background:{v['knob']};box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s cubic-bezier(.3,.7,.3,1)"),
            (f"{D} {f['mode']} {f['knob']}", f"transform:translateX({MODE[0] - MODE_KNOB - 2 * m_pad}px)"),
            (f"{R0} {f['mode']} {f['sun']},{D} {f['mode']} {f['moon']}", f"color:{v['text']}"),
            (f"{D} {f['mode']} {f['sun']}", f"color:{v['sub']}"),
        ]
    out += [
        (f"{R0} {f['x']}", f"flex:none;display:grid;place-items:center;width:{s['x']}px;height:{s['x']}px;margin:0 0 0 {GAP - f['gap']}px;padding:0;border:0;"
                           f"border-radius:50%;background:{v['ctl']};color:{v['sub']};cursor:pointer;{reset}"),
        (f"{R0} {f['x']}:hover", f"background:{v['hi']};color:{v['text']}"),
        (f"{R0} {T}", f"flex:none;position:relative;width:{sw_w}px;height:{sw_h}px;margin:0;padding:0;border:0;border-radius:{sw_h // 2}px;"
                      f"background:{v['off']};cursor:pointer;transition:background .18s;{reset}" + (';appearance:none;-webkit-appearance:none' if kind == 'checkbox' else '')),
        (f"{R0} {T}::after", f"content:\"\";position:absolute;top:{pad}px;left:{pad}px;width:{k}px;height:{k}px;border-radius:50%;background:#fff;"
                             f"box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s cubic-bezier(.3,.7,.3,1)"),
        (f"{R0} {T}{on}", f"background:{v['on']};box-shadow:0 0 12px -2px color-mix(in srgb,{v['on']} 70%,transparent)"),
        (f"{R0} {T}{on}::after", f"transform:translateX({travel}px)"),
        (f"{R0} {f['mode']}:focus-visible,{R0} {f['x']}:focus-visible,{R0} {T}:focus-visible", f"outline:2px solid {v['on']};outline-offset:2px"),
    ]
    return out

# Panels in the page meet the site's own button rules (Reddit gives buttons a fixed height and
# bottom-aligned content). One reset for every button in the panel, at #id specificity so it beats a
# site's tag and class rules but not the panel's own class rules (which keep their sizes).
def page_reset(f):
    return [(f"{f['root']} button", "display:inline-block;height:auto;min-height:0;align-items:center;line-height:inherit;vertical-align:middle")] if f['page'] else []

def css(f):
    imp = lambda decl: ';'.join(d + ('!important' if f['page'] and d and not d.endswith('!important') else '') for d in decl.split(';'))
    fmt = lambda sel, decl: f'{sel}{{{imp(decl)}}}'
    lines = [f'{sel}{{{decl}}}' for sel, decl in page_reset(f)] + [fmt(*r) for r in rules(f, 'phone' if f['phone'] == 'always' else 'desktop')]
    ph = f['phone']
    if ph and ph != 'always':
        phone = [r for r in rules(f, 'phone') if f['x'] in r[0].split(':')[0].split(',')[0] or f['toggle'][1] in r[0]]
        if ph.startswith('@media'): lines.append(ph + '{' + ''.join(fmt(*r) for r in phone) + '}')
        else: lines += [fmt(', '.join(ph + ' ' + part.strip() for part in sel.split(',')), decl) for sel, decl in phone]
    return lines

START, END = 'glassware:frame start', 'glassware:frame end'
def block(p, f, indent):
    lines = css(f)
    if f['css'] == 'template':
        return f'/* {START}: shared controls, stamped by tools/frame.py; edit them there */\n' + '\n'.join(lines) + f'\n/* {END} */'
    body = '\n'.join(f"{indent}'{l}' +" for l in lines)
    return f'{indent}// {START}: shared controls, stamped by tools/frame.py; edit them there\n{body}\n{indent}// {END}'

ICON = """function gwCloseIcon() {   // glassware:icon (the close button's ×, stamped by tools/frame.py)
{i}    const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg');
{i}    for (const [k, v] of [['viewBox', '0 0 24 24'], ['width', '13'], ['height', '13'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2.2'], ['stroke-linecap', 'round'], ['aria-hidden', 'true']]) s.setAttribute(k, v);
{i}    for (const d of ['M6 6l12 12', 'M18 6 6 18']) { const q = document.createElementNS(NS, 'path'); q.setAttribute('d', d); s.append(q); }
{i}    return s;
{i}}   // glassware:icon end"""

def stamp(src, p):
    f = FRAMES[p]
    m = re.search(r'([ \t]*)(?:/\*|//) ' + re.escape(START) + r'.*?' + re.escape(END) + r'(?: \*/)?', src, re.S)
    if not m: raise SystemExit(f'{p}: no "{START}" marker; put one where the shared controls belong')
    src = src[:m.start()] + (m.group(1) if f['css'] == 'template' else '') + block(p, f, m.group(1)) + src[m.end():]
    m = re.search(r'([ \t]*)function gwCloseIcon\(\) \{   // glassware:icon.*?// glassware:icon end', src, re.S)
    if not m: raise SystemExit(f'{p}: no gwCloseIcon() block')
    return src[:m.start()] + m.group(1) + ICON.replace('{i}', m.group(1)) + src[m.end():]

# Selectors only the stamped block may style (so a copy can't drift outside it).
def owned(f):
    return [f['mode'], f['knob'], f['x'] + '{', f['x'] + ':hover', f['toggle'][1] + '{', f['toggle'][1] + '::after', f['toggle'][1] + ':checked', f['toggle'][1] + '[aria-checked']

def outside(src, f):
    """Rules outside the stamped block that style the shared controls."""
    body = re.sub(r'(?:/\*|//) ' + re.escape(START) + r'.*?' + re.escape(END), '', src, flags=re.S)
    css_bits = re.findall(r'`[^`]*`', body, re.S) + re.findall(r"'[^'\n]*\{[^'\n]*'", body)
    hits = []
    for bit in css_bits:
        for sel in owned(f):
            for m in re.finditer(re.escape(sel), bit):
                ctx = bit[max(0, m.start() - 60): m.end() + 40]
                if '{' in bit[m.start():m.start() + 80]: hits.append(ctx.replace('\n', ' ')[:110])
    return hits

if __name__ == '__main__':
    bad = 0
    for p in FRAMES:
        path = f'{R}/tools/kit/template.js' if p == 'tools/kit/template' else f"{R}/{p}/{p.split('/')[1]}.user.js"
        src = open(path, encoding='utf-8').read(); new = stamp(src, p)
        if '--check' in sys.argv:
            if new != src: print(f'✗ {p}: the stamped frame differs from tools/frame.py (run python3 tools/frame.py)'); bad += 1
            for h in outside(src, FRAMES[p]): print(f'✗ {p}: styles a shared control outside the frame: …{h}…'); bad += 1
        elif new != src: open(path, 'w', encoding='utf-8').write(new); print('stamped', p)
        else: print('unchanged', p)
    sys.exit(1 if bad else 0)
