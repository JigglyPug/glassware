"""Molten for Discord's Your data: export, import and erase, end to end in the test browser.

    python3 tools/tests/discorddata.py

Export CSV gives a row per day and place; Export data holds the lists and settings but never the names
Screenshot safe hides; an imported backup is read as untrusted (one good new favorite comes in, junk entries,
a wrong-kind setting and a hidden name don't, a file that isn't a backup is refused); Erase activity asks
first, Cancel keeps everything, OK erases. The demo data gets a server named like a spreadsheet formula
(the CSV must start it with an apostrophe) and a saved message by a name Screenshot safe hides (the
export must say "User"). Two pieces are also run on their own: a month later from Jan 31 stops at the
end of February, and a new reminder over the limit never pushes out one that's due sooner. And with a
video playing, reminders are still checked every 5 seconds, not at the video's frame rate. And the message
menu is a form: picking a folder or a reminder time saves nothing and leaves it open; Save does what was picked
(note, folder and reminder together; only a reminder; or nothing picked, which saves to Unsorted).
Prints "== molten-for-discord your data: clean" or the problems.
"""
import json, os, re, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); R = os.path.dirname(HERE)   # HERE is the tools folder

DRIVE = r"""(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  const files = [];
  HTMLAnchorElement.prototype.click = function () { if (this.download) files.push({ name: this.download, href: this.href }); };
  let next = null;   // the file the next Import picks
  const realClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () { if (this.type === 'file' && next) { const dt = new DataTransfer(); dt.items.add(next); this.files = dt.files; this.dispatchEvent(new Event('change')); } else realClick.call(this); };
  const btn = t => __all().find(e => e.tagName === 'BUTTON' && e.textContent.trim() === t);
  const text = sel => (__all().find(e => e.matches && e.matches(sel)) || {}).textContent || '';
  const grab = async () => { const f = files.pop(); return { name: f.name, text: await (await fetch(f.href)).text() }; };
  btn('Export CSV').click(); await w(300);
  const csv = await grab(); const lines = csv.text.split('\n');
  out.csv = { name: csv.name, header: lines[0], rows: lines.length - 1, sample: lines.slice(1, 3) };
  btn('Export data').click(); await w(300);
  const js = await grab(); const o = JSON.parse(js.text);
  out.json = { name: js.name, keys: Object.keys(o), hasShotName: 'shotName' in o.settings || 'shotExtra' in o.settings, found: 'found' in o, favs: o.favorites.length, saved: o.saved.items.length };
  // a doctored backup: one good new favorite, junk, out-of-range settings and a name that must not come in
  o.favorites.push({ gid: '111111111111111111', cid: '222222222222222222', name: 'imported-channel', server: 'Test server' }, { gid: 'nope', cid: 'x' }, 'junk');
  o.settings.mentionStrength = 'nuclear'; o.settings.blurMedia = 'yes'; o.settings.shotName = 'SHOULD-NOT-IMPORT'; o.settings.track = false; o.settings.notASetting = 1;
  o.reminders = 'not a list';
  next = new File([JSON.stringify(o)], 'b.json', { type: 'application/json' });
  btn('Import data').click(); await w(800);
  out.importMsg = text('.imp');
  btn('Export data').click(); await w(300);
  const o2 = JSON.parse((await grab()).text);
  out.after = { blurMedia: o2.settings.blurMedia, favs: o2.favorites.length, hasImported: o2.favorites.some(f => f.name === 'imported-channel'), strength: o2.settings.mentionStrength, track: o2.settings.track, shotName: o2.settings.shotName };
  next = new File(['{"hello":1}'], 'x.json'); btn('Import data').click(); await w(500); out.wrongFile = text('.imp');
  next = new File(['not json'], 'x.json'); btn('Import data').click(); await w(500); out.notJson = text('.imp');
  // erase asks first and waits for OK
  btn('Erase activity').click(); await w(300);
  out.ask = text('.ask');
  btn('Cancel').click(); await w(300); out.askGone = !text('.ask');
  btn('Export CSV').click(); await w(300); out.rowsAfterCancel = (await grab()).text.split('\n').length - 1;
  btn('Erase activity').click(); await w(300); btn('OK, erase').click(); await w(400);
  out.erasedMsg = text('.imp');
  btn('Export CSV').click(); await w(300); out.rowsAfterErase = (await grab()).text.split('\n').length - 1;
  return out;
})()
"""

SCRIPT = f'{R}/desktop/molten-for-discord/molten-for-discord.user.js'
seed = json.load(open(f'{HERE}/seeds/molten-for-discord.json'))
FORMULA = '=HYPERLINK("http://x.example","y")'
seed['actPlaces']['101010101010101010/111111111111111111']['s'] = FORMULA
hidden = seed['found'][0]
seed['saved']['items'].append({'gid': '101010101010101010', 'cid': '111111111111111111', 'mid': '999999999999999999', 'name': 'general', 'server': 'Lava Lounge',
                               'title': hidden + ' said the lava is up', 'author': hidden, 'folder': '', 'at': 1793000000000, 'note': 'ask ' + hidden})
SEED = os.path.join(tempfile.mkdtemp(), 'seed.json'); json.dump(seed, open(SEED, 'w'))
DRIVE = DRIVE.replace("return out;\n})()", "out.csvText = csvAll; out.jsonText = jsonAll; return out;\n})()")
DRIVE = DRIVE.replace("const csv = await grab();", "const csv = await grab(); var csvAll = csv.text;").replace("const js = await grab();", "const js = await grab(); var jsonAll = js.text;")
r = subprocess.run(['node', f'{HERE}/lib/shot.js', SCRIPT, 'https://discord.com/channels/@me', '/dev/null',
                    '--cmd', 'Open Molten for Discord', '--seed', SEED, '--eval', DRIVE, '--print'], capture_output=True, text=True)
v = next((json.loads(l[5:]) for l in r.stdout.splitlines() if l.startswith('EVAL ')), None)
if not isinstance(v, dict):
    print('molten-for-discord your data: the test page gave nothing back: ' + ((r.stderr.strip().splitlines() or ['no output'])[-1])); sys.exit(1)
bad = []
want = lambda ok, msg: ok or bad.append(msg)
c = v['csv']; want(c['header'] == 'date,type,server,channel,seconds,messages_sent', f'CSV header is {c["header"]!r}')
want(c['rows'] > 100, f'CSV has {c["rows"]} rows from the demo activity')
j = v['json']; want(not j['hasShotName'] and not j['found'], 'Export data holds names Screenshot safe hides')
want(j['favs'] == 5 and j['saved'] == 4, f'Export data has {j["favs"]} favorites and {j["saved"]} saved messages, not 5 and 4')
want("'=HYPERLINK" in v.get('csvText', '') and '\n=HYPERLINK' not in v.get('csvText', '') and ',=HYPERLINK' not in v.get('csvText', ''), 'a server named like a formula isn\'t started with an apostrophe in the CSV')
want(hidden not in v.get('jsonText', '') and 'User said the lava is up' in v.get('jsonText', ''), f'Export data still holds "{hidden}", a name Screenshot safe hides')
want(v['importMsg'].startswith('Imported settings, lava looks, 1 favorite,'), f'import said {v["importMsg"]!r}')
a = v['after']; want(a['favs'] == 6 and a['hasImported'], 'the good favorite in the backup didn\'t come in, or junk did')
want(a['strength'] == 'medium' and a['blurMedia'] is False, 'a wrong-kind setting in the backup changed a setting')
want(a['track'] is False, 'a good setting in the backup didn\'t come in')
want('shotName' not in a or a.get('shotName') in (None, 'User'), 'a hidden name came in from the backup')
for k in ('wrongFile', 'notJson'): want(v[k] == "That file isn't a Molten for Discord backup.", f'{k}: {v[k]!r}')
want(v['ask'].startswith('Erase all your activity?') and v['askGone'], 'Erase activity didn\'t ask first, or Cancel didn\'t close the question')
want(v['rowsAfterCancel'] >= c['rows'], 'Cancel erased activity')
want(v['rowsAfterErase'] == 0 and v['erasedMsg'] == 'Your activity was erased.', 'OK didn\'t erase the activity')
# the date dial and the reminder limit, run on their own (their code taken from the script)
src = open(SCRIPT, encoding='utf-8').read()
grab = lambda start, end: src[src.index(start):src.index(end, src.index(start))]
UNITS = grab('    const UNITS = {', '    };') + '    };'
DUE = grab('    function dueFor(', '\n    }') + '\n    }'
REMIND = grab('    function remind(', '\n    }\n') + '\n    }'
PRESETS = grab('    const at9 = ', '    ];') + '    ];'
node = UNITS + DUE + """
const RealDate = Date; let fake = new RealDate(2027, 0, 31, 12).getTime();
Date = class extends RealDate { constructor(...a) { a.length ? super(...a) : super(fake); } static now() { return fake; } };
const m = new RealDate(dueFor('month', 1, 9 * 60));
""" + PRESETS + """
// Tonight and Tomorrow at different times of day: [hours, minutes] they land on, how many days ahead, or 0 when left out
const at = (h, mi) => { fake = new RealDate(2027, 0, 13, h, mi).getTime(); const o = {}; for (const [k, f] of PRESETS_T) { const t = f(); o[k] = t ? [new RealDate(t).getDate() - 13, new RealDate(t).getHours()] : 0; } return o; };
const times = { afternoon: at(15, 0), evening: at(19, 45), late: at(23, 26), night: at(1, 0) };
fake = new RealDate(2027, 0, 31, 12).getTime();
const D = { reminders: [] }, REMIND_CAP = 100, REMIND_MAX = 366 * 864e5; let ids = 0;
const store = { reminders() {} }, refreshAll = () => {}, cleanSaved = x => Object.assign({}, x), newId = p => p + (ids++);
""" + REMIND + """
for (let i = 0; i < 100; i++) remind({ mid: 'm' + i }, fake + (i + 10) * 864e5);     // 100 reminders, 10 to 109 days away
remind({ mid: 'soon' }, fake + 2 * 864e5);                                            // the 101st, due in 2 days
const kept = D.reminders.map(r => r.mid);
D.reminders[0].done = true; remind({ mid: 'far' }, fake + 300 * 864e5);              // over the limit with one finished: the finished one goes
console.log(JSON.stringify({ times, month: [m.getMonth(), m.getDate()], count: kept.length, soon: kept.includes('soon'), lastDropped: !kept.includes('m99'),
  far: D.reminders.some(r => r.mid === 'far'), doneGone: !D.reminders.some(r => r.done) }));"""
u = subprocess.run(['node', '-e', node], capture_output=True, text=True)
try: t = json.loads(u.stdout.strip().splitlines()[-1])
except Exception: t = None; bad.append('the date and reminder pieces didn\'t run: ' + ((u.stderr.strip().splitlines() or ['no output'])[-1]))
if t:
    tm = t['times']
    want(tm['afternoon']['Tonight'] == [0, 20] and tm['evening']['Tonight'] == [0, 22] and tm['late']['Tonight'] == 0, f'Tonight lands on {tm} (8 PM, then 10 PM once 8 is close, then left out)')
    want(tm['afternoon']['Tomorrow'] == [1, 9] and tm['night']['Tomorrow'] == [0, 9], f'Tomorrow lands on {tm} (just after midnight it should be the morning coming up)')
    want(t['month'] == [1, 28], f'a month after Jan 31 lands on month {t["month"][0] + 1}, day {t["month"][1]}, not Feb 28')
    want(t['count'] == 100 and t['soon'] and t['lastDropped'], 'a reminder over the limit pushed out one due sooner (or the limit isn\'t 100)')
    want(t['far'] and t['doneGone'], 'over the limit, a finished reminder wasn\'t the one let go')
# while a video plays, only its drawing speeds up: reminders are still checked every 5 seconds, not 15 times a second
LOOP = r"""(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  let n = 0; const real = window.GM_getValue;
  window.GM_getValue = (k, d) => { if (k === 'reminders') n++; return real(k, d); };
  // a playing video big enough to count as what you're watching
  const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d');
  setInterval(() => { g.fillStyle = 'hsl(' + (Date.now() / 10 % 360) + ',80%,50%)'; g.fillRect(0, 0, 320, 180); }, 30);
  const v = document.createElement('video'); v.muted = true; v.autoplay = true; v.srcObject = c.captureStream(30);
  v.style.cssText = 'position:fixed;left:100px;top:100px;width:800px;height:450px;z-index:5';
  (document.querySelector('main') || document.body).append(v); await v.play().catch(() => {});
  await w(3000); n = 0; await w(5000);
  return { remindersReadsIn5s: n, playing: !v.paused, videoOn: document.documentElement.hasAttribute('data-mfd-video') || [...document.documentElement.attributes].map(a => a.name).filter(x => /video/.test(x)) };
})()
"""
r = subprocess.run(['node', f'{HERE}/lib/shot.js', SCRIPT, 'https://discord.com/channels/101010101010101010/111111111111111111', '/dev/null',
                    '--seed', f'{HERE}/seeds/molten-for-discord.json', '--eval', LOOP, '--print'], capture_output=True, text=True)
lv = next((json.loads(l[5:]) for l in r.stdout.splitlines() if l.startswith('EVAL ')), None)
if not isinstance(lv, dict) or not lv.get('playing'): bad.append('the video loop check didn\'t run (no playing video)')
else: want(lv['remindersReadsIn5s'] <= 2, f'with a video playing, reminders were checked {lv["remindersReadsIn5s"]} times in 5 seconds (upkeep is following the frame rate)')
# the message menu: picks change nothing until Save, then Save does what was picked
MENU = r"""(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  const get = k => { const v = window.GM_getValue(k, null); return typeof v === 'string' ? JSON.parse(v) : v; };
  const savedOf = mid => ((get('saved') || {}).items || []).find(x => x.mid === mid) || null;
  const remsOf = mid => (get('reminders') || []).filter(x => x.mid === mid);
  const menu = () => __all().find(e => e.getAttribute && e.getAttribute('role') === 'dialog' && e.getAttribute('aria-label') === 'Save or remind me' && document.contains(e.getRootNode().host || e));
  const inMenu = t => __all(menu()).find(e => e.tagName === 'BUTTON' && e.textContent.trim() === t);
  const open = async mid => {
    const li = document.createElement('li'); li.id = 'chat-messages-111111111111111111-' + mid;
    li.innerHTML = '<div><h3><span>Lava</span> <time>Today at 9:00</time></h3><div id="message-content-' + mid + '">the lava is up ' + mid + '</div></div>';
    li.style.cssText = 'position:fixed;left:400px;top:300px;width:600px;height:60px;z-index:4;background:#333;color:#fff;list-style:none';
    document.body.append(li); await w(100);
    li.querySelector('[id^=message-content]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 500, clientY: 330 })); await w(300);
    const b = __all().find(e => e.tagName === 'BUTTON' && e.getAttribute('aria-label') === 'Save or remind me' && !e.hidden);
    if (!b) return false; b.click(); await w(500); return !!menu();
  };
  // 1: a note, a folder and a reminder, then Save
  out.opened = await open('888888888888888888');
  if (!out.opened) return out;
  const note = __all(menu()).find(e => e.tagName === 'INPUT' && e.getAttribute('aria-label') === 'Note');
  note.value = 'Test'; note.dispatchEvent(new Event('input', { bubbles: true })); note.dispatchEvent(new Event('change', { bubbles: true }));
  inMenu('Recipes').click(); await w(300);
  out.afterFolder = { open: !!menu(), saved: !!savedOf('888888888888888888'), pressed: inMenu('Recipes') && inMenu('Recipes').getAttribute('aria-pressed') };
  inMenu('Next week').click(); await w(300);
  const dialSays = () => ({ mid: ((__all(menu()).find(e => e.classList && e.classList.contains('dial-mid')) || {}).textContent || '').trim(),
    unit: ((__all(menu()).find(e => e.getAttribute && e.getAttribute('role') === 'radio' && e.getAttribute('aria-checked') === 'true') || {}).textContent || '') });
  out.dialWeek = dialSays();
  inMenu('1 hour').click(); await w(300);
  out.dialHour = dialSays();
  out.afterRemind = { open: !!menu(), saved: !!savedOf('888888888888888888'), rems: remsOf('888888888888888888').length, pressed: inMenu('1 hour').getAttribute('aria-pressed') };
  out.sum = (__all(menu()).find(e => e.classList && e.classList.contains('sum')) || {}).textContent || '';
  out.hasRemindBtn = !!inMenu('Remind me');
  const t0 = Date.now(); inMenu('Save').click(); await w(600);
  const s1 = savedOf('888888888888888888'), r1 = remsOf('888888888888888888');
  out.one = { closed: !menu(), folder: s1 && s1.folder, note: s1 && s1.note, rems: r1.length, remNote: r1[0] && r1[0].note, inMin: r1[0] && Math.round((r1[0].due - t0) / 60e3) };
  // 2: only a reminder: not saved
  await open('777777777777777777'); inMenu('1 hour').click(); await w(200); inMenu('Save').click(); await w(500);
  out.two = { saved: !!savedOf('777777777777777777'), rems: remsOf('777777777777777777').length };
  // 3: nothing picked: saved to Unsorted, no reminder
  await open('666666666666666666'); inMenu('Save').click(); await w(500);
  const s3 = savedOf('666666666666666666'); out.three = { folder: s3 && s3.folder, rems: remsOf('666666666666666666').length };
  // 4: a reminder picked, then "No reminder": back to just saving
  await open('555555555555555555'); inMenu('1 hour').click(); await w(200); inMenu('No reminder').click(); await w(200); inMenu('Save').click(); await w(500);
  out.four = { saved: !!savedOf('555555555555555555'), rems: remsOf('555555555555555555').length };
  return out;
})()
"""
r = subprocess.run(['node', f'{HERE}/lib/shot.js', SCRIPT, 'https://discord.com/channels/101010101010101010/111111111111111111', '/dev/null',
                    '--seed', f'{HERE}/seeds/molten-for-discord.json', '--eval', MENU, '--print'], capture_output=True, text=True)
mv = next((json.loads(l[5:]) for l in r.stdout.splitlines() if l.startswith('EVAL ')), None)
if not isinstance(mv, dict) or not mv.get('opened'): bad.append('the message menu didn\'t open in the test page: ' + (json.dumps(mv) if mv else ((r.stderr.strip().splitlines() or ['no output'])[-1])))
else:
    want(mv['afterFolder'] == {'open': True, 'saved': False, 'pressed': 'true'}, f'picking a folder saved or closed the menu: {mv["afterFolder"]}')
    want(mv['afterRemind'] == {'open': True, 'saved': False, 'rems': 0, 'pressed': 'true'}, f'picking a reminder time set it or closed the menu: {mv["afterRemind"]}')
    want(mv['dialWeek']['mid'].startswith('1 week') and mv['dialWeek']['unit'] == 'Weeks', f'Next week didn\'t turn the dial to 1 week: {mv["dialWeek"]}')
    want(mv['dialHour']['mid'].startswith('1 hour') and mv['dialHour']['unit'] == 'Hours', f'1 hour didn\'t turn the dial to 1 hour: {mv["dialHour"]}')
    want(not mv['hasRemindBtn'], 'the menu still has a "Remind me" button (it should be "Save")')
    want(mv['sum'].startswith('Saves to Recipes') and 'reminds you' in mv['sum'], f'the line above Save says {mv["sum"]!r}')
    o = mv['one']; want(o['closed'] and o['folder'] == 'frecipes' and o['note'] == 'Test' and o['rems'] == 1 and o['remNote'] == 'Test' and o['inMin'] in (59, 60, 61), f'Save didn\'t do all three: {o}')
    want(mv['two'] == {'saved': False, 'rems': 1}, f'Save with only a reminder picked: {mv["two"]}')
    want(mv['three'] == {'folder': '', 'rems': 0}, f'Save with nothing picked: {mv["three"]}')
    want(mv['four'] == {'saved': True, 'rems': 0}, f'"No reminder" after a time: {mv["four"]}')
for b in bad: print('molten-for-discord your data: ' + b)
if not bad: print('== molten-for-discord your data: clean')
sys.exit(1 if bad else 0)
