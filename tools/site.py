"""Build the GitHub Pages site into repo/docs from the same data as the READMEs."""
import os
import re, shutil, html, json
ONLY = [x for x in os.environ.get('ONLY', '').split(',') if x]
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); D = f'{R}/docs'
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'readmes.py'), encoding='utf-8').read()
ns = {'__file__': os.path.join(os.path.dirname(os.path.abspath(__file__)), 'readmes.py')}; exec(src[:src.index('\nACCENT = {')], ns)   # S, ver, RAW, OWNER
S, ver, RAW, OWNER = ns['S'], ns['ver'], ns['RAW'], ns['OWNER']
RUNS, PAIR, GROUPS, runs_on = ns['RUNS'], ns['PAIR'], ns['GROUPS'], ns['runs_on']
REPO_URL = f'https://github.com/{OWNER}/glassware'

sys_path = __import__('sys').path; sys_path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from site_themes import THEME
HERO = {'desktop/molten-tools': 'general', 'desktop/molten-for-reddit': 'general', 'mobile/molten-for-reddit-mobile': 'lava'}

def md_inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'`(.+?)`', r'<code>\1</code>', t)
    return t

def split_feature(f):
    m = re.match(r'\*\*(.+?)\*\*[:\s]*(.*)', f)
    if m:
        body = m.group(2).strip()
        return m.group(1), (body[0].upper() + body[1:]) if body else ''
    return None, f

# ---------------------------------------------------------------- assets
os.makedirs(D, exist_ok=True)
for p in S:
    if ONLY and p not in ONLY: continue
    dst = f'{D}/img/{p.split("/")[1]}'; os.makedirs(dst, exist_ok=True)
    for f in os.listdir(f'{R}/{p}/images'):
        shutil.copy(f'{R}/{p}/images/{f}', f'{dst}/{f}')
    shutil.copy(f'{R}/assets/icons/{p.split("/")[1]}.png', f'{dst}/icon.png')   # the app icon
open(f'{D}/.nojekyll', 'w').close()

CSS = r"""
:root{--acc:#ff8a3d;--fg:#f4f1ee;--sub:rgba(244,241,238,.66);--glass:rgba(22,18,20,.48);--edge:rgba(255,255,255,.12);--hi:rgba(255,255,255,.07);
--bg:#0c0a0d;--b1:#ff6a1f;--b2:#ff2d6f;--b3:#ffb23d;--b4:#7a2cff;--chip:rgba(255,255,255,.08);--shadow:0 30px 80px -30px rgba(0,0,0,.7)}
[data-theme=frost]{--fg:#1d1d26;--sub:rgba(29,29,38,.62);--glass:rgba(255,255,255,.52);--edge:rgba(255,255,255,.75);--hi:rgba(255,255,255,.6);
--bg:#e9ebf5;--b1:#b9a7ff;--b2:#ffb3d1;--b3:#9fe7d3;--b4:#9cc8ff;--chip:rgba(255,255,255,.6);--shadow:0 30px 70px -30px rgba(60,60,120,.35)}
[data-theme=midnight]{--fg:#e8f1f8;--sub:rgba(232,241,248,.64);--glass:rgba(16,26,38,.55);--edge:rgba(255,255,255,.1);--hi:rgba(255,255,255,.06);
--bg:#0b1622;--b1:#3db4f2;--b2:#7a5cff;--b3:#1f6f9f;--b4:#c063ff;--chip:rgba(255,255,255,.07)}
/* light and dark: the sun/moon switch in the top bar (it follows the device until it's flipped) */
[data-mode=light] body{--fg:#2a1d18;--sub:rgba(42,29,24,.64);--glass:rgba(255,255,255,.55);--edge:rgba(255,255,255,.75);--hi:rgba(255,255,255,.6);
--bg:#fbf1ea;--chip:rgba(255,255,255,.6);--shadow:0 30px 70px -30px rgba(120,60,30,.3)}
[data-mode=dark] [data-theme=frost]{--fg:#ecebf5;--sub:rgba(236,235,245,.64);--glass:rgba(22,22,34,.5);--edge:rgba(255,255,255,.1);--hi:rgba(255,255,255,.06);
--bg:#0e0e18;--b1:#6c5ce7;--b2:#c2417d;--b3:#2b8f7c;--b4:#3d6fd6;--chip:rgba(255,255,255,.08);--shadow:0 30px 80px -30px rgba(0,0,0,.7)}
[data-mode=light] [data-theme=midnight]{--fg:#1f2d3d;--sub:rgba(31,45,61,.66);--glass:rgba(255,255,255,.55);--edge:rgba(255,255,255,.75);--hi:rgba(255,255,255,.6);
--bg:#edf1f5;--b1:#7cc9f5;--b2:#a99cff;--b3:#8fd0e8;--b4:#d6a5ff;--chip:rgba(255,255,255,.6);--shadow:0 30px 70px -30px rgba(40,60,90,.3)}
[data-mode=light] .lava::after{opacity:.25}[data-mode=dark] .lava::after{opacity:.55}
/* every screenshot comes in both; only the one for the current mode shows (lazy, so the other never loads) */
[data-mode=light] .dk,html:not([data-mode=light]) .lt{display:none!important}
.mode{position:relative;flex:none;width:58px;height:32px;border:0;border-radius:16px;background:var(--chip);padding:0 9px;display:flex;align-items:center;justify-content:space-between;color:var(--sub);cursor:pointer}
.mode svg{position:relative;z-index:1;width:15px;height:15px;transition:color .18s}
.mode .knob{position:absolute;top:4px;left:4px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);transition:transform .2s cubic-bezier(.3,.7,.3,1)}
[data-mode=dark] .mode .knob{transform:translateX(26px);background:#55555f}
[data-mode=light] .mode .sun,[data-mode=dark] .mode .moon{color:var(--fg)}
.mode:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
footer .match{border:0;background:none;padding:0;font:inherit;color:var(--fg);text-decoration:underline;cursor:pointer}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI Variable","Segoe UI",Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit}
/* lava lamp */
.lava{position:fixed;inset:-10vmax;z-index:-1;filter:blur(70px) saturate(1.25);overflow:hidden}
.lava i{position:absolute;border-radius:50%;opacity:.85;mix-blend-mode:normal;animation:drift 26s ease-in-out infinite alternate}
.lava i:nth-child(1){width:52vmax;height:52vmax;left:-6%;top:-8%;background:var(--b1)}
.lava i:nth-child(2){width:46vmax;height:46vmax;right:-8%;top:8%;background:var(--b2);animation-duration:32s;animation-delay:-8s}
.lava i:nth-child(3){width:40vmax;height:40vmax;left:22%;bottom:-18%;background:var(--b3);animation-duration:29s;animation-delay:-14s}
.lava i:nth-child(4){width:34vmax;height:34vmax;right:14%;bottom:-6%;background:var(--b4);animation-duration:35s;animation-delay:-4s}
.lava::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 30%,transparent 0,var(--bg) 85%);opacity:.55}
[data-theme=frost] .lava::after{opacity:.25}
@keyframes drift{0%{transform:translate(0,0) scale(1) rotate(0)}33%{transform:translate(9vmax,6vmax) scale(1.12) rotate(40deg)}66%{transform:translate(-6vmax,10vmax) scale(.9) rotate(-30deg)}100%{transform:translate(4vmax,-7vmax) scale(1.06) rotate(20deg)}}
@media (prefers-reduced-motion:reduce){.lava i{animation:none}}
.grain{position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.06;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
/* glass */
.glass{background:var(--glass);border:1px solid var(--edge);border-radius:26px;backdrop-filter:blur(26px) saturate(1.7);-webkit-backdrop-filter:blur(26px) saturate(1.7);box-shadow:inset 0 1px 0 var(--hi),var(--shadow)}
.wrap{max-width:1160px;margin:0 auto;padding:0 24px}
nav{position:sticky;top:14px;z-index:5;margin:14px auto 0;max-width:1160px;padding:0 24px}
nav .bar{display:flex;align-items:center;gap:14px;padding:10px 12px 10px 18px;border-radius:999px}
nav .brand{font-weight:700;letter-spacing:-.01em;text-decoration:none;display:flex;align-items:center;gap:10px}
nav .dot{width:22px;height:22px;border-radius:50%;background:conic-gradient(from 200deg,#ff8a3d,#ff2d6f,#7a2cff,#3db4f2,#9fe7d3,#ff8a3d);box-shadow:0 0 18px rgba(255,138,61,.6)}
nav .sp{flex:1}
nav a.link{font-size:14px;color:var(--sub);text-decoration:none;padding:8px 12px;border-radius:999px}
nav a.link:hover{color:var(--fg);background:var(--chip)}
.label{font:600 12px/1 ui-monospace,"SF Mono","Cascadia Mono",Menlo,monospace;letter-spacing:.2em;text-transform:uppercase;color:var(--acc);display:flex;align-items:center;gap:8px;margin:0 0 18px}
.label::before{content:"";width:7px;height:7px;background:var(--acc);transform:rotate(45deg);border-radius:1px}
.label .r{margin-left:auto;color:var(--sub);letter-spacing:.08em;text-transform:none;font-weight:500}
/* hero */
.hero{padding:96px 0 56px;text-align:center}
.hero h1{font-size:clamp(44px,8vw,96px);line-height:.95;letter-spacing:-.045em;margin:0 0 18px;font-weight:800}
.hero h1 span{background:linear-gradient(100deg,#ffd27a,#ff8a3d 30%,#ff2d6f 60%,#b98bff);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{font-size:clamp(17px,2.1vw,21px);color:var(--sub);max-width:640px;margin:0 auto 28px}
.chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.chip{font:600 12px/1 ui-monospace,"SF Mono",Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;padding:8px 11px;border-radius:999px;background:var(--chip);border:1px solid var(--edge);color:var(--sub)}
/* grid */
section{margin:0 0 64px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:22px}
.card{padding:14px;display:flex;flex-direction:column;transition:transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .35s}
.card:hover{transform:translateY(-6px)}
.card .shot{border-radius:16px;overflow:hidden;aspect-ratio:5/4;position:relative;-webkit-mask-image:linear-gradient(#000 72%,transparent);mask-image:linear-gradient(#000 72%,transparent)}
.card .shot img{width:100%;height:100%;object-fit:cover;object-position:top;display:block;transition:transform .6s}
.card:hover .shot img{transform:scale(1.035)}
.card .shot::after{content:"";position:absolute;inset:0;border-radius:16px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.card .body{padding:16px 8px 6px;display:flex;flex-direction:column;flex:1}
.card h3{margin:0 0 4px;font-size:21px;letter-spacing:-.02em;display:flex;align-items:center;gap:10px}
.appicon{width:40px;height:40px;flex:none;display:block;margin:-4px 0 -4px -4px}
.heroicon{width:104px;height:104px;display:block;margin:0 0 14px -8px}
.more a .appicon{width:36px;height:36px;float:left;margin:-2px 10px 0 -4px}
.card h3 a{text-decoration:none}
.card p{margin:0 0 14px;color:var(--sub)}
.card .meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.card .meta .chip{font-size:10.5px;padding:6px 9px}
.acts{display:flex;gap:8px;margin-top:auto}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:650;font-size:14.5px;padding:11px 18px;border-radius:999px;text-decoration:none;border:1px solid transparent;transition:filter .2s,transform .2s}
.btn:hover{filter:brightness(1.08);transform:translateY(-1px)}
.btn.pri{background:var(--acc);color:#fff;box-shadow:0 10px 30px -10px var(--acc)}
.btn.sec{background:var(--chip);border-color:var(--edge)}
.btn.big{font-size:16px;padding:14px 24px}
.card .acts .btn{flex:1}
/* product page */
.phero{display:grid;grid-template-columns:1fr minmax(0,560px);gap:56px;align-items:start;padding:72px 0 56px}
.phero>div{position:sticky;top:110px}
.phero h1{font-size:clamp(40px,6vw,68px);line-height:1;letter-spacing:-.04em;margin:0 0 14px}
.phero .tag{font-size:clamp(18px,2vw,22px);color:var(--sub);margin:0 0 22px}
.phero .intro{margin:0 0 26px;max-width:520px}
.phero .chips{justify-content:flex-start;margin-bottom:28px}
.phero .acts{gap:10px}
.phero figure{margin:0;padding:12px}
.phero figure img{width:100%;display:block;border-radius:16px}
.phero.phone{grid-template-columns:1fr minmax(0,380px)}
.feats{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.feat{padding:22px 22px 20px;border-radius:22px}
.feat h4{margin:0 0 6px;font-size:16.5px;letter-spacing:-.01em;display:flex;gap:10px;align-items:baseline}
.feat h4::before{content:"";flex:none;width:8px;height:8px;border-radius:50%;background:var(--acc);box-shadow:0 0 12px var(--acc);transform:translateY(-1px)}
.feat p{margin:0;color:var(--sub);font-size:15px}
.feat code{font-size:.9em;background:var(--chip);padding:1px 6px;border-radius:6px}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:20px}
.gal.phone{grid-template-columns:repeat(auto-fill,minmax(210px,1fr))}
.gal figure{margin:0;padding:12px}
.gal img{width:100%;display:block;border-radius:14px}
.gal figcaption{font:600 12px/1 ui-monospace,"SF Mono",Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--sub);padding:14px 6px 4px;text-align:center}
.note{padding:18px 22px;border-radius:20px;color:var(--sub)}
.note b{color:var(--fg)}
.lede{color:var(--sub);max-width:720px;margin:-4px 0 18px}
.more{display:flex;gap:12px;flex-wrap:wrap}
.more a{flex:1;min-width:200px;padding:16px 18px;border-radius:20px;text-decoration:none}
.more a small{display:block;color:var(--sub)}
/* platform filter */
.seg{display:inline-flex;gap:4px;padding:5px;border-radius:999px;margin:30px auto 0}
.seg button{font-family:inherit;font-weight:650;font-size:14.5px;line-height:1;color:var(--sub);background:none;border:0;padding:11px 20px;border-radius:999px;cursor:pointer;transition:background .2s,color .2s}
.seg button:hover{color:var(--fg)}
.seg button[aria-pressed=true]{background:var(--acc);color:#fff;box-shadow:0 8px 24px -10px var(--acc)}
[data-for=desktop] #phone,[data-for=phone] #desktop{display:none}
a.chip{text-decoration:none;color:var(--fg)}a.chip:hover{background:var(--edge)}
.pair{display:inline-flex;align-items:center;gap:12px;margin-top:16px;padding:10px 18px 10px 12px;border-radius:18px;text-decoration:none}
.pair .appicon{width:34px;height:34px;margin:0}
.pair small{display:block;color:var(--sub);font-size:12.5px}
footer{padding:30px 0 60px;text-align:center;color:var(--sub);font-size:14px}
footer a{color:var(--fg)}
@media (max-width:560px){nav a.link.sec{display:none}.label .r{display:none}nav{top:10px}}
@media (max-width:860px){.phero,.phero.phone{grid-template-columns:1fr;padding-top:48px}.phero>div{position:static}.gal{grid-template-columns:1fr}.grid{grid-template-columns:1fr}.hero{padding-top:64px}}
"""
if not ONLY: open(f'{D}/style.css', 'w', encoding='utf-8').write(CSS.strip() + '\n')

SITE = f'https://{OWNER.lower()}.github.io/glassware/'
# Light or dark: the visitor's choice (saved in this browser), otherwise their device's setting.
MODE_HEAD = ('<script>(function(){var m;try{m=localStorage.getItem("glassware-mode")}catch(e){}'
             'if(m!=="light"&&m!=="dark")m=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";'
             'document.documentElement.dataset.mode=m})()</script>')
SUN = ''.join(f'<path d="{d}"/>' for d in ['M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7', 'M12 2.5v2', 'M12 19.5v2', 'M2.5 12h2', 'M19.5 12h2', 'M5.3 5.3l1.4 1.4', 'M17.3 17.3l1.4 1.4', 'M5.3 18.7l1.4-1.4', 'M17.3 6.7l1.4-1.4'])
MOON = '<path d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6Z"/>'
SVG = '<svg class="{c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">{p}</svg>'
MODE_SWITCH = ('<button class="mode" type="button" role="switch" aria-label="Dark mode" title="Light or dark"><span class="knob"></span>'
               + SVG.format(c='sun', p=SUN) + SVG.format(c='moon', p=MOON) + '</button>')
MODE_SCRIPT = '''<script>
(function(){var h=document.documentElement,b=document.querySelector('.mode'),w=document.querySelector('.matchwrap'),q=matchMedia('(prefers-color-scheme: dark)');
function saved(){try{return localStorage.getItem('glassware-mode')}catch(e){return null}}
function show(){var d=h.dataset.mode==='dark';b.setAttribute('aria-checked',String(d));w.hidden=!saved()}
b.addEventListener('click',function(){var m=h.dataset.mode==='dark'?'light':'dark';h.dataset.mode=m;try{localStorage.setItem('glassware-mode',m)}catch(e){}show()});
w.querySelector('button').addEventListener('click',function(){try{localStorage.removeItem('glassware-mode')}catch(e){}h.dataset.mode=q.matches?'dark':'light';show()});
q.addEventListener('change',function(){if(!saved()){h.dataset.mode=q.matches?'dark':'light';show()}});show()})();
</script>'''

LAZY = 'loading="lazy"'
def shot(src_dark, alt, attrs=''):
    """A screenshot in both modes: the dark capture and its -light twin; CSS shows the one that matches."""
    light = src_dark[:-5] + '-light.webp'
    local = os.path.join(D, re.sub(r'^(\.\./)+', '', light))
    if not os.path.exists(local): return f'<img src="{src_dark}" alt="{alt}" {attrs}>'
    return f'<img class="dk" src="{src_dark}" alt="{alt}" {attrs}><img class="lt" src="{light}" alt="{alt}" {attrs}>'
def og_ver(og):
    """A short fingerprint of what a link preview is made from (the panel cards, the copy, the
    preview tools), added to its address so Discord, Slack and others fetch it again when it changes
    instead of showing a cached old one. The images themselves aren't byte-for-byte repeatable."""
    import hashlib
    hsh = hashlib.sha1()
    slug = og.split('/')[1] if og.count('/') == 2 else None
    ps = [p for p in S if p.split('/')[1] == slug] if slug else ['desktop/prism', 'desktop/molten-tools', 'desktop/kaleidoscope']
    for p in ps:
        for n in ('card.webp', 'card-light.webp'):
            f = f'{R}/{p}/images/{n}'
            if os.path.exists(f): hsh.update(open(f, 'rb').read())
        hsh.update((S[p]['name'] + S[p]['tag'] + S[p]['kicker'] + THEME[p][0] + THEME[p][1]).encode())
    for t in ('og.py', 'prismcut.py'): hsh.update(open(f'{R}/tools/{t}', 'rb').read())
    return og + '?v=' + hsh.hexdigest()[:10]

def page(title, desc, theme, acc, body, depth, path='', og='og.png', favicon=None):
    up = '../' * depth
    meta = (f'<link rel="canonical" href="{SITE}{path}">'
            f'<meta property="og:type" content="website"><meta property="og:site_name" content="Glassware">'
            f'<meta property="og:title" content="{html.escape(title)}"><meta property="og:description" content="{html.escape(desc)}">'
            f'<meta property="og:url" content="{SITE}{path}"><meta property="og:image" content="{SITE}{og_ver(og)}">'
            f'<meta property="og:image:width" content="1280"><meta property="og:image:height" content="640">'
            f'<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="{SITE}{og_ver(og)}">')
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title><meta name="description" content="{html.escape(desc)}">
<meta name="theme-color" content="{acc}">{meta}<meta name="color-scheme" content="light dark"><link rel="stylesheet" href="{up}style.css">
{MODE_HEAD}
{('<link rel="icon" type="image/png" href="' + up + favicon + '">') if favicon else '''<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23ff8a3d'/%3E%3Cstop offset='.55' stop-color='%23ff2d6f'/%3E%3Cstop offset='1' stop-color='%237a2cff'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='16' cy='16' r='14' fill='url(%23g)'/%3E%3C/svg%3E">'''}
</head><body data-theme="{theme}" style="--acc:{acc}">
<div class="lava" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="grain" aria-hidden="true"></div>
<nav><div class="bar glass"><a class="brand" href="{up}"><span class="dot"></span>Glassware</a><span class="sp"></span>
<a class="link sec" href="{up}#desktop">Desktop</a><a class="link sec" href="{up}#phone">Phone</a><a class="link" href="{REPO_URL}">GitHub</a>{MODE_SWITCH}</div></nav>
{body}
<footer>Made by <b>JigglyPug</b> · Built for <a href="https://www.tampermonkey.net/">Tampermonkey</a> · <a href="{REPO_URL}">Source on GitHub</a><span class="matchwrap" hidden> · <button class="match" type="button">Match my device</button></span></footer>
{MODE_SCRIPT}
</body></html>
"""

def install_url(p): slug = p.split('/')[1]; return f'{RAW}/{p}/{slug}.user.js'
def v_of(p): slug = p.split('/')[1]; return ver(f'{p}/{slug}.user.js')

# ---------------------------------------------------------------- landing
def pair_chip(p):
    q = PAIR.get(p)
    if not q: return ''
    return f'<a class="chip" href="{q}/">{"Phone" if RUNS[q] == "phone" else "Desktop"} version ↗</a>'

def card(p):
    s = S[p]; slug = p.split('/')[1]; th, acc = THEME[p]
    return f"""<article class="card glass" style="--acc:{acc}">
<a class="shot" href="{p}/">{shot(f'img/{slug}/card.webp', html.escape(s['name']) + ' settings panel', LAZY)}</a>
<div class="body"><h3><img class="appicon" src="img/{slug}/icon.png" alt="" width="40" height="40"><a href="{p}/">{html.escape(s['name'])}</a></h3><p>{md_inline(s['tag'])}</p>
<div class="meta"><span class="chip">{html.escape(s['sites'])}</span><span class="chip">{s['platform']}</span><span class="chip">v{v_of(p)}</span>{pair_chip(p)}</div>
<div class="acts"><a class="btn pri" href="{install_url(p)}">Install</a><a class="btn sec" href="{p}/">Details</a></div></div></article>"""

NOTE = {'both': 'The same script, on your computer and your phone', 'desktop': 'For desktop browsers',
        'phone': 'Made for phone browsers like Edge on Android'}
sections = ''.join(f"""<section id="{g}"><div class="label">{t}<span class="r">{NOTE[g]}</span></div><div class="grid">{''.join(card(p) for p in S if RUNS[p] == g)}</div></section>
""" for g, t in GROUPS)
# The filter: All / Desktop / Phone. Desktop hides the phone-only section, Phone hides the
# desktop-only one. Opens on Phone when the page is opened on a phone. Without JS everything shows.
FILTER = """<script>
(function(){var b=document.body,bs=[].slice.call(document.querySelectorAll('.seg button'));
function set(v,push){b.dataset.for=v;bs.forEach(function(x){x.setAttribute('aria-pressed',x.dataset.v===v)});
if(push)history.replaceState(null,'',v==='all'?location.pathname:'#'+v)}
function fromHash(){var h=location.hash.slice(1);if(h==='mobile')h='phone';return h==='desktop'||h==='phone'?h:null}
bs.forEach(function(x){x.addEventListener('click',function(){set(x.dataset.v,true)})});
addEventListener('hashchange',function(){var h=fromHash();if(h){set(h);scrollTo({top:0})}});
var phone=matchMedia('(pointer:coarse) and (max-width:860px)').matches;
set(fromHash()||(phone?'phone':'all'))})();
</script>"""
body = f"""<main class="wrap">
<header class="hero"><h1>Glass for the <span>web.</span></h1>
<p>Glassware is a set of frosted-glass, lava-lit tools that make the sites you live on look and work better. Install in one click. Updates arrive on their own.</p>
<div class="chips"><span class="chip">{len(S)} scripts</span><span class="chip">Desktop + phone</span><span class="chip">Auto-updating</span><span class="chip">Tampermonkey</span></div>
<div class="seg glass" role="group" aria-label="Show scripts for"><button data-v="all" aria-pressed="true">All</button><button data-v="desktop" aria-pressed="false">Desktop</button><button data-v="phone" aria-pressed="false">Phone</button></div></header>
{sections}</main>
{FILTER}"""
(lambda h: None if ONLY else open(f'{D}/index.html', 'w', encoding='utf-8').write(h))(page('Glassware by JigglyPug', 'Glassware: frosted-glass, lava-lit tools for Tampermonkey.', 'molten', '#ff8a3d', body, 0, '', 'og.png'))

# ---------------------------------------------------------------- product pages
for p, s in S.items():
    if ONLY and p not in ONLY: continue
    slug = p.split('/')[1]; th, acc = THEME[p]; phone = bool(s.get('runs_on_phone'))
    hero = HERO.get(p, s['shots'][0][0]); rest = [x for x in s['shots'] if x[0] != hero]
    img = lambda f: f'../../img/{slug}/{f}.webp'
    feats = ''
    from features import F
    for t, b in F[p]:
        feats += f'<div class="feat glass">' + (f'<h4>{md_inline(t)}</h4>' if t else '') + f'<p>{md_inline(b)}</p></div>'
    gal = ''.join(f'<figure class="glass">{shot(img(f), html.escape(c), LAZY)}<figcaption>{html.escape(c)}</figcaption></figure>' for f, c in rest)
    where = RUNS[p]
    if where == 'both': sib = [q for q in S if q != p and RUNS[q] == 'both']
    else: sib = sorted([q for q in S if q != p and runs_on(q, where)], key=lambda q: (RUNS[q] != 'both',))
    q = PAIR.get(p)
    pair = (f'<a class="pair glass" href="../../{q}/" style="--acc:{THEME[q][1]}"><img class="appicon" src="../../img/{q.split("/")[1]}/icon.png" alt="" width="34" height="34">'
            f'<span><small>{"Also on your phone" if RUNS[q] == "phone" else "Also on desktop"}</small><b>{html.escape(S[q]["name"])}</b></span></a>') if q else ''
    more_label = {'both': 'More for desktop and phone', 'desktop': 'More for desktop', 'phone': 'More for your phone'}[where]
    more = ''.join(f'<a class="glass" href="../../{q}/" style="--acc:{THEME[q][1]}"><img class="appicon" src="../../img/{q.split("/")[1]}/icon.png" alt="" width="36" height="36"><b>{html.escape(S[q]["name"])}</b><small>{md_inline(S[q]["tag"])}</small></a>' for q in sib)
    note = f'<div class="note glass"><b>Requires</b> {md_inline(s["note"])}</div>' if s.get('note') else ''
    start = f'<section><div class="label">Getting started</div><div class="note glass">{md_inline(s["getting_started"])}</div></section>' if s.get('getting_started') else ''
    phone_sec = ''
    if s.get('phone'):
        ptxt, pshots = s['phone']
        pg = ''.join(f'<figure class="glass">{shot(img(f), html.escape(c) + " on a phone", LAZY)}<figcaption>{html.escape(c)}</figcaption></figure>' for f, c in pshots)
        phone_sec = f'<section><div class="label">On your phone</div><p class="lede">{md_inline(ptxt)}</p><div class="gal phone">{pg}</div></section>'
    body = f"""<main class="wrap">
<header class="phero{' phone' if phone else ''}"><div>
<img class="heroicon" src="../../img/{slug}/icon.png" alt="{html.escape(s['name'])} icon" width="104" height="104">
<div class="label">{s['kicker']}</div>
<h1>{html.escape(s['name'])}</h1><p class="tag">{md_inline(s['tag'])}</p><p class="intro">{md_inline(s['intro'])}</p>
<div class="chips"><span class="chip">{html.escape(s['sites'])}</span><span class="chip">{s['platform']}</span><span class="chip">v{v_of(p)}</span></div>
<div class="acts"><a class="btn pri big" href="{install_url(p)}">Install {html.escape(s['name'])}</a><a class="btn sec big" href="{REPO_URL}/blob/main/{p}/{slug}.user.js">View source</a></div>{pair}
</div><figure class="glass">{shot(img(hero), html.escape(s['name']) + ' panel', LAZY)}</figure></header>
{start}
<section><div class="label">Features</div><div class="feats">{feats}</div></section>
{f'<section><div class="label">A closer look</div><div class="gal{" phone" if phone else ""}">{gal}</div></section>' if gal else ''}
{phone_sec}
{f'<section>{note}</section>' if note else ''}
<section><div class="label">{more_label}</div><div class="more">{more}</div></section>
</main>"""
    os.makedirs(f'{D}/{p}', exist_ok=True)
    open(f'{D}/{p}/index.html', 'w', encoding='utf-8').write(page(f"{s['name']} — {s['tag']}", s['intro'], th, acc, body, 2, f'{p}/', f'img/{slug}/og.png', f'img/{slug}/icon.png'))
print('site built:', sorted(os.listdir(D)))
