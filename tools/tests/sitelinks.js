// Every link on the site that jumps to a spot on a page (Desktop and Phone in the top bar, See the scripts,
// Watch the trailer, Trouble installing?, and the links back to the landing page's lists) must stop with what it
// points at fully below the floating top bar, never under it. Tried in a browser window, a taller installed-app
// window (no address bar, so more of the page fits and the page scrolls differently) and a phone, by clicking or
// tapping each link the way a person would. Prints one "== <page> <size>: clean" line per run, or what went wrong.
//   node tools/tests/sitelinks.js
const path = require('path'), http = require('http'), fs = require('fs');
const { chromium } = require('playwright');
const DOCS = path.join(__dirname, '..', '..', 'docs');
const PAGES = ['index.html', 'desktop/hourglass/index.html', 'mobile/kaleidoscope-mobile/index.html'];
const SIZES = [
  { name: 'browser', viewport: { width: 1376, height: 730 } },
  { name: 'app window', viewport: { width: 1920, height: 1000 } },
  { name: 'phone', viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true },
];
const GAP = 8;   // at least this much air between the bar and the target

// served the way GitHub Pages serves it (a folder address opens its index.html), so links like ../../#desktop work
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4' };
const server = http.createServer((q, r) => {
  let f = decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/^\/glassware\/?/, '/');
  f = path.join(DOCS, path.normalize(f)); if (!f.startsWith(DOCS)) { r.writeHead(403); return r.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});

(async () => {
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const BASE = `http://127.0.0.1:${server.address().port}/glassware/`;
  const b = await chromium.launch();
  let bad = 0;
  for (const pg of PAGES) for (const sz of SIZES) {
    const ctx = await b.newContext({ viewport: sz.viewport, isMobile: !!sz.isMobile, hasTouch: !!sz.hasTouch, reducedMotion: 'no-preference' });
    const p = await ctx.newPage(); const url = BASE + pg.replace(/index\.html$/, ''); const probs = [];
    await p.goto(url); await p.waitForLoadState('load');
    // the in-page links a person can see here
    const links = await p.evaluate(() => [...document.querySelectorAll('a[href*="#"]')].map((a, i) => {
      a.dataset.lt = i; const r = a.getBoundingClientRect(); const u = new URL(a.href);
      return { i, text: (a.textContent || '').trim().slice(0, 40), hash: u.hash, same: u.pathname === location.pathname, file: u.pathname, shown: r.width > 0 && r.height > 0 && !!a.offsetParent };
    }).filter(l => l.shown && l.hash.length > 1));
    for (const l of links) {
      await p.goto(url); await p.waitForLoadState('load'); await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(150);
      await p.evaluate(i => { const a = document.querySelectorAll('a[href*="#"]')[i]; if (a) a.dataset.lt = i; }, l.i);
      const loc = p.locator(`[data-lt="${l.i}"]`);
      await loc.scrollIntoViewIfNeeded().catch(() => {}); await p.waitForTimeout(100);
      // press it where a person would, in the middle (the page's floating lava never settles, so no waiting for it to)
      const bx = await loc.boundingBox();
      if (!bx) { probs.push(`${l.text}: not on screen to press`); continue; }
      const cx = bx.x + bx.width / 2, cy = bx.y + bx.height / 2;
      if (sz.hasTouch) await p.touchscreen.tap(cx, cy); else await p.mouse.click(cx, cy);
      await p.waitForLoadState('load'); await p.waitForTimeout(1400);   // smooth scrolling settles
      const res = await p.evaluate(hash => {
        const id = hash.slice(1);
        // Desktop and Phone bring up the filtered list, filter switch first
        const t = (id === 'desktop' || id === 'phone') && document.getElementById('scripts') ? document.getElementById('scripts') : document.getElementById(id);
        const nav = document.querySelector('nav .bar');
        if (!t) return { missing: true };
        const r = t.getBoundingClientRect(), nb = nav ? nav.getBoundingClientRect().bottom : 0;
        const room = document.documentElement.scrollHeight - innerHeight - scrollY;   // a target near the end can't reach the top
        return { top: Math.round(r.top), nb: Math.round(nb), vh: innerHeight, atEnd: room < 2, page: location.pathname };
      }, l.hash);
      const where = l.same ? '' : ' (on the landing page)';
      if (res.missing) probs.push(`${l.text}: nothing on the page has the id ${l.hash}${where}`);
      else if (res.top < res.nb + GAP) probs.push(`${l.text}: ${l.hash} stops ${res.nb + GAP - res.top}px too high, under the top bar${where}`);
      else if (res.top > res.vh - 40) probs.push(`${l.text}: ${l.hash} is still off screen (${res.top}px down)${where}`);
    }
    await ctx.close();
    const name = `${pg.replace('/index.html', '').replace('index.html', 'landing')} ${sz.name}`;
    if (probs.length) { bad++; console.log(`== ${name}: ${probs.join('; ')}`); }
    else console.log(`== ${name}: clean (${links.length} links)`);
  }
  await b.close(); server.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
