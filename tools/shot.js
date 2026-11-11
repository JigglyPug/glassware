// Render a userscript's own menu in a stubbed page and screenshot it.
// usage: node shot.js <script.user.js> <url> <out.png> [--mobile] [--cmd "Open ..."] [--theme dark|light] [--wait ms] [--eval js] [--full]
// --exercise / --state: settings carry-over test (tools/carry.py runs it): --exercise changes every
// setting in the panel and prints the saved data; --state prints what every control shows.
// --seedls <file>: start with this page localStorage (JSON). 
// --audit: take no pictures; check the open panel (each tab, each fold-out picker) for text that
// spills out of its box, things clipped or pushed off screen, and overlapping controls. tools/audit.py runs it.
const { chromium, devices } = require('playwright');
const fs = require('fs');
// design tokens (tools/tokens.json): the audit measures against these, never its own copies
const TK = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'tokens.json'), 'utf8'));
const TC = TK.controls, TG = TK.glass, SH = TK.shape;

const args = process.argv.slice(2);
const [scriptPath, url, out] = args;
const opt = (k, d) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : d; };
const has = k => args.includes(k);
const mobile = has('--mobile');
const theme = opt('--theme', 'dark');
const cmdName = opt('--cmd', 'Open');
const waitMs = +opt('--wait', '1800');
const evalJs = opt('--eval', '');
const seedFile = opt('--seed', '');
const seed = seedFile ? fs.readFileSync(seedFile, 'utf8') : '';
const tabs = opt('--tabs', '');   // comma list of tab labels -> one shot each
const clock = opt('--clock', '');
const crop = has('--crop');

const src = fs.readFileSync(scriptPath, 'utf8');
const host = new URL(url).hostname;

// --net ok|hang|status|malformed|abort: how AniList, the page's manifest and icons, and Tampermonkey's requests answer
// (tools/nettest.py): normally, never, with a server error, with a broken body, or by dropping the connection
const NET = opt('--net', '');
const MANIFEST = JSON.stringify({ name: 'Test app', theme_color: '#e05a8a', icons: [{ src: 'https://icons.example.net/app.png', sizes: '192x192', type: 'image/png' }] });
function stubPage() {
  const dark = theme === 'dark';
  const bg = dark ? '#0f0f0f' : '#f4f5f7', fg = dark ? '#eee' : '#222';
  const cards = Array.from({ length: 12 }, (_, i) => {
    const h = (i * 47 + 200) % 360;
    return `<div class="card"><div class="thumb" style="background:linear-gradient(135deg,hsl(${h} 70% 55%),hsl(${(h + 60) % 360} 70% 35%))"></div>
      <div class="t1"></div><div class="t2"></div></div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="${opt('--themecolor', '#3b6fd6')}"><title>${host}</title>${NET ? '<link rel="manifest" href="/app.webmanifest"><link rel="icon" href="https://icons.example.net/app.png">' : ''}
  <style>body{margin:0;background:${bg};color:${fg};font:14px system-ui,sans-serif}
  header{height:56px;display:flex;align-items:center;gap:16px;padding:0 20px;position:sticky;top:0;background:${bg};z-index:5}
  .logo{width:110px;height:22px;border-radius:6px;background:${dark ? '#333' : '#ccd'}}
  .search{flex:1;max-width:520px;height:36px;border-radius:18px;background:${dark ? '#222' : '#e3e5ea'};margin:0 auto}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(${mobile ? 300 : 280}px,1fr));gap:18px;padding:20px}
  .thumb{aspect-ratio:16/9;border-radius:12px}.t1,.t2{height:12px;border-radius:6px;background:${dark ? '#2a2a2a' : '#dde'};margin-top:10px}.t2{width:60%}
  video{display:block;width:${mobile ? '100%' : '640px'};aspect-ratio:16/9;background:linear-gradient(135deg,#ff6a3d,#7a2cff);margin:20px;border-radius:12px}
  </style>${has('--hostile') ? `<style>
  /* Global rules big sites ship (Reddit, YouTube, AniList). Panels that live in the page, not a
     shadow root, inherit them, so the audit checks the panels with these on too. */
  html{font-size:62.5%}body{line-height:1}*,*::before,*::after{box-sizing:border-box}
  button{white-space:nowrap;line-height:1;font:inherit;text-transform:none;letter-spacing:normal;min-width:0}
  p,h1,h2,h3,h4,ul{margin:0;padding:0}a{color:inherit;text-decoration:none}svg{fill:currentColor}img,video{max-width:100%;height:auto}
  input,select,textarea{line-height:1;font:inherit}label{white-space:nowrap}
  /* Reddit: buttons get a fixed height with their content pushed to the bottom */
  button{display:inline-flex;align-items:flex-end;height:40px}
  /* ...and text colors from the site's own theme, which can be the opposite of the panel's
     (Reddit in dark mode on a phone set to light colors every <label> near-white) */
  label,p,h1,h2,h3,h4,li,small,strong{color:${dark ? '#1a1a1b' : '#d7dadc'}}
  </style>` : ''}</head><body><header><div class="logo"></div><div class="search"></div><div id="end" style="display:flex;gap:10px"></div></header>
  ${has('--video') ? '<video muted playsinline src="https://' + host + '/clip.mp4"></video>' : ''}
  <main class="grid">${cards}</main></body></html>`;
}

(async () => {
  // the same two fonts on every machine (tools/fonts.conf), so screenshots match on GitHub's too;
  // a caller that sets its own FONTCONFIG_FILE (tools/audit.py's phone sizes, in Roboto) keeps it
  const env = { ...process.env, FONTCONFIG_FILE: process.env.FONTCONFIG_FILE || require('path').join(__dirname, 'fonts.conf') };
  const browser = await chromium.launch({ env, ...(has('--forcedark') ? { args: ['--blink-settings=forceDarkModeEnabled=true', '--enable-features=WebContentsForceDark'] } : {}) });   // --forcedark: a browser that darkens light pages itself
  const ctxOpts = mobile ? { ...devices['Pixel 7'], ...(opt('--vh', '') ? { viewport: { width: +opt('--vw', '412'), height: +opt('--vh', '839') } } : {}) } : { viewport: { width: +opt('--vw', '1280'), height: +opt('--vh', '820') }, deviceScaleFactor: 2 };
  ctxOpts.colorScheme = theme;
  ctxOpts.timezoneId = 'America/Detroit';
  const ctx = await browser.newContext(ctxOpts);
  if (clock) await ctx.clock.setFixedTime(new Date(clock));
  await ctx.route('**/*', route => {
    const u = route.request().url();
    // --requests: print every request the page (and its frames) makes, so a test can see what got out
    if (has('--requests')) console.log('REQ ' + route.request().method() + ' ' + u + (route.request().postData() ? ' BODY ' + route.request().postData().slice(0, 200) : ''));
    // --net redirect|redirect-public: the page can't fetch the manifest or icons itself, and Tampermonkey's
    // answers come back after a redirect to a private address (or, for comparison, a public one)
    if (/^redirect/.test(NET) && (u.endsWith('/app.webmanifest') || u.startsWith('https://icons.example.net/'))) return route.fulfill({ status: 404, body: '' });
    if (NET && (u.startsWith('https://graphql.anilist.co') || u.endsWith('/app.webmanifest') || u.startsWith('https://icons.example.net/'))) {
      if (NET === 'hang') return;                                                  // never answers
      if (NET === 'abort') return route.abort('connectionreset');
      if (NET === 'status') return route.fulfill({ status: 503, contentType: 'text/html', body: '<h1>Service Unavailable</h1>' });
      if (NET === 'malformed') return route.fulfill({ status: 200, contentType: u.endsWith('.png') ? 'image/png' : 'application/json', body: '{"oops": <html>' });
      if (u.endsWith('/app.webmanifest')) return route.fulfill({ status: 200, contentType: 'application/manifest+json', body: MANIFEST });
      if (u.startsWith('https://icons.example.net/')) return route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(__dirname + '/../assets/icons/prism.png') });
    }
    if (u.startsWith('https://graphql.anilist.co')) return route.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(__dirname + '/seeds/anilist.json', 'utf8') });
    if (route.request().resourceType() === 'document' && u.startsWith(url.split('#')[0].replace(/\/$/, '')))
      return route.fulfill({ status: 200, contentType: 'text/html', body: stubPage() });
    return route.fulfill({ status: 404, body: '' });
  });
  const shim = `
    (() => {
      const store = Object.assign({}, ${seed || '{}'});
      window.__gm = store; window.__reads = new Set();
      try { const lsSeed = ${opt('--seedls', '') ? fs.readFileSync(opt('--seedls', ''), 'utf8') : '{}'}; for (const k in lsSeed) localStorage.setItem(k, lsSeed[k]); } catch (e) {}
      const _gi = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { if (this === window.localStorage) window.__reads.add('ls:' + k); return _gi.call(this, k); };
      const ls = [];
      window.__cmds = [];
      const W = window;
      W.GM_getValue = (k, d) => { W.__reads.add('gm:' + k); return k in store ? store[k] : d; };
      // other tabs of the same page hear every change, as Tampermonkey's value listeners do (remote = true)
      const bc = (() => { try { return new BroadcastChannel('glassware-gm'); } catch (e) { return null; } })();
      W.GM_setValue = (k, v) => { const o = store[k]; store[k] = v; ls.forEach(l => l.k === k && l.f(k, o, v, false)); try { bc && bc.postMessage({ k, v: v === undefined ? null : JSON.parse(JSON.stringify(v)) }); } catch (e) {} };
      if (bc) bc.onmessage = e => { const { k, v } = e.data || {}; const o = store[k]; store[k] = v; ls.forEach(l => l.k === k && l.f(k, o, v, true)); };
      W.GM_deleteValue = k => { delete store[k]; };
      W.GM_listValues = () => Object.keys(store);
      W.GM_addValueChangeListener = (k, f) => { ls.push({ k, f }); return ls.length; };
      W.GM_removeValueChangeListener = () => {};
      W.GM_registerMenuCommand = (n, f) => { W.__cmds.push({ n, f }); return W.__cmds.length; };
      W.GM_unregisterMenuCommand = () => {};
      W.GM_addStyle = css => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).append(s); return s; };
      const NET = ${JSON.stringify(NET)};
      W.__errs = []; addEventListener('error', e => W.__errs.push(String(e.message))); addEventListener('unhandledrejection', e => W.__errs.push('unhandled: ' + String(e.reason && e.reason.message || e.reason)));
      W.GM_xmlhttpRequest = o => {
        const later = (fn, arg) => setTimeout(() => o[fn] && o[fn](arg), 30);
        if (!NET || NET === 'abort') later('onerror', { status: 0 });
        else if (NET === 'hang') later('ontimeout', {});                          // Tampermonkey gives up at o.timeout
        else if (NET === 'status') later('onload', { status: 503, responseText: '<h1>Service Unavailable</h1>', response: null });
        else if (NET === 'malformed') later('onload', { status: 200, responseText: '{"oops": <html>', response: new Blob(['not an image'], { type: 'image/png' }) });
        else {
        // where the answer finally came from, as Tampermonkey reports it (after any redirect)
        const rest = (() => { try { const x = new URL(o.url, location.href); return x.pathname + x.search; } catch (e) { return '/'; } })();
        const finalUrl = NET === 'redirect' ? 'http://192.168.1.1' + rest : NET === 'redirect-public' ? 'https://cdn.example.net' + rest : o.url;
        if (/\.webmanifest$/.test(o.url)) later('onload', { status: 200, finalUrl, responseText: ${JSON.stringify(MANIFEST)}, response: ${JSON.stringify(MANIFEST)} });
        else { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#e05a8a'; g.fillRect(0, 0, 32, 32); c.toBlob(b => o.onload && o.onload({ status: 200, finalUrl, response: b }), 'image/png'); }
        }
        return { abort() {} };
      };
      W.GM_setClipboard = () => {};
      // --opentab fail|throw|watch: the browser blocks the new tab (GM_openInTab and window.open give nothing back, or
      // throw), or it opens and the test can close it: window.__tabs holds each tab, __closeTab(i) closes one (tools/handofftest.py)
      const OPENTAB = ${JSON.stringify(opt('--opentab', ''))};
      W.__tabs = [];
      W.GM_openInTab = u => {
        (W.__opened = W.__opened || []).push(String(u));
        if (OPENTAB === 'throw') throw new Error('blocked');
        if (OPENTAB === 'fail') return null;
        const t = { url: String(u), closed: false, onclose: null, close() { if (!t.closed) { t.closed = true; t.onclose && t.onclose(); } } };
        W.__tabs.push(t); return t;
      };
      W.__closeTab = i => W.__tabs[i] && W.__tabs[i].close();
      if (OPENTAB === 'fail' || OPENTAB === 'throw') W.open = u => { (W.__opened = W.__opened || []).push(String(u)); if (OPENTAB === 'throw') throw new Error('blocked'); return null; };
      W.GM_info = { script: { name: 'x', version: ${JSON.stringify((src.match(/@version\s+(\S+)/) || [])[1] || '0')} }, scriptHandler: 'Tampermonkey', version: '5.3' };
      W.GM = { getValue: async (k, d) => W.GM_getValue(k, d), setValue: async (k, v) => W.GM_setValue(k, v) };
      W.unsafeWindow = W;
      const _as = Element.prototype.attachShadow; Element.prototype.attachShadow = function (o) { return _as.call(this, Object.assign({}, o, { mode: 'open' })); };
    })();`;
  // --perf: count the repeating timers and page watchers a script leaves running (tools/perf.py)
  if (has('--perf')) await ctx.addInitScript(`(() => {
    const W = window, si = W.setInterval, ci = W.clearInterval, live = new Set();
    W.setInterval = function (...a) { const id = si.apply(this, a); live.add(id); return id; };
    W.clearInterval = function (id) { live.delete(id); return ci.call(this, id); };
    W.__perfIntervals = () => live.size;
    const MO = W.MutationObserver, watching = new Map();
    W.MutationObserver = class extends MO {
      observe(t, o) { (watching.get(this) || watching.set(this, []).get(this)).push(new WeakRef(t)); return super.observe(t, o); }
      disconnect() { watching.delete(this); return super.disconnect(); }
    };
    // a watcher counts while something it watches is still on the page
    W.__perfObservers = () => [...watching.values()].filter(ts => ts.some(r => { const t = r.deref(); return t && t.isConnected; })).length;
  })();`);
  // --noscript: the same page without the script, for a baseline
  // --init <file>: page script that runs before the userscript (a made-up page state, tools/logtest.py)
  if (opt('--init', '')) await ctx.addInitScript(fs.readFileSync(opt('--init', ''), 'utf8'));
  await ctx.addInitScript(shim + '\n;(function(){try{\n' + (has('--noscript') ? '' : src) + '\n}catch(e){console.error("SCRIPT ERR",e)}})();');
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
  // --console: every console line, in full (tools/logtest.py)
  if (has('--console')) page.on('console', m => console.log('CONSOLE ' + m.type() + ' ' + JSON.stringify(m.text())));
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  // --commit: don't wait for the page's load event (a Kaleidoscope board stops the page and replaces it)
  await page.goto(url, { waitUntil: has('--commit') ? 'commit' : 'load' });
  await page.waitForTimeout(1200);
  if (has('--perf')) {
    // A long session on a busy feed: every round adds 200 items of the kind the site uses, changes
    // some text, drops the oldest past 400, and moves to a new page the way the site's app does.
    // Prints the script time and what's left running, sampled after garbage collection.
    const rounds = +opt('--rounds', '40'), tags = JSON.parse(opt('--tags', '["div"]'));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const sample = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
      // elements on the page, shadow roots included (Chrome's own node count also holds removed
      // elements it hasn't freed yet, so it jumps around)
      const extra = await page.evaluate(() => { let n = 0; const walk = r => { for (const e of r.querySelectorAll('*')) { n++; if (e.shadowRoot) walk(e.shadowRoot); } }; walk(document);
        return { dom: n, work: (window.__perfWork || 0) / 1000, iv: window.__perfIntervals ? __perfIntervals() : 0, obs: window.__perfObservers ? __perfObservers() : 0 }; });
      return { heap: m.JSHeapUsedSize, listeners: m.JSEventListeners, script: m.ScriptDuration, layout: m.LayoutDuration + m.RecalcStyleDuration, ...extra };
    };
    // --cpuprofile <file>: where the script's time went, by function
    // (the quiet stretches only: during the rounds most of the time is the test's own page changes)
    const prof = opt('--cpuprofile', '');
    const out = [await sample()];
    for (let r = 0; r < rounds; r++) {
      await page.evaluate(([r, tags]) => {
        const t0 = performance.now();
        const main = document.querySelector('main') || document.body;
        for (let i = 0; i < 200; i++) {
          const el = document.createElement(tags[i % tags.length]);
          el.className = 'item';
          el.innerHTML = '<a id="video-title" href="/watch?v=' + r + '_' + i + '">Item ' + r + '.' + i + '</a><img alt="" src="data:,"><span class="meta">' + i + ' views</span>' + (i % 25 ? '' : '<video muted></video>');   // feeds share a few players
          main.append(el);
        }
        main.querySelectorAll('.meta').forEach((m, i) => { if (i % 3 === 0) m.textContent = (i + r) + ' views'; });
        const items = main.querySelectorAll('.item');
        for (let i = 0; i < items.length - 400; i++) items[i].remove();
        history.pushState({}, '', '/feed/' + r);
        window.dispatchEvent(new PopStateEvent('popstate'));
        for (const ev of ['yt-navigate-start', 'yt-navigate-finish', 'yt-page-data-updated']) document.dispatchEvent(new Event(ev));
        void document.body.offsetHeight;   // the style and layout the change needs, as the page feels it
        window.__perfWork = (window.__perfWork || 0) + performance.now() - t0;
      }, [r, tags]);
      await page.waitForTimeout(150);
      if (r % 5 === 4) out.push(await sample());
    }
    // then a quiet stretch with nothing changing: what the script's timers cost on their own
    const quiet = +opt('--quiet', '10');
    if (prof) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
    await page.waitForTimeout(quiet * 1000);
    out.push({ ...(await sample()), quiet });
    // and the same stretch with the tab in the background: a hidden tab should cost next to nothing
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(quiet * 1000);
    out.push({ ...(await sample()), quiet, hidden: true });
    if (prof) require('fs').writeFileSync(prof, JSON.stringify((await cdp.send('Profiler.stop')).profile));
    console.log('PERF ' + JSON.stringify(out));
    await browser.close();
    return;
  }
  const cmds = await page.evaluate(() => window.__cmds.map(c => c.n));
  console.log('menu commands:', cmds);
  if (cmdName !== 'none') {
    await page.evaluate(n => { const c = window.__cmds.find(c => c.n.startsWith(n)); if (c) c.f(); else console.error('no cmd ' + n); }, cmdName);
  }
  await page.waitForTimeout(waitMs);
  const helpers = `
    window.__all = (root = document) => { const out = []; const walk = r => { r.querySelectorAll('*').forEach(e => { out.push(e); if (e.shadowRoot) walk(e.shadowRoot); }); }; walk(root); return out; };
    window.__panelRect = () => { const vw = innerWidth, vh = innerHeight; let best = null, ba = 0;
      for (const e of __all()) { const cs = getComputedStyle(e); if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = e.getBoundingClientRect(); const a = r.width * r.height; if (a < 40000 || a > vw * vh * (window.__maxFrac || 0.92)) continue; if (window.__sheet && r.top < 8) continue; if (a > ba) { ba = a; best = r; } }
      return best && { x: best.x, y: best.y, w: best.width, h: best.height }; };
    window.__clickTab = t => { const c = __all().filter(e => e.children.length <= 2 && (e.textContent || '').trim() === t && e.getBoundingClientRect().width > 0 && (e.matches('button,[role=tab],a,[data-tab],li,div,span'))); 
      const el = c.find(e => e.matches('button,[role=tab]')) || c[0]; if (el) { el.click(); return true; } return false; };
    window.__hideErr = () => { for (const e of __all()) if (/unreadable response|Couldn.t reach|returned an/i.test(e.textContent || '') && e.children.length === 0) e.style.visibility = 'hidden'; };`;
  await page.evaluate(helpers);

  const auditJs = `
    window.__audit = (where) => {
      const vw = innerWidth, vh = innerHeight, out = [], seen = new Set();
      const vis = e => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const name = e => { const t = (e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40); return e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : '') + (t ? ' "' + t + '"' : ''); };
      const add = (kind, e, extra) => { const k = kind + name(e); if (seen.has(k)) return; seen.add(k); out.push(where + ' | ' + kind + ' | ' + name(e) + (extra ? ' | ' + extra : '')); };
      const fixedAnc = e => { for (let x = e; x; x = x.parentElement || (x.getRootNode() && x.getRootNode().host)) { if (x.nodeType === 1 && getComputedStyle(x).position === 'fixed') return x; } return null; };
      const parentOf = x => x.parentElement || (x.getRootNode && x.getRootNode().host) || null;
      const els = __all().filter(e => e.nodeType === 1 && !/^(STYLE|SCRIPT|svg|path|defs|g|circle|rect|line|polyline|polygon|ellipse|stop|linearGradient|radialGradient|filter|feGaussianBlur|feMerge|feMergeNode|feColorMatrix|use|clipPath|mask)$/i.test(e.tagName) && !(e instanceof SVGElement) && fixedAnc(e) && vis(e));
      // The glass recipe (tools/tokens.json): every frosted surface has the token blur and saturation,
      // light and dark glass at their token opacities. Only big surfaces count (panel, menus, cards, toasts), not chips.
      // rgb()/rgba(), and color(srgb r g b / a) (what color-mix() computes to: channels 0-1)
      const rgba = c => { c = c || ''; const m = c.match(/[\\d.]+/g) || [0, 0, 0, 0];
        if (/^color\\(srgb/.test(c)) return [m[0] * 255, m[1] * 255, m[2] * 255, m[3] === undefined ? 1 : +m[3]];
        return [+m[0], +m[1], +m[2], m[3] === undefined ? 1 : +m[3]]; };
      const glassA = window.__theme === "light" ? ${TG.opacity.light} : ${TG.opacity.dark};
      for (const e of els) { const cs = getComputedStyle(e), f = cs.backdropFilter || cs.webkitBackdropFilter || '';
        if (!/saturate/.test(f)) continue; const r = e.getBoundingClientRect(); if (r.width * r.height < 12000) continue;
        if (r.width >= vw && r.height >= vh) continue;   // a full-screen veil isn't glass (CLAUDE.md)
        if (f.replace(/\\s+/g, ' ') !== 'blur(${TG.blur}px) saturate(${TG.saturate / 100})') add('glass off recipe', e, 'backdrop-filter ' + f + ', should be blur(${TG.blur}px) saturate(${TG.saturate}%)');
        const a = rgba(cs.backgroundColor)[3]; if (Math.abs(a - glassA) > 0.005) add('glass off recipe', e, 'glass at ' + Math.round(a * 100) + '%, should be ' + Math.round(glassA * 100) + '% in ' + (window.__theme || 'dark')); }
      // Things too faint to see on their own background, in this theme. Dimmed rows (an off feature,
      // a disabled control) are faint on purpose and skipped, and so is anything over a gradient or
      // image (its background can't be read back). Text (SVG text too) needs 3:1; small marks (dots,
      // ticks, swatches, ::before/::after markers) and dashed or dotted lines need 1.8:1. Wide
      // tracks and dividers are meant to be subtle and aren't checked.
      const page = window.__theme === 'light' ? [244, 245, 247] : [15, 15, 15];
      const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3]));
      const ratioOf = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
      // the solid color behind x (x's own background included when self), or null when unknowable or dimmed
      const behind = (x, self) => { let layers = [], op = 1;
        for (let y = self ? x : parentOf(x); y && y.nodeType === 1; y = parentOf(y)) { const c = getComputedStyle(y);
          if (+c.opacity < 1 || y.disabled || y.getAttribute('aria-disabled') === 'true') return null;
          // a gradient on a big glass surface is only its corner glow; on anything smaller it's the fill
          if (c.backgroundImage !== 'none' && !(y instanceof SVGElement)) { const q = y.getBoundingClientRect(); if (q.width * q.height < 40000) return null; }
          if (y instanceof SVGElement) continue;
          const b = rgba(c.backgroundColor); if (b[3] > 0) layers.push(b); if (b[3] >= 0.99) break; }
        let bg = page; for (const b of layers.reverse()) bg = over(b, bg); return bg; };
      const T = window.__theme || 'dark';
      for (const e of els) {
        if (![...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim().length > 1)) continue;
        if (+getComputedStyle(e).opacity < 1) continue;
        let dim = false;
        for (let x = e; x && x.nodeType === 1; x = parentOf(x)) { const c = getComputedStyle(x); if (+c.opacity < 1 || x.disabled || x.getAttribute('aria-disabled') === 'true') { dim = true; break; } }
        if (dim) continue;
        const layers = []; let bg = page;
        for (let x = e; x && x.nodeType === 1; x = parentOf(x)) { const b = rgba(getComputedStyle(x).backgroundColor); if (b[3] > 0) layers.push(b); if (b[3] >= 0.99) break; }
        for (const b of layers.reverse()) bg = over(b, bg);
        const ratio = ratioOf(over(rgba(getComputedStyle(e).color), bg), bg);
        if (ratio < ${TK.contrast.text}) add('faint text', e, 'contrast ' + ratio.toFixed(1) + ':1 in ' + T);
      }
      const svgs = __all().filter(e => e instanceof SVGElement && fixedAnc(e) && e.getBoundingClientRect().width > 0);
      for (const e of svgs.filter(e => e.tagName.toLowerCase() === 'text' && e.textContent.trim().length > 1)) {
        const c = getComputedStyle(e), bg = behind(e.ownerSVGElement || e, false); if (!bg) continue;
        const f = rgba(c.fill); f[3] *= +c.fillOpacity * +c.opacity; const ratio = ratioOf(over(f, bg), bg);
        if (ratio < ${TK.contrast.text}) add('faint text', e, 'contrast ' + ratio.toFixed(1) + ':1 in ' + T);
      }
      const mark = (e, color, bg, what) => { if (!bg || color[3] === 0) return; const r = ratioOf(over(color, bg), bg);
        if (r < ${TK.contrast.mark}) add('hard to see', e, what + ' ' + 'rgb(' + color.slice(0, 3).map(Math.round).join(',') + ') at ' + r.toFixed(1) + ':1 in ' + T + ' (in ' + name(parentOf(e)).slice(0, 40) + ')'); };
      for (const e of els) {
        const cs = getComputedStyle(e), r = e.getBoundingClientRect();
        if (+cs.opacity < 1 && +cs.opacity > 0 && r.width <= 14 && r.height <= 14) { const c = rgba(cs.backgroundColor); c[3] *= +cs.opacity; mark(e, c, behind(e, false), 'small mark'); }
        else if (r.width <= 14 && r.height <= 14 && !e.childElementCount && !e.textContent.trim()) mark(e, rgba(cs.backgroundColor), behind(e, false), 'small mark');
        for (const side of ['Top', 'Left'])
          if (/dashed|dotted/.test(cs['border' + side + 'Style']) && parseFloat(cs['border' + side + 'Width']) > 0) mark(e, rgba(cs['border' + side + 'Color']), behind(e, false), cs['border' + side + 'Style'] + ' line');
        // switches: the knob (a round child or ::before/::after) sits centered in the track, inside it
        if (e.getAttribute('role') === 'switch' || (e.tagName === 'INPUT' && e.type === 'checkbox' && cs.appearance === 'none')) {
          const knobs = [...e.children].filter(k => getComputedStyle(k).position === 'absolute' && parseFloat(getComputedStyle(k).borderTopLeftRadius) >= k.getBoundingClientRect().height / 2 - 1)
            .map(k => k.getBoundingClientRect());
          for (const pseudo of ['::before', '::after']) { const pc = getComputedStyle(e, pseudo);
            if (pc.content !== 'none' && pc.position === 'absolute' && parseFloat(pc.height) > 4) { const t = parseFloat(pc.top), hh = parseFloat(pc.height);
              if (isFinite(t)) knobs.push({ top: r.top + t + parseFloat(cs.borderTopWidth || 0), height: hh, left: r.left, right: r.left }); } }
          for (const k of knobs) { const off = Math.abs((k.top + k.height / 2) - (r.top + r.height / 2));
            if (off > 1.5) add('knob off center', e, Math.round(off) + 'px from the middle of a ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' track');
            if (k.height > r.height + 0.5) add('knob off center', e, 'knob taller than its track'); }
        }
        // text centered in its button: vertically always, horizontally when the button centers it
        // (only buttons with a visible box: a filled or outlined button; a bare text row has no middle to miss)
        // (a segment or tab inside a filled bar counts too: the bar is its box)
        const par = parentOf(e), pcs = par && par.nodeType === 1 ? getComputedStyle(par) : null, pr2 = par && par.getBoundingClientRect ? par.getBoundingClientRect() : null;
        const boxedBtn = rgba(cs.backgroundColor)[3] > 0.02 || cs.backgroundImage !== 'none' || ['Top', 'Right', 'Bottom', 'Left'].every(sd => parseFloat(cs['border' + sd + 'Width']) > 0 && cs['border' + sd + 'Style'] !== 'none')
          || (pcs && rgba(pcs.backgroundColor)[3] > 0.02 && pr2 && r.height >= pr2.height - 10);
        if ((e.tagName === 'BUTTON' || e.getAttribute('role') === 'tab' || e.getAttribute('role') === 'radio') && r.height > 0 && r.height < 80 && boxedBtn) {
          const tn = [...e.childNodes].filter(n => n.nodeType === 3 && n.nodeValue.trim());
          if (tn.length) { const rg = document.createRange(); rg.setStartBefore(tn[0]); rg.setEndAfter(tn[tn.length - 1]); const q = rg.getBoundingClientRect();
            const pt = parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth), pb = parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth);
            const boxMid = r.top + r.height / 2, textMid = q.top + q.height / 2, padSkew = 0;   // measured against the whole button: uneven padding (often a site rule) counts too
            if (q.height > 0 && q.height < r.height && Math.abs(textMid - boxMid - padSkew) > 2.5) add('text off center', e, (textMid > boxMid ? 'sits ' : 'rides ') + Math.round(Math.abs(textMid - boxMid)) + 'px ' + (textMid > boxMid ? 'low' : 'high') + ' in a ' + Math.round(r.height) + 'px button');
            const centered = cs.textAlign === 'center' || (/flex/.test(cs.display) && cs.justifyContent === 'center');
            if (centered && e.children.length === 0 && q.width < r.width - 4 && Math.abs((q.left + q.width / 2) - (r.left + r.width / 2)) > 2.5) add('text off center', e, Math.round(Math.abs((q.left + q.width / 2) - (r.left + r.width / 2))) + 'px off the middle sideways');
          }
        }
        // the shared controls are the same size in every script (CLAUDE.md: control sizes)
        const sz = (x, w, h) => Math.abs(x.width - w) <= 0.5 && Math.abs(x.height - h) <= 0.5;
        if (e.getAttribute('aria-label') === 'Dark mode') {
          if (!sz(r, ${TC.mode.w}, ${TC.mode.h})) add('control size', e, 'sun/moon switch is ' + Math.round(r.width) + 'x' + Math.round(r.height) + ', should be ${TC.mode.w}x${TC.mode.h}');
          const k = [...e.querySelectorAll('*')].find(k => getComputedStyle(k).position === 'absolute');
          if (k && !sz(k.getBoundingClientRect(), ${TC.mode.knob}, ${TC.mode.knob})) add('control size', e, 'sun/moon knob should be ${TC.mode.knob}x${TC.mode.knob}');
          // the header around it: icon tile, name and tagline sizes (tools/tokens.json)
          const head = e.parentElement;
          if (head) {
            const tile = [...head.querySelectorAll('*')].find(x => { const q = x.getBoundingClientRect(); return q.width >= 24 && q.width <= 48 && Math.abs(q.width - q.height) < 1 && q.right < r.left - 60; });
            if (tile && !sz(tile.getBoundingClientRect(), ${TC.tile.size}, ${TC.tile.size})) add('control size', tile, 'icon tile is ' + Math.round(tile.getBoundingClientRect().width) + 'px, should be ${TC.tile.size}px');
            const words = [...head.querySelectorAll('*')].filter(x => [...x.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim().length > 2) && x.getBoundingClientRect().right < r.left);
            const name = words.find(x => +getComputedStyle(x).fontWeight >= 600), tag = words.find(x => +getComputedStyle(x).fontWeight < 600 && x !== name);
            // (a wordmark at 800 weight, Kaleidoscope's, is the script's own skin)
            if (name && +getComputedStyle(name).fontWeight < 800 && parseFloat(getComputedStyle(name).fontSize) !== ${TC.name}) add('control size', name, 'name is ' + getComputedStyle(name).fontSize + ', should be ${TC.name}px');
            if (tag && parseFloat(getComputedStyle(tag).fontSize) !== ${TC.tagline}) add('control size', tag, 'tagline is ' + getComputedStyle(tag).fontSize + ', should be ${TC.tagline}px');
          }
          const nx = e.nextElementSibling;
          if (nx && nx.tagName === 'BUTTON') { const q = nx.getBoundingClientRect(); const gap = Math.round(q.left - r.right);
            if (!(sz(q, ${TC.close.desktop}, ${TC.close.desktop}) || sz(q, ${TC.close.phone}, ${TC.close.phone}))) add('control size', nx, 'close button is ' + Math.round(q.width) + 'x' + Math.round(q.height) + ', should be ${TC.close.desktop}x${TC.close.desktop} (${TC.close.phone}x${TC.close.phone} on phones)');
            if (Math.abs(gap - ${TC.close.gap}) > 0.5) add('control size', nx, gap + 'px after the sun/moon switch, should be ${TC.close.gap}px'); }
        } else if (e.getAttribute('role') === 'switch' || (e.tagName === 'INPUT' && e.type === 'checkbox' && cs.appearance === 'none')) {
          if (!(sz(r, ${TC.toggle.desktop.w}, ${TC.toggle.desktop.h}) || sz(r, ${TC.toggle.phone.w}, ${TC.toggle.phone.h}))) add('control size', e, 'toggle is ' + Math.round(r.width) + 'x' + Math.round(r.height) + ', should be ${TC.toggle.desktop.w}x${TC.toggle.desktop.h} (${TC.toggle.phone.w}x${TC.toggle.phone.h} on phones)');
        }
        // outlines (selected and focus rings) sit on what's behind the element
        if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) mark(e, rgba(cs.outlineColor), behind(e, false), 'outline');
        for (const pseudo of ['::before', '::after']) { const pc = getComputedStyle(e, pseudo);
          if (pc.content === 'none' || pc.display === 'none') continue;
          const w = parseFloat(pc.width), h = parseFloat(pc.height); if (!(w > 0 && h > 0 && w <= 14 && h <= 14)) continue;
          const c = rgba(pc.backgroundColor); c[3] *= +pc.opacity; mark(e, c, behind(e, true), pseudo + ' mark'); }
      }
      for (const e of els) {
        const cs = getComputedStyle(e), r = e.getBoundingClientRect();
        if (cs.position === 'fixed' && cs.pointerEvents !== 'none' && !(r.width >= vw && r.height >= vh) && r.width * r.height > 400 && (r.top < -1 || r.left < -1 || r.right > vw + 1 || r.bottom > vh + 1) && !/translate/.test(cs.transform + '') ) add('off screen', e, 'box ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',') + ' in ' + vw + 'x' + vh);
        // text that spills out of its own box
        const texts = [...e.childNodes].filter(n => n.nodeType === 3 && n.nodeValue.trim());
        // (only where it shows: past a box with its own fill or border, or past the parent's edge)
        const boxed = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none' || parseFloat(cs.borderLeftWidth) > 0;
        const pr = (parentOf(e) || e).getBoundingClientRect();
        if (texts.length && cs.overflow === 'visible') { const rg = document.createRange(); for (const n of texts) { rg.selectNodeContents(n); for (const q of rg.getClientRects()) {
          const past = boxed ? Math.max(q.right - r.right, r.left - q.left) : Math.max(q.right - pr.right, pr.left - q.left);
          if (past > 1.5) { add('text spills out', e, Math.round(past) + 'px'); break; } } } }
        // text cut short (ellipsis or hidden overflow)
        if (texts.length && cs.overflow !== 'visible' && e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') add(cs.textOverflow === 'ellipsis' ? 'text cut with …' : 'text clipped', e, e.scrollWidth - e.clientWidth + 'px');
        // clipped by an ancestor that hides overflow
        for (let a = parentOf(e); a && a.nodeType === 1; a = parentOf(a)) { const ac = getComputedStyle(a); if (ac.overflowX === 'visible') { if (ac.position === 'fixed') break; continue; }
          const ar = a.getBoundingClientRect(); if ((ac.overflowX === 'hidden' || ac.overflowX === 'clip') && (r.right > ar.right + 1.5 || r.left < ar.left - 1.5) && r.width < ar.width) add('cut off by its container', e, Math.round(Math.max(r.right - ar.right, ar.left - r.left)) + 'px'); break; }
        // sideways scrolling inside the panel
        if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1) add('scrolls sideways', e, e.scrollWidth - e.clientWidth + 'px');
        // children that overlap each other
        const kids = [...e.children].filter(k => vis(k) && !/absolute|fixed|sticky/.test(getComputedStyle(k).position) && !(k instanceof SVGElement));
        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const A = kids[i].getBoundingClientRect(), B = kids[j].getBoundingClientRect();
          const w = Math.min(A.right, B.right) - Math.max(A.left, B.left), h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top); if (w > 2 && h > 2) add('overlaps', kids[i], 'with ' + name(kids[j]) + ' by ' + Math.round(w) + 'x' + Math.round(h)); }
      }
      // button rows that wrap: a row of buttons (30px tall or more: actions, not chips) that spills onto a
      // second line has to land as a grid, every line's buttons in the same columns; anything else (2 then 2
      // of different widths, a lone button pushed to the right) reads as a mistake. Lay them out on purpose.
      const groups = new Map();
      for (const e of els) { if (e.tagName !== 'BUTTON') continue; const q = e.getBoundingClientRect(); if (q.height < 30 || !q.width) continue;
        const p = e.parentElement; if (!p) continue; (groups.get(p) || groups.set(p, []).get(p)).push(q); }
      for (const [p, qs] of groups) {
        if (qs.length < 2) continue;
        const rows = []; for (const q of qs.sort((a, b) => a.top - b.top || a.left - b.left)) { const r = rows.find(r => Math.abs(r[0].top - q.top) < 6); r ? r.push(q) : rows.push([q]); }
        if (rows.length < 2) continue;
        const cols = rows[0].map(q => q.left), w0 = rows[0].map(q => q.width);
        const grid = rows.every(r => r.every((q, i) => i < cols.length && Math.abs(q.left - cols[i]) < 1.5 && Math.abs(q.width - w0[i]) < 1.5));
        if (!grid) add('wrapped buttons', p, qs.length + ' buttons wrap onto ' + rows.length + ' lines (' + rows.map(r => r.length).join(' + ') + ') without lining up in columns; make them one row, or a grid of equal columns');
      }
      // button rows that leave space unused: a row holding only action buttons (two or more, 30px and taller;
      // not a segmented control, which sits on its own filled bar) spans the full width of its row and splits
      // it evenly, so nothing sits pushed to one side with an empty stretch beside it
      for (const [p, qs] of groups) {
        if (qs.length < 2) continue;
        const pc = getComputedStyle(p), filled = (pc.backgroundColor !== 'rgba(0, 0, 0, 0)' && pc.backgroundColor !== 'transparent') || parseFloat(pc.borderTopWidth) > 0;
        if (filled || [...p.children].some(k => k.tagName !== 'BUTTON' && k.getBoundingClientRect().width > 0)) continue;
        const pr = p.getBoundingClientRect(), L = pr.left + parseFloat(pc.paddingLeft), R = pr.right - parseFloat(pc.paddingRight);
        const rows = []; for (const q of [...qs].sort((a, b) => a.top - b.top || a.left - b.left)) { const r = rows.find(r => Math.abs(r[0].top - q.top) < 6); r ? r.push(q) : rows.push([q]); }
        const bad = rows.find(r => r.length > 1 && (Math.abs(r[0].left - L) > 2 || Math.abs(r[r.length - 1].right - R) > 2 || r.some(q => Math.abs(q.width - r[0].width) > 2)));
        if (bad) add('uneven buttons', p, bad.length + ' buttons in a row ' + (Math.abs(bad[bad.length - 1].right - R) > 2 || Math.abs(bad[0].left - L) > 2 ? 'leave ' + Math.round((bad[0].left - L) + (R - bad[bad.length - 1].right)) + 'px of the row empty' : 'have different widths') + '; split the row evenly (equal columns, full width)');
      }
      // shape (tools/tokens.json): the panel's width and corners, the header's and tab bar's insets from
      // the panel's edge, and every rounded corner inside the panel on the radius scale (or nested
      // inside its parent's corner: the parent's radius less its padding)
      const modeBtn = els.find(e => e.getAttribute('aria-label') === 'Dark mode');
      let PNL = modeBtn; while (PNL && !(getComputedStyle(PNL).backdropFilter !== 'none' && PNL.getBoundingClientRect().width >= 300)) PNL = parentOf(PNL);
      if (PNL && PNL.nodeType === 1) {
        const pc = getComputedStyle(PNL), pr = PNL.getBoundingClientRect(), inL = pr.left + (parseFloat(pc.borderLeftWidth) || 0), inR = pr.right - (parseFloat(pc.borderRightWidth) || 0);
        const sheet = Math.abs(pr.bottom - vh) < 2 && parseFloat(pc.borderBottomLeftRadius) < 1, want = sheet ? ${SH.panel.sheet} : ${SH.panel.radius};
        if (Math.abs(parseFloat(pc.borderTopLeftRadius) - want) > .5) add('shape', PNL, (sheet ? 'phone sheet' : 'panel') + ' corners are ' + pc.borderTopLeftRadius + ', should be ' + want + 'px');
        if (!sheet && vw >= 1000 && Math.abs(pr.width - ${SH.panel.width}) > .5 && Math.abs(pr.width - 760) > .5) add('shape', PNL, 'panel is ' + Math.round(pr.width * 10) / 10 + 'px wide, should be ${SH.panel.width}px (Hourglass: 760px)');
        const head = modeBtn.parentElement, close = modeBtn.nextElementSibling;
        const tile = head && [...head.querySelectorAll('*')].find(x => { const q = x.getBoundingClientRect(); return q.width >= 24 && q.width <= 48 && Math.abs(q.width - q.height) < 1 && q.right < modeBtn.getBoundingClientRect().left - 60; });
        if (tile && Math.abs(tile.getBoundingClientRect().left - inL - ${SH.inset.head}) > .5) add('shape', tile, 'icon tile is ' + Math.round(tile.getBoundingClientRect().left - inL) + 'px from the panel edge, should be ${SH.inset.head}px');
        if (close && close.tagName === 'BUTTON' && Math.abs(inR - close.getBoundingClientRect().right - ${SH.inset.head}) > .5) add('shape', close, 'close button is ' + Math.round(inR - close.getBoundingClientRect().right) + 'px from the panel edge, should be ${SH.inset.head}px');
        for (const t of els.filter(x => PNL.contains(x) && String(x.className).split(' ').some(c => /tabs$/.test(c)))) {
          const q = t.getBoundingClientRect(); if (q.width < pr.width * .6) continue;
          if (Math.abs(q.left - inL - ${SH.inset.tabs}) > .5 || Math.abs(inR - q.right - ${SH.inset.tabs}) > .5) add('shape', t, 'tab bar is ' + Math.round(q.left - inL) + '/' + Math.round(inR - q.right) + 'px from the panel edges, should be ${SH.inset.tabs}px');
        }
        const scale = ${JSON.stringify([...new Set(Object.values(SH.radius))].sort((a, b) => b - a))};
        for (const e of els) {
          if (e === PNL || !PNL.contains(e)) continue;
          const c = getComputedStyle(e), v = c.borderTopLeftRadius; if (!v || /%/.test(v)) continue;
          const rad = parseFloat(v), q = e.getBoundingClientRect(); if (!(rad > ${SH.radius.tiny}) || rad >= Math.min(q.width, q.height) / 2 - .5) continue;
          if (scale.some(x => Math.abs(x - rad) < .01)) continue;
          const p = parentOf(e), ppc = p && p.nodeType === 1 ? getComputedStyle(p) : null;
          if (ppc && Math.abs(parseFloat(ppc.borderTopLeftRadius) - Math.min(parseFloat(ppc.paddingTop), parseFloat(ppc.paddingLeft)) - parseFloat(ppc.borderTopWidth || 0) - rad) <= 1) continue;
          add('shape', e, 'corners are ' + rad + 'px, off the radius scale (' + scale.join(', ') + 'px)');
        }
      }
      return out;
    };
    window.__folds = () => __all().filter(e => e.nodeType === 1 && (e.matches('.ytt-pick,[aria-expanded="false"]')) && e.getBoundingClientRect().width > 0);`;
  if (has('--audit')) { await page.evaluate(t => { window.__theme = t; }, theme); await page.evaluate(auditJs); }
  if (opt('--maxfrac', '')) await page.evaluate(f => { window.__maxFrac = f; }, +opt('--maxfrac', '0.92'));
  if (has('--sheet')) await page.evaluate(() => { window.__sheet = true; });
  // --drive <file.js>: a Node module (async (page, ctx) => result) that works the page from outside, the way a
  // person does: real taps and swipes on a touchscreen (tools/touchtest.py). Its result prints as EVAL, like --eval.
  if (opt('--drive', '')) { const v = await require(require('path').resolve(opt('--drive', '')))(page, ctx); console.log('EVAL ' + JSON.stringify(v)); await browser.close(); return; }
  if (evalJs) { const v = await page.evaluate(evalJs); if (has('--print')) console.log('EVAL ' + JSON.stringify(v)); await page.waitForTimeout(900); }   // --print: show what --eval returned
  // nothing to capture: a test that only wanted what --eval found (and the requests and console lines on the way)
  if (evalJs && out === '/dev/null' && !has('--audit')) { await browser.close(); return; }
  async function snap(file) {
    await page.evaluate(() => __hideErr());
    // Screenshots never show the version: they only need recapturing when a panel changes.
    await page.evaluate(() => { for (const e of __all()) for (const n of e.childNodes) if (n.nodeType === 3 && /v\d+\.\d+/.test(n.nodeValue))
      n.nodeValue = n.nodeValue.replace(/\s*·\s*v\d+(\.\d+)+/g, '').replace(/v\d+(\.\d+)+\s*·\s*/g, '').replace(/\bv\d+(\.\d+)+\b/g, ''); });
    let clip;
    if (crop) { const sel = opt('--clipsel', ''); const r = await page.evaluate(sel => { if (sel) { const e = __all().find(x => x.matches && x.matches(sel)); if (e) { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; } } return __panelRect(); }, sel); if (r) { const pad = 28; const vp = page.viewportSize();
      const x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad); clip = { x, y, width: Math.min(vp.width - x, r.w + pad * 2), height: Math.min(vp.height - y, r.h + pad * 2) }; } }
    // a cropped capture shows the whole panel: if anything inside it still scrolls, the picture is cut off
    if (crop) { const cut = await page.evaluate(() => __all().filter(e => { const c = getComputedStyle(e); return /auto|scroll/.test(c.overflowY) && e.scrollHeight > e.clientHeight + 2 && e.clientHeight > 40; }).length);
      if (cut) console.log('CLIPPED ' + file + ': the panel scrolls, so part of it is missing (capture it taller with --vh)'); }
    await page.screenshot({ path: file, clip, animations: 'disabled' });   // animations stopped, so captures repeat exactly
    console.log('saved', file, clip ? 'cropped' : '');
    if (has('--text')) console.log('TEXT>>', await page.evaluate(() => { const seen = new Set(); const out = []; for (const e of __all()) { if (e.children.length) continue; const t = (e.textContent || '').trim(); const r = e.getBoundingClientRect(); if (!t || r.width === 0 || seen.has(t) || t.length > 140) continue; if (e.closest('header,main')) continue; seen.add(t); out.push(t); } return out.join(' | '); }));
  }


  const carryJs = `
    window.__ctl = () => {
      const fixedAnc = e => { for (let x = e; x; x = x.parentElement || (x.getRootNode() && x.getRootNode().host)) { if (x.nodeType === 1 && getComputedStyle(x).position === 'fixed') return x; } return null; };
      const all = __all().filter(e => e.nodeType === 1 && fixedAnc(e));
      const out = [];
      const label = (c, skip) => { const own = (skip || c).textContent || ''; for (let a = (skip || c).parentElement, i = 0; a && i < 5; a = a.parentElement, i++) {
        const t = (a.textContent || '').replace(own, '').replace(/\\s+/g, ' ').trim(); if (t.length >= 3) return t.slice(0, 50); } return '?'; };
      for (const e of all) {
        if (e.matches('input[type=checkbox],[role=switch]')) out.push({ kind: 'toggle', el: e, label: label(e), value: e.matches('input') ? e.checked : e.getAttribute('aria-checked') === 'true' });
        else if (e.matches('input[type=range]')) out.push({ kind: 'slider', el: e, label: label(e), value: e.value });
        else if (e.matches('.seg:not([role=tablist]),.ytt-seg,.kld-seg')) { const bs = [...e.children].filter(b => b.tagName === 'BUTTON'); if (bs.length < 2) continue;
          const on = bs.find(b => b.classList.contains('on') || b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-checked') === 'true');
          out.push({ kind: 'choice', el: e, buttons: bs, label: label(e, e), value: on ? on.textContent.trim() : '' }); }
      }
      return out;
    };
    window.__state = tab => { const seen = {}, pos = {}; return __ctl().map(c => { const k = tab + ' | ' + c.kind + ' | ' + c.label; seen[k] = (seen[k] || 0) + 1; pos[c.kind] = (pos[c.kind] || 0) + 1;
      return { key: k + (seen[k] > 1 ? ' #' + seen[k] : ''), pos: tab + ' | ' + c.kind + ' ' + pos[c.kind], value: c.value }; }); };
    window.__exercise = async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const n = __ctl().length;
      for (let i = n - 1; i >= 0; i--) {   // backwards, so an on/off master switch goes last
        const c = __ctl()[i]; if (!c) continue;
        try {
          if (c.kind === 'toggle') { if (!/Everything is (on|off)/.test(c.label)) c.el.click(); }   // leave the master switch on, or the panel hides the rest
          else if (c.kind === 'choice') { const b = c.buttons.filter(b => !(b.classList.contains('on') || b.getAttribute('aria-pressed') === 'true')).pop(); if (b) b.click(); }
          else if (c.kind === 'slider') { const el = c.el, mn = +el.min || 0, mx = +el.max || 100, st = +el.step || 1; const v = +el.value === mx ? mx - st : Math.min(mx, +el.value + st);
            const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
        } catch (e) {}
        await wait(60);
      }
    };
    window.__dump = () => { const ls = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); } return { gm: JSON.parse(JSON.stringify(__gm)), ls, reads: [...__reads] }; };`;
  // --live: every control must update the panel on the spot. Change each control in turn, read what
  // every control (and the panel's text) shows, then close and reopen the panel and read it again: any
  // difference is something that only caught up after a reopen (or a tab switch, or a refresh).
  if (has('--live')) {
    await page.evaluate(auditJs || ''); await page.evaluate(carryJs);
    page.on('dialog', d => d.dismiss().catch(() => {}));
    const tabList = tabs ? tabs.split(',') : ['main'];
    const goTab = async t => { if (t !== 'main') { await page.evaluate(t => __clickTab(t), t); await page.waitForTimeout(450); } };
    const read = (t, pg = page) => pg.evaluate(t => {
      const st = __state(t).map(x => [x.pos + ' (' + x.key.split(' | ').pop() + ')', String(x.value)]);
      // the panel's words too (numbers and times left out: clocks and counters move on their own)
      const host = __all().find(e => e.getAttribute && e.getAttribute('aria-label') === 'Dark mode');
      let root = host; while (root && root.getBoundingClientRect().width < 300) root = root.parentElement || (root.getRootNode() && root.getRootNode().host);
      // (color values are kept: a stale color is a stale panel)
      const text = root ? (root.innerText || '').split('\n').map(l => l.replace(/(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b)|[0-9]+([.:,][0-9]+)*/g, (m, col) => col || '#').trim()).filter(Boolean) : [];
      // color swatches (the title bar or seek bar color, a hex preview, a status dot) and typed values
      if (root) { const n = {};
        for (const e of [root, ...root.querySelectorAll('*')]) { const r = e.getBoundingClientRect(); if (!r.width) continue;
          const cls = (typeof e.className === 'string' ? e.className : '').trim().split(/\s+/)[0] || e.tagName.toLowerCase();
          if (e.matches('input[type=text],input[type=number],input:not([type])')) { n[cls] = (n[cls] || 0) + 1; st.push(['field ' + cls + ' #' + n[cls], e.value]); continue; }
          if (r.width > 80 || r.height > 80 || r.width < 6 || r.height < 6 || e.childElementCount || (e.textContent || '').trim()) continue;
          const bg = getComputedStyle(e).backgroundColor; if (bg === 'rgba(0, 0, 0, 0)') continue;
          n[cls] = (n[cls] || 0) + 1; st.push(['swatch ' + cls + ' #' + n[cls], bg]); } }
      return { st, text };
    }, t);
    const reopen = async (t, pg = page) => {
      await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
      await pg.evaluate(n => { const c = window.__cmds.find(c => c.n.startsWith(n)); if (c) c.f(); }, cmdName); await pg.waitForTimeout(600);
      if (t !== 'main') { await pg.evaluate(t => __clickTab(t), t); await pg.waitForTimeout(450); }
    };
    const issues = [];
    // --twotab: the change is made in one tab and checked in a second open tab of the same site
    const two = has('--twotab'); let other = null;
    const openOther = async () => {
      if (other) await other.close();
      other = await ctx.newPage(); await other.goto(url, { waitUntil: 'load' }); await other.waitForTimeout(1200);
      if (cmdName !== 'none') await other.evaluate(n => { const c = window.__cmds.find(c => c.n.startsWith(n)); if (c) c.f(); }, cmdName);
      await other.waitForTimeout(800); await other.evaluate(helpers); await other.evaluate(auditJs || ''); await other.evaluate(carryJs);
    };
    // each tab starts from a fresh page (the demo data again), so what one tab's test changed can't hide
    // a problem in the next
    const fresh = async () => {
      await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1200);
      if (cmdName !== 'none') await page.evaluate(n => { const c = window.__cmds.find(c => c.n.startsWith(n)); if (c) c.f(); }, cmdName);
      await page.waitForTimeout(800);
      await page.evaluate(helpers); await page.evaluate(auditJs || ''); await page.evaluate(carryJs);
    };
    for (const t of tabList) {
      if (t !== tabList[0] || two) await fresh();
      await goTab(t);
      if (two) { await openOther(); if (t !== 'main') { await other.evaluate(t => __clickTab(t), t); await other.waitForTimeout(450); } }
      const n = await page.evaluate(() => __ctl().length);
      if (has('--verbose')) console.log('CTL ' + t + ' ' + JSON.stringify(await page.evaluate(() => __ctl().map(c => c.kind + ':' + c.label + '=' + c.value))));
      for (let j = 0; j < 2 * n; j++) {   // each control twice: there and back, so both directions are seen
        const i = j >> 1;
        const what = await page.evaluate(i => { const c = __ctl()[i]; if (!c) return null;
          if (c.kind === 'toggle') { if (/Everything is (on|off)/.test(c.label)) return null; c.el.click(); return c.label; }
          if (c.kind === 'choice') { const b = c.buttons.filter(b => !(b.classList.contains('on') || b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-checked') === 'true')).pop(); if (!b) return null; b.click(); return c.label + ' → ' + b.textContent.trim(); }
          if (c.kind === 'slider') { const el = c.el, mx = +el.max || 100, st = +el.step || 1, v = +el.value === mx ? mx - st : Math.min(mx, +el.value + st);
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return c.label; }
          return null; }, i);
        if (!what) continue;
        await page.waitForTimeout(1200);   // long enough for a fade or a color pick to land
        const pg = two ? other : page;
        const live = await read(t, pg); await reopen(t, pg); const fresh = await read(t, pg);
        if (has('--verbose')) console.log('READ ' + what.slice(0, 40) + ' :: ' + JSON.stringify(live.st.filter(x => /^swatch|^field/.test(x[0]))));
        const F = Object.fromEntries(fresh.st);
        const where = two ? ' in another open tab' : '';
        for (const [k, v] of live.st) if (k in F && F[k] !== v) issues.push(`${t} | after "${what.slice(0, 50)}"${where}: ${k.slice(0, 70)} showed ${v} until the panel was reopened (then ${F[k]})`);
        const lt = new Set(live.text), ft = new Set(fresh.text);
        const gone = [...ft].filter(x => !lt.has(x)).slice(0, 2);
        for (const x of gone) issues.push(`${t} | after "${what.slice(0, 50)}"${where}: the text "${x.slice(0, 60)}" only appeared after reopening`);
      }
    }
    console.log('LIVE ' + JSON.stringify([...new Set(issues)]));
    await browser.close(); return;
  }
  if (has('--exercise') || has('--state')) {
    await page.evaluate(auditJs || ''); await page.evaluate(carryJs);
    page.on('dialog', d => d.dismiss().catch(() => {}));
    const tabList = tabs ? tabs.split(',') : ['main'];   // name every tab, the first one too
    const goTab = async t => { if (t !== 'main') { await page.evaluate(t => __clickTab(t), t); await page.waitForTimeout(500); } };
    if (has('--exercise')) for (const t of tabList) { await goTab(t); await page.evaluate(() => __exercise()); await page.waitForTimeout(300); }
    const state = [];
    for (const t of tabList) { await goTab(t); state.push(...await page.evaluate(t => __state(t), t)); }
    await page.waitForTimeout(800);
    console.log('CARRY ' + JSON.stringify({ state, ...(await page.evaluate(() => __dump())) }));
    await browser.close(); return;
  }
  if (has('--audit')) {
    const res = [];
    const check = async label => {
      res.push(...await page.evaluate(l => __audit(l), label));
      // a selected state: tap the first chart bar or day that shows details (Hourglass), then look again
      if (await page.evaluate(() => { const t = __all().find(e => e.dataset && e.dataset.tip && e.getBoundingClientRect().width > 0); if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })); return !!t; })) {
        await page.waitForTimeout(250); res.push(...await page.evaluate(l => __audit(l), label + ' > tapped'));
      }
      const n = await page.evaluate(() => __folds().length);
      for (let i = 0; i < n; i++) {
        const t = await page.evaluate(i => { const f = __folds()[i]; if (!f) return null; const t = (f.closest('[class*=row]') || f.parentElement).textContent.trim().slice(0, 30); f.click(); return t; }, i);
        if (t === null) continue;
        await page.waitForTimeout(250);
        res.push(...await page.evaluate(l => __audit(l), label + ' > ' + t));
        await page.evaluate(i => { const f = __all().find(e => e.matches && e.matches('.ytt-pick[aria-expanded="true"],.ytt-pick.open,[aria-expanded="true"]')); if (f) f.click(); }, i);
        await page.waitForTimeout(150);
      }
    };
    await check('main');
    if (tabs) for (const t of tabs.split(',')) { if (await page.evaluate(t => __clickTab(t), t)) { await page.waitForTimeout(700); await check(t); } }
    console.log('AUDIT ' + JSON.stringify(res));
    await browser.close(); return;
  }
  await snap(out);
  if (tabs) for (const t of tabs.split(',')) {
    const ok = await page.evaluate(t => __clickTab(t), t);
    if (!ok) { console.log('tab not found:', t); continue; }
    await page.waitForTimeout(900);
    await snap(out.replace(/\.png$/, '-' + t.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png'));
  }
  if (has('--dump')) console.log(await page.evaluate(() => [...document.querySelectorAll('body > *:not(header):not(main)')].map(e => e.tagName + '#' + e.id + '.' + e.className).join('\n')));
  await browser.close();
})();
