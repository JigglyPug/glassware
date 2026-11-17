"""Molten for Discord's Your data: export, import and erase, end to end in the test browser.

    python3 tools/tests/discorddata.py

Export CSV gives a row per day and place; Export data holds the lists and settings but never the names
Screenshot safe hides; an imported backup is read as untrusted (one good new favorite comes in, junk entries,
a wrong-kind setting and a hidden name don't, a file that isn't a backup is refused); Erase activity asks
first, Cancel keeps everything, OK erases. Prints "== molten-for-discord your data: clean" or the problems.
"""
import json, os, subprocess, sys
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

r = subprocess.run(['node', f'{HERE}/lib/shot.js', f'{R}/desktop/molten-for-discord/molten-for-discord.user.js', 'https://discord.com/channels/@me', '/dev/null',
                    '--cmd', 'Open Molten for Discord', '--seed', f'{HERE}/seeds/molten-for-discord.json', '--eval', DRIVE, '--print'], capture_output=True, text=True)
v = next((json.loads(l[5:]) for l in r.stdout.splitlines() if l.startswith('EVAL ')), None)
if not isinstance(v, dict):
    print('molten-for-discord your data: the test page gave nothing back: ' + ((r.stderr.strip().splitlines() or ['no output'])[-1])); sys.exit(1)
bad = []
want = lambda ok, msg: ok or bad.append(msg)
c = v['csv']; want(c['header'] == 'date,type,server,channel,seconds,messages_sent', f'CSV header is {c["header"]!r}')
want(c['rows'] > 100, f'CSV has {c["rows"]} rows from the demo activity')
j = v['json']; want(not j['hasShotName'] and not j['found'], 'Export data holds names Screenshot safe hides')
want(j['favs'] == 5 and j['saved'] == 3, f'Export data has {j["favs"]} favorites and {j["saved"]} saved messages, not 5 and 3')
want(v['importMsg'].startswith('Imported settings, lava looks, 1 favorite,'), f'import said {v["importMsg"]!r}')
a = v['after']; want(a['favs'] == 6 and a['hasImported'], 'the good favorite in the backup didn\'t come in, or junk did')
want(a['strength'] == 'medium' and a['blurMedia'] is False, 'a wrong-kind setting in the backup changed a setting')
want(a['track'] is False, 'a good setting in the backup didn\'t come in')
want('shotName' not in a or a.get('shotName') in (None, 'User'), 'a hidden name came in from the backup')
for k in ('wrongFile', 'notJson'): want(v[k] == "That file isn't a Molten for Discord backup.", f'{k}: {v[k]!r}')
want(v['ask'].startswith('Erase all your activity?') and v['askGone'], 'Erase activity didn\'t ask first, or Cancel didn\'t close the question')
want(v['rowsAfterCancel'] >= c['rows'], 'Cancel erased activity')
want(v['rowsAfterErase'] == 0 and v['erasedMsg'] == 'Your activity was erased.', 'OK didn\'t erase the activity')
for b in bad: print('molten-for-discord your data: ' + b)
if not bad: print('== molten-for-discord your data: clean')
sys.exit(1 if bad else 0)
