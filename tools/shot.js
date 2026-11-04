// Render a userscript's own menu in a stubbed page and screenshot it.
// usage: node shot.js <script.user.js> <url> <out.png> [--mobile] [--cmd "Open ..."] [--theme dark|light] [--wait ms] [--eval js] [--full]
const { chromium, devices } = require('playwright');
const fs = require('fs');

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

function stubPage() {
  const dark = theme === 'dark';
  const bg = dark ? '#0f0f0f' : '#f4f5f7', fg = dark ? '#eee' : '#222';
  const cards = Array.from({ length: 12 }, (_, i) => {
    const h = (i * 47 + 200) % 360;
    return `<div class="card"><div class="thumb" style="background:linear-gradient(135deg,hsl(${h} 70% 55%),hsl(${(h + 60) % 360} 70% 35%))"></div>
      <div class="t1"></div><div class="t2"></div></div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="${opt('--themecolor', '#3b6fd6')}"><title>${host}</title>
  <style>body{margin:0;background:${bg};color:${fg};font:14px system-ui,sans-serif}
  header{height:56px;display:flex;align-items:center;gap:16px;padding:0 20px;position:sticky;top:0;background:${bg};z-index:5}
  .logo{width:110px;height:22px;border-radius:6px;background:${dark ? '#333' : '#ccd'}}
  .search{flex:1;max-width:520px;height:36px;border-radius:18px;background:${dark ? '#222' : '#e3e5ea'};margin:0 auto}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(${mobile ? 300 : 280}px,1fr));gap:18px;padding:20px}
  .thumb{aspect-ratio:16/9;border-radius:12px}.t1,.t2{height:12px;border-radius:6px;background:${dark ? '#2a2a2a' : '#dde'};margin-top:10px}.t2{width:60%}
  video{display:block;width:${mobile ? '100%' : '640px'};aspect-ratio:16/9;background:linear-gradient(135deg,#ff6a3d,#7a2cff);margin:20px;border-radius:12px}
  </style></head><body><header><div class="logo"></div><div class="search"></div><div id="end" style="display:flex;gap:10px"></div></header>
  ${has('--video') ? '<video muted playsinline src="https://' + host + '/clip.mp4"></video>' : ''}
  <main class="grid">${cards}</main></body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const ctxOpts = mobile ? { ...devices['Pixel 7'], ...(opt('--vh', '') ? { viewport: { width: 412, height: +opt('--vh', '839') } } : {}) } : { viewport: { width: +opt('--vw', '1280'), height: +opt('--vh', '820') }, deviceScaleFactor: 2 };
  ctxOpts.colorScheme = theme;
  ctxOpts.timezoneId = 'America/Detroit';
  const ctx = await browser.newContext(ctxOpts);
  if (clock) await ctx.clock.setFixedTime(new Date(clock));
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('https://graphql.anilist.co')) return route.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(__dirname + '/seeds/anilist.json', 'utf8') });
    if (route.request().resourceType() === 'document' && u.startsWith(url.split('#')[0].replace(/\/$/, '')))
      return route.fulfill({ status: 200, contentType: 'text/html', body: stubPage() });
    return route.fulfill({ status: 404, body: '' });
  });
  const shim = `
    (() => {
      const store = Object.assign({}, ${seed || '{}'});
      const ls = [];
      window.__cmds = [];
      const W = window;
      W.GM_getValue = (k, d) => (k in store ? store[k] : d);
      W.GM_setValue = (k, v) => { const o = store[k]; store[k] = v; ls.forEach(l => l.k === k && l.f(k, o, v, false)); };
      W.GM_deleteValue = k => { delete store[k]; };
      W.GM_listValues = () => Object.keys(store);
      W.GM_addValueChangeListener = (k, f) => { ls.push({ k, f }); return ls.length; };
      W.GM_removeValueChangeListener = () => {};
      W.GM_registerMenuCommand = (n, f) => { W.__cmds.push({ n, f }); return W.__cmds.length; };
      W.GM_unregisterMenuCommand = () => {};
      W.GM_addStyle = css => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).append(s); return s; };
      W.GM_xmlhttpRequest = o => { setTimeout(() => o.onerror && o.onerror({ status: 0 }), 10); return { abort() {} }; };
      W.GM_setClipboard = () => {};
      W.GM_openInTab = () => ({ close() {} });
      W.GM_info = { script: { name: 'x', version: ${JSON.stringify((src.match(/@version\s+(\S+)/) || [])[1] || '0')} }, scriptHandler: 'Tampermonkey', version: '5.3' };
      W.GM = { getValue: async (k, d) => W.GM_getValue(k, d), setValue: async (k, v) => W.GM_setValue(k, v) };
      W.unsafeWindow = W;
      const _as = Element.prototype.attachShadow; Element.prototype.attachShadow = function (o) { return _as.call(this, Object.assign({}, o, { mode: 'open' })); };
    })();`;
  await ctx.addInitScript(shim + '\n;(function(){try{\n' + src + '\n}catch(e){console.error("SCRIPT ERR",e)}})();');
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
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
        const r = e.getBoundingClientRect(); const a = r.width * r.height; if (a < 40000 || a > vw * vh * 0.92) continue; if (a > ba) { ba = a; best = r; } }
      return best && { x: best.x, y: best.y, w: best.width, h: best.height }; };
    window.__clickTab = t => { const c = __all().filter(e => e.children.length <= 2 && (e.textContent || '').trim() === t && e.getBoundingClientRect().width > 0 && (e.matches('button,[role=tab],a,[data-tab],li,div,span'))); 
      const el = c.find(e => e.matches('button,[role=tab]')) || c[0]; if (el) { el.click(); return true; } return false; };
    window.__hideErr = () => { for (const e of __all()) if (/unreadable response|Couldn.t reach|returned an/i.test(e.textContent || '') && e.children.length === 0) e.style.visibility = 'hidden'; };`;
  await page.evaluate(helpers);
  if (evalJs) { await page.evaluate(evalJs); await page.waitForTimeout(900); }
  async function snap(file) {
    await page.evaluate(() => __hideErr());
    // Screenshots never show the version: they only need recapturing when a panel changes.
    await page.evaluate(() => { for (const e of __all()) for (const n of e.childNodes) if (n.nodeType === 3 && /v\d+\.\d+/.test(n.nodeValue))
      n.nodeValue = n.nodeValue.replace(/\s*·\s*v\d+(\.\d+)+/g, '').replace(/v\d+(\.\d+)+\s*·\s*/g, '').replace(/\bv\d+(\.\d+)+\b/g, ''); });
    let clip;
    if (crop) { const r = await page.evaluate(() => __panelRect()); if (r) { const pad = 28; const vp = page.viewportSize();
      const x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad); clip = { x, y, width: Math.min(vp.width - x, r.w + pad * 2), height: Math.min(vp.height - y, r.h + pad * 2) }; } }
    await page.screenshot({ path: file, clip });
    console.log('saved', file, clip ? 'cropped' : '');
    if (has('--text')) console.log('TEXT>>', await page.evaluate(() => { const seen = new Set(); const out = []; for (const e of __all()) { if (e.children.length) continue; const t = (e.textContent || '').trim(); const r = e.getBoundingClientRect(); if (!t || r.width === 0 || seen.has(t) || t.length > 140) continue; if (e.closest('header,main')) continue; seen.add(t); out.push(t); } return out.join(' | '); }));
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
