"""One-time patch: bring both Kaleidoscope panels onto the shared Glassware panel frame
(keeps AniList's colors and font). Safe to re-run."""
import sys

GEM = [('M12 3.4 19.5 7.7v8.6L12 20.6 4.5 16.3V7.7Z', '#fff', '.28', '1.6'),
       ('M12 3.4V20.6M4.5 7.7l15 8.6M19.5 7.7l-15 8.6', 'none', '0', '1.1')]

def common(s, path, foot_text):
    def sub(old, new):
        nonlocal s
        if old in s: s = s.replace(old, new, 1)
        elif new.split('\n')[0] not in s: sys.exit(f'{path}: missing {old[:80]!r}')
    # section labels: diamond + monospace caps in AniList blue
    import re
    s, n = re.subn(r"'#kaleidoscope-panel \.kld-sec\{margin:(\d+)px 0 (\d+)px;font-size:[\d.]+px;font-weight:700;letter-spacing:\.08em;text-transform:uppercase;color:#728AA1\}' \+",
        lambda m: "'#kaleidoscope-panel .kld-sec{margin:18px 0 " + m.group(2) + "px;display:flex;align-items:center;gap:7px;color:#7FC9F5;font:700 10.5px/1.2 ui-monospace,\"SF Mono\",\"Cascadia Mono\",Menlo,monospace !important;letter-spacing:.16em;text-transform:uppercase}' +\n"
        "      '#kaleidoscope-panel .kld-sec::before{content:\"\";width:6px;height:6px;border-radius:1px;background:' + ACCENT + ';transform:rotate(45deg);flex:none}' +\n"
        "      '#kaleidoscope-panel .kld-brand{display:flex;align-items:center;gap:11px;min-width:0}' +\n"
        "      '#kaleidoscope-panel .kld-icon{width:34px;height:34px;border-radius:10px;flex:none;display:grid;place-items:center;' +\n"
        "      'background:linear-gradient(145deg,#4cc2ff,#2257d6);box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}' +\n"
        "      '#kaleidoscope-panel .kld-icon svg{width:22px;height:22px;display:block}' +\n"
        "      '#kaleidoscope-panel .kld-ctx{display:flex;align-items:center;gap:8px;margin:0 16px 10px;min-width:0}' +\n"
        "      '#kaleidoscope-panel .kld-ctx .kld-sub{font:12.5px ui-monospace,\"SF Mono\",\"Cascadia Mono\",Menlo,monospace !important}' +\n"
        "      '#kaleidoscope-panel .kld-footline{padding:9px 16px 12px;font-size:11.5px;color:#728AA1;border-top:1px solid rgba(255,255,255,.06)}' +", s, count=1)
    if not n and '.kld-icon{' not in s: sys.exit(f'{path}: section style not found')
    # header: icon tile next to the wordmark; the list line moves to its own context row
    sub("      head.append(t, x);\n\n      const tabs = el('div', 'kld-tabs');",
        "      const brand = el('div', 'kld-brand');\n"
        "      brand.append(iconTile(), t);\n"
        "      head.append(brand, x);\n"
        "      const ctx = el('div', 'kld-ctx');\n"
        "      ctx.append(subEl);\n\n"
        "      const tabs = el('div', 'kld-tabs');")
    for tag in ['AI recommendations from your list', 'AI recommendation prompts from your list']:
        s = s.replace("      t.append(title, el('div', 'kld-tagline', '" + tag + "'), subEl);", "      t.append(title, el('div', 'kld-tagline', '" + tag + "'));")
    if ", subEl);" in s.split("function open()")[1][:1500]: sys.exit(f'{path}: tagline line not moved')
    sub("    function updateSub() {",
        "    const VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '';\n"
        "    function iconTile() {\n"
        "      const tile = el('div', 'kld-icon');\n"
        "      const NS = 'http://www.w3.org/2000/svg';\n"
        "      const svg = document.createElementNS(NS, 'svg');\n"
        "      svg.setAttribute('viewBox', '0 0 24 24');\n"
        + ''.join(
        "      { const p = document.createElementNS(NS, 'path');\n"
        f"        p.setAttribute('d', '{d}'); p.setAttribute('fill', '{fill}'); p.setAttribute('fill-opacity', '{fo}');\n"
        f"        p.setAttribute('stroke', '#fff'); p.setAttribute('stroke-width', '{sw}'); p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('stroke-linecap', 'round');\n"
        "        svg.append(p); }\n" for d, fill, fo, sw in GEM) +
        "      tile.append(svg);\n"
        "      return tile;\n"
        "    }\n\n"
        "    function updateSub() {")
    return s

def desktop(path):
    s = open(path, encoding='utf-8').read(); o = s
    s = common(s, path, None)
    s = s.replace("'#kaleidoscope-panel{position:fixed;right:20px;bottom:72px;width:380px;max-width:calc(100vw - 32px);height:auto;min-height:0;'",
                  "'#kaleidoscope-panel{position:fixed;top:16px;right:16px;width:400px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);height:auto;min-height:0;'")
    s = s.replace("'border:1px solid rgba(255,255,255,.07);border-radius:16px;box-shadow:0 14px 44px rgba(0,0,0,.6);'",
                  "'border:1px solid rgba(255,255,255,.07);border-radius:22px;box-shadow:0 14px 44px rgba(0,0,0,.6);'")
    old_place = s[s.index("    // Under the top-bar button when that's in use and visible, otherwise above the corner button.\n    function placePanel() {"):s.index("    window.addEventListener('resize', placePanel);")]
    s = s.replace(old_place,
        "    // Top right, like every Glassware panel, whichever button opened it.\n"
        "    function placePanel() {\n"
        "      if (!panelEl) return;\n"
        "      const s = panelEl.style;\n"
        "      s.top = '16px'; s.bottom = 'auto'; s.right = '16px';\n"
        "      s.maxHeight = 'calc(100vh - 32px)';\n"
        "    }\n")
    s = s.replace("      panelEl.append(head, tabs, bodyEl);\n      for (const type of ['keydown', 'keypress', 'keyup']) {",
                  "      const foot = el('div', 'kld-footline', 'Open from \\u2726 or the Tampermonkey menu \\u00b7 v' + VERSION + ' \\u00b7 every tab updates live');\n"
                  "      panelEl.append(head, ctx, tabs, bodyEl, foot);\n      for (const type of ['keydown', 'keypress', 'keyup']) {")
    if 'kld-footline\', \'Open' not in s: sys.exit('desktop footer not added')
    open(path, 'w', encoding='utf-8').write(s); print('patched' if s != o else 'unchanged', path)

def mobile(path):
    s = open(path, encoding='utf-8').read(); o = s
    s = common(s, path, None)
    s = s.replace("      panelEl.append(el('div', 'kld-grab'), head, tabs, bodyEl, footEl);\n"
                  "      // keep AniList's keyboard shortcuts from firing while you type in the menu\n"
                  "      for (const type of ['keydown', 'keypress', 'keyup']) panelEl.addEventListener(type, e => e.stopPropagation());",
                  "      const footLine = el('div', 'kld-footline', 'Open from \\u2726 or the Tampermonkey menu \\u00b7 v' + VERSION);\n"
                  "      panelEl.append(el('div', 'kld-grab'), head, ctx, tabs, bodyEl, footEl, footLine);\n"
                  "      // keep AniList's keyboard shortcuts from firing while you type in the menu; Esc closes it\n"
                  "      for (const type of ['keydown', 'keypress', 'keyup']) panelEl.addEventListener(type, e => {\n"
                  "        if (type === 'keydown' && e.key === 'Escape') close();\n"
                  "        e.stopPropagation();\n"
                  "      });")
    if "e.key === 'Escape') close();" not in s: sys.exit('mobile esc not added')
    open(path, 'w', encoding='utf-8').write(s); print('patched' if s != o else 'unchanged', path)

if __name__ == '__main__':
    desktop('desktop/kaleidoscope/kaleidoscope.user.js')
    mobile('mobile/kaleidoscope-mobile/kaleidoscope-mobile.user.js')
