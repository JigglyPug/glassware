"""Check that Kaleidoscope's prompt only goes to the claude.ai tab it opened.

    python3 tools/handofftest.py

Opens claude.ai pages (stand-ins) with a prompt waiting in Kaleidoscope's storage and checks who takes
it: the tab opened for it (its one-time id in the address) does; a plain claude.ai/new tab you opened
yourself doesn't, nor does a tab with another id, nor one whose prompt has no id (from before tabs had
them) or has expired. The real claude.ai can't be reached from here, so this tests Kaleidoscope's side
of the hand-off only. Prints "clean" or the problems.
"""
import json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from screens import CLOCK
from datetime import datetime

NOW = int(datetime.fromisoformat(CLOCK).timestamp() * 1000)
JS = f'{R}/desktop/kaleidoscope/kaleidoscope.user.js'
READ = "(async () => { await new Promise(r => setTimeout(r, 800)); return { left: 'kaleidoscope.handoff' in window.__gm, url: location.href }; })()"

def taken(url, handoff, script=JS):
    seed = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump({'kaleidoscope.handoff': handoff}, seed); seed.close()
    r = subprocess.run(['node', f'{HERE}/shot.js', script, url, '/dev/null', '--clock', CLOCK, '--seed', seed.name, '--eval', READ, '--print'],
                       capture_output=True, text=True, timeout=120)
    os.unlink(seed.name)
    line = next((l for l in r.stdout.splitlines() if l.startswith('EVAL ')), None)
    if not line: raise RuntimeError((r.stderr or r.stdout)[-300:])
    got = json.loads(line[5:])
    return not got['left'], got['url']

def run(script=JS):
    h = lambda **k: dict({'text': 'a prompt', 'ts': NOW, 'autoSend': True, 'label': 'Test'}, **k)
    cases = [
        ('the tab opened for it', 'https://claude.ai/new#kaleidoscope-tab=abc123', h(tab='abc123'), True),
        ('a claude.ai/new tab you opened yourself', 'https://claude.ai/new', h(tab='abc123'), False),
        ('a tab opened for another prompt', 'https://claude.ai/new#kaleidoscope-tab=zzz999', h(tab='abc123'), False),
        ('a prompt saved without a tab id', 'https://claude.ai/new', h(), False),
        ('an expired prompt', 'https://claude.ai/new#kaleidoscope-tab=abc123', h(tab='abc123', ts=NOW - 11 * 60 * 1000), False),
    ]
    bad = []
    for name, url, handoff, want in cases:
        try: got, after = taken(url, handoff, script)
        except RuntimeError as e: bad.append(f'{name}: could not run: {e}'); continue
        if got != want: bad.append(f'{name}: the prompt was {"taken" if got else "left waiting"}, it should be {"taken" if want else "left alone"}')
        if want and 'kaleidoscope-tab' in after: bad.append(f'{name}: the one-time id stayed in the address ({after})')
    return bad

if __name__ == '__main__':
    bad = run(*sys.argv[1:2])
    print('== kaleidoscope hand-off: ' + ('clean' if not bad else f'{len(bad)} problem' + 's' * (len(bad) > 1)))
    for b in bad: print('  ' + b)
