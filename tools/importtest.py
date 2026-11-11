"""Check that Hourglass's "Import settings" copes with any file you give it.

    python3 tools/importtest.py [script]     # Hourglass, or the copy given (to compare an older one)

An imported file is untrusted: it may be from another app, damaged, hand-edited, or huge. Each case
opens Hourglass (stand-in YouTube page, the screenshot seed), goes to Settings, presses Import settings
and hands it a file:
- not JSON, JSON from something else, JSON that isn't an object: nothing changes and the panel says
  it isn't an Hourglass settings file
- settings of the wrong kind or out of range (1000 passes, a 0-second wait, a week that starts on
  Friday, unknown keys): each is kept inside what its control allows, or left at its default
- a schedule that isn't 7 days, or with broken blocks; site and ignored lists with junk entries: the
  broken part is skipped (and the panel says which), the junk entries dropped, the rest imported
- a file over 1 MB (here 3 MB): it isn't read at all, nothing changes, and the panel says it's too big
- an export of the seed's own settings: imports back unchanged
Every case also fails on an uncaught error or "undefined"/"NaN"/"[object" in the panel afterwards.
Prints "clean" for each case, or what went wrong.
"""
import json, os, re, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from screens import CLOCK
JS = f'{R}/desktop/hourglass/hourglass.user.js'
SEED = json.load(open(f'{HERE}/seeds/hourglass.json'))
SEED['settings'] = dict(SEED['settings'], armed=False)      # not in a lockdown, so Import is allowed
KEYS = ('settings', 'schedule', 'sites', 'ignored')

# CONTENT is a JSON string (the file's text) or {"size": n} for a file of n bytes; the page records
# whether the script read the file's contents at all.
DRIVE = """(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const C = CASE;
  let read = false;
  const _t = Blob.prototype.text; Blob.prototype.text = function () { read = true; return _t.call(this); };
  const _c = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type !== 'file') return _c.call(this);
    const body = typeof C === 'string' ? C : (C.text === 'export' ? JSON.stringify({ hourglass: '1', settings: window.__gm.settings,
      schedule: window.__gm.schedule, sites: window.__gm.sites, ignored: window.__gm.ignored || [] }) : new Uint8Array(C.size).fill(32));
    const dt = new DataTransfer(); dt.items.add(new File([body], 'hourglass-settings.json', { type: 'application/json' }));
    this.files = dt.files; this.dispatchEvent(new Event('change'));
  };
  const root = () => document.querySelector('hourglass-ui').shadowRoot;
  const btn = t => [...root().querySelectorAll('button')].find(b => b.textContent.trim() === t);
  await sleep(500); btn('Settings').click(); await sleep(400);
  const snap = () => JSON.parse(JSON.stringify(Object.fromEntries(['settings', 'schedule', 'sites', 'ignored'].map(k => [k, k in window.__gm ? window.__gm[k] : null]))));
  const before = snap();
  btn('Import settings').click(); await sleep(1200);
  const st = root().querySelector('[role="status"]');
  return { before, after: snap(),
           msg: st ? st.textContent : '', text: root().textContent, read, errs: window.__errs };
})()"""

def drive(content, script=JS):
    seed = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False); json.dump(SEED, seed); seed.close()
    r = subprocess.run(['node', f'{HERE}/shot.js', script, 'https://www.youtube.com/', '/dev/null', '--clock', CLOCK, '--seed', seed.name,
                        '--eval', DRIVE.replace('CASE', json.dumps(content)), '--print'], capture_output=True, text=True, timeout=120)
    os.unlink(seed.name)
    line = next((l for l in r.stdout.splitlines() if l.startswith('EVAL ')), None)
    if not line: raise RuntimeError((r.stderr or r.stdout)[-300:])
    return json.loads(line[5:])

def unchanged(v):
    return [f'{k} changed' for k in KEYS if v['before'].get(k) != v['after'].get(k)]

def cases():
    S = SEED['settings']
    def not_ours(v):
        return unchanged(v) + ([] if "isn't an Hourglass settings file" in v['msg'] else [f'the panel says {v["msg"]!r}, not that it isn\'t an Hourglass settings file'])
    yield 'not JSON', 'hello, this is a text file', not_ours
    yield 'JSON from something else', json.dumps({'theme': 'dark', 'version': 3}), not_ours
    yield 'JSON that is a list', json.dumps([1, 2, 3]), not_ours
    yield 'JSON that is null', 'null', not_ours

    bad = {'passes': 1000, 'passLen': 0, 'passWait': 0, 'idle': 'soon', 'gateDelay': -5, 'hist': 7, 'weekStart': 'fri', 'enabled': 'yes',
           'goal': 1e9, 'bedS': 20, 'nudgeScope': {'x': 1}, 'nudgeAfter': float('nan') if False else 61.6, 'armed': False, 'evil': '<img src=x>'}
    def settings_kept_in_range(v):
        got, p = v['after']['settings'] or {}, []
        want = {'passes': 10, 'passLen': 1, 'passWait': 10, 'idle': 3, 'gateDelay': 3, 'hist': 90, 'weekStart': 'mon', 'enabled': True,
                'goal': 480, 'bedS': 46, 'nudgeScope': 'list', 'nudgeAfter': 60}
        for k, w in want.items():
            if got.get(k) != w: p.append(f'settings.{k} is {got.get(k)!r}, should be {w!r}')
        if 'evil' in got: p.append('an unknown setting was kept')
        if v['msg'] != 'Imported.': p.append(f'the panel says {v["msg"]!r}')
        return p
    yield 'settings of the wrong kind or out of range', json.dumps({'settings': bad}), settings_kept_in_range

    sched = [{'on': True, 'blocks': [{'s': 18, 'e': 34}, {'s': 40, 'e': 30}, {'s': -2, 'e': 4}, {'s': 1.5, 'e': 3}, 'x', {'s': 44, 'e': 60}]}] + \
            [{'on': 'yes', 'blocks': 'all day'}] + [{'on': False, 'blocks': []}] * 5
    sites = [None, 5, 'youtube.com', {'d': 'javascript:alert(1)'}, {'d': 'Example.COM', 'cat': 'weird', 'rule': 'x'}, {'d': 'example.com'},
             {'d': 'reddit.com', 'cat': 'social', 'rule': 'always', 'on': False}]
    ign = [{'d': 'news.example.org', 'avg': 'lots'}, {'d': ''}, 7]
    def lists_cleaned(v):
        a, p = v['after'], []
        if a['schedule'] != [{'on': True, 'blocks': [{'s': 18, 'e': 34}]}, {'on': False, 'blocks': []}] + [{'on': False, 'blocks': []}] * 5:
            p.append(f'schedule is {a["schedule"]}')
        if a['sites'] != [{'d': 'example.com', 'cat': 'custom', 'rule': 'sched', 'on': True}, {'d': 'reddit.com', 'cat': 'social', 'rule': 'always', 'on': False}]:
            p.append(f'sites are {a["sites"]}')
        if a['ignored'] != [{'d': 'news.example.org', 'avg': 0}]: p.append(f'ignored is {a["ignored"]}')
        if a['settings'] != v['before']['settings']: p.append('settings changed, though the file had none')
        return p
    yield 'a schedule with broken blocks, sites and ignored with junk', json.dumps({'schedule': sched, 'sites': sites, 'ignored': ign}), lists_cleaned

    def part_skipped(v):
        a, p = v['after'], []
        if a['schedule'] != v['before']['schedule']: p.append('the 3-day schedule replaced yours')
        if a['sites'] != v['before']['sites']: p.append('sites that aren\'t a list replaced yours')
        if a['settings'].get('passes') != 2: p.append(f'the good part wasn\'t imported (passes {a["settings"].get("passes")!r})')
        if not all(w in v['msg'] for w in ('Imported', 'schedule', 'sites')): p.append(f'the panel says {v["msg"]!r}, not which parts were skipped')
        return p
    yield 'a schedule that isn\'t 7 days, sites that aren\'t a list', json.dumps({'settings': dict(S, passes=2), 'schedule': sched[:3], 'sites': {'d': 'x.com'}}), part_skipped

    def too_big(v):
        p = unchanged(v)
        if v['read']: p.append('the file was read')
        if 'too big' not in v['msg']: p.append(f'the panel says {v["msg"]!r}, not that the file is too big')
        return p
    yield 'a 3 MB file', {'size': 3 * 1024 * 1024}, too_big

    def round_trip(v):
        p = [f'{k} came back different' for k in ('schedule', 'sites') if v['after'][k] != v['before'][k]]
        b, a = v['before']['settings'], v['after']['settings']
        p += [f'settings.{k} came back as {a.get(k)!r}, was {b.get(k)!r}' for k in b if k != 'armAt' and a.get(k) != b.get(k)]
        if v['msg'] != 'Imported.': p.append(f'the panel says {v["msg"]!r}')
        return p
    yield 'an export of its own settings', {'text': 'export'}, round_trip

def run(script=JS):
    out = []
    for name, content, check in cases():
        try: v = drive(content, script)
        except RuntimeError as e: out.append((name, [f'could not run: {e}'])); continue
        p = check(v) + [f'uncaught: {e[:120]}' for e in v['errs']]
        m = re.search(r'undefined|NaN|\[object', v['text'])
        if m: p.append(f'the panel shows {m.group(0)!r}')
        out.append((name, p))
    return out

if __name__ == '__main__':
    bad = False
    for name, p in run(*sys.argv[1:2]):
        bad |= bool(p)
        print(f'== hourglass import, {name}: ' + ('clean' if not p else '; '.join(p)))
    sys.exit(1 if bad else 0)
