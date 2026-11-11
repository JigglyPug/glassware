// Works a phone sheet the way a thumb does, with real touch events (shot.js --drive; tools/touchtest.py).
// Finds the sheet on its own: the fixed element that holds the grab handle (or Molten's #ytt-panel), the
// part of it that scrolls, its first switch and its tabs. Each step reports what happened; the Python side
// decides what counts as a problem. Steps run in this order: taps, a scroll inside, taps that mustn't
// reach the site, a short pull on the handle (springs back), a long one (closes the sheet).
module.exports = async (page) => {
  const cdp = await page.context().newCDPSession(page);
  const sleep = ms => page.waitForTimeout(ms);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const drag = async (x, y0, y1, steps = 12, ms = 260) => {
    await touch('touchStart', x, y0);
    for (let i = 1; i <= steps; i++) { await touch('touchMove', x, y0 + (y1 - y0) * i / steps); await sleep(ms / steps); }
    await touch('touchEnd', x, y1);
  };
  // everything the steps need, found fresh each time (a render can replace elements)
  const find = () => page.evaluate(() => {
    const roots = [document]; for (let i = 0; i < roots.length; i++) for (const e of roots[i].querySelectorAll('*')) if (e.shadowRoot) roots.push(e.shadowRoot);
    const q = s => { for (const r of roots) { const e = r.querySelector(s); if (e) return e; } return null; };
    const fixed = e => { while (e && getComputedStyle(e).position !== 'fixed') e = e.parentElement || (e.getRootNode && e.getRootNode().host); return e; };
    const grab = q('[class~="grab"], .kld-grab, .ytt-grab');
    const sheet = grab ? fixed(grab) : q('#ytt-panel');
    window.__sheet = sheet; window.__grab = grab;
    if (!sheet || !sheet.isConnected) return { open: false };
    const cs = getComputedStyle(sheet), r = sheet.getBoundingClientRect();
    const open = cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && r.top < innerHeight - 40;
    const scroller = [...sheet.querySelectorAll('*')].find(x => /auto|scroll/.test(getComputedStyle(x).overflowY) && x.scrollHeight > x.clientHeight + 40);
    window.__scroller = scroller;
    const vis = e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.top > r.top + 40 && b.bottom < innerHeight - 10; };
    const sw = [...sheet.querySelectorAll('input[type="checkbox"], [role="switch"]')].find(vis);
    const tabs = [...sheet.querySelectorAll('[role="tab"], [class*="tabs"] button')].filter(vis);
    const box = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
    window.__sw = sw;
    return { open, top: r.top, grab: box(grab) || { x: innerWidth / 2, y: r.top + 12 }, scroller: box(scroller), scrollerTop: scroller ? scroller.scrollTop : null,
             sw: box(sw), swOn: sw ? (sw.checked !== undefined ? sw.checked : sw.getAttribute('aria-checked') === 'true') : null,
             tabs: tabs.map(t => ({ ...box(t), on: t.getAttribute('aria-selected') === 'true' || /(^|\s)(on|active|sel)(\s|$)/.test(t.className), text: t.textContent.trim() })), pageY: scrollY };
  });
  // the site listens the usual way (bubbling, on the document): nothing done inside the sheet may reach it
  await page.evaluate(() => { window.__leak = []; for (const t of ['click', 'touchstart', 'touchend', 'pointerdown'])
    document.addEventListener(t, e => { const p = e.composedPath(); if (window.__sheet && p.includes(window.__sheet)) window.__leak.push(t); }); });
  const out = {};
  // wait for the sheet to be up and still (it slides in, and a busy machine takes longer), up to 6 s
  let s = await find();
  for (let i = 0, still = 0; i < 30 && still < 3; i++) { await sleep(200); const t = await find(); still = t.open && t.top === s.top ? still + 1 : 0; s = t; }
  out.opened = s.open; out.top = s.top;
  if (!s.open) return out;
  if (s.sw) { await page.touchscreen.tap(s.sw.x, s.sw.y); await sleep(500); const t = await find(); out.switchTap = { before: s.swOn, after: t.swOn }; s = t; }
  const other = s.tabs.find(t => !t.on);
  if (other) { await page.touchscreen.tap(other.x, other.y); let t = await find();
    for (let i = 0; i < 15 && !(t.tabs.find(x => x.text === other.text) || {}).on; i++) { await sleep(200); t = await find(); }
    await sleep(400); t = await find(); out.tabTap = { tab: other.text, selected: (t.tabs.find(x => x.text === other.text) || {}).on }; s = t; }
  if (s.scroller) {
    await page.evaluate(() => { if (window.__scroller) window.__scroller.scrollTop = 0; scrollTo(0, 0); }); await sleep(200);
    s = await find();
    await drag(s.scroller.x, Math.min(s.scroller.y + 150, 760), Math.max(s.scroller.y - 150, s.top + 120)); await sleep(700);
    const t = await find(); out.scroll = { sheetMoved: t.scrollerTop - s.scrollerTop, pageMoved: t.pageY - s.pageY }; s = t;
  }
  out.leaks = await page.evaluate(() => window.__leak);
  // a short pull on the handle springs back; a long one closes the sheet
  await page.evaluate(() => { if (window.__scroller) window.__scroller.scrollTop = 0; }); s = await find();
  await drag(s.grab.x, s.grab.y, s.grab.y + 40, 6, 300); await sleep(700);
  let t = await find(); out.shortPullOpen = t.open && Math.abs(t.top - s.top) < 3;
  await drag(t.grab.x, t.grab.y, Math.min(t.grab.y + 300, 820), 15, 450); await sleep(900);
  t = await find(); out.swipeClosed = !t.open;
  out.errs = await page.evaluate(() => window.__errs || []);
  return out;
};
