"""Check that Kaleidoscope's prompt only goes to the claude.ai tab it opened.

    python3 tools/tests/handofftest.py

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

And that damaged or out-of-date values in Kaleidoscope's storage never break a page (an uncaught error,
or "undefined"/"NaN"/"[object" on screen):
- a waiting prompt of the wrong shape (not an object, text not text, no time or a time that isn't a
  number, a bad tab id, a board job without its id, an update without its page) is cleared on claude.ai
  and the tab says so; before, one with no time never expired
- a saved board list with junk in it: the panel and the board page use the good board and skip the rest
  (a chat link that isn't on claude.ai is dropped); a list that isn't a list counts as no board
- a running job or past board times that are junk: they're dropped and a new board still starts
- a result from the Claude tab with fields of the wrong kind: the job ends with a plain message, and a
  chat link that isn't on claude.ai gets no button
Prints "clean" or the problems.
"""
import json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); R = os.path.dirname(HERE)   # HERE is the tools folder
sys.path[:0] = [HERE] + [os.path.join(HERE, d) for d in ('lib', 'build', 'tests')]
from screens import CLOCK
from datetime import datetime

NOW = int(datetime.fromisoformat(CLOCK).timestamp() * 1000)
JS = f'{R}/desktop/kaleidoscope/kaleidoscope.user.js'
READ = "(async () => { await new Promise(r => setTimeout(r, 800)); return { left: 'kaleidoscope.handoff' in window.__gm, url: location.href }; })()"

def taken(url, handoff, script=JS):
    seed = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump({'kaleidoscope.handoff': handoff}, seed); seed.close()
    r = subprocess.run(['node', f'{HERE}/lib/shot.js', script, url, '/dev/null', '--clock', CLOCK, '--seed', seed.name, '--eval', READ, '--print'],
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
    r = subprocess.run(['node', f'{HERE}/lib/shot.js', script, ANILIST, '/dev/null', '--cmd', 'Open Kaleidoscope', '--clock', CLOCK,
                        '--seed', seed.name, '--opentab', opentab, '--eval', js, '--print'], capture_output=True, text=True, timeout=120)
    os.unlink(seed.name)
    line = next((l for l in r.stdout.splitlines() if l.startswith('EVAL ')), None)
    if not line: raise RuntimeError((r.stderr or r.stdout)[-300:])
    return json.loads(line[5:])

def run_send(script=JS):
    bad = []
    blocked = [('a new board', 'mode', {}, None), ('an update of the last board', 'update', {}, [BOARD]),
               ('Paste + send', 'mode', {'claudeMode': 'send'}, None), ('Paste only', 'mode', {'claudeMode': 'paste'}, None)]
    from par import ptry
    got = ptry([lambda how=how, a=a, s=s, b=b: send(how, a, settings=s, boards=b, script=script) for how in ('fail', 'throw') for _, a, s, b in blocked]
               + [lambda a=a, b=b, c=c: send('watch', a, close=c, boards=b, script=script) for a, b in (('mode', None), ('update', [BOARD])) for c in (False, True)])
    for how in ('fail', 'throw'):
        for name, action, settings, boards in blocked:
            label = f'{name}, the tab blocked ({"nothing back" if how == "fail" else "it throws"})'
            v = got.pop(0)
            if isinstance(v, RuntimeError): bad.append(f'{label}: could not run: {v}'); continue
            if not v['opened']: bad.append(f'{label}: nothing tried to open Claude (the test didn\'t reach the send)'); continue
            if v['handoff']: bad.append(f'{label}: the prompt was left waiting in storage')
            if v['job']: bad.append(f'{label}: a board job was left running')
            if not v['statusErr'] or not any(w in v['status'] for w in ("couldn't be opened", 'blocked from opening')):
                bad.append(f'{label}: the status line says {v["status"]!r}, not that Claude couldn\'t be opened')
            bad += [f'{label}: uncaught: {e[:120]}' for e in v['errs']]
    for name, action, boards in (('a new board', 'mode', None), ('an update of the last board', 'update', [BOARD])):
        open_, shut = got.pop(0), got.pop(0)
        e = next((x for x in (open_, shut) if isinstance(x, RuntimeError)), None)
        if e: bad.append(f'{name}, the tab closed: could not run: {e}'); continue
        if not open_['job'] or not open_['handoff']: bad.append(f'{name}, the tab still open: the job or the waiting prompt went away ({open_})')
        if not shut['before']['job']: bad.append(f'{name}, the tab closed: no job had started (the test didn\'t reach the send)'); continue
        if shut['job']: bad.append(f'{name}, the tab closed: the job kept running')
        if shut['handoff']: bad.append(f'{name}, the tab closed: the prompt was left waiting in storage')
        if 'closed' not in shut['jobText']: bad.append(f'{name}, the tab closed: the job box says {shut["jobText"]!r}, not that the tab was closed')
        bad += [f'{name}, the tab closed: uncaught: {e[:120]}' for e in open_['errs'] + shut['errs']]
    return bad

GOOD = dict(BOARD, id='b2', snap={'at': NOW - 3600 * 1000, 'e': {'1': ['C', 8, 12, 'Old pick']}})
JUNK_BOARDS = [None, 7, 'x', {'id': 'nohtml'}, {'id': '../../x', 'html': '<p>bad id</p>'},
               dict(GOOD, id='b0', ts='yesterday', label=42, snap={'e': 'gone'}, conv='javascript:alert(1)', type=['MANGA']), GOOD]
BAD = '(undefined|NaN|\\[object)'
PANEL = """(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await sleep(2500);
  const host = document.querySelector('kaleidoscope-root'), root = host && host.shadowRoot, p = root && root.querySelector('#kaleidoscope-panel');
  const text = root ? root.textContent : '';
  let job = '';
  if (ACTION === 'mode' && p) { p.querySelector('.kld-mode').click(); await sleep(1800); job = (root.querySelector('#kaleidoscope-job') || {}).textContent || ''; }
  if (ACTION === 'result' && p) {
    p.querySelector('.kld-mode').click(); await sleep(1800);
    GM_setValue('kaleidoscope.result', Object.assign({ job: window.__gm['kaleidoscope.job'].id }, RESULT)); await sleep(600);
    const box = root.querySelector('#kaleidoscope-job');
    job = box ? box.textContent : ''; window.__buttons = box ? [...box.querySelectorAll('button')].map(b => b.textContent) : [];
  }
  return { panel: !!p, text, job, buttons: window.__buttons || [], jobKey: 'kaleidoscope.job' in window.__gm,
           follow: !!p && [...p.querySelectorAll('button')].some(b => b.textContent.trim() === 'Follow-up'), errs: window.__errs };
})()"""
CLAUDE = "(async () => { for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 250)); if (i >= 5 && (!('kaleidoscope.handoff' in window.__gm)) && (i >= 20 || /couldn't read/.test(document.body.innerText))) break; } return { left: 'kaleidoscope.handoff' in window.__gm, text: document.body.innerText, errs: window.__errs }; })()"
PAGE = "(async () => { await new Promise(r => setTimeout(r, 2500)); return { frame: !!document.querySelector('iframe'), text: document.body ? document.body.innerText : '', errs: window.__errs }; })()"

def shot(url, gm, js, extra=(), script=JS):
    seed = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump(gm, seed); seed.close()
    r = subprocess.run(['node', f'{HERE}/lib/shot.js', script, url, '/dev/null', '--clock', CLOCK, '--seed', seed.name, '--eval', js, '--print', *extra],
                       capture_output=True, text=True, timeout=120)
    os.unlink(seed.name)
    line = next((l for l in r.stdout.splitlines() if l.startswith('EVAL ')), None)
    if not line: raise RuntimeError((r.stderr or r.stdout)[-300:])
    return json.loads(line[5:])

def run_malformed(script=JS):
    import re
    bad = []
    def look(name, v, *texts):
        for e in v.get('errs', []): bad.append(f'{name}: uncaught: {e[:120]}')
        for t in texts:
            m = re.search(BAD, t or '')
            if m: bad.append(f'{name}: shows {m.group(0)!r}: ...{t[max(0, m.start() - 50):m.end() + 30]!r}')
    tabbed = 'https://claude.ai/new#kaleidoscope-tab=abc123'
    h = lambda **k: dict({'text': 'a prompt', 'ts': NOW, 'tab': 'abc123', 'autoSend': True, 'label': 'Test'}, **k)
    broken = [('not an object', 'garbage'), ('a list', [h()]), ('text that isn\'t text', h(text={'a': 1})),
              ('no time', {k: v for k, v in h().items() if k != 'ts'}), ('a time that isn\'t a number', h(ts=str(NOW))),
              ('a tab id that isn\'t one', h(tab={'id': 'abc123'})), ('a board job without its id', h(capture=True)),
              ('an update without its page', h(capture=True, job='j1', update=True, convId=''))]
    open_ = ['--cmd', 'Open Kaleidoscope', '--opentab', 'watch']
    panel = lambda gm, action='none', result=None: shot(ANILIST, dict({'kaleidoscope.settings': {'claudeMode': 'board'}}, **gm),
        PANEL.replace('ACTION', json.dumps(action)).replace('RESULT', json.dumps(result or {})), open_, script)
    cases = [
        ('saved boards with junk in them', {'kaleidoscope.boards': JUNK_BOARDS}, 'none', None),
        ('saved boards, a bad one last', {'kaleidoscope.boards': JUNK_BOARDS[:-1]}, 'none', None),
        ('saved boards that aren\'t a list', {'kaleidoscope.boards': {'b1': BOARD}}, 'mode', None),
        ('a running job that\'s junk', {'kaleidoscope.job': 'building'}, 'none', None),
        ('a running job with a bad start', {'kaleidoscope.job': {'id': 'j1', 'start': 'now', 'label': 3}}, 'none', None),
        ('past board times that aren\'t an object', {'kaleidoscope.times': [5, 6]}, 'mode', None),
        ('past board times with junk in them', {'kaleidoscope.times': {'recent': [1, 'x', None, -4], 'airing': 'slow'}}, 'mode', None),
        ('a result with fields of the wrong kind', {}, 'result', {'ok': 'yes', 'error': {'msg': 1}, 'conv': 'javascript:alert(1)', 'ms': 'fast'}),
        ('a good result with a bad time', {}, 'result', {'ok': True, 'ms': 'fast', 'conv': 'https://claude.ai/chat/0b7f3c2e-1d4a-4c55-9e1f-6a2b8c9d0e11'}),
    ]
    pages = (('board page, junk around the board', JUNK_BOARDS, True), ('board page, boards that aren\'t a list', 'junk', False))
    from par import ptry
    res = ptry([lambda v=v: shot(tabbed, {'kaleidoscope.handoff': v}, CLAUDE, script=script) for _, v in broken]
               + [lambda: shot(tabbed, {'kaleidoscope.handoff': {k: v for k, v in h().items() if k != 'label'}}, CLAUDE, script=script)]
               + [lambda gm=gm, a=a, r=r: panel(gm, a, r) for _, gm, a, r in cases]
               + [lambda b=b: shot('https://anilist.co/home#kaleidoscope-board=b2', {'kaleidoscope.boards': b}, PAGE, ['--commit'], script) for _, b, _w in pages])
    for name, v in broken:
        label = f'waiting prompt, {name}'
        got = res.pop(0)
        if isinstance(got, RuntimeError): bad.append(f'{label}: could not run: {got}'); continue
        if got['left']: bad.append(f'{label}: it was left in storage')
        if "couldn't read" not in got['text']: bad.append(f'{label}: the tab doesn\'t say the prompt couldn\'t be read')
        look(label, got, got['text'])
    got = res.pop(0)
    if isinstance(got, RuntimeError): bad.append(f'waiting prompt without a label: could not run: {got}')
    else:
        if got['left']: bad.append('waiting prompt without a label: it wasn\'t taken')
        look('waiting prompt without a label', got, got['text'])

    for name, gm, action, result in cases:
        v = res.pop(0)
        if isinstance(v, RuntimeError): bad.append(f'{name}: could not run: {v}'); continue
        if not v['panel']: bad.append(f'{name}: the panel didn\'t open'); continue
        look(name, v, v['text'], v['job'])
        if name.startswith('saved boards with junk') or name.startswith('saved boards, a bad'):
            if 'Last board' not in v['text']: bad.append(f'{name}: the good board isn\'t shown')
        if name == 'saved boards, a bad one last' and v['follow']: bad.append(f'{name}: a chat link that isn\'t on claude.ai got a Follow-up button')
        if name.startswith('a running job') and (v['jobKey'] or 'Building' in v['text']): bad.append(f'{name}: the junk job was kept')
        if action == 'mode' and 'Building your board' not in v['job']: bad.append(f'{name}: no board was started (job box: {v["job"]!r})')
        if name.startswith('a result with fields'):
            if "didn't come back" not in v['job']: bad.append(f'{name}: the job box says {v["job"]!r}')
            if [b for b in v['buttons'] if b.strip() != '×']: bad.append(f'{name}: a chat link that isn\'t on claude.ai got a button ({v["buttons"]})')
    for name, boards, want in pages:
        v = res.pop(0)
        if isinstance(v, RuntimeError): bad.append(f'{name}: could not run: {v}'); continue
        look(name, v, v['text'])
        if v['frame'] != want: bad.append(f'{name}: the board was {"not " if want else ""}shown')
        if not want and "isn't saved" not in v['text']: bad.append(f'{name}: the page doesn\'t say the board isn\'t saved')
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
    from par import ptry
    res = ptry([lambda u=u, hh=hh: taken(u, hh, script) for _, u, hh, _w in cases])
    for name, url, handoff, want in cases:
        r = res.pop(0)
        if isinstance(r, RuntimeError): bad.append(f'{name}: could not run: {r}'); continue
        got, after = r
        if got != want: bad.append(f'{name}: the prompt was {"taken" if got else "left waiting"}, it should be {"taken" if want else "left alone"}')
        if want and 'kaleidoscope-tab' in after: bad.append(f'{name}: the one-time id stayed in the address ({after})')
    return bad

if __name__ == '__main__':
    for title, fn in (('kaleidoscope hand-off', run), ('kaleidoscope hand-off, the Claude tab blocked or closed', run_send),
                      ('kaleidoscope hand-off, damaged storage', run_malformed)):
        bad = fn(*sys.argv[1:2])
        print(f'== {title}: ' + ('clean' if not bad else f'{len(bad)} problem' + 's' * (len(bad) > 1)))
        for b in bad: print('  ' + b)
