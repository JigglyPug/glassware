"""Check every panel for small visual glitches at common screen sizes.

    python3 tools/audit.py            # every script
    python3 tools/audit.py prism      # just one (folder name)

Opens each panel the same way tools/screens.py does, then on every tab and every fold-out
picker looks for text that spills out of its box or is cut short, things clipped by their
container or pushed off screen, sideways scrolling and overlapping controls. Desktop scripts
are checked at laptop and desktop sizes; scripts that run on phones (RUNS in readmes.py) are
also checked at small and large phone sizes. Prints one line per problem; no output under a
script means it's clean. It also checks the glass recipe (blur 28px, saturate 170%, light glass
at 84%, dark at 80%) and flags text fainter than 3:1 against its background. Every size runs in dark
on a plain page and with the global CSS big sites ship ("with site CSS"), which panels outside a
shadow root inherit, then in light on a plain page. "text cut with …" is usually on purpose (long names), so check those
by eye. Phone scripts are also read for bottom sheets sized in plain vh: on phones vh ignores the
address and tool bars, so the sheet's top slides under them; they need a dvh size as well.
Phone sizes render in Roboto, Android's font (install it into ~/.fonts first), because
text that fits in the desktop fonts can still spill out on a phone.
"""
import json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from screens import JOBS, CLOCK
src = open(f'{HERE}/readmes.py', encoding='utf-8').read(); ns = {'__file__': f'{HERE}/readmes.py'}
exec(src[:src.index('\nACCENT = {')], ns); RUNS = ns['RUNS']

DESKTOP = [(1280, 720), (1366, 768), (1920, 1080)]
PHONE = [(360, 640), (390, 700), (412, 839)]   # short heights stand in for the address and tool bars

# Phones render system fonts as Roboto; point the test browser's fonts at it for phone sizes.
FONTS = os.path.join(tempfile.gettempdir(), 'glassware-phone-fonts.conf')
open(FONTS, 'w').write('<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>'
    '<include ignore_missing="yes">/etc/fonts/fonts.conf</include><dir>~/.fonts</dir>'
    + ''.join(f'<alias binding="strong"><family>{f}</family><prefer><family>Roboto</family></prefer></alias>'
              for f in ['sans-serif', 'system-ui', 'Segoe UI', 'Segoe UI Variable', 'Inter', '-apple-system', 'Helvetica Neue', 'Arial'])
    + '</fontconfig>')
if 'Roboto' not in subprocess.run(['fc-list'], capture_output=True, text=True).stdout:
    print('note: Roboto is not installed, so phone sizes use the desktop font')

def audit(p, w, h, phone, hostile=False, theme='dark'):
    url, cmd, extra, tabs = JOBS[p]; slug = p.split('/')[1]
    extra = [x for x in extra if x != '--mobile']
    args = ['node', f'{HERE}/shot.js', f'{R}/{p}/{slug}.user.js', url, '/dev/null', '--cmd', cmd, '--audit', '--clock', CLOCK,
            '--vw', str(w), '--vh', str(h), '--theme', theme] + (['--mobile'] if phone else []) + (['--hostile'] if hostile else []) + extra + (['--tabs', ','.join(tabs)] if tabs else [])
    r = subprocess.run(args, capture_output=True, text=True, timeout=180, env=dict(os.environ, FONTCONFIG_FILE=FONTS) if phone else None)
    line = next((l for l in r.stdout.splitlines() if l.startswith('AUDIT ')), None)
    if line is None: return [f'could not run: {(r.stderr or r.stdout)[-300:]}']
    return json.loads(line[6:])

if __name__ == '__main__':
    only = sys.argv[1:]
    for p in JOBS:
        if only and p.split('/')[1] not in only: continue
        sizes = ([] if RUNS[p] == 'phone' else [(w, h, False) for w, h in DESKTOP]) + ([(w, h, True) for w, h in PHONE] if RUNS[p] != 'desktop' else [])
        found = {}
        from concurrent.futures import ThreadPoolExecutor
        # dark on a plain page and with site CSS, then light on a plain page (layout is the same in both
        # themes; light adds its own glass and contrast checks)
        runs = [(w, h, phone, hostile, 'dark') for w, h, phone in sizes for hostile in (False, True)] + [(w, h, phone, False, 'light') for w, h, phone in sizes]
        with ThreadPoolExecutor(4) as ex:
            for (w, h, phone, hostile, theme), res in zip(runs, ex.map(lambda a: audit(p, *a), runs)):
                for issue in res: found.setdefault(issue, []).append(f'{w}x{h}' + (' with site CSS' if hostile else '') + (' light' if theme == 'light' else ''))
        if RUNS[p] != 'desktop':
            import re
            code = open(f'{R}/{p}/{p.split("/")[1]}.user.js', encoding='utf-8').read()
            for m in re.finditer(r'max-height:\s*(\d+)vh', code):
                if 'dvh' not in code[m.end():m.end() + 40]: found.setdefault(f'phone | sheet sized in vh without dvh | {m.group(0)}', []).append('code')
        print(f'== {p}: {"clean" if not found else str(len(found)) + " issue(s)"}')
        for issue, at in found.items(): print(f'   {issue}   [{", ".join(at)}]')
