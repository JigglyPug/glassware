"""One-time patch: bring the three Molten panels onto the shared Glassware panel frame.
Kept in tools/ as a record of exactly what changed; safe to re-run (it skips applied steps)."""
import re, sys

FILES = {
    'desktop/molten-tools/molten-tools.user.js': dict(name='Molten Tools', glyph='play'),
    'desktop/molten-for-reddit/molten-for-reddit.user.js': dict(name='Molten for Reddit', glyph='bubble'),
    'mobile/molten-for-reddit-mobile/molten-for-reddit-mobile.user.js': dict(name='Molten for Reddit', glyph='bubble'),
}
GLYPH = {'play': 'M9.5 7.6v8.8c0 .7.8 1.1 1.4.7l6.6-4.4c.5-.3.5-1.1 0-1.4l-6.6-4.4c-.6-.4-1.4 0-1.4.7z',
         'bubble': 'M6 6.5h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-6.2L8 19.3v-2.8H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z'}
OPTION_TEXT = {  # shorter labels so the choices fit as segmented buttons
    "'Dark (easy to read)'": "'Dark'", "'Bright (easy to see)'": "'Bright'", "'Same as title bar'": "'Match title bar'",
    "'Best available'": "'Best'", "'2880p (5K)'": "'5K'", "'2160p (4K)'": "'4K'", "'Same as default'": "'Same'",
    "'Same as YouTube'": "'Same'", "'Up to 1080p'": "'1080p'", "'Up to 720p'": "'720p'", "'Up to 480p'": "'480p'",
    "'Feed, posts and profiles'": "'Everywhere'", "'Posts and profiles'": "'Posts only'", "'Their posts'": "'Posts'",
    "'Their comments'": "'Comments'", "'As many as possible'": "'All'", "'Newest first'": "'Newest'", "'Oldest first'": "'Oldest'",
    "'Blur them'": "'Blur'", "'Swap in a placeholder'": "'Placeholder'",
}

def patch(path, name, glyph):
    s = open(path, encoding='utf-8').read(); o = s
    def sub(old, new, count=1, need=True):
        nonlocal s
        if old not in s:
            if need and new not in s: sys.exit(f'{path}: missing {old[:70]!r}')
            return
        s = s.replace(old, new, count)

    # shell: top-right, same width and roundness as every Glassware panel
    sub("'#ytt-panel{position:fixed;top:60px;right:16px;width:380px;max-width:calc(100vw - 32px);max-height:calc(100vh - 84px);'",
        "'#ytt-panel{position:fixed;top:16px;right:16px;width:400px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);'")
    sub("'border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 14px 44px rgba(0,0,0,.6);'",
        "'border:1px solid rgba(255,255,255,.12);border-radius:22px;box-shadow:0 14px 44px rgba(0,0,0,.6);'")
    # section labels: diamond + monospace caps in the app's accent
    sub("'#ytt-panel .ytt-sec{margin:14px 0 2px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.62}' +",
        "'#ytt-panel .ytt-sec{margin:18px 0 4px;display:flex;align-items:center;gap:7px;color:#ffb470;font:700 10.5px/1.2 ui-monospace,\"SF Mono\",\"Cascadia Mono\",Menlo,monospace !important;letter-spacing:.16em;text-transform:uppercase}' +\n"
        "      '#ytt-panel .ytt-sec::before{content:\"\";width:6px;height:6px;border-radius:1px;background:' + ACCENT + ';transform:rotate(45deg);flex:none}' +\n"
        "      '#ytt-panel .ytt-brand{display:flex;align-items:center;gap:11px;min-width:0}' +\n"
        "      '#ytt-panel .ytt-icon{width:34px;height:34px;border-radius:10px;flex:none;display:grid;place-items:center;' +\n"
        "      'background:radial-gradient(circle at 25% 20%,#ffb23d,transparent 60%),radial-gradient(circle at 85% 30%,#ff2d6f,transparent 60%),' +\n"
        "      'radial-gradient(circle at 40% 95%,#ff6a1f,transparent 65%),#7a2cd6;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}' +\n"
        "      '#ytt-panel .ytt-icon svg{width:20px;height:20px;display:block}' +\n"
        "      '#ytt-panel .ytt-ctx{display:flex;align-items:center;gap:8px;margin:0 16px 10px;min-width:0}' +\n"
        "      '#ytt-panel .ytt-host{font:12.5px ui-monospace,\"SF Mono\",\"Cascadia Mono\",Menlo,monospace !important;opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +\n"
        "      '#ytt-panel .ytt-chip{font:700 10px/1 ui-monospace,\"SF Mono\",\"Cascadia Mono\",Menlo,monospace !important;letter-spacing:.12em;text-transform:uppercase;' +\n"
        "      'padding:5px 8px;border-radius:7px;background:rgba(255,154,61,.16);color:#ffb470;flex:none}' +\n"
        "      '#ytt-panel .ytt-chip.off{background:rgba(255,255,255,.08);color:rgba(255,255,255,.6)}' +\n"
        "      '#ytt-panel .ytt-foot{padding:9px 16px 12px;font-size:11.5px;opacity:.55;border-top:1px solid rgba(255,255,255,.08)}' +\n"
        "      '#ytt-panel .ytt-seg.inline{margin-top:0;flex:none}' +\n"
        "      '#ytt-panel .ytt-seg.inline .ytt-segbtn{flex:none;padding:6px 11px}' +\n"
        "      '#ytt-panel .ytt-seg.grid{display:grid;gap:4px}' +\n"
        "      '#ytt-panel .ytt-seg.grid .ytt-segbtn{padding:7px 4px;line-height:1.25}' +")
    # every dropdown becomes segmented buttons (inline when 2-3 short options, a grid otherwise)
    s = re.sub(r"    function selectRow\(parent, label, hint, options, get, set\) \{\n      const row = el\('div', 'ytt-row'\);\n      const s = el\('select', 'ytt-sel'\);[\s\S]*?\n      return row;\n    \}\n",
"""    // Choices are segmented buttons: inline on the right for 2-3 short options, a grid under the label otherwise.
    function selectRow(parent, label, hint, options, get, set) {
      const short = options.length <= 3 && options.every(([, t]) => t.length <= 12);
      const row = el('div', short ? 'ytt-row' : 'ytt-field');
      const seg = el('div', 'ytt-seg ' + (short ? 'inline' : 'grid'));
      if (!short) seg.style.gridTemplateColumns = 'repeat(' + Math.min(options.length, 4) + ',1fr)';
      const cur = String(get());
      for (const [val, text] of options) {
        const b = el('button', 'ytt-segbtn' + (String(val) === cur ? ' on' : ''), text);
        b.type = 'button';
        b.addEventListener('click', () => { for (const x of seg.children) x.classList.toggle('on', x === b); set(val); });
        seg.append(b);
      }
      row.append(labelBlock(label, hint), seg);
      parent.append(row);
      return row;
    }
""", s, count=1)
    if "const short = options.length" not in s: sys.exit(f'{path}: selectRow not replaced')
    # (later: long choice sets became a compact pill that opens the buttons; see the scripts)
    for k, v in OPTION_TEXT.items(): s = s.replace('[' + k.replace("'", "'", 1), '[' + k) ; s = re.sub(r"(\[\s*'[^']*',\s*)" + re.escape(k) + r"(\s*\])", r"\g<1>" + v.replace('\\', '\\\\') + r"\g<2>", s)
    s = s.replace("selectRow(t, 'Tone', null,", "selectRow(t, 'Tone', 'Dark is easiest to read',")
    s = s.replace("selectRow(k, 'Tone', null,", "selectRow(k, 'Tone', 'Bright is easiest to see',")
    # header: icon tile + name + tagline, then the context line (site + status chip)
    s = re.sub(r"t\.append\(el\('div', 'ytt-title', '([^']+)'\), el\('div', 'ytt-tagline', '([^']+)'\), el\('div', 'ytt-sub', [^\n]*\)\);",
               lambda m: "t.append(el('div', 'ytt-title', '" + m.group(1) + "'), el('div', 'ytt-tagline', '" + m.group(2) + "'));", s, count=1)
    sub("      head.append(t, x);\n",
        "      const brand = el('div', 'ytt-brand');\n"
        "      brand.append(iconTile(), t);\n"
        "      head.append(brand, x);\n"
        "      const ctx = el('div', 'ytt-ctx');\n"
        "      ctx.append(el('span', 'ytt-host', location.hostname.replace(/^www\\./, '')), el('span', 'ytt-chip'));\n")
    sub("      panelEl.append(head, tabs, bodyEl);\n",
        "      const foot = el('div', 'ytt-foot', 'Open from the lava button or the Tampermonkey menu \\u00b7 v' + VERSION + ' \\u00b7 every tab updates live');\n"
        "      panelEl.append(head, ctx, tabs, bodyEl, foot);\n")
    # status chip follows the master switch
    sub("      for (const b of panelEl.querySelectorAll('.ytt-tab')) b.classList.toggle('on', b.dataset.tab === tab);\n",
        "      for (const b of panelEl.querySelectorAll('.ytt-tab')) b.classList.toggle('on', b.dataset.tab === tab);\n"
        "      const chip = panelEl.querySelector('.ytt-chip');\n"
        "      if (chip) { chip.textContent = ENABLED ? 'On' : 'Off'; chip.classList.toggle('off', !ENABLED); }\n")
    # icon tile helper (built with DOM calls: YouTube blocks innerHTML) + version from the header
    sub("    function labelBlock(label, hint) {",
        "    const VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '';\n"
        "    function iconTile() {\n"
        "      const tile = el('div', 'ytt-icon');\n"
        "      const NS = 'http://www.w3.org/2000/svg';\n"
        "      const svg = document.createElementNS(NS, 'svg');\n"
        "      svg.setAttribute('viewBox', '0 0 24 24');\n"
        "      const p = document.createElementNS(NS, 'path');\n"
        f"      p.setAttribute('d', '{GLYPH[glyph]}');\n"
        "      p.setAttribute('fill', '#fff');\n"
        "      svg.append(p);\n"
        "      tile.append(svg);\n"
        "      return tile;\n"
        "    }\n\n"
        "    function labelBlock(label, hint) {")
    # the on/off card says the same thing in every script
    s = re.sub(r"\? 'Everything is on\. Turn off to stop every feature at once[^']*'\n(\s*): '[^']*',",
               lambda m: "? 'Everything is on. Turn off to stop every feature at once.'\n" + m.group(1) + ": 'Everything is off. Your settings are kept.',", s, count=1)
    # menu wording
    s = s.replace(f"GM_registerMenuCommand('Open {name} settings'", f"GM_registerMenuCommand('Open {name}'")
    s = s.replace("GM_registerMenuCommand('Toggle lava on/off'", "GM_registerMenuCommand('Turn lava on/off'")
    s = s.replace("GM_registerMenuCommand('Screenshot safe on/off'", "GM_registerMenuCommand('Turn screenshot safe on/off'")
    if s != o: open(path, 'w', encoding='utf-8').write(s)
    print('patched' if s != o else 'unchanged', path)

if __name__ == '__main__':
    for p, d in FILES.items(): patch(p, d['name'], d['glyph'])
