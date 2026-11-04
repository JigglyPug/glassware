"""Put the app icon (assets/icons) into the panel header of the scripts whose header tile is STATIC.
Scripts with a LIVE tile (its color or glyph changes with state) keep their drawn tile instead,
styled like the icons in CSS: Prism (title bar color), Hourglass (free time / lockdown, flipping
hourglass) and Looking-Glass (site color). See CLAUDE.md.

    python3 tools/panel_icons.py

Run it again whenever the icons change (after `node tools/icons.js`): it re-embeds the current art.
The old drawn glyph stays underneath as a fallback if a site blocks embedded images.
"""
import base64, io, os, re, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
SCRIPTS = {   # static header tiles only
    'desktop/molten-tools': 'molten-tools', 'desktop/molten-for-reddit': 'molten-for-reddit',
    'mobile/molten-for-reddit-mobile': 'molten-for-reddit', 'desktop/kaleidoscope': 'kaleidoscope',
    'mobile/kaleidoscope-mobile': 'kaleidoscope',
}

def data_uri(icon):
    im = Image.open(f'{R}/assets/icons/{icon}.png').convert('RGBA')
    w = im.width; m = round(w * 0.07)                      # crop to the tile, without the outer glow
    t = im.crop((m, m, w - m, w - m)).resize((96, 96), Image.LANCZOS)
    buf = io.BytesIO(); t.save(buf, 'WEBP', quality=92, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()

def patch(path, uri):
    s = open(path, encoding='utf-8').read(); o = s
    line = f"const ICON_SRC = '{uri}'; // app icon (assets/icons), embedded by tools/panel_icons.py\n"
    if 'const ICON_SRC = ' in s:
        s = re.sub(r"const ICON_SRC = '[^']*';[^\n]*\n", line.replace('\\', '\\\\'), s, count=1)
    else:
        i = s.index('const VERSION = (typeof GM_info')
        indent = s[s.rindex('\n', 0, i) + 1:i]
        s = s[:i] + line + indent + s[i:]
    if '.logo{' in s:   # Prism, Hourglass, Looking-Glass
        s = re.sub(r"h\('div', \{ class: 'logo' \}, (icon\(ICONS\.(?:prism|glass|mirror), [^)]*\))\)",
                   r"h('div', { class: 'logo' }, \1, h('img', { class: 'logo-img', src: ICON_SRC, alt: '', onerror: e => e.target.remove() }))", s)
        if '.logo-img{' not in s:
            s = re.sub(r"(\n\s*(?:\.m )?\.logo\{[^\n]*\})", r"\1\n.logo{position:relative}.logo-img{position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;display:block}", s)
            if '.logo-img{' not in s:   # .logo spread over several lines (Prism)
                i = s.index('\n.logo{') + 1
                s = s[:i] + '.logo-img{position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;display:block}\n.logo{position:relative}\n' + s[i:]
    for cls in ['ytt-icon', 'kld-icon']:   # Molten and Kaleidoscope
        if f"el('div', '{cls}')" in s and f"'{cls}-img'" not in s:
            s = s.replace("      tile.append(svg);\n      return tile;",
                          f"      tile.append(svg);\n      const img = el('img', '{cls}-img');\n      img.alt = '';\n"
                          "      img.addEventListener('error', () => img.remove());\n      img.src = ICON_SRC;\n      tile.append(img);\n      return tile;", 1)
            panel = '#ytt-panel' if cls == 'ytt-icon' else '#kaleidoscope-panel'
            s = s.replace(f"      '{panel} .{cls} svg{{", f"      '{panel} .{cls}{{position:relative}}' +\n      '{panel} .{cls}-img{{position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;display:block}}' +\n      '{panel} .{cls} svg{{", 1)
    if 'ICON_SRC' not in s.split('const ICON_SRC', 1)[1]: sys.exit(f'{path}: icon not wired')
    open(path, 'w', encoding='utf-8').write(s)
    print(('updated' if s != o else 'unchanged'), path, s.count('ICON_SRC') - 1, 'use(s)')

def hourglass_block(path):
    """The block screen keeps its flipping hourglass: the glass tile below, the glyph on its own layer on top."""
    s = open(path, encoding='utf-8').read()
    for name, part in [('ICON_TILE_SRC', 'parts/hourglass-tile'), ('ICON_GLYPH_SRC', 'parts/hourglass-glyph')]:
        line = f"const {name} = '{data_uri(part)}';\n"
        if f'const {name} = ' in s: s = re.sub(rf"const {name} = '[^']*';\n", line, s, count=1)
        else:
            i = s.index('const ICON_SRC = '); indent = s[s.rindex('\n', 0, i) + 1:i]; s = s[:i] + line + indent + s[i:]
    s = s.replace("h('div', { class: 'logo' }, icon(ICONS.glass, 30, 1.8), h('img', { class: 'logo-img', src: ICON_SRC, alt: '', onerror: e => e.target.remove() }))",
                  "h('div', { class: 'logo' }, icon(ICONS.glass, 30, 1.8), h('img', { class: 'logo-img', src: ICON_TILE_SRC, alt: '', onerror: e => e.target.remove() }), "
                  "h('img', { class: 'logo-img logo-glyph', src: ICON_GLYPH_SRC, alt: '', onerror: e => e.target.remove() }))")
    rule = ".logo svg{animation:flip 6s ease-in-out infinite}\n"
    if '.logo-glyph{' not in s and rule in s:
        s = s.replace(rule, rule + ".logo .logo-glyph{animation:flip2 12s ease-in-out infinite}\n"
                      "@keyframes flip2{0%,41%{transform:rotate(0)}50%,91%{transform:rotate(180deg)}100%{transform:rotate(360deg)}}\n", 1)
    if 'logo-glyph' not in s or 'flip2' not in s: sys.exit('hourglass block screen not wired')
    open(path, 'w', encoding='utf-8').write(s); print('block screen icon layers set', path)

if __name__ == '__main__':
    for p, icon in SCRIPTS.items(): patch(f"{R}/{p}/{p.split('/')[1]}.user.js", data_uri(icon))
    hourglass_block(f'{R}/desktop/hourglass/hourglass.user.js')
