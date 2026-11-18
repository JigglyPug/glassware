"""Opened media: lava around it in Molten for Discord, and no Looking-Glass badge on top of it.

    python3 tools/tests/mediatest.py

Molten for Discord, on a stand-in Discord: a picture opened in the viewer (a dark backdrop over the app) gets
light glass, the app behind steps out of view and the dark box around the picture goes see-through; closing it
brings the app straight back. The viewer is found by what it is, not by Discord's names: a small
picture centered in a nameless viewer counts, a profile card's banner doesn't. A fullscreen video takes the lava into its fullscreen box with its black made
see-through, and gives it back on the way out.
Looking-Glass: its badge hides while a layer over the whole page (a picture viewer) or an open dialog sits on
top of its video, and comes back when that closes.
Prints "== opened media: clean" or the problems.
"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); R = os.path.dirname(HERE)   # HERE is the tools folder

DISCORD = r"""(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  const mount = document.getElementById('app-mount') || (() => { const m = document.createElement('div'); m.id = 'app-mount'; document.body.append(m); return m; })();
  mount.innerHTML = '';
  const app = document.createElement('div'); app.className = 'app_abc'; app.style.cssText = 'position:fixed;inset:0;padding:40px;color:#fff;font:20px sans-serif;background:rgba(30,30,40,.35)';
  app.textContent = 'CHAT CONTENT BEHIND THE VIEWER '.repeat(40); mount.append(app);
  const lc = document.createElement('div'); lc.className = 'layerContainer_x';
  const bd = document.createElement('div'); bd.className = 'backdrop__x'; bd.style.cssText = 'position:fixed;inset:0;background:rgb(0,0,0);opacity:.85';
  const layer = document.createElement('div'); layer.className = 'layer_x'; layer.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.9)';
  const c = document.createElement('canvas'); c.width = 600; c.height = 800; const g = c.getContext('2d'); g.fillStyle = '#e8b04a'; g.fillRect(0,0,600,800); g.fillStyle = '#7a2a10'; g.fillRect(100,150,400,500);
  const img = document.createElement('img'); img.src = c.toDataURL(); img.style.cssText = 'height:80vh;width:auto';
  layer.append(img); lc.append(bd, layer); mount.append(lc);
  await w(1800);
  out.open = { viewer: document.documentElement.hasAttribute('data-mfd-viewer'), bd: bd.hasAttribute('data-mfd-vbd'), appHidden: getComputedStyle(app).visibility, layerClear: layer.hasAttribute('data-mfd-vclr'), layerBg: getComputedStyle(layer).backgroundColor, bdBg: getComputedStyle(bd).backgroundColor, bdFilter: getComputedStyle(bd).backdropFilter };
  lc.remove(); await w(60); out.closed = { viewer: document.documentElement.hasAttribute('data-mfd-viewer'), appVisible: getComputedStyle(app).visibility, marks: document.querySelectorAll('[data-mfd-vunder],[data-mfd-vbd]').length };
  const fs = document.createElement('div'); fs.style.cssText = 'position:fixed;inset:0;background:#000'; const inner = document.createElement('div'); inner.style.cssText = 'width:100%;height:100%;background:#000;display:flex'; const vid = document.createElement('video'); vid.style.cssText = 'width:100%;height:100%;background:#000'; inner.append(vid); fs.append(inner); mount.append(fs);
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => window.__fe || null });
  window.__fe = fs; document.dispatchEvent(new Event('fullscreenchange')); await w(200);
  out.fs = { lavaInside: fs.querySelectorAll(':scope > div.mfd-art, :scope > canvas.mfd-video, :scope > div.mfd-blobs').length, inBody: document.querySelectorAll('body > div.mfd-art, body > canvas.mfd-video, body > div.mfd-blobs').length, boxBg: getComputedStyle(fs).backgroundColor, innerBg: getComputedStyle(inner).backgroundColor, videoBg: getComputedStyle(vid).backgroundColor };
  window.__fe = null; document.dispatchEvent(new Event('fullscreenchange')); await w(200);
  out.fsExit = { inBody: document.querySelectorAll('body > div.mfd-art, body > canvas.mfd-video, body > div.mfd-blobs').length, left: fs.querySelectorAll('div.mfd-art, canvas.mfd-video, div.mfd-blobs').length, boxBg: getComputedStyle(fs).backgroundColor };
  return out;
})()
"""
DISCORD2 = r"""(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  const mount = document.getElementById('app-mount') || (() => { const m = document.createElement('div'); m.id = 'app-mount'; document.body.append(m); return m; })();
  mount.innerHTML = '';
  const app = document.createElement('div'); app.className = 'q1z'; app.style.cssText = 'position:fixed;inset:0;padding:40px;color:#fff;font:20px sans-serif'; app.textContent = 'CHAT '.repeat(200); mount.append(app);
  const pic = (wd, ht) => { const c = document.createElement('canvas'); c.width = wd; c.height = ht; const g = c.getContext('2d'); g.fillStyle = '#4ab0e8'; g.fillRect(0, 0, wd, ht); const i = document.createElement('img'); i.src = c.toDataURL(); i.style.cssText = `width:${wd}px;height:${ht}px;display:block`; return i; };
  // a viewer whose names say nothing, a small picture in the middle, a dark grey box around it
  const lc = document.createElement('div'); lc.className = 'k9';
  const bd = document.createElement('div'); bd.className = 'p3'; bd.style.cssText = 'position:absolute;inset:0;background:hsl(0 0% 0% / 1);opacity:.85';
  const layer = document.createElement('div'); layer.className = 'r7'; layer.style.cssText = 'position:absolute;inset:0';
  const grey = document.createElement('div'); grey.style.cssText = 'position:absolute;inset:0;background:#1e1f22;display:flex;align-items:center;justify-content:center';
  const wrap = document.createElement('div'); wrap.append(pic(420, 420)); grey.append(wrap); layer.append(grey); lc.append(bd, layer); mount.append(lc);
  await w(1500);
  out.small = { viewer: document.documentElement.hasAttribute('data-mfd-viewer'), appHidden: getComputedStyle(app).visibility, greyBg: getComputedStyle(grey).backgroundColor, bdGlass: bd.hasAttribute('data-mfd-vbd') };
  lc.remove(); await w(300);
  // a profile card: a banner near the top of a card, a dark backdrop behind it: not a viewer
  const lc2 = document.createElement('div'); const bd2 = document.createElement('div'); bd2.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.7)';
  const card = document.createElement('div'); card.style.cssText = 'position:absolute;left:calc(50% - 300px);top:60px;width:600px;height:640px;background:#232428';
  card.append(pic(600, 220)); lc2.append(bd2, card); mount.append(lc2);
  await w(1500);
  out.profile = { viewer: document.documentElement.hasAttribute('data-mfd-viewer'), appHidden: getComputedStyle(app).visibility };
  return out;
})()
"""
BADGE = r"""(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const shown = () => __all().filter(e => e.classList && e.classList.contains('b') && e.getAttribute('aria-label') && /Open/.test(e.getAttribute('aria-label')) && !e.classList.contains('out') && getComputedStyle(e).display !== 'none' && +getComputedStyle(e).opacity > 0.1).length;
  await w(1500); const out = { before: shown() };
  const ov = document.createElement('div'); ov.style.cssText = 'position:absolute;left:0;top:' + scrollY + 'px;width:100vw;height:100vh;background:rgba(0,0,0,.85);z-index:1000'; document.body.append(ov);   // laid out like Discord's viewer: not position:fixed
  window.dispatchEvent(new Event('scroll')); await w(800); out.fullscreenLayer = shown(); ov.remove();
  window.dispatchEvent(new Event('scroll')); await w(800); out.afterClose = shown();
  const v = document.querySelector('video'); const r = v.getBoundingClientRect();
  const dlg = document.createElement('div'); dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true');
  dlg.style.cssText = `position:absolute;left:${r.left + scrollX}px;top:${r.top + scrollY}px;width:${r.width}px;height:${r.height}px;background:#222;z-index:1000`; document.body.append(dlg);
  window.dispatchEvent(new Event('scroll')); await w(800); out.dialog = shown(); dlg.remove();
  window.dispatchEvent(new Event('scroll')); await w(800); out.end = shown();
  return out;
})()
"""

def run(script, url, drive, *extra):
    r = subprocess.run(['node', f'{HERE}/lib/shot.js', f'{R}/{script}', url, '/dev/null', *extra, '--eval', drive, '--print'], capture_output=True, text=True)
    v = next((json.loads(l[5:]) for l in r.stdout.splitlines() if l.startswith('EVAL ')), None)
    return v, ((r.stderr.strip().splitlines() or ['no output'])[-1])

bad = []
want = lambda ok, msg: ok or bad.append(msg)
d, err = run('desktop/molten-for-discord/molten-for-discord.user.js', 'https://discord.com/channels/1/2', DISCORD, '--seed', f'{HERE}/seeds/molten-for-discord.json')
if not isinstance(d, dict): bad.append('molten-for-discord: the test page gave nothing back: ' + err)
else:
    o, c, f, x = d['open'], d['closed'], d['fs'], d['fsExit']
    want(o['viewer'] and o['bd'] and o['bdBg'] == 'rgba(8, 6, 18, 0.2)', 'molten-for-discord: an opened picture didn\'t get light glass around it')
    want(o['appHidden'] == 'hidden', 'molten-for-discord: the app stayed in view behind an opened picture')
    want(o['layerClear'] and o['layerBg'] == 'rgba(0, 0, 0, 0)', 'molten-for-discord: the dark box around an opened picture stayed dark')
    want(not c['viewer'] and c['appVisible'] == 'visible' and c['marks'] == 0, 'molten-for-discord: closing the viewer didn\'t bring the app straight back')
    want(f['lavaInside'] == 4 and f['inBody'] == 0, 'molten-for-discord: the lava didn\'t move into the fullscreen video')
    want(f['boxBg'] == f['innerBg'] == f['videoBg'] == 'rgba(0, 0, 0, 0)', 'molten-for-discord: black stayed around the fullscreen video')
    want(x['inBody'] == 4 and x['left'] == 0 and x['boxBg'] == 'rgb(0, 0, 0)', 'molten-for-discord: leaving fullscreen didn\'t put the lava and the colors back')
d2, err = run('desktop/molten-for-discord/molten-for-discord.user.js', 'https://discord.com/channels/1/2', DISCORD2, '--seed', f'{HERE}/seeds/molten-for-discord.json')
if not isinstance(d2, dict): bad.append('molten-for-discord: the second test page gave nothing back: ' + err)
else:
    sm, pr = d2['small'], d2['profile']
    want(sm['viewer'] and sm['appHidden'] == 'hidden' and sm['bdGlass'] and sm['greyBg'] == 'rgba(0, 0, 0, 0)', 'molten-for-discord: a small picture in a viewer whose names say nothing stayed on dark grey with the chat behind it')
    want(not pr['viewer'] and pr['appHidden'] == 'visible', 'molten-for-discord: a profile card was taken for a picture viewer')
l, err = run('desktop/looking-glass/looking-glass.user.js', 'https://example.com/', BADGE, '--video')
if not isinstance(l, dict): bad.append('looking-glass: the test page gave nothing back: ' + err)
else:
    want(l['before'] == 1 and l['afterClose'] == 1 and l['end'] == 1, f'looking-glass: the badge didn\'t show on its own (or come back): {l}')
    want(l['fullscreenLayer'] == 0, 'looking-glass: the badge stayed on top of a layer over the whole page')
    want(l['dialog'] == 0, 'looking-glass: the badge stayed on top of an open dialog')
for b in bad: print('opened media: ' + b)
if not bad: print('== opened media: clean')
sys.exit(1 if bad else 0)
