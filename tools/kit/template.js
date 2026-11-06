// ==UserScript==
// @name         __NAME__
// @namespace    jigglypug
// @version      1.0.0
// @description  __DESCRIPTION__
__MATCH__
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// @author       JigglyPug
// @license      MIT
// @icon         https://raw.githubusercontent.com/JigglyPug/glassware/main/assets/icons/__SLUG__.png?v=1
// @homepageURL  https://jigglypug.github.io/glassware/__FOLDER__/__SLUG__/
// @supportURL   https://github.com/JigglyPug/glassware/issues
// @updateURL    https://raw.githubusercontent.com/JigglyPug/glassware/main/__FOLDER__/__SLUG__/__SLUG__.user.js
// @downloadURL  https://raw.githubusercontent.com/JigglyPug/glassware/main/__FOLDER__/__SLUG__/__SLUG__.user.js
// ==/UserScript==

(function () {
    'use strict';

    /* ───────────────────────── the app ───────────────────────── */

    // Written by tools/new_script.py from the script's spec. The panel (frame, glass, light and
    // dark, controls) is built from this; the script's own work goes in FEATURES below.
    const APP = __APP__;
    const ICON_SRC = ''; // app icon (assets/icons), embedded by tools/panel_icons.py
    const VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '1.0.0';
    const HOST = location.hostname;

    /* ───────────────────────── storage ───────────────────────── */

    const clone = o => JSON.parse(JSON.stringify(o));
    const get = (k, d) => { try { const v = GM_getValue(k); return v === undefined ? clone(d) : v; } catch { return clone(d); } };
    const set = (k, v) => { try { GM_setValue(k, v); } catch {} };

    const ROWS = APP.sections.flatMap(s => s.rows);
    const DEFAULTS = Object.assign({ enabled: true, log: false, appearance: 'auto' }, Object.fromEntries(ROWS.map(r => [r.key, r.default])));

    // Every saved value is checked against its control, so old or broken data never breaks the panel.
    function loadSettings() {
        const saved = get('settings', {}), s = clone(DEFAULTS);
        for (const k of Object.keys(s)) if (saved && k in saved) s[k] = saved[k];
        for (const k of ['enabled', 'log']) s[k] = s[k] !== false && s[k] !== true ? DEFAULTS[k] : s[k];
        if (!['auto', 'light', 'dark'].includes(s.appearance)) s.appearance = 'auto';
        for (const r of ROWS) {
            const v = s[r.key];
            if (r.type === 'toggle' && typeof v !== 'boolean') s[r.key] = r.default;
            if (r.type === 'choice' && !r.options.some(o => o[0] === v)) s[r.key] = r.default;
            if (r.type === 'slider') s[r.key] = typeof v === 'number' && isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : r.default;
        }
        return s;
    }
    const S = { settings: loadSettings() };
    function save(patch) { S.settings = Object.assign(loadSettings(), patch); set('settings', S.settings); FEATURES.apply(S.settings); ui.render(); }

    const log = (...a) => { if (S.settings.log) console.log('%c[' + APP.slug + ']', 'color:' + APP.accent + ';font-weight:600', ...a); };

    // Counters for things the script does on its own, per device since install (CLAUDE.md: Counters).
    const COUNTS = {
        all() { const c = get('counts', {}); return c && typeof c === 'object' ? c : {}; },
        bump(key, n = 1) { const c = this.all(); c[key] = (+c[key] || 0) + n; set('counts', c); },
        line(row, key) {
            const def = APP.counters.find(c => c.key === key), n = +this.all()[key] || 0;
            if (!def || !n) return;
            row.querySelector('.tx')?.append(h('div', { class: 'cnt', text: `${def.did} ${n.toLocaleString()} ${n === 1 ? def.one : def.many} so far` }));
        },
    };

    /* ───────────────────────── features ───────────────────────── */

    // The script's own work. start() runs once on page load; apply() runs on load and whenever a
    // setting changes (in this tab or any other). status() is the chip on the context line.
    const FEATURES = {
        start() {
__START__
        },
        apply(s) {
__APPLY__
        },
        status(s) {
            return s.enabled ? 'On' : 'Off';
        },
    };

    /* ───────────────────────── panel ───────────────────────── */

    const SVGNS = 'http://www.w3.org/2000/svg';
    function icon(paths, size = 14, sw = 2) {
        const s = document.createElementNS(SVGNS, 'svg');
        for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
        for (const d of [].concat(paths)) { const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); s.append(p); }
        return s;
    }
    const ICONS = {
        close: ['M6 6l12 12', 'M18 6 6 18'],
        chev: ['m6 9 6 6 6-6'],
        sun: ['M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7', 'M12 2.5v2', 'M12 19.5v2', 'M2.5 12h2', 'M19.5 12h2', 'M5.3 5.3l1.4 1.4', 'M17.3 17.3l1.4 1.4', 'M5.3 18.7l1.4-1.4', 'M17.3 6.7l1.4-1.4'],
        moon: ['M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6Z'],
    };
    function h(tag, attrs, ...kids) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (v == null || v === false) continue;
            if (k === 'class') el.className = v;
            else if (k === 'text') el.textContent = v;
            else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
            else el.setAttribute(k, v === true ? '' : v);
        }
        for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
        return el;
    }
    const toggle = (on, onclick, label) => h('button', { class: 'sw', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label, onclick });

    const isDark = () => S.settings.appearance === 'dark' || (S.settings.appearance === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);

    // The glass recipe (CLAUDE.md): only neutrals swap between light and dark; accents stay.
    const CSS = `
:host{all:initial}
*{box-sizing:border-box;margin:0}
[hidden]{display:none!important}
.panel{
  --a:${APP.accent};--a-rgb:${APP.rgb};--on:${APP.on};--ink:${APP.ink};
  --glass:rgba(255,255,255,.84);--solid:rgb(250,250,252);--text:#1d1d1f;--sub:rgba(29,29,31,.64);--line:rgba(0,0,0,.07);
  --edge:rgba(255,255,255,.8);--hl:#fff;--drop:rgba(0,0,0,.34);--ctl:rgba(0,0,0,.055);--ctl-hi:rgba(0,0,0,.1);--sw-off:rgba(0,0,0,.13);
  --field:rgba(255,255,255,.6);--field-hi:#fff;--knob:#fff;
  --mono:"SF Mono",ui-monospace,"Cascadia Code","JetBrains Mono",Consolas,monospace;
  position:fixed;top:16px;right:16px;z-index:2147483647;width:400px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);
  display:flex;flex-direction:column;overflow:hidden;border-radius:22px;
  font:13px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable Text","Segoe UI",Inter,system-ui,sans-serif;
  color:var(--text);text-align:left;white-space:normal;letter-spacing:normal;
  background:radial-gradient(120% 40% at 0% 0%,rgba(var(--a-rgb),.18),transparent 70%),var(--glass);
  backdrop-filter:blur(28px) saturate(170%);-webkit-backdrop-filter:blur(28px) saturate(170%);
  border:1px solid var(--edge);
  box-shadow:0 0 0 .5px rgba(var(--a-rgb),.4),0 28px 64px -18px var(--drop),inset 0 1px 0 var(--hl);
  animation:in .18s cubic-bezier(.2,.8,.2,1)}
.panel[data-theme=dark]{--glass:rgba(22,22,28,.8);--solid:rgb(28,28,34);--text:#f2f2f5;--sub:rgba(235,235,245,.62);--line:rgba(255,255,255,.09);
  --edge:rgba(255,255,255,.12);--hl:rgba(255,255,255,.1);--drop:rgba(0,0,0,.6);--ctl:rgba(255,255,255,.08);--ctl-hi:rgba(255,255,255,.14);
  --sw-off:rgba(255,255,255,.2);--field:rgba(255,255,255,.06);--field-hi:rgba(255,255,255,.12);--knob:#55555f;--ink:${APP.inkDark};color-scheme:dark}
@keyframes in{from{opacity:0;transform:translateY(-6px) scale(.98)}}
@media (prefers-reduced-motion:reduce){.panel,.panel *{animation:none!important;transition:none!important}}
button,input{font:inherit;color:inherit}
button{cursor:pointer}
.top{flex:none}
.body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:none}
.body::-webkit-scrollbar{display:none}
.grab{display:none}
.head{display:flex;align-items:center;gap:11px;padding:16px 16px 4px}
.logo{position:relative;flex:none;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff;overflow:hidden;
  background:linear-gradient(145deg,color-mix(in srgb,var(--a) 72%,#0b0b16),color-mix(in srgb,var(--a) 40%,#0b0b16));
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.3),0 4px 16px -4px rgba(var(--a-rgb),.95)}
.logo-img{position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;display:block}
.nm{min-width:0}
.title{font-weight:650;font-size:16px;letter-spacing:-.015em}
.tag{font-size:12px;color:var(--sub)}
.mode{position:relative;flex:none;margin-left:auto;width:50px;height:28px;border:0;border-radius:14px;background:var(--ctl);padding:0 7px;margin-right:-3px;display:flex;align-items:center;justify-content:space-between;color:var(--sub)}
.mode .mi{position:relative;z-index:1;display:grid;transition:color .18s}
.mode .knob{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:var(--knob);box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s cubic-bezier(.3,.7,.3,1)}
.panel[data-theme=dark] .mode .knob{transform:translateX(22px)}
.panel:not([data-theme=dark]) .mode .sun,.panel[data-theme=dark] .mode .moon{color:var(--text)}
.x{flex:none;width:28px;height:28px;border-radius:50%;border:0;background:var(--ctl);display:grid;place-items:center;color:var(--sub)}
.x:hover{background:var(--ctl-hi);color:var(--text)}
.ctx{display:flex;align-items:center;gap:8px;padding:6px 16px 12px;font:12px var(--mono);color:var(--sub)}
.ctx b{color:var(--text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{font:600 9.5px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;padding:4px 7px;border-radius:6px;background:var(--ctl);color:var(--sub);white-space:nowrap}
.pill.on{background:rgba(var(--a-rgb),.16);color:var(--ink)}
.tabs{display:flex;gap:2px;margin:0 12px 10px;padding:3px;border-radius:12px;background:var(--ctl)}
.tabs button{flex:1;min-width:0;border:0;background:none;padding:7px 4px;border-radius:9px;font-size:12.5px;font-weight:500;color:var(--sub)}
.tabs button.on{background:var(--field-hi);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.12)}
.card{margin:0 12px 8px;padding:12px 14px;border-radius:14px;background:rgba(var(--a-rgb),.09);border:1px solid rgba(var(--a-rgb),.22)}
.sec{padding:13px 16px;border-top:1px solid var(--line)}
.card+.sec{border-top:0}
.label{display:flex;align-items:center;gap:7px;font:600 10.5px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--ink);margin-bottom:10px}
.label::before{content:"";width:5px;height:5px;transform:rotate(45deg);background:var(--ink);box-shadow:0 0 6px rgba(var(--a-rgb),.9)}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px}
.row+.row,.row+.fold,.fold+.row{margin-top:10px}
.tx{min-width:0}
.t{font-weight:500}
.d,.cnt{font-size:11.5px;color:var(--sub);margin-top:1px}
.cnt{color:var(--ink)}
.off .t,.off .d{opacity:.5}
.sw{flex:none;position:relative;width:40px;height:24px;border:0;border-radius:12px;background:var(--sw-off);transition:background .18s;padding:0}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s cubic-bezier(.3,.7,.3,1)}
.sw[aria-checked=true]{background:var(--a);box-shadow:0 0 12px -2px rgba(var(--a-rgb),.7)}
.sw[aria-checked=true]::after{transform:translateX(16px)}
.seg{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);padding:2px;border-radius:10px;background:var(--ctl);flex:none}
.seg.wide{grid-auto-flow:row;grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));margin-top:8px}
.seg button{border:0;background:none;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:500;color:var(--sub);transition:background .15s,color .15s}
.seg button.on{background:var(--a);color:var(--on);box-shadow:0 1px 4px rgba(0,0,0,.14),0 0 14px -4px rgba(var(--a-rgb),.8)}
.pick{flex:none;display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px 0 10px;border:0;border-radius:13px;background:var(--ctl);font-size:12px;font-weight:500}
.pick[aria-expanded=true] svg{transform:rotate(180deg)}
.slide{display:flex;align-items:center;gap:8px;margin-top:8px}
.slide input[type=range]{flex:1;accent-color:var(--a)}
.num{width:58px;height:28px;padding:0 6px;border-radius:8px;border:1px solid var(--line);background:var(--field);font:12px var(--mono);text-align:right;color:var(--text)}
.sw:focus-visible,.seg button:focus-visible,.pick:focus-visible,.tabs button:focus-visible,.mode:focus-visible,.x:focus-visible{outline:2px solid var(--a);outline-offset:2px}
.foot{flex:none;padding:10px 16px 12px;border-top:1px solid var(--line);font-size:11px;color:var(--sub);text-align:center}
@media (max-width:600px){
  .panel{top:auto;right:0;left:0;bottom:0;width:100%;max-width:none;max-height:86vh;max-height:86dvh;border-radius:22px 22px 0 0;border-bottom:0;
    padding-bottom:env(safe-area-inset-bottom);animation:up .22s cubic-bezier(.2,.8,.2,1)}
  .grab{display:block;width:38px;height:5px;border-radius:3px;background:var(--sw-off);margin:8px auto 0}
  .head{padding-top:10px}
  .row{min-height:36px}
  .x{width:36px;height:36px}
  .sw{width:46px;height:28px;border-radius:14px}.sw::after{width:24px;height:24px}.sw[aria-checked=true]::after{transform:translateX(18px)}
  @keyframes up{from{transform:translateY(30px);opacity:0}}
}
`;

    const ui = {
        host: null, root: null, panel: null, tab: 0, open_: new Set(),

        toggle() { this.host ? this.close() : this.open(); },
        open() {
            if (this.host) return;
            this.host = document.createElement(APP.slug + '-panel');
            this.root = this.host.attachShadow({ mode: 'closed' });
            this.root.append(h('style', { text: CSS }));
            this.panel = h('div', { class: 'panel', role: 'dialog', 'aria-label': APP.name });
            this.root.append(this.panel);
            // clicks and keys inside the panel never reach the site
            for (const t of ['click', 'mousedown', 'pointerdown', 'keydown', 'keyup', 'keypress', 'wheel', 'touchstart'])
                this.host.addEventListener(t, e => { e.stopPropagation(); if (t === 'keydown' && e.key === 'Escape') this.close(); });
            this.esc = e => { if (e.key === 'Escape') this.close(); };
            document.addEventListener('keydown', this.esc, true);
            document.documentElement.append(this.host);
            this.render();
        },
        close() {
            if (!this.host) return;
            document.removeEventListener('keydown', this.esc, true);
            this.host.remove(); this.host = this.root = this.panel = null;
        },
        render() {
            if (!this.panel) return;
            const s = S.settings, scroll = this.panel.querySelector('.body')?.scrollTop || 0;
            this.panel.dataset.theme = isDark() ? 'dark' : 'light';
            const tile = h('div', { class: 'logo' }, h('span', { text: APP.name[0] }), h('img', { class: 'logo-img', src: ICON_SRC, alt: '', onerror: e => e.target.remove() }));
            const mode = h('button', { class: 'mode', role: 'switch', 'aria-checked': String(isDark()), 'aria-label': 'Dark mode', title: 'Light or dark',
                onclick: () => save({ appearance: isDark() ? 'light' : 'dark' }) },
                h('span', { class: 'mi sun' }, icon(ICONS.sun, 13)), h('span', { class: 'mi moon' }, icon(ICONS.moon, 12)), h('span', { class: 'knob' }));
            const top = h('div', { class: 'top' },
                h('div', { class: 'grab' }),
                h('div', { class: 'head' }, tile, h('div', { class: 'nm' }, h('div', { class: 'title', text: APP.name }), h('div', { class: 'tag', text: APP.tagline })),
                    mode, h('button', { class: 'x', 'aria-label': 'Close', onclick: () => this.close() }, icon(ICONS.close, 11, 2.4))),
                h('div', { class: 'ctx' }, h('b', { text: HOST || 'this page' }), h('span', { class: 'pill' + (s.enabled ? ' on' : ''), text: FEATURES.status(s) })),
                APP.tabs.length ? h('div', { class: 'tabs', role: 'tablist' }, APP.tabs.map((t, i) =>
                    h('button', { class: i === this.tab ? 'on' : null, role: 'tab', 'aria-selected': String(i === this.tab), text: t, onclick: () => { this.tab = i; this.render(); } }))) : null);
            const body = h('div', { class: 'body' }, this.page());
            const foot = h('div', { class: 'foot', text: `Open from __LAUNCHER__ · v${VERSION} · every tab updates live` });
            this.panel.replaceChildren(top, body, foot);
            body.scrollTop = scroll;
        },
        // The tab holding the script's own settings: the last tab, or the only page.
        own() { return APP.tabs.length ? this.tab === APP.tabs.length - 1 : true; },
        page() {
            const s = S.settings, out = [], tabName = APP.tabs[this.tab];
            if (APP.master && this.tab === 0) out.push(h('div', { class: 'card' }, h('div', { class: 'row' },
                h('div', { class: 'tx' }, h('div', { class: 't', text: APP.name }),
                    h('div', { class: 'd', text: s.enabled ? 'Everything is on. Turn off to stop every feature at once.' : 'Everything is off. Your settings are kept.' })),
                toggle(s.enabled, () => save({ enabled: !s.enabled }), 'Turn ' + APP.name + ' on or off'))));
            for (const sec of APP.sections) {
                if (APP.tabs.length && sec.tab !== tabName) continue;
                out.push(h('div', { class: 'sec' }, h('div', { class: 'label', text: sec.title }), sec.rows.map(r => this.control(r))));
            }
            if (this.own()) {
                out.push(h('div', { class: 'sec' }, h('div', { class: 'label', text: 'Appearance' }),
                    this.row('Match my device', 'Light or dark, following your device. The switch at the top picks one instead.',
                        toggle(s.appearance === 'auto', () => save({ appearance: s.appearance === 'auto' ? (isDark() ? 'dark' : 'light') : 'auto' }), 'Match my device'))));
                out.push(h('div', { class: 'sec' }, h('div', { class: 'label', text: 'Troubleshooting' }),
                    this.row('Log to the console', 'Lines start with [' + APP.slug + ']', toggle(s.log, () => save({ log: !s.log }), 'Log to the console'))));
            }
            return out;
        },
        row(title, desc, control, off) {
            return h('div', { class: 'row' + (off ? ' off' : '') }, h('div', { class: 'tx' }, h('div', { class: 't', text: title }), desc ? h('div', { class: 'd', text: desc }) : null), control);
        },
        control(r) {
            const s = S.settings, off = APP.master && !s.enabled;
            if (r.type === 'toggle') {
                const row = this.row(r.title, r.desc, toggle(s[r.key], () => save({ [r.key]: !s[r.key] }), r.title), off);
                for (const c of APP.counters) if (c.row === r.key) COUNTS.line(row, c.key);
                return row;
            }
            if (r.type === 'choice') {
                const seg = (wide) => h('div', { class: 'seg' + (wide ? ' wide' : ''), role: 'radiogroup', 'aria-label': r.title, style: wide ? '--cols:' + (r.options.some(o => o[1].length > 9) ? 3 : 4) : null },
                    r.options.map(([v, label]) => h('button', { class: v === s[r.key] ? 'on' : null, role: 'radio', 'aria-checked': String(v === s[r.key]), text: label,
                        onclick: () => { this.open_.delete(r.key); save({ [r.key]: v }); } })));
                // 2–3 short options sit inline; longer sets fold into a pill that opens the buttons underneath
                if (r.options.length <= 3 && r.options.every(o => o[1].length <= 8)) return this.row(r.title, r.desc, seg(false), off);
                const open = this.open_.has(r.key), cur = r.options.find(o => o[0] === s[r.key]);
                const pick = h('button', { class: 'pick', 'aria-expanded': String(open), onclick: () => { open ? this.open_.delete(r.key) : this.open_.add(r.key); this.render(); } },
                    cur ? cur[1] : '', icon(ICONS.chev, 12));
                return h('div', { class: 'fold' }, this.row(r.title, r.desc, pick, off), open ? seg(true) : null);
            }
            if (r.type === 'slider') {
                const fmt = v => String(v);
                const num = h('input', { class: 'num', type: 'number', min: r.min, max: r.max, step: r.step, value: s[r.key], 'aria-label': r.title,
                    onchange: e => { const v = +e.target.value; if (isFinite(v)) save({ [r.key]: Math.min(r.max, Math.max(r.min, v)) }); } });
                const range = h('input', { type: 'range', min: r.min, max: r.max, step: r.step, value: s[r.key], 'aria-label': r.title,
                    oninput: e => { num.value = fmt(e.target.value); }, onchange: e => save({ [r.key]: +e.target.value }) });
                return h('div', { class: 'fold' }, this.row(r.title, (r.desc || '') + (r.unit ? ` (${r.unit})` : ''), null, off), h('div', { class: 'slide' }, range, num));
            }
            return null;
        },
    };

    /* ───────────────────────── start ───────────────────────── */

    GM_registerMenuCommand('Open __NAME__', () => ui.toggle());
__MASTER_MENU__    // settings changed in another tab
    GM_addValueChangeListener('settings', (k, o, n, remote) => { if (!remote) return; S.settings = loadSettings(); FEATURES.apply(S.settings); ui.render(); });
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => ui.render()); } catch {}
    log('v' + VERSION + ' on ' + HOST);
    FEATURES.start();
    FEATURES.apply(S.settings);
})();
