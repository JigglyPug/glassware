"""Link-preview images (1280x640) for the site, one per page, in each page's own theme.

    python3 tools/og.py      (pages.py runs it for you)

Writes docs/og.png (landing, also used as the GitHub social preview) and
docs/img/<script>/og.png. Rendered with Playwright from the panel screenshots.
"""
import base64, html, os, sys, tempfile
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE); D = f'{R}/docs'
sys.path.insert(0, HERE)
RP = os.path.join(HERE, 'readmes.py'); src = open(RP, encoding='utf-8').read(); ns = {'__file__': RP}
exec(src[:src.index('\nACCENT = {')], ns); S = ns['S']
from site_themes import THEME
import prismcut

BG = {'molten': ('#0c0a0d', '#f6f1ec', 'rgba(246,241,236,.72)', ['#ff6a1f', '#ff2d6f', '#ffb23d', '#7a2cff']),
      'frost': ('#e9ebf5', '#1d1d26', 'rgba(29,29,38,.62)', ['#b9a7ff', '#ffb3d1', '#9fe7d3', '#9cc8ff']),
      'midnight': ('#0b1622', '#e8f1f8', 'rgba(232,241,248,.72)', ['#3db4f2', '#7a5cff', '#1f6f9f', '#c063ff'])}

def data_uri_png(path):
    return 'data:image/png;base64,' + base64.b64encode(open(path, 'rb').read()).decode()

def data_uri(path):
    if path.endswith('.png'): return data_uri_png(path)
    return 'data:image/webp;base64,' + base64.b64encode(open(path, 'rb').read()).decode()

def card_html(theme, kicker, title, sub, shots, gradient_title=False, icons=()):
    bg, fg, sb, (c1, c2, c3, c4) = BG[theme]
    glass = 'rgba(255,255,255,.55)' if theme == 'frost' else 'rgba(255,255,255,.07)'
    edge = 'rgba(255,255,255,.8)' if theme == 'frost' else 'rgba(255,255,255,.14)'
    tstyle = ('background:linear-gradient(100deg,#ffd27a,#ff8a3d 30%,#ff2d6f 60%,#b98bff);-webkit-background-clip:text;color:transparent'
              if gradient_title else f'color:{fg}')
    imgs = ''.join(f'<div class="shot" style="--r:{rot}deg;--x:{x}px;--y:{y}px;z-index:{z};--w:{360 if len(shots) > 1 else 430}px"><img src="{data_uri(s)}"></div>'
                   for s, rot, x, y, z in shots)
    return f"""<html><head><style>
*{{box-sizing:border-box}}body{{margin:0;width:1280px;height:640px;overflow:hidden;background:{bg};font-family:-apple-system,'Segoe UI',Inter,system-ui,sans-serif}}
.lava{{position:absolute;inset:-120px;filter:blur(80px) saturate(1.2)}}.lava i{{position:absolute;border-radius:50%;opacity:.9}}
.lava i:nth-child(1){{width:640px;height:640px;left:-80px;top:-160px;background:{c1}}}.lava i:nth-child(2){{width:560px;height:560px;right:-60px;top:-40px;background:{c2}}}
.lava i:nth-child(3){{width:520px;height:520px;left:300px;bottom:-260px;background:{c3}}}.lava i:nth-child(4){{width:420px;height:420px;right:160px;bottom:-200px;background:{c4}}}
.panel{{position:absolute;z-index:5;left:64px;top:64px;bottom:64px;width:620px;padding:56px 52px;border-radius:32px;background:{glass};border:1px solid {edge};backdrop-filter:blur(24px);display:flex;flex-direction:column;justify-content:center}}
.icons{{display:flex;gap:4px;margin:0 0 14px -8px}}.ic{{width:{104 if len(icons) == 1 else 64}px;height:{104 if len(icons) == 1 else 64}px;display:block;flex:none}}
.k{{font:700 17px ui-monospace,Menlo,monospace;letter-spacing:.22em;text-transform:uppercase;color:{sb};margin-bottom:18px}}
h1{{margin:0 0 18px;font-size:{88 if len(title) < 13 else 72}px;line-height:.98;letter-spacing:-.045em;font-weight:800;{tstyle}}}
p{{margin:0;font-size:29px;line-height:1.3;color:{sb}}}
.brand{{position:absolute;z-index:6;left:116px;bottom:96px;font:700 20px -apple-system,system-ui;color:{sb};display:flex;gap:10px;align-items:center}}
.dot{{width:20px;height:20px;border-radius:50%;background:conic-gradient(from 200deg,#ff8a3d,#ff2d6f,#7a2cff,#3db4f2,#9fe7d3,#ff8a3d)}}
.shot{{position:absolute;right:0;top:0;transform:translate(var(--x),var(--y)) rotate(var(--r));border-radius:22px;padding:10px;background:{glass};border:1px solid {edge};box-shadow:0 30px 80px -20px rgba(0,0,0,.55)}}
.shot img{{display:block;width:var(--w,430px);border-radius:14px}}
</style></head><body><div class="lava"><i></i><i></i><i></i><i></i></div>
<div class="panel">{('<div class="icons">' + ''.join(f'<img class="ic" src="{data_uri_png(i)}">' for i in icons) + '</div>') if icons else ''}<div class="k">{html.escape(kicker)}</div><h1>{html.escape(title)}</h1><p>{html.escape(sub)}</p></div>
<div class="brand"><span class="dot"></span>Glassware · JigglyPug</div>{imgs}</body></html>"""

def lead(p):
    imgs = f'{R}/{p}/images'
    for n in ['main', 'general', 'lava']:
        if os.path.exists(f'{imgs}/{n}.webp'): return f'{imgs}/{n}.webp'

if __name__ == '__main__':
    with sync_playwright() as pw:
        b = pw.chromium.launch(); page = b.new_page(viewport={'width': 1280, 'height': 640})
        def render(h, out):
            page.set_content(h); page.wait_for_timeout(150); page.screenshot(path=out)
        # landing: three panels fanned out
        fan = [(f'{R}/desktop/prism/images/card.webp', -8, -300, 150, 1), (f'{R}/desktop/molten-tools/images/card.webp', 2, -150, 50, 2),
               (f'{R}/desktop/kaleidoscope/images/card.webp', 10, 10, 190, 3)]
        # landing preview: screenshots only (no icon row), so a new script doesn't mean redrawing it
        render(card_html('molten', 'Userscripts for Tampermonkey', 'Glassware', 'Glass for the web. Frosted, lava-lit tools by JigglyPug.', fan, True), f'{D}/og.png')
        for p, s in S.items():
            slug = p.split('/')[1]; th = THEME[p][0]
            kicker = s['kicker']
            # the prism cut: light and dark in one picture, since a preview can't follow a switch
            # (Molten gets the lava edge; everything else a straight one), seam in the script's accent
            card, light = f'{R}/{p}/images/card.webp', f'{R}/{p}/images/card-light.webp'
            if os.path.exists(light):
                tmp = os.path.join(tempfile.mkdtemp(), 'cut.png')
                prismcut.cut(light, card, tmp, THEME[p][1], lava=slug.startswith('molten'))
                card = tmp
            shot = [(card, 4, -80, 120, 1)]
            os.makedirs(f'{D}/img/{slug}', exist_ok=True)
            render(card_html(th, kicker, s['name'], s['tag'], shot, False, [f'{R}/assets/icons/{slug}.png']), f'{D}/img/{slug}/og.png')
        b.close()
    print('previews rendered')
