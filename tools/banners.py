"""Animated lava/glass SVG banners for the READMEs (GitHub keeps SVG animation in <img>), each showing
light and dark at once along the prism cut, since GitHub has no light/dark switch to show it off."""
import html, os, sys
ONLY = [x for x in os.environ.get('ONLY', '').split(',') if x]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Each page theme in both modes: bg, text, sub, glass, glass edge, blob colors.
THEMES = {
 ('molten', 'dark'):    ('#0c0a0d', '#f6f1ec', 'rgba(246,241,236,.7)', 'rgba(255,255,255,.06)', 'rgba(255,255,255,.14)', ['#ff6a1f', '#ff2d6f', '#ffb23d', '#7a2cff']),
 ('molten', 'light'):   ('#fbf1ea', '#1d1d1f', 'rgba(29,29,31,.64)',   'rgba(255,255,255,.55)', 'rgba(255,255,255,.8)',  ['#ff8a3d', '#ff5c8a', '#ffc46b', '#b07cff']),
 ('frost', 'light'):    ('#e9ebf5', '#1d1d26', 'rgba(29,29,38,.62)',   'rgba(255,255,255,.55)', 'rgba(255,255,255,.8)',  ['#b9a7ff', '#ffb3d1', '#9fe7d3', '#9cc8ff']),
 ('frost', 'dark'):     ('#121219', '#f2f2f5', 'rgba(235,235,245,.62)', 'rgba(255,255,255,.06)', 'rgba(255,255,255,.14)', ['#5b4fd6', '#c2457f', '#2f9e86', '#3f6fd0']),
 ('midnight', 'dark'):  ('#0b1622', '#e8f1f8', 'rgba(232,241,248,.7)', 'rgba(255,255,255,.06)', 'rgba(255,255,255,.14)', ['#3db4f2', '#7a5cff', '#1f6f9f', '#c063ff']),
 ('midnight', 'light'): ('#eaf2f9', '#1f2d3d', 'rgba(31,45,61,.66)',   'rgba(255,255,255,.55)', 'rgba(255,255,255,.8)',  ['#7fd0f7', '#a996ff', '#8fc3e3', '#d9a2ff']),
}
KICKER = {'molten': '#ff8a3d', 'frost': '#5b5bd6', 'midnight': '#3db4f2'}

def layer(id_, title, sub, theme, mode, kicker, w, h):
    """One full banner in one mode; ids are prefixed so two can share an SVG."""
    bg, fg, sb, glass, edge, (c1, c2, c3, c4) = THEMES[(theme, mode)]
    def blob(cx, cy, r, c, dx, dy, dur):
        return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{c}"><animateTransform attributeName="transform" type="translate" '
                f'values="0 0;{dx} {dy};{-dy} {dx};0 0" dur="{dur}s" repeatCount="indefinite" calcMode="spline" '
                f'keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1"/></circle>')
    t = html.escape(title); s = html.escape(sub); k = html.escape(kicker.upper())
    fill = f'url(#{id_}g)' if theme == 'molten' and not k else fg
    return f'''<g><rect width="{w}" height="{h}" fill="{bg}"/>
<g filter="url(#b)" opacity="{.9 if mode == 'dark' else .75}">{blob(150, 60, 190, c1, 90, 40, 17)}{blob(1010, 70, 170, c2, -80, 50, 21)}{blob(620, 330, 160, c3, 70, -40, 19)}{blob(880, 300, 130, c4, -60, -30, 23)}</g>
<rect x="64" y="64" width="{w - 128}" height="{h - 128}" rx="24" fill="{glass}" stroke="{edge}"/>
<g font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,system-ui,sans-serif">
{f'<g transform="translate(104 118)"><rect x="0" y="-9" width="9" height="9" fill="{KICKER[theme]}" transform="rotate(45 4.5 -4.5)"/><text x="20" y="0" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="15" font-weight="700" letter-spacing="3.2" fill="{sb}">{k}</text></g>' if k else ''}
<text x="100" y="{196 if k else 176}" font-size="68" font-weight="800" letter-spacing="-2.4" fill="{fill}">{t}</text>
<text x="102" y="{238 if k else 222}" font-size="23" fill="{sb}">{s}</text></g></g>'''

def banner(title, sub, theme, kicker='', accent='#ffffff', lava=False, w=1200, h=320):
    """Light and dark on one banner, cut along the same diagonal as the link previews (tools/prismcut.py):
    light upper left, dark lower right, a thin seam in the script's accent. For Molten the edge is a
    lava lamp: a slow wave with wax drops of light glass melting off it into the dark (a goo filter), kept clear
    of the text."""
    import math
    import json
    CUT = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tokens.json'), encoding='utf-8'))['cut']
    x0, x1 = w * CUT['top'], w * CUT['bottom']   # the same diagonal as the link previews (tools/tokens.json)
    nx, ny = h, -(x1 - x0); L = math.hypot(nx, ny); nx, ny = nx / L, ny / L   # unit normal, toward the dark side
    amp = 1 if lava else 0
    pts = []
    for i in range(-4, 45):   # run past the top and bottom so the cut leaves the banner cleanly
        t = i / 40; x, y = x0 + (x1 - x0) * t, h * t
        off = amp * (math.sin(t * 2 * math.pi * 2.1 + .6) * 16 + math.sin(t * 2 * math.pi * 4.7 + 2) * 6) * w / 1000
        pts.append((x + nx * off, y + ny * off))
    edge = ' '.join(f'L{x:.1f} {y:.1f}' for x, y in pts)
    region = f'M-60 -60 L{pts[0][0]:.1f} -60 {edge} L-60 {h + 60} Z'
    seam = 'M' + edge[1:]
    drops = ''
    if lava:   # near the top and bottom of the edge only, where there's no text
        for t, side, r, gap in [(.07, 1, 14, 4), (.17, 1, 9, 12), (.84, 1, 17, 3), (.93, 1, 10, 16)]:
            x, y = x0 + (x1 - x0) * t, h * t; d = side * (r + gap)
            drops += f'<circle cx="{x + nx * d:.1f}" cy="{y + ny * d:.1f}" r="{r}" fill="{"#fff" if side > 0 else "#000"}"/>'
    shape = f'<path d="{region}" fill="#fff"/>{drops}'
    grad = '<linearGradient id="{0}g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd27a"/><stop offset=".35" stop-color="#ff8a3d"/><stop offset=".7" stop-color="#ff2d6f"/><stop offset="1" stop-color="#b98bff"/></linearGradient>'
    t_ = html.escape(title)
    dark = layer('d', title, sub, theme, 'dark', kicker, w, h); light = layer('l', title, sub, theme, 'light', kicker, w, h)
    # goo: blur, then sharpen the alpha back up, so drops touching the edge melt into it
    goo = '<filter id="goo" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 26 -11"/></filter>'
    # the seam follows the mask's edge: a thin accent line plus a faint glow
    line = (f'<filter id="ln" x="-10%" y="-10%" width="120%" height="120%">' + ('<feGaussianBlur in="SourceGraphic" stdDeviation="7"/><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 26 -11" result="s"/>' if lava else '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 0" result="s"/>')
            + f'<feMorphology in="s" operator="dilate" radius="1" result="d"/><feComposite in="d" in2="s" operator="out" result="e"/>'
            f'<feFlood flood-color="{accent}" flood-opacity="{CUT["max"]}"/><feComposite in2="e" operator="in" result="c"/>'
            f'<feGaussianBlur in="c" stdDeviation="5" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="g"/><feMergeNode in="c"/></feMerge></filter>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{t_}, in light and dark">
<defs><clipPath id="c"><rect width="{w}" height="{h}" rx="28"/></clipPath>
<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="46"/></filter>{goo}{line}
<mask id="lt" maskUnits="userSpaceOnUse" x="0" y="0" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="#000"/><g{' filter="url(#goo)"' if lava else ''}>{shape}</g></mask>
{grad.format('d')}{grad.format('l')}</defs>
<g clip-path="url(#c)">{dark}
<g mask="url(#lt)">{light}</g>
<g filter="url(#ln)" opacity="1">{shape}</g>
</g></svg>'''

if __name__ == '__main__':
    import importlib.util
    RP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'readmes.py')
    src = open(RP, encoding='utf-8').read(); ns = {'__file__': RP}
    exec(src[:src.index('\nACCENT = {')], ns); S = ns['S']
    from site_themes import THEME
    os.makedirs(f'{R}/assets', exist_ok=True)
    if not ONLY: open(f'{R}/assets/glassware-banner.svg', 'w').write(banner('Glassware', 'Glass for the web. Frosted, lava-lit tools by JigglyPug.', 'molten', accent='#ff8a3d', lava=True))
    for p, s in S.items():
        if ONLY and p not in ONLY: continue
        th, acc = THEME[p]
        open(f'{R}/{p}/images/banner.svg', 'w').write(banner(s['name'], s['tag'], th, s['kicker'], acc, p.split('/')[1].startswith('molten')))
    print('banners written')
