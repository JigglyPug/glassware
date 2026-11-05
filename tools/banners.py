"""Animated lava/glass SVG banners for the READMEs (GitHub keeps SVG animation in <img>)."""
import html, os, sys
ONLY = [x for x in os.environ.get('ONLY', '').split(',') if x]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

THEMES = {  # bg, text, sub, blob colors
 'molten':   ('#0c0a0d', '#f6f1ec', 'rgba(246,241,236,.7)', ['#ff6a1f', '#ff2d6f', '#ffb23d', '#7a2cff']),
 'frost':    ('#e9ebf5', '#1d1d26', 'rgba(29,29,38,.62)',   ['#b9a7ff', '#ffb3d1', '#9fe7d3', '#9cc8ff']),
 'midnight': ('#0b1622', '#e8f1f8', 'rgba(232,241,248,.7)', ['#3db4f2', '#7a5cff', '#1f6f9f', '#c063ff']),
}

def banner(title, sub, theme, kicker='', w=1200, h=320):
    bg, fg, sb, (c1, c2, c3, c4) = THEMES[theme]
    glass = 'rgba(255,255,255,.55)' if theme == 'frost' else 'rgba(255,255,255,.06)'
    edge = 'rgba(255,255,255,.8)' if theme == 'frost' else 'rgba(255,255,255,.14)'
    def blob(cx, cy, r, c, dx, dy, dur):
        return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{c}"><animateTransform attributeName="transform" type="translate" '
                f'values="0 0;{dx} {dy};{-dy} {dx};0 0" dur="{dur}s" repeatCount="indefinite" calcMode="spline" '
                f'keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1"/></circle>')
    t = html.escape(title); s = html.escape(sub); k = html.escape(kicker.upper())
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{t}">
<defs><clipPath id="c"><rect width="{w}" height="{h}" rx="28"/></clipPath>
<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="46"/></filter>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd27a"/><stop offset=".35" stop-color="#ff8a3d"/><stop offset=".7" stop-color="#ff2d6f"/><stop offset="1" stop-color="#b98bff"/></linearGradient></defs>
<g clip-path="url(#c)"><rect width="{w}" height="{h}" fill="{bg}"/>
<g filter="url(#b)" opacity=".9">{blob(150, 60, 190, c1, 90, 40, 17)}{blob(1010, 70, 170, c2, -80, 50, 21)}{blob(620, 330, 160, c3, 70, -40, 19)}{blob(880, 300, 130, c4, -60, -30, 23)}</g>
<rect x="64" y="64" width="{w - 128}" height="{h - 128}" rx="24" fill="{glass}" stroke="{edge}"/>
<g font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,system-ui,sans-serif">
{f'<g transform="translate(104 118)"><rect x="0" y="-9" width="9" height="9" fill="{c1 if theme != "frost" else "#5b5bd6"}" transform="rotate(45 4.5 -4.5)"/><text x="20" y="0" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="15" font-weight="700" letter-spacing="3.2" fill="{sb}">{k}</text></g>' if k else ''}
<text x="100" y="{196 if k else 176}" font-size="68" font-weight="800" letter-spacing="-2.4" fill="{'url(#g)' if theme == 'molten' and not k else fg}">{t}</text>
<text x="102" y="{238 if k else 222}" font-size="23" fill="{sb}">{s}</text></g></g></svg>'''

if __name__ == '__main__':
    import importlib.util
    RP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'readmes.py')
    src = open(RP, encoding='utf-8').read(); ns = {'__file__': RP}
    exec(src[:src.index('\nACCENT = {')], ns); S = ns['S']
    from site_themes import THEME
    os.makedirs(f'{R}/assets', exist_ok=True)
    if not ONLY: open(f'{R}/assets/glassware-banner.svg', 'w').write(banner('Glassware', 'Glass for the web. Frosted, lava-lit tools by JigglyPug.', 'molten'))
    for p, s in S.items():
        if ONLY and p not in ONLY: continue
        th = THEME[p][0]
        open(f'{R}/{p}/images/banner.svg', 'w').write(banner(s['name'], s['tag'], th, s['kicker']))
    print('banners written')
