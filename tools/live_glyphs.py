"""Draw the app-icon glyphs (tools/icons.js geometry) inside the LIVE header tiles of Prism,
Hourglass and Looking-Glass, as glass tubing tinted by the tile's live color variables.

    python3 tools/live_glyphs.py      (re-run after changing the glyph shapes in icons.js)
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
# same shapes as tools/icons.js, on its 100x100 canvas. fills: [path, opacity, color (white if left out)];
# tubes: [path, width]; rays: [path, color, width] (plain colored light, no glass); view: the glyph's viewBox
GLYPHS = {
    'hourglass': {'fills': [['M36.5 34 C36.5 43 46.5 46 46.5 50 C46.5 54 36.5 57 36.5 66 L63.5 66 C63.5 57 53.5 54 53.5 50 C53.5 46 63.5 43 63.5 34 Z', .08],
                            ['M41.2 39.4 C44 39 46 40.4 50 39.6 C54 40.4 56 39 58.8 39.4 C57.6 43.6 52 45.6 50 48.4 C48 45.6 42.4 43.6 41.2 39.4 Z', 1, '#ffb347'],
                            ['M48.85 51.6 a1.15 1.15 0 1 0 2.30 0 a1.15 1.15 0 1 0 -2.30 0', 1, '#ffb347'], ['M49.15 54.8 a0.85 0.85 0 1 0 1.70 0 a0.85 0.85 0 1 0 -1.70 0', 1, '#ff9f43'],
                            ['M40.6 63.6 C41.4 60.2 44 58.6 46.6 59.6 C47.8 57.4 52 57 53.6 59.2 C56 58.4 58.6 60.2 59.4 63.6 Z', 1, '#ff7a5a']],
                  'tubes': [['M36.5 34 C36.5 43 46.5 46 46.5 50 C46.5 54 36.5 57 36.5 66 M63.5 34 C63.5 43 53.5 46 53.5 50 C53.5 54 63.5 57 63.5 66', 3.6],
                            ['M32 31 H68 M32 69 H68', 4.6]],
                  # the moving lava, for the hourglass that flips: a glob swells at the neck, stretches, lets go and drops
                  # onto the pile (two drops a flip); the top sinks and the pile grows until the glass turns over
                  'drip': [{"tag": "path", "attrs": {}, "long": True, "anims": [{"a": "d", "v": ["M40.6 38.6 C44 38.2 46 39.6 50 38.8 C54 39.6 56 38.2 59.4 38.6 C58 43.6 52 45.8 50 48.6 C48 45.8 42 43.6 40.6 38.6 Z", "M43.6 42.6 C46 42.4 47.6 43 50 42.6 C52.4 43 54 42.4 56.4 42.6 C55.4 45 51.6 46.6 50 48.6 C48.4 46.6 44.6 45 43.6 42.6 Z", "M40.6 38.6 C44 38.2 46 39.6 50 38.8 C54 39.6 56 38.2 59.4 38.6 C58 43.6 52 45.8 50 48.6 C48 45.8 42 43.6 40.6 38.6 Z"]}]}, {"tag": "ellipse", "attrs": {"cx": "50"}, "anims": [{"a": "cy", "kt": "0;.45;.62;.7;1", "v": "48.6;49.4;51.4;52.2;52.2"}, {"a": "rx", "kt": "0;.45;.62;.7;1", "v": ".7;2.2;1.7;0;0"}, {"a": "ry", "kt": "0;.45;.62;.7;1", "v": ".7;2.3;3.6;0;0"}]}, {"tag": "circle", "attrs": {"cx": "50", "r": "0"}, "anims": [{"a": "cy", "kt": "0;.66;.86;1", "v": "52;52;61.5;61.5", "spl": "0 0 1 1;.55 0 1 .6;0 0 1 1"}, {"a": "r", "kt": "0;.65;.67;.84;.88;1", "v": "0;0;1.8;1.65;0;0"}]}, {"tag": "path", "attrs": {}, "long": True, "anims": [{"a": "d", "v": ["M42.6 63.6 C43.4 61.6 45.6 60.6 47.6 61.2 C48.6 60.2 51.4 60 52.6 61 C54.6 60.6 56.8 61.6 57.4 63.6 Z", "M40.4 63.6 C41.2 59.6 44 57.8 46.6 58.8 C47.8 56.4 52.2 56 53.6 58.4 C56.2 57.6 58.8 59.6 59.6 63.6 Z", "M42.6 63.6 C43.4 61.6 45.6 60.6 47.6 61.2 C48.6 60.2 51.4 60 52.6 61 C54.6 60.6 56.8 61.6 57.4 63.6 Z"]}]}, {"tag": "ellipse", "attrs": {"cx": "50", "cy": "61"}, "anims": [{"a": "rx", "kt": "0;.86;.92;1", "v": "0;0;3.4;0"}, {"a": "ry", "kt": "0;.86;.92;1", "v": "0;0;1.2;0"}]}]},
    'prism': {'view': '14 14 72 72',
              'fills': [['M50 31 L70 65.6 H30 Z', .09], ['M37.9 51.4 L59.4 47.2 L60.4 50.6 L37.9 52.6 Z', .4]],
              'rays': [["M59.40 47.40 L81 36.5", "#ff4d5e", 1.8], ["M59.70 47.95 L81 41.7", "#ff9f43", 1.8], ["M60.00 48.50 L81 46.9", "#ffe066", 1.8], ["M60.30 49.05 L81 52.1", "#5ee38a", 1.8], ["M60.60 49.60 L81 57.3", "#4dabff", 1.8], ["M60.90 50.15 L81 62.5", "#9b6bff", 1.8], ["M17 58.6 L37.9 52", "#ffffff", 2.6]],
              'tubes': [['M50 31 L70 65.6 H30 Z', 4]]},
    'magnifier': {'fills': [['M45 30 A15 15 0 1 1 44.99 30 Z', .12], ['M33.40 45 a11.6 11.6 0 1 0 23.20 0 a11.6 11.6 0 1 0 -23.20 0', .6, '#a36cff'],
                            ['M41.6 39.6 Q41.6 37.8 43.2 38.7 L51 43.6 Q52.6 44.6 51 45.6 L43.2 50.5 Q41.6 51.4 41.6 49.6 Z', .95]],
                  'tubes': [['M45 30 A15 15 0 1 1 44.99 30 Z', 4.2], ['M56.2 56.2 L69 69', 5.6]],
                  'shine': ['M35.6 40.6 A10 10 0 0 1 41.6 34.2']},
}
JS = r"""    // The app-icon glyph as glass tubing (same shapes as tools/icons.js), tinted by the tile's
    // live color, so it changes with the script's state. Written by tools/live_glyphs.py.
    const GLASS_GLYPHS = __GLYPHS__;
    let glassGlyphN = 0;
    // flip: { cycle (s), hold (the share of the cycle before the glass turns over) } draws the dripping lava, timed to
    // a CSS flip of that length; without it (or when the device asks for less motion) the lava stands still
    function glassGlyph(kind, flip) {
        const NS = 'http://www.w3.org/2000/svg', G = GLASS_GLYPHS[kind], id = 'gg-blur-' + (++glassGlyphN);
        const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
        const svg = mk('svg', { viewBox: G.view || '20 20 60 60', class: 'gg', 'aria-hidden': 'true' });
        const f = mk('filter', { id, x: '-40%', y: '-40%', width: '180%', height: '180%' });
        f.append(mk('feGaussianBlur', { stdDeviation: '1.5' }));
        const defs = mk('defs', {}); defs.append(f); svg.append(defs);
        const g = mk('g', { class: 'gg-g' }); svg.append(g);
        const line = 'fill:none;stroke-linecap:round;stroke-linejoin:round;';
        const moving = flip && G.drip && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
        for (const [d, o, c] of G.fills || []) if (!(moving && c)) g.append(mk('path', { d, style: 'fill:' + (c || '#fff') + ';fill-opacity:' + o + ';stroke:none' }));
        if (moving) {
            const goo = mk('filter', { id: id + 'g', x: '-50%', y: '-50%', width: '200%', height: '200%' });
            goo.append(mk('feGaussianBlur', { stdDeviation: '1.1' }), mk('feColorMatrix', { values: '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 18 -7' }));
            const lg = mk('linearGradient', { id: id + 'l', x1: '0', y1: '36', x2: '0', y2: '66', gradientUnits: 'userSpaceOnUse' });
            for (const [o, c] of [[0, '#ffe08a'], [.55, '#ff9f43'], [1, '#ff5e7e']]) lg.append(mk('stop', { offset: o, 'stop-color': c }));
            defs.append(goo, lg);
            const lava = mk('g', { filter: 'url(#' + id + 'g)', fill: 'url(#' + id + 'l)' });
            for (const sh of G.drip) {
                const e = mk(sh.tag, sh.attrs);
                for (const a of sh.anims) {
                    const at = { attributeName: a.a, dur: (sh.long ? flip.cycle : flip.cycle / 2) + 's', repeatCount: 'indefinite',
                        values: Array.isArray(a.v) ? a.v.join(';') : a.v, keyTimes: sh.long ? '0;' + flip.hold + ';1' : a.kt };
                    if (a.spl) Object.assign(at, { calcMode: 'spline', keySplines: a.spl });
                    e.append(mk('animate', at));
                }
                lava.append(e);
            }
            g.append(lava);
        }
        for (const [d, c, w] of G.rays || []) {
            g.append(mk('path', { d, filter: 'url(#' + id + ')', style: line + 'stroke:' + c + ';stroke-opacity:.5;stroke-width:' + (w * 2.1) }));
            g.append(mk('path', { d, style: line + 'stroke:' + c + ';stroke-width:' + w }));
        }
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
