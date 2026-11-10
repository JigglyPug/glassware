"""Check that Kaleidoscope's prompt only goes to the claude.ai tab it opened.

    python3 tools/handofftest.py

Opens claude.ai pages (stand-ins) with a prompt waiting in Kaleidoscope's storage and checks who takes
it: the tab opened for it (its one-time id in the address) does; a plain claude.ai/new tab you opened
yourself doesn't, nor does a tab with another id, nor one whose prompt has no id (from before tabs had
them) or has expired. The real claude.ai can't be reached from here, so this tests Kaleidoscope's side
of the hand-off only.

It also checks the AniList side when the Claude tab doesn't open or goes away (shot.js --opentab):
- the browser blocks the tab (GM_openInTab gives nothing back, or throws, and so does window.open), for
  a new board, an update of the last board, and Paste/Paste + send: the waiting prompt is cleared, no
  board job is left running, and the status line says Claude couldn't be opened
- the tab opens and you close it before the board comes back: the job ends with a message saying so
  (not a progress bar that runs for 15 minutes), and the waiting prompt is cleared; while the tab is
  still open the job keeps going
Prints "clean" or the problems.
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

ANILIST = 'https://anilist.co/user/JigglyPug/animelist'
BOARD = {'id': 'b1', 'ts': NOW - 3600 * 1000, 'label': 'Recent', 'mode': 'recent', 'user': 'JigglyPug', 'type': 'ANIME',
         'conv': 'https://claude.ai/chat/0b7f3c2e-1d4a-4c55-9e1f-6a2b8c9d0e11', 'html': '<p>board</p>'}
# Opens the panel, presses a Recommend mode (or "Update board"), optionally closes the Claude tab, and reads the result.
SEND = """(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const root = document.querySelector('kaleidoscope-root').shadowRoot, p = root.querySelector('#kaleidoscope-panel');
  const press = () => { if (ACTION === 'update') { const b = [...p.querySelectorAll('button')].find(b => b.textContent.trim() === 'Update board'); if (b) b.click(); return !!b; }
    const b = p.querySelector('.kld-mode'); if (b) b.click(); return !!b; };
  for (let i = 0; i < 20 && !press(); i++) await sleep(250);
  await sleep(ACTION === 'update' ? 4500 : 1500);
  const before = { job: 'kaleidoscope.job' in window.__gm, jobText: (root.querySelector('#kaleidoscope-job') || {}).textContent || '' };
  if (CLOSE) { window.__closeTab(0); await sleep(2500); }
  const st = p.isConnected ? p.querySelector('.kld-status') : null;
  return { before, opened: (window.__opened || []).length, handoff: 'kaleidoscope.handoff' in window.__gm, job: 'kaleidoscope.job' in window.__gm,
    status: st ? st.textContent : '', statusErr: !!(st && /err/.test(st.className)),
    jobText: (root.querySelector('#kaleidoscope-job') || {}).textContent || '', errs: window.__errs };
})()"""

def send(opentab, action='mode', close=False, settings=None, boards=None, script=JS):
    gm = {'kaleidoscope.settings': dict({'claudeMode': 'board'}, **(settings or {}))}
    if boards: gm['kaleidoscope.boards'] = boards
    seed = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump(gm, seed); seed.close()
    js = SEND.replace('ACTION', json.dumps(action)).replace('CLOSE', 'true' if close else 'false')
    r = subprocess.run(['node', f'{HERE}/shot.js', script, ANILIST, '/dev/null', '--cmd', 'Open Kaleidoscope', '--clock', CLOCK,
                        '--seed', seed.name, '--opentab', opentab, '--eval', js, '--print'], capture_output=True, text=True, timeout=120)
    os.unlink(seed.name)
    line = next((l for l in r.stdout.splitlines() if l.startswith('EVAL ')), None)
    if not line: raise RuntimeError((r.stderr or r.stdout)[-300:])
    return json.loads(line[5:])

def run_send(script=JS):
    bad = []
    blocked = [('a new board', 'mode', {}, None), ('an update of the last board', 'update', {}, [BOARD]),
               ('Paste + send', 'mode', {'claudeMode': 'send'}, None), ('Paste only', 'mode', {'claudeMode': 'paste'}, None)]
    for how in ('fail', 'throw'):
        for name, action, settings, boards in blocked:
            label = f'{name}, the tab blocked ({"nothing back" if how == "fail" else "it throws"})'
            try: v = send(how, action, settings=settings, boards=boards, script=script)
            except RuntimeError as e: bad.append(f'{label}: could not run: {e}'); continue
            if not v['opened']: bad.append(f'{label}: nothing tried to open Claude (the test didn\'t reach the send)'); continue
            if v['handoff']: bad.append(f'{label}: the prompt was left waiting in storage')
            if v['job']: bad.append(f'{label}: a board job was left running')
            if not v['statusErr'] or not any(w in v['status'] for w in ("couldn't be opened", 'blocked from opening')):
                bad.append(f'{label}: the status line says {v["status"]!r}, not that Claude couldn\'t be opened')
            bad += [f'{label}: uncaught: {e[:120]}' for e in v['errs']]
    for name, action, boards in (('a new board', 'mode', None), ('an update of the last board', 'update', [BOARD])):
        try:
            open_ = send('watch', action, boards=boards, script=script)
            shut = send('watch', action, close=True, boards=boards, script=script)
        except RuntimeError as e: bad.append(f'{name}, the tab closed: could not run: {e}'); continue
        if not open_['job'] or not open_['handoff']: bad.append(f'{name}, the tab still open: the job or the waiting prompt went away ({open_})')
        if not shut['before']['job']: bad.append(f'{name}, the tab closed: no job had started (the test didn\'t reach the send)'); continue
        if shut['job']: bad.append(f'{name}, the tab closed: the job kept running')
        if shut['handoff']: bad.append(f'{name}, the tab closed: the prompt was left waiting in storage')
        if 'closed' not in shut['jobText']: bad.append(f'{name}, the tab closed: the job box says {shut["jobText"]!r}, not that the tab was closed')
        bad += [f'{name}, the tab closed: uncaught: {e[:120]}' for e in open_['errs'] + shut['errs']]
    return bad

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
    for title, fn in (('kaleidoscope hand-off', run), ('kaleidoscope hand-off, the Claude tab blocked or closed', run_send)):
        bad = fn(*sys.argv[1:2])
        print(f'== {title}: ' + ('clean' if not bad else f'{len(bad)} problem' + 's' * (len(bad) > 1)))
        for b in bad: print('  ' + b)
