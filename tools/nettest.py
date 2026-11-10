"""Check that the scripts that use the network cope when it fails.

    python3 tools/nettest.py [script ...]    # prism, looking-glass, kaleidoscope, kaleidoscope-mobile

Every script that makes requests is opened with the network failing each way it can (shot.js --net):
- hang: the server never answers (Tampermonkey gives up at the request's timeout; the page's own fetches hang)
- status: a server error (503)
- malformed: a 200 whose body is broken (bad JSON, an "image" that isn't one)
- abort: the connection drops
- redirect: for Prism and Looking-Glass, the page can't fetch the manifest or icons itself and what
  Tampermonkey brings back came from a redirect to a private address: it must not be used (Prism takes
  the page's theme-color, Looking-Glass says "From the page color"); redirect-public, the same through a
  public address, still is
and once working normally (ok). In each case it fails if the page shows an uncaught error or an unhandled
rejection, if the panel doesn't open or shows "undefined"/"NaN"/"[object", or if the script doesn't fall back:
- Prism still colours the title bar (from the page's theme-color when the manifest and icon fail), within
  20 s when the manifest never arrives
- Looking-Glass's panel still opens with its colour from the page
- Kaleidoscope's Recommend buttons (and the phone version's Copy) end in a sentence that says what went wrong (never "Failed to fetch" or
  a spinner forever), within 20 s when AniList never answers
"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from screens import JOBS

MODES = ['ok', 'hang', 'status', 'malformed', 'abort']
REDIRECTS = ['redirect', 'redirect-public']     # Prism and Looking-Glass only (the scripts that reach any site)
PAGE_COLOR, ICON_COLOR = '#3b6fd6', '#e05a8a'   # shot.js: the stand-in page's theme-color, and the colour of what Tampermonkey brings back
# what each failure must say on Kaleidoscope's status line
KAL_SAYS = {'hang': 'took too long', 'status': 'having trouble', 'malformed': 'unreadable', 'abort': "Couldn't reach AniList"}

TEXT = """(() => { let s = ''; const walk = r => { for (const e of r.querySelectorAll('*')) { if (e.shadowRoot) { s += ' ' + e.shadowRoot.textContent; walk(e.shadowRoot); } } }; walk(document); return s + ' ' + document.body.textContent; })()"""
CHECKS = {
    'prism': ('desktop/prism', 9500, f"""(async () => {{ await new Promise(r => setTimeout(r, WAIT));
        const own = document.querySelector('meta[data-prism]');            // the tag Prism sets once it has a colour
        return {{ errs: window.__errs, text: {TEXT}, color: own ? own.content : '' }}; }})()"""),
    'looking-glass': ('desktop/looking-glass', 2500, f"""(async () => {{ await new Promise(r => setTimeout(r, WAIT));
        return {{ errs: window.__errs, text: {TEXT} }}; }})()"""),
    'kaleidoscope': ('desktop/kaleidoscope', 1500, f"""(async () => {{
        const host = document.querySelector('kaleidoscope-root, kaleidoscope-mobile'), root = (host && host.shadowRoot) || document;
        // desktop: a mode button builds and sends the prompt; phone: a mode button picks, then Copy builds it
        const p = root.querySelector('#kaleidoscope-panel'); const b = p && p.querySelector('.kld-mode'); if (b) b.click();
        const act = p && p.querySelector('.kld-act'); if (act) {{ await new Promise(r => setTimeout(r, 200)); act.click(); }}
        const end = Date.now() + WAIT; let st = '';
        while (Date.now() < end) {{ await new Promise(r => setTimeout(r, 250)); const e = p && p.querySelector('.kld-status'); st = e ? e.textContent : ''; if (e && /err/.test(e.className)) break; }}
        return {{ errs: window.__errs, text: {TEXT}, status: st, button: !!b }}; }})()"""),
}
CHECKS['kaleidoscope-mobile'] = ('mobile/kaleidoscope-mobile',) + CHECKS['kaleidoscope'][1:]

def run(name, mode):
    path, wait, js = CHECKS[name]
    url, cmd, extra, _ = JOBS[path]
    if name.startswith('kaleidoscope') and mode != 'ok': wait = 23000 if mode == 'hang' else 4000
    if name == 'prism' and mode == 'hang': wait = 20000            # its own fetch gives up at 8 s, then it falls back
    args = ['node', f'{HERE}/shot.js', f'{R}/{path}/{path.split("/")[1]}.user.js', url, '/dev/null', '--cmd', cmd, '--net', mode,
            '--eval', js.replace('WAIT', str(wait)), '--print'] + [a for a in extra if a in ('--mobile',)]
    r = subprocess.run(args, capture_output=True, text=True, timeout=120)
    line = next((l for l in r.stdout.splitlines() if l.startswith('EVAL ')), None)
    if not line: return [f'no result: {(r.stderr or r.stdout).strip()[-200:]}']
    v = json.loads(line[5:]) or {}
    probs = [f'uncaught: {e[:120]}' for e in v.get('errs', [])]
    text = v.get('text', '')
    if any(w in text for w in ('undefined', 'NaN', '[object')): probs.append('the page shows undefined/NaN/[object')
    if name == 'prism' and not v.get('color'): probs.append('the title bar was left without a colour')
    if name == 'looking-glass' and 'Looking-Glass' not in text: probs.append("the panel didn't open")
    if mode == 'redirect':
        if name == 'prism' and v.get('color') != PAGE_COLOR: probs.append(f'used what came back from a private address (title bar {v.get("color")}, not the page colour {PAGE_COLOR})')
        if name == 'looking-glass' and 'From the page color' not in text: probs.append('used what came back from a private address (not "From the page color")')
    if mode == 'redirect-public':
        if name == 'prism' and v.get('color') != ICON_COLOR: probs.append(f'refused a public redirect (title bar {v.get("color")}, not {ICON_COLOR})')
        if name == 'looking-glass' and 'From the site icon' not in text: probs.append('refused a public redirect (not "From the site icon")')
    if name.startswith('kaleidoscope'):
        if not v.get('button'): probs.append("the panel didn't open")
        st = v.get('status', '')
        if mode != 'ok':
            if KAL_SAYS[mode].lower() not in st.lower(): probs.append(f'status line says {st!r}, not something about "{KAL_SAYS[mode]}"')
            if 'Failed to fetch' in st or 'TypeError' in st: probs.append(f'status line shows a raw browser error: {st!r}')
    return probs

if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if not a.startswith('-')] or list(CHECKS)
    bad = False
    for n in names:
        for m in MODES + (REDIRECTS if n in ('prism', 'looking-glass') else []):
            probs = run(n, m); bad |= bool(probs)
            print(f'== {n} / {m}: ' + ('clean' if not probs else '; '.join(probs)))
    sys.exit(1 if bad else 0)
