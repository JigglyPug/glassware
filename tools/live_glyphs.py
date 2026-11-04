"""Draw the app-icon glyphs (tools/icons.js geometry) inside the LIVE header tiles of Prism,
Hourglass and Looking-Glass, as glass tubing tinted by the tile's live color variables.

    python3 tools/live_glyphs.py      (re-run after changing the glyph shapes in icons.js)
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
# same shapes as tools/icons.js, on its 100x100 canvas. fills: [path, opacity]; tubes: [path, width]
GLYPHS = {
    'hourglass': {'fills': [['M36.5 34 C36.5 43 46.5 46 46.5 50 C46.5 54 36.5 57 36.5 66 L63.5 66 C63.5 57 53.5 54 53.5 50 C53.5 46 63.5 43 63.5 34 Z', .08],
                            ['M41 38.5 L59 38.5 C57.5 43.5 51.5 45.5 50 48 C48.5 45.5 42.5 43.5 41 38.5 Z', .34],
                            ['M41 63.5 C43 58.5 47 57.5 50 57.5 C53 57.5 57 58.5 59 63.5 Z', .38]],
                  'tubes': [['M36.5 34 C36.5 43 46.5 46 46.5 50 C46.5 54 36.5 57 36.5 66 M63.5 34 C63.5 43 53.5 46 53.5 50 C53.5 54 63.5 57 63.5 66', 3.6],
                            ['M32 31 H68 M32 69 H68', 4.6]]},
    'prism': {'fills': [['M50 31 L70 66 H30 Z', .08]],
              'tubes': [['M50 31 L70 66 H30 Z', 4], ['M24 59 L46 52.5', 2.6], ['M54 50 L77 43', 2.6]]},
    'magnifier': {'fills': [['M45 30 A15 15 0 1 1 44.99 30 Z', .12]],
                  'tubes': [['M45 30 A15 15 0 1 1 44.99 30 Z', 4.2], ['M56.2 56.2 L69 69', 5.6]],
                  'shine': ['M36 41 A10 10 0 0 1 42 34.6']},
}
JS = r"""    // The app-icon glyph as glass tubing (same shapes as tools/icons.js), tinted by the tile's
    // live color, so it changes with the script's state. Written by tools/live_glyphs.py.
    const GLASS_GLYPHS = __GLYPHS__;
    let glassGlyphN = 0;
    function glassGlyph(kind) {
        const NS = 'http://www.w3.org/2000/svg', G = GLASS_GLYPHS[kind], id = 'gg-blur-' + (++glassGlyphN);
        const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
        const svg = mk('svg', { viewBox: '20 20 60 60', class: 'gg', 'aria-hidden': 'true' });
        const f = mk('filter', { id, x: '-40%', y: '-40%', width: '180%', height: '180%' });
        f.append(mk('feGaussianBlur', { stdDeviation: '1.5' }));
        const defs = mk('defs', {}); defs.append(f); svg.append(defs);
        const g = mk('g', { class: 'gg-g' }); svg.append(g);
        const line = 'fill:none;stroke-linecap:round;stroke-linejoin:round;';
        for (const [d, o] of G.fills || []) g.append(mk('path', { d, style: 'fill:#fff;fill-opacity:' + o + ';stroke:none' }));
        for (const [d, w] of G.tubes) {
            const W = w * 1.25;
            g.append(mk('path', { d, filter: 'url(#' + id + ')', style: line + 'stroke:rgba(var(--a-rgb),.6);stroke-width:' + (W + 3) }));
            g.append(mk('path', { d, style: line + 'stroke:#fff;stroke-opacity:.98;stroke-width:' + W }));
            g.append(mk('path', { d, style: line + 'stroke:var(--fill-hi, var(--bg-fill, var(--bg)));stroke-opacity:.85;stroke-width:' + (W - 1.7) }));
            g.append(mk('path', { d, transform: 'translate(-.35 -.45)', style: line + 'stroke:#fff;stroke-opacity:.75;stroke-width:' + Math.max(.7, w * .3) }));
        }
        for (const d of G.shine || []) g.append(mk('path', { d, style: line + 'stroke:#fff;stroke-opacity:.8;stroke-width:2' }));
        return svg;
    }
"""
CSS = ".logo svg.gg{width:88%;height:88%;filter:none;overflow:visible}\n"
EXTRA = {   # other places that show the app icon: same glass tile + glyph
    'desktop/hourglass/hourglass.user.js': ("h('div', { class: 'glogo' }, icon(ICONS.glass, 28, 1.8))", "h('div', { class: 'glogo' }, glassGlyph('hourglass'))", '.glogo', 'var(--fill-hi)', 'var(--fill)', '\n.glogo svg{'),
    'desktop/looking-glass/looking-glass.user.js': ("h('span', { class: 'lg' }, icon(ICONS.mirror, 14, 2.1))", "h('span', { class: 'lg' }, glassGlyph('magnifier'))", '.mh .lg', 'var(--bg)', 'var(--bg)', '\n.mh .lg{'),
}
def glass_css(sel, a, b):
    return (f"{sel}{{position:relative;overflow:hidden;color:#fff;"
            f"background:radial-gradient(120% 90% at 50% 62%,rgba(11,11,22,.55),rgba(11,11,22,0) 70%),linear-gradient(145deg,color-mix(in srgb,{a} 72%,#0b0b16),color-mix(in srgb,{b} 46%,#0b0b16));"
            "box-shadow:inset 0 0 0 1px rgba(255,255,255,.3),inset 0 1px 0 rgba(255,255,255,.5),inset 0 0 6px 1px rgba(var(--a-rgb),.55),0 4px 16px -4px rgba(var(--a-rgb),.95)}"
            f"{sel}::before{{content:\"\";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.28),rgba(255,255,255,0) 48%),linear-gradient(135deg,transparent 34%,rgba(255,255,255,.09) 34% 44%,transparent 44%)}}"
            f"{sel} svg.gg{{position:relative;width:88%;height:88%;overflow:visible}}\n")

TARGETS = {
    'desktop/prism/prism.user.js': [("icon(ICONS.prism, 17, { sw: 1.8 })", "glassGlyph('prism')")],
    'desktop/hourglass/hourglass.user.js': [("icon(ICONS.glass, 30, 1.8)", "glassGlyph('hourglass')"), ("icon(ICONS.glass, 19, 1.9)", "glassGlyph('hourglass')")],
    'desktop/looking-glass/looking-glass.user.js': [("icon(ICONS.mirror, 19, 1.9)", "glassGlyph('magnifier')")],
}

def run():
    js = JS.replace('__GLYPHS__', json.dumps(GLYPHS, separators=(',', ':')))
    for f, reps in TARGETS.items():
        p = f'{R}/{f}'; s = open(p, encoding='utf-8').read()
        if 'const GLASS_GLYPHS = ' in s:
            s = re.sub(r"    // The app-icon glyph as glass tubing[\s\S]*?\n        return svg;\n    }\n", js.replace('\\', '\\\\'), s, count=1)
        else:
            i = s.index('    function icon(')
            s = s[:i] + js + '\n' + s[i:]
        for old, new in reps:
            s = s.replace(f"h('div', {{ class: 'logo' }}, {old})", f"h('div', {{ class: 'logo' }}, {new})")
        if CSS not in s:   # after each glass tile block
            s = s.replace(".logo svg{position:relative;filter:drop-shadow(0 0 1.2px rgba(255,255,255,.95)) drop-shadow(0 0 4px rgba(var(--a-rgb),.95))}\n",
                          ".logo svg{position:relative;filter:drop-shadow(0 0 1.2px rgba(255,255,255,.95)) drop-shadow(0 0 4px rgba(var(--a-rgb),.95))}\n" + CSS)
        if CSS not in s or "glassGlyph('" not in s.split('function glassGlyph', 1)[1]: sys.exit(f'{f}: not wired')
        if f in EXTRA:
            old, new, sel, a, b, anchor = EXTRA[f]
            s = s.replace(old, new)
            if f'{sel}::before' not in s:
                i = s.index(anchor) + 1; j = s.index('}\n', i) + 2
                s = s[:j] + glass_css(sel, a, b) + s[j:]
        open(p, 'w', encoding='utf-8').write(s); print('drew glass glyph in', f)

if __name__ == '__main__': run()
