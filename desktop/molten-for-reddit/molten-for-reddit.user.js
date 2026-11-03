// ==UserScript==
// @name         Molten for Reddit
// @namespace    molten-tools
// @version      2.2.11
// @description  Molten glass for new Reddit: a lava-lamp background made from the video or image you're looking at, clear-glass posts and comments, Calm / User / Crazy profiles, best video quality, art-colored seek bar, Arctic Shift profile lookup, plus Reddit QOL tweaks. Click the orange lava button in the top bar for settings.
// @match        https://www.reddit.com/*
// @match        https://sh.reddit.com/*
// @exclude      https://www.reddit.com/media*
// @noframes
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      i.redd.it
// @connect      preview.redd.it
// @connect      external-preview.redd.it
// @connect      styles.redditmedia.com
// @connect      a.thumbs.redditmedia.com
// @connect      b.thumbs.redditmedia.com
// @connect      packaged-media.redd.it
// @author       JigglyPug
// @license      MIT
// @icon         https://raw.githubusercontent.com/JigglyPug/glassware/main/assets/icons/molten-for-reddit.png
// @homepageURL  https://jigglypug.github.io/glassware/desktop/molten-for-reddit/
// @supportURL   https://github.com/JigglyPug/glassware/issues
// @updateURL    https://raw.githubusercontent.com/JigglyPug/glassware/main/desktop/molten-for-reddit/molten-for-reddit.user.js
// @downloadURL  https://raw.githubusercontent.com/JigglyPug/glassware/main/desktop/molten-for-reddit/molten-for-reddit.user.js
// ==/UserScript==

/* Molten for Reddit: the Molten Tools engine, rebuilt for new Reddit.
     - Lava Lamp: the background is the video that's playing, or the image of the post you're looking at,
       blurred, color-boosted and slowly breathing, with soft color blobs. Calm / User / Crazy profiles.
       Falls back to the subreddit's banner/icon, then a built-in palette.
     - Glass: posts, comments, sidebars, header and menus become clear glass over the lava
     - Art colors: the installed-app (PWA) title bar and the video seek bar match the current art
     - Video: best quality instead of Reddit's pick, see-through bars around narrow/wide videos
     - Reddit tweaks: default comment sort, auto-expand "more replies", hide the right sidebar or legal links
     - Search: a 🔍 on profiles and a Search tab for Arctic Shift (posts / comments, subreddit, dates)
     - One master switch that stops everything live
   Click the orange lava button in the top bar to open the settings. Open Reddit tabs sync live.
   Reddit changes its layout often: if a surface stays solid, use General > "Copy layout report". */

(function boot() {
  'use strict';
  if (window.top !== window.self) return;
  if (!document.documentElement) {
    const mo = new MutationObserver(() => { if (document.documentElement) { mo.disconnect(); boot(); } });
    mo.observe(document, { childList: true });
    return;
  }

  // =====================================================================
  //  Helpers
  // =====================================================================
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
  function gmSet(k, v) { try { if (typeof GM_setValue === 'function') GM_setValue(k, v); } catch (e) { /* ignore */ } }
  function gmWatch(k, fn) {
    try {
      if (typeof GM_addValueChangeListener === 'function') {
        GM_addValueChangeListener(k, (name, oldV, newV, remote) => { if (remote) fn(newV); });
      }
    } catch (e) { /* ignore */ }
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const clone = o => JSON.parse(JSON.stringify(o));

  // Master switch: off = every feature and style stops; only the button and panel stay.
  let ENABLED = gmGet('enabled', true) !== false;
  const STYLES = [];
  function rawStyle(css) {
    const s = document.createElement('style');
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
    return s;
  }
  function makeStyle(css) {
    const s = rawStyle(css);
    STYLES.push(s);
    if (!ENABLED) s.media = 'not all';
    return s;
  }
  const addStyle = makeStyle;
  const coreStyle = rawStyle; // button + panel: never switched off
  function setStylesEnabled(on) { for (const el of STYLES) el.media = on ? '' : 'not all'; }

  // =====================================================================
  //  Settings (one copy, shared by every open Reddit tab)
  // =====================================================================
  const PROFILE_KEYS = ['bgBlur', 'bgBrightness', 'bgSaturate', 'bgScale', 'blobs', 'blobSteps',
    'motionSpeed', 'motionAmount', 'randomize'];
  const PRESETS = {
    calm: { bgBlur: 0.7, bgBrightness: 0.6, bgSaturate: 1.4, bgScale: 1.2, blobs: true, blobSteps: 30, motionSpeed: 0.5, motionAmount: 0.5, randomize: true },
    user: { bgBlur: 0.5, bgBrightness: 0.7, bgSaturate: 2, bgScale: 1.2, blobs: true, blobSteps: 45, motionSpeed: 1, motionAmount: 1, randomize: true },
    crazy: { bgBlur: 0.3, bgBrightness: 0.9, bgSaturate: 3.5, bgScale: 1.35, blobs: true, blobSteps: 120, motionSpeed: 2.5, motionAmount: 2.2, randomize: true },
  };
  const PROFILE_NAMES = { calm: 'Calm', user: 'User', crazy: 'Crazy' };
  const SHARED_DEFAULTS = {
    on: true,             // the lava itself (glass stays either way)
    followScroll: true,   // the lava follows the post in the middle of the screen
    videoSource: 'any',   // 'any' (feed, posts, profiles) | 'post' (post pages + profiles) | 'off'
    videoFps: 15,
    videoWidth: 128,
    videoCropBars: true,
    pauseOnScroll: true,  // freeze the lava's motion while you scroll (smoother on long feeds)
    debug: false,
  };
  function loadLavaStore() {
    const st = gmGet('lava', null);
    const out = { v: 2, profile: 'user', profiles: {}, shared: Object.assign({}, SHARED_DEFAULTS, st && st.shared) };
    for (const p of Object.keys(PRESETS)) out.profiles[p] = Object.assign({}, PRESETS[p], st && st.profiles && st.profiles[p]);
    // older versions had dimmer presets for the dark glass; bring untouched ones up to the brighter v2 values
    if (st && st.v !== 2) {
      const OLD = { calm: 0.5, user: 0.6, crazy: 0.8 };
      for (const p of Object.keys(OLD)) if (out.profiles[p].bgBrightness === OLD[p]) out.profiles[p].bgBrightness = PRESETS[p].bgBrightness;
    }
    out.v = 2;
    if (st && PRESETS[st.profile]) out.profile = st.profile;
    return out;
  }
  let lavaStore = loadLavaStore();
  const lava = Object.assign({}, lavaStore.shared, lavaStore.profiles[lavaStore.profile]);
  const CONFIG = lava;
  let lavaSaveTimer = 0;
  const saveLava = () => {
    clearTimeout(lavaSaveTimer);
    lavaSaveTimer = setTimeout(() => gmSet('lava', clone(lavaStore)), 250);
  };

  const GLASS_DEFAULTS = {
    tint: 0.04,         // faint white frost on the glass panes (0 = perfectly clear)
    blur: 0,            // px frosted blur behind the panes; 0 = clear glass (and the fastest)
    radius: 16,         // px card corners
    chrome: 0.5,        // frost on the header and sidebars, 0-1 (the header needs some: posts scroll under it)
    edges: true,        // a thin bright edge around each glass pane
    textShadow: true,   // soft shadow under text, for readability over bright lava
    cleanup: true,      // look for leftover solid backgrounds and clear them
    clearVideo: true,   // see-through bars around videos instead of black
  };
  // v2 = clear glass. Settings saved by the old dark-glass version are not carried over.
  const glassSaved = gmGet('glass', {});
  const glass = Object.assign({}, GLASS_DEFAULTS, glassSaved && glassSaved.v === 2 ? glassSaved : {});
  if (typeof glass.chrome !== 'number') glass.chrome = glass.chrome ? 0.6 : GLASS_DEFAULTS.chrome;
  const saveGlass = () => gmSet('glass', Object.assign({}, glass, { v: 2 }));

  const GEN_DEFAULTS = { titleColor: true, titleTone: 'dark', seekColor: true, seekTone: 'bright' };
  const gen = Object.assign({}, GEN_DEFAULTS, gmGet('general', {}));
  const saveGen = () => gmSet('general', Object.assign({}, gen));

  const RD_DEFAULTS = {
    commentSort: '',        // '' = Reddit's choice | confidence | top | new | controversial | old | qa
    autoExpand: false,      // open "more replies" as you scroll to them
    hideRightSidebar: false,
    hideFooter: false,      // the Reddit Rules / Privacy Policy / © links in the right sidebar
    videoQuality: 'best',   // best | auto | 1080 | 720 | 480
  };
  const rd = Object.assign({}, RD_DEFAULTS, gmGet('reddit', {}));
  const saveRd = () => gmSet('reddit', Object.assign({}, rd));

  const log = (...a) => lava.debug && console.log('[molten]', ...a);

  // =====================================================================
  //  Lava layers: art (two, for crossfades) + video canvas + blobs
  // =====================================================================
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
  addStyle(CSS_YT);

  const SEL_ART = 'div.molten-art';
  const SEL_VIDEO = 'canvas.lava-video';
  const SEL_BLOBS = 'div.lava-blobs';
  const SEL_BEFORE = SEL_ART;   // names used by the shared motion generator
  const SEL_AFTER = SEL_BLOBS;

  const overridesEl = makeStyle('');
  function writeOverrides() {
    let css =
      ':root{' +
      '--bg-blur:calc(' + CONFIG.bgBlur + ' * 100px);' +
      '--bg-brightness:' + CONFIG.bgBrightness + ';' +
      '--bg-saturate:' + CONFIG.bgSaturate + ';' +
      '--bg-scale:' + CONFIG.bgScale + ';' +
      '--bg-swirl-steps:' + Math.max(1, Math.round(CONFIG.blobSteps)) + ';' +
      '}';
    if (!CONFIG.blobs) css += SEL_BLOBS + '{display:none!important}';
    overridesEl.textContent = css;
  }
  writeOverrides();

  addStyle(
    SEL_ART + ',' + SEL_VIDEO + '{position:fixed;top:-15%;left:-15%;width:130%;height:140vh;pointer-events:none;' +
    'filter:blur(var(--bg-blur)) saturate(var(--bg-saturate)) brightness(var(--bg-brightness));' +
    'transform:scale(var(--bg-scale));transform-origin:center center;' +
    'animation:lava-pulse 10s ease-in-out infinite,lava-drift 15s ease-in-out infinite,lava-tilt 20s ease-in-out infinite;' +
    'animation-composition:add;will-change:transform}' +
    SEL_ART + '{z-index:-52;background:var(--molten-art-img) center/cover no-repeat #111;opacity:0;transition:opacity .9s ease}' +
    SEL_ART + '.on{opacity:1}' +
    SEL_VIDEO + '{z-index:-50;object-fit:cover;opacity:0;transition:opacity .6s ease}' +
    SEL_VIDEO + '.on{opacity:1}' +
    'html:not([data-molten-on]) ' + SEL_ART + ',html:not([data-molten-on]) ' + SEL_VIDEO + ',' +
    'html:not([data-molten-on]) ' + SEL_BLOBS + '{display:none!important}' +
    'html[data-molten-on] ' + SEL_BLOBS + '{display:block}' +
    'html[data-molten-scrolling] ' + SEL_ART + ',html[data-molten-scrolling] ' + SEL_VIDEO + ',html[data-molten-scrolling] ' + SEL_BLOBS +
    '{animation-play-state:paused!important}'
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
    if (!force && (!CONFIG.randomize || !CONFIG.reseedPerSong || !CONFIG.blobs || !lavaActive())) return;
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


  /* ---------- art sources ---------- */
  // Built-in fallback art (generated, so the lava always has something to melt).
  function fallbackArt() {
    const c = document.createElement('canvas');
    c.width = c.height = 400;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 400, 400);
    g.addColorStop(0, '#3a0a1e'); g.addColorStop(1, '#8a2a12');
    x.fillStyle = g; x.fillRect(0, 0, 400, 400);
    const dots = ['#ff9a3d', '#ff4f6d', '#ffd166', '#c13cff', '#ff7a1a'];
    let s = 99;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 12; i++) {
      const col = dots[i % dots.length], cx = r() * 400, cy = r() * 400, rad = 40 + r() * 130;
      const rg = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      rg.addColorStop(0, col); rg.addColorStop(1, col + '00');
      x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill();
    }
    return c.toDataURL('image/jpeg', 0.9);
  }
  const FALLBACK = fallbackArt();

  const isHttp = s => typeof s === 'string' && /^https?:/i.test(s);
  const SKIP_IMG = /avatar|snoovatar|communityicon|emoji|award|icon_|\/icon|redditstatic\.com\/(?!.*banner)|flair/i;
  // a post you opened: /comments/<id>/... (a profile's Comments tab, /user/name/comments/, is not one)
  const isPostPage = () => /\/comments\/[a-z0-9]+(\/|$)/i.test(location.pathname);
  // someone's profile: opening it is a deliberate choice, like opening a post
  const isProfile = () => /^\/(user|u)\/[^/]+/i.test(location.pathname) && !isPostPage();

  // Best picture inside one post: its video poster, else its largest real image.
  function postArt(post) {
    if (!post) return '';
    const players = post.querySelectorAll('shreddit-player, shreddit-player-2, [poster]');
    for (const p of players) {
      const poster = p.getAttribute('poster') || p.getAttribute('preview');
      if (isHttp(poster)) return poster;
    }
    let best = '', bestArea = 0;
    for (const img of post.querySelectorAll('img')) {
      const src = img.currentSrc || img.src;
      if (!isHttp(src) || SKIP_IMG.test(src)) continue;
      const r = img.getBoundingClientRect();
      const area = r.width * r.height;
      if (r.width < 80 || r.height < 60) continue;
      if (area > bestArea) { best = src; bestArea = area; }
    }
    return best;
  }
  function subredditArt() {
    let best = '', bestArea = 0;
    for (const img of document.querySelectorAll('img')) {
      const src = img.currentSrc || img.src;
      if (!isHttp(src) || !/styles\.redditmedia\.com|communityIcon|banner/i.test(src)) continue;
      const r = img.getBoundingClientRect();
      const area = Math.max(1, r.width * r.height);
      if (area > bestArea) { best = src; bestArea = area; }
    }
    return best;
  }
  // The post closest to the middle of the screen that has a picture.
  function centerPost() {
    const mid = window.innerHeight / 2;
    let best = null, bestD = Infinity;
    for (const p of document.querySelectorAll('shreddit-post')) {
      const r = p.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight || r.height < 40) continue;
      const d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  }
  function currentArt() {
    if (isPostPage()) {
      const main = [...document.querySelectorAll('main shreddit-post, shreddit-post')].find(p => !p.closest('shreddit-comment, shreddit-comment-tree')) || null;
      const a = postArt(main);
      if (a) return a;
    } else if (lava.followScroll) {
      const a = postArt(centerPost());
      if (a) return a;
    }
    return subredditArt() || '';
  }

  /* ---------- art layers with crossfade ---------- */
  let artNow = '';
  let artFlip = 0;
  let artToken = 0;
  function artLayers() {
    const list = document.body ? [...document.body.querySelectorAll(':scope > ' + SEL_ART)] : [];
    while (document.body && list.length < 2) {
      const d = document.createElement('div');
      d.className = 'molten-art';
      d.setAttribute('aria-hidden', 'true');
      document.body.prepend(d);
      list.push(d);
    }
    return list;
  }
  function setArt(url) {
    if (!url) url = FALLBACK;
    if (url === artNow) return;
    const token = ++artToken;
    const show = () => {
      if (token !== artToken) return;
      const layers = artLayers();
      if (layers.length < 2) return;
      artFlip = 1 - artFlip;
      const next = layers[artFlip], prev = layers[1 - artFlip];
      next.style.setProperty('--molten-art-img', 'url("' + url.replace(/"/g, '%22') + '")');
      next.classList.add('on');
      prev.classList.remove('on');
      artNow = url;
      TITLE.fromUrl(url);
      log('art:', url.slice(0, 90));
    };
    if (url.startsWith('data:')) return show();
    const probe = new Image();
    probe.onload = show;
    probe.onerror = () => { if (token === artToken && !artNow) setArt(FALLBACK); };
    probe.src = url;
  }
  let artTimer = 0;
  function scheduleArt(delay = 350) {
    clearTimeout(artTimer);
    artTimer = setTimeout(() => { if (ENABLED && lava.on) setArt(currentArt()); }, delay);
  }

  /* ---------- video background ---------- */
  const vs = {
    key: '', on: false, drawn: false, lastTime: -1, nextSample: 0,
    union: null, samples: 0, rect: null, lastEnsure: 0, lastClean: 0,
    buf: null, bctx: null, small: null, sctx: null, cropBroken: false,
  };
  let vCanvas = null;

  // Playing videos live inside Reddit's player components (shadow DOM). Looking them up is kept cheap:
  // only player components are opened, and the list is refreshed every 1.5 s, not every frame.
  let videoList = [];
  let videoScanAt = 0;
  const PLAYERS = 'shreddit-player, shreddit-player-2, shreddit-media-lightbox-listener, shreddit-dynamic-ad-link';
  // components whose insides get the glass colors (comments, posts, the comment box, action rows)
  const hostLooks = new WeakMap();
  const SHADOW_HOSTS = 'shreddit-comment, shreddit-comment-tree, shreddit-post, shreddit-comment-action-row, ' +
    'comment-composer-host, shreddit-composer, faceplate-textarea-input, shreddit-async-loader, faceplate-search-input';
  /* ---------- One shared stylesheet for Reddit's sealed-off (shadow DOM) parts ----------
     Page styles can't reach inside Reddit's components, so a single stylesheet object is shared into
     each component's shadow root, once (it's adopted, not copied, so a thousand comments cost nothing
     extra). Changing a setting rewrites that one sheet and every component updates at once. */
  /* Leftover dark bits Reddit paints with fixed colors inside its components: thin dark lines
     (thread lines) turn white, small dark circles (the vote arrows' orbs) go clear inside a pill,
     or white glass on their own. Each component is checked on its first few scans only. */
  const MARK_CSS = chip =>
    '[data-molten-line]{border-color:rgba(255,255,255,.32)!important}' +
    '[data-molten-line="bg"]{background-color:rgba(255,255,255,.32)!important}' +
    '[data-molten-orb]{background-color:transparent!important}' +
    '[data-molten-orb="chip"]{background-color:' + chip + '!important}' +
    '[data-molten-pre]::before{background-color:rgba(255,255,255,.32)!important;border-color:rgba(255,255,255,.32)!important}' +
    '[data-molten-post]::after{background-color:rgba(255,255,255,.32)!important;border-color:rgba(255,255,255,.32)!important}' +
    '[data-molten-line="grad"]{background-image:linear-gradient(90deg,transparent calc(50% - .5px),rgba(255,255,255,.32) calc(50% - .5px),' +
      'rgba(255,255,255,.32) calc(50% + .5px),transparent calc(50% + .5px))!important}' +
    // one pill = one piece of glass: the arrow / icon buttons inside it stay clear
    '.button-secondary,.button-bordered{background-color:' + chip + '!important;box-shadow:none!important}' +
    '.button-secondary .button-secondary,.button-secondary .button,.button-bordered .button,.rpl-vote-button-group button,' +
    '[class*="button-group"] button{background-color:transparent!important;box-shadow:none!important}' +
    '.button-secondary .button:hover,.rpl-vote-button-group button:hover{background-color:rgba(255,255,255,.14)!important}';
  function darkOf(s) {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(s);
    if (!m) return false;
    const a = m[4] === undefined ? 1 : +m[4];
    return a >= 0.15 && 0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3] < 120;
  }
  const NOT_SURFACE = 'img,video,canvas,svg,picture,input,textarea,a,p,span:not([class]),faceplate-img,shreddit-player,shreddit-player-2';
  const THREAD = '[class*="threadline"],[class*="thread-line"],[class*="branchline"],[data-testid*="thread"],[class*="treeline"]';
  function pseudoLine(e, which) {
    const ps = getComputedStyle(e, which);
    if (!ps.content || ps.content === 'none') return false;
    const w = parseFloat(ps.width) || 0, h = parseFloat(ps.height) || 0;
    const thin = (w > 0 && w <= 3) || (h > 0 && h <= 3);
    const border = ['Top', 'Right', 'Bottom', 'Left'].some(k => parseFloat(ps['border' + k + 'Width']) > 0 && darkOf(ps['border' + k + 'Color']));
    return border || (thin && darkOf(ps.backgroundColor));
  }
  function threadLines(root) {
    for (const t of root.querySelectorAll(THREAD)) {
      if (t.textContent.trim()) continue;
      if (!t.hasAttribute('data-molten-pre') && pseudoLine(t, '::before')) t.setAttribute('data-molten-pre', '');
      if (!t.hasAttribute('data-molten-post') && pseudoLine(t, '::after')) t.setAttribute('data-molten-post', '');
      const bi = getComputedStyle(t).backgroundImage;
      if (bi && /gradient/.test(bi) && !t.hasAttribute('data-molten-line')) t.setAttribute('data-molten-line', 'grad');
      sweepList([t, ...t.querySelectorAll('*')]);
    }
  }
  const sweep = root => { sweepList(root.querySelectorAll('*')); threadLines(root); };
  function sweepList(list) {
    for (const e of list) {
      if (e.hasAttribute('data-molten-line') || e.hasAttribute('data-molten-orb') || e.matches(NOT_SURFACE)) continue;
      const cs = getComputedStyle(e);
      if (cs.display === 'none') continue;
      const r = e.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const bgDark = darkOf(cs.backgroundColor);
      if (bgDark && (r.width <= 3 || r.height <= 3) && Math.max(r.width, r.height) >= 6) { e.setAttribute('data-molten-line', 'bg'); continue; }
      const borderDark = ['Top', 'Right', 'Bottom', 'Left'].some(k => parseFloat(cs['border' + k + 'Width']) > 0 &&
        cs['border' + k + 'Style'] !== 'none' && darkOf(cs['border' + k + 'Color']));
      if (borderDark && !e.textContent.trim()) e.setAttribute('data-molten-line', '');
      if (bgDark && r.width <= 64 && r.height <= 64) {
        // inside a pill: clear, so the pill reads as one piece
        let p = e.parentElement || (e.parentNode && e.parentNode.host), inPill = false;
        for (let i = 0; p && i < 4; i++, p = p.parentElement) {
          const pc = getComputedStyle(p).backgroundColor;
          if (!/rgba\(0, 0, 0, 0\)|transparent/.test(pc)) { inPill = true; break; }
        }
        e.setAttribute('data-molten-orb', inPill ? '' : 'chip');
      }
    }
  }

  const SHADOW = (() => {
    let sheet = null;
    try { sheet = new CSSStyleSheet(); } catch (e) { sheet = null; }
    const done = new WeakSet();
    const fallback = new Set();
    let seekColor = '';
    let tokens = '';
    let chip = 'rgba(255,255,255,.18)';
    function css() {
      if (!ENABLED) return '';
      let c =
        // Reddit re-declares its colors inside its components, so the glass colors are set here too
        (tokens ? ':host,*{' + tokens + '}' : '') +
        // comment thread connectors are painted with the page color to hide the line under them; lines go white
        '.branchline{background:transparent!important;background-color:transparent!important}' +
        '.branchline,.threadline,[class*="threadline"],[class*="thread-line"]{border-color:rgba(255,255,255,.32)!important}' +
        // vote / comment / share pills and the comment box: white glass, not grey
        '.button-secondary,.button-bordered,[class*="bg-secondary-background"]{background-color:' + chip + '!important}' +
        '[part="container"],.input-container,textarea{background-color:transparent!important}' +
        MARK_CSS(chip) +
        // the "Suggested videos" screen at the end of a video: frosted glass over the last frame, white glass cards
        ':host div.recommendation-overlay,.recommendation-overlay{background:rgba(255,255,255,.07)!important;-webkit-backdrop-filter:blur(22px) saturate(1.35)!important;' +
          'backdrop-filter:blur(22px) saturate(1.35)!important;text-shadow:0 1px 3px rgba(0,0,0,.45)}' +
        '.recommendation-overlay a,.overlay-recommendations a{background:' + chip + '!important;border-color:rgba(255,255,255,.3)!important;' +
          'border-radius:14px!important}' +
        '.recommendation-overlay a:hover,.overlay-recommendations a:hover{background:rgba(255,255,255,.28)!important}' +
        '.recommendation-overlay [class*="text-coolgray"]{color:rgba(255,255,255,.85)!important}' +
        '.recommendation-overlay h3,.recommendation-overlay [class*="text-coolgray-200"]{color:#fff!important}';
      if (glass.clearVideo) {
        c += ':host,:host>div,video,[class*="container"],[class*="wrapper"],[part*="container"],[part*="video"]{' +
          'background-color:transparent!important;--color-media-background:transparent!important}' +
          'video{background:transparent!important}';
      }
      if (seekColor) c += 'shreddit-progress-bar{--slider-fill:' + seekColor + '!important}';
      return c;
    }
    function apply(sr) {
      if (!sr || done.has(sr)) return;
      done.add(sr);
      if (sheet) {
        try { sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, sheet]; return; } catch (e) { /* fall back below */ }
      }
      const st = document.createElement('style');
      st.textContent = css();
      sr.appendChild(st);
      fallback.add(st);
    }
    function refresh() {
      const c = css();
      if (sheet) { try { sheet.replaceSync(c); } catch (e) { /* ignore */ } }
      for (const st of [...fallback]) { if (st.isConnected) st.textContent = c; else fallback.delete(st); }
    }
    function setSeek(color) { if (color !== seekColor) { seekColor = color; refresh(); } }
    function setTokens(t, c) { if (t !== tokens || c !== chip) { tokens = t; chip = c; refresh(); } }
    refresh();
    return { apply, refresh, setSeek, setTokens };
  })();
  const refreshPlayerSheets = () => SHADOW.refresh();

  // One pass every 1.5 s: share the sheet into new players and comments, collect videos, set quality.
  // when a video ends Reddit shows its suggestions screen; style it straight away, not on the next scan
  const endWatched = new WeakSet();
  function watchEnd(v) {
    if (endWatched.has(v)) return;
    endWatched.add(v);
    const again = () => { for (const t of [30, 250, 800]) setTimeout(() => { if (ENABLED) scanPlayers(); }, t); };
    v.addEventListener('ended', again);
    v.addEventListener('emptied', again);
  }
  function scanPlayers() {
    const list = [...document.querySelectorAll('video')];
    // every part inside a player, however deep (the end-of-video suggestions screen sits a few levels in)
    const walk = (sr, depth) => {
      SHADOW.apply(sr);
      for (const v of sr.querySelectorAll('video')) { list.push(v); watchEnd(v); }
      if (depth >= 5) return;
      for (const inner of sr.querySelectorAll('*')) if (inner.shadowRoot) walk(inner.shadowRoot, depth + 1);
    };
    for (const h of document.querySelectorAll(PLAYERS)) if (h.shadowRoot) walk(h.shadowRoot, 0);
    // and the parts the videos themselves sit in, in case Reddit wraps the player in something new
    for (const v of list) {
      let root = v.getRootNode();
      for (let i = 0; root && root !== document && i < 6; i++) { SHADOW.apply(root); root = root.host && root.host.getRootNode(); }
    }
    for (const c of document.querySelectorAll(SHADOW_HOSTS)) {
      const sr = c.shadowRoot;
      if (!sr) continue;
      SHADOW.apply(sr);
      // parts nested one level deeper: looked for on the first few scans only (they render soon after)
      const n = hostLooks.get(c) || 0;
      if (n >= 3) continue;
      hostLooks.set(c, n + 1);
      for (const inner of sr.querySelectorAll('*')) if (inner.shadowRoot) { SHADOW.apply(inner.shadowRoot); if (ENABLED) sweep(inner.shadowRoot); }
      if (ENABLED && n >= 1) {   // after the colors above have settled
        sweep(sr);
        // comment pieces outside the component that carry no text (thread lines, connectors)
        sweepList([...c.querySelectorAll(':scope > div, :scope > span')].filter(e => !e.textContent.trim()));
        threadLines(c);
      }
    }
    if (ENABLED && glass.clearVideo) clearAroundPlayers();
    videoList = list;
    QUALITY.apply();
  }

  /* The black around a narrow (portrait) video is painted by the boxes wrapped around the player, not by
     the player itself: e.g. a bg-black wrapper, or the paused-frame picture behind the video. Walk up from
     each player to its post and clear any solid black box on the way. Each player is checked once. */
  const clearedPlayers = new WeakSet();
  function clearAroundPlayers() {
    for (const h of document.querySelectorAll('shreddit-player, shreddit-player-2')) {
      if (clearedPlayers.has(h)) continue;
      clearedPlayers.add(h);
      for (let e = h, i = 0; e && i < 8 && e.tagName !== 'SHREDDIT-POST' && e !== document.body; e = e.parentElement, i++) {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(getComputedStyle(e).backgroundColor);
        if (m && (m[4] === undefined || +m[4] > 0.5) && +m[1] < 40 && +m[2] < 40 && +m[3] < 40) e.setAttribute('data-molten-vclear', '');
      }
    }
  }

  /* ---------- Video quality ----------
     Reddit lists every MP4 it has for a video in the player's packaged-media-json attribute, then picks
     one for you. "Best" (or a cap) switches the player to the one you want, keeping your place. */
  const QUALITY = (() => {
    const done = new WeakMap(); // video -> { url, at }
    const original = new Map(); // video we switched -> the file Reddit picked for it
    const file = u => { try { return new URL(u, location.href).pathname; } catch (e) { return u; } };
    // swap a video's file without losing its place, sound setting or play state
    function swap(v, url) {
      const t = v.currentTime, playing = !v.paused, muted = v.muted;
      v.src = url;
      v.addEventListener('loadedmetadata', () => {
        try { if (t > 0) v.currentTime = t; v.muted = muted; } catch (e) { /* ignore */ }
        if (playing) v.play().catch(() => { /* ignore */ });
      }, { once: true });
    }
    // Auto (or Molten off): give every video we switched its own file back
    function restore() {
      for (const [v, url] of original) {
        original.delete(v);
        done.delete(v);
        if (!v.isConnected) continue;
        const cur = v.currentSrc || v.getAttribute('src') || '';
        if (file(cur) !== file(url)) { swap(v, url); log('video quality -> back to Reddit\'s choice'); }
      }
    }
    function apply() {
      for (const v of original.keys()) if (!v.isConnected) original.delete(v);
      if (!ENABLED || !rd.videoQuality || rd.videoQuality === 'auto') { if (original.size) restore(); return; }
      const cap = { best: 1e9, '1080': 1080, '720': 720, '480': 480 }[rd.videoQuality] || 1e9;
      for (const h of document.querySelectorAll('shreddit-player, shreddit-player-2')) {
        const json = h.getAttribute('packaged-media-json');
        if (!json || !h.shadowRoot) continue;
        let opts;
        try {
          opts = JSON.parse(json).playbackMp4s.permutations.map(p => p.source).filter(s => s && s.url && s.dimensions);
        } catch (e) { continue; }
        if (!opts.length) continue;
        const side = s => Math.min(s.dimensions.width, s.dimensions.height); // "720p" = the short side
        opts.sort((a, b) => side(b) - side(a));
        const pick = opts.find(s => side(s) <= cap) || opts[opts.length - 1];
        const v = h.shadowRoot.querySelector('video');
        if (!v) continue;
        const cur = v.currentSrc || v.getAttribute('src') || '';
        if (!/packaged-media/.test(cur) || file(cur) === file(pick.url)) continue;
        const rec = done.get(v);
        if (rec && rec.url === pick.url && Date.now() - rec.at < 15000) continue; // Reddit fought back: don't loop
        done.set(v, { url: pick.url, at: Date.now() });
        if (!original.has(v)) original.set(v, cur);
        swap(v, pick.url);
        log('video quality ->', side(pick) + 'p');
      }
    }
    return { apply };
  })();

  /* ---------- Black-bar crop from the poster ----------
     Reddit's MP4 videos are served without permission to read their pixels, so the live crop can't look
     at the video. The poster (its first frame) can be fetched and measured instead, once per video. */
  const posterCrops = new Map(); // poster url -> fractions | null | 'pending'
  function barsOf(img) {
    const W = 64, H = Math.max(8, Math.round(64 * (img.naturalHeight || img.height) / (img.naturalWidth || img.width)));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data;
    const col = new Float32Array(W), row = new Float32Array(H);
    for (let y = 0; y < H; y++) for (let k = 0; k < W; k++) {
      const i = (y * W + k) * 4, l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      col[k] += l / H; row[y] += l / W;
    }
    const T = 18;
    let x0 = 0, x1 = W - 1, y0 = 0, y1 = H - 1;
    while (x0 < x1 && col[x0] <= T) x0++;
    while (x1 > x0 && col[x1] <= T) x1--;
    while (y0 < y1 && row[y0] <= T) y0++;
    while (y1 > y0 && row[y1] <= T) y1--;
    const sw = (x1 - x0 + 1) / W, sh = (y1 - y0 + 1) / H;
    if (sw < 0.35 || sh < 0.35 || (sw > 0.97 && sh > 0.97)) return null;
    return { sx: x0 / W, sy: y0 / H, sw, sh };
  }
  function posterOf(v) {
    const host = v.getRootNode && v.getRootNode().host;
    return v.poster || (host && host.getAttribute('poster')) || '';
  }
  function posterCrop(url) {
    if (!isHttp(url)) return null;
    const c = posterCrops.get(url);
    if (c !== undefined) return c === 'pending' ? null : c;
    posterCrops.set(url, 'pending');
    TITLE.image(url).then(img => posterCrops.set(url, img ? barsOf(img) : null)).catch(() => posterCrops.set(url, null));
    return null;
  }
  function videos() {
    const now = Date.now();
    if (now - videoScanAt > 1500) { videoScanAt = now; scanPlayers(); }
    return videoList;
  }
  // the page element a video belongs to (videos sit inside Reddit's sealed-off player parts)
  function pageHost(n) {
    for (let i = 0; n && i < 8; i++) {
      const root = n.getRootNode();
      if (root === document) return n;
      n = root.host;
    }
    return n;
  }
  const inComments = v => { const h = pageHost(v); return !!(h && h.closest && h.closest('shreddit-comment, shreddit-comment-tree, #comment-tree')); };
  function findVideo() {
    if (lava.videoSource === 'off') return null;
    if (lava.videoSource === 'post' && !isPostPage() && !isProfile()) return null;
    const W = window.innerWidth, H = window.innerHeight;
    const post = isPostPage();
    let best = null, bestArea = 0;
    for (const v of videos()) {
      if (!v.isConnected || !(v.videoWidth > 16 && v.videoHeight > 16 && v.readyState >= 2)) continue;
      // a paused (or finished) video keeps its frame in the lava, but only the one already showing;
      // pausing doesn't swap the lava back to the thumbnail
      if ((v.paused || v.ended) && v !== lastVideoEl) continue;
      // on a post page only the post's own video counts, never GIFs / videos in the comments,
      // and it keeps driving the lava while you scroll down through the comments
      if (post) {
        const h = pageHost(v);
        if (inComments(v) || !(h && h.closest && h.closest('shreddit-post'))) continue;
        return v;
      }
      const r = v.getBoundingClientRect();
      const area = Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0));
      // only a video that's mostly on screen takes over (not one just peeking in at the bottom)
      if (area < 0.5 * r.width * r.height || area < 20000) continue;
      if (area > bestArea) { best = v; bestArea = area; }
    }
    return best;
  }
  function ensureLayers() {
    if (!document.body) return;
    artLayers();
    if (!vCanvas || !vCanvas.isConnected) {
      vCanvas = document.body.querySelector(':scope > ' + SEL_VIDEO) || document.createElement('canvas');
      vCanvas.className = 'lava-video' + (vs.on ? ' on' : '');
      vCanvas.width = 128; vCanvas.height = 72;
      vCanvas.setAttribute('aria-hidden', 'true');
      document.body.prepend(vCanvas);
    }
    if (!document.body.querySelector(':scope > ' + SEL_BLOBS)) {
      const d = document.createElement('div');
      d.className = 'lava-blobs';
      d.setAttribute('aria-hidden', 'true');
      document.body.prepend(d);
    }
  }
  function removeLayers() {
    for (const n of document.querySelectorAll(SEL_ART + ',' + SEL_VIDEO + ',' + SEL_BLOBS)) n.remove();
    vCanvas = null;
    artNow = '';
    vs.drawn = false;
  }
  function setVideoOn(on) {
    if (on === vs.on) return;
    vs.on = on;
    if (vCanvas) vCanvas.classList.toggle('on', on);
    log('video background', on ? 'ON' : 'OFF');
  }
  function resetCrop() { vs.union = null; vs.samples = 0; vs.rect = null; vs.nextSample = 0; }

  function sampleCrop(v) {
    const W = 64;
    const H = Math.max(8, Math.round(W * v.videoHeight / v.videoWidth));
    if (!vs.small) {
      vs.small = document.createElement('canvas');
      vs.sctx = vs.small.getContext('2d', { willReadFrequently: true });
    }
    if (vs.small.width !== W || vs.small.height !== H) { vs.small.width = W; vs.small.height = H; }
    vs.sctx.drawImage(v, 0, 0, W, H);
    let d;
    try { d = vs.sctx.getImageData(0, 0, W, H).data; } catch (e) { vs.cropBroken = true; return; }
    const col = new Float32Array(W), row = new Float32Array(H);
    let total = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        col[x] += l / H; row[y] += l / W; total += l;
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
    vs.union = u ? { x0: Math.min(u.x0, x0), x1: Math.max(u.x1, x1), y0: Math.min(u.y0, y0), y1: Math.max(u.y1, y1) } : { x0, x1, y0, y1 };
    vs.samples++;
    if (vs.samples < 3) return;
    const b = vs.union, bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    if (bw < W * 0.35 || bh < H * 0.35) { vs.rect = null; return; }
    const sx = b.x0 / W, sy = b.y0 / H, sw = bw / W, sh = bh / H;
    if (sw > 0.97 && sh > 0.97) { vs.rect = null; return; }
    vs.rect = { sx: sx * v.videoWidth, sy: sy * v.videoHeight, sw: sw * v.videoWidth, sh: sh * v.videoHeight };
  }

  function drawVideo(v) {
    const key = (v.currentSrc || '') + '|' + v.videoWidth + 'x' + v.videoHeight;
    if (key !== vs.key) { vs.key = key; resetCrop(); vs.drawn = false; }
    const now = performance.now();
    const crop = CONFIG.videoCropBars && !vs.cropBroken;
    if (crop && now >= vs.nextSample) { sampleCrop(v); vs.nextSample = now + (vs.samples < 12 ? 1000 : 4000); }
    let r = (crop && vs.rect) || null;
    if (!r && CONFIG.videoCropBars && vs.cropBroken) {
      const f = posterCrop(posterOf(v));
      if (f) r = { sx: f.sx * v.videoWidth, sy: f.sy * v.videoHeight, sw: f.sw * v.videoWidth, sh: f.sh * v.videoHeight };
    }
    r = r || { sx: 0, sy: 0, sw: v.videoWidth, sh: v.videoHeight };
    const bw = Math.max(8, Math.min(1024, Math.round(CONFIG.videoWidth) || 128));
    const bh = Math.min(512, Math.max(16, Math.round(bw * r.sh / r.sw)));
    if (!vs.buf) { vs.buf = document.createElement('canvas'); vs.bctx = vs.buf.getContext('2d'); }
    if (vs.buf.width !== bw || vs.buf.height !== bh) { vs.buf.width = bw; vs.buf.height = bh; }
    vs.bctx.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, bw, bh);
    if (vCanvas) {
      if (vCanvas.width !== bw || vCanvas.height !== bh) { vCanvas.width = bw; vCanvas.height = bh; }
      vCanvas.getContext('2d').drawImage(vs.buf, 0, 0);
    }
    vs.lastTime = v.currentTime;
    vs.drawn = true;
  }

  /* ---------- on/off ---------- */
  const lavaActive = () => ENABLED && lava.on;
  function applyRootState() {
    document.documentElement.toggleAttribute('data-molten-on', lavaActive());
    document.documentElement.toggleAttribute('data-molten-glass', ENABLED);
  }

  let vTimer = 0;
  let scrolling = false;
  let lastVideoEl = null;
  function videoTick() {
    clearTimeout(vTimer);
    let delay = 1000;
    try {
      const now = Date.now();
      if (now - vs.lastEnsure > 1000) {
        vs.lastEnsure = now;
        ensureToggle();
        if (lavaActive()) ensureLayers();
      }
      if (!ENABLED) { vTimer = setTimeout(videoTick, 2000); return; }
      if (glass.cleanup && !document.hidden && !scrolling && now - vs.lastClean > 2500) { vs.lastClean = now; GLASS.clean(); }
      if (now - videoScanAt > 1500) { videoScanAt = now; scanPlayers(); }
      const v = lavaActive() ? findVideo() : null;
      setVideoOn(!!v);
      if (v !== lastVideoEl) {
        lastVideoEl = v;
        // a video's poster is the best color source for the title bar while it plays
        const host = v && (v.getRootNode().host || v.closest('shreddit-player, shreddit-player-2'));
        const poster = host && (host.getAttribute('poster') || '');
        if (v && isHttp(poster)) TITLE.fromUrl(poster);
        else if (!v && artNow) TITLE.fromUrl(artNow);
      }
      if (v && !document.hidden) {
        delay = (v.paused || v.ended) ? 300 : Math.round(1000 / Math.max(1, Math.min(60, CONFIG.videoFps || 15)));
        if (!vs.drawn || v.currentTime !== vs.lastTime) drawVideo(v);
      }
    } catch (e) {
      log('video loop error:', e && e.message);
    }
    vTimer = setTimeout(videoTick, delay);
  }

  function lavaLive(key) {
    writeOverrides();
    if (key === 'randomize' || key === 'blobs') { applyArt(); applyBlobs(); }
    if (key === 'motionSpeed' || key === 'motionAmount') {
      cancelAnimationFrame(motionFrame);
      motionFrame = requestAnimationFrame(() => { applyArt(); applyBlobs(); });
    }
    if (key === 'on') { applyRootState(); if (lava.on) { ensureLayers(); artNow = ''; scheduleArt(0); } else setVideoOn(false); }
    if (key === 'followScroll') scheduleArt(0);
    if (key === 'videoCropBars') { resetCrop(); vs.cropBroken = false; }
    if (key === 'videoSource' || key === 'videoWidth') { vs.drawn = false; videoTick(); }
  }
  let motionFrame = 0;
  function lavaSet(k, v) {
    if (PROFILE_KEYS.includes(k)) lavaStore.profiles[lavaStore.profile][k] = v;
    else lavaStore.shared[k] = v;
    lava[k] = v;
    lavaLive(k);
    saveLava();
  }
  function lavaUseStore(next) {
    lavaStore = next;
    const wasOn = lava.on;
    Object.assign(lava, lavaStore.shared, lavaStore.profiles[lavaStore.profile]);
    writeOverrides();
    applyArt();
    applyBlobs();
    if (wasOn !== lava.on) lavaLive('on');
  }
  function lavaSwitchProfile(p) { if (PRESETS[p]) { lavaStore.profile = p; lavaUseStore(lavaStore); saveLava(); } }
  function lavaResetProfile() { lavaStore.profiles[lavaStore.profile] = Object.assign({}, PRESETS[lavaStore.profile]); lavaUseStore(lavaStore); saveLava(); }
  function lavaResetShared() { lavaStore.shared = Object.assign({}, SHARED_DEFAULTS); lavaUseStore(lavaStore); saveLava(); }
  gmWatch('lava', () => { lavaUseStore(loadLavaStore()); UI.refresh(); });

  // =====================================================================
  //  Glass skin
  // =====================================================================
  const GLASS = (() => {
    const el = makeStyle('');

    // Is Reddit in light mode? (dark text on a light page)
    function isLight() {
      const h = document.documentElement;
      if (h.classList.contains('theme-light')) return true;
      if (h.classList.contains('theme-dark')) return false;
      const c = getComputedStyle(document.body || h).color;
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
      return m ? (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) < 128 : false;
    }

    /* Clear glass: nothing is painted dark. Surfaces are see-through with at most a faint white frost
       and a thin bright edge, text is white with a soft shadow, like writing etched on the glass of a
       lava lamp. Works the same in Reddit's light and dark modes. */
    function write() {
      const f = Math.max(0, Math.min(0.6, Number(glass.tint) || 0));
      const w = a => 'rgba(255,255,255,' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
      const frost = w(f);                       // cards
      const frostHi = w(f + 0.07);              // hover / selected
      const chip = w(Math.max(0.16, f + 0.14)); // buttons, chips, search: white, not grey
      const edge = glass.edges ? w(0.26 + f) : 'transparent'; // one crisp bright edge per pane
      const line = 'rgba(255,255,255,.22)';     // Reddit's own lines (thread lines, dividers): white, fewer
      const ch = Math.max(0, Math.min(1, Number(glass.chrome) || 0)); // header + sidebar frost
      const chBlur = Math.round(ch * 28);
      const menu = 'rgba(255,255,255,.14)';     // popups: still glass, just blurred more so they read
      const blur = Math.max(0, Number(glass.blur) || 0);
      const bf = blur ? '-webkit-backdrop-filter:blur(' + blur + 'px) saturate(1.3);backdrop-filter:blur(' + blur + 'px) saturate(1.3);' : '';
      const R = Math.max(0, Number(glass.radius) || 0) + 'px';
      const G = 'html[data-molten-glass]';
      const clear = 'background:transparent!important;background-color:transparent!important;background-image:none!important;box-shadow:none!important;';
      const cardCss = 'background:' + frost + '!important;background-color:' + frost + '!important;' +
        'border:1px solid ' + edge + '!important;border-radius:' + R + '!important;box-shadow:none!important;';
      // Frosted card: the blur sits on a ::before layer, never on the element itself (backdrop-filter on an
      // element re-anchors everything fixed/sticky inside it, which broke the scrolling left sidebar).
      const frosted = sels => {
        const list = sels.map(x => G + ' ' + x);
        return list.join(',') + '{' + clear + 'isolation:isolate;position:relative;' +
          'border:1px solid ' + edge + '!important;border-radius:' + R + '!important}' +
          list.map(x => x + '::before').join(',') + '{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;' +
          'border-radius:inherit;background:' + frost + ';' + bf + '}';
      };
      const tokens =
        '--color-neutral-background:transparent!important;' +
        '--color-neutral-background-weak:' + frost + '!important;' +
        '--color-neutral-background-strong:' + frost + '!important;' +
        '--color-neutral-background-container:' + frost + '!important;' +
        '--color-neutral-background-container-strong:' + frost + '!important;' +
        '--color-neutral-background-container-hover:' + frostHi + '!important;' +
        '--color-neutral-background-hover:' + frostHi + '!important;' +
        '--color-neutral-background-selected:' + frostHi + '!important;' +
        '--color-neutral-background-pressed:' + frostHi + '!important;' +
        '--color-secondary-background:' + chip + '!important;' +
        '--color-secondary-background-hover:' + frostHi + '!important;' +
        '--color-secondary-background-selected:' + frostHi + '!important;' +
        '--color-button-secondary-background:' + chip + '!important;' +
        '--color-button-secondary-background-hover:' + frostHi + '!important;' +
        '--color-button-secondary-background-pressed:' + frostHi + '!important;' +
        '--color-interactive-pressed:' + frostHi + '!important;' +
        '--color-media-background:transparent!important;' +
        // Reddit draws many thin grey lines that overlap the glass edges: keep the main ones (white), drop the weak ones
        '--color-neutral-border:' + line + '!important;' +
        '--color-neutral-border-weak:transparent!important;' +
        '--color-neutral-border-medium:' + line + '!important;'+
        '--color-neutral-content:#fff!important;' +
        '--color-neutral-content-strong:#fff!important;' +
        '--color-neutral-content-weak:rgba(255,255,255,.82)!important;' +
        '--color-secondary-plain:#fff!important;' +
        '--color-secondary-plain-weak:rgba(255,255,255,.82)!important;' +
        '--color-secondary-weak:rgba(255,255,255,.82)!important;' +
        '--color-secondary-onbackground:#fff!important;' +
        '--shreddit-content-background:transparent!important;' +
        '--color-tone-1:#fff!important;' +
        '--color-tone-2:rgba(255,255,255,.82)!important;' +
        '--color-tone-3:rgba(255,255,255,.7)!important;' +
        '--color-tone-4:rgba(255,255,255,.32)!important;' +
        '--color-tone-5:' + frostHi + '!important;' +
        '--color-tone-6:' + frost + '!important;' +
        '--color-tone-7:transparent!important';
      // the same tokens inside Reddit's sealed-off parts; there the faint lines are thread lines, so keep them (white)
      SHADOW.setTokens(tokens.replace('--color-neutral-border-weak:transparent!important;', '--color-neutral-border-weak:' + line + '!important;'),
        chip);
      const shadow = glass.textShadow ? '0 1px 3px rgba(0,0,0,.55),0 0 1px rgba(0,0,0,.35)' : 'none';

      let css =
        // 1) Reddit's own color tokens, on every element (Reddit re-declares them deeper in the page,
        //    e.g. on the header's .theme-beta). Backgrounds go clear, text goes white.
        G + ',' + G + ' *{' + tokens + '}' +
        // 2) The page itself is see-through so the lava shows everywhere
        G + '{background:#000!important;color:#fff}' +
        G + ' body{color:#fff;text-shadow:' + shadow + '}' +
        G + ' body,' + G + ' shreddit-app,' + G + ' .grid-container,' + G + ' .main-container,' + G + ' #main-content,' +
        G + ' main,' + G + ' shreddit-feed,' + G + ' [data-molten-clear],' + G + ' .branchline,' +
        G + ' #left-sidebar-container,' + G + ' flex-left-nav-container,' + G + ' nav[aria-label="Primary"],' + G + ' left-nav-top-section,' +
        G + ' reddit-sidebar-nav,' + G + ' #left-sidebar,' +
        G + ' #right-sidebar-container,' + G + ' #right-sidebar-contents,' + G + ' faceplate-partial,' +
        G + ' [slot="credit-bar"],' + G + ' #pdp-credit-bar,' +
        G + ' reddit-header-large > *,' + G + ' reddit-header-large header,' + G + ' reddit-header-large nav,' + G + ' reddit-header-small > *,' +
        G + ' shreddit-comment{' + clear + '}' +
        // 3) Posts and the comment area: clear glass panes with a bright edge
        frosted(['shreddit-post', 'shreddit-comment-tree', 'shreddit-ad-post']) +
        G + ' [data-molten-glass-card],' + G + ' aside.subreddit-right-rail-community-info{' + cardCss + '}' +
        G + ' shreddit-post{margin-bottom:10px}' +
        G + ' hr{border-color:transparent!important}' + MARK_CSS(chip) +
        G + ' reddit-header-large header{border-bottom-color:transparent!important}' +
        // inputs: search bar (inside reddit-search-large's shadow DOM), comment box
        G + ' reddit-search-large,' + G + ' faceplate-search-input{--color-input-background:transparent!important}' +
        G + ' faceplate-search-input::part(container){background:transparent!important}' +
        G + ' faceplate-search-input,' + G + ' shreddit-composer,' + G + ' comment-composer-host{background:' + chip + '!important;border-radius:' + R + '!important}' +
        G + ' textarea{background-color:transparent!important;color:#fff!important}' +
        // see-through video bars (player hosts; the shadow-DOM part is handled per player)
        (glass.clearVideo ? G + ' shreddit-player,' + G + ' shreddit-player-2,' + G + ' shreddit-aspect-ratio,' +
          G + ' [data-molten-vclear],' + G + ' shreddit-player img.preview-image,' + G + ' shreddit-player [slot="poster"],' +
          G + ' shreddit-player-2 [slot="poster"]{background:transparent!important;background-color:transparent!important}' : '') +
        // "watch next" cards when a video ends
        G + ' .recommendation-overlay{background:rgba(255,255,255,.07)!important;-webkit-backdrop-filter:blur(22px) saturate(1.35)!important;' +
          'backdrop-filter:blur(22px) saturate(1.35)!important}' +
        G + ' .overlay-recommendations a{background:' + chip + '!important;border-color:' + edge + '!important;' +
        '-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}' +
        // menus and dialogs: glass too, blurred harder so they stay readable over busy lava
        G + ' [role="menu"],' + G + ' [role="dialog"],' + G + ' faceplate-dropdown-menu [slot="menu"],' + G + ' faceplate-menu{' +
        'background:' + menu + '!important;border:1px solid ' + edge + '!important;border-radius:' + R + '!important;' +
        '-webkit-backdrop-filter:blur(26px) saturate(1.4)!important;backdrop-filter:blur(26px) saturate(1.4)!important}';
      // Header + sidebar frost. The header is fixed and posts scroll under it, so it gets a real blur
      // (on a ::before layer, so nothing inside it is affected); the sidebars get a white haze.
      if (ch > 0) {
        css += G + ' reddit-header-large{isolation:isolate}' +
          G + ' reddit-header-large::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;' +
          'background:' + w(0.04 + ch * 0.14) + ';-webkit-backdrop-filter:blur(' + chBlur + 'px) saturate(1.4);' +
          'backdrop-filter:blur(' + chBlur + 'px) saturate(1.4)}' +
          G + ' #left-sidebar-container,' + G + ' #right-sidebar-container > *{background:' + w(ch * 0.12) + '!important;border-radius:' + R + '}';
      }
      el.textContent = css;
    }

    /* Leftover solid backgrounds Reddit paints with fixed colors (not its tokens): find big opaque blocks
       under a few sample points and clear them. Runs every 2 s, only while the page is visible. */
    const SKIP = 'img,video,canvas,svg,button,input,textarea,shreddit-post,shreddit-comment,shreddit-player,shreddit-player-2,' +
      '[role="menu"],[role="dialog"],faceplate-menu,#ytt-panel,#ytt-toggle,.molten-art,.lava-blobs';
    function rgbaOf(s) {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(s);
      return m ? { a: m[4] === undefined ? 1 : +m[4], lum: 0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3] } : null;
    }
    function clean() {
      const W = window.innerWidth, H = window.innerHeight, light = isLight();
      const seen = new Set();
      for (const fx of [0.08, 0.3, 0.5, 0.7, 0.92]) {
        for (const fy of [0.15, 0.5, 0.85]) {
          for (const e of document.elementsFromPoint(fx * W, fy * H) || []) {
            if (seen.has(e)) continue;
            seen.add(e);
            if (e === document.documentElement || e === document.body || e.hasAttribute('data-molten-clear')) continue;
            if (e.hasAttribute('data-molten-glass-card') || e.matches(SKIP) || e.closest(SKIP)) continue; // content, keep looking underneath
            const r = e.getBoundingClientRect();
            const area = r.width * r.height;
            const big = area >= W * H * 0.06 || (r.height >= H * 0.5 && r.width >= 180);
            if (!big) continue;
            const c = rgbaOf(getComputedStyle(e).backgroundColor);
            if (!c || c.a < 0.85) continue;
            if (c.lum > 225 || c.lum < 60) {
              // page-sized blocks go clear; card-sized ones (sidebar boxes) become glass cards
              const cs = getComputedStyle(e);
              const pinned = /fixed|sticky/.test(cs.position) || /auto|scroll/.test(cs.overflowY);
              const card = !pinned && area < W * H * 0.35 && r.width < W * 0.6 && r.height < H * 0.9;
              e.setAttribute(card ? 'data-molten-glass-card' : 'data-molten-clear', '');
              log(card ? 'glassed' : 'cleared', 'solid background', e.tagName.toLowerCase() + (e.id ? '#' + e.id : ''));
            }
          }
        }
      }
    }
    function unclean() {
      for (const e of document.querySelectorAll('[data-molten-clear],[data-molten-glass-card]')) { e.removeAttribute('data-molten-clear'); e.removeAttribute('data-molten-glass-card'); }
    }

    // Text you can paste back to get the skin tuned for whatever Reddit changed.
    function report() {
      const out = ['Molten for Reddit layout report', location.pathname.replace(/\/comments\/.*/, '/comments/...').replace(/\/(user|u)\/[^/]+/i, '/user/...'),
        'html class: ' + document.documentElement.className, 'light mode: ' + isLight(), ''];
      const cs = getComputedStyle(document.documentElement);
      const vars = [];
      for (let i = 0; i < cs.length; i++) {
        const p = cs[i];
        if (p.startsWith('--') && /background|surface|container|neutral|tone/.test(p)) vars.push(p + ': ' + cs.getPropertyValue(p).trim());
      }
      out.push('Color variables (' + vars.length + '):', ...vars.slice(0, 120), '');
      out.push('Solid surfaces on screen:');
      const W = window.innerWidth, H = window.innerHeight, seen = new Set();
      for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        for (const fy of [0.1, 0.3, 0.5, 0.7, 0.9]) {
          for (const e of document.elementsFromPoint(fx * W, fy * H) || []) {
            if (seen.has(e)) continue;
            seen.add(e);
            const c = getComputedStyle(e).backgroundColor;
            const a = rgbaOf(c);
            if (!a || a.a < 0.5) continue;
            const r = e.getBoundingClientRect();
            out.push('  ' + e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
              (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '') +
              '  ' + c + '  ' + Math.round(r.width) + 'x' + Math.round(r.height) + (e.shadowRoot ? '  (shadow)' : ''));
          }
        }
      }
      // first comment's thread lines and the first vote pill, wherever they live
      const roots = [document];
      for (const h of document.querySelectorAll('shreddit-comment, shreddit-post, shreddit-comment-action-row')) {
        if (h.shadowRoot) roots.push(h.shadowRoot);
        if (roots.length > 12) break;
      }
      const desc = (e, where) => {
        const c = getComputedStyle(e), b = getComputedStyle(e, '::before'), a = getComputedStyle(e, '::after'), r = e.getBoundingClientRect();
        return '  [' + where + '] ' + e.tagName.toLowerCase() + '.' + String(e.className).trim().split(/\s+/).filter(x => !/^\d/.test(x)).slice(-4).join('.') +
          '  ' + Math.round(r.width) + 'x' + Math.round(r.height) + '  bg ' + c.backgroundColor + (c.backgroundImage !== 'none' ? ' img ' + c.backgroundImage.slice(0, 60) : '') +
          '  border-l ' + c.borderLeftWidth + ' ' + c.borderLeftColor + '  border-b ' + c.borderBottomWidth + ' ' + c.borderBottomColor +
          (b.content !== 'none' ? '  ::before ' + b.width + 'x' + b.height + ' ' + b.backgroundColor + ' ' + b.borderLeftColor : '') +
          (a.content !== 'none' ? '  ::after ' + a.width + 'x' + a.height + ' ' + a.backgroundColor + ' ' + a.borderLeftColor : '') +
          ([...e.attributes].some(x => x.name.startsWith('data-molten')) ? '  (molten)' : '');
      };
      out.push('', 'Thread lines and vote buttons:');
      let shown = 0;
      for (const [i, rt] of roots.entries()) {
        for (const e of rt.querySelectorAll(THREAD + ',.rpl-vote-button-group,.rpl-vote-button-group button')) {
          out.push(desc(e, i ? 'inside ' + rt.host.tagName.toLowerCase() : 'page'));
          if (++shown >= 14) break;
        }
        if (shown >= 14) break;
      }
      const tags = new Set();
      for (const e of document.querySelectorAll('*')) if (e.tagName.includes('-')) tags.add(e.tagName.toLowerCase());
      out.push('', 'Components on page: ' + [...tags].sort().join(', '));
      return out.join('\n');
    }

    return { write, clean, unclean, report, isLight };
  })();
  gmWatch('glass', v => { Object.assign(glass, GLASS_DEFAULTS, v || {}); GLASS.write(); refreshPlayerSheets(); UI.refresh(); });

  // =====================================================================
  //  Title bar color (installed-app / PWA)
  // =====================================================================
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
        if (c) { const v = css(c); if (m.getAttribute('content') !== v) m.setAttribute('content', v); }
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
        } catch (e2) { log('title color: could not read', url, e2 && e2.message); }
      }
      if (col) {
        cache.set(url, col);
        if (cache.size > 60) cache.delete(cache.keys().next().value);
      }
      return col;
    }

    const active = () => gen.titleColor || gen.seekColor;
    // the video seek bar: same art color, brightened so it stands out (or exactly the title bar color)
    let seekShown = null;
    function seekTone(c) {
      if (gen.seekTone === 'title') return tone(c);
      let [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
      if (s < 0.08) return hslToRgb(h, s, 0.8);
      return hslToRgb(h, Math.min(1, Math.max(s, 0.55)), Math.min(0.7, Math.max(0.55, l)));
    }
    function setSeekCol(c) { seekShown = c; SHADOW.setSeek(c ? css(c) : ''); }
    function apply(col) {
      if (gen.titleColor) show(tone(col)); else if (wanted || shown) show(null);
      setSeekCol(gen.seekColor ? seekTone(col) : null);
    }
    function clear() { show(null); setSeekCol(null); }
    // a readable copy of any image (direct if allowed, otherwise fetched through the userscript manager)
    async function image(url) {
      try {
        const im = await loadImg(url, true);
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        const x = c.getContext('2d');
        x.drawImage(im, 0, 0, 1, 1);
        x.getImageData(0, 0, 1, 1);
        return im;
      } catch (e) {
        const blob = await gmFetch(url);
        const obj = URL.createObjectURL(blob);
        try { return await loadImg(obj, false); } finally { setTimeout(() => URL.revokeObjectURL(obj), 5000); }
      }
    }

    async function fromUrl(url) {
      if (!active() || !url) return;
      source = url;
      const col = await colorOf(url);
      if (source !== url || !active()) return; // a newer image took over
      if (col) { apply(col); log('art color', css(col), 'from', url); }
      else clear(); // couldn't read this art: show the site's own color rather than the previous song's
    }

    // every second: re-assert the color if Reddit rewrote the tag
    // If something else keeps rewriting it (another theme script), stop competing: two scripts
    // taking turns is what makes the title bar flash.
    let rewrites = [];
    let yielded = false;
    function tick() {
      if (!active() || yielded) return;
      if (wanted && shown && !anim) {
        const m = document.querySelector('meta[name="theme-color"]');
        if (m && m.getAttribute('content') !== css(shown)) {
          const now = Date.now();
          rewrites = rewrites.filter(t => now - t < 20000);
          rewrites.push(now);
          if (rewrites.length >= 3) {
            yielded = true;
            log('title bar: another script keeps changing the title bar color, so Molten stopped setting it ' +
              '(turn the other script off for Reddit to let Molten color it)');
            UI.refresh();
            return;
          }
          write(shown);
        }
      }
    }
    function refresh() {
      if (!gen.titleColor) show(null);
      if (!gen.seekColor) setSeekCol(null);
      if (!active()) { source = ''; return; }
      const src = source || artNow;
      source = '';
      if (src) fromUrl(src);
    }
    function off() { source = ''; clear(); }

    return { fromUrl, tick, refresh, off, image, yielded: () => yielded, color: () => (shown ? css(shown) : ''), seek: () => (seekShown ? css(seekShown) : '') };
  })();
  gmWatch('general', v => { Object.assign(gen, GEN_DEFAULTS, v || {}); TITLE.refresh(); UI.refresh(); });

  // =====================================================================
  //  Reddit tweaks
  // =====================================================================
  const RD = (() => {
    const style = makeStyle('');
    function writeCss() {
      style.textContent = (rd.hideRightSidebar
        ? '#right-sidebar-container,#right-sidebar,[slot="right-sidebar"],aside#right-sidebar-container{display:none!important}' +
          '.main-container,#main-content{max-width:none!important}'
        : '') +
        (rd.hideFooter ? '[data-molten-footer]{display:none!important}' : '');
    }

    // The legal links block (Reddit Rules, Privacy Policy, ... Reddit, Inc. ©): find its box and mark it.
    function markFooter() {
      if (!ENABLED || !rd.hideFooter) return;
      for (const a of document.querySelectorAll('a[href*="redditinc.com/policies/content-policy"]:not([data-molten-seen])')) {
        a.setAttribute('data-molten-seen', '');
        let box = a.parentElement;
        for (let i = 0; box && i < 8; i++, box = box.parentElement) {
          if (box.querySelector('a[href*="privacy-policy"]') && /Reddit, Inc\./.test(box.textContent)) break;
        }
        if (box && box.getBoundingClientRect().height < 500) box.setAttribute('data-molten-footer', '');
      }
    }

    // Default comment sort: add ?sort= to comment links as you click them, and on direct loads.
    const sortedUrl = href => {
      try {
        const u = new URL(href, location.href);
        if (!/\/comments\//.test(u.pathname) || u.searchParams.has('sort')) return null;
        u.searchParams.set('sort', rd.commentSort);
        return u.href;
      } catch (e) { return null; }
    };
    function onPointer(e) {
      if (!ENABLED || !rd.commentSort) return;
      const a = e.target.closest && e.target.closest('a[href*="/comments/"]');
      if (!a) return;
      const next = sortedUrl(a.href);
      if (next) a.href = next;
    }
    function onLoad() {
      if (!ENABLED || !rd.commentSort || !isPostPage()) return;
      const next = sortedUrl(location.href);
      const key = 'molten.sorted:' + location.pathname;
      if (next && !sessionStorage.getItem(key)) {
        try { sessionStorage.setItem(key, '1'); } catch (e) { /* ignore */ }
        location.replace(next);
      }
    }

    // Auto-expand "more replies" when they scroll into view (capped, so a huge thread can't run away).
    let clicks = 0;
    const seenBtns = new WeakSet();
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        if (!en.isIntersecting || !ENABLED || !rd.autoExpand || clicks > 150) continue;
        io.unobserve(en.target);
        clicks++;
        en.target.click();
        log('expanded replies', clicks);
      }
    }, { rootMargin: '300px 0px' });
    const MORE = /^(\d+\s+)?more repl(y|ies)$|^view more comments$|^more replies$|^\d+\s+more repl/i;
    function scanMore() {
      if (!ENABLED || !rd.autoExpand || !isPostPage()) return;
      for (const b of document.querySelectorAll('shreddit-comment-tree button, shreddit-comment button, faceplate-partial button')) {
        if (seenBtns.has(b)) continue;
        if (!MORE.test(norm(b.textContent))) continue;
        seenBtns.add(b);
        io.observe(b);
      }
    }

    function init() {
      writeCss();
      document.addEventListener('pointerdown', onPointer, true);
      document.addEventListener('auxclick', onPointer, true);
      onLoad();
      setInterval(() => { scanMore(); markFooter(); }, 1500);
    }
    return { init, writeCss, onLoad, markFooter, resetClicks: () => { clicks = 0; } };
  })();
  gmWatch('reddit', v => { Object.assign(rd, RD_DEFAULTS, v || {}); RD.writeCss(); UI.refresh(); });

  // =====================================================================
  //  Search: Arctic Shift profile lookup (from "Arctic Shift Lookup for Reddit Profiles")
  // =====================================================================
  const SR_DEFAULTS = {
    profileButton: true,  // a 🔍 next to the name on profile pages
    type: 'posts',        // what the 🔍 opens: posts | comments
    limit: '25',          // 25 | 50 | 100 | auto
    sort: 'desc',         // desc = newest first | asc = oldest first
  };
  const srch = Object.assign({}, SR_DEFAULTS, gmGet('search', {}));
  const saveSrch = () => gmSet('search', Object.assign({}, srch));

  const ARCTIC = (() => {
    const MARK = 'data-arctic-lookup';
    const PROFILE_PATH = /^\/(?:user|u)\/([A-Za-z0-9_-]{3,20})(?:\/|$)/;
    // https://arctic-shift.photon-reddit.com/search?fun=posts_search|comments_search&author=&subreddit=
    //   &after=&before=&limit=&sort=  (+ title= for posts, body= for comments)
    function url(o) {
      const p = new URLSearchParams();
      p.set('fun', (o.type === 'comments' ? 'comments' : 'posts') + '_search');
      if (o.author) p.set('author', o.author);
      if (o.subreddit) p.set('subreddit', o.subreddit.replace(/^\/?r\//i, ''));
      if (o.keyword) p.set(o.type === 'comments' ? 'body' : 'title', o.keyword);
      if (o.after) p.set('after', o.after);
      if (o.before) p.set('before', o.before);
      p.set('limit', o.limit || srch.limit);
      p.set('sort', o.sort || srch.sort);
      return 'https://arctic-shift.photon-reddit.com/search?' + p.toString();
    }
    const profileName = () => { const m = location.pathname.match(PROFILE_PATH); return m ? m[1] : null; };
    function open(o) { window.open(url(Object.assign({ type: srch.type }, o)), '_blank', 'noopener'); }

    function makeButton(name) {
      const a = document.createElement('a');
      a.href = url({ author: name, type: srch.type });
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = '🔍';
      a.title = 'Search u/' + name + "'s " + srch.type + ' on Arctic Shift';
      a.setAttribute(MARK, name.toLowerCase());
      a.style.cssText = 'margin-left:6px;text-decoration:none;cursor:pointer;font-size:0.8em;display:inline;vertical-align:middle;';
      a.addEventListener('click', e => e.stopPropagation(), true);
      return a;
    }
    // The element showing the profile's name
    function findNameElement(name) {
      const lower = name.toLowerCase();
      const matches = el => { const t = el.textContent.trim().toLowerCase(); return t === lower || t === 'u/' + lower || t === '/u/' + lower; };
      for (const el of document.querySelectorAll('h1, h2')) if (matches(el)) return el;
      const mainH1 = document.querySelector('main h1, [data-testid="profile-main"] h1');
      if (mainH1) return mainH1;
      for (const el of document.querySelectorAll('p, span')) if (el.children.length === 0 && matches(el)) return el;
      return null;
    }
    function run() {
      const name = ENABLED && srch.profileButton ? profileName() : null;
      for (const b of document.querySelectorAll('a[' + MARK + ']')) {
        if (!name || b.getAttribute(MARK) !== name.toLowerCase()) b.remove();
        else b.href = url({ author: name, type: srch.type }); // follow setting changes
      }
      if (!name || document.querySelector('a[' + MARK + '="' + name.toLowerCase() + '"]')) return;
      const target = findNameElement(name);
      if (target) target.appendChild(makeButton(name));
    }
    function init() { run(); setInterval(run, 1000); }
    return { init, run, url, open, profileName };
  })();
  gmWatch('search', v => { Object.assign(srch, SR_DEFAULTS, v || {}); ARCTIC.run(); UI.refresh(); });

  // =====================================================================
  //  The orange button
  // =====================================================================
  function makeIcon() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('aria-hidden', 'true');
    [[9, 15, 5], [15.5, 8.5, 3.2], [16.5, 17, 2]].forEach(c => {
      const e = document.createElementNS(NS, 'circle');
      e.setAttribute('cx', c[0]); e.setAttribute('cy', c[1]); e.setAttribute('r', c[2]);
      e.setAttribute('fill', 'currentColor');
      svg.appendChild(e);
    });
    return svg;
  }
  function syncButton() {
    const b = document.getElementById('ytt-toggle');
    if (!b) return;
    b.classList.toggle('lava-on', ENABLED && lava.on);
    b.classList.toggle('mt-off', !ENABLED);
    b.classList.toggle('open', !!document.getElementById('ytt-panel'));
    b.title = ENABLED ? 'Molten for Reddit settings' : 'Molten for Reddit is off (click to turn it back on)';
  }
  function ensureToggle() {
    let b = document.getElementById('ytt-toggle');
    if (!b) {
      b = document.createElement('button');
      b.id = 'ytt-toggle';
      b.type = 'button';
      b.setAttribute('aria-label', 'Molten for Reddit settings');
      b.appendChild(makeIcon());
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); UI.toggle(); });
    }
    // Sit just left of the chat icon in the header's right-hand group (same row, same slot).
    const chat = document.querySelector('#header-action-item-chat-button, [id^="header-action-item"]');
    let anchor = chat;
    for (let i = 0; anchor && i < 4 && !anchor.hasAttribute('slot') && anchor.parentElement; i++) {
      const pd = getComputedStyle(anchor.parentElement).display;
      if (/flex|grid/.test(pd)) break;
      anchor = anchor.parentElement;
    }
    const host = anchor && anchor.parentElement;
    if (host) {
      if (anchor.getAttribute('slot')) b.setAttribute('slot', anchor.getAttribute('slot')); else b.removeAttribute('slot');
      if (b.nextElementSibling !== anchor) host.insertBefore(b, anchor);
    } else if (document.body && b.parentElement !== document.body) {
      document.body.appendChild(b); // header not found: float in the corner
    }
    b.classList.toggle('lava-float', !host);
    syncButton();
  }
  coreStyle(
    '#ytt-panel .ytt-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px}' +
    '#ytt-panel .ytt-mini{display:block;font-size:11.5px;opacity:.75}' +
    '#ytt-panel input[type=date]{color-scheme:dark;min-width:0}' +
    '#ytt-panel input.ytt-text + input.ytt-text{margin-top:6px}' +
    '#ytt-panel .ytt-tab{font-size:12px}'
  );
  coreStyle(
    '#ytt-toggle{width:40px;height:40px;margin:0 4px;padding:0;border:0;border-radius:50%;background:transparent;' +
    'color:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;opacity:.65;flex:none}' +
    '#ytt-toggle:hover,#ytt-toggle.open{background:rgba(128,128,128,.18);opacity:1}' +
    '#ytt-toggle.lava-on{opacity:1;color:#ff9a3d}' +
    '#ytt-toggle.mt-off{opacity:.35}' +
    '#ytt-toggle.lava-float{position:fixed;right:16px;bottom:16px;z-index:2147483000;background:rgba(0,0,0,.55);color:#ff9a3d}'
  );

  // =====================================================================
  //  Master switch
  // =====================================================================
  function setEnabled(on, fromOtherTab) {
    on = !!on;
    if (on === ENABLED) return;
    ENABLED = on;
    if (!fromOtherTab) gmSet('enabled', on);
    setStylesEnabled(on);
    applyRootState();
    refreshPlayerSheets();
    ARCTIC.run();
    QUALITY.apply(); // off: videos go back to Reddit's own file
    if (on) {
      GLASS.write();
      applyArt(); applyBlobs();
      if (lava.on) { ensureLayers(); artNow = ''; scheduleArt(0); }
      TITLE.refresh();
    } else {
      setVideoOn(false);
      removeLayers();
      GLASS.unclean();
      TITLE.off();
    }
    vs.lastEnsure = 0;
    videoTick();
    syncButton();
    UI.refresh();
    console.log('[molten] Molten for Reddit ' + (on ? 'on' : 'off'));
  }
  gmWatch('enabled', v => setEnabled(v !== false, true));

  // =====================================================================
  //  Settings panel
  // =====================================================================
  const UI = (() => {
    const TAB_KEY = 'ytt.tab';
    const ACCENT = '#ff9a3d';

    coreStyle(
      '#ytt-panel{position:fixed;top:60px;right:16px;width:380px;max-width:calc(100vw - 32px);max-height:calc(100vh - 84px);' +
      'display:flex;flex-direction:column;z-index:2147483647;background:rgba(22,22,26,.94);' +
      '-webkit-backdrop-filter:blur(22px) saturate(1.4);backdrop-filter:blur(22px) saturate(1.4);color:#f1f1f1;' +
      'border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 14px 44px rgba(0,0,0,.6);' +
      'font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;transition:opacity .15s ease;text-align:left}' +
      '#ytt-panel.ytt-peek{opacity:.18}' +
      '#ytt-panel *{box-sizing:border-box;font-family:inherit !important;letter-spacing:normal}' +
      '#ytt-panel .ytt-head{display:flex;align-items:flex-start;justify-content:space-between;padding:14px 14px 10px 16px}' +
      '#ytt-panel .ytt-title{font-weight:650;font-size:15px}' +
      '#ytt-panel .ytt-sub{opacity:.55;font-size:11.5px}' +
      '#ytt-panel .ytt-tagline{font-size:12px;color:#ffb470;margin:1px 0 2px}' +
      '#ytt-panel .ytt-x{width:28px;height:28px;border:0;border-radius:50%;background:rgba(255,255,255,.08);color:#fff;' +
      'cursor:pointer;font-size:16px;line-height:28px;padding:0}' +
      '#ytt-panel .ytt-x:hover{background:rgba(255,255,255,.18)}' +
      '#ytt-panel .ytt-tabs{display:flex;gap:4px;margin:0 12px 6px;padding:4px;background:rgba(255,255,255,.06);border-radius:12px}' +
      '#ytt-panel .ytt-tab{flex:1;padding:7px 4px;border:0;border-radius:9px;background:transparent;color:#f1f1f1;' +
      'cursor:pointer;font-size:12.5px;font-weight:550;opacity:.65}' +
      '#ytt-panel .ytt-tab:hover{opacity:1}' +
      '#ytt-panel .ytt-tab.on{background:rgba(255,154,61,.2);color:#ffb470;opacity:1}' +
      '#ytt-panel .ytt-body{overflow-y:auto;padding:2px 16px 16px;scrollbar-width:thin !important}' +
      '#ytt-panel .ytt-sec{margin:14px 0 2px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.62}' +
      '#ytt-panel .ytt-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;cursor:default}' +
      '#ytt-panel label.ytt-row{cursor:pointer}' +
      '#ytt-panel .ytt-label{flex:1;min-width:0}' +
      '#ytt-panel .ytt-hint{display:block;opacity:.65;font-size:11.5px;margin-top:1px}' +
      '#ytt-panel input.ytt-switch{appearance:none;-webkit-appearance:none;width:36px;height:20px;border-radius:10px;' +
      'background:rgba(255,255,255,.22);position:relative;cursor:pointer;flex:none;transition:background .15s;margin:0;border:0}' +
      '#ytt-panel input.ytt-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;' +
      'background:#fff;transition:transform .15s}' +
      '#ytt-panel input.ytt-switch:checked{background:' + ACCENT + '}' +
      '#ytt-panel input.ytt-switch:checked::after{transform:translateX(16px)}' +
      '#ytt-panel .ytt-field{padding:7px 0}' +
      '#ytt-panel .ytt-field-head{display:flex;justify-content:space-between;gap:8px}' +
      '#ytt-panel .ytt-default{opacity:.4;font-size:11px;white-space:nowrap}' +
      '#ytt-panel .ytt-slider{display:grid;grid-template-columns:1fr 70px;gap:10px;align-items:center;margin-top:4px}' +
      '#ytt-panel input[type=range]{width:100%;accent-color:' + ACCENT + ';margin:0;cursor:pointer}' +
      '#ytt-panel input.ytt-num,#ytt-panel select.ytt-sel,#ytt-panel input.ytt-text{background:rgba(0,0,0,.4);color:#fff;' +
      'border:1px solid rgba(255,255,255,.16);border-radius:8px;padding:5px 7px;font-size:12.5px;outline:none}' +
      '#ytt-panel input.ytt-num:focus,#ytt-panel select.ytt-sel:focus,#ytt-panel input.ytt-text:focus{border-color:' + ACCENT + '}' +
      '#ytt-panel input.ytt-num{width:70px}' +
      '#ytt-panel input.ytt-text{width:100%;margin-top:4px}' +
      '#ytt-panel .ytt-names-list{margin-top:4px;filter:blur(5px);transition:filter .2s;word-break:break-word}' +
      '#ytt-panel .ytt-names:hover .ytt-names-list{filter:none}' +
      '#ytt-panel select.ytt-sel{max-width:170px;cursor:pointer}' +
      '#ytt-panel select.ytt-sel option{background:#222;color:#fff}' +
      '#ytt-panel .ytt-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}' +
      '#ytt-panel .ytt-btn{padding:7px 11px;border:0;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font-size:12.5px}' +
      '#ytt-panel .ytt-btn:hover{background:rgba(255,255,255,.18)}' +
      '#ytt-panel .ytt-btn.primary{background:' + ACCENT + ';color:#1a1a1a;font-weight:650}' +
      '#ytt-panel .ytt-btn.primary:hover{background:#ffad5c}' +
      '#ytt-panel .ytt-status{min-height:16px;font-size:12px;color:#9be29b;margin-top:8px}' +
      '#ytt-panel .ytt-status.err{color:#ff8a8a}' +
      '#ytt-panel .ytt-info{background:rgba(255,255,255,.06);border-radius:10px;padding:9px 11px;margin:8px 0 4px;font-size:12px}' +
      '#ytt-panel .ytt-info b{font-weight:650}' +
      '#ytt-panel .ytt-note{opacity:.65;font-size:11.5px;margin-top:12px}' +
      '#ytt-panel .ytt-off{opacity:.4;pointer-events:none}' +
      '#ytt-panel details{margin-top:10px}' +
      '#ytt-panel .ytt-master{margin:10px 0 2px;padding:4px 12px;border-radius:12px;background:rgba(255,154,61,.1);border:1px solid rgba(255,154,61,.25)}' +
      '#ytt-panel .ytt-master .ytt-label{font-weight:650;font-size:14px}' +
      '#ytt-panel .ytt-master .ytt-hint{font-weight:400;font-size:11.5px}' +
      '#ytt-panel .ytt-seg{display:flex;gap:4px;padding:4px;margin-top:6px;background:rgba(255,255,255,.06);border-radius:12px}' +
      '#ytt-panel .ytt-segbtn{flex:1;padding:8px 4px;border:0;border-radius:9px;background:transparent;color:#f1f1f1;cursor:pointer;font-size:12.5px;font-weight:600;opacity:.65}' +
      '#ytt-panel .ytt-segbtn:hover{opacity:1}' +
      '#ytt-panel .ytt-segbtn.on{background:' + ACCENT + ';color:#1a1a1a;opacity:1}' +
      '#ytt-panel .ytt-seg-hint{margin:6px 0 2px}' +
      '#ytt-panel .ytt-swatch{width:44px;height:24px;border-radius:7px;border:1px solid rgba(255,255,255,.25);flex:none}' +
      '#ytt-panel summary{cursor:pointer;opacity:.7;font-size:12px;padding:4px 0}'
    );

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

    function selectRow(parent, label, hint, options, get, set) {
      const row = el('div', 'ytt-row');
      const s = el('select', 'ytt-sel');
      for (const [val, text] of options) {
        const op = el('option', null, text);
        op.value = val;
        s.append(op);
      }
      s.value = get();
      s.addEventListener('change', () => set(s.value));
      row.append(labelBlock(label, hint), s);
      parent.append(row);
      return row;
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

    /* Panel layout
         General  on/off · colors from the art (title bar, seek bar) · troubleshooting
         Lava     the background (profiles, motion, blobs) · the glass over it · how it behaves
         Video    quality · see-through bars · playing videos in the lava
         Reddit   comments · layout
         Search   Arctic Shift lookup for profiles                                                */
    function swatchRow(parent, color) {
      const row = el('div', 'ytt-row');
      const chip = el('span', 'ytt-swatch');
      chip.style.background = color || 'transparent';
      row.append(labelBlock('Current color', color || 'Nothing yet (site default)'), chip);
      parent.append(row);
    }

    // ---------------- General ----------------
    function buildGeneral(body) {
      const master = el('div', 'ytt-master');
      toggleRow(master, 'Molten for Reddit', ENABLED
        ? 'Everything is on. Turn off to stop every feature at once.'
        : 'Off: lava, glass, colors, video and search tweaks are all stopped.',
        () => ENABLED, v => { setEnabled(v); render(); });
      body.append(master);
      if (!ENABLED) {
        body.append(el('div', 'ytt-note', 'Only this button stays while it is off. Other open Reddit tabs switch with it. Your settings are kept.'));
        return;
      }
      const set = k => v => { gen[k] = v; saveGen(); TITLE.refresh(); render(); };
      const get = k => () => gen[k];

      section(body, 'Title bar');
      toggleRow(body, 'Match the title bar to the art', 'Same picture or video the lava is showing', get('titleColor'), set('titleColor'));
      const t = el('div', gen.titleColor ? '' : 'ytt-off');
      selectRow(t, 'Tone', null, [['dark', 'Dark (easy to read)'], ['vivid', 'Vivid'], ['muted', 'Muted']], get('titleTone'), set('titleTone'));
      swatchRow(t, TITLE.color());
      body.append(t);
      if (TITLE.yielded()) body.append(el('div', 'ytt-note', 'Another script is also setting the title bar color, so Molten stepped back ' +
        'to stop the flashing. Turn the other script off for Reddit, then refresh, to use this.'));

      section(body, 'Video seek bar');
      toggleRow(body, 'Match the seek bar to the art', 'The played part and the ball, same color as the title bar', get('seekColor'), set('seekColor'));
      const k = el('div', gen.seekColor ? '' : 'ytt-off');
      selectRow(k, 'Tone', null, [['bright', 'Bright (easy to see)'], ['title', 'Same as title bar']], get('seekTone'), set('seekTone'));
      swatchRow(k, TITLE.seek());
      body.append(k);

      section(body, 'Troubleshooting');
      toggleRow(body, 'Log to the console', 'Lines start with [molten] (F12)', () => lava.debug, v => { lavaSet('debug', v); render(); });
      const status = el('div', 'ytt-status');
      const b = el('div', 'ytt-btns');
      btn(b, 'Copy layout report', async () => {
        const text = GLASS.report();
        try { await navigator.clipboard.writeText(text); status.textContent = 'Copied. Paste it to whoever is tuning the skin.'; }
        catch (e) { console.log(text); status.textContent = 'Could not copy; the report is in the console (F12).'; }
      });
      body.append(b, status);
      body.append(el('div', 'ytt-note', 'The report lists the colors and pieces on screen, without post text or usernames. ' +
        'The title bar color shows when Reddit is installed as an app.'));
    }

    // ---------------- Lava: background + glass + behaviour ----------------
    function buildLava(body) {
      const P = PRESETS[lavaStore.profile];
      const lset = k => v => { lavaSet(k, v); if (k === 'blobs' || k === 'randomize' || k === 'on') render(); };
      const lget = k => () => lava[k];
      const gset = (k, rer) => v => { glass[k] = v; saveGlass(); GLASS.write(); if (k === 'cleanup' && !v) GLASS.unclean(); if (rer) render(); };
      const gget = k => () => glass[k];
      const GD = GLASS_DEFAULTS;

      toggleRow(body, 'Lava background', 'Off = clear glass over a plain black page', lget('on'), lset('on'));
      const look = el('div', lava.on ? '' : 'ytt-off');
      const seg = el('div', 'ytt-seg');
      for (const p of Object.keys(PRESETS)) {
        const b = el('button', 'ytt-segbtn' + (p === lavaStore.profile ? ' on' : ''), PROFILE_NAMES[p]);
        b.type = 'button';
        b.addEventListener('click', () => { lavaSwitchProfile(p); render(); });
        seg.append(b);
      }
      look.append(seg);
      look.append(el('div', 'ytt-hint ytt-seg-hint', 'Each profile remembers its own look. Edits below change ' + PROFILE_NAMES[lavaStore.profile] + '.'));
      sliderRow(look, 'Blur', '× 100 px', { min: 0, max: 1.5, step: 0.01, hardMin: 0 }, lget('bgBlur'), lset('bgBlur'), P.bgBlur);
      sliderRow(look, 'Brightness', null, { min: 0, max: 2, step: 0.01, hardMin: 0 }, lget('bgBrightness'), lset('bgBrightness'), P.bgBrightness);
      sliderRow(look, 'Saturation', null, { min: 0, max: 5, step: 0.05, hardMin: 0 }, lget('bgSaturate'), lset('bgSaturate'), P.bgSaturate);
      sliderRow(look, 'Zoom', null, { min: 1, max: 2.5, step: 0.01, hardMin: 0.1 }, lget('bgScale'), lset('bgScale'), P.bgScale);
      section(look, 'Motion');
      toggleRow(look, 'Random motion', 'Off = a fixed animation', lget('randomize'), lset('randomize'));
      const mo = el('div', lava.randomize ? '' : 'ytt-off');
      sliderRow(mo, 'Speed', '1 = normal, 2 = twice as fast', { min: 0.1, max: 4, step: 0.05, unit: '×', hardMin: 0.05 }, lget('motionSpeed'), lset('motionSpeed'), P.motionSpeed);
      sliderRow(mo, 'Amount', 'How far it breathes, drifts, tilts and wanders', { min: 0, max: 3, step: 0.05, unit: '×', hardMin: 0 }, lget('motionAmount'), lset('motionAmount'), P.motionAmount);
      look.append(mo);
      toggleRow(look, 'Moving color blobs', 'Turning these off saves the most GPU', lget('blobs'), lset('blobs'));
      if (lava.blobs) {
        sliderRow(look, 'Blob smoothness', 'Lower = cheaper, choppier', { min: 5, max: 240, step: 1, hardMin: 1 }, lget('blobSteps'), lset('blobSteps'), P.blobSteps);
      }
      const pb = el('div', 'ytt-btns');
      btn(pb, 'Shuffle motion', () => fadeReseed(true));
      btn(pb, 'Reset ' + PROFILE_NAMES[lavaStore.profile], () => { lavaResetProfile(); render(); });
      look.append(pb);
      body.append(look);

      section(body, 'Glass');
      sliderRow(body, 'Frost on posts', '0 = perfectly clear glass', { min: 0, max: 0.4, step: 0.01, hardMin: 0, hardMax: 0.6 }, gget('tint'), gset('tint'), GD.tint);
      sliderRow(body, 'Blur behind posts', '0 = see the lava sharp through the glass (fastest)', { min: 0, max: 30, step: 1, unit: 'px', hardMin: 0 }, gget('blur'), gset('blur'), GD.blur);
      sliderRow(body, 'Header & sidebar frost', 'Posts scroll under the header, so a little frost keeps it readable', { min: 0, max: 1, step: 0.05, hardMin: 0, hardMax: 1 }, gget('chrome'), gset('chrome'), GD.chrome);
      sliderRow(body, 'Roundness', null, { min: 0, max: 28, step: 1, unit: 'px', hardMin: 0 }, gget('radius'), gset('radius'), GD.radius);
      toggleRow(body, 'Bright edges on posts', 'One thin white line around each pane', gget('edges'), gset('edges'));
      toggleRow(body, 'Text shadow', 'Keeps the white writing readable over bright lava', gget('textShadow'), gset('textShadow'));

      section(body, 'Behaviour');
      const be = el('div');
      toggleRow(be, 'Follow posts as you scroll', 'The lava takes the picture of the post in the middle of the screen', lget('followScroll'), lset('followScroll'));
      toggleRow(be, 'Pause the lava while scrolling', 'Smoother on long feeds', lget('pauseOnScroll'), lset('pauseOnScroll'));
      if (!lava.on) be.className = 'ytt-off';
      body.append(be);
      toggleRow(body, 'Clear leftover solid backgrounds', 'Finds big solid blocks Reddit paints and makes them see-through', gget('cleanup'), gset('cleanup'));
      const rb = el('div', 'ytt-btns');
      btn(rb, 'Reset glass', () => { Object.assign(glass, GLASS_DEFAULTS); saveGlass(); GLASS.write(); render(); });
      body.append(rb);
      body.append(el('div', 'ytt-note', 'No picture on screen? The lava uses the subreddit\'s banner or icon, then a built-in palette. Hold a slider to see through this panel.'));
    }

    // ---------------- Video ----------------
    function buildVideo(body) {
      const rset = k => v => { rd[k] = v; saveRd(); QUALITY.apply(); render(); };
      const gset = k => v => { glass[k] = v; saveGlass(); GLASS.write(); refreshPlayerSheets(); render(); };
      const lset = k => v => { lavaSet(k, v); if (k === 'videoSource') render(); };
      const lget = k => () => lava[k];
      const S = SHARED_DEFAULTS;

      section(body, 'Quality');
      selectRow(body, 'Video quality', 'For videos Reddit serves as MP4 files; streams stay automatic', [
        ['best', 'Best available'], ['auto', "Auto (Reddit's choice)"], ['1080', 'Up to 1080p'], ['720', 'Up to 720p'], ['480', 'Up to 480p']],
        () => rd.videoQuality, rset('videoQuality'));

      section(body, 'Player');
      toggleRow(body, 'See-through video bars', 'The black around narrow or wide videos shows the glass and lava instead',
        () => glass.clearVideo, gset('clearVideo'));

      section(body, 'Videos in the lava');
      selectRow(body, 'Playing videos', 'A playing video takes over the lava while it plays',
        [['any', 'Feed, posts and profiles'], ['post', 'Posts and profiles'], ['off', 'Never']], lget('videoSource'), lset('videoSource'));
      const v = el('div', lava.videoSource !== 'off' && lava.on ? '' : 'ytt-off');
      sliderRow(v, 'Frame rate', 'Lower = cheaper; it is blurred anyway', { min: 1, max: 60, step: 1, unit: 'fps', hardMin: 1, hardMax: 60 }, lget('videoFps'), lset('videoFps'), S.videoFps);
      sliderRow(v, 'Frame copy width', 'Small is fine behind the blur', { min: 32, max: 512, step: 16, unit: 'px', hardMin: 8, hardMax: 1024 }, lget('videoWidth'), lset('videoWidth'), S.videoWidth);
      toggleRow(v, 'Crop black bars', 'Leaves bars baked into a video out of the lava (measured from its first frame when needed)', lget('videoCropBars'), lset('videoCropBars'));
      body.append(v);
    }

    // ---------------- Reddit ----------------
    function buildReddit(body) {
      const set = k => v => { rd[k] = v; saveRd(); RD.writeCss(); RD.markFooter(); render(); };
      const get = k => () => rd[k];
      section(body, 'Comments');
      selectRow(body, 'Default sort', 'Applied when you open a post', [
        ['', "Reddit's choice"], ['confidence', 'Best'], ['top', 'Top'], ['new', 'New'],
        ['controversial', 'Controversial'], ['old', 'Old'], ['qa', 'Q&A']], get('commentSort'), set('commentSort'));
      toggleRow(body, 'Auto-expand "more replies"', 'Opens collapsed reply threads as you scroll to them', get('autoExpand'), set('autoExpand'));
      section(body, 'Layout');
      toggleRow(body, 'Hide the right sidebar', 'More room for posts', get('hideRightSidebar'), set('hideRightSidebar'));
      const f = el('div', rd.hideRightSidebar ? 'ytt-off' : '');
      toggleRow(f, 'Hide the legal links', 'Reddit Rules, Privacy Policy, User Agreement, © ... under the sidebar', get('hideFooter'), set('hideFooter'));
      body.append(f);
    }

    // ---------------- Search (Arctic Shift) ----------------
    function buildSearch(body) {
      const set = k => v => { srch[k] = v; saveSrch(); ARCTIC.run(); render(); };
      const get = k => () => srch[k];
      const here = ARCTIC.profileName();

      section(body, here ? 'This profile' : 'Look someone up');
      const name = el('input', 'ytt-text');
      name.type = 'text';
      name.placeholder = 'username';
      name.value = here || '';
      const sub = el('input', 'ytt-text');
      sub.type = 'text';
      sub.placeholder = 'in subreddit (optional)';
      const key = el('input', 'ytt-text');
      key.type = 'text';
      key.placeholder = 'keyword: post titles / comment text (optional)';
      const after = el('input', 'ytt-text'); after.type = 'date'; after.title = 'After';
      const before = el('input', 'ytt-text'); before.type = 'date'; before.title = 'Before';
      const f1 = el('div', 'ytt-field');
      f1.append(labelBlock('Username', here ? 'From the profile you are on' : null), name);
      const f2 = el('div', 'ytt-field');
      f2.append(labelBlock('Filters', 'All optional'), sub, key);
      const dates = el('div', 'ytt-grid2');
      const da = el('label', 'ytt-mini'); da.append('After', after);
      const db = el('label', 'ytt-mini'); db.append('Before', before);
      dates.append(da, db);
      f2.append(dates);
      body.append(f1, f2);
      const status = el('div', 'ytt-status');
      const go = type => () => {
        const author = name.value.trim().replace(/^\/?u(ser)?\//i, '');
        if (!author && !sub.value.trim()) { status.textContent = 'Enter a username or a subreddit.'; status.classList.add('err'); return; }
        ARCTIC.open({ type, author, subreddit: sub.value.trim(), keyword: key.value.trim(), after: after.value, before: before.value });
      };
      const b = el('div', 'ytt-btns');
      btn(b, 'Search posts', go('posts'), srch.type === 'posts');
      btn(b, 'Search comments', go('comments'), srch.type === 'comments');
      body.append(b, status);

      section(body, 'The 🔍 on profiles');
      toggleRow(body, 'Show 🔍 next to the name', 'On profile pages; opens their history on Arctic Shift', get('profileButton'), set('profileButton'));
      const o = el('div', srch.profileButton ? '' : 'ytt-off');
      selectRow(o, 'Opens', null, [['posts', 'Their posts'], ['comments', 'Their comments']], get('type'), set('type'));
      body.append(o);
      section(body, 'Results');
      selectRow(body, 'How many', null, [['25', '25'], ['50', '50'], ['100', '100'], ['auto', 'As many as possible']], get('limit'), set('limit'));
      selectRow(body, 'Order', null, [['desc', 'Newest first'], ['asc', 'Oldest first']], get('sort'), set('sort'));
      body.append(el('div', 'ytt-note', 'Arctic Shift is an independent archive of Reddit posts and comments; it opens in a new tab.'));
    }

    function render() {
      if (!panelEl) return;
      const keepScroll = bodyEl.scrollTop;
      bodyEl.textContent = '';
      for (const b of panelEl.querySelectorAll('.ytt-tab')) b.classList.toggle('on', b.dataset.tab === tab);
      if (!ENABLED && tab !== 'general') {
        bodyEl.append(el('div', 'ytt-info', 'Molten for Reddit is off. Turn it back on in the General tab.'));
        const b = el('div', 'ytt-btns');
        btn(b, 'Go to General', () => { tab = 'general'; lsSet(TAB_KEY, tab); render(); }, true);
        bodyEl.append(b);
      } else if (tab === 'general') buildGeneral(bodyEl);
      else if (tab === 'video') buildVideo(bodyEl);
      else if (tab === 'reddit') buildReddit(bodyEl);
      else if (tab === 'search') buildSearch(bodyEl);
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
      t.append(el('div', 'ytt-title', 'Molten for Reddit'), el('div', 'ytt-tagline', 'Molten glass for Reddit'), el('div', 'ytt-sub', 'Settings for all your Reddit tabs'));
      const x = el('button', 'ytt-x', '×');
      x.type = 'button';
      x.title = 'Close';
      x.addEventListener('click', close);
      head.append(t, x);

      const tabs = el('div', 'ytt-tabs');
      for (const [id, name] of [['general', 'General'], ['lava', 'Lava'], ['video', 'Video'], ['reddit', 'Reddit'], ['search', 'Search']]) {
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
      panelEl.append(head, tabs, bodyEl);

      // keep Reddit's keyboard shortcuts from firing while you type in the panel
      for (const type of ['keydown', 'keypress', 'keyup']) {
        panelEl.addEventListener(type, e => {
          if (type === 'keydown' && e.key === 'Escape') close();
          e.stopPropagation();
        });
      }
      // clicks inside the panel shouldn't reach Reddit (it would open the post underneath)
      panelEl.addEventListener('click', e => e.stopPropagation());

      document.body.append(panelEl);
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
      GM_registerMenuCommand('Open Molten for Reddit settings', () => UI.open());
      GM_registerMenuCommand('Turn Molten for Reddit on/off', () => setEnabled(!ENABLED));
    } catch (e) { /* ignore */ }
  }

  // =====================================================================
  //  Start
  // =====================================================================
  applyRootState();
  GLASS.write();
  // Reddit swaps pages without reloading: react to scrolling and page changes.
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      RD.resetClicks();
      RD.onLoad();
      scheduleArt(600);
      setTimeout(() => { if (ENABLED && glass.cleanup) GLASS.clean(); }, 900);
    }
  }, 500);
  let scrollIdle = 0;
  window.addEventListener('scroll', () => {
    if (!ENABLED) return;
    if (lava.followScroll && !isPostPage()) scheduleArt(450);
    if (lava.pauseOnScroll) {
      if (!scrolling) { scrolling = true; document.documentElement.setAttribute('data-molten-scrolling', ''); }
      clearTimeout(scrollIdle);
      scrollIdle = setTimeout(() => { scrolling = false; document.documentElement.removeAttribute('data-molten-scrolling'); }, 250);
    }
  }, { passive: true });
  const startArt = () => {
    if (lavaActive()) { ensureLayers(); setArt(currentArt()); }
    // re-check once Reddit's images have loaded in
    setTimeout(() => scheduleArt(0), 1500);
    // the glass colors depend on light/dark mode, which Reddit sets after load
    setTimeout(() => GLASS.write(), 800);
    // first sweep for leftover solid backgrounds as soon as the page has painted
    setTimeout(() => { if (ENABLED && glass.cleanup) GLASS.clean(); }, 900);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startArt, { once: true });
  else startArt();
  RD.init();
  ARCTIC.init();
  setInterval(() => { if (ENABLED) TITLE.tick(); }, 1000);
  videoTick();
  log('Molten for Reddit 2.2.8 loaded');
})();