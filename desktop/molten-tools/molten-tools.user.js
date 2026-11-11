// ==UserScript==
// @name         Molten Tools
// @namespace    jigglypug
// @version      3.8.0
// @description  YouTube QOL tools for YouTube and YouTube Music: a molten-glass lava theme with profiles, automatic video quality, auto-dismiss for "Still watching?", a title bar and seek bar that match the album art, a default-account switcher, and a screenshot-safe mode that hides your account names. Click the orange lava button in the top bar for settings.
// @match        https://www.youtube.com/*
// @match        https://music.youtube.com/*
// @exclude      https://www.youtube.com/embed/*
// @exclude      https://www.youtube.com/live_chat*
// @noframes
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      i.ytimg.com
// @connect      lh3.googleusercontent.com
// @connect      yt3.googleusercontent.com
// @connect      yt3.ggpht.com
// @author       JigglyPug
// @license      MIT
// @icon         https://raw.githubusercontent.com/JigglyPug/glassware/main/assets/icons/molten-tools.png?v=2
// @homepageURL  https://jigglypug.github.io/glassware/desktop/molten-tools/
// @supportURL   https://github.com/JigglyPug/glassware/issues
// @updateURL    https://raw.githubusercontent.com/JigglyPug/glassware/main/desktop/molten-tools/molten-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/JigglyPug/glassware/main/desktop/molten-tools/molten-tools.user.js
// ==/UserScript==

/* Molten Tools: YouTube QOL tools
     - Lava Lamp: a molten-glass theme for YouTube Music and a live-video lava background for YouTube,
       with Calm / User / Crazy profiles and every setting editable live
     - Video quality: picks your preferred resolution automatically
       (based on "Youtube HD" by adisib, rewritten so its settings live in the panel)
     - Auto-dismiss: answers "Still watching?" / "Continue watching?" so playback never stops
     - Art colors: tints the installed-app (PWA) title bar and the seek bar to match the album art or video
     - Default account: switches to a chosen channel once per launch, then respects manual switches
   Click the orange lava button in the top bar to open the settings.
   Lava, quality and general settings are shared by YouTube and YouTube Music (open tabs update live).
   The default account and the lava on/off switch are per site.
   If you use separate quality, lava-theme or PWA-color scripts, turn them off so they don't conflict. */

(function boot() {
  'use strict';
  if (window.top !== window.self) return;
  // Some managers inject before <html> exists; wait for it so styles and attributes have somewhere to go.
  if (!document.documentElement) {
    const mo = new MutationObserver(() => {
      if (document.documentElement) { mo.disconnect(); boot(); }
    });
    mo.observe(document, { childList: true });
    return;
  }

  // =====================================================================
  //  Shared helpers
  // =====================================================================
  const HOST = location.hostname;
  const IS_MUSIC = HOST === 'music.youtube.com';
  const IS_YT = !IS_MUSIC;
  const OTHER_HOST = IS_MUSIC ? 'www.youtube.com' : 'music.youtube.com';
  const SITE_NAME = IS_MUSIC ? 'YouTube Music' : 'YouTube';
  // With @grant set the script is sandboxed; the page's own globals (ytcfg, player API) live on unsafeWindow.
  const pageWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  function gmGet(k, d) {
    try {
      if (typeof GM_getValue === 'function') {
        const v = GM_getValue(k);
        return v === undefined || v === null ? d : v;
      }
    } catch (e) { /* ignore */ }
    return d;
  }
  function gmSet(k, v) {
    try { if (typeof GM_setValue === 'function') GM_setValue(k, v); } catch (e) { /* ignore */ }
  }
  // Calls fn(newValue) when another tab (e.g. YouTube Music while you're on YouTube) changes this key.
  function gmWatch(k, fn) {
    try {
      if (typeof GM_addValueChangeListener === 'function') {
        GM_addValueChangeListener(k, (name, oldV, newV, remote) => { if (remote) fn(newV); });
      }
    } catch (e) { /* ignore */ }
  }

  // Running totals of what the script did for you, shown under that feature's switch ("Skipped 37
  // app prompts so far"). Kept per device in Tampermonkey since install, shared by every tab, and
  // saved a moment after counting so a burst (a long thread opening replies) is one write.
  const COUNTS = (() => {
    const KEY = 'counts';
    const WORDS = {
      dismissed: ['Answered ', ' prompt', ' so far'],
      appPrompts: ['Skipped ', ' app prompt', ' so far'],
      replies: ['Opened ', ' reply thread', ' so far'],
    };
    let add = {}, timer = 0;
    const get = k => ((gmGet(KEY, {}) || {})[k] || 0) + (add[k] || 0);
    const text = k => { const n = get(k), w = WORDS[k]; return w[0] + n.toLocaleString() + w[1] + (n === 1 ? '' : 's') + w[2]; };
    function paint() {
      for (const s of document.querySelectorAll('#ytt-panel [data-ytt-count]')) {
        const k = s.getAttribute('data-ytt-count');
        s.textContent = text(k); s.hidden = !get(k);
      }
    }
    function flush() {
      timer = 0;
      if (!Object.keys(add).length) return;
      const c = Object.assign({}, gmGet(KEY, {}));
      for (const k in add) c[k] = (c[k] || 0) + add[k];
      add = {};
      gmSet(KEY, c);
    }
    function bump(k) { add[k] = (add[k] || 0) + 1; if (!timer) timer = setTimeout(flush, 2000); paint(); }
    // the count line for a feature's row (hidden until there's something to count)
    function line(row, k) {
      const box = row && row.querySelector('.ytt-label');
      if (!box) return;
      const s = document.createElement('span');
      s.className = 'ytt-hint ytt-count';
      s.setAttribute('data-ytt-count', k);
      box.append(s);
      s.textContent = text(k); s.hidden = !get(k);
    }
    addEventListener('pagehide', flush);
    gmWatch(KEY, paint);
    return { bump, line };
  })();
  // Light or dark glass for the panel. 'appearance' is auto (match the device), light or dark,
  // kept per device and shared by every tab.
  const LOOK = {
    get() { const v = gmGet('appearance', 'auto'); return v === 'light' || v === 'dark' ? v : 'auto'; },
    dark() { const a = this.get(); return a === 'dark' || (a === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); },
    apply() {
      const p = document.getElementById('ytt-panel');
      if (!p) return;
      p.setAttribute('data-theme', this.dark() ? 'dark' : 'light');
      const m = p.querySelector('.ytt-mode');
      if (m) m.setAttribute('aria-checked', String(this.dark()));
      // "Match my device" follows along when the switch up top (or another tab) picks a theme
      for (const i of p.querySelectorAll('input[data-gw-match]')) i.checked = this.get() === 'auto';
    },
    // the sun/moon switch for the panel header
    toggle(onChange) {
      const NS = 'http://www.w3.org/2000/svg';
      const ico = (cls, paths) => {
        const s = document.createElementNS(NS, 'svg');
        s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
        s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('class', cls);
        for (const d of paths) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.append(p); }
        return s;
      };
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ytt-mode'; b.title = 'Light or dark';
      b.setAttribute('role', 'switch'); b.setAttribute('aria-label', 'Dark mode');
      const knob = document.createElement('span'); knob.className = 'ytt-knob';
      b.append(knob,
        ico('ytt-sun', ['M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7', 'M12 2.5v2', 'M12 19.5v2', 'M2.5 12h2', 'M19.5 12h2', 'M5.3 5.3l1.4 1.4', 'M17.3 17.3l1.4 1.4', 'M5.3 18.7l1.4-1.4', 'M17.3 6.7l1.4-1.4']),
        ico('ytt-moon', ['M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6Z']));
      b.addEventListener('click', () => { gmSet('appearance', this.dark() ? 'light' : 'dark'); this.apply(); onChange && onChange(); });
      return b;
    },
  };
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => LOOK.apply()); } catch (e) {}
  gmWatch('appearance', () => LOOK.apply());
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function lsJSON(k) { try { return JSON.parse(lsGet(k) || 'null'); } catch (e) { return null; } }

  /* Master switch. Off = every feature stops and every style is switched off; only the orange
     button and its panel stay, so you can turn it back on. Shared by both sites. */
  let ENABLED = gmGet('enabled', true) !== false;
  const STYLES = []; // every feature stylesheet, so the master switch can turn them all off at once
  function track(el) {
    if (el && el.nodeType === 1) {
      STYLES.push(el);
      if (!ENABLED) el.media = 'not all';
    }
    return el;
  }
  function setStylesEnabled(on) {
    for (const el of STYLES) el.media = on ? '' : 'not all';
  }

  function addStyle(css) {
    if (typeof GM_addStyle === 'function' && document.documentElement) {
      try {
        const r = GM_addStyle(css);
        if (r) return track(r);
      } catch (e) { /* fall through */ }
    }
    return makeStyle(css);
  }
  // Always returns a real <style> element (for styles that get rewritten live).
  function makeStyle(css) {
    return track(rawStyle(css));
  }
  // Styles for the button and panel themselves: never switched off.
  function coreStyle(css) { return rawStyle(css); }
  function rawStyle(css) {
    const s = document.createElement('style');
    s.textContent = css;
    const root = document.head || document.documentElement;
    if (root) root.appendChild(s);
    else {
      // extremely early injection: <html> doesn't exist yet
      const mo = new MutationObserver(() => {
        const r = document.head || document.documentElement;
        if (r) { mo.disconnect(); r.appendChild(s); }
      });
      mo.observe(document, { childList: true, subtree: true });
    }
    return s;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, timeout = 10000, step = 200) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let v = null;
      try { v = fn(); } catch (e) { /* keep waiting */ }
      if (v) return v;
      await sleep(step);
    }
    return null;
  };
  const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const onReady = fn => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };

  // =====================================================================
  //  1. ACCOUNT SWITCHER (unchanged behaviour from v2)
  // =====================================================================
  const ACCT = (() => {
    const STORE = 'acctSwitch.config'; // per site (localStorage is per origin); same key as v2, so your saved defaults carry over
    const MODE = IS_MUSIC ? 'ui' : 'picker'; // YouTube uses /channel_switcher; YT Music is driven through its menu
    // Off unless you turn it on, and never with account names, channel names or ids in it: a console
    // capture you share shouldn't name your accounts (Screenshot safe hides them on the page too).
    const debugOn = () => gmGet('acctDebug', false);
    const log = (...a) => debugOn() && console.log('[acct-switch]', ...a);

    const loadCfg = () => lsJSON(STORE);
    const saveCfg = c => lsSet(STORE, JSON.stringify(c));
    const clearCfg = () => lsDel(STORE);
    const currentId = () => String(pageWin.ytcfg?.get?.('DELEGATED_SESSION_ID') ?? '');

    const K = k => 'acctSwitch.' + k;
    const ss = {
      get: k => { try { return sessionStorage.getItem(K(k)); } catch (e) { return null; } },
      set: (k, v) => { try { sessionStorage.setItem(K(k), v); } catch (e) { /* ignore */ } },
      del: k => { try { sessionStorage.removeItem(K(k)); } catch (e) { /* ignore */ } },
    };

    const cfg = loadCfg();

    // ---------- YouTube: /channel_switcher page ----------
    async function handleSwitcher() {
      if (!ss.get('pending') || !cfg) return; // you opened it yourself; leave it alone
      const want = norm(cfg.name);
      const el = await waitFor(() => {
        const items = document.querySelectorAll('ytd-account-item-renderer, a[href*="pageid"], a[href*="signin"]');
        for (const it of items) {
          const label = norm(it.querySelector('#channel-title, #account-name')?.textContent || it.textContent);
          if (label === want || label.startsWith(want)) return it;
        }
        return null;
      });
      if (!el) {
        log('Could not find the saved default account on the picker; giving up until you reload.');
        ss.del('pending');
        ss.set('override', '1');   // or the page we go back to would send us straight here again
        location.href = ss.get('next') || '/';
        return;
      }
      log('Clicking the saved default account');
      (el.matches('a') ? el : el.querySelector('a, tp-yt-paper-icon-item, #content') || el).click();
    }

    // Cover the picker page while we click through it, so it doesn't flash on screen.
    function hidePage() {
      const st = document.createElement('style');
      st.textContent =
        'html{visibility:hidden!important;background:#fff!important}' +
        '@media (prefers-color-scheme:dark){html{background:#0f0f0f!important}}';
      document.documentElement.append(st);
      setTimeout(() => st.remove(), 15000); // safety net: never leave the page blank
    }

    // ---------- YT Music: avatar > Switch account > pick ----------
    const CLICKABLE =
      'a, button, tp-yt-paper-item, tp-yt-paper-icon-item, tp-yt-paper-icon-button, [role="menuitem"], ' +
      'ytd-compact-link-renderer, ytmusic-menu-navigation-item-renderer, ytd-account-item-renderer';

    function realClick(el) {
      const r = el.getBoundingClientRect();
      const o = {
        bubbles: true, cancelable: true, composed: true, button: 0,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
      };
      for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        const Ev = t.startsWith('pointer') ? PointerEvent : MouseEvent;
        el.dispatchEvent(new Ev(t, o));
      }
    }
    const clickIt = el => realClick(el.closest(CLICKABLE) || el);

    function allElements() {
      const out = [];
      const stack = [document];
      while (stack.length) {
        const root = stack.pop();
        for (const e of root.querySelectorAll('*')) {
          out.push(e);
          if (e.shadowRoot) stack.push(e.shadowRoot);
        }
      }
      return out;
    }
    const findText = test =>
      allElements()
        .filter(e => {
          const t = norm(e.textContent);
          return t && t.length < 120 && test(t);
        })
        .sort((x, y) => x.textContent.length - y.textContent.length)[0] || null;

    const menuIsOpen = () =>
      findText(t => t === 'sign out' || t === 'switch account' || t === 'google account');

    function dumpState() {
      const btn = document.querySelector('ytmusic-settings-button');
      log('ytmusic-settings-button:', btn ? 'found' : '(not found)');
      const hits = allElements().filter(e => {
        const t = norm(e.textContent);
        return t && t.length < 60 && /sign out|switch account|google account|your channel|settings/.test(t);
      });
      log('Menu-ish elements:', hits.slice(0, 15).map(e => e.tagName.toLowerCase()));
    }

    async function openMenu() {
      const candidates = [
        'ytmusic-settings-button tp-yt-paper-icon-button',
        'ytmusic-settings-button #button',
        'ytmusic-settings-button button',
        'ytmusic-settings-button img',
        'ytmusic-settings-button',
        '#avatar-btn',
      ];
      for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (!el) continue;
        log('Trying avatar candidate:', sel);
        clickIt(el);
        if (await waitFor(menuIsOpen, 1500, 150)) return true;
      }
      return false;
    }

    async function switchViaUI() {
      const want = norm(cfg.name);
      const fail = why => {
        log('UI switch failed: ' + why);
        dumpState();
        ss.del('pending');
        ss.del('next');
        document.body && document.body.click();
      };

      await waitFor(() => document.querySelector('ytmusic-settings-button'), 10000);
      if (!(await openMenu())) return fail('avatar menu never opened');

      const sw = await waitFor(() => findText(t => t === 'switch account'), 6000);
      if (!sw) return fail('"Switch account" item not found');
      log('Clicking Switch account');
      clickIt(sw);

      const target = await waitFor(() => findText(t => t.startsWith(want) && /subscriber/.test(t)), 6000);
      if (!target) return fail('the saved default account is not in the list');
      log('Clicking the saved default account');
      clickIt(target);
    }

    // ---------- Normal pages ----------
    async function main() {
      await waitFor(() => pageWin.ytcfg?.get && pageWin.ytcfg.get('INNERTUBE_API_KEY'));
      const id = currentId();
      log('Signed in as ' + (id ? 'a brand or secondary channel' : 'the main channel'));

      const last = ss.get('last');
      ss.set('last', id);

      if (!cfg || !cfg.enabled) {
        log('No default set for this app. Click the lava button > Account tab to set one.');
        return;
      }

      // Back from our own switch attempt: one try only, never retry.
      if (ss.get('pending')) {
        ss.del('pending');
        ss.del('next');
        log('Switch attempt finished. Not retrying.');
        return;
      }

      // Identity changed without us doing it => manual switch. Back off.
      if (last !== null && last !== id) {
        ss.set('override', '1');
        log('Manual switch detected. Leaving it alone until refresh.');
        return;
      }

      // A real refresh re-arms the default.
      const navType = performance.getEntriesByType('navigation')[0]?.type;
      if (navType === 'reload') ss.del('override');
      if (ss.get('override')) return;

      if (id === cfg.id) return;

      log('Switching to the saved default account');
      ss.set('pending', '1');
      ss.set('next', location.href);
      if (MODE === 'ui') {
        await switchViaUI();
        return;
      }
      location.href =
        location.origin + '/channel_switcher?next=' + encodeURIComponent(location.href) + '&feature=settings';
    }

    // Returns true when this page is the account picker (nothing else should run on it).
    function start() {
      if (location.pathname === '/channel_switcher') {
        if (ss.get('pending') && cfg) hidePage();
        handleSwitcher();
        return true;
      }
      main();
      return false;
    }

    return { loadCfg, saveCfg, clearCfg, currentId, start, debugOn, setDebug: v => gmSet('acctDebug', !!v) };
  })();

  // =====================================================================
  //  0b. SCREENSHOT SAFE: hide your own account and channel names everywhere
  // =====================================================================
  /* Names come from the account list YouTube itself serves to its "Switch account" menu
     (/getAccountSwitcherEndpoint), plus anything seen in the account picker or the avatar menu,
     plus names you add yourself. They're shared by YouTube and YouTube Music.
     Text is changed in place (never swapped for new elements), so YouTube's own updates keep working;
     when YouTube rewrites a line, the line is simply hidden again. */
  const PRIV_DEFAULTS = { on: false, mode: 'blur', placeholder: 'User', firstNames: true, avatars: false, extra: '', found: [] };
  const priv = Object.assign({}, PRIV_DEFAULTS, gmGet('privacy', {}) || {});
  const PRIV = (() => {
    const SKIP = 'script,style,noscript,textarea,input,#ytt-panel,#ytt-toggle';
    const ATTRS = ['title', 'aria-label', 'alt', 'placeholder'];
    const orig = new WeakMap();      // text node -> its real text
    const wrote = new WeakMap();     // text node -> what we put there
    const attrOrig = new WeakMap();  // element -> { attr: real value }
    const blurred = new Set();       // elements we blurred
    const textNodes = new Set();     // nodes we changed (as WeakRefs would be nicer; pruned on restore)
    let re = null, firstRe = null, pending = new Set(), frame = 0, style = null, titleOrig = '', titleWrote = '';
    const active = () => ENABLED && priv.on;
    const glog = (...a) => { try { if (gmGet('lava', {})?.shared?.debug) console.log('[molten]', ...a); } catch (e) { /* ignore */ } };
    const save = () => gmSet('privacy', JSON.parse(JSON.stringify(priv)));

    // ---------- the names ----------
    function names() {
      const extra = String(priv.extra || '').split(/[,\n]/).map(s => s.trim());
      const set = new Set();
      for (const n of [...(priv.found || []), ...extra]) {
        if (!n || n.length < 2) continue;
        set.add(n);
        if (n.startsWith('@') && n.length > 3) set.add(n.slice(1));   // @handle and the bare handle
      }
      return [...set].sort((a, b) => b.length - a.length);
    }
    function firsts() {
      const out = new Set();
      for (const n of names()) {
        if (/@/.test(n) || !/\s/.test(n)) continue;
        const f = n.split(/\s+/)[0];
        if (f.length >= 3 && /^[\p{L}'-]+$/u.test(f)) out.add(f);
      }
      return [...out];
    }
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    function build() {
      const list = names();
      re = list.length ? new RegExp(list.map(esc).join('|'), 'giu') : null;
      const f = priv.firstNames ? firsts() : [];
      firstRe = f.length ? new RegExp('(?<![\\p{L}\\p{N}])(' + f.map(esc).join('|') + ')(?![\\p{L}\\p{N}])', 'giu') : null;
    }
    const hasName = s => !!s && ((re && (re.lastIndex = 0, re.test(s))) || (firstRe && (firstRe.lastIndex = 0, firstRe.test(s))));
    function replaced(s) {
      const p = priv.placeholder || 'User';
      let out = s;
      if (re) out = out.replace(re, m => m.includes('@') && /^@/.test(m) ? '@' + p.toLowerCase().replace(/\s+/g, '') :
        /\S+@\S+\.\S+/.test(m) ? 'hidden@email' : p);
      if (firstRe) out = out.replace(firstRe, p);
      return out;
    }

    function learn(list, why) {
      const before = (priv.found || []).join('\n');
      const set = new Set(priv.found || []);
      for (let n of list) {
        n = String(n || '').replace(/\s+/g, ' ').trim();
        if (n.length >= 2 && n.length <= 80 && !/^(switch account|sign out|google account|your channel)$/i.test(n)) set.add(n);
      }
      priv.found = [...set];
      if (priv.found.join('\n') !== before) {
        save();
        build();
        glog('screenshot safe: names found (' + why + '):', priv.found.length);
        if (active()) rescan();
        try { UI.refresh(); } catch (e) { /* panel not built on this page */ }
      }
    }

    // Ask YouTube for the account list (same request its own "Switch account" menu makes).
    async function fetchNames() {
      try {
        const r = await fetch('/getAccountSwitcherEndpoint', { credentials: 'include' });
        if (!r.ok) return false;
        const txt = await r.text();
        const data = JSON.parse(txt.slice(txt.indexOf('{')));
        const out = [];
        const walk = (o, depth) => {
          if (!o || typeof o !== 'object' || depth > 40) return;
          if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
          for (const k of ['accountName', 'channelHandle', 'accountByline']) {
            const v = o[k];
            const t = v && (v.simpleText || (v.runs && v.runs.map(x => x.text).join('')));
            if (t) out.push(t);
          }
          if (o.googleAccountHeaderRenderer) {
            const h = o.googleAccountHeaderRenderer;
            for (const k of ['name', 'email']) { const v = h[k]; const t = v && (v.simpleText || (v.runs && v.runs.map(x => x.text).join(''))); if (t) out.push(t); }
          }
          for (const k in o) walk(o[k], depth + 1);
        };
        walk(data, 0);
        // bylines can be "email" or "123 subscribers": keep only what looks like a name/handle/email
        const keep = out.filter(t => !/subscriber|^\d/i.test(t));
        if (keep.length) learn(keep, 'account list');
        return keep.length > 0;
      } catch (e) {
        glog('screenshot safe: account list not available', e && e.message);
        return false;
      }
    }
    // Names visible in the account picker / avatar menu when you open it
    // only inside the account menu / picker, never other people's channel pages
    const MENU = ['ytd-active-account-header-renderer', 'ytmusic-active-account-header-renderer', 'ytd-account-item-renderer',
      'ytd-google-account-header-renderer', 'ytd-channel-switcher-page-renderer'];
    const HARVEST = MENU.map(m => ['#account-name', '#channel-handle', '#email', '#channel-title', '#account-byline']
      .map(i => m + ' ' + i).join(', ')).join(', ');
    function harvest(root) {
      if (!root.querySelectorAll) return;
      const out = [];
      const pick = e => {
        const t = orig.get(e.firstChild) || e.textContent;
        if (t && t.trim() && !/subscriber|^\s*\d|no channel/i.test(t)) out.push(t.trim());
      };
      if (root.matches && root.matches(HARVEST)) pick(root);
      for (const e of root.querySelectorAll(HARVEST)) pick(e);
      if (out.length) learn(out, 'account menu');
    }

    // ---------- hiding ----------
    function skip(el) { return !el || (el.closest && el.closest(SKIP)); }
    function textNode(n) {
      const p = n.parentElement;
      if (skip(p)) return;
      const cur = n.data;
      if (cur === wrote.get(n)) return;            // our own text
      if (!hasName(cur)) {
        if (orig.has(n)) { orig.delete(n); wrote.delete(n); }
        // a reused row (queue, lists) that no longer shows your name: unblur it
        if (p && p.hasAttribute('data-molten-private') && !hasName(p.textContent)) { p.removeAttribute('data-molten-private'); blurred.delete(p); }
        return;
      }
      if (priv.mode === 'blur' && p && p.textContent.length <= 90 && p.childElementCount <= 3) {
        p.setAttribute('data-molten-private', '');
        blurred.add(p);
        return;
      }
      orig.set(n, cur);
      const v = replaced(cur);
      wrote.set(n, v);
      textNodes.add(n);
      n.data = v;
    }
    function attrs(el) {
      if (skip(el)) return;
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (!v) continue;
        const o = attrOrig.get(el) || {};
        if (o['w:' + a] === v) continue;
        if (!hasName(v)) continue;
        o[a] = v;
        const nv = replaced(v);
        o['w:' + a] = nv;
        attrOrig.set(el, o);
        el.setAttribute(a, nv);
      }
    }
    function scan(root) {
      if (!root) return;
      if (root.nodeType === 3) return textNode(root);
      if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
      if (root.nodeType === 1) {
        if (skip(root)) return;
        attrs(root);
        if (root.hasAttribute('data-molten-private') && !hasName(root.textContent)) { root.removeAttribute('data-molten-private'); blurred.delete(root); }
      }
      harvest(root);
      if (!re && !firstRe) return;
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) textNode(n);
      if (root.querySelectorAll) for (const el of root.querySelectorAll('[title],[aria-label],[alt],[placeholder]')) attrs(el);
    }
    function doTitle() {
      if (!active() || !document.title) return;
      if (document.title === titleWrote) return;
      if (!hasName(document.title)) return;
      titleOrig = document.title;
      titleWrote = replaced(document.title);
      document.title = titleWrote;
    }
    function flush() {
      frame = 0;
      if (!active()) { pending.clear(); pendingAttrs.clear(); return; }
      const list = [...pending];
      pending.clear();
      for (const n of list) if (n.isConnected) scan(n);
      for (const el of pendingAttrs) if (el.isConnected) attrs(el);
      pendingAttrs.clear();
      doTitle();
    }
    const pendingAttrs = new Set();
    const tick = () => { if (!frame) frame = requestAnimationFrame(flush); };
    const queue = n => { pending.add(n); tick(); };
    const mo = new MutationObserver(ms => {
      if (!active()) return;
      for (const m of ms) {
        if (m.type === 'characterData') queue(m.target);
        else if (m.type === 'attributes') { pendingAttrs.add(m.target); tick(); }
        else {
          for (const n of m.addedNodes) queue(n);
          // a blurred line whose text was swapped out
          if (m.target.nodeType === 1 && m.target.hasAttribute('data-molten-private')) queue(m.target);
        }
      }
    });
    function rescan() { if (document.documentElement) { queue(document.documentElement); } }

    function restore() {
      for (const n of textNodes) if (n.isConnected && n.data === wrote.get(n)) n.data = orig.get(n);
      textNodes.clear();
      for (const e of blurred) e.removeAttribute('data-molten-private');
      blurred.clear();
      for (const el of document.querySelectorAll('[title],[aria-label],[alt],[placeholder]')) {
        const o = attrOrig.get(el);
        if (!o) continue;
        for (const a of ATTRS) if (o[a] !== undefined && el.getAttribute(a) === o['w:' + a]) el.setAttribute(a, o[a]);
        attrOrig.delete(el);
      }
      if (titleWrote && document.title === titleWrote) document.title = titleOrig;
      titleWrote = '';
    }
    function css() {
      let c = '[data-molten-private]{filter:blur(6px)!important;user-select:none}';
      if (priv.avatars) c +=
        '#avatar-btn img,ytd-topbar-menu-button-renderer img,ytmusic-settings-button img,ytd-active-account-header-renderer img,' +
        'ytmusic-active-account-header-renderer img,ytd-account-item-renderer img,#author-thumbnail img,ytmusic-settings-button yt-img-shadow' +
        '{filter:blur(8px)!important}';
      return c;
    }
    function refresh() {
      build();
      if (!style) style = makeStyle('');
      style.textContent = active() ? css() : '';
      restore();
      mo.disconnect();
      if (active()) {
        mo.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
        rescan();
      }
    }
    function set(k, v) { priv[k] = v; save(); refresh(); }
    function start() {
      build();
      refresh();
      onReady(() => { fetchNames(); if (active()) rescan(); });
    }
    return {
      start, refresh, set, fetchNames,
      forget: () => { priv.found = []; save(); refresh(); },
      names, get: k => priv[k],
      load: v => { Object.assign(priv, PRIV_DEFAULTS, v || {}); refresh(); },
    };
  })();
  // another tab changed the Account tab's settings: an open panel here shows them too
  // (the panel may not exist yet, or ever on this page: then there's nothing to refresh)
  const uiRefresh = () => { try { UI.refresh(); } catch (e) { /* no panel here */ } };
  gmWatch('privacy', v => { PRIV.load(v); uiRefresh(); });
  gmWatch('acctDebug', uiRefresh);
  addEventListener('storage', e => { if (e.key === 'acctSwitch.config') uiRefresh(); });
  PRIV.start();

  if (ENABLED && ACCT.start()) return;

  // =====================================================================
  //  2. VIDEO QUALITY (based on "Youtube HD" by adisib)
  // =====================================================================
  const HD_DEFAULTS = {
    changeResolution: true,       // set the quality automatically
    targetRes: 'highres',         // YouTube default; 'highres' = best available
    highFramerateTargetRes: '',   // YouTube 60 fps videos; '' = same as targetRes
    musicTargetRes: '',           // YouTube Music videos; '' = same as targetRes
    preferPremium: false,         // pick "1080p Premium" when offered (YouTube Premium only)
    flushBuffer: true,            // reload the buffer so the first second is already at the new quality (YouTube only)
    autoTheater: false,
    changePlayerSize: false,
    useCustomSize: false,
    customHeight: 600,
    removeBlackBars: false,
    allowCookies: false,
    setResolutionEarly: true,
    enableErrorScreenWorkaround: true,
    useAPI: true,
  };
  // One shared copy for both sites. Older versions saved per site; the YouTube copy wins when migrating.
  const hd = Object.assign({}, HD_DEFAULTS,
    gmGet('hd', null) || gmGet('hd:www.youtube.com', null) || gmGet('hd:' + HOST, {}));
  const saveHD = () => gmSet('hd', Object.assign({}, hd));
  gmWatch('hd', v => {
    Object.assign(hd, HD_DEFAULTS, v || {});
    HDM.applyRes();
    UI.refresh();
  });

  const HDM = (() => {
    const resolutions = ['highres', 'hd2880', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
    const heights = [4320, 2880, 2160, 1440, 1080, 720, 480, 360, 240, 144];
    const log = (...a) => lava.debug && console.log('[yt-hd]', ...a);

    let recentVideo = '';
    let foundHFR = false;
    let setHeight = 0;

    const unwrap = el => (el && el.wrappedJSObject) ? el.wrappedJSObject : el;
    function getPlayer() {
      const d = pageWin.document || document;
      return unwrap(d.getElementById('movie_player') || d.getElementsByClassName('html5-video-player')[0]);
    }
    function videoId(p) {
      try {
        const m = /(?:v=)([\w-]+)/.exec(p.getVideoUrl());
        return m ? m[1] : '';
      } catch (e) { return ''; }
    }

    // Opens the player's gear menu and clicks a quality entry (needed for "Premium" entries).
    async function pickFromMenu(p, label) {
      const gear = p.querySelector('.ytp-settings-button');
      if (!gear) return false;
      gear.click();
      const qItem = await waitFor(() => [...p.querySelectorAll('.ytp-menuitem')].find(m => /quality/i.test(m.textContent)), 1500, 50);
      if (!qItem) { gear.click(); return false; }
      qItem.click();
      const want = norm(label);
      const opt = await waitFor(() => [...p.querySelectorAll('.ytp-menuitem')].find(m => {
        const t = norm(m.textContent);
        return want.includes('premium') ? t.includes(want) : (t.startsWith(want) && !t.includes('premium'));
      }), 1500, 50);
      if (!opt) { gear.click(); return false; }
      opt.click();
      return true;
    }

    async function setResolution(p) {
      if (!ENABLED) return;
      const target = IS_MUSIC
        ? (hd.musicTargetRes || hd.targetRes)
        : ((hd.highFramerateTargetRes && foundHFR) ? hd.highFramerateTargetRes : hd.targetRes);
      const current = p.getPlaybackQuality();
      const levels = (typeof p.getAvailableQualityLevels === 'function' && p.getAvailableQualityLevels()) || [];

      // the target, or the next best quality this video actually has
      let idx = Math.max(resolutions.indexOf(target), 0);
      if (levels.length) {
        while (idx < resolutions.length - 1 && levels.indexOf(resolutions[idx]) === -1) idx++;
      }
      const chosen = resolutions[idx];
      log('available:', levels.join(', '), '| current:', current, '| chosen:', chosen);

      const qd = typeof p.getAvailableQualityData === 'function' ? [...(p.getAvailableQualityData() || [])] : [];
      const premium = hd.preferPremium
        ? qd.find(q => q.quality === chosen && q.qualityLabel && q.qualityLabel.includes('Premium') && q.isPlayable)
        : null;
      const useMenu = !hd.useAPI || !!premium;

      if (!useMenu && hd.flushBuffer && IS_YT && current !== chosen) {
        const id = videoId(p);
        if (id) p.loadVideoById(id, p.getCurrentTime(), chosen);
      }
      if (hd.useAPI) {
        if (typeof p.setPlaybackQualityRange === 'function') p.setPlaybackQualityRange(chosen);
        p.setPlaybackQuality(chosen);
        log('(API) quality set to', chosen);
      }
      if (useMenu && ENABLED) {
        const label = premium ? premium.qualityLabel : heights[idx] + 'p';
        const ok = await pickFromMenu(p, label);
        log('(menu) quality', ok ? 'set to' : 'NOT set to', label);
      }

      try {
        const stored = lsGet('yt-player-quality');
        if (!stored || stored.indexOf(hd.targetRes) === -1) {
          const tc = Date.now();
          lsSet('yt-player-quality', JSON.stringify({ data: hd.targetRes, expiration: tc + 2592000000, creation: tc }));
        }
      } catch (e) { /* ignore */ }
    }

    function setResOnReady(p, tries = 0) {
      if (!ENABLED || !hd.changeResolution) return;
      if (hd.useAPI && (p.getPlaybackQuality === undefined || p.getPlaybackQuality() === 'unknown')) {
        if (tries < 150) setTimeout(setResOnReady, 100, p, tries + 1);
        return;
      }
      const cur = videoId(p);
      if (cur !== recentVideo) foundHFR = false; // a new video: don't reuse the last one's 60fps answer
      let framerateUpdate = false;
      if (hd.highFramerateTargetRes) {
        try {
          const features = p.getVideoData().video_quality_features;
          if (features) {
            const isHFR = features.includes('hfr');
            framerateUpdate = isHFR && !foundHFR;
            foundHFR = isHFR;
          }
        } catch (e) { /* ignore */ }
      }
      if (cur !== recentVideo || framerateUpdate) {
        recentVideo = cur;
        setResolution(p).catch(e => log('quality error:', e && e.message));
      }
    }

    function setTheaterMode() {
      if (!IS_YT || location.href.indexOf('/watch') === -1) return;
      const pm = unwrap((pageWin.document || document).getElementsByTagName('ytd-watch-flexy')[0]);
      if (!pm || pm.hasAttribute('theater')) return;
      if (hd.enableErrorScreenWorkaround && !document.getElementById('ythdErrorStyle')) {
        const st = makeStyle('#error-screen { z-index: 42 !important } .ytp-error { display: none !important }');
        st.id = 'ythdErrorStyle';
      }
      try {
        pm.setTheaterModeRequested(true);
        pm.updateTheaterModeState_(true);
        pm.onTheaterReduxValueUpdate(true);
        pm.setPlayerTheaterMode_();
        pm.dispatchEvent(new CustomEvent('yt-set-theater-mode-enabled', { detail: { enabled: true }, bubbles: true, cancelable: false }));
      } catch (e) { /* internal API changed; fall back to the button */ }
      setTimeout(() => {
        if (!pm.hasAttribute('theater')) {
          const b = document.querySelector('.ytp-size-button');
          if (b) b.click();
        }
      }, 400);
    }

    function clearPlayerSize() {
      const st = document.getElementById('ythdSizeStyle');
      if (st) st.remove();
      if (setHeight) { setHeight = 0; window.dispatchEvent(new Event('resize')); }
    }

    function resizePlayer(height) {
      height = Math.round(height);
      if (setHeight === height) return;
      const css =
        'ytd-watch-flexy[theater]:not([fullscreen]) #player-theater-container.style-scope,' +
        'ytd-watch-flexy[theater]:not([fullscreen]) #player-wide-container.style-scope,' +
        'ytd-watch-flexy[theater]:not([fullscreen]) #full-bleed-container.style-scope{' +
        'min-height:' + height + 'px !important;max-height:none !important;height:' + height + 'px !important}';
      let st = document.getElementById('ythdSizeStyle');
      if (!st) { st = makeStyle(css); st.id = 'ythdSizeStyle'; } else st.textContent = css;
      setHeight = height;
      window.dispatchEvent(new Event('resize'));
    }

    function computeSize() {
      if (!IS_YT || !hd.changePlayerSize) return;
      let height = hd.customHeight;
      if (!hd.useCustomSize) {
        const mh = document.getElementById('masthead');
        const mc = document.getElementById('masthead-container');
        let mastheadHeight = 50, mastheadPadding = 16;
        if (mh && mc) {
          mastheadHeight = parseInt(getComputedStyle(mh).height, 10) || 50;
          mastheadPadding = (parseInt(getComputedStyle(mc).paddingBottom, 10) || 8) * 2;
        }
        const i = Math.max(resolutions.indexOf(hd.targetRes), 0);
        height = Math.min(heights[i], window.innerHeight - (mastheadHeight + mastheadPadding));
        height = Math.max(height, 270);
        if (hd.removeBlackBars) {
          const p = getPlayer();
          if (p && typeof p.getVideoAspectRatio === 'function') height = Math.min(height, window.innerWidth / p.getVideoAspectRatio());
        }
      }
      resizePlayer(height);
    }

    function onNavigate() {
      if (!ENABLED) return;
      const p = getPlayer();
      if (IS_YT && hd.autoTheater && p) {
        if (hd.allowCookies && document.cookie.indexOf('wide=1') === -1) document.cookie = 'wide=1; domain=.youtube.com';
        setTheaterMode();
      }
      if (hd.changePlayerSize) computeSize();
      if (hd.changeResolution && hd.setResolutionEarly && p) setResOnReady(p);
    }

    function init() {
      document.addEventListener('loadstart', e => {
        if (!ENABLED) return;
        if (!(e.target instanceof HTMLMediaElement)) return;
        const p = getPlayer();
        if (!p) return;
        if (hd.changeResolution) setResOnReady(p);
        if (IS_YT && hd.autoTheater) setTheaterMode();
      }, true);
      document.addEventListener('yt-navigate-finish', onNavigate, true);
      window.addEventListener('resize', () => { if (ENABLED && hd.changePlayerSize) computeSize(); }, true);
      onReady(onNavigate);
    }

    // Live re-apply from the settings panel
    function applyRes() {
      recentVideo = '';
      foundHFR = false;
      const p = getPlayer();
      if (p && hd.changeResolution) setResOnReady(p);
      applySize();
    }
    function applySize() {
      // the theater error-screen fix comes off as soon as you turn it off (no reload needed)
      if (!hd.enableErrorScreenWorkaround) { const st = document.getElementById('ythdErrorStyle'); if (st) st.remove(); }
      if (ENABLED && hd.changePlayerSize) { setHeight = 0; computeSize(); } else clearPlayerSize();
    }
    function applyTheater() { if (hd.autoTheater) setTheaterMode(); }

    return { init, applyRes, applySize, applyTheater };
  })();

  // =====================================================================
  //  3. LAVA LAMP (from "YT Music Lava Lamp Theme" 1.7.0)
  // =====================================================================
  // Look settings live in a profile; Calm / User / Crazy each remember their own values.
  const PROFILE_KEYS = ['bgBlur', 'bgBrightness', 'bgSaturate', 'bgScale', 'uiBlur', 'blobs', 'blobSteps',
    'motionSpeed', 'motionAmount', 'randomize', 'reseedPerSong'];
  const PRESETS = {
    calm: {
      bgBlur: 0.7, bgBrightness: 0.55, bgSaturate: 1.4, bgScale: 1.2, uiBlur: 12,
      blobs: true, blobSteps: 30, motionSpeed: 0.5, motionAmount: 0.5, randomize: true, reseedPerSong: false,
    },
    user: {
      bgBlur: 0.5,          // background blur, multiplied by 100px
      bgBrightness: 0.7,
      bgSaturate: 2,
      bgScale: 1.2,
      uiBlur: 8,            // px, frosted-glass blur on the player bar / panels
      blobs: true,          // moving color-blob layer (biggest single saving when off)
      blobSteps: 45,        // repaints per blob cycle; lower = cheaper, choppier
      motionSpeed: 1,       // how fast the lava moves (random motion only)
      motionAmount: 1,      // how far it moves: breathing, drift, tilt and blob wander
      randomize: true,      // brand-new random lava motion on every page load
      reseedPerSong: false, // new random blob path on every song change (Music)
    },
    crazy: {
      bgBlur: 0.3, bgBrightness: 0.9, bgSaturate: 3.5, bgScale: 1.35, uiBlur: 6,
      blobs: true, blobSteps: 120, motionSpeed: 2.5, motionAmount: 2.2, randomize: true, reseedPerSong: true,
    },
  };
  const PROFILE_NAMES = { calm: 'Calm', user: 'User', crazy: 'Crazy' };
  // Shared by every profile (mostly performance).
  const SHARED_DEFAULTS = {
    artSize: 256,         // px, album-art resolution used for the background
    video: true,          // when a video is playing, use it (not the album art) as the lava background
    videoFps: 15,         // how often the background video updates
    videoWidth: 128,      // px width of the tiny frame copy
    videoCropBars: true,  // detect and crop black bars baked into the video
    debug: false,         // log to the browser console (F12)
  };
  const LAVA_DEFAULTS = Object.assign({}, PRESETS.user, SHARED_DEFAULTS);

  // Stored once for both sites: { profile, profiles: {calm, user, crazy}, shared }
  function loadLavaStore() {
    const st = gmGet('lava', null);
    const out = { profile: 'user', profiles: {}, shared: {} };
    // first run: bring over older per-site settings (and the standalone script's localStorage.lavaConfig) into User
    const old = st ? null : Object.assign({}, lsJSON('lavaConfig') || {},
      gmGet('lava:www.youtube.com', null) || gmGet('lava:music.youtube.com', null) || gmGet('lava:' + HOST, {}));
    for (const p of Object.keys(PRESETS)) {
      out.profiles[p] = Object.assign({}, PRESETS[p], st && st.profiles && st.profiles[p]);
    }
    if (old) for (const k of PROFILE_KEYS) if (k in old) out.profiles.user[k] = old[k];
    out.shared = Object.assign({}, SHARED_DEFAULTS, st ? st.shared : old);
    for (const k of Object.keys(out.shared)) if (!(k in SHARED_DEFAULTS)) delete out.shared[k];
    if (st && PRESETS[st.profile]) out.profile = st.profile;
    return out;
  }
  let lavaStore = loadLavaStore();
  // Flat, live view the theme code reads (the active profile + shared values).
  const lava = Object.assign({}, lavaStore.shared, lavaStore.profiles[lavaStore.profile]);
  const CONFIG = lava;
  let lavaSaveTimer = 0;
  const saveLava = () => {
    clearTimeout(lavaSaveTimer);
    lavaSaveTimer = setTimeout(() => gmSet('lava', JSON.parse(JSON.stringify(lavaStore))), 250);
  };
  // Change one value (goes to the active profile or to the shared part)
  function lavaSet(k, v) {
    if (PROFILE_KEYS.includes(k)) lavaStore.profiles[lavaStore.profile][k] = v;
    else lavaStore.shared[k] = v;
    lava[k] = v;
    lavaLive(k);
    saveLava();
  }
  function lavaUseStore(next) {
    const prevArt = lava.artSize;
    lavaStore = next;
    Object.assign(lava, lavaStore.shared, lavaStore.profiles[lavaStore.profile]);
    lavaApplyAll(prevArt !== lava.artSize);
  }
  function lavaSwitchProfile(p) {
    if (!PRESETS[p]) return;
    lavaStore.profile = p;
    lavaUseStore(lavaStore);
    saveLava();
  }
  function lavaResetProfile() {
    const p = lavaStore.profile;
    lavaStore.profiles[p] = Object.assign({}, PRESETS[p]);
    lavaUseStore(lavaStore);
    saveLava();
  }
  function lavaResetShared() {
    lavaStore.shared = Object.assign({}, SHARED_DEFAULTS);
    lavaUseStore(lavaStore);
    saveLava();
  }

  /* ------------------ Theme CSS (from Lava Lamp 1.7.0) ------------------ */
  const CSS = `
/* Lava Lamp v2, a custom theme for YouTube Music */
@import url("https://fonts.googleapis.com/css?family=Inter");
/* --- default | light | dark --- */
/* --- Background & Backdrop --- */
/* --- Typography & Colors --- */
/* --- UI Components --- */
/* --- Features & Toggles --- */
/* --- Roundness --- */
/* --- Animation --- */
/* ==================================================== */
:root {
  --bg-blur: calc(0.6 * 100px);
  --bg-brightness: 0.7;
  --ui-color: transparent;
  --ui-contrast: rgba(255, 255, 255, 0.1);
  --ui-highlight: rgba(255, 255, 255, 0.1);
  --btn-color: rgba(255, 255, 255, 0.1);
  --btn-highlight: rgba(255, 255, 255, 0.2);
  --album-art-size: 400px;
  --bg-scale: 1.2;
  --bg-saturate: 2;
  --bg-player-opacity: 1;
  --font-family: Inter, PingFangSC-Regular, Apple SD Gothic Neo;
  --font-weight: 400;
  --text-primary: white;
  --text-secondary: rgba(255, 255, 255, 0.7);
  --icon: white;
  --accent: white;
  --accent-icon: white;
  --accent-highlight: white;
  --ui-blur: 10px;
  --ui-border: transparent;
  --btn-border: transparent;
  --ui-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  --radius-art: 8px;
  --radius-art-md: 16px;
  --radius-art-lg: 20px;
  --radius-btn: 12px;
  --radius-btn-alt: 16px;
  --radius-highlight: 8px;
  --radius-highlight-lg: 12px;
  --radius-panel-lg: 24px;
  --radius-panel: 12px;
  --anim-bg-duration: 0.3s;
  --anim-bg-timing: ease-in-out;
  --anim-player-page-duration: 0.65s;
  --anim-player-page-timing: cubic-bezier(0.3, 0.6, 0.5, 1);
  --anim-fade-duration: 0.3s;
  --anim-fade-duration-alt: 0.5s;
  --anim-fade-timing: ease;
  --anim-drawer-duration: 0.3s;
  --anim-drawer-timing: ease;
  --ytmusic-text-primary: white;
  --ytmusic-text-secondary: rgba(255, 255, 255, 0.7);
  --ytmusic-overlay-text-secondary: rgba(255, 255, 255, 0.7);
}
/* ========================== TYPOGRAPHY & ICONS ========================== */
yt-formatted-string,
input,
label,
button,
h2,
tp-yt-paper-item,
#title,
#icon-label,
.ytmusic-player-bar,
.dialog-title,
.title,
.subtitle,
.tab-content,
.promo-title,
[role=text] {
  font-family: var(--font-family) !important;
  font-weight: var(--font-weight);
}
html,
#items,
#tab-renderer,
#chips,
ytmusic-menu-popup-renderer,
.ytmusicMultiPageMenuHost,
.scrollable-content,
.scroller,
.dropdown-content,
.ytmusic-settings-page {
  scrollbar-width: none !important;
}
yt-formatted-string.title {
  color: var(--text-primary) !important;
  --yt-endpoint-color: var(--text-primary) !important;
  --yt-endpoint-hover-color: var(--text-primary) !important;
  --yt-endpoint-visited-color: var(--text-primary) !important;
}
yt-icon {
  color: var(--icon);
}
yt-icon.ytmusic-inline-badge-renderer {
  color: var(--accent-icon);
}
/* Icons in explore top songs  */
.icon-column.ytmusic-custom-index-column-renderer .yt-icon-shape {
  color: var(--icon);
}
.icon.ytmusic-play-button-renderer {
  --ytmusic-play-button-guide-icon-color: var(--icon);
  color: var(--icon);
}
/* CTA Text */
a.yt-simple-endpoint.yt-formatted-string {
  --yt-spec-call-to-action: var(--accent);
  --yt-endpoint-color: var(--text-primary);
  --yt-endpoint-visited-color: var(--text-primary);
  --yt-endpoint-hover-color: var(--accent-highlight);
}
a.yt-simple-endpoint.yt-formatted-string:hover {
  text-decoration: underline;
}
/* Like Dislike 3 Dots */
.ytSpecButtonShapeNextMono.ytSpecButtonShapeNextText {
  color: var(--icon);
}
.index.ytmusic-responsive-list-item-renderer {
  color: var(--text-secondary);
}
/* Like buttons pressed */
.ytSpecButtonShapeNextHost[aria-pressed=true] {
  color: var(--accent-icon);
}
tp-yt-paper-ripple.tp-yt-paper-tab {
  color: transparent;
}
textarea.tp-yt-iron-autogrow-textarea {
  color: var(--text-primary);
}
.stroke.yt-interaction,
.fill.yt-interaction {
  border: 0;
  background: transparent;
}
/* ========================== ARTS ========================== */
/* Background Behind Art */
ytmusic-player {
  background: transparent;
}
ytmusic-responsive-list-item-renderer {
  --ytmusic-list-item-height: 54px;
  --ytmusic-responsive-list-item-thumbnail-size: 38px;
}
ytmusic-background-overlay-renderer {
  background: linear-gradient(rgba(0, 0, 0, 0.5), transparent 80%);
}
ytmusic-item-thumbnail-overlay-renderer:not([play-button-state=default]) #background.ytmusic-item-thumbnail-overlay-renderer {
  opacity: 0 !important;
}
ytmusic-item-thumbnail-overlay-renderer:not([play-button-state=default]):hover #background.ytmusic-item-thumbnail-overlay-renderer {
  opacity: 1 !important;
}
ytmusic-responsive-list-item-renderer[is-album-detail-page] ytmusic-background-overlay-renderer {
  background: transparent;
}
/* Playing/Selected Overlay */
ytmusic-responsive-list-item-renderer[play-button-state] {
  border-radius: var(--radius-art);
}
ytmusic-play-button-renderer:not([state=default]) .content-wrapper .yt-icon-shape {
  color: var(--accent-icon);
}
/* Playlist Page Art */
ytmusic-responsive-header-renderer {
  --yt-img-border-radius: var(--radius-art-lg);
}
#header-group #img {
  border-radius: 50%;
}
/* Small Art */
yt-img-shadow[object-fit=CONTAIN] img,
ytmusic-player[player-ui-state=PLAYER_BAR_ONLY] #img,
.thumbnail-overlay {
  border-radius: var(--radius-art);
  object-fit: cover !important;
  overflow: hidden;
}
/* Player Page Art */
ytmusic-player[player-page-open] .player-wrapper,
ytmusic-two-row-item-renderer .image-wrapper {
  border-radius: var(--radius-art-lg);
}
#player:not([player-ui-state=PLAYER_BAR_ONLY]) {
  border-radius: var(--radius-art-lg);
  box-shadow: var(--ui-shadow) !important;
  overflow: hidden;
}
ytmusic-player[player-ui-state] #song-media-window {
  background: linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0) 40%);
  border-radius: var(--radius-art-lg);
}
ytmusic-player[player-ui-state=PLAYER_BAR_ONLY] .html5-video-player,
ytmusic-player[player-ui-state=PLAYER_BAR_ONLY] .video-stream {
  background: transparent;
  border-radius: var(--radius-art-md);
}
@media (min-width: 615px) {
ytmusic-player-page:not([video-mode]):not([player-fullscreened]):not([player-ui-state=MINIPLAYER]) #player {
    max-width: var(--album-art-size) !important;
  }
}
#top-shelf .image-wrapper {
  border-radius: var(--radius-art-md);
}
.image-wrapper.ytmusic-two-row-item-renderer:hover img.yt-img-shadow {
  transform: scale(1.01);
}
/* ========================== PANELS & MISC ========================== */
/* New Playlist Panel */
ytmusic-playlist-form {
  background: transparent;
}
ytmusic-playlist-form .yt-icon-shape {
  color: var(--icon);
}
.label.ytmusic-dropdown-item-renderer {
  color: var(--text-primary);
}
tp-yt-iron-input.tp-yt-paper-input > input.tp-yt-paper-input {
  color: var(--text-primary);
}
.yt-list-item-view-model__title {
  color: var(--text-primary);
}
ytmusic-dialog {
  box-shadow: var(--ui-shadow);
  background: var(--ui-color);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--ui-border);
  border-radius: var(--radius-panel-lg);
}
/* Underline */
.unfocused-line.tp-yt-paper-input-container {
  border-color: rgba(255, 255, 255, 0.4);
}
.focused-line.tp-yt-paper-input-container {
  border-color: var(--accent);
}
/* Toogle Button */
.ytSwitchShapeTrack {
  background: var(--btn-color);
}
.ytSwitchShapeKnob {
  background: rgba(255, 255, 255, 0.3);
}
.ytSwitchShapeKnobActive {
  background: var(--accent);
}
/* Playlist Visibility Dropdown */
.dropdown-content.tp-yt-paper-menu-button {
  --yt-spec-brand-background-primary: transparent;
  background: var(--ui-color);
  box-shadow: var(--ui-shadow);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: var(--radius-panel-lg);
}
.ytmusic-playlist-form .dropdown-content.tp-yt-paper-menu-button {
  left: 12rem;
}
.dropdown-content.ytmusic-dropdown-renderer {
  background: transparent;
  backdrop-filter: blur(var(--ui-blur));
}
ytmusic-dropdown-item-renderer {
  background: transparent;
  border-radius: var(--radius-highlight);
}
ytmusic-dropdown-item-renderer:hover,
ytmusic-dropdown-item-renderer:focus {
  background: var(--ui-highlight);
}
/* Item Pressed */
tp-yt-paper-item.ytmusic-dropdown-item-renderer:focus::before {
  background: transparent;
}
tp-yt-iron-icon.tp-yt-paper-dropdown-menu {
  color: var(--icon);
}
/* Add to Playlist */
tp-yt-paper-dialog[modern],
ytmusic-add-to-playlist-renderer {
  --yt-spec-brand-background-primary: transparent;
  background: var(--ui-color);
  backdrop-filter: blur(var(--ui-blur));
  box-shadow: var(--ui-shadow);
  border-radius: var(--radius-panel-lg);
  border: var(--ui-border);
}
yt-formatted-string.subtitle.ytmusic-two-row-item-renderer {
  color: var(--text-secondary) !important;
}
/* Divider */
.top-bar.ytmusic-add-to-playlist-renderer,
ytmusic-carousel-shelf-renderer.ytmusic-add-to-playlist-renderer:not(:empty) {
  border-bottom: 0;
}
/* Add to Option */
ytmusic-playlist-add-to-option-renderer {
  border-radius: var(--radius-highlight-lg);
}
ytmusic-playlist-add-to-option-renderer .yt-icon-shape {
  color: var(--accent-icon);
}
#title.ytmusic-playlist-add-to-option-renderer {
  color: var(--text-primary);
}
.thumbnail.ytmusic-playlist-add-to-option-renderer {
  border-radius: var(--radius-art);
}
/* Divider */
.top-bar.ytmusic-add-to-playlist-renderer,
ytmusic-carousel-shelf-renderer.ytmusic-add-to-playlist-renderer:not(:empty) {
  border-bottom: 0;
}
/* 3 Dot Menu */
tp-yt-iron-dropdown.ytmusic-popup-container {
  background: var(--ui-color);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: var(--radius-panel-lg);
  box-shadow: var(--ui-shadow);
  border: var(--ui-border);
  overflow: hidden;
}
tp-yt-paper-listbox.ytmusic-menu-popup-renderer {
  --paper-listbox-background-color: transparent;
  border: 0;
}
tp-yt-paper-listbox#items yt-formatted-string {
  color: var(--text-primary);
}
.ytmusic-menu-popup-renderer {
  border-radius: var(--radius-highlight);
  overflow: hidden;
  --ytmusic-menu-item-hover-background-color: var(--ui-highlight);
}
/* User Dropdown */
.ytmusicMultiPageMenuRendererHost {
  --yt-sys-color-baseline--call-to-action: var(--accent);
  --yt-endpoint-hover-color: var(--accent-highlight);
  --yt-sys-color-baseline--outline: transparent;
  background: transparent;
}
ytd-simple-menu-header-renderer {
  background: transparent;
}
ytd-compact-link-renderer {
  --yt-compact-link-icon-color: var(--icon);
  border-radius: var(--radius-highlight);
}
ytd-compact-link-renderer:hover {
  background: var(--ui-highlight) !important;
}
tp-yt-paper-item:focus:before {
  border-radius: var(--radius-highlight);
}
ytd-account-item-renderer {
  --yt-spec-text-primary: var(--accent);
  border-radius: var(--radius-highlight-lg);
}
#email.ytd-google-account-header-renderer {
  color: var(--text-secondary);
}
yt-formatted-string.ytd-account-item-renderer[secondary] {
  color: var(--text-secondary);
}
/* "Recently Played" Button */
button.ytmusic-sort-filter-button-renderer {
  color: var(--text-primary);
  border: var(--btn-border);
  border-radius: var(--radius-btn-alt);
  background: var(--btn-color);
}
ytmusic-multi-select-menu-item-renderer {
  border-radius: var(--radius-highlight);
}
ytmusic-multi-select-menu-item-renderer:hover {
  background: var(--ui-highlight);
}
#container.ytmusic-multi-select-menu-renderer {
  background: transparent;
  border: 0;
}
#items.ytmusic-multi-select-menu-renderer {
  background: transparent;
}
#title.ytmusic-multi-select-menu-renderer {
  border: 0;
}
ytmusic-background-promo-renderer {
  background: transparent;
}
ytmusic-background-promo-renderer .yt-icon-shape {
  color: var(--icon);
}
/* Popup Message */
tp-yt-paper-toast,
tp-yt-paper-toast.yt-notification-action-renderer,
#toast.ytmusic-notification-text-renderer {
  color: var(--text-primary);
  background: var(--ui-color);
  border-radius: var(--radius-panel);
  border: var(--ui-border);
  box-shadow: var(--ui-shadow);
  backdrop-filter: blur(var(--ui-blur));
}
#text.yt-notification-action-renderer,
#sub-text.yt-notification-action-renderer {
  color: var(--text-primary);
}
.ytSpecButtonShapeNextCallToActionInverse.ytSpecButtonShapeNextText {
  color: var(--accent);
}
.ytSpecButtonShapeNextCallToActionInverse.ytSpecButtonShapeNextText:hover {
  background: var(--btn-highlight) !important;
}
/* Share Container */
#start-at-wrapper {
  --paper-input-container-disabled-opacity: 0.65;
}
#bar.yt-copy-link-renderer {
  background: var(--ui-contrast);
  border: var(--ui-border);
}
#checkbox.tp-yt-paper-checkbox {
  border-color: var(--btn-color);
  background: var(--btn-color);
  --paper-checkbox-checked-color: var(--btn-color);
}
#checkmark.tp-yt-paper-checkbox {
  border-color: var(--icon);
}
.ytSpecButtonShapeNextCallToAction.ytSpecButtonShapeNextFilled {
  color: var(--accent);
  background: var(--btn-color);
  border-radius: var(--radius-btn-alt);
}
.ytSpecButtonShapeNextCallToAction.ytSpecButtonShapeNextFilled:hover {
  background: var(--btn-highlight);
}
.scroll-button.yt-third-party-share-target-section-renderer {
  background: var(--btn-color);
  backdrop-filter: blur(var(--ui-blur));
  box-shadow: none;
}
.scroll-button.yt-third-party-share-target-section-renderer .yt-icon-shape {
  color: var(--icon);
}
yt-formatted-string.yt-start-at-renderer {
  color: var(--text-secondary);
}
/* Explore Page */
ytmusic-navigation-button-renderer.ytmusic-grid-renderer button.ytmusic-navigation-button-renderer {
  background: var(--btn-color);
  border-radius: var(--radius-btn-alt);
}
ytmusic-navigation-button-renderer.ytmusic-grid-renderer button.ytmusic-navigation-button-renderer:focus-within,
ytmusic-navigation-button-renderer.ytmusic-grid-renderer button.ytmusic-navigation-button-renderer:hover {
  background: var(--btn-highlight);
}
ytmusic-navigation-button-renderer.ytmusic-grid-renderer button.ytmusic-navigation-button-renderer .yt-icon-shape {
  color: var(--icon);
}
ytmusic-navigation-button-renderer.ytmusic-carousel button.ytmusic-navigation-button-renderer {
  background: var(--btn-color);
  border-radius: var(--radius-btn);
}
ytmusic-navigation-button-renderer.ytmusic-carousel button.ytmusic-navigation-button-renderer:focus-within,
ytmusic-navigation-button-renderer.ytmusic-carousel button.ytmusic-navigation-button-renderer:hover {
  background: var(--btn-highlight);
}
tp-yt-paper-listbox.yt-dropdown-menu {
  background: transparent;
}
tp-yt-paper-listbox.yt-dropdown-menu .iron-selected.yt-dropdown-menu,
tp-yt-paper-listbox.yt-dropdown-menu tp-yt-paper-item.yt-dropdown-menu:hover {
  background: var(--ui-highlight);
  border-radius: var(--radius-highlight);
}
yt-card-item-container-renderer {
  border: 0;
}
/* ========================== PLAYER BAR ========================== */
ytmusic-player-bar {
  background: var(--ui-color);
  backdrop-filter: blur(var(--ui-blur));
}
#player-bar-background {
  backdrop-filter: none;
}
#layout[player-ui-state=PLAYER_PAGE_OPEN] ytmusic-player-bar,
#layout[player-ui-state=PLAYER_PAGE_OPEN] #player-bar-background {
  background: transparent !important;
}
/* Progress Bar */
#primaryProgress.tp-yt-paper-progress {
  --paper-progress-active-color: var(--accent);
}
#progress-bar[focused],
ytmusic-player-bar:hover #progress-bar {
  --paper-slider-knob-color: var(--accent) !important;
  --paper-slider-knob-start-color: var(--accent) !important;
  --paper-slider-knob-start-border-color: var(--accent) !important;
}
#progress-bar.ytmusic-player-controls {
  --paper-slider-knob-start-color: var(--accent);
  --paper-slider-knob-start-border-color: var(--accent);
  --paper-slider-knob-color: var(--accent);
  --paper-slider-active-color: var(--accent);
}
#progress-bar.ytmusic-player-bar {
  top: -16px;
  transform: unset;
}
#hover-time-info.ytmusic-player-bar {
  padding: 12px;
  border-radius: var(--radius-panel);
  background: var(--ui-contrast);
  color: var(--text-primary);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--ui-border);
}
/* Song Info */
.content-info-wrapper.ytmusic-player-bar .byline.ytmusic-player-bar {
  --yt-endpoint-color: var(--accent);
  --yt-endpoint-visited-color: var(--accent);
  --yt-endpoint-hover-color: var(--accent-highlight);
}
.thumbnail-image-wrapper.ytmusic-player-bar,
.image.ytmusic-player-bar {
  display: block;
  border-radius: var(--radius-art);
}
.time-info.ytmusic-player-bar,
.duration.ytmusic-player-queue-item {
  color: var(--text-secondary);
}
/* Volume Control */
ytmusic-app {
  --ytmusic-player-bar-background: transparent;
}
ytmusic-app .volume-slider.ytmusic-player-bar,
ytmusic-app .expand-volume-slider.ytmusic-player-bar {
  --paper-slider-knob-color: var(--accent);
  --paper-slider-knob-start-color: var(--accent);
  --paper-slider-knob-start-border-color: var(--accent);
  --paper-slider-container-color: transparent;
}
/* Podcast Player Bar */
tp-yt-paper-listbox.ytmusic-playback-rate-popup-renderer {
  border: var(--layour-border);
  --paper-listbox-background-color: transparent;
}
tp-yt-paper-item.ytmusic-playback-rate-popup-renderer {
  --ytmusic-menu-item-hover-background-color: var(--ui-highlight);
  color: var(--text-primary);
  border-radius: var(--radius-highlight);
}
/* Icons */
.spinner-layer.tp-yt-paper-spinner-lite {
  color: var(--icon);
}
ytmusic-player-bar:not([repeat-mode=NONE]) .repeat .yt-icon-shape,
ytmusic-player-controls:not([repeat-mode=NONE]) .repeat .yt-icon-shape {
  color: var(--accent-icon);
}
ytmusic-player-bar[shuffle-on] .shuffle yt-icon,
ytmusic-player-bar[shuffle-on] .expand-shuffle yt-icon,
ytmusic-player-controls[shuffle-on] .shuffle yt-icon,
ytmusic-player-controls[shuffle-on] .expand-shuffle yt-icon {
  color: var(--accent-icon);
}
ytmusic-player-bar:has(.volume-slider[value="0"]) .volume yt-icon,
ytmusic-player-bar:has(.volume-slider[value="0"]) .expand-volume yt-icon {
  color: var(--accent-icon);
}
/* Hide Expand Button When Expanded */
ytmusic-player-bar:has(ytmusic-player-expanding-menu[aria-hidden=false]) .right-controls.ytmusic-player-bar .expand-button.ytmusic-player-bar,
ytmusic-player-bar:has(ytmusic-player-expanding-menu[aria-hidden=false]) .playback-rate.ytmusic-player-bar {
  opacity: 0;
}
/* ========================== SEARCH BOX ========================== */
ytmusic-search-box .search-box {
  border-radius: var(--radius-panel) !important;
  background: var(--ui-contrast) !important;
  border: var(--ui-border) !important;
}
ytmusic-search-box .search-box .yt-icon-shape {
  color: var(--accent-icon);
}
input.ytmusic-search-box {
  color: var(--text-secondary);
}
ytmusic-search-box[has-query],
ytmusic-search-box[opened] {
  border: none;
}
ytmusic-search-box[has-query] input.ytmusic-search-box,
ytmusic-search-box[opened] input.ytmusic-search-box {
  color: var(--text-primary);
}
ytmusic-search-box[has-query] input.ytmusic-search-box::placeholder,
ytmusic-search-box[opened] input.ytmusic-search-box::placeholder {
  color: var(--text-primary);
}
.search-container.ytmusic-search-box {
  border-radius: var(--radius-panel);
}
ytmusic-search-box[has-query] .search-container.ytmusic-search-box,
ytmusic-search-box[opened] .search-container.ytmusic-search-box {
  border-radius: var(--radius-panel);
  background: transparent !important;
  box-shadow: var(--ui-shadow);
}
ytmusic-search-box #suggestion-list {
  top: 0;
  opacity: 0;
  visibility: hidden;
  display: initial !important;
  border-radius: var(--radius-panel) !important;
  background: var(--ui-color) !important;
  box-shadow: var(--ui-shadow);
  border: var(--ui-border) !important;
  backdrop-filter: blur(var(--ui-blur));
  anchor-name: --search-dropdown;
}
ytmusic-search-box #suggestion-list ytmusic-search-suggestions-section {
  background: transparent !important;
}
ytmusic-search-box #suggestion-list ytmusic-search-suggestions-section ytmusic-search-suggestion {
  background: transparent !important;
  color: var(--text-primary);
  border-radius: var(--radius-panel);
}
ytmusic-search-box #suggestion-list ytmusic-search-suggestions-section ytmusic-search-suggestion:hover {
  background: var(--ui-highlight) !important;
  color: var(--text-primary);
}
/* Chromium backdrop workaround */
@supports not (-moz-appearance: none) {
ytmusic-app-layout::after {
    content: "";
    position: fixed;
    position-anchor: --search-dropdown;
    top: anchor(top);
    left: anchor(left);
    width: anchor-size(width);
    height: anchor-size(height);
    border-radius: var(--radius-panel);
    backdrop-filter: blur(var(--ui-blur));
    opacity: 0;
    z-index: 2;
  }
}
ytmusic-app-layout:has(ytmusic-search-box[opened])::after {
  opacity: 1;
}
ytmusic-search-box[opened] #suggestion-list {
  top: calc(var(--ytmusic-search-box-height) + 16px) !important;
  opacity: 1;
  visibility: visible;
}
#suggestions .ytmusic-search-suggestions-section {
  border-radius: var(--radius-highlight);
}
/* ========================== SETTINGS ========================== */
ytmusic-setting-category-collection-renderer.ytmusic-settings-page {
  border-left: 1px solid rgba(255, 255, 255, 0.2);
}
.dialog-title.ytmusic-settings-page {
  color: var(--text-primary);
  font-weight: 700;
}
.ytmusic-settings-page yt-formatted-string.summary {
  color: var(--text-secondary);
}
.dropdown-content.ytmusic-setting-single-option-menu-renderer .menu-item.ytmusic-setting-single-option-menu-renderer {
  color: var(--text-primary);
}
tp-yt-paper-item-body.ytmusic-setting-single-option-menu-renderer {
  --paper-item-body-secondary-color: var(--text-secondary);
}
.category-menu-item.iron-selected.ytmusic-settings-page,
.category-menu-item.ytmusic-settings-page:focus:not(.iron-selected) {
  background: var(--ui-highlight);
  border-radius: var(--radius-highlight);
}
.dropdown-content.ytmusic-setting-single-option-menu-renderer {
  background: transparent;
}
/* Divider */
.top-bar.ytmusic-settings-page,
.items .ytmusic-setting-category-collection-renderer {
  border-bottom: 0 !important;
}
/* Toggle Buttons */
.toggle-bar.tp-yt-paper-toggle-button {
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  opacity: 0.5;
}
.toggle-button.tp-yt-paper-toggle-button {
  background: rgb(180, 180, 180);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
tp-yt-paper-toggle-button[checked]:not([disabled]) .toggle-bar.tp-yt-paper-toggle-button,
tp-yt-paper-toggle-button[checked]:not([disabled]) .toggle-button.tp-yt-paper-toggle-button {
  background: var(--accent);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
/* ========================== ANIMATIONS ========================== */
ytmusic-app-layout[player-page-open][is-mweb-player-bar-modernization-enabled] > [slot=player-page] {
  animation: open-playerpage var(--anim-player-page-duration) var(--anim-player-page-timing);
}
ytmusic-app-layout:not([player-page-open])[is-mweb-player-bar-modernization-enabled] > [slot=player-page] {
  animation: collapse-playerpage var(--anim-player-page-duration) var(--anim-player-page-timing);
}
ytmusic-player-page[mini-player-enabled][player-page-open] #player.ytmusic-player-page {
  animation: mp-grow 0.75s cubic-bezier(0.3, 0.6, 0.5, 1);
}
ytmusic-player-page[mini-player-enabled]:not([player-page-open]) #player.ytmusic-player-page {
  animation: mp-shrink 1s cubic-bezier(0.5, 0.6, 0.5, 1);
}
@keyframes open-playerpage {
  0% {
    transform: translateY(100%);
    opacity: 0;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}
@keyframes collapse-playerpage {
  0% {
    transform: translateY(0);
  }
  38% {
    opacity: 1;
  }
  100% {
    transform: translateY(120vh);
    opacity: 0;
  }
}
@keyframes mp-grow {
  0% {
    transform: translate3d(60%, 0, 0) scale(0.2);
    opacity: 0;
  }
  100% {
    transform: translate3d(0, 0, 0) scale(1);
    opacity: 1;
  }
}
@keyframes mp-shrink {
  0% {
    transform: scale(1.7);
    opacity: 0;
  }
  50% {
    opacity: 0;
  }
  100% {
    transform: translate3d(0, 0, 0) scale(1);
    opacity: 1;
  }
}
ytmusic-player-page[is-mweb-modernization-enabled]:not([player-fullscreened]) #player.ytmusic-player-page {
  transition: transform 0.65s var(--anim-player-page-timing);
}
ytmusic-player-page[is-mweb-modernization-enabled][transition-mode] #side-panel {
  transition: transform 0.65s var(--anim-player-page-timing);
}
ytmusic-player-page[player-page-ui-state=TABS_VIEW] #thumbnail > img {
  transition: border-radius 0.3s ease-out;
}
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=TABS_VIEW] #music-player-wrapper {
  transition: transform 0.3s ease-in-out;
}
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=TABS_VIEW] .av,
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=TABS_VIEW] #info-panel,
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=TABS_VIEW] #player-controls,
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=TABS_VIEW] .collapse-button,
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=TABS_VIEW] .context-menu-button {
  transform: translateY(var(--ytmusic-player-page-player-bar-height));
  transition: opacity 0.3s ease-out, transform 0.3s ease-out;
  will-change: opacity, transform;
}
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=FULL_PLAYER_VIEW] .av,
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=FULL_PLAYER_VIEW] #info-panel,
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=FULL_PLAYER_VIEW] #player-controls,
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=FULL_PLAYER_VIEW] .collapse-button,
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=FULL_PLAYER_VIEW] .context-menu-button {
  transition: opacity 0.3s ease-in, transform 0.3s ease-in;
}
/* CTA */
a.yt-simple-endpoint.yt-formatted-string {
  transition: color var(--anim-fade-duration) var(--anim-fade-timing);
}
#suggestions .ytmusic-search-suggestions-section {
  transition: background-color var(--anim-fade-duration) var(--anim-fade-timing);
}
/* BIG SONG LIST */
ytmusic-play-button-renderer .content-wrapper.ytmusic-play-button-renderer {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
ytmusic-background-overlay-renderer {
  transition: opacity var(--anim-fade-duration) var(--anim-fade-timing);
}
ytmusic-menu-renderer {
  transition: opacity var(--anim-fade-duration) var(--anim-fade-timing);
}
/* SMALL SONG LIST */
ytmusic-item-thumbnail-overlay-renderer {
  transition: opacity var(--anim-fade-duration) var(--anim-fade-timing);
}
ytmusic-responsive-list-item-renderer[play-button-state] {
  transition: background var(--anim-fade-duration-alt) var(--anim-fade-timing);
}
/* 3 Dots */
ytmusic-responsive-list-item-renderer > ytmusic-menu-renderer {
  opacity: 0;
  transition: opacity var(--anim-fade-duration) var(--anim-fade-timing);
}
ytmusic-responsive-list-item-renderer:hover > ytmusic-menu-renderer {
  opacity: 1;
}
/* Play Buttons */
ytmusic-responsive-list-item-renderer .content-wrapper .yt-icon-shape {
  transition: color var(--anim-fade-duration) var(--anim-fade-timing);
}
yt-checkbox-renderer {
  transition: opacity var(--anim-fade-duration) var(--anim-fade-timing);
}
/* NAV BAR */
.ytmusic-guide-entry-renderer {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing), opacity var(--anim-fade-duration) var(--anim-fade-timing);
}
yt-icon-button.ytmusic-nav-bar {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
#tabs.ytmusic-tabbed-search-results-renderer {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing), backdrop-filter var(--anim-fade-duration) var(--anim-fade-timing);
}
/* When Scrolled */
ytmusic-tabs.stuck {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing), backdrop-filter var(--anim-fade-duration) var(--anim-fade-timing);
}
/* PLAYER BAR */
ytmusic-player-bar.ytmusic-app {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing), bottom 0.5s;
}
ytmusic-player-bar yt-icon-button.ytmusic-player-bar {
  border-radius: 50%;
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
tp-yt-paper-item.ytmusic-playback-rate-popup-renderer {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
/* PLAYER PAGE */
.av.ytmusic-player-page {
  transition: opacity var(--anim-fade-duration) var(--anim-fade-timing);
}
.song-media-controls.ytmusic-player {
  transition: opacity var(--anim-fade-duration) var(--anim-fade-timing);
}
tp-yt-paper-tab.ytmusic-player-page {
  transition: color var(--anim-fade-duration) var(--anim-fade-timing);
}
.autoscroll-resume-button {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing), opacity var(--anim-fade-duration) var(--anim-fade-timing);
}
/* QUEUE */
ytmusic-player-queue-item {
  transition: background var(--anim-fade-duration-alt) var(--anim-fade-timing), opacity var(--anim-fade-duration-alt) var(--anim-fade-timing);
}
ytmusic-player-queue-item > yt-formatted-string {
  display: block !important;
  transition: opacity var(--anim-fade-duration) var(--anim-fade-timing);
}
ytmusic-player-queue-item:not([is-automix]):hover > yt-formatted-string {
  opacity: 0;
  pointer-events: none;
}
/* 3 Dots In Queue */
ytmusic-player-queue-item yt-button-shape {
  transform: translatex(36px);
  opacity: 1;
  transition: opacity var(--anim-fade-duration-alt) var(--anim-fade-timing);
}
/* DROPDOWN */
ytmusic-dropdown-item-renderer,
tp-yt-paper-item.yt-dropdown-menu {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
ytmusic-playlist-add-to-option-renderer {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
.ytmusic-menu-popup-renderer {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
ytd-compact-link-renderer {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
ytd-account-item-renderer {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
/* "Recently Played" Button */
ytmusic-multi-select-menu-item-renderer {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
/* BUTTONS */
ytmusic-chip-cloud-chip-renderer a {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
ytmusic-subscribe-button-renderer {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
ytmusic-play-button-renderer {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing), opacity var(--anim-fade-duration) var(--anim-fade-timing);
}
button.ytmusic-navigation-button-renderer {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
.autoscroll-resume-button {
  transition: text-shadow var(--anim-fade-duration) var(--anim-fade-timing);
}
/* SETTING */
.category-menu-item.ytmusic-settings-page {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
/* Pill-shaped Buttons */
yt-icon-button.ytmusic-carousel-shelf-renderer {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing) !important;
}
.ytSpecButtonShapeNextMono,
.ytSpecButtonShapeNextCallToAction,
.ytSpecButtonShapeNextCallToActionInverse,
.ytSpecButtonShapeNextOverlay {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
.ytListItemViewModelTappable {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
.yt-simple-endpoint {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing), color var(--anim-fade-duration) var(--anim-fade-timing);
}
#content-wrapper.ytmusic-browse-response {
  transition: margin var(--anim-drawer-duration) var(--anim-drawer-timing);
}
ytmusic-search-page {
  transition: padding var(--anim-drawer-duration) var(--anim-drawer-timing);
}
ytmusic-nav-bar .center-content.ytmusic-nav-bar {
  transition: padding var(--anim-drawer-duration) var(--anim-drawer-timing), margin var(--anim-drawer-duration) var(--anim-drawer-timing);
}
#contentContainer.tp-yt-app-drawer {
  width: 256px !important;
  transition: transform var(--anim-drawer-duration) var(--anim-drawer-timing);
  transition-duration: var(--anim-drawer-duration) !important;
}
#guide-wrapper {
  transition: width var(--anim-drawer-duration) var(--anim-drawer-timing);
}
tp-yt-app-drawer {
  transition-duration: var(--anim-drawer-duration) !important;
}
ytmusic-app-layout:not([is-mweb-modernization-enabled]) #mini-guide {
  display: unset !important;
  opacity: 0;
  transition: opacity var(--anim-drawer-duration) var(--anim-drawer-timing);
}
ytmusic-app[is-guide-persistent][guide-collapsed] #mini-guide {
  opacity: 1;
  transition: opacity var(--anim-drawer-duration) var(--anim-drawer-timing);
}
#layout[player-fullscreened] #mini-guide {
  display: none !important;
}
ytmusic-immersive-header-renderer .gradient-container,
ytmusic-visual-header-renderer .content-container {
  transition: padding var(--anim-drawer-duration) var(--anim-drawer-timing);
}
ytmusic-player-page {
  transition: transform var(--anim-player-page-duration) var(--anim-player-page-timing), padding var(--anim-drawer-duration) var(--anim-drawer-timing), height var(--anim-drawer-duration) var(--anim-drawer-timing) !important;
}
.toggle-player-page-button {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing), transform var(--anim-player-page-duration) var(--anim-player-page-timing) !important;
}
/* Smooth Progress Bar */
#primaryProgress.tp-yt-paper-progress,
#secondaryProgress.tp-yt-paper-progress {
  transition: transform 1s linear;
}
#progressContainer.tp-yt-paper-progress {
  transition: height 0.2s ease-out;
}
ytmusic-app-layout[is-mweb-modernization-enabled][player-ui-state=PLAYER_PAGE_OPEN] .slider-knob.tp-yt-paper-slider,
ytmusic-app-layout:not([is-mweb-modernization-enabled]) .slider-knob.tp-yt-paper-slider:not(.dragging) {
  transition: left 1s linear;
}
/* Expanding Description */
ytmusic-immersive-header-renderer .description {
  transition: max-height 0.65s ease-in-out !important;
  -webkit-line-clamp: unset !important;
}
ytmusic-immersive-header-renderer .image {
  transition: filter 0.5s ease;
}
/* Search Bar Animations */
ytmusic-search-box .ytmusic-search-box::placeholder {
  transition: color 0.3s ease;
}
ytmusic-search-box .search-container.ytmusic-search-box {
  transition: box-shadow 0.3s ease;
}
ytmusic-search-box #suggestion-list {
  transition: 0.3s ease;
}
ytmusic-search-suggestion {
  transition: background 0.3s ease;
}
/* Play Button Animations */
#play-button .content-wrapper.ytmusic-play-button-renderer {
  transition: opacity var(--anim-fade-duration) var(--anim-fade-timing), background var(--anim-fade-duration) var(--anim-fade-timing), transform 0.3s ease;
}
#play-button .content-wrapper.ytmusic-play-button-renderer:hover {
  transform: scale(1.2);
}
.play-pause-button-wrapper.ytmusic-player-controls {
  will-change: transform;
  transition: transform 0.3s ease;
}
.play-pause-button-wrapper.ytmusic-player-controls:hover {
  transform: scale(1.4);
}
.next-button.ytmusic-player-controls,
.previous-button.ytmusic-player-controls,
.shuffle.ytmusic-player-controls,
.repeat.ytmusic-player-controls {
  will-change: transform;
  transition: transform 0.3s ease;
}
.next-button.ytmusic-player-controls:hover,
.previous-button.ytmusic-player-controls:hover,
.shuffle.ytmusic-player-controls:hover,
.repeat.ytmusic-player-controls:hover {
  transform: scale(1.2);
}
.image-wrapper.ytmusic-two-row-item-renderer img.yt-img-shadow {
  transition: transform 0.3s ease;
}
.slider-knob-inner.tp-yt-paper-slider {
  transition: background 0.3s ease-in, border 0.18s ease-in;
}
.autoscroll-resume-button {
  background: var(--btn-color);
  border: var(--ui-border);
  backdrop-filter: blur(var(--ui-blur));
}
.autoscroll-resume-button {
  border-radius: var(--radius-btn);
}

/* ========================== ARTIST PAGE ========================== */
ytmusic-immersive-header-renderer {
  background: var(--ytmusic-app);
}
ytmusic-immersive-header-renderer .image {
  margin-left: 0 !important;
  opacity: 0.8;
  filter: brightness(0.95);
}
.description.ytmusic-immersive-header-renderer {
  color: var(--text-primary);
}
ytmusic-toggle-button-renderer yt-formatted-string.ytmusic-toggle-button-renderer {
  color: var(--accent);
}
ytmusic-immersive-header-renderer[is-description-expanded] .image {
  filter: brightness(0.55);
}
ytmusic-responsive-list-item-renderer[is-checked] {
  background-color: var(--ui-highlight);
}
.more-button.ytmusic-shelf-renderer {
  margin: 16px 0;
}
/* Artist Header */
.image.ytmusic-immersive-header-renderer {
  mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  mask-repeat: no-repeat;
  mask-size: 100%;
}
.ytmusic-browse-response .content-container-wrapper,
.content-container-wrapper .gradient-container {
  background: transparent !important;
}
/* Sub Button */
ytmusic-subscribe-button-renderer {
  --ytmusic-subscribe-button-outline-color: transparent;
  --ytmusic-subscribe-button-color: var(--accent);
  background: rgb(from var(--accent) r g b/0.2);
  border-radius: var(--radius-btn-alt);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--btn-border);
}
ytmusic-subscribe-button-renderer:hover {
  background: rgb(from var(--accent) r g b/0.4);
}
ytmusic-subscribe-button-renderer[is-subscribed] {
  --ytmusic-subscribe-button-outline-color: transparent !important;
  --ytmusic-subscribe-button-color: var(--text-primary) !important;
  background: var(--btn-color);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--btn-border) !important;
}
ytmusic-subscribe-button-renderer[is-subscribed]:hover {
  background: var(--btn-highlight);
}
/* Unsub Confirm */
yt-confirm-dialog-renderer[dialog][dialog][dialog] {
  --ytd-user-comment-color: var(--text-primary);
  background: transparent;
}
ytmusic-popup-container tp-yt-paper-dialog.ytmusic-popup-container[role=dialog] {
  outline: none !important;
}
/* Shuffle and Radio Button */
.ytSpecButtonShapeNextMono.ytSpecButtonShapeNextFilled {
  color: var(--accent);
  background: var(--btn-color);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--btn-border);
  border-radius: var(--radius-btn-alt);
}
.ytSpecButtonShapeNextMono.ytSpecButtonShapeNextFilled:hover {
  background: var(--btn-highlight) !important;
  border: var(--btn-border);
}
.ytSpecButtonShapeNextMono.ytSpecButtonShapeNextFilled .yt-icon-shape {
  color: var(--accent-icon);
}
/* User Page */
ytmusic-subscribe-button-renderer.ytmusic-visual-header-renderer {
  background: none;
}
.subscriber-count-text.ytmusic-subscribe-button-renderer {
  color: var(--text-secondary);
}
.ytAttributedStringWhiteSpacePreWrap {
  color: var(--text-primary);
  font-weight: 700;
}
.ytSpecButtonShapeNextOverlay.ytSpecButtonShapeNextText {
  color: var(--text-primary);
}
.ytSpecButtonShapeNextOverlay.ytSpecButtonShapeNextText:hover {
  background: var(--btn-highlight);
}
/* ========================== BACKGROUND ========================== */
/* Lava-lamp effect. Two layers:
   1) ::before - the blurred album art, breathing/drifting/tilting via three
      separately-timed animations combined onto "transform" with
      \`animation-composition: add\` so they all apply at once.
   2) ::after - four color blobs blended onto the art with mix-blend-mode,
      rising/falling on one shared timeline, pushed through a blur+contrast
      pass so overlapping blobs read as fused globs rather than flat circles. */
@keyframes lava-pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
  100% {
    transform: scale(1);
  }
}
@keyframes lava-drift {
  0% {
    transform: translate(0%, 0%);
  }
  25% {
    transform: translate(-3%, 2%);
  }
  50% {
    transform: translate(2%, -3%);
  }
  75% {
    transform: translate(-2%, -2%);
  }
  100% {
    transform: translate(0%, 0%);
  }
}
@keyframes lava-tilt {
  0% {
    transform: rotate(-4deg);
  }
  50% {
    transform: rotate(4deg);
  }
  100% {
    transform: rotate(-4deg);
  }
}
@keyframes lava-blobs {
  0% {
    background-position: 18% 130%, 78% 140%, 35% 150%, 88% 115%;
  }
  12.5% {
    background-position: 26% 108%, 60% 118%, 55% 128%, 65% 100%;
  }
  25% {
    background-position: 38% 88%, 38% 100%, 68% 108%, 48% 92%;
  }
  37.5% {
    background-position: 20% 68%, 55% 82%, 50% 90%, 70% 78%;
  }
  50% {
    background-position: 45% 48%, 25% 62%, 30% 70%, 85% 55%;
  }
  62.5% {
    background-position: 15% 28%, 50% 45%, 60% 50%, 55% 38%;
  }
  75% {
    background-position: 35% 5%, 70% 20%, 20% 30%, 75% 15%;
  }
  87.5% {
    background-position: 55% -10%, 30% 0%, 45% 8%, 40% -5%;
  }
  100% {
    background-position: 20% -25%, 68% -20%, 40% -15%, 85% -30%;
  }
}
#browse-page::before,
#search-page::before,
ytmusic-player-page::before,
ytmusic-player-page[is-mweb-modernization-enabled] #main-panel::before {
  content: "";
  position: fixed;
  inset: -15%;
  height: 140vh;
  background: var(--lava-art);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  z-index: -50;
  filter: blur(var(--bg-blur)) saturate(var(--bg-saturate)) brightness(var(--bg-brightness));
  opacity: var(--bg-player-opacity);
  transform: scale(var(--bg-scale));
  transform-origin: center center;
  animation: lava-pulse 10s ease-in-out infinite, lava-drift 15s ease-in-out infinite, lava-tilt 20s ease-in-out infinite;
  animation-composition: add;
  will-change: transform;
}
#browse-page::after,
#search-page::after,
ytmusic-player-page::after,
ytmusic-player-page[is-mweb-modernization-enabled] #main-panel::after {
  content: "";
  position: fixed;
  inset: -15%;
  height: 140vh;
  z-index: -49;
  pointer-events: none;
  background-repeat: no-repeat;
  background-image: radial-gradient(circle farthest-side, var(--accent) 0%, var(--accent) 45%, transparent 58%), radial-gradient(circle farthest-side, rgb(255, 255, 255) 0%, rgba(255, 255, 255, 0.95) 40%, transparent 54%), radial-gradient(circle farthest-side, var(--accent) 0%, var(--accent) 48%, transparent 62%), radial-gradient(circle farthest-side, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.95) 38%, transparent 51%);
  background-size: 55% 55%, 40% 40%, 65% 65%, 35% 35%;
  mix-blend-mode: soft-light;
  filter: blur(20px) brightness(50) saturate(150%);
  animation: lava-blobs 90s steps(var(--bg-swirl-steps, 40)) alternate infinite;
}
ytmusic-player-page[is-mweb-modernization-enabled] #main-panel::after {
  inset: -25%;
  height: auto;
  animation-direction: reverse;
}
#browse-page::before,
#search-page::before,
ytmusic-player-page::before,
ytmusic-player-page[is-mweb-modernization-enabled] #main-panel::before {
  transition: background var(--anim-bg-duration) var(--anim-bg-timing);
  will-change: background;
}
/* Background Fix */
.background-gradient {
  background: none !important;
}
ytmusic-fullbleed-thumbnail-renderer[is-background] .image {
  mask-image: linear-gradient(transparent);
}
@media (min-width: 615px) {
ytmusic-player-page {
    background: none;
  }
}
/* Transparent Player Page */
ytmusic-player-page:not([is-mweb-modernization-enabled]) {
  background: none !important;
}
ytmusic-app-layout[player-page-open]:not([is-mweb-modernization-enabled]) > #content {
  visibility: visible !important;
}
/* ========================== HOMEPAGE ========================== */
ytmusic-app-layout > [slot=player-bar] {
  width: 100vw;
}
/* Title */
.strapline.ytmusic-shelf-renderer,
.ytmusicCardShelfHeaderBasicRendererStrapline,
.strapline.ytmusic-carousel-shelf-basic-header-renderer {
  color: var(--accent);
}
/* Nav Bar */
#nav-bar-background.ytmusic-app-layout,
ytmusic-app-layout.content-scrolled #nav-bar-divider {
  opacity: 1;
  backdrop-filter: blur(var(--ui-blur));
  background: var(--ui-color);
  border-bottom: var(--ui-border) !important;
  border-top: 0 !important;
}
ytmusic-app-layout #mini-guide-background.ytmusic-app-layout,
ytmusic-app-layout.content-scrolled #mini-guide-background.ytmusic-app-layout {
  opacity: 0;
  transition: none;
  will-change: unset;
}
/* Drawer */
ytmusic-app #guide-wrapper.ytmusic-app {
  background: var(--ui-color);
  padding: 2px;
  border-right: var(--ui-border);
  backdrop-filter: blur(var(--ui-blur));
}
#layout[player-page-open] #guide-wrapper {
  background: var(--ui-color) !important;
  border-right: var(--ui-border) !important;
}
#layout[player-page-open] #nav-bar-background {
  background: var(--ui-color) !important;
  border-bottom: var(--ui-border) !important;
}
tp-yt-paper-item.ytmusic-guide-entry-renderer:hover {
  background: var(--ui-highlight);
}
#divider {
  border: 0 !important;
}
/*Drawer hover play button */
ytmusic-guide-entry-renderer #play-button.ytmusic-guide-entry-renderer {
  background: transparent !important;
}
ytmusic-guide-entry-renderer .content-wrapper.ytmusic-play-button-renderer {
  background: transparent;
}
/* New Playlist Button */
.ytSpecButtonShapeNextMono.ytSpecButtonShapeNextTonal {
  background: var(--btn-color);
  border: var(--btn-border);
  color: var(--accent);
  border-radius: var(--radius-btn-alt);
}
.ytSpecButtonShapeNextMono.ytSpecButtonShapeNextTonal:hover {
  background: var(--btn-highlight);
  border: var(--btn-border);
}
.ytSpecButtonShapeNextMono.ytSpecButtonShapeNextTonal .yt-icon-shape {
  color: var(--accent-icon);
}
/* Carousel Buttons */
yt-icon-button.ytmusic-carousel-shelf-renderer,
.ytSpecButtonShapeNextMono.ytSpecButtonShapeNextOutline {
  background: var(--btn-color);
  border: var(--btn-border);
  color: var(--text-primary);
  border-radius: var(--radius-btn-alt);
}
yt-icon-button.ytmusic-carousel-shelf-renderer:hover,
.ytSpecButtonShapeNextMono.ytSpecButtonShapeNextOutline:hover {
  background: var(--btn-highlight);
}
/* Big Persistent Play Button To Small */
ytmusic-play-button-renderer[size=MUSIC_PLAY_BUTTON_SIZE_HUGE] {
  --ytmusic-play-button-size: 40px;
  --ytmusic-play-button-icon-size: 24px;
}
.thumbnail-overlay.ytmusic-two-row-item-renderer[content-position=MUSIC_ITEM_THUMBNAIL_OVERLAY_CONTENT_POSITION_CENTERED] #content {
  align-items: end;
  justify-content: right;
  bottom: 12px;
  right: 12px;
}
ytmusic-play-button-renderer[size=MUSIC_PLAY_BUTTON_SIZE_HUGE] .content-wrapper {
  background: rgba(0, 0, 0, 0.6);
  opacity: 0;
}
ytmusic-item-thumbnail-overlay-renderer:hover ytmusic-play-button-renderer[size=MUSIC_PLAY_BUTTON_SIZE_HUGE] .content-wrapper {
  opacity: 1;
}
ytmusic-play-button-renderer[size=MUSIC_PLAY_BUTTON_SIZE_HUGE] .content-wrapper:hover {
  background: black;
}
ytmusic-play-button-renderer[size=MUSIC_PLAY_BUTTON_SIZE_HUGE]:is([state=paused], [state=playing]) .content-wrapper {
  opacity: 1;
}
@media (max-width: 615px) {
ytmusic-nav-bar:has(ytmusic-search-box[opened], [has-query]) .ytmusic-logo {
    display: none;
  }
}
/* ========================== MOBILE VIEW ========================== */
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state] #side-panel.ytmusic-player-page {
  height: 100vh;
  background: transparent;
}
ytmusic-player-page #top-player-bar {
  background: transparent;
  z-index: 1;
  backdrop-filter: none;
}
@media (max-width: 615px) {
/* Overlay behind the tab list */
#tab-renderer {
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.5));
  }
}
.play-pause-button-wrapper.ytmusic-player-controls {
  color: transparent;
  background: transparent;
  transform: scale(1.2);
}
.next-button.ytmusic-player-controls,
.previous-button.ytmusic-player-controls,
.shuffle.ytmusic-player-controls,
.repeat.ytmusic-player-controls {
  color: transparent;
  background: transparent !important;
}
/* Tab opening transition */
ytmusic-player-page[is-mweb-modernization-enabled] #main-panel {
  transform: none !important;
}
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=TABS_VIEW] .av,
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=TABS_VIEW] #info-panel,
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=TABS_VIEW] #player-controls,
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=TABS_VIEW] .collapse-button,
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=TABS_VIEW] .context-menu-button {
  opacity: 0;
}
ytmusic-player-page[player-page-ui-state=TABS_VIEW] #thumbnail > img {
  border-radius: calc(var(--radius-art) * 10);
}
ytmusic-player-page[is-mweb-modernization-enabled][player-page-ui-state=TABS_VIEW] #music-player-wrapper {
  transform: translateY(6.5rem);
}
/* ========================== PLAYER PAGE ========================== */
ytmusic-app-layout:not([player-page-open]):not([is-mweb-player-bar-modernization-enabled]) > [slot=player-page] {
  transform: translate3d(0, 120vh, 0);
}
/* Player Page Background Re-position */
ytmusic-app-layout:not([is-mweb-modernization-enabled]) > [slot=player-page] {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  box-sizing: border-box;
  padding-top: var(--ytmusic-nav-bar-height);
  padding-left: var(--ytmusic-guide-width);
  padding-bottom: var(--ytmusic-player-bar-height);
}
ytmusic-player[player-ui-state=MINIPLAYER] {
  bottom: calc(120vh + var(--ytmusic-player-bar-height) + var(--ytmusic-mini-player-spacing)) !important;
}
ytmusic-player-page[is-player-page-layout-fixes-enabled] #main-panel.ytmusic-player-page {
  height: 100%;
}
/* Tab */
tp-yt-paper-tab.ytmusic-player-page {
  color: var(--text-primary);
}
tp-yt-paper-tab.iron-selected.ytmusic-player-page {
  color: var(--accent);
}
.selection-bar.tp-yt-paper-tabs {
  border-bottom: 1px solid var(--accent);
}
.ytmusic-tab-renderer .title {
  color: var(--text-primary) !important;
}
.autoplay.ytmusic-tab-renderer .subtitle.ytmusic-tab-renderer {
  color: var(--text-secondary);
}
.section-heading.ytmusic-add-to-playlist-renderer {
  color: var(--text-primary);
}
/* Queue */
ytmusic-player-queue-item {
  --ytmusic-player-queue-item-thumbnail-size: 42px !important;
  --ytmusic-list-item-height: 58px;
  border-radius: var(--radius-highlight);
  border: 0;
  opacity: 0.825;
  margin-bottom: 8px;
}
ytmusic-player-queue-item:hover {
  background: rgba(255, 255, 255, 0.05);
  opacity: 1;
}
.song-title.ytmusic-player-queue-item,
.subtitle.ytmusic-queue-header-renderer {
  color: var(--text-primary);
}
.byline.ytmusic-player-queue-item {
  color: var(--text-secondary);
}
/* Small Buttons */
#chips a.yt-simple-endpoint.ytmusic-chip-cloud-chip-renderer {
  background: var(--btn-color);
  color: var(--text-primary);
  border-radius: var(--radius-btn);
  border: var(--btn-border);
}
#chips a.yt-simple-endpoint.ytmusic-chip-cloud-chip-renderer:hover {
  background: var(--btn-highlight);
}
ytmusic-chip-cloud-chip-renderer[is-selected] a.ytmusic-chip-cloud-chip-renderer {
  background: var(--btn-highlight) !important;
  color: var(--accent) !important;
}
ytmusic-chip-cloud-chip-renderer[is-selected] a.ytmusic-chip-cloud-chip-renderer:focus {
  background: var(--btn-highlight);
}
#buttons .yt-simple-endpoint {
  background: var(--btn-color);
  color: var(--accent);
  border-radius: var(--radius-btn-alt);
  border: var(--btn-border);
}
#buttons .yt-simple-endpoint .yt-icon-shape {
  color: var(--accent-icon);
}
#buttons .yt-simple-endpoint:hover {
  background: var(--btn-highlight);
}
/* Audio-Video Toggle */
.ytmusic-av-toggle {
  border-radius: var(--radius-btn-alt) !important;
}
.av-toggle.ytmusic-av-toggle {
  background: var(--btn-color);
  border: var(--btn-border);
}
.song-button.ytmusic-av-toggle,
.video-button.ytmusic-av-toggle {
  background: transparent;
  color: var(--text-primary);
}
.description.ytmusic-description-shelf-renderer {
  color: var(--text-primary);
}
ytmusic-tab-renderer.ytmusic-player-page {
  margin-right: -10px;
}
/* Comment */
.ytd-comment-view-model .ytAttributedStringHost,
.ytd-tri-state-button-view-model {
  font-weight: var(--font-weight);
}
.ytSpecButtonShapeNextDisabled {
  opacity: 0.7;
}
.ytSpecButtonShapeNextDisabled.ytSpecButtonShapeNextFilled {
  color: var(--text-secondary);
}
/* ========================== PLAYLIST ========================== */
ytmusic-play-button-renderer.ytmusic-responsive-header-renderer {
  background: var(--btn-color) !important;
}
ytmusic-play-button-renderer.ytmusic-responsive-header-renderer:hover {
  background: var(--btn-highlight) !important;
}
.ytmusic-responsive-header-renderer a.ytmusic-toggle-button-renderer:hover {
  background: var(--btn-highlight);
}
.tab-content.tp-yt-paper-tab {
  color: var(--text-primary);
}
ytmusic-playlist-form[tabbed-ui-enabled] tp-yt-iron-pages.ytmusic-playlist-form .content.ytmusic-playlist-form {
  border-top: 0;
  border-bottom: 0;
}
/* Song select Dialog */
ytmusic-multi-select-menu-bar {
  background: transparent;
}
.text.ytmusic-multi-select-menu-bar {
  color: var(--text-primary);
}
#tooltip {
  background: var(--ui-contrast);
  border-radius: var(--radius-panel);
}
/* Playlist Visibility Dialog */
.ytSpecDialogLayoutHost {
  background: transparent;
}
.ytRadioShapeLabelContainer {
  color: var(--text-primary);
}
.ytDialogHeaderViewModelText {
  color: var(--text-primary);
}
.ytRadioButtonItemViewModelSubText {
  color: var(--text-secondary);
}
/* Collaborate Container */
#header.ytmusic-engagement-panel-title-header-renderer,
#content.ytmusic-engagement-panel-section-list-renderer {
  background: transparent;
}
.ytListItemViewModelTappable {
  border-radius: var(--radius-highlight-lg);
}
.ytListItemViewModelTappable:hover {
  background: var(--ui-highlight);
}
ytmusic-download-playlist-button-renderer,
#action-buttons yt-button-renderer.ytmusic-responsive-header-renderer,
ytmusic-menu-renderer.ytmusic-responsive-header-renderer {
  width: 40px;
  height: 40px;
  background: var(--btn-color) !important;
}
.ytSpecButtonShapeNextCallToAction.ytSpecButtonShapeNextText {
  color: var(--accent);
  background: var(--btn-color);
  border: var(--btn-border);
}
.ytSpecButtonShapeNextCallToAction.ytSpecButtonShapeNextText:hover {
  background: var(--btn-highlight);
  border: var(--btn-border);
}
/* Bookmark Button */
yt-icon-button.ytmusic-toggle-button-renderer {
  --yt-button-icon-size: 40px;
}
ytmusic-section-list-renderer[main-page-type=MUSIC_PAGE_TYPE_PODCAST_SHOW_DETAIL_PAGE] {
  --ytmusic-responsive-header-primary-button-height: 40px;
}
tp-yt-paper-button.ytmusic-toggle-button-renderer {
  width: 40px;
  height: 40px;
}
ytmusic-menu-renderer.ytmusic-responsive-header-renderer .yt-spec-button-shape-next {
  width: 40px;
  height: 40px;
}
/* ========================== SEARCH PAGE ========================== */
/* Tab Below Search */
.tab-container.ytmusic-tabs {
  box-shadow: none !important;
  background: transparent;
  border-bottom: 0;
}
.tab.ytmusic-tabs {
  color: var(--text-primary);
}
.tab.selected.ytmusic-tabs {
  color: var(--accent);
  border-bottom: 1px solid var(--accent);
}
/* When Scrolled */
ytmusic-tabs.stuck {
  box-shadow: none !important;
  background: var(--ui-color);
  backdrop-filter: blur(var(--ui-blur));
}
/* Search Card */
yt-formatted-string.text.style-scope.ytmusic-message-renderer {
  margin-top: 0px !important;
}
.immersive-background.ytmusic-card-shelf-renderer::before {
  background: transparent;
}
.undercards-container.ytmusic-card-shelf-renderer::before,
.card-content-container.ytmusic-card-shelf-renderer::before {
  background: var(--ui-color);
  border: var(--ui-border);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: var(--radius-panel-lg);
}
.undercards-container.ytmusic-card-shelf-renderer {
  padding: 20px;
  gap: 16px;
}
.thumbnail-container.ytmusic-card-shelf-renderer {
  border-radius: var(--radius-art-md);
}
/* Divider */
ytmusic-responsive-list-item-renderer.ytmusic-shelf-renderer,
.ytmusic-playlist-shelf-renderer {
  border-bottom: 0 !important;
}
ytmusic-message-renderer .text.ytmusic-message-renderer {
  color: var(--text-primary) !important;
}
ytmusic-message-renderer .yt-icon-shape {
  color: var(--icon);
}
/* ========================== PODCAST ========================== */
ytmusic-player-page[player-fullscreened] ytmusic-description-shelf-renderer {
  display: none;
}
ytmusic-multi-row-list-item-renderer[is-detailed-view] {
  --ytmusic-list-item-height: 182px;
  --ytmusic-multi-row-list-item-thumbnail-size: 80px;
}
/* Podcast Header */
ytmusic-visual-header-renderer[has-banner-image] .gradient-container.ytmusic-visual-header-renderer {
  background: transparent;
}
.image.ytmusic-visual-header-renderer {
  mask-image: linear-gradient(to bottom, black 40%, transparent 100%);
  mask-repeat: no-repeat;
  mask-size: 100%;
}
/* Podcast Hover */
.thumbnail-wrapper.ytmusic-multi-row-list-item-renderer {
  position: relative;
  border-radius: var(--radius-art);
}
ytmusic-multi-row-list-item-renderer.ytmusic-shelf-renderer .thumbnail-overlay {
  aspect-ratio: 16/9;
  top: auto;
  bottom: auto;
  height: auto;
}
.menu.ytmusic-multi-row-list-item-renderer {
  background: transparent !important;
}
ytmusic-responsive-header-renderer ytmusic-toggle-button-renderer.ytmusic-responsive-header-renderer {
  background: var(--btn-color) !important;
  border: var(--btn-border) !important;
}
/* Podcast Focused */
ytmusic-multi-row-list-item-renderer[play-button-state] {
  border-radius: var(--radius-highlight-lg);
}
ytmusic-multi-row-list-item-renderer.ytmusic-shelf-renderer {
  border-bottom: 0 !important;
}
/* Progress Bar */
.foreground-bar.ytmusic-playback-progress-renderer {
  background: var(--accent);
}
.subtitle.ytmusic-multi-row-list-item-renderer {
  color: var(--text-secondary);
}
`;
  const CSS_YT = `
:root {
  --bg-player-opacity:1;
  --accent:white
}

@keyframes lava-pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes lava-drift {
  0% {
    transform: translate(0%, 0%);
  }
  25% {
    transform: translate(-3%, 2%);
  }
  50% {
    transform: translate(2%, -3%);
  }
  75% {
    transform: translate(-2%, -2%);
  }
  100% {
    transform: translate(0%, 0%);
  }
}

@keyframes lava-tilt {
  0% {
    transform: rotate(-4deg);
  }
  50% {
    transform: rotate(4deg);
  }
  100% {
    transform: rotate(-4deg);
  }
}

@keyframes lava-blobs {
  0% {
    background-position: 18% 130%, 78% 140%, 35% 150%, 88% 115%;
  }
  12.5% {
    background-position: 26% 108%, 60% 118%, 55% 128%, 65% 100%;
  }
  25% {
    background-position: 38% 88%, 38% 100%, 68% 108%, 48% 92%;
  }
  37.5% {
    background-position: 20% 68%, 55% 82%, 50% 90%, 70% 78%;
  }
  50% {
    background-position: 45% 48%, 25% 62%, 30% 70%, 85% 55%;
  }
  62.5% {
    background-position: 15% 28%, 50% 45%, 60% 50%, 55% 38%;
  }
  75% {
    background-position: 35% 5%, 70% 20%, 20% 30%, 75% 15%;
  }
  87.5% {
    background-position: 55% -10%, 30% 0%, 45% 8%, 40% -5%;
  }
  100% {
    background-position: 20% -25%, 68% -20%, 40% -15%, 85% -30%;
  }
}

div.lava-blobs {
  position:fixed;
  inset:-15%;
  height:140vh;
  z-index:-49;
  pointer-events:none;
  display:none;
  background-repeat:no-repeat;
  background-image:radial-gradient(circle farthest-side,var(--accent) 0%,var(--accent) 45%,transparent 58%),radial-gradient(circle farthest-side,rgba(255,255,255,1) 0%,rgba(255,255,255,.95) 40%,transparent 54%),radial-gradient(circle farthest-side,var(--accent) 0%,var(--accent) 48%,transparent 62%),radial-gradient(circle farthest-side,rgba(255,255,255,.85) 0%,rgba(255,255,255,.95) 38%,transparent 51%);
  background-size:55% 55%,40% 40%,65% 65%,35% 35%;
  mix-blend-mode:soft-light;
  filter:blur(20px) brightness(50) saturate(150%);
  animation:lava-blobs 90s steps(var(--bg-swirl-steps,40)) alternate infinite
}
`;
  // Music skin ported to youtube.com (shared components + hand-made equivalents)
  const CSS_YT_SKIN = `
html[data-lava-on] {
  --ui-color: transparent;
  --ui-contrast: rgba(255, 255, 255, 0.1);
  --ui-highlight: rgba(255, 255, 255, 0.1);
  --btn-color: rgba(255, 255, 255, 0.1);
  --btn-highlight: rgba(255, 255, 255, 0.2);
  --font-family: Inter, Roboto, Arial, sans-serif;
  --font-weight: 400;
  --text-primary: white;
  --text-secondary: rgba(255, 255, 255, 0.7);
  --icon: white;
  --accent: white;
  --accent-icon: white;
  --accent-highlight: white;
  --ui-blur: 10px;
  --ui-border: transparent;
  --btn-border: transparent;
  --ui-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  --radius-art: 8px;
  --radius-art-md: 16px;
  --radius-art-lg: 20px;
  --radius-btn: 12px;
  --radius-btn-alt: 16px;
  --radius-highlight: 8px;
  --radius-highlight-lg: 12px;
  --radius-panel-lg: 24px;
  --radius-panel: 12px;
  --anim-fade-duration: 0.3s;
  --anim-fade-duration-alt: 0.5s;
  --anim-fade-timing: ease;
  --anim-drawer-duration: 0.3s;
  --anim-drawer-timing: ease;
}

/* ===== Shared components copied from the Music skin ===== */
html[data-lava-on] yt-formatted-string,
html[data-lava-on] tp-yt-paper-item {
  font-family: var(--font-family) !important;
  font-weight: var(--font-weight);
}
html[data-lava-on] yt-formatted-string.title {
  color: var(--text-primary) !important;
  --yt-endpoint-color: var(--text-primary) !important;
  --yt-endpoint-hover-color: var(--text-primary) !important;
  --yt-endpoint-visited-color: var(--text-primary) !important;
}
html[data-lava-on] yt-icon {
  color: var(--icon);
}
html[data-lava-on] a.yt-simple-endpoint.yt-formatted-string {
  --yt-spec-call-to-action: var(--accent);
  --yt-endpoint-color: var(--text-primary);
  --yt-endpoint-visited-color: var(--text-primary);
  --yt-endpoint-hover-color: var(--accent-highlight);
}
html[data-lava-on] a.yt-simple-endpoint.yt-formatted-string:hover {
  text-decoration: underline;
}
html[data-lava-on] .ytSpecButtonShapeNextMono.ytSpecButtonShapeNextText {
  color: var(--icon);
}
html[data-lava-on] .ytSpecButtonShapeNextHost[aria-pressed=true] {
  color: var(--accent-icon);
}
html[data-lava-on] tp-yt-paper-ripple.tp-yt-paper-tab {
  color: transparent;
}
html[data-lava-on] textarea.tp-yt-iron-autogrow-textarea {
  color: var(--text-primary);
}
html[data-lava-on] .stroke.yt-interaction,
html[data-lava-on] .fill.yt-interaction {
  border: 0;
  background: transparent;
}
html[data-lava-on] yt-img-shadow[object-fit=CONTAIN] img {
  border-radius: var(--radius-art);
  object-fit: cover !important;
  overflow: hidden;
}
html[data-lava-on] tp-yt-iron-input.tp-yt-paper-input > input.tp-yt-paper-input {
  color: var(--text-primary);
}
html[data-lava-on] .yt-list-item-view-model__title {
  color: var(--text-primary);
}
html[data-lava-on] .unfocused-line.tp-yt-paper-input-container {
  border-color: rgba(255, 255, 255, 0.4);
}
html[data-lava-on] .focused-line.tp-yt-paper-input-container {
  border-color: var(--accent);
}
html[data-lava-on] .ytSwitchShapeTrack {
  background: var(--btn-color);
}
html[data-lava-on] .ytSwitchShapeKnob {
  background: rgba(255, 255, 255, 0.3);
}
html[data-lava-on] .ytSwitchShapeKnobActive {
  background: var(--accent);
}
html[data-lava-on] .dropdown-content.tp-yt-paper-menu-button {
  --yt-spec-brand-background-primary: transparent;
  background: var(--ui-color);
  box-shadow: var(--ui-shadow);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: var(--radius-panel-lg);
}
html[data-lava-on] tp-yt-iron-icon.tp-yt-paper-dropdown-menu {
  color: var(--icon);
}
html[data-lava-on] tp-yt-paper-dialog[modern] {
  --yt-spec-brand-background-primary: transparent;
  background: var(--ui-color);
  backdrop-filter: blur(var(--ui-blur));
  box-shadow: var(--ui-shadow);
  border-radius: var(--radius-panel-lg);
  border: var(--ui-border);
}
html[data-lava-on] tp-yt-paper-listbox#items yt-formatted-string {
  color: var(--text-primary);
}
html[data-lava-on] ytd-simple-menu-header-renderer {
  background: transparent;
}
html[data-lava-on] ytd-compact-link-renderer {
  --yt-compact-link-icon-color: var(--icon);
  border-radius: var(--radius-highlight);
}
html[data-lava-on] ytd-compact-link-renderer:hover {
  background: var(--ui-highlight) !important;
}
html[data-lava-on] tp-yt-paper-item:focus:before {
  border-radius: var(--radius-highlight);
}
html[data-lava-on] ytd-account-item-renderer {
  --yt-spec-text-primary: var(--accent);
  border-radius: var(--radius-highlight-lg);
}
html[data-lava-on] #email.ytd-google-account-header-renderer {
  color: var(--text-secondary);
}
html[data-lava-on] yt-formatted-string.ytd-account-item-renderer[secondary] {
  color: var(--text-secondary);
}
html[data-lava-on] tp-yt-paper-toast,
html[data-lava-on] tp-yt-paper-toast.yt-notification-action-renderer {
  color: var(--text-primary);
  background: var(--ui-color);
  border-radius: var(--radius-panel);
  border: var(--ui-border);
  box-shadow: var(--ui-shadow);
  backdrop-filter: blur(var(--ui-blur));
}
html[data-lava-on] #text.yt-notification-action-renderer,
html[data-lava-on] #sub-text.yt-notification-action-renderer {
  color: var(--text-primary);
}
html[data-lava-on] .ytSpecButtonShapeNextCallToActionInverse.ytSpecButtonShapeNextText {
  color: var(--accent);
}
html[data-lava-on] .ytSpecButtonShapeNextCallToActionInverse.ytSpecButtonShapeNextText:hover {
  background: var(--btn-highlight) !important;
}
html[data-lava-on] #bar.yt-copy-link-renderer {
  background: var(--ui-contrast);
  border: var(--ui-border);
}
html[data-lava-on] #checkbox.tp-yt-paper-checkbox {
  border-color: var(--btn-color);
  background: var(--btn-color);
  --paper-checkbox-checked-color: var(--btn-color);
}
html[data-lava-on] #checkmark.tp-yt-paper-checkbox {
  border-color: var(--icon);
}
html[data-lava-on] .ytSpecButtonShapeNextCallToAction.ytSpecButtonShapeNextFilled {
  color: var(--accent);
  background: var(--btn-color);
  border-radius: var(--radius-btn-alt);
}
html[data-lava-on] .ytSpecButtonShapeNextCallToAction.ytSpecButtonShapeNextFilled:hover {
  background: var(--btn-highlight);
}
html[data-lava-on] .scroll-button.yt-third-party-share-target-section-renderer {
  background: var(--btn-color);
  backdrop-filter: blur(var(--ui-blur));
  box-shadow: none;
}
html[data-lava-on] .scroll-button.yt-third-party-share-target-section-renderer .yt-icon-shape {
  color: var(--icon);
}
html[data-lava-on] yt-formatted-string.yt-start-at-renderer {
  color: var(--text-secondary);
}
html[data-lava-on] tp-yt-paper-listbox.yt-dropdown-menu {
  background: transparent;
}
html[data-lava-on] tp-yt-paper-listbox.yt-dropdown-menu .iron-selected.yt-dropdown-menu,
html[data-lava-on] tp-yt-paper-listbox.yt-dropdown-menu tp-yt-paper-item.yt-dropdown-menu:hover {
  background: var(--ui-highlight);
  border-radius: var(--radius-highlight);
}
html[data-lava-on] yt-card-item-container-renderer {
  border: 0;
}
html[data-lava-on] #primaryProgress.tp-yt-paper-progress {
  --paper-progress-active-color: var(--accent);
}
html[data-lava-on] .spinner-layer.tp-yt-paper-spinner-lite {
  color: var(--icon);
}
html[data-lava-on] .toggle-bar.tp-yt-paper-toggle-button {
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  opacity: 0.5;
}
html[data-lava-on] .toggle-button.tp-yt-paper-toggle-button {
  background: rgb(180, 180, 180);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
html[data-lava-on] tp-yt-paper-toggle-button[checked]:not([disabled]) .toggle-bar.tp-yt-paper-toggle-button,
html[data-lava-on] tp-yt-paper-toggle-button[checked]:not([disabled]) .toggle-button.tp-yt-paper-toggle-button {
  background: var(--accent);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
html[data-lava-on] a.yt-simple-endpoint.yt-formatted-string {
  transition: color var(--anim-fade-duration) var(--anim-fade-timing);
}
html[data-lava-on] yt-checkbox-renderer {
  transition: opacity var(--anim-fade-duration) var(--anim-fade-timing);
}
html[data-lava-on] tp-yt-paper-item.yt-dropdown-menu {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
html[data-lava-on] ytd-compact-link-renderer {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
html[data-lava-on] ytd-account-item-renderer {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
html[data-lava-on] .ytSpecButtonShapeNextMono,
html[data-lava-on] .ytSpecButtonShapeNextCallToAction,
html[data-lava-on] .ytSpecButtonShapeNextCallToActionInverse,
html[data-lava-on] .ytSpecButtonShapeNextOverlay {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
html[data-lava-on] .ytListItemViewModelTappable {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
html[data-lava-on] .yt-simple-endpoint {
  transition: background var(--anim-fade-duration) var(--anim-fade-timing), color var(--anim-fade-duration) var(--anim-fade-timing);
}
html[data-lava-on] tp-yt-app-drawer {
  transition-duration: var(--anim-drawer-duration) !important;
}
html[data-lava-on] #primaryProgress.tp-yt-paper-progress,
html[data-lava-on] #secondaryProgress.tp-yt-paper-progress {
  transition: transform 1s linear;
}
html[data-lava-on] #progressContainer.tp-yt-paper-progress {
  transition: height 0.2s ease-out;
}
html[data-lava-on] .slider-knob-inner.tp-yt-paper-slider {
  transition: background 0.3s ease-in, border 0.18s ease-in;
}
html[data-lava-on] yt-confirm-dialog-renderer[dialog][dialog][dialog] {
  --ytd-user-comment-color: var(--text-primary);
  background: transparent;
}
html[data-lava-on] .ytSpecButtonShapeNextMono.ytSpecButtonShapeNextFilled {
  color: var(--accent);
  background: var(--btn-color);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--btn-border);
  border-radius: var(--radius-btn-alt);
}
html[data-lava-on] .ytSpecButtonShapeNextMono.ytSpecButtonShapeNextFilled:hover {
  background: var(--btn-highlight) !important;
  border: var(--btn-border);
}
html[data-lava-on] .ytSpecButtonShapeNextMono.ytSpecButtonShapeNextFilled .yt-icon-shape {
  color: var(--accent-icon);
}
html[data-lava-on] .ytAttributedStringWhiteSpacePreWrap {
  color: var(--text-primary);
  font-weight: 700;
}
html[data-lava-on] .ytSpecButtonShapeNextOverlay.ytSpecButtonShapeNextText {
  color: var(--text-primary);
}
html[data-lava-on] .ytSpecButtonShapeNextOverlay.ytSpecButtonShapeNextText:hover {
  background: var(--btn-highlight);
}
html[data-lava-on] .ytSpecButtonShapeNextMono.ytSpecButtonShapeNextTonal {
  background: var(--btn-color);
  border: var(--btn-border);
  color: var(--accent);
  border-radius: var(--radius-btn-alt);
}
html[data-lava-on] .ytSpecButtonShapeNextMono.ytSpecButtonShapeNextTonal:hover {
  background: var(--btn-highlight);
  border: var(--btn-border);
}
html[data-lava-on] .ytSpecButtonShapeNextMono.ytSpecButtonShapeNextTonal .yt-icon-shape {
  color: var(--accent-icon);
}
html[data-lava-on] .ytSpecButtonShapeNextMono.ytSpecButtonShapeNextOutline {
  background: var(--btn-color);
  border: var(--btn-border);
  color: var(--text-primary);
  border-radius: var(--radius-btn-alt);
}
html[data-lava-on] .ytSpecButtonShapeNextMono.ytSpecButtonShapeNextOutline:hover {
  background: var(--btn-highlight);
}
html[data-lava-on] .selection-bar.tp-yt-paper-tabs {
  border-bottom: 1px solid var(--accent);
}
html[data-lava-on] .ytd-comment-view-model .ytAttributedStringHost,
html[data-lava-on] .ytd-tri-state-button-view-model {
  font-weight: var(--font-weight);
}
html[data-lava-on] .ytSpecButtonShapeNextDisabled {
  opacity: 0.7;
}
html[data-lava-on] .ytSpecButtonShapeNextDisabled.ytSpecButtonShapeNextFilled {
  color: var(--text-secondary);
}
html[data-lava-on] .tab-content.tp-yt-paper-tab {
  color: var(--text-primary);
}
html[data-lava-on] .ytSpecDialogLayoutHost {
  background: transparent;
}
html[data-lava-on] .ytRadioShapeLabelContainer {
  color: var(--text-primary);
}
html[data-lava-on] .ytDialogHeaderViewModelText {
  color: var(--text-primary);
}
html[data-lava-on] .ytRadioButtonItemViewModelSubText {
  color: var(--text-secondary);
}
html[data-lava-on] .ytListItemViewModelTappable {
  border-radius: var(--radius-highlight-lg);
}
html[data-lava-on] .ytListItemViewModelTappable:hover {
  background: var(--ui-highlight);
}
html[data-lava-on] .ytSpecButtonShapeNextCallToAction.ytSpecButtonShapeNextText {
  color: var(--accent);
  background: var(--btn-color);
  border: var(--btn-border);
}
html[data-lava-on] .ytSpecButtonShapeNextCallToAction.ytSpecButtonShapeNextText:hover {
  background: var(--btn-highlight);
  border: var(--btn-border);
}

/* ===== Hand-made YouTube equivalents of the Music skin =====
   Everything is scoped to html[data-lava-on], so the toggle switches the whole skin on/off. */

/* Scrollbars hidden everywhere, same as on Music */
html[data-lava-on],
html[data-lava-on] * {
  scrollbar-width: none !important;
}

/* Font */
html[data-lava-on] body,
html[data-lava-on] input,
html[data-lava-on] button,
html[data-lava-on] textarea,
html[data-lava-on] yt-formatted-string,
html[data-lava-on] #video-title {
  font-family: var(--font-family) !important;
}

/* Menus, popups and dialogs: frosted glass */
html[data-lava-on] ytd-menu-popup-renderer,
html[data-lava-on] ytd-multi-page-menu-renderer,
html[data-lava-on] ytd-unified-share-panel-renderer,
html[data-lava-on] yt-contextual-sheet-layout,
html[data-lava-on] tp-yt-paper-dialog,
html[data-lava-on] yt-confirm-dialog-renderer,
html[data-lava-on] ytd-add-to-playlist-renderer,
html[data-lava-on] ytd-searchbox-spt #suggestions-wrapper {
  background: var(--ui-color) !important;
  -webkit-backdrop-filter: blur(var(--ui-blur));
  backdrop-filter: blur(var(--ui-blur));
  border-radius: var(--radius-panel-lg);
  box-shadow: var(--ui-shadow);
  border: var(--ui-border);
}
html[data-lava-on] tp-yt-paper-listbox,
html[data-lava-on] ytd-multi-page-menu-renderer #header,
html[data-lava-on] ytd-menu-popup-renderer tp-yt-paper-listbox {
  background: transparent !important;
}
html[data-lava-on] ytd-menu-service-item-renderer:hover,
html[data-lava-on] tp-yt-paper-item:hover {
  background: var(--ui-highlight) !important;
  border-radius: var(--radius-highlight);
}

/* Filter chips (All / From ... / Related), same glass pills as Music */
html[data-lava-on] .ytChipShapeChip,
html[data-lava-on] yt-chip-cloud-chip-renderer #chip-container {
  background: var(--btn-color) !important;
  color: var(--text-primary) !important;
  border-radius: var(--radius-btn) !important;
  border: var(--btn-border);
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
html[data-lava-on] .ytChipShapeChip:hover,
html[data-lava-on] yt-chip-cloud-chip-renderer #chip-container:hover {
  background: var(--btn-highlight) !important;
}
html[data-lava-on] .ytChipShapeChip.ytChipShapeActive,
html[data-lava-on] yt-chip-cloud-chip-renderer[selected] #chip-container {
  background: var(--btn-highlight) !important;
  color: var(--accent) !important;
}

/* Side menu entries */
html[data-lava-on] ytd-guide-entry-renderer #endpoint {
  border-radius: var(--radius-highlight-lg);
  transition: background var(--anim-fade-duration) var(--anim-fade-timing);
}
html[data-lava-on] ytd-guide-entry-renderer #endpoint:hover,
html[data-lava-on] ytd-guide-entry-renderer[active] #endpoint,
html[data-lava-on] ytd-mini-guide-entry-renderer:hover {
  background: var(--ui-highlight) !important;
}

/* Video player and thumbnails: rounded like the album art (not in fullscreen) */
html[data-lava-on] ytd-watch-flexy:not([fullscreen]) #player-container-outer,
html[data-lava-on] ytd-watch-flexy:not([fullscreen]) #movie_player {
  border-radius: var(--radius-art-lg);
  overflow: hidden;
}
html[data-lava-on] ytd-thumbnail,
html[data-lava-on] yt-thumbnail-view-model {
  border-radius: var(--radius-art-md) !important;
  overflow: hidden;
}

/* Comments */
html[data-lava-on] ytd-comment-view-model #content-text,
html[data-lava-on] ytd-comment-view-model #author-text,
html[data-lava-on] ytd-comments-header-renderer #title,
html[data-lava-on] ytd-comment-simplebox-renderer #placeholder-area {
  color: var(--text-primary) !important;
}
html[data-lava-on] ytd-comment-view-model #published-time-text,
html[data-lava-on] ytd-comment-view-model #vote-count-middle,
html[data-lava-on] ytd-comments-header-renderer #count {
  color: var(--text-secondary) !important;
}
html[data-lava-on] ytd-comment-simplebox-renderer #underline,
html[data-lava-on] ytd-commentbox #underline {
  border-color: rgba(255, 255, 255, 0.4);
}
html[data-lava-on] ytd-commentbox #underline .style-scope[class*="focus"] {
  border-color: var(--accent);
}

`;

  const log = function () {
    if (CONFIG.debug) console.debug.apply(console, ['[LavaLamp]'].concat([].slice.call(arguments)));
  };

  // On music.youtube.com: the full theme. On youtube.com: only the lava keyframes + the ported skin.
  addStyle(IS_MUSIC ? CSS : CSS_YT + CSS_YT_SKIN);

  /* Like / dislike pill: the theme rounds every tonal button, which also rounded the inner edges of the
     two halves, so they overlapped with a faint grey edge. Square the inner edges back into one pill. */
  (function () {
    const S = IS_MUSIC ? '' : 'html[data-lava-on] ';
    const START = '.ytSpecButtonShapeNextSegmentedStart';
    const END = '.ytSpecButtonShapeNextSegmentedEnd';
    addStyle(
      S + START + ',' + S + START + ':hover{border-radius:var(--radius-btn-alt,16px) 0 0 var(--radius-btn-alt,16px)!important;' +
      'border:0!important;box-shadow:none!important;outline:0!important;margin-right:0!important}' +
      S + END + ',' + S + END + ':hover{border-radius:0 var(--radius-btn-alt,16px) var(--radius-btn-alt,16px) 0!important;' +
      'border:0!important;box-shadow:none!important;outline:0!important;margin-left:0!important}' +
      // the thin divider between the halves: keep it, but soft
      S + START + '::after{background:rgba(255,255,255,.14)!important;border:0!important}' +
      // the touch-feedback ring inside each half was drawing the grey outline
      S + START + ' .ytSpecTouchFeedbackShapeStroke,' + S + END + ' .ytSpecTouchFeedbackShapeStroke,' +
      S + START + ' .yt-spec-touch-feedback-shape__stroke,' + S + END + ' .yt-spec-touch-feedback-shape__stroke{' +
      'border-color:transparent!important;border-width:0!important}' +
      S + START + ' yt-touch-feedback-shape,' + S + END + ' yt-touch-feedback-shape,' +
      S + START + ' .ytSpecTouchFeedbackShapeFill,' + S + END + ' .ytSpecTouchFeedbackShapeFill{border-radius:inherit!important}'
    );
  })();

  const SEL_BEFORE =
    '#browse-page::before,#search-page::before,ytmusic-player-page::before,' +
    'ytmusic-player-page[is-mweb-modernization-enabled] #main-panel::before';
  const SEL_AFTER =
    '#browse-page::after,#search-page::after,ytmusic-player-page::after,' +
    'ytmusic-player-page[is-mweb-modernization-enabled] #main-panel::after';
  const SEL_VIDEO = 'canvas.lava-video';
  const SEL_BLOBS = 'div.lava-blobs';

  // Live-editable variables (rewritten whenever a slider moves)
  const overridesEl = makeStyle('');
  function writeOverrides() {
    let css =
      ':root{' +
      '--bg-blur:calc(' + CONFIG.bgBlur + ' * 100px);' +
      '--bg-brightness:' + CONFIG.bgBrightness + ';' +
      '--bg-saturate:' + CONFIG.bgSaturate + ';' +
      '--bg-scale:' + CONFIG.bgScale + ';' +
      '--ui-blur:' + CONFIG.uiBlur + 'px;' +
      '--bg-swirl-steps:' + Math.max(1, Math.round(CONFIG.blobSteps)) + ';' +
      '}';
    if (!CONFIG.blobs) css += SEL_AFTER + ',' + SEL_BLOBS + '{display:none!important}';
    overridesEl.textContent = css;
  }
  writeOverrides();

  /* The drawer and its container paint solid black on the player page; make them see-through. */
  addStyle(
    'tp-yt-app-drawer{--app-drawer-content-container-background-color:transparent!important;' +
    '--app-drawer-scrim-background:transparent!important}' +
    'tp-yt-app-drawer,#scrim.tp-yt-app-drawer,tp-yt-app-drawer #contentContainer,' +
    '#layout[player-page-open] tp-yt-app-drawer,#layout[player-page-open] #contentContainer,' +
    '#layout[player-page-open] #guide-wrapper,#layout[player-page-open] #guide-content,' +
    '#layout[player-page-open] ytmusic-guide-renderer,' +
    '#layout[player-page-open] #mini-guide-background,' +
    '[player-ui-state="PLAYER_PAGE_OPEN"] tp-yt-app-drawer,' +
    '[player-ui-state="PLAYER_PAGE_OPEN"] #guide-wrapper' +
    '{background:transparent!important;background-color:transparent!important}'
  );

  // Base look of the video canvas. Must be added BEFORE the random-motion rule below so that rule wins.
  addStyle(
    SEL_VIDEO + '{position:fixed;top:-15%;left:-15%;width:130%;height:140vh;object-fit:cover;' +
    'pointer-events:none;z-index:-50;' +
    'filter:blur(var(--bg-blur)) saturate(var(--bg-saturate)) brightness(var(--bg-brightness));' +
    'transform:scale(var(--bg-scale));transform-origin:center center;' +
    'animation:lava-pulse 10s ease-in-out infinite,lava-drift 15s ease-in-out infinite,' +
    'lava-tilt 20s ease-in-out infinite;animation-composition:add;will-change:transform;' +
    'opacity:0;transition:opacity .6s ease}' +
    SEL_VIDEO + '.on{opacity:var(--bg-player-opacity,1)}'
  );

  /* ----------------------------- RANDOM LAVA -----------------------------
     The random "shape" of the motion is rolled once (and again on Shuffle / new song).
     Speed and amount are applied on top, so moving those sliders changes the motion
     smoothly instead of re-rolling it, and the current position in the cycle is kept. */
  const rnd = function (a, b) { return a + Math.random() * (b - a); };
  const r1 = function (n) { return Math.round(n * 100) / 100; };
  const sign = function () { return Math.random() < 0.5 ? -1 : 1; };
  const STOPS = 9;
  const motion = () => ({
    speed: Math.max(0.05, Number(CONFIG.motionSpeed) || 1),
    amount: Math.max(0, Number(CONFIG.motionAmount) || 0),
  });

  function newArtBase() {
    return {
      peak: rnd(0.04, 0.12),
      mid: Math.random(),
      drift: [0, 1, 2, 3].map(function () { return [rnd(-1, 1), rnd(-1, 1)]; }),
      tilt: sign() * rnd(2, 6),
      back: rnd(0.6, 1.2),
      d: [rnd(8, 14), rnd(12, 20), rnd(16, 26)],
      ph: [Math.random(), Math.random(), Math.random()],
    };
  }
  function newBlobBase() {
    const b = {
      speed: [0, 1, 2, 3].map(function () { return rnd(0.7, 1.4); }),
      sy: [130, 140, 150, 115].map(function (v) { return v + rnd(-12, 12); }),
      ey: [-25, -20, -15, -30].map(function (v) { return v + rnd(-10, 10); }),
      x0: [0, 1, 2, 3].map(function () { return rnd(10, 90); }),
      dx: [], wy: [],
      dur: rnd(70, 120),
      ph: Math.random(),
    };
    for (let i = 0; i < STOPS; i++) {
      b.dx.push([0, 1, 2, 3].map(function () { return rnd(-28, 28); }));
      b.wy.push([0, 1, 2, 3].map(function () { return rnd(-10, 10); }));
    }
    return b;
  }
  let artBase = newArtBase();
  let blobBase = newBlobBase();
  let artRun = null;   // { durs, delays, at } of the rule currently applied
  let blobRun = null;
  let kfSerial = 0;

  // New negative delay that keeps the animation at the same point of its cycle.
  function keepPhase(run, i, newDur, ph) {
    if (!run) return -ph * newDur;
    const elapsed = (performance.now() - run.at) / 1000 - run.delays[i];
    return -(elapsed / run.durs[i]) * newDur;
  }

  function artKeyframes() {
    const m = motion();
    const b = artBase;
    const n = ++kfSerial;
    const peak = 1 + b.peak * m.amount;
    const mid = 1 + b.peak * m.amount * (0.25 + 0.75 * b.mid);
    const pulse =
      '@keyframes lava-pulse-r' + n + '{0%{transform:scale(1)}' +
      '35%{transform:scale(' + r1(mid) + ')}' +
      '65%{transform:scale(' + r1(peak) + ')}100%{transform:scale(1)}}';
    let drift = '@keyframes lava-drift-r' + n + '{0%{transform:translate(0%,0%)}';
    for (let i = 1; i <= 4; i++) {
      drift += (i * 20) + '%{transform:translate(' + r1(b.drift[i - 1][0] * 4 * m.amount) + '%,' +
        r1(b.drift[i - 1][1] * 4 * m.amount) + '%)}';
    }
    drift += '100%{transform:translate(0%,0%)}}';
    const a = b.tilt * m.amount;
    const tilt =
      '@keyframes lava-tilt-r' + n + '{0%{transform:rotate(' + r1(a) + 'deg)}' +
      '50%{transform:rotate(' + r1(-a * b.back) + 'deg)}' +
      '100%{transform:rotate(' + r1(a) + 'deg)}}';
    const durs = b.d.map(function (x) { return x / m.speed; });
    const delays = durs.map(function (d, i) { return keepPhase(artRun, i, d, b.ph[i]); });
    artRun = { durs: durs, delays: delays, at: performance.now() };
    const rule =
      SEL_BEFORE + ',' + SEL_VIDEO + '{' +
      'animation-name:lava-pulse-r' + n + ',lava-drift-r' + n + ',lava-tilt-r' + n + ';' +
      'animation-duration:' + durs.map(function (x) { return r1(x) + 's'; }).join(',') + ';' +
      'animation-delay:' + delays.map(function (x) { return r1(x) + 's'; }).join(',') + '}';
    return pulse + drift + tilt + rule;
  }

  function blobKeyframes() {
    const m = motion();
    const b = blobBase;
    const name = 'lava-blobs-r' + (++kfSerial);
    const x = b.x0.slice();
    let kf = '@keyframes ' + name + '{';
    for (let i = 0; i < STOPS; i++) {
      const t = i / (STOPS - 1);
      const wobble = Math.sin(Math.PI * t); // no jitter at the off-screen ends
      const pos = [];
      for (let k = 0; k < 4; k++) {
        x[k] = Math.min(95, Math.max(5, x[k] + b.dx[i][k] * m.amount));
        const y = b.sy[k] + (b.ey[k] - b.sy[k]) * Math.pow(t, b.speed[k]) + b.wy[i][k] * m.amount * wobble;
        pos.push(Math.round(x[k]) + '% ' + Math.round(y) + '%');
      }
      kf += r1(t * 100) + '%{background-position:' + pos.join(',') + '}';
    }
    kf += '}';
    const dur = b.dur / m.speed;
    const delay = keepPhase(blobRun, 0, dur, b.ph);
    blobRun = { durs: [dur], delays: [delay], at: performance.now() };
    const rule =
      SEL_AFTER + ',' + SEL_BLOBS + '{' +
      'animation-name:' + name + ';' +
      'animation-duration:' + r1(dur) + 's;' +
      'animation-delay:' + r1(delay) + 's}';
    return kf + rule;
  }

  // The blob layer fades out/in around a reseed so the new path never visibly jumps.
  addStyle(SEL_AFTER + ',' + SEL_BLOBS + '{opacity:var(--lava-fade,1);transition:opacity .35s ease}');

  const artStyleEl = makeStyle('');
  const blobStyleEl = makeStyle('');
  function applyArt() {
    if (CONFIG.randomize) artStyleEl.textContent = artKeyframes();
    else { artStyleEl.textContent = ''; artRun = null; }
  }
  function applyBlobs() {
    if (CONFIG.randomize && CONFIG.blobs) blobStyleEl.textContent = blobKeyframes();
    else { blobStyleEl.textContent = ''; blobRun = null; }
  }
  // force = "Shuffle motion now" (new art + blob motion); otherwise a per-song blob reseed
  function fadeReseed(force) {
    if (!force && (!CONFIG.randomize || !CONFIG.reseedPerSong || !CONFIG.blobs || !lavaOn)) return;
    document.documentElement.style.setProperty('--lava-fade', '0');
    setTimeout(function () {
      if (force) { artBase = newArtBase(); artRun = null; applyArt(); }
      blobBase = newBlobBase();
      blobRun = null;
      applyBlobs();
      document.documentElement.style.setProperty('--lava-fade', '1');
      log('motion reseeded');
    }, 380);
  }
  const reseedBlobs = () => fadeReseed(false);
  applyArt();
  applyBlobs();

  /* --------------------------- VIDEO BACKGROUND --------------------------- */
  const VIDEO_HOSTS = IS_MUSIC ? ['ytmusic-player-page', '#browse-page', '#search-page'] : ['body'];
  const vs = {
    key: '', on: false, drawn: false, lastTime: -1, nextSample: 0,
    union: null, samples: 0, rect: null, lastEnsure: 0, lastPeel: 0,
    buf: null, bctx: null, small: null, sctx: null, cropBroken: false,
  };
  let vCanvases = [];

  function findVideo() {
    const list = [].slice.call(document.querySelectorAll(
      IS_MUSIC ? 'video.html5-main-video, ytmusic-player video, video' : 'video.html5-main-video'));
    let pausedOk = null, any = null, best = null, bestArea = -1;
    const W = window.innerWidth, H = window.innerHeight;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.closest && v.closest('ytd-video-preview, #inline-preview-player')) continue;
      if (!any) any = v;
      if (!(v.videoWidth > 16 && v.videoHeight > 16 && v.readyState >= 2)) continue;
      if (!v.paused) {
        const r = v.getBoundingClientRect();
        const area = Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0));
        if (area > bestArea) { best = v; bestArea = area; }
      } else if (!pausedOk) pausedOk = v;
    }
    return best || pausedOk || any;
  }

  function ensureCanvases() {
    for (let i = 0; i < VIDEO_HOSTS.length; i++) {
      const host = document.querySelector(VIDEO_HOSTS[i]);
      if (!host || host.querySelector(':scope > ' + SEL_VIDEO)) continue;
      const c = document.createElement('canvas');
      c.className = 'lava-video' + (vs.on ? ' on' : '');
      c.width = vs.buf ? vs.buf.width : 128;
      c.height = vs.buf ? vs.buf.height : 72;
      c.setAttribute('aria-hidden', 'true');
      host.appendChild(c);
      if (vs.drawn && vs.buf) c.getContext('2d').drawImage(vs.buf, 0, 0);
    }
    if (IS_YT && document.body && !document.querySelector(SEL_BLOBS)) {
      const d = document.createElement('div');
      d.className = 'lava-blobs';
      d.setAttribute('aria-hidden', 'true');
      document.body.appendChild(d);
    }
    vCanvases = [].slice.call(document.querySelectorAll(SEL_VIDEO));
  }

  function setOn(on) {
    if (on === vs.on) return;
    vs.on = on;
    for (let i = 0; i < vCanvases.length; i++) vCanvases[i].classList.toggle('on', on);
    if (IS_YT) {
      document.documentElement.toggleAttribute('data-lava-on', on);
      if (!on) unpeel();
    }
    log('video background', on ? 'ON' : (IS_MUSIC ? 'OFF (using album art)' : 'OFF'));
  }

  function resetCrop() { vs.union = null; vs.samples = 0; vs.rect = null; vs.nextSample = 0; }

  function sampleCrop(v) {
    const W = 64;
    const H = Math.max(8, Math.round(W * v.videoHeight / v.videoWidth));
    if (!vs.small) {
      vs.small = document.createElement('canvas');
      vs.sctx = vs.small.getContext('2d', { willReadFrequently: true });
      vs.sctx.imageSmoothingQuality = 'high';
    }
    if (vs.small.width !== W || vs.small.height !== H) { vs.small.width = W; vs.small.height = H; }
    vs.sctx.drawImage(v, 0, 0, W, H);
    let d;
    try { d = vs.sctx.getImageData(0, 0, W, H).data; } catch (e) { vs.cropBroken = true; return; }
    const col = new Float32Array(W);
    const row = new Float32Array(H);
    let total = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        col[x] += l / H;
        row[y] += l / W;
        total += l;
      }
    }
    if (total / (W * H) < 12) return;
    const T = 18;
    let x0 = 0, x1 = W - 1, y0 = 0, y1 = H - 1;
    while (x0 < x1 && col[x0] <= T) x0++;
    while (x1 > x0 && col[x1] <= T) x1--;
    while (y0 < y1 && row[y0] <= T) y0++;
    while (y1 > y0 && row[y1] <= T) y1--;
    const u = vs.union;
    vs.union = u
      ? { x0: Math.min(u.x0, x0), x1: Math.max(u.x1, x1), y0: Math.min(u.y0, y0), y1: Math.max(u.y1, y1) }
      : { x0: x0, x1: x1, y0: y0, y1: y1 };
    vs.samples++;
    if (vs.samples < 3) return;
    const b = vs.union;
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    if (bw < W * 0.35 || bh < H * 0.35) { vs.rect = null; return; }
    const ix = (bw > 4 && (b.x0 > 0 || b.x1 < W - 1)) ? 1 : 0;
    const iy = (bh > 4 && (b.y0 > 0 || b.y1 < H - 1)) ? 1 : 0;
    const sx = (b.x0 + ix) / W, sy = (b.y0 + iy) / H;
    const sw = (bw - 2 * ix) / W, sh = (bh - 2 * iy) / H;
    if (sw > 0.97 && sh > 0.97) { vs.rect = null; return; }
    vs.rect = { sx: sx * v.videoWidth, sy: sy * v.videoHeight, sw: sw * v.videoWidth, sh: sh * v.videoHeight };
  }

  function drawVideo(v) {
    const key = (v.currentSrc || '') + '|' + v.videoWidth + 'x' + v.videoHeight;
    if (key !== vs.key) { vs.key = key; resetCrop(); vs.drawn = false; }
    const now = performance.now();
    const crop = CONFIG.videoCropBars && !vs.cropBroken;
    if (crop && now >= vs.nextSample) {
      sampleCrop(v);
      vs.nextSample = now + (vs.samples < 12 ? 1000 : 4000);
    }
    const r = (crop && vs.rect) || { sx: 0, sy: 0, sw: v.videoWidth, sh: v.videoHeight };
    const bw = Math.max(8, Math.min(1024, Math.round(CONFIG.videoWidth) || 128));
    const bh = Math.min(512, Math.max(16, Math.round(bw * r.sh / r.sw)));
    if (!vs.buf) {
      vs.buf = document.createElement('canvas');
      vs.bctx = vs.buf.getContext('2d');
      vs.bctx.imageSmoothingQuality = 'high';
    }
    if (vs.buf.width !== bw || vs.buf.height !== bh) { vs.buf.width = bw; vs.buf.height = bh; }
    vs.bctx.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, bw, bh);
    for (let i = 0; i < vCanvases.length; i++) {
      const c = vCanvases[i];
      if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
      c.getContext('2d').drawImage(vs.buf, 0, 0);
    }
    vs.lastTime = v.currentTime;
    vs.drawn = true;
  }

  /* ------------------------ ON/OFF + THE ORANGE BUTTON ------------------------ */
  // youtube.com: whole lava skin + video background.  music.youtube.com: lava animation (frosted UI stays).
  function loadLavaOn() {
    const v = gmGet('lavaOn:' + HOST, null);
    if (v !== null) return !!v;
    const old = lsGet(IS_MUSIC ? 'lavaMusic' : 'lavaYt'); // from the standalone script
    return old === null ? true : old === '1';
  }
  let lavaOn = loadLavaOn();
  let vTimer = 0;

  function applyAnimState() {
    if (IS_MUSIC) document.documentElement.toggleAttribute('data-lava-still', !lavaOn);
  }

  function setLavaOn(on) {
    lavaOn = !!on;
    gmSet('lavaOn:' + HOST, lavaOn);
    applyAnimState();
    syncButton();
    vs.lastEnsure = 0;
    videoTick();
    log('lava ->', lavaOn);
  }

  function syncButton() {
    const b = document.getElementById('ytt-toggle');
    if (!b) return;
    b.classList.toggle('lava-on', ENABLED && lavaOn);
    b.classList.toggle('mt-off', !ENABLED);
    b.classList.toggle('open', !!document.getElementById('ytt-panel'));
    b.title = ENABLED ? 'Molten Tools settings (lava is ' + (lavaOn ? 'on' : 'off') + ')' : 'Molten Tools is off (click to turn it back on)';
  }

  // Built with DOM calls only: YouTube blocks innerHTML (Trusted Types).
  function makeIcon() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('aria-hidden', 'true');
    [[9, 15, 5], [15.5, 8.5, 3.2], [16.5, 17, 2]].forEach(function (c) {
      const e = document.createElementNS(NS, 'circle');
      e.setAttribute('cx', c[0]);
      e.setAttribute('cy', c[1]);
      e.setAttribute('r', c[2]);
      e.setAttribute('fill', 'currentColor');
      svg.appendChild(e);
    });
    return svg;
  }

  function ensureToggle() {
    let b = document.getElementById('ytt-toggle');
    if (!b) {
      b = document.createElement('button');
      b.id = 'ytt-toggle';
      b.type = 'button';
      b.setAttribute('aria-label', 'Molten Tools settings');
      b.appendChild(makeIcon());
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        UI.toggle();
      });
    }
    const end = IS_MUSIC
      ? document.querySelector('ytmusic-nav-bar .right-content, ytmusic-nav-bar #right-content')
      : document.querySelector('ytd-masthead #end');
    const want = end || document.body;
    if (!want) return;
    if (b.parentElement !== want) want.insertBefore(b, want === end ? end.firstChild : null);
    b.classList.toggle('lava-float', want !== end);
    syncButton();
  }

  coreStyle(
    '#ytt-toggle{width:40px;height:40px;margin:0 4px;padding:0;border:0;border-radius:50%;' +
    'background:transparent;color:' + (IS_MUSIC ? '#fff' : 'var(--yt-spec-text-primary,#fff)') + ';cursor:pointer;display:inline-flex;' +
    'align-items:center;justify-content:center;opacity:.6;flex:none}' +
    '#ytt-toggle:hover,#ytt-toggle.open{background:rgba(255,255,255,.12);opacity:1}' +
    '#ytt-toggle.lava-on{opacity:1;color:#ff9a3d}' +
    '#ytt-toggle.mt-off{opacity:.35}' +
    '#ytt-toggle.lava-float{position:fixed;right:16px;bottom:' + (IS_MUSIC ? 96 : 16) + 'px;z-index:2147483000;background:rgba(0,0,0,.55)}'
  );

  if (IS_YT) {
    addStyle(
      'html:not([data-lava-on]) canvas.lava-video{display:none}' +
      'html[data-lava-on] [data-lava-clear]{background:transparent!important;background-color:transparent!important;' +
      'background-image:none!important;box-shadow:none!important;backdrop-filter:none!important}' +
      'html[data-lava-on] [data-lava-clear]::before,html[data-lava-on] [data-lava-clear]::after{background:none!important;box-shadow:none!important}' +
      'html[data-lava-on] [data-lava-glass]{background:rgba(0,0,0,.3)!important;background-image:none!important;' +
      'box-shadow:none!important;-webkit-backdrop-filter:blur(18px) saturate(1.3)!important;backdrop-filter:blur(18px) saturate(1.3)!important}' +
      'html[data-lava-on] ytd-shorts .navigation-container,html[data-lava-on] ytd-shorts #anchored-panel-scrim,' +
      'html[data-lava-on] ytd-shorts #anchored-panel,html[data-lava-on] ytd-shorts #shorts-inner-container,' +
      'html[data-lava-on] ytd-shorts #shorts-container,html[data-lava-on] ytd-shorts #header{' +
      'background:transparent!important;background-image:none!important;box-shadow:none!important}' +
      'html[data-lava-on] yt-searchbox input,html[data-lava-on] ytd-searchbox input,html[data-lava-on] input[name="search_query"],' +
      'html[data-lava-on] input.ytSearchboxComponentInput,html[data-lava-on] #search-input,html[data-lava-on] #search-input input{' +
      'background:transparent!important;background-color:transparent!important;box-shadow:none!important}' +
      'html[data-lava-on] yt-searchbox .ytSearchboxComponentInputBox,html[data-lava-on] yt-searchbox form,html[data-lava-on] ytd-searchbox #container{' +
      'background:rgba(0,0,0,0)!important;-webkit-backdrop-filter:blur(14px)!important;backdrop-filter:blur(14px)!important;border:0!important;box-shadow:none!important;outline:0!important}' +
      'html[data-lava-on] yt-searchbox .ytSearchboxComponentSearchButton,html[data-lava-on] yt-searchbox .ytSearchboxComponentInputBox,' +
      'html[data-lava-on] ytd-searchbox #search-icon-legacy,html[data-lava-on] ytd-searchbox #container{border:0!important;box-shadow:none!important;outline:0!important}' +
      'html[data-lava-on] ytd-engagement-panel-section-list-renderer{background:rgba(0,0,0,.3)!important;' +
      'background-image:none!important;-webkit-backdrop-filter:blur(18px) saturate(1.3)!important;' +
      'backdrop-filter:blur(18px) saturate(1.3)!important;box-shadow:none!important}' +
      'html[data-lava-on] ytd-engagement-panel-title-header-renderer,html[data-lava-on] ytd-comments-header-renderer,' +
      'html[data-lava-on] ytd-comment-simplebox-renderer{background:transparent!important}' +
      'html[data-lava-on] #cinematics,html[data-lava-on] #cinematics-container,html[data-lava-on] #cinematic-container,' +
      'html[data-lava-on] #shorts-cinematic-container{display:none!important}' +
      'html[data-lava-on] ytd-masthead,html[data-lava-on] #masthead-container{box-shadow:none!important}' +
      'html[data-lava-on] #masthead-container::before,html[data-lava-on] #masthead-container::after,' +
      'html[data-lava-on] ytd-masthead::before,html[data-lava-on] ytd-masthead::after{box-shadow:none!important;background:none!important}' +
      'html[data-lava-on] div.lava-blobs{display:block}' +
      'html[data-lava-on]{background:#000!important;' +
      '--yt-spec-base-background:transparent!important;--yt-spec-general-background-a:transparent!important;' +
      '--yt-spec-general-background-b:transparent!important;--yt-spec-brand-background-primary:transparent!important;' +
      '--yt-app-background:transparent!important;--yt-guide-background:transparent!important}' +
      'html[data-lava-on] body,html[data-lava-on] ytd-app,html[data-lava-on] #content.ytd-app,' +
      'html[data-lava-on] ytd-page-manager,html[data-lava-on] ytd-watch-flexy,html[data-lava-on] ytd-browse,' +
      'html[data-lava-on] ytd-search,html[data-lava-on] ytd-two-column-browse-results-renderer,' +
      'html[data-lava-on] ytd-masthead,html[data-lava-on] #masthead-container,html[data-lava-on] #container.ytd-masthead,' +
      'html[data-lava-on] #guide-content,html[data-lava-on] ytd-guide-renderer,html[data-lava-on] ytd-mini-guide-renderer,' +
      'html[data-lava-on] tp-yt-app-drawer,html[data-lava-on] #chips-wrapper,' +
      'html[data-lava-on] ytd-feed-filter-chip-bar-renderer,html[data-lava-on] #page-header,' +
      'html[data-lava-on] ytd-tabbed-page-header{background:transparent!important;background-color:transparent!important}'
    );
  }

  if (IS_MUSIC) {
    addStyle(
      // still mode: art layer stops moving (blur stays), blob layer + video canvas are removed
      'html[data-lava-still] #browse-page::before,html[data-lava-still] #search-page::before,' +
      'html[data-lava-still] ytmusic-player-page::before,' +
      'html[data-lava-still] ytmusic-player-page[is-mweb-modernization-enabled] #main-panel::before{' +
      'animation:none!important;will-change:auto!important}' +
      'html[data-lava-still] #browse-page::after,html[data-lava-still] #search-page::after,' +
      'html[data-lava-still] ytmusic-player-page::after,' +
      'html[data-lava-still] ytmusic-player-page[is-mweb-modernization-enabled] #main-panel::after,' +
      'html[data-lava-still] canvas.lava-video{display:none!important;animation:none!important}'
    );
  }

  /* Shorts, theater mode and side panels use dark blocks the color override can't reach: find them and clear them. */
  const PEEL_SKIP =
    'video,canvas,img,svg,button,input,textarea,select,ytd-player,#movie_player,.html5-video-player,ytd-video-preview,' +
    'tp-yt-iron-dropdown,ytd-popup-container,tp-yt-paper-dialog,ytd-menu-popup-renderer,' +
    'ytd-multi-page-menu-renderer,yt-reel-player-overlay-view-model,ytd-shorts-player-controls,#ytt-toggle,#ytt-panel,' +
    'yt-img-shadow,[class*="Avatar"],yt-avatar-shape';
  const GLASS_SEL = 'ytd-engagement-panel-section-list-renderer';

  function unpeel() {
    const list = document.querySelectorAll('[data-lava-clear],[data-lava-glass]');
    for (let i = 0; i < list.length; i++) { list[i].removeAttribute('data-lava-clear'); list[i].removeAttribute('data-lava-glass'); }
  }
  function rgbaOf(str) {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(str);
    if (!m) return null;
    return { a: m[4] === undefined ? 1 : parseFloat(m[4]), lum: 0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3] };
  }
  function hasGradient(cs) { return /gradient\(/.test(cs.backgroundImage); }
  function nameOf(el) {
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
      (el.className && typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '');
  }
  function tryPeel(el, seen, o) {
    if (seen.has(el)) return;
    seen.add(el);
    if (el === document.documentElement || el === document.body) return;
    if (el.hasAttribute('data-lava-clear') || el.hasAttribute('data-lava-glass') || el.matches(GLASS_SEL) || el.closest(PEEL_SKIP)) return;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < o.minArea || r.width < o.minWidth) return;
    const cs = getComputedStyle(el);
    const c = rgbaOf(cs.backgroundColor);
    let why = '';
    if (c && c.a >= 0.6 && c.lum <= o.lumMax) why = 'solid ' + cs.backgroundColor;
    else if (hasGradient(cs)) why = 'gradient';
    else if (o.scrim && c && c.a >= 0.1 && c.lum <= 60) why = 'scrim ' + cs.backgroundColor;
    else if (o.scrim && cs.boxShadow !== 'none') why = 'shadow';
    if (!why && o.pseudo) {
      const names = ['::before', '::after'];
      for (let i = 0; i < names.length && !why; i++) {
        const ps = getComputedStyle(el, names[i]);
        if (ps.content === 'none' || ps.content === 'normal') continue;
        const pc = rgbaOf(ps.backgroundColor);
        if (hasGradient(ps) || ps.boxShadow !== 'none' || (pc && pc.a >= 0.1 && pc.lum <= 60)) why = names[i];
      }
    }
    if (!why) return;
    el.setAttribute(o.attr || 'data-lava-clear', '');
    log(o.attr ? 'glassed' : 'cleared', why, nameOf(el));
  }
  function scanPoints(xs, ys, o) {
    const seen = new Set();
    for (let i = 0; i < xs.length; i++) {
      for (let j = 0; j < ys.length; j++) {
        const els = document.elementsFromPoint(xs[i], ys[j]) || [];
        for (let k = 0; k < els.length; k++) tryPeel(els[k], seen, o);
      }
    }
  }
  function scanTopBand(W) {
    const root = document.querySelector('ytd-app') || document.body;
    if (!root) return;
    const seen = new Set();
    const o = { minArea: 0, minWidth: W * 0.5, lumMax: 45, scrim: true, pseudo: true };
    let level = [root];
    let budget = 900;
    for (let depth = 0; depth < 6 && level.length && budget > 0; depth++) {
      const next = [];
      for (let i = 0; i < level.length && budget > 0; i++) {
        const el = level[i];
        budget--;
        if (el.matches && el.matches(PEEL_SKIP)) continue;
        const r = el.getBoundingClientRect();
        if (r.top < 140 && r.bottom > 0 && r.height < 320) tryPeel(el, seen, o);
        const kids = el.children;
        for (let k = 0; k < kids.length; k++) next.push(kids[k]);
      }
      level = next;
    }
  }
  function peelBackgrounds() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    scanPoints([0.06, 0.25, 0.4, 0.5, 0.6, 0.75, 0.94].map(function (f) { return f * W; }),
      [0.3, 0.55, 0.85].map(function (f) { return f * H; }),
      { minArea: W * H * 0.12, minWidth: 0, lumMax: 45, scrim: false, pseudo: false });
    scanPoints([0.1, 0.3, 0.5, 0.7, 0.8, 0.88, 0.95].map(function (f) { return f * W; }),
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(function (f) { return f * H; }),
      { minArea: 6000, minWidth: 150, lumMax: 45, scrim: false, pseudo: false, attr: 'data-lava-glass' });
    scanTopBand(W);
    const panels = document.querySelectorAll(GLASS_SEL);
    for (let i = 0; i < panels.length; i++) {
      const r = panels[i].getBoundingClientRect();
      const cs = getComputedStyle(panels[i]);
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.width < 120 || r.height < 120) continue;
      const xs = [], ys = [];
      for (let k = 0; k < 5; k++) xs.push(Math.min(W - 1, Math.max(0, r.left + 8 + (r.width - 16) * k / 4)));
      for (let k = 0; k < 9; k++) ys.push(Math.min(H - 1, Math.max(0, r.top + 8 + (r.height - 16) * k / 8)));
      scanPoints(xs, ys, { minArea: 1500, minWidth: 120, lumMax: 70, scrim: false, pseudo: false });
    }
  }

  // Runs always (it also keeps the orange button in place); only draws when lava + video background are on.
  function videoTick() {
    clearTimeout(vTimer);
    if (!ENABLED) {
      // switched off: nothing runs except keeping the orange button in the top bar
      try { ensureToggle(); } catch (e) { /* ignore */ }
      vTimer = setTimeout(videoTick, 2000);
      return;
    }
    let delay = 1000;
    try {
      const now = Date.now();
      if (now - vs.lastEnsure > 1000) {
        vs.lastEnsure = now;
        ensureCanvases();
        ensureToggle();
      }
      const v = (lavaOn && CONFIG.video) ? findVideo() : null;
      const usable = !!v && v.videoWidth > 16 && v.videoHeight > 16 && v.readyState >= 2;
      setOn(usable);
      if (IS_YT && vs.on && !document.hidden && now - vs.lastPeel > 1500) {
        vs.lastPeel = now;
        peelBackgrounds();
      }
      if (usable && !document.hidden) {
        if (!v.paused) delay = Math.round(1000 / Math.max(1, Math.min(60, CONFIG.videoFps || 15)));
        if (!vs.drawn || v.currentTime !== vs.lastTime) drawVideo(v);
      }
    } catch (e) {
      log('video loop error:', e && e.message);
    }
    vTimer = setTimeout(videoTick, delay);
  }

  /* ------------------------ ALBUM ART (YouTube Music) ------------------------ */
  const VAR = '--lava-art';
  const page = pageWin;
  let current = '';
  let pending = '';
  let warnedMissing = false;
  let timer = 0;

  function isHttp(s) { return typeof s === 'string' && /^https?:/i.test(s); }
  function fromMediaSession() {
    try {
      const md = page.navigator.mediaSession && page.navigator.mediaSession.metadata;
      const list = md && md.artwork;
      if (!list || !list.length) return '';
      let best = '', bestSize = -1;
      for (let i = 0; i < list.length; i++) {
        const size = parseInt(String(list[i].sizes || '').split('x')[0], 10) || 0;
        if (isHttp(list[i].src) && size >= bestSize) { best = list[i].src; bestSize = size; }
      }
      return best;
    } catch (e) { return ''; }
  }
  const DOM_SELECTORS = ['#thumbnail > #img', 'ytmusic-player-page #song-image img', 'ytmusic-player-bar img.image', 'ytmusic-player-bar img'];
  function fromDom() {
    for (let i = 0; i < DOM_SELECTORS.length; i++) {
      const el = document.querySelector(DOM_SELECTORS[i]);
      const src = el && (el.currentSrc || el.src);
      if (isHttp(src)) return { src: src, how: 'dom ' + DOM_SELECTORS[i] };
    }
    return null;
  }
  function findArt() {
    const ms = fromMediaSession();
    if (ms) return { src: ms, how: 'mediaSession' };
    return fromDom();
  }
  function setVar(url) {
    document.documentElement.style.setProperty(VAR, 'url("' + url.replace(/"/g, '%22') + '")');
  }
  function tryLoad(candidates, how, token) {
    if (!candidates.length) { log('could not load art from', how, token); return; }
    const url = candidates[0];
    const probe = new Image();
    probe.onload = function () {
      if (pending !== token) return;
      const firstArt = current === '';
      current = token;
      setVar(url);
      if (!firstArt) reseedBlobs();
      TITLE.fromUrl(url);
      log('background set via', how, url);
    };
    probe.onerror = function () {
      if (pending !== token) return;
      tryLoad(candidates.slice(1), how, token);
    };
    probe.src = url;
  }
  function update() {
    if (!ENABLED) return;
    const found = findArt();
    if (!found) {
      if (!warnedMissing) { warnedMissing = true; log('no album art found yet (will keep checking)'); }
      return;
    }
    if (found.src === current || found.src === pending) return;
    pending = found.src;
    const size = Math.max(32, Math.round(CONFIG.artSize) || 256);
    const resized = found.src.replace(/=w\d+-h\d+/, '=w' + size + '-h' + size);
    tryLoad(resized === found.src ? [found.src] : [resized, found.src], found.how, found.src);
  }
  function artUrlNow() {
    const m = /url\("(.*)"\)/.exec(document.documentElement.style.getPropertyValue(VAR) || '');
    return m ? m[1] : '';
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(update, 100); }
  function watchPlayerBar() {
    const bar = document.querySelector('ytmusic-player-bar');
    if (!bar) return false;
    new MutationObserver(schedule).observe(bar, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
    return true;
  }

  // Called by the panel whenever a lava value changes
  // Called whenever a lava value changes (slider, profile switch, or another tab)
  let motionFrame = 0;
  function lavaLive(key) {
    writeOverrides();
    if (key === 'randomize' || key === 'blobs') { applyArt(); applyBlobs(); }
    if (key === 'motionSpeed' || key === 'motionAmount') {
      // coalesce slider drags to one rebuild per frame
      cancelAnimationFrame(motionFrame);
      motionFrame = requestAnimationFrame(() => { applyArt(); applyBlobs(); });
    }
    if (key === 'artSize' && IS_MUSIC) { current = ''; pending = ''; update(); }
    if (key === 'videoCropBars') { resetCrop(); vs.cropBroken = false; }
    if (key === 'video' || key === 'videoWidth') { vs.drawn = false; vs.lastEnsure = 0; videoTick(); }
  }
  function lavaApplyAll(artChanged) {
    writeOverrides();
    applyArt();
    applyBlobs();
    resetCrop();
    vs.cropBroken = false;
    vs.drawn = false;
    vs.lastEnsure = 0;
    if (artChanged && IS_MUSIC) { current = ''; pending = ''; update(); }
    videoTick();
  }
  // Another open tab (YouTube <-> YouTube Music) changed the shared lava settings
  gmWatch('lava', () => {
    lavaUseStore(loadLavaStore());
    UI.refresh();
  });

  function lavaInit() {
    log('Molten Tools ' + ((typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '') + ' loaded on', SITE_NAME);
    applyAnimState();
    if (IS_MUSIC) {
      if (!watchPlayerBar()) {
        const waiter = new MutationObserver(function () {
          if (watchPlayerBar()) { waiter.disconnect(); schedule(); }
        });
        waiter.observe(document.documentElement, { childList: true, subtree: true });
      }
      setInterval(function () { if (!document.hidden) update(); }, 2000);
      schedule();
    }
    videoTick();
  }

  // =====================================================================
  //  4. GENERAL: auto-dismiss + title bar color
  // =====================================================================
  const GEN_DEFAULTS = {
    autoDismiss: true,     // answer "Still watching?" / "Continue watching?" automatically
    titleColor: true,      // tint the installed-app title bar from the album art / video thumbnail
    titleTone: 'dark',     // 'vivid' | 'dark' | 'muted'
    seekColor: true,       // color the seek bar (and its knob) from the same art
    seekTone: 'bright',    // 'bright' (easy to see on the dark bar) | 'title' (exact title bar color)
  };
  const gen = Object.assign({}, GEN_DEFAULTS, gmGet('general', {}));
  const saveGen = () => gmSet('general', Object.assign({}, gen));
  gmWatch('general', v => {
    Object.assign(gen, GEN_DEFAULTS, v || {});
    TITLE.refresh();
    UI.refresh();
  });
  const glog = (...a) => lava.debug && console.log('[molten]', ...a);

  /* ---------- Auto-dismiss ---------- */
  const DISMISS = (() => {
    const RX = /continue watching|still watching|are you still there|still listening|video paused/i;
    const DIALOGS = 'ytmusic-you-there-renderer, yt-confirm-dialog-renderer, tp-yt-paper-dialog, yt-dialog-view-model';
    let lastClick = 0;
    const observed = new WeakSet();

    const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

    function check() {
      if (!ENABLED || !gen.autoDismiss) return;
      // YouTube asks when it thinks you've been idle; keeping its "last activity" time fresh
      // stops most prompts before they appear. Clicking below is the fallback.
      try { if (typeof pageWin._lact === 'number') pageWin._lact = Date.now(); } catch (e) { /* ignore */ }
      if (Date.now() - lastClick < 3000) return;
      for (const d of document.querySelectorAll(DIALOGS)) {
        if (!visible(d) || !RX.test(d.textContent || '')) continue;
        const btns = [...d.querySelectorAll('button, tp-yt-paper-button, yt-button-renderer, a[role="button"]')]
          .filter(b => visible(b));
        const yes = btns.find(b => /^(yes|continue|keep watching|keep listening|i'?m still (here|watching|listening))/i.test(norm(b.textContent)))
          || d.querySelector('#confirm-button button, #confirm-button');
        // nothing that clearly means "yes": leave the dialog alone rather than guess
        if (!yes) continue;
        yes.click();
        lastClick = Date.now();
        COUNTS.bump('dismissed');
        glog('auto-dismissed:', norm(d.textContent).slice(0, 60));
        // if the player stayed paused, start it again
        setTimeout(() => {
          const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
          if (v && v.paused && v.currentTime > 0 && !v.ended) v.play().catch(() => { /* ignore */ });
        }, 800);
        return;
      }
    }

    // Popup containers: react instantly when a dialog is added (timers slow down in background tabs).
    function watchPopups() {
      for (const c of document.querySelectorAll('ytd-popup-container, ytmusic-popup-container')) {
        if (observed.has(c)) continue;
        observed.add(c);
        new MutationObserver(() => setTimeout(check, 50)).observe(c, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden', 'aria-hidden'] });
      }
    }

    return { check, watchPopups };
  })();

  /* ---------- Title bar color (PWA theme-color) ---------- */
  const TITLE = (() => {
    let source = '';       // URL the current color came from
    let wanted = null;     // [r,g,b] we want shown, null = site default
    let shown = null;      // [r,g,b] currently written
    let anim = 0;
    let lastVideo = '';
    const cache = new Map();

    function metas() {
      let list = [...document.querySelectorAll('meta[name="theme-color"]')];
      if (!list.length && document.head) {
        const m = document.createElement('meta');
        m.name = 'theme-color';
        m.dataset.yttMade = '1';
        document.head.appendChild(m);
        list = [m];
      }
      for (const m of list) if (!m.dataset.yttOrig && !m.dataset.yttMade) m.dataset.yttOrig = m.getAttribute('content') || '';
      return list;
    }
    const css = c => 'rgb(' + c.map(Math.round).join(',') + ')';
    function write(c) {
      for (const m of metas()) {
        if (c) m.setAttribute('content', css(c));
        else if (m.dataset.yttMade) m.remove();
        else if (m.dataset.yttOrig !== undefined) m.setAttribute('content', m.dataset.yttOrig);
      }
      shown = c;
    }
    // short fade between colors (the title bar can't animate on its own)
    function show(c) {
      wanted = c;
      cancelAnimationFrame(anim);
      if (!c || !shown) { write(c); return; }
      const from = shown.slice();
      const t0 = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / 450);
        write(from.map((v, i) => v + (c[i] - v) * t));
        if (t < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }

    function rgbToHsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      let h = 0, s = 0;
      const l = (mx + mn) / 2;
      if (mx !== mn) {
        const d = mx - mn;
        s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h /= 6;
      }
      return [h, s, l];
    }
    function hslToRgb(h, s, l) {
      if (!s) return [l * 255, l * 255, l * 255];
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      const f = t => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
    }

    // Most "colorful" common color in the picture (ignores near-black / near-white).
    function pick(img) {
      const W = 40, H = 40;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, W, H);
      const d = x.getImageData(0, 0, W, H).data; // throws if the image is cross-origin tainted
      const buckets = new Map();
      let ar = 0, ag = 0, ab = 0, an = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        ar += r; ag += g; ab += b; an++;
        const [, s, l] = rgbToHsl(r, g, b);
        if (l < 0.07 || l > 0.93) continue;
        const key = (r >> 5) << 6 | (g >> 5) << 3 | (b >> 5);
        const w = 0.2 + s * s * 3;
        const e = buckets.get(key) || [0, 0, 0, 0];
        e[0] += r * w; e[1] += g * w; e[2] += b * w; e[3] += w;
        buckets.set(key, e);
      }
      let best = null;
      for (const e of buckets.values()) if (!best || e[3] > best[3]) best = e;
      return best && best[3] > 0.5 ? [best[0] / best[3], best[1] / best[3], best[2] / best[3]] : [ar / an, ag / an, ab / an];
    }
    function tone(c) {
      let [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
      if (gen.titleTone === 'vivid') { s = Math.min(1, s * 1.15); l = Math.min(0.5, Math.max(0.3, l)); }
      else if (gen.titleTone === 'muted') { s *= 0.4; l = Math.min(0.3, Math.max(0.16, l)); }
      else { s *= 0.85; l = Math.min(0.24, Math.max(0.12, l * 0.6)); } // dark (default): readable with white text
      return hslToRgb(h, s, l);
    }

    function loadImg(src, cors) {
      return new Promise((res, rej) => {
        const im = new Image();
        if (cors) im.crossOrigin = 'anonymous';
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = src;
      });
    }
    // Fallback when the image host doesn't allow reading pixels: fetch it through the userscript manager.
    function gmFetch(url) {
      return new Promise((res, rej) => {
        if (typeof GM_xmlhttpRequest !== 'function') return rej(new Error('no GM_xmlhttpRequest'));
        GM_xmlhttpRequest({
          method: 'GET', url, responseType: 'blob', timeout: 8000,
          onload: r => (r.status >= 200 && r.status < 300 && r.response) ? res(r.response) : rej(new Error('HTTP ' + r.status)),
          onerror: rej, ontimeout: rej,
        });
      });
    }
    async function colorOf(url) {
      if (cache.has(url)) return cache.get(url);
      let col = null;
      try { col = pick(await loadImg(url, true)); } catch (e) {
        try {
          const blob = await gmFetch(url);
          const obj = URL.createObjectURL(blob);
          try { col = pick(await loadImg(obj, false)); } finally { URL.revokeObjectURL(obj); }
        } catch (e2) { glog('title color: could not read', url, e2 && e2.message); }
      }
      if (col) {
        cache.set(url, col);
        if (cache.size > 60) cache.delete(cache.keys().next().value);
      }
      return col;
    }

    /* ---------- Seek bar (same art color) ---------- */
    let seekShown = null;
    const active = () => gen.titleColor || gen.seekColor;
    function seekTone(c) {
      if (gen.seekTone === 'title') return tone(c);
      let [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
      if (s < 0.08) return hslToRgb(h, s, 0.78);   // grey art: a light grey bar
      s = Math.min(1, Math.max(s, 0.55));
      l = Math.min(0.68, Math.max(0.55, l));
      return hslToRgb(h, s, l);
    }
    function setSeek(c) {
      seekShown = c;
      const root = document.documentElement;
      if (c) {
        root.style.setProperty('--molten-seek', css(c));
        const [h, sat, l] = rgbToHsl(c[0], c[1], c[2]);
        root.style.setProperty('--molten-seek-end', css(hslToRgb((h + 0.04) % 1, sat, Math.min(0.85, l + 0.12))));
      } else {
        root.style.removeProperty('--molten-seek');
        root.style.removeProperty('--molten-seek-end');
      }
      root.toggleAttribute('data-molten-seek', !!c);
    }

    addStyle(
      // YouTube Music: the seek slider is an <input type=range> painted with an inline gradient built from
      // YouTube's brand-red and magenta color variables, so swap those two variables on the slider only
      'html[data-molten-seek] .ytMusicMiniPlayerProgressBar,' +
      'html[data-molten-seek] ytmusic-player-bar input[type=range]{' +
      '--yt-sys-color-baseline--static-brand-red:var(--molten-seek)!important;' +
      '--yt-sys-color-baseline--static-magenta:var(--molten-seek-end)!important;' +
      'accent-color:var(--molten-seek)}' +
      // the round knob is the slider's thumb, a separate part with its own red
      'html[data-molten-seek] .ytMusicMiniPlayerProgressBar::-webkit-slider-thumb,' +
      'html[data-molten-seek] ytmusic-player-bar input[type=range]::-webkit-slider-thumb{' +
      'background:var(--molten-seek)!important;border-color:var(--molten-seek)!important}' +
      'html[data-molten-seek] .ytMusicMiniPlayerProgressBar::-moz-range-thumb,' +
      'html[data-molten-seek] ytmusic-player-bar input[type=range]::-moz-range-thumb{' +
      'background:var(--molten-seek)!important;border-color:var(--molten-seek)!important}' +
      // older YouTube Music player bar (paper slider)
      'html[data-molten-seek] ytmusic-player-bar #progress-bar,html[data-molten-seek] ytmusic-player-bar tp-yt-paper-slider{' +
      '--paper-slider-active-color:var(--molten-seek)!important;--paper-slider-knob-color:var(--molten-seek)!important;' +
      '--paper-slider-knob-start-color:var(--molten-seek)!important;--paper-slider-knob-start-border-color:var(--molten-seek)!important;' +
      '--paper-progress-active-color:var(--molten-seek)!important}' +
      'html[data-molten-seek] ytmusic-player-bar #primaryProgress,html[data-molten-seek] ytmusic-player-bar .slider-knob-inner,' +
      'html[data-molten-seek] .foreground-bar.ytmusic-playback-progress-renderer{' +
      'background:var(--molten-seek)!important;background-color:var(--molten-seek)!important;border-color:var(--molten-seek)!important}' +
      // YouTube: the red played part, the knob and the colored swatches in the player
      'html[data-molten-seek] .ytp-play-progress,html[data-molten-seek] .ytp-swatch-background-color,' +
      'html[data-molten-seek] .ytp-scrubber-button{background:var(--molten-seek)!important;background-image:none!important}' +
      'html[data-molten-seek] .ytp-swatch-color{color:var(--molten-seek)!important}' +
      // Shorts: its own progress line and the round playhead dot
      'html[data-molten-seek] .ytProgressBarLineProgressBarPlayed,' +
      'html[data-molten-seek] .ytProgressBarPlayheadProgressBarPlayheadDot{' +
      'background:var(--molten-seek)!important;background-image:none!important;border-color:var(--molten-seek)!important}' +
      'ytmusic-player-bar #primaryProgress,ytmusic-player-bar .slider-knob-inner,.ytp-play-progress,.ytp-scrubber-button{' +
      'transition:background-color .45s ease}'
    );

    // one art color drives both the title bar and the seek bar
    // an open panel's color swatches follow along (they show the color being faded to, not a frame of the fade)
    const told = () => document.dispatchEvent(new CustomEvent('ytt-colors'));
    function apply(col) {
      if (gen.titleColor) show(tone(col)); else if (wanted || shown) show(null);
      setSeek(gen.seekColor ? seekTone(col) : null);
      told();
    }
    function clear() { show(null); setSeek(null); told(); }

    async function fromUrl(url) {
      if (!active() || !url) return;
      source = url;
      const col = await colorOf(url);
      if (source !== url || !active()) return; // a newer image took over
      if (col) { apply(col); glog('art color', css(col), 'from', url); }
      else clear(); // couldn't read this art: show the site's own color rather than the previous song's
    }

    function ytVideoId() {
      const m = /[?&]v=([\w-]{6,})/.exec(location.search) || /^\/shorts\/([\w-]{6,})/.exec(location.pathname);
      return m ? m[1] : '';
    }

    // every second: YouTube follows the current video; both sites re-assert the color if the page rewrote it
    function tick() {
      if (!active()) return;
      if (IS_YT) {
        const id = ytVideoId();
        if (id !== lastVideo) {
          lastVideo = id;
          if (id) fromUrl('https://i.ytimg.com/vi/' + id + '/mqdefault.jpg');
          else { source = ''; clear(); }
        }
      }
      if (wanted && shown && !anim) {
        const m = document.querySelector('meta[name="theme-color"]');
        if (m && m.getAttribute('content') !== css(shown)) write(shown);
      }
    }

    function refresh() {
      if (!gen.titleColor) show(null);
      if (!gen.seekColor) setSeek(null);
      if (!active()) { source = ''; lastVideo = ''; return; }
      lastVideo = '';
      const src = source || (IS_MUSIC ? artUrlNow() : '');
      source = '';
      if (src) fromUrl(src); else tick();
    }

    function off() { source = ''; lastVideo = ''; clear(); }

    return { fromUrl, tick, refresh, off, color: () => (wanted ? css(wanted) : ''), seek: () => (seekShown ? css(seekShown) : '') };
  })();

  function generalInit() {
    setInterval(() => {
      if (!ENABLED) return;
      try { DISMISS.watchPopups(); DISMISS.check(); } catch (e) { glog('dismiss error', e && e.message); }
      try { TITLE.tick(); } catch (e) { glog('title error', e && e.message); }
    }, 1000);
  }

  // The master switch, live: no reload needed (so music keeps playing)
  function setEnabled(on, fromOtherTab) {
    on = !!on;
    if (on === ENABLED) return;
    ENABLED = on;
    if (!fromOtherTab) gmSet('enabled', on);
    setStylesEnabled(on);
    const root = document.documentElement;
    if (on) {
      applyAnimState();
      applyArt();
      applyBlobs();
      vs.lastEnsure = 0;
      if (IS_MUSIC) { current = ''; pending = ''; update(); }
      TITLE.refresh();
      HDM.applyRes();
    } else {
      setOn(false);
      unpeel();
      for (const c of document.querySelectorAll(SEL_VIDEO + ',' + SEL_BLOBS)) c.remove();
      vCanvases = [];
      vs.drawn = false;
      root.removeAttribute('data-lava-still');
      root.style.removeProperty(VAR);
      TITLE.off();
      HDM.applySize(); // removes the player-size override when it's no longer wanted
    }
    PRIV.refresh();
    videoTick();
    syncButton();
    UI.refresh();
    console.log('[molten] Molten Tools ' + (on ? 'on' : 'off'));
  }
  gmWatch('enabled', v => setEnabled(v !== false, true));

  // =====================================================================
  //  5. SETTINGS PANEL (opened by the orange button)
  // =====================================================================
  const UI = (() => {
    const TAB_KEY = 'ytt.tab';
    const ACCENT = '#ff9a3d';

    coreStyle(
      // Light and dark glass (the Glassware recipe): only these neutrals swap; the orange stays.
      '#ytt-panel{--mt-glass:rgba(22,22,28,.8);--mt-solid:#1c1c22;--mt-text:#f2f2f5;--mt-sub:rgba(235,235,245,.62);--mt-line:rgba(255,255,255,.09);--mt-edge:rgba(255,255,255,.12);' +
      '--mt-hl:rgba(255,255,255,.1);--mt-drop:rgba(0,0,0,.6);--mt-ctl:rgba(255,255,255,.06);--mt-ctl-hi:rgba(255,255,255,.08);--mt-btn:rgba(255,255,255,.1);--mt-btn-hi:rgba(255,255,255,.18);' +
      '--mt-sw-off:rgba(255,255,255,.22);--mt-input:rgba(0,0,0,.4);--mt-input-edge:rgba(255,255,255,.16);--mt-ink:#ffb470;--mt-good:#9be29b;--mt-bad:#ff8a8a;--mt-knob:#55555f;color-scheme:dark}' +
      '#ytt-panel[data-theme=light]{--mt-glass:rgba(255,255,255,.84);--mt-solid:#fafafc;--mt-text:#1d1d1f;--mt-sub:rgba(29,29,31,.64);--mt-line:rgba(0,0,0,.07);--mt-edge:rgba(255,255,255,.8);' +
      '--mt-hl:#fff;--mt-drop:rgba(0,0,0,.34);--mt-ctl:rgba(0,0,0,.055);--mt-ctl-hi:rgba(0,0,0,.07);--mt-btn:rgba(0,0,0,.06);--mt-btn-hi:rgba(0,0,0,.11);' +
      '--mt-sw-off:rgba(0,0,0,.16);--mt-input:rgba(255,255,255,.75);--mt-input-edge:rgba(0,0,0,.12);--mt-ink:#a8550a;--mt-good:#1f7a3a;--mt-bad:#b4271b;--mt-knob:#fff;color-scheme:light}' +
      // sun/moon switch: light or dark glass (the device's choice until it's flipped)
      // glassware:frame start: shared controls, stamped by tools/frame.py; edit them there
      '#ytt-panel button{display:inline-block;height:auto;min-height:0;align-items:center;line-height:inherit;vertical-align:middle}' +
      '#ytt-panel .ytt-mode{position:relative!important;flex:none!important;display:flex!important;align-items:center!important;justify-content:space-between!important;width:50px!important;height:28px!important;margin:0 0 0 auto!important;padding:0 7px!important;border:0!important;border-radius:14px!important;background:var(--mt-ctl-hi)!important;color:var(--mt-sub)!important;cursor:pointer!important;box-sizing:border-box!important;min-width:0!important;min-height:0!important;max-height:none!important;line-height:1!important;text-transform:none!important;letter-spacing:normal!important}' +
      '#ytt-panel .ytt-mode svg{position:relative!important;z-index:1!important;flex:none!important;display:block!important;width:13px!important;height:13px!important;transition:color .18s!important}' +
      '#ytt-panel .ytt-mode .ytt-knob{position:absolute!important;top:3px!important;left:3px!important;width:22px!important;height:22px!important;border-radius:50%!important;background:var(--mt-knob)!important;box-shadow:0 1px 3px rgba(0,0,0,.25)!important;transition:transform .2s cubic-bezier(.3,.7,.3,1)!important}' +
      '#ytt-panel[data-theme=dark] .ytt-mode .ytt-knob{transform:translateX(22px)!important}' +
      '#ytt-panel .ytt-mode .ytt-sun,#ytt-panel[data-theme=dark] .ytt-mode .ytt-moon{color:var(--mt-text)!important}' +
      '#ytt-panel[data-theme=dark] .ytt-mode .ytt-sun{color:var(--mt-sub)!important}' +
      '#ytt-panel .ytt-x{flex:none!important;display:grid!important;place-items:center!important;width:28px!important;height:28px!important;margin:0 0 0 8px!important;padding:0!important;border:0!important;border-radius:50%!important;background:var(--mt-ctl-hi)!important;color:var(--mt-sub)!important;cursor:pointer!important;box-sizing:border-box!important;min-width:0!important;min-height:0!important;max-height:none!important;line-height:1!important;text-transform:none!important;letter-spacing:normal!important}' +
      '#ytt-panel .ytt-x:hover{background:var(--mt-btn-hi)!important;color:var(--mt-text)!important}' +
      '#ytt-panel input.ytt-switch{flex:none!important;position:relative!important;width:40px!important;height:24px!important;margin:0!important;padding:0!important;border:0!important;border-radius:12px!important;background:var(--mt-sw-off)!important;cursor:pointer!important;transition:background .18s!important;box-sizing:border-box!important;min-width:0!important;min-height:0!important;max-height:none!important;line-height:1!important;text-transform:none!important;letter-spacing:normal!important;appearance:none!important;-webkit-appearance:none!important}' +
      '#ytt-panel input.ytt-switch::after{content:""!important;position:absolute!important;top:2px!important;left:2px!important;width:20px!important;height:20px!important;border-radius:50%!important;background:#fff!important;box-shadow:0 1px 3px rgba(0,0,0,.25)!important;transition:transform .18s cubic-bezier(.3,.7,.3,1)!important}' +
      '#ytt-panel input.ytt-switch:checked{background:' + ACCENT + '!important;box-shadow:0 0 12px -2px color-mix(in srgb,' + ACCENT + ' 70%,transparent)!important}' +
      '#ytt-panel input.ytt-switch:checked::after{transform:translateX(16px)!important}' +
      '#ytt-panel .ytt-mode:focus-visible,#ytt-panel .ytt-x:focus-visible,#ytt-panel input.ytt-switch:focus-visible{outline:2px solid ' + ACCENT + '!important;outline-offset:2px!important}' +
      // glassware:frame end
      '#ytt-panel{position:fixed;top:16px;right:16px;width:400px;box-sizing:border-box;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);' +
      'display:flex;flex-direction:column;z-index:2147483647;background:radial-gradient(120% 40% at 0% 0%,rgba(255,154,61,.16),transparent 64%),var(--mt-glass);' +
      '-webkit-backdrop-filter:blur(28px) saturate(170%);backdrop-filter:blur(28px) saturate(170%);color:var(--mt-text);' +
      'border:1px solid var(--mt-edge);border-radius:22px;box-shadow:0 0 0 .5px rgba(255,154,61,.35),0 0 40px -12px rgba(255,154,61,.45),0 14px 44px var(--mt-drop),inset 0 1px 0 var(--mt-hl);' +
      'font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;transition:opacity .15s ease;text-align:left}' +
      '#ytt-panel.ytt-peek{opacity:.18}' +
      '#ytt-panel *{box-sizing:border-box;font-family:inherit !important;letter-spacing:normal}' +
      '#ytt-panel .ytt-head{display:flex;align-items:flex-start;justify-content:space-between;padding:14px 18px 10px 18px}' +
      '#ytt-panel .ytt-title{font-weight:650;font-size:16px}' +
      '#ytt-panel .ytt-sub{opacity:.55;font-size:12px}' +
      '#ytt-panel .ytt-tagline{font-size:12px;color:var(--mt-ink);margin:1px 0 2px}' +
      '#ytt-panel .ytt-tabs{display:flex;gap:4px;margin:0 14px 6px;padding:4px;background:var(--mt-ctl);border-radius:12px}' +
      '#ytt-panel .ytt-tab{flex:1;padding:7px 4px;border:0;border-radius:9px;background:transparent;color:var(--mt-text);' +
      'cursor:pointer;font-size:12.5px;font-weight:550;opacity:.65}' +
      '#ytt-panel .ytt-tab:hover{opacity:1}' +
      '#ytt-panel .ytt-tab.on{background:rgba(255,154,61,.2);color:var(--mt-ink);opacity:1}' +
      '#ytt-panel .ytt-body{overflow-y:auto;padding:2px 16px 16px;scrollbar-width:thin !important}' +
      '#ytt-panel .ytt-sec{margin:18px 0 4px;display:flex;align-items:center;gap:7px;color:var(--mt-ink);font:700 10.5px/1.2 ui-monospace,"SF Mono","Cascadia Mono",Menlo,monospace !important;letter-spacing:.16em;text-transform:uppercase}' +
      '#ytt-panel .ytt-sec::before{content:"";width:6px;height:6px;border-radius:1px;background:var(--mt-ink);transform:rotate(45deg);flex:none}' +
      '#ytt-panel .ytt-brand{display:flex;align-items:center;gap:11px;min-width:0}' +
      '#ytt-panel .ytt-icon{width:34px;height:34px;border-radius:10px;flex:none;display:grid;place-items:center;' +
      'background:radial-gradient(circle at 25% 20%,#ffb23d,transparent 60%),radial-gradient(circle at 85% 30%,#ff2d6f,transparent 60%),' +
      'radial-gradient(circle at 40% 95%,#ff6a1f,transparent 65%),#7a2cd6;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}' +
      '#ytt-panel .ytt-icon{position:relative}' +
      '#ytt-panel .ytt-icon-img{position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;display:block}' +
      '#ytt-panel .ytt-icon svg{width:20px;height:20px;display:block}' +
      '#ytt-panel .ytt-ctx{display:flex;align-items:center;gap:8px;margin:0 16px 10px;min-width:0}' +
      '#ytt-panel .ytt-host{font:12.5px ui-monospace,"SF Mono","Cascadia Mono",Menlo,monospace !important;opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#ytt-panel .ytt-chip{font:700 10px/1 ui-monospace,"SF Mono","Cascadia Mono",Menlo,monospace !important;letter-spacing:.12em;text-transform:uppercase;' +
      'padding:5px 8px;border-radius:6px;background:rgba(255,154,61,.16);color:var(--mt-ink);flex:none}' +
      '#ytt-panel .ytt-chip.off{background:var(--mt-ctl-hi);color:var(--mt-sub)}' +
      '#ytt-panel .ytt-foot{padding:9px 16px 12px;font-size:11.5px;opacity:.55;border-top:1px solid var(--mt-line)}' +
      '#ytt-panel .ytt-seg.inline{margin-top:0;flex:none}' +
      '#ytt-panel .ytt-seg.inline .ytt-segbtn{flex:none;padding:6px 11px}' +
      '#ytt-panel .ytt-seg.grid{display:grid;gap:4px}' +
      '#ytt-panel .ytt-pickrow{padding:0}' +
      '#ytt-panel .ytt-pick{display:inline-flex;align-items:center;gap:7px;flex:none;max-width:180px;padding:6px 10px 6px 12px;border:0;border-radius:9px;' +
      'background:var(--mt-ctl-hi);color:var(--mt-ink);font-size:12.5px;font-weight:650;cursor:pointer}' +
      '#ytt-panel .ytt-pick:hover,#ytt-panel .ytt-pick.open{background:rgba(255,154,61,.18)}' +
      '#ytt-panel .ytt-pick span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#ytt-panel .ytt-chev{width:7px;height:7px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:translateY(-2px) rotate(45deg);transition:transform .15s;flex:none}' +
      '#ytt-panel .ytt-pick.open .ytt-chev{transform:translateY(1px) rotate(-135deg)}' +
      '#ytt-panel .ytt-seg[hidden]{display:none !important}' +
      '#ytt-panel .ytt-seg.grid .ytt-segbtn{padding:7px 4px;line-height:1.25;min-width:0;white-space:normal;overflow-wrap:break-word}' +
      // The panel lives in the page, so undo site-wide text rules it would otherwise inherit (no-wrap buttons and labels).
      '#ytt-panel,#ytt-panel *{white-space:normal}' +
      '#ytt-panel label{color:inherit!important;text-shadow:inherit!important;font-weight:inherit}' +   // sites style <label> (Reddit dark mode: white)
      '#ytt-panel .ytt-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;cursor:default}' +
      '#ytt-panel label.ytt-row{cursor:pointer}' +
      '#ytt-panel .ytt-label{flex:1;min-width:0}' +
      '#ytt-panel .ytt-count{opacity:.9}#ytt-panel .ytt-count[hidden]{display:none}' +
      '#ytt-panel .ytt-hint{display:block;opacity:.65;font-size:11.5px;margin-top:1px}' +
      '#ytt-panel .ytt-field{padding:7px 0}' +
      '#ytt-panel .ytt-field-head{display:flex;justify-content:space-between;gap:8px}' +
      '#ytt-panel .ytt-default{opacity:.4;font-size:11px;white-space:nowrap}' +
      '#ytt-panel .ytt-slider{display:grid;grid-template-columns:1fr 70px;gap:10px;align-items:center;margin-top:4px}' +
      '#ytt-panel input[type=range]{width:100%;accent-color:' + ACCENT + ';margin:0;cursor:pointer}' +
      '#ytt-panel input.ytt-num,#ytt-panel select.ytt-sel,#ytt-panel input.ytt-text{background:var(--mt-input);color:var(--mt-text);' +
      'border:1px solid var(--mt-input-edge);border-radius:8px;padding:5px 7px;font-size:12.5px;outline:none}' +
      '#ytt-panel input.ytt-num:focus,#ytt-panel select.ytt-sel:focus,#ytt-panel input.ytt-text:focus{border-color:' + ACCENT + '}' +
      '#ytt-panel input.ytt-num{width:70px}' +
      '#ytt-panel input.ytt-text{width:100%;margin-top:4px}' +
      '#ytt-panel .ytt-names-list{margin-top:4px;filter:blur(5px);transition:filter .2s;word-break:break-word}' +
      '#ytt-panel .ytt-names:hover .ytt-names-list{filter:none}' +
      // Screenshot safe under Default account; names in the panel itself hidden while it's on
      '#ytt-panel .ytt-ss{margin:16px 0 0;padding-top:12px;border-top:1px solid var(--mt-line)}' +
      '#ytt-panel .ytt-subhead{color:var(--mt-ink);font:700 10.5px/1.2 ui-monospace,"SF Mono","Cascadia Mono",Menlo,monospace !important;letter-spacing:.16em;text-transform:uppercase;margin:0 0 2px}' +
      '#ytt-panel .ytt-subgrp{margin:2px 0 0 4px;padding:0 0 0 12px;border-left:2px solid var(--mt-line)}' +
      '#ytt-panel b.ytt-secret{filter:blur(5px);transition:filter .2s}' +
      '#ytt-panel b.ytt-secret:hover{filter:none}' +
      '#ytt-panel input.ytt-secret:not(:focus){color:transparent!important;text-shadow:0 0 7px var(--mt-text)}' +
      '#ytt-panel select.ytt-sel{max-width:170px;cursor:pointer}' +
      '#ytt-panel select.ytt-sel option{background:var(--mt-solid);color:var(--mt-text)}' +
      '#ytt-panel .ytt-btns{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:6px;margin-top:14px}.ytt-btns>.ytt-btn{text-align:center}' +
      '#ytt-panel .ytt-btn{padding:7px 11px;border:0;border-radius:8px;background:var(--mt-btn);color:var(--mt-text);cursor:pointer;font-size:12.5px}' +
      '#ytt-panel .ytt-btn:hover{background:var(--mt-btn-hi)}' +
      '#ytt-panel .ytt-btn.primary{background:' + ACCENT + ';color:#1a1a1a;font-weight:650}' +
      '#ytt-panel .ytt-btn.primary:hover{background:#ffad5c}' +
      '#ytt-panel .ytt-status{min-height:16px;font-size:12px;color:var(--mt-good);margin-top:8px}' +
      '#ytt-panel .ytt-status.err{color:var(--mt-bad)}' +
      '#ytt-panel .ytt-info{background:var(--mt-ctl);border-radius:10px;padding:9px 11px;margin:8px 0 4px;font-size:12px}' +
      '#ytt-panel .ytt-info b{font-weight:650}' +
      '#ytt-panel .ytt-note{opacity:.65;font-size:11.5px;margin-top:12px}' +
      '#ytt-panel .ytt-off{opacity:.4;pointer-events:none}' +
      '#ytt-panel details{margin-top:10px}' +
      '#ytt-panel .ytt-master{margin:10px 0 2px;padding:4px 12px;border-radius:12px;background:rgba(255,154,61,.1);border:1px solid rgba(255,154,61,.25)}' +
      '#ytt-panel .ytt-master .ytt-label{font-weight:650;font-size:14px}' +
      '#ytt-panel .ytt-master .ytt-hint{font-weight:400;font-size:11.5px}' +
      '#ytt-panel .ytt-seg{display:flex;gap:4px;padding:4px;margin-top:6px;background:var(--mt-ctl);border-radius:12px}' +
      '#ytt-panel .ytt-segbtn{flex:1;padding:8px 4px;border:0;border-radius:9px;background:transparent;color:var(--mt-text);cursor:pointer;font-size:12.5px;font-weight:600;opacity:.65}' +
      '#ytt-panel .ytt-segbtn:hover{opacity:1}' +
      '#ytt-panel .ytt-segbtn.on{background:' + ACCENT + ';color:#1a1a1a;opacity:1}' +
      '#ytt-panel .ytt-seg-hint{margin:6px 0 2px}' +
      '#ytt-panel .ytt-swatch{width:44px;height:24px;border-radius:6px;border:1px solid var(--mt-input-edge);flex:none}' +
      '#ytt-panel summary{cursor:pointer;opacity:.7;font-size:12px;padding:4px 0}'
    );

    function gwCloseIcon() {   // glassware:icon (the close button's ×, stamped by tools/frame.py)
        const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg');
        for (const [k, v] of [['viewBox', '0 0 24 24'], ['width', '13'], ['height', '13'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2.2'], ['stroke-linecap', 'round'], ['aria-hidden', 'true']]) s.setAttribute(k, v);
        for (const d of ['M6 6l12 12', 'M18 6 6 18']) { const q = document.createElementNS(NS, 'path'); q.setAttribute('d', d); s.append(q); }
        return s;
    }   // glassware:icon end
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined && text !== null) e.textContent = text;
      return e;
    };
    const fmt = (v, step) => {
      const dec = String(step).includes('.') ? String(step).split('.')[1].length : 0;
      return Number(v).toFixed(dec);
    };

    const ICON_SRC = 'data:image/webp;base64,UklGRugJAABXRUJQVlA4WAoAAAAQAAAAXwAAXwAAQUxQSBECAAABh+SokSRHUlQb7X/5o7V3DCIiXVEK8UdQgU4hptrQIVS5LXUukhgkUSuHRVCuwArxnlDQRpJyjP/+HbOBiP5PAOOiLMXSXKK/6JjYAoO2JEmKJMk8qrl7mflpZd/o/z9kj2GYubky/RjjGCQiJoAIRXR7AxY3n9x/eLvbITqIn9r8nK6z1fJyOt+/vGrdLtdtqdUOUEQT83uvHj6ZkOHieO9k/3zZNCEhJKRO6b17+QKsX5tBwGxjd7Or5lsOQOXW/ddUiRwrweWnow4CHAYGE0qIPO1gMmxk7KhWTKAhV5txD3DttjGbIjKORXGp3ebkApOxuZivXQbrvUrOwZ2hJH2+0Tgn4AYlFl9gkpb7arnxUaQFGs1XT6/IW+7NVg/kvLBW83siczXTO2Qu9U+7qWGpyQ2VyK6Tnjq5iT7pK730ld4/wJ3e/75Vev8A9+891+yYZde2OLc6Jfn8yhXKbT27xKkdH52lZg4uj8hcV/tXR7NwWmZ7uz3YILPdC5/vTuWkHBsf9tvl1odpVX9yxCqa0Q2S1r1+sGqiNxrjyEdcv1U6tBE0TQWUjBmOShMUSfJqekdGibgytyVRJeE6H076slEOdnC5ACQscGUtNOpJMujXZsHGxyedCoiKsWultPNZjT4ZTrf33h9FqcZQAddSQqyW8+nJjfGNXr9BP5l+FtdS2/Xpwf7WWU9trQYAAFZQOCCwBwAA0CUAnQEqYABgAD4pEodCoaEJXgJ4DAFCUAWdlvYg/tvxG/AD5SrZ/peB1MxmwdvTxMNwp5rno1/zHqAdKxz6Xse/tH+33tFf//Tt5Txk/5SZCbi/2D4MDw3efd/t/cz7ifn//ie4F/JP6N/pPuC5Ez9nQ+mv0IOEcKmJGtJyI6OihtJ1+dcl7h+4vM45aN6j69vFGM5lAqxR/0Gr92ObomQqq8OgfGEPZVvxrLY0UMzrOJGZ/Drg9bCS5pOPMb+BmH+U59c+eXit5BarqhoY+4Ek9mLcR8JYx2qPOubx2VAcdA2M8iCsbTjoFFEC+6zfMftazZQd7a8Wah/ILc5pxXqSVBE9elsBBPFn1OmoipCWnIW/NAmEyCG9d7kQJDfaj+cLOq6yrGkqBEcfqqC2iaBBoeaTUQAAvv+ChBaQphaVJFObGNKQRGJrwo/qL10l/ATnPxmzun0ahD2Ksy4LgE8H8cVRAfVgFyA+nLB19OUiTtUXI8QTrU8TQ5Lvgecr3PsP/9yitmnGIT9VYZO//qDtb3pWtp7fJoJmdmlznOLyVzdYVz7ot5CsytEXZCndpV8UbTd6XNTfXLEx/fimEA9qe2/4cE8ThXWRuZnWjFzzk0x9JS++DJDJkaLbeOdGwnInJlRuEVo6AUMrVQ8xZ1NUqJi4NrTUrx2R1utNNBMxeJD0oS0/4OrJ9VZmTngUZK3fe6ziDxs/x+eDiqJAoOQAb7RUJuaSVHEtQfTeHPUU9auVuslL0A7thtrWvPjevbNBu8aQb0CTzuex9aer/TA1XwNj/L3HiKYhIHJPZmSW2z47PbFXFoJPIsrEXik2oDEzklCK3lNv718hA+206jhExcBsi6k1xc0sktJITc1lgjqfY8lmx/TDwRkqJSKdMeny2MsQ3VwOFxopPDQM2udRVRyQSeAA/uZbu0Y/xh0foTtUTdyK0auznrL7uDLthDkWziF/5udS2raoghUf7/PA1TccnYZMQolO90brFXNc8/cPv/ZDLlXsuCfYLyn67yo0SR24K0aJs/4Uv0DzOzr5aiWZEBIib+JONNTG/kT0NjPOaUg/McfXEvb86WOpF+FO+pERR3t03bvs4zGwCxr/bzi7iyiX9ljMGtSszPLGWNjs2SGKY/0W/b7Uif/nMf+0qC1lARfZPJ2njfDjKEjdo5bOmh+ATa6TSBHkCNGRUICfjvN2t090LyDaDRmZ5x/xMnzGxfmN4D6XZE0HK3TSz4DI8qHbG32GoTMJ9eGbsgYRWTUHKfIQ5MRQdSFUoRXwI3u5uSPt20UoUBNqj/pzFgdXmw5YtCwVLRVMA6XGCd3DHuctrWxrSquPt4jLm+Nv0/cl/JE2W/on0mddF2vrBcx97FrV6EnNXkoP49Q2VvTsfwgvxAn/q40DJ5pCRjKE8TQotnqWSA3MerTWWP/Nh9DwYX77pnlZKQBz0vWcyG8m1JH9//zgfmBdpEYjvn4da7m9xOxb44O33GNgTK1cSw55UguSegpA1BbX2Vuad5sWt3rf5GmxsRbNxuLYElAHF//zVgLqgR0D/2ufILBmMjNP0W9Ay2XtYDQDElqFVdvoRqJULbaWEEbUQzvRWURWP9uNU0gtcDiDH0vke8PYusQbMx+BOnrcm6a3L36mURv6lJ/8Seko63BHmeO3TnuXQf0S89pEWSuUp1mTd+hRlWa9X3ruEG/zfEc/gOJFw9EVl8J5ZIamuERC3Tp3ZNX54TGBXbz0KNTRnod2EeXEKy5i1I4yx9D9kfG+LKsTnVhyP3+3w+dZyt0ri4hb04GTCwXy19nptjS0vspQIz/sfxOao3LbUC/j/AozH508H4krecJBCzSZ61UJAt228YL39sTxiUJKgJUeN1RvwjIcEtdvjGgIKTKCd1sINCLvmZyJw460WTKfBNDWU+zacowsEPUuRJh229sVW97aOdWLxF6qsfSf2jo8JeOqwXWYeG5498Iaw8nEIQ/AcC0YK5E5CO1AKhC38bi7W/lRmOmZcj2kRuOsZCLkFSCAr9HBR+vFaC+l6UgPJGoTMWucwtihEyLNfxgyigZG+T6Bdr/FPFSrZDrDxThf5o59Gz/Pc5772nKs52qCeZZROlMjesCBwalffWqMZONWES1sZ1tdXjQPg8lLY8Gn/IdM+PJJiIJp0M/f7trftVmwE8xbsadafoF+NO/ncjceLV+gO8+jnrMzP69XN3QFInQJDywdWZ/JB7smld44tFhWopsDTf3ELJwFJbEuWgNcXKZH8mSgiV7dAMu4YcGrxJ6RdLhAUXnLoS7ATswxXQmrHaOiDre72WZGiOuPvVPae288QrTicc07SWk8bwP3w0yR80KpiZ5IMyu7IYUBOYdp93xM/3VYXe3jqJW5978KyqJtursk5wBbFKQuPKwBhtLv6op5NCQfIb4MNVV9YpoeD/mlyzyXOtaiGPrY/e1SZGkuvPPhLkJamC5e3Hm+E8JbVub96CDfIK086GZwQIndnhtqhCvZM1qYgNtrpL92QQ6kTdT6dqwxNj3rp6eKwSiczQut0XWF+4RsZ0u1K0LmtDo5rj3BoOxLZevRX+SHPSf1TaZwBcD+xlJuJdFH1cVsIIeAivEJFOtvqPIcu79cCgAA'; // app icon (assets/icons), embedded by tools/panel_icons.py
    const VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '';
    function iconTile() {
      const tile = el('div', 'ytt-icon');
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', 'M9.5 7.6v8.8c0 .7.8 1.1 1.4.7l6.6-4.4c.5-.3.5-1.1 0-1.4l-6.6-4.4c-.6-.4-1.4 0-1.4.7z');
      p.setAttribute('fill', '#fff');
      svg.append(p);
      tile.append(svg);
      const img = el('img', 'ytt-icon-img');
      img.alt = '';
      img.addEventListener('error', () => img.remove());
      img.src = ICON_SRC;
      tile.append(img);
      return tile;
    }

    function labelBlock(label, hint) {
      const l = el('span', 'ytt-label', label);
      if (hint) l.append(el('span', 'ytt-hint', hint));
      return l;
    }
    function section(parent, title) { parent.append(el('div', 'ytt-sec', title)); }

    function toggleRow(parent, label, hint, get, set) {
      const row = el('label', 'ytt-row');
      const c = el('input', 'ytt-switch');
      c.type = 'checkbox';
      c.checked = !!get();
      c.addEventListener('change', () => set(c.checked));
      row.append(labelBlock(label, hint), c);
      parent.append(row);
      return row;
    }

    // Slider + typed number. The slider range is a convenience; the box accepts any number.
    function sliderRow(parent, label, hint, o, get, set, def) {
      const f = el('div', 'ytt-field');
      const head = el('div', 'ytt-field-head');
      head.append(labelBlock(label, hint));
      if (def !== undefined) head.append(el('span', 'ytt-default', 'default ' + def + (o.unit ? ' ' + o.unit : '')));
      const grid = el('div', 'ytt-slider');
      const r = el('input');
      r.type = 'range'; r.min = o.min; r.max = o.max; r.step = o.step;
      const n = el('input', 'ytt-num');
      n.type = 'number'; n.step = o.step;
      if (o.hardMin !== undefined) n.min = o.hardMin;
      // typed values may go past the slider, but not wildly (a typo like 50 for 0.50 would grind the page)
      const hardMax = o.hardMax !== undefined ? o.hardMax : o.max * 3;
      n.max = hardMax;
      const show = v => { r.value = v; n.value = fmt(v, o.step); };
      show(get());
      r.addEventListener('input', () => { const v = parseFloat(r.value); n.value = fmt(v, o.step); set(v); });
      r.addEventListener('pointerdown', () => panelEl && panelEl.classList.add('ytt-peek'));
      n.addEventListener('change', () => {
        let v = parseFloat(n.value);
        if (!isFinite(v)) { show(get()); return; }
        if (o.hardMin !== undefined) v = Math.max(o.hardMin, v);
        v = Math.min(hardMax, v);
        show(v);
        set(v);
      });
      grid.append(r, n);
      f.append(head, grid);
      parent.append(f);
      return f;
    }

    // Choices are segmented buttons. 2-3 short options sit inline on the right. Longer sets show the
    // current choice as a compact pill; tapping it opens the buttons underneath, and picking one folds them away.
    function selectRow(parent, label, hint, options, get, set) {
      const short = options.length <= 3 && options.every(([, t]) => t.length <= 12);
      const cur = String(get());
      const seg = el('div', 'ytt-seg ' + (short ? 'inline' : 'grid'));
      // Equal columns; long labels get 3 to a row so they wrap onto two lines instead of spilling out.
      if (!short) seg.style.gridTemplateColumns = 'repeat(' + Math.min(options.length, options.some(([, t]) => t.length > 10) ? 3 : 4) + ',minmax(0,1fr))';
      let pill = null;
      for (const [val, text] of options) {
        const b = el('button', 'ytt-segbtn' + (String(val) === cur ? ' on' : ''), text);
        b.type = 'button';
        b.addEventListener('click', () => {
          for (const x of seg.children) x.classList.toggle('on', x === b);
          if (pill) { pill.firstChild.textContent = text; seg.hidden = true; pill.classList.remove('open'); }
          set(val);
        });
        seg.append(b);
      }
      if (short) {
        const row = el('div', 'ytt-row');
        row.append(labelBlock(label, hint), seg);
        parent.append(row);
        return row;
      }
      const field = el('div', 'ytt-field');
      const row = el('div', 'ytt-row ytt-pickrow');
      const now = options.find(([v]) => String(v) === cur) || options[0];
      pill = el('button', 'ytt-pick');
      pill.type = 'button';
      pill.append(el('span', null, now[1]), el('i', 'ytt-chev'));
      pill.addEventListener('click', () => { seg.hidden = !seg.hidden; pill.classList.toggle('open', !seg.hidden); });
      seg.hidden = true;
      row.append(labelBlock(label, hint), pill);
      field.append(row, seg);
      parent.append(field);
      return field;
    }

    function btn(parent, text, fn, primary) {
      const b = el('button', 'ytt-btn' + (primary ? ' primary' : ''), text);
      b.type = 'button';
      b.addEventListener('click', fn);
      parent.append(b);
      return b;
    }

    let panelEl = null;
    let bodyEl = null;
    let tab = lsGet(TAB_KEY) || 'lava';

    // ---------------- Account tab ----------------
    function buildAccount(body) {
      // ---- Default account, with Screenshot safe under it ----
      // While Screenshot safe is on, this panel hides the account's name and page ID too (blurred, or the
      // placeholder): readable only while you point at it or type in the box.
      const hiding = !!PRIV.get('on');
      const secret = text => {
        if (!hiding) return el('b', null, text);
        return PRIV.get('mode') === 'text' ? el('b', null, PRIV.get('placeholder') || 'User') : el('b', 'ytt-secret', text);
      };
      section(body, 'Default account');
      const saved = ACCT.loadCfg();
      const id = ACCT.currentId();
      const info = el('div', 'ytt-info');
      const l1 = el('div'); l1.append('Signed in now as page ID: ', id ? secret(id) : el('b', null, '(main channel)'));
      const l2 = el('div');
      const showSaved = name => { l2.textContent = ''; if (name) l2.append('Saved default: ', secret('"' + name + '"')); else l2.append('No default saved yet.'); };
      showSaved(saved && saved.name);
      info.append(l1, l2);
      body.append(info);

      const f = el('div', 'ytt-field');
      f.append(labelBlock('Channel name', 'Exactly as shown in the account picker'));
      const input = el('input', 'ytt-text' + (hiding ? ' ytt-secret' : ''));
      input.type = 'text';
      input.value = saved ? saved.name : '';
      f.append(input);
      body.append(f);

      let enabled = saved ? saved.enabled !== false : true;
      const auto = toggleRow(body, 'Auto-switch when this app launches', saved ? 'One try per launch; manual switches are respected until refresh' : 'Save a default account below first',
        () => enabled,
        v => {
          enabled = v;
          const c = ACCT.loadCfg();
          if (c) { c.enabled = v; ACCT.saveCfg(c); say(v ? 'Auto-switch on.' : 'Auto-switch off.'); }
        });
      // without a saved default there's nothing to switch to, so the switch can't be flipped (it wouldn't stick)
      if (!saved) { auto.querySelector('input').disabled = true; auto.classList.add('ytt-off'); }

      const status = el('div', 'ytt-status');
      const say = (msg, err) => { status.textContent = msg; status.classList.toggle('err', !!err); };
      const btns = el('div', 'ytt-btns');
      btn(btns, 'Save as default', () => {
        const name = input.value.trim();
        if (!name) return say('Enter the channel name first.', true);
        ACCT.saveCfg({ enabled, name, id: ACCT.currentId() });
        say('Saved. Applies the next time the app launches.');
        showSaved(name);
      }, true);
      btn(btns, 'Clear', () => {
        ACCT.clearCfg();
        say('Default cleared.');
        showSaved(null);
      });
      body.append(btns, status);

      // Screenshot safe: its switch always shows; its settings only while it's on
      const ss = el('div', 'ytt-ss');
      ss.append(el('div', 'ytt-subhead', 'Screenshot safe'));
      toggleRow(ss, 'Hide my account names', 'Your account and channel names, handles and email, everywhere on ' + SITE_NAME + ' and ' +
        (IS_MUSIC ? 'YouTube' : 'YouTube Music') + ', and in this panel', () => PRIV.get('on'), v => { PRIV.set('on', v); render(); });
      body.append(ss);
      if (hiding) {
        const pv = el('div', 'ytt-subgrp');
        selectRow(pv, 'How', null, [['blur', 'Blur'], ['text', 'Placeholder']], () => PRIV.get('mode'), v => { PRIV.set('mode', v); render(); });
        if (PRIV.get('mode') === 'text') {
          const pf = el('div', 'ytt-field');
          pf.append(labelBlock('Placeholder', 'Shown instead of the name, e.g. "Made for User"'));
          const pin = el('input', 'ytt-text');
          pin.type = 'text';
          pin.value = PRIV.get('placeholder');
          pin.addEventListener('change', () => { PRIV.set('placeholder', pin.value.trim() || 'User'); render(); });
          pf.append(pin);
          pv.append(pf);
        }
        toggleRow(pv, 'First names too', 'Your first name on its own, like "Sam\u2019s Music" (can also catch other people who share it)',
          () => PRIV.get('firstNames'), v => PRIV.set('firstNames', v));
        toggleRow(pv, 'Blur my profile pictures', 'Top bar avatar and the account menu', () => PRIV.get('avatars'), v => PRIV.set('avatars', v));
        const ef = el('div', 'ytt-field');
        ef.append(labelBlock('Also hide', 'Other names or words, separated by commas'));
        const ein = el('input', 'ytt-text');
        ein.type = 'text';
        ein.value = PRIV.get('extra');
        ein.placeholder = 'nickname, old channel name';
        ein.addEventListener('change', () => PRIV.set('extra', ein.value));
        ef.append(ein);
        pv.append(ef);
        const found = PRIV.names();
        const nf = el('div', 'ytt-info ytt-names');
        nf.append(el('div', null, found.length ? 'Hiding ' + found.length + ' name' + (found.length === 1 ? '' : 's') + ' (hover to read):' :
          'No names found yet. Open the account menu once, or press Find names.'));
        if (found.length) nf.append(el('div', 'ytt-names-list', found.join(' \u00b7 ')));
        pv.append(nf);
        const pst = el('div', 'ytt-status');
        const pb = el('div', 'ytt-btns');
        btn(pb, 'Find names', async () => {
          pst.textContent = 'Looking\u2026';
          const ok = await PRIV.fetchNames();
          pst.textContent = ok ? 'Updated from your account list.' : 'Could not read the account list here; open the account menu once instead.';
          if (ok) render();
        });
        btn(pb, 'Forget found names', () => { PRIV.forget(); render(); });
        pv.append(pb, pst);
        body.append(pv);
      }

      section(body, 'Troubleshooting');
      toggleRow(body, 'Log switching to the console', 'Lines start with [acct-switch] (F12)', ACCT.debugOn, ACCT.setDebug);
      body.append(el('div', 'ytt-note',
        'Switch to the account you want first, then save. ' + SITE_NAME + ' remembers its own default, separate from ' +
        (IS_MUSIC ? 'YouTube' : 'YouTube Music') + '.'));
    }

    // ---------------- Video quality tab ----------------
    const QUALITIES = [
      ['highres', 'Best'], ['hd2880', '5K'], ['hd2160', '4K'], ['hd1440', '1440p'],
      ['hd1080', '1080p'], ['hd720', '720p'], ['large', '480p'], ['medium', '360p'], ['small', '240p'], ['tiny', '144p'],
    ];
    function buildHD(body) {
      const set = (k, kind) => v => {
        hd[k] = v;
        saveHD();
        if (kind === 'res') HDM.applyRes();
        else if (kind === 'size') HDM.applySize();
        else if (kind === 'theater') HDM.applyTheater();
        if (k === 'changeResolution' || k === 'changePlayerSize' || k === 'useCustomSize') render();
      };
      const get = k => () => hd[k];

      toggleRow(body, 'Set quality automatically', 'Applies to every video you open', get('changeResolution'), set('changeResolution', 'res'));
      const q = el('div', hd.changeResolution ? '' : 'ytt-off');
      section(q, 'YouTube');
      selectRow(q, 'Default', "If a video doesn't have it, the next lower one is used", QUALITIES, get('targetRes'), set('targetRes', 'res'));
      selectRow(q, '60 fps videos', 'Separate choice for high-frame-rate videos', [['', 'Same']].concat(QUALITIES),
        get('highFramerateTargetRes'), set('highFramerateTargetRes', 'res'));
      section(q, 'YouTube Music');
      selectRow(q, 'Music videos', 'Songs in Video mode; audio-only songs are skipped', [['', 'Same']].concat(QUALITIES),
        get('musicTargetRes'), set('musicTargetRes', 'res'));
      section(q, 'Extras');
      toggleRow(q, 'Prefer Premium bitrate', 'YouTube Premium only: picks "1080p Premium" when offered', get('preferPremium'), set('preferPremium', 'res'));
      toggleRow(q, 'Sharp from the first second', 'YouTube: reloads the buffer at the new quality (tiny restart)', get('flushBuffer'), set('flushBuffer'));
      body.append(q);

      section(body, 'YouTube player');
      toggleRow(body, 'Open videos in theater mode', null, get('autoTheater'), set('autoTheater', 'theater'));
      toggleRow(body, 'Resize player in theater mode', 'Sizes it to match the chosen quality', get('changePlayerSize'), set('changePlayerSize', 'size'));
      const sz = el('div', hd.changePlayerSize ? '' : 'ytt-off');
      toggleRow(sz, 'Use a custom height', null, get('useCustomSize'), set('useCustomSize', 'size'));
      if (hd.useCustomSize) {
        sliderRow(sz, 'Custom height', null, { min: 270, max: 2160, step: 10, unit: 'px', hardMin: 270 },
          get('customHeight'), set('customHeight', 'size'), HD_DEFAULTS.customHeight);
      }
      toggleRow(sz, 'Remove black bars', 'Caps the height to the video shape on small screens', get('removeBlackBars'), set('removeBlackBars', 'size'));
      body.append(sz);

      const adv = el('details');
      adv.append(el('summary', null, 'Advanced'));
      toggleRow(adv, 'Use the player API', 'Off = click through the gear menu instead', get('useAPI'), set('useAPI', 'res'));
      toggleRow(adv, 'Set quality as early as possible', 'Turn off if videos fail to load', get('setResolutionEarly'), set('setResolutionEarly'));
      toggleRow(adv, 'Theater error-screen fix', 'Keeps the right error screen in front', get('enableErrorScreenWorkaround'), set('enableErrorScreenWorkaround', 'size'));
      toggleRow(adv, 'Allow theater cookie', 'Lets theater mode apply faster', get('allowCookies'), set('allowCookies'));
      body.append(adv);

      const status = el('div', 'ytt-status');
      const btns = el('div', 'ytt-btns');
      btn(btns, 'Apply to this video now', () => { HDM.applyRes(); status.textContent = 'Applied.'; }, true);
      btn(btns, 'Reset to defaults', () => { Object.assign(hd, HD_DEFAULTS); saveHD(); HDM.applyRes(); render(); });
      body.append(btns, status);
      body.append(el('div', 'ytt-note', 'Quality settings are shared by YouTube and YouTube Music.'));
    }

    // ---------------- Lava lamp tab ----------------
    function buildLava(body) {
      const P = PRESETS[lavaStore.profile];
      const set = k => v => { lavaSet(k, v); if (k === 'blobs' || k === 'video' || k === 'randomize') render(); };
      const get = k => () => lava[k];

      toggleRow(body, IS_MUSIC ? 'Lava animation' : 'Lava background',
        (IS_MUSIC ? 'Off = still blurred art; the frosted UI stays' : 'Shows behind the page while a video plays') +
        '. This switch is per site.',
        () => lavaOn, v => { setLavaOn(v); render(); });

      const all = el('div', lavaOn ? '' : 'ytt-off');

      section(all, 'Profile');
      const seg = el('div', 'ytt-seg');
      for (const p of Object.keys(PRESETS)) {
        const b = el('button', 'ytt-segbtn' + (p === lavaStore.profile ? ' on' : ''), PROFILE_NAMES[p]);
        b.type = 'button';
        b.addEventListener('click', () => { lavaSwitchProfile(p); render(); });
        seg.append(b);
      }
      all.append(seg);
      all.append(el('div', 'ytt-hint ytt-seg-hint',
        'Each profile remembers its own look. Edits below change the ' + PROFILE_NAMES[lavaStore.profile] + ' profile.'));

      section(all, 'Background');
      sliderRow(all, 'Blur', '× 100 px', { min: 0, max: 1.5, step: 0.01, hardMin: 0 }, get('bgBlur'), set('bgBlur'), P.bgBlur);
      sliderRow(all, 'Brightness', null, { min: 0, max: 2, step: 0.01, hardMin: 0 }, get('bgBrightness'), set('bgBrightness'), P.bgBrightness);
      sliderRow(all, 'Saturation', null, { min: 0, max: 5, step: 0.05, hardMin: 0 }, get('bgSaturate'), set('bgSaturate'), P.bgSaturate);
      sliderRow(all, 'Zoom', null, { min: 1, max: 2.5, step: 0.01, hardMin: 0.1 }, get('bgScale'), set('bgScale'), P.bgScale);
      sliderRow(all, 'Frosted-glass blur', 'Player bar and panels', { min: 0, max: 40, step: 1, unit: 'px', hardMin: 0 }, get('uiBlur'), set('uiBlur'), P.uiBlur);

      section(all, 'Motion');
      toggleRow(all, 'Random motion', 'Off = the theme\'s fixed animation (speed and amount need this on)', get('randomize'), set('randomize'));
      const mo = el('div', lava.randomize ? '' : 'ytt-off');
      sliderRow(mo, 'Speed', '1 = normal, 2 = twice as fast', { min: 0.1, max: 4, step: 0.05, unit: '×', hardMin: 0.05 },
        get('motionSpeed'), set('motionSpeed'), P.motionSpeed);
      sliderRow(mo, 'Amount', 'How far it breathes, drifts, tilts and wanders', { min: 0, max: 3, step: 0.05, unit: '×', hardMin: 0 },
        get('motionAmount'), set('motionAmount'), P.motionAmount);
      if (IS_MUSIC) toggleRow(mo, 'New blob path every song', null, get('reseedPerSong'), set('reseedPerSong'));
      const mb = el('div', 'ytt-btns');
      btn(mb, 'Shuffle motion now', () => fadeReseed(true));
      mo.append(mb);
      all.append(mo);

      section(all, 'Blobs');
      toggleRow(all, 'Moving color blobs', 'Turning these off saves the most GPU', get('blobs'), set('blobs'));
      if (lava.blobs) {
        sliderRow(all, 'Smoothness', 'Repaints per cycle; lower = cheaper, choppier', { min: 5, max: 240, step: 1, hardMin: 1 },
          get('blobSteps'), set('blobSteps'), P.blobSteps);
      }

      const pb = el('div', 'ytt-btns');
      btn(pb, 'Reset ' + PROFILE_NAMES[lavaStore.profile] + ' profile', () => { lavaResetProfile(); render(); });
      all.append(pb);

      section(all, 'Performance (all profiles)');
      const S = SHARED_DEFAULTS;
      toggleRow(all, 'Use the playing video', IS_MUSIC ? 'Off = album art only' : 'On YouTube the lava needs this on', get('video'), set('video'));
      if (lava.video) {
        sliderRow(all, 'Frame rate', 'Lower = cheaper; it is blurred anyway', { min: 1, max: 60, step: 1, unit: 'fps', hardMin: 1, hardMax: 60 },
          get('videoFps'), set('videoFps'), S.videoFps);
        sliderRow(all, 'Frame copy width', 'Small is fine behind the blur', { min: 32, max: 512, step: 16, unit: 'px', hardMin: 8, hardMax: 1024 },
          get('videoWidth'), set('videoWidth'), S.videoWidth);
        toggleRow(all, 'Crop black bars', 'Ignores bars baked into the video', get('videoCropBars'), set('videoCropBars'));
      }
      sliderRow(all, 'Album art resolution', 'YouTube Music background; it is blurred anyway', { min: 64, max: 1024, step: 32, unit: 'px', hardMin: 32 },
        get('artSize'), set('artSize'), S.artSize);
      const rb = el('div', 'ytt-btns');
      btn(rb, 'Reset performance settings', () => { lavaResetShared(); render(); });
      all.append(rb);
      body.append(all);

      body.append(el('div', 'ytt-note',
        'Lava settings are shared by YouTube and YouTube Music, and open tabs update live. Hold a slider to see through this panel.'));
    }

    // ---------------- General tab ----------------
    function buildGeneral(body) {
      const set = k => v => {
        gen[k] = v;
        saveGen();
        if (/^(title|seek)/.test(k)) TITLE.refresh();
        render();
      };
      const get = k => () => gen[k];

      const master = el('div', 'ytt-master');
      toggleRow(master, 'Molten Tools', ENABLED
        ? 'Everything is on. Turn off to stop every feature at once.'
        : 'Everything is off. Your settings are kept.',
        () => ENABLED, v => { setEnabled(v); render(); });
      body.append(master);
      if (!ENABLED) {
        body.append(el('div', 'ytt-note', 'Only this button stays while Molten Tools is off. ' +
          'Other open YouTube and YouTube Music tabs switch with it. Your settings are kept.'));
        return;
      }

      section(body, 'Playback');
      COUNTS.line(toggleRow(body, 'Auto-dismiss "Still watching?"',
        'Answers "Continue watching?" and "Video paused" prompts so playback never stops', get('autoDismiss'), set('autoDismiss')), 'dismissed');

      const swatch = (parent, get) => {
        const row = el('div', 'ytt-row');
        const chip = el('span', 'ytt-swatch');
        const lb = labelBlock('Current color', ' ');
        const show = () => { const c = get(); chip.style.background = c || 'transparent'; lb.lastChild.textContent = c || 'Nothing playing yet (site default)'; };
        show();
        // follow the color live while the panel is open
        const on = () => { if (!row.isConnected) return document.removeEventListener('ytt-colors', on); show(); };
        document.addEventListener('ytt-colors', on);
        row.append(lb, chip);
        parent.append(row);
      };
      const from = IS_MUSIC ? 'the current album art' : 'the current video\'s thumbnail';

      section(body, 'Title bar');
      toggleRow(body, 'Match the title bar to the art', 'Takes the color from ' + from, get('titleColor'), set('titleColor'));
      const t = el('div', gen.titleColor ? '' : 'ytt-off');
      selectRow(t, 'Tone', 'Dark is easiest to read', [['dark', 'Dark'], ['vivid', 'Vivid'], ['muted', 'Muted']], get('titleTone'), set('titleTone'));
      swatch(t, TITLE.color);
      body.append(t);

      section(body, 'Seek bar');
      toggleRow(body, 'Match the seek bar to the art', 'Uses the same art color as the title bar', get('seekColor'), set('seekColor'));
      const k = el('div', gen.seekColor ? '' : 'ytt-off');
      selectRow(k, 'Tone', 'Bright is easiest to see', [['bright', 'Bright'], ['title', 'Match title bar']], get('seekTone'), set('seekTone'));
      swatch(k, TITLE.seek);
      body.append(k);

      body.append(el('div', 'ytt-note',
        'The title bar color shows when YouTube or YouTube Music is installed as an app. If you use another PWA color script, turn it off. These settings are shared by both sites.'));

      section(body, 'Appearance');
      toggleRow(body, 'Match my device', 'Light or dark follows your device until you flip the switch up top',
        () => LOOK.get() === 'auto', v => { gmSet('appearance', v ? 'auto' : (LOOK.dark() ? 'dark' : 'light')); LOOK.apply(); render(); }).querySelector('input').setAttribute('data-gw-match', '');

      section(body, 'Troubleshooting');
      toggleRow(body, 'Log to the console', 'Lines start with [LavaLamp] / [yt-hd] / [molten] (F12)', () => lava.debug, v => { lavaSet('debug', v); render(); });
    }

    function render() {
      if (!panelEl) return;
      const keepScroll = bodyEl.scrollTop;
      bodyEl.textContent = '';
      for (const b of panelEl.querySelectorAll('.ytt-tab')) b.classList.toggle('on', b.dataset.tab === tab);
      const chip = panelEl.querySelector('.ytt-chip');
      if (chip) { chip.textContent = ENABLED ? 'On' : 'Off'; chip.classList.toggle('off', !ENABLED); }
      if (!ENABLED && tab !== 'general') {
        bodyEl.append(el('div', 'ytt-info', 'Molten Tools is off. Turn it back on in the General tab.'));
        const b = el('div', 'ytt-btns');
        btn(b, 'Go to General', () => { tab = 'general'; lsSet(TAB_KEY, tab); render(); }, true);
        bodyEl.append(b);
      } else if (tab === 'general') buildGeneral(bodyEl);
      else if (tab === 'account') buildAccount(bodyEl);
      else if (tab === 'hd') buildHD(bodyEl);
      else buildLava(bodyEl);
      bodyEl.scrollTop = keepScroll;
    }
    // re-draw after another tab changed shared settings (not while you're typing in this one)
    function refresh() {
      if (!panelEl) return;
      const a = document.activeElement;
      if (a && panelEl.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.type !== 'checkbox') return;
      render();
    }

    function open() {
      if (panelEl) return;
      panelEl = el('div');
      panelEl.id = 'ytt-panel';

      const head = el('div', 'ytt-head');
      const t = el('div');
      t.append(el('div', 'ytt-title', 'Molten Tools'), el('div', 'ytt-tagline', 'YouTube QOL tools'));
      const x = el('button', 'ytt-x'); x.append(gwCloseIcon());
      x.type = 'button';
      x.title = 'Close';
      x.addEventListener('click', close);
      const brand = el('div', 'ytt-brand');
      brand.append(iconTile(), t);
      head.append(brand, LOOK.toggle(), x);
      const ctx = el('div', 'ytt-ctx');
      ctx.append(el('span', 'ytt-host', location.hostname.replace(/^www\./, '')), el('span', 'ytt-chip'));

      const tabs = el('div', 'ytt-tabs');
      for (const [id, name] of [['general', 'General'], ['account', 'Account'], ['hd', 'Quality'], ['lava', 'Lava']]) {
        const b = el('button', 'ytt-tab', name);
        b.type = 'button';
        b.dataset.tab = id;
        b.addEventListener('click', () => {
          tab = id;
          lsSet(TAB_KEY, id);
          bodyEl.scrollTop = 0;
          render();
        });
        tabs.append(b);
      }

      bodyEl = el('div', 'ytt-body');
      const foot = el('div', 'ytt-foot', 'Open from the lava button or the Tampermonkey menu \u00b7 v' + VERSION + ' \u00b7 every tab updates live');
      panelEl.append(head, ctx, tabs, bodyEl, foot);

      // keep YouTube's keyboard shortcuts (k, f, m, /...) from firing while you type in the panel
      for (const type of ['keydown', 'keypress', 'keyup']) {
        panelEl.addEventListener(type, e => {
          if (type === 'keydown' && e.key === 'Escape') close();
          e.stopPropagation();
        });
      }
      // clicks inside the panel shouldn't reach YouTube (it closes menus / toggles playback on some)
      panelEl.addEventListener('click', e => e.stopPropagation());

      document.body.append(panelEl);
      LOOK.apply();
      render();
      syncButton();
    }

    function close() {
      if (!panelEl) return;
      panelEl.remove();
      panelEl = null;
      bodyEl = null;
      syncButton();
    }

    function toggle() { if (panelEl) close(); else open(); }

    // end "see-through while dragging"
    document.addEventListener('pointerup', () => panelEl && panelEl.classList.remove('ytt-peek'), true);
    document.addEventListener('pointercancel', () => panelEl && panelEl.classList.remove('ytt-peek'), true);

    return { open, close, toggle, refresh };
  })();

  if (typeof GM_registerMenuCommand === 'function') {
    try {
      GM_registerMenuCommand('Open Molten Tools', () => UI.open());
      GM_registerMenuCommand('Turn lava on/off', () => setLavaOn(!lavaOn));
      GM_registerMenuCommand('Turn Molten Tools on/off', () => setEnabled(!ENABLED));
      GM_registerMenuCommand('Turn screenshot safe on/off', () => { PRIV.set('on', !PRIV.get('on')); UI.refresh(); });
    } catch (e) { /* ignore */ }
  }

  // =====================================================================
  //  Start
  // =====================================================================
  HDM.init();
  lavaInit();
  generalInit();
})();