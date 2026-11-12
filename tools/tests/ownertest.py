"""Check that Prism stands by while another script holds the title bar, and keeps doing so.

    python3 tools/tests/ownertest.py

Two ways another script takes the title bar: it claims it with <html data-titlebar-owner="Name"> and
sets its own color, or it simply rewrites Prism's color (what the Molten scripts do). Prism must say it's standing by, and still say
so after you turn it off and back on, or turn it off and back on for the site (before 2.2.9 it stayed
"off" with the switch on). Once the other script lets go, Prism colors the title bar again.
Prints "== prism title bar hand-off: clean" (both ways) or the problems.
"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); R = os.path.dirname(HERE)   # HERE is the tools folder

DRIVE = r"""(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const status = () => ((__all().find(e => e.classList && e.classList.contains('stxt')) || {}).textContent || '').trim();
  const btn = l => __all().find(e => e.getAttribute && e.getAttribute('aria-label') === l);
  const out = [];
  const step = async (name, fn) => { if (fn) fn(); await w(700); out.push([name, status()]); };
  // the claim first, then the color, the order the Molten scripts use
  document.documentElement.setAttribute('data-titlebar-owner', 'Molten for Reddit'); await w(300);
  await step('claimed', () => {
    const m = document.createElement('meta'); m.name = 'theme-color'; m.content = '#777722'; m.id = 'other'; document.head.prepend(m);
  });
  await step('Prism off', () => btn('Prism on or off').click());
  await step('Prism back on', () => btn('Prism on or off').click());
  await step('off for this site', () => btn('Off for this site').click());
  await step('back on for this site', () => btn('Off for this site').click());
  await step('let go', () => { document.documentElement.removeAttribute('data-titlebar-owner'); document.getElementById('other').remove(); });
  await w(800); out.push(['let go, later', status()]);
  return out;
})()"""

REWRITE = r"""(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const status = () => ((__all().find(e => e.classList && e.classList.contains('stxt')) || {}).textContent || '').trim();
  const btn = l => __all().find(e => e.getAttribute && e.getAttribute('aria-label') === l);
  const out = [];
  const step = async (name, fn) => { if (fn) fn(); await w(700); out.push([name, status()]); };
  await w(800);
  await step('claimed', () => document.querySelector('meta[data-prism]').setAttribute('content', '#777722'));
  await step('Prism off', () => btn('Prism on or off').click());
  await step('Prism back on', () => btn('Prism on or off').click());
  await step('off for this site', () => btn('Off for this site').click());
  await step('back on for this site', () => btn('Off for this site').click());
  return out;
})()"""

WANT = {
    'claimed': 'Molten for Reddit set #777722 · Prism is standing by',
    'Prism off': 'Prism is off',
    'Prism back on': 'Molten for Reddit set #777722 · Prism is standing by',
    'off for this site': 'Off for this site',
    'back on for this site': 'Molten for Reddit set #777722 · Prism is standing by',
}

bad = []
for how, drive, who in (('claim', DRIVE, 'Molten for Reddit'), ('rewrite', REWRITE, 'Another script')):
    r = subprocess.run(['node', f'{HERE}/lib/shot.js', f'{R}/desktop/prism/prism.user.js', 'https://www.reddit.com/', '/dev/null',
                        '--cmd', 'Open Prism', '--eval', drive, '--print'], capture_output=True, text=True)
    got = next((json.loads(l[5:]) for l in r.stdout.splitlines() if l.startswith('EVAL ')), None)
    if not got:
        bad.append(f'{how}: the test page gave nothing back: ' + ((r.stderr.strip().splitlines() or ['no output'])[-1])); continue
    for k, v in got:
        want = WANT.get(k, '').replace('Molten for Reddit', who)
        # standing by: who holds it and that Prism waits (the color shown is whatever the page has now)
        ok = v.startswith(who + ' set ') and v.endswith('Prism is standing by') if want.endswith('standing by') else v.startswith(want)
        if want and not ok: bad.append(f'{how}: after "{k}" the status said "{v}", not "{want}"')
    final = dict(got).get('let go, later')
    if final is not None and ('standing by' in final or final.startswith('Prism is off')):
        bad.append(f'{how}: after the other script let go, Prism didn\'t take the title bar back ("{final}")')
for b in bad: print('prism title bar hand-off: ' + b)
if not bad: print('== prism title bar hand-off: clean')
sys.exit(1 if bad else 0)
