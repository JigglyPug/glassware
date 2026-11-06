// ==UserScript==
// @name         Prism
// @namespace
// @version      2.2.1
// @description  Colors your app title bars to match each site, from its icon, manifest, theme color or favicon. Clean frosted menu with a color dropper (Alt+Shift+P).
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      *
// @run-at       document-start
// @sandbox      JavaScript
// @noframes
// @author       JigglyPug
// @license      MIT
// @icon         https://raw.githubusercontent.com/JigglyPug/glassware/main/assets/icons/prism.png?v=2
// @homepageURL  https://jigglypug.github.io/glassware/desktop/prism/
// @supportURL   https://github.com/JigglyPug/glassware/issues
// @updateURL    https://raw.githubusercontent.com/JigglyPug/glassware/main/desktop/prism/prism.user.js
// @downloadURL  https://raw.githubusercontent.com/JigglyPug/glassware/main/desktop/prism/prism.user.js
// ==/UserScript==

(function () {
    'use strict';

    /* ───────────────────────── constants ───────────────────────── */

    const VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '2.2.1';
    const FALLBACK = '#121212';
    const ORIGIN = location.origin;
    const HOST = location.hostname;
    const CACHE_DAYS = 3;
    const CACHE_MAX = 300;

    const SOURCES = {
        icon:     { label: 'App icon',         hint: 'Main color of the app icon in the manifest' },
        manifest: { label: 'Manifest color',   hint: 'The theme_color the app declares' },
        meta:     { label: "Site's own color", hint: 'The theme-color tag on the page' },
        favicon:  { label: 'Favicon',          hint: 'Main color of the tab icon' },
        header:   { label: 'Page header',      hint: 'Solid color at the very top of the page' },
    };
    const DEFAULT_SOURCES = [
        { id: 'icon', on: true }, { id: 'manifest', on: true }, { id: 'meta', on: true },
        { id: 'favicon', on: true }, { id: 'header', on: false },
    ];
    const DEFAULTS = { enabled: true, tone: 'exact', log: false, sources: DEFAULT_SOURCES, appearance: 'auto' };   // appearance: auto (match the device) | light | dark
    const TONES = {
        exact:  { label: 'Exact',  desc: 'The color exactly as found' },
        dark:   { label: 'Dark',   desc: 'Deepened so the title text stays easy to read' },
        bright: { label: 'Bright', desc: 'Lifted and vivid, easy to spot' },
    };

    /* ───────────────────────── storage ───────────────────────── */

    const clone = o => JSON.parse(JSON.stringify(o));
    const get = (k, d) => { try { const v = GM_getValue(k); return v === undefined ? clone(d) : v; } catch { return clone(d); } };
    const set = (k, v) => { try { GM_setValue(k, v); } catch {} };

    function loadSettings() {
        const s = Object.assign(clone(DEFAULTS), get('settings', {}));
        // keep every known source exactly once, add new ones at the end
        const seen = new Set();
        s.sources = (Array.isArray(s.sources) ? s.sources : []).filter(x => SOURCES[x?.id] && !seen.has(x.id) && seen.add(x.id));
        for (const d of DEFAULT_SOURCES) if (!seen.has(d.id)) s.sources.push({ ...d });
        if (!TONES[s.tone]) s.tone = 'exact';
        if (!['auto', 'light', 'dark'].includes(s.appearance)) s.appearance = 'auto';
        return s;
    }
    const saveSettings = patch => { S.settings = Object.assign(loadSettings(), patch); set('settings', S.settings); };

    const loadSites = () => get('sites', {});
    const loadSite = () => loadSites()[ORIGIN] || {};
    function saveSite(patch) {
        const all = loadSites();
        const cur = Object.assign(all[ORIGIN] || {}, patch);
        for (const k of Object.keys(cur)) if (cur[k] == null || cur[k] === false) delete cur[k];
        if (Object.keys(cur).length) all[ORIGIN] = cur; else delete all[ORIGIN];
        set('sites', all);
        S.site = cur;
    }

    const cacheGet = () => get('cache', {})[ORIGIN] || null;
    function cachePut(r) {
        const all = get('cache', {});
        all[ORIGIN] = { raw: r.raw, source: r.source, detail: r.detail, trail: r.trail, sig: r.sig, ts: r.ts, key: r.key };
        const keys = Object.keys(all);
        if (keys.length > CACHE_MAX) keys.sort((a, b) => (all[a]?.ts || 0) - (all[b]?.ts || 0)).slice(0, keys.length - CACHE_MAX).forEach(k => delete all[k]);
        set('cache', all);
    }

    /* ───────────────────────── state ───────────────────────── */

    const S = {
        settings: loadSettings(),
        site: loadSite(),
        mode: 'idle',      // idle | checking | auto | fallback | custom | off | disabled | yielded
        applied: null,     // hex Prism wants on the title bar
        raw: null,         // color before tone
        source: null, detail: '', trail: {}, fromCache: false,
        yielded: false, yieldedTo: null, yieldColor: null, takeover: false,
    };

    const log = (...a) => { if (S.settings.log) console.log('%c[prism]', 'color:#a78bfa;font-weight:600', ...a); };

    /* ───────────────────────── color utils ───────────────────────── */

    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    function hexToRgb(hex) {
        let h = hex.replace('#', '');
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        const n = parseInt(h, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
        if (mx === mn) return [0, 0, l];
        const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return [h / 6, s, l];
    }
    function hslToRgb(h, s, l) {
        if (!s) return [l * 255, l * 255, l * 255];
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
        return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
    }
    const lum = rgb => { const c = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    function darkenTo(hex, ratio) { // darken until it reaches `ratio` against white
        let [h, s, l] = rgbToHsl(...hexToRgb(hex));
        let rgb = hslToRgb(h, s, l);
        while (contrast(rgb, [255, 255, 255]) < ratio && l > 0) { l -= 0.03; rgb = hslToRgb(h, s, Math.max(l, 0)); }
        return rgbToHex(...rgb);
    }
    function lightenTo(hex, ratio, bg) { // lighten until it reaches `ratio` against a dark background
        let [h, s, l] = rgbToHsl(...hexToRgb(hex));
        let rgb = hslToRgb(h, s, l);
        while (contrast(rgb, bg) < ratio && l < 1) { l += 0.03; rgb = hslToRgb(h, s, Math.min(l, 1)); }
        return rgbToHex(...rgb);
    }
    function toned(hex, tone) {
        if (!hex || tone === 'exact') return hex;
        let [h, s, l] = rgbToHsl(...hexToRgb(hex));
        if (tone === 'dark') l = Math.min(l, 0.22);
        else { l = clamp(l, 0.5, 0.64); if (s > 0.1) s = Math.max(s, 0.62); }
        return rgbToHex(...hslToRgb(h, s, l));
    }
    function normHex(str) { // any user hex → #rrggbb or null
        const m = String(str || '').trim().replace(/^#/, '').toLowerCase();
        if (/^[0-9a-f]{3}$/.test(m)) return '#' + m.split('').map(c => c + c).join('');
        return /^[0-9a-f]{6}$/.test(m) ? '#' + m : null;
    }

    let cvsCtx;
    function mkCanvas(w, h) {
        if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
        const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    }
    function normColor(str) { // any CSS color → #rrggbb (or null if invalid / transparent)
        if (!str) return null;
        cvsCtx = cvsCtx || mkCanvas(1, 1).getContext('2d');
        cvsCtx.fillStyle = '#000'; cvsCtx.fillStyle = str; const a = cvsCtx.fillStyle;
        cvsCtx.fillStyle = '#fff'; cvsCtx.fillStyle = str; const b = cvsCtx.fillStyle;
        if (a !== b) return null;
        if (a[0] === '#') return a;
        const m = a.match(/rgba?\(([^)]+)\)/); if (!m) return null;
        const [r, g, bl, al = 1] = m[1].split(',').map(Number);
        return al < 0.5 ? null : rgbToHex(r, g, bl);
    }

    /* ───────────────────────── fetching ───────────────────────── */

    function gmGet(url, type) {
        return new Promise((res, rej) => {
            if (typeof GM_xmlhttpRequest !== 'function') return rej(new Error('no GM_xmlhttpRequest'));
            GM_xmlhttpRequest({
                method: 'GET', url, anonymous: true, // no cookies: Prism only needs public icons
                responseType: type === 'text' ? undefined : type, timeout: 10000,
                onload: r => (r.status >= 200 && r.status < 300) ? res(type === 'text' ? r.responseText : r.response) : rej(new Error('HTTP ' + r.status)),
                onerror: () => rej(new Error('blocked')), ontimeout: () => rej(new Error('timed out')),
            });
        });
    }
    async function getText(url, creds) {
        try {
            const r = await fetch(url, { credentials: creds ? 'include' : 'same-origin' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return await r.text();
        } catch (e) {
            log('page fetch failed, retrying through Tampermonkey:', url, e.message);
            return gmGet(url, 'text');
        }
    }
    function loadImg(url, cors) {
        return new Promise((res, rej) => {
            const img = new Image();
            if (cors) img.crossOrigin = 'anonymous';
            const t = setTimeout(() => rej(new Error('timed out')), 8000);
            img.onload = () => { clearTimeout(t); res(img); };
            img.onerror = () => { clearTimeout(t); rej(new Error('would not load')); };
            img.src = url;
        });
    }

    // Average color of the biggest group of similar pixels. Skips see-through,
    // near-white and near-black pixels (same rule as 1.9).
    function sample(src) {
        const N = 32, cv = mkCanvas(N, N), cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(src, 0, 0, N, N);
        const d = cx.getImageData(0, 0, N, N).data; // throws if the image is cross-origin-locked
        const groups = new Map(); let total = 0;
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            if (d[i + 3] < 128) continue;
            if (r > 240 && g > 240 && b > 240) continue;
            if (r < 15 && g < 15 && b < 15) continue;
            total++;
            const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
            let e = groups.get(k); if (!e) groups.set(k, e = [0, 0, 0, 0]);
            e[0]++; e[1] += r; e[2] += g; e[3] += b;
        }
        if (!total) return null;
        let best; for (const e of groups.values()) if (!best || e[0] > best[0]) best = e;
        return { hex: rgbToHex(best[1] / best[0], best[2] / best[0], best[3] / best[0]), pct: Math.round(best[0] / total * 100) };
    }

    const colorMemo = new Map();
    function dominant(url) {
        if (!colorMemo.has(url)) colorMemo.set(url, (async () => {
            const attempts = [
                async () => loadImg(url, true),
                async () => createImageBitmap(await gmGet(url, 'blob')),
                async () => { const o = URL.createObjectURL(await gmGet(url, 'blob')); try { return await loadImg(o, false); } finally { setTimeout(() => URL.revokeObjectURL(o), 2000); } },
            ];
            let lastErr;
            for (const [i, a] of attempts.entries()) {
                try {
                    const src = await a();
                    const out = sample(src);
                    src.close?.();
                    if (i) log('icon read through Tampermonkey:', url);
                    return out;
                } catch (e) { lastErr = e; }
            }
            throw new Error(lastErr?.message === 'blocked' ? 'icon blocked' : 'icon unreadable');
        })().catch(e => { colorMemo.delete(url); throw e; }));
        return colorMemo.get(url);
    }

    const manifestMemo = new Map();
    function getManifest() {
        const link = document.querySelector('link[rel~="manifest" i]');
        if (!link?.href) return Promise.resolve(null);
        const url = link.href;
        if (!manifestMemo.has(url)) manifestMemo.set(url, getText(url, link.crossOrigin === 'use-credentials')
            .then(t => ({ url, json: JSON.parse(t) }))
            .catch(e => { manifestMemo.delete(url); throw new Error('manifest ' + (e instanceof SyntaxError ? 'unreadable' : e.message)); }));
        return manifestMemo.get(url);
    }

    /* ───────────────────────── sources ───────────────────────── */

    const isThemeMeta = n => n?.nodeType === 1 && n.tagName === 'META' && (n.getAttribute('name') || '').toLowerCase() === 'theme-color';
    const isIconLink = n => n?.nodeType === 1 && n.tagName === 'LINK' && /(^|\s)(manifest|icon|apple-touch-icon(-precomposed)?)(\s|$)/i.test(n.getAttribute('rel') || '');
    const sizeOf = s => !s ? 0 : /any/i.test(s) ? 1024 : Math.max(0, ...s.split(/\s+/).map(x => parseInt(x, 10) || 0));

    function faviconCandidates() {
        const links = [...document.querySelectorAll('link[rel~="icon" i], link[rel="apple-touch-icon" i], link[rel="apple-touch-icon-precomposed" i]')]
            .filter(l => l.href)
            .map(l => ({ url: l.href, size: sizeOf(l.sizes?.value) || (/svg/.test(l.type) ? 512 : /apple/i.test(l.rel) ? 180 : 32) }))
            .sort((a, b) => b.size - a.size);
        links.push({ url: new URL('/favicon.ico', location.href).href, size: 0 });
        return links.slice(0, 3);
    }
    // A saved result only counts if this page still points at the same manifest / favicon.
    function cacheFits(c) {
        if (c.source === 'favicon') return faviconCandidates().some(l => l.url === c.key);
        return document.querySelector('link[rel~="manifest" i]')?.href === c.key;
    }

    const FINDERS = {
        async icon() {
            const m = await getManifest();
            if (!m) throw new Error('no manifest');
            const icons = (m.json.icons || []).filter(i => i?.src && !/monochrome/i.test(i.purpose || ''));
            if (!icons.length) throw new Error('no icons in manifest');
            icons.sort((a, b) => sizeOf(b.sizes) - sizeOf(a.sizes));
            for (const ic of icons.slice(0, 2)) {
                const url = new URL(ic.src, m.url).href;
                try {
                    const c = await dominant(url);
                    if (c) return { raw: c.hex, detail: `${sizeOf(ic.sizes) || '?'}px · ${c.pct}%`, key: m.url };
                } catch (e) { log('icon failed', url, e.message); }
            }
            throw new Error('icon was all white/black or unreadable');
        },
        async manifest() {
            const m = await getManifest();
            if (!m) throw new Error('no manifest');
            const c = normColor(m.json.theme_color);
            if (!c) throw new Error('no theme_color');
            return { raw: c, detail: '', key: m.url };
        },
        async meta() {
            for (const m of document.querySelectorAll('meta[name="theme-color" i]')) {
                if (m === tag) continue;
                const media = m.getAttribute('media');
                if (media && !matchMedia(media).matches) continue;
                const c = normColor(m.content);
                if (c) return { raw: c, detail: media && /dark/.test(media) ? 'dark mode' : media && /light/.test(media) ? 'light mode' : '' };
            }
            throw new Error('no theme-color tag');
        },
        async favicon() {
                for (const l of faviconCandidates()) {
                try {
                    const c = await dominant(l.url);
                    if (c) return { raw: c.hex, detail: (l.size ? l.size + 'px' : 'favicon.ico') + ` · ${c.pct}%`, key: l.url };
                } catch (e) { log('favicon failed', l.url, e.message); }
            }
            throw new Error('no usable favicon');
        },
        async header() {
            if (document.readyState !== 'complete') await new Promise(r => { addEventListener('load', r, { once: true }); setTimeout(r, 2000); });
            const top = document.elementsFromPoint(Math.round(innerWidth / 2), 1).find(e => e !== ui.host);
            for (let el = top; el; el = el.parentElement) {
                const c = normColor(getComputedStyle(el).backgroundColor);
                if (c) return { raw: c, detail: el.tagName.toLowerCase() + (el.classList[0] ? '.' + el.classList[0] : el.id ? '#' + el.id : '') };
            }
            throw new Error('top of page is see-through');
        },
    };

    /* ───────────────────────── title bar tag ───────────────────────── */

    let tag = null, lastWritten = null, removingOurs = false, fights = [];

    /* Who changed the color? Every write to Prism's tag is traced back through the
       call stack: Tampermonkey/Violentmonkey name each script in it, and a site's
       own code shows up as its file address. */
    let selfWriting = false, lastWrite = null;
    const ME = (typeof GM_info !== 'undefined' && GM_info.script?.name) || 'Prism';
    const MY = [encodeURIComponent(ME), ME].map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const isMine = line => MY.some(n => new RegExp(`(name=|/)${n}(\\.user\\.js)?([&#?\\s):]|$)`, 'i').test(line));
    function writerFromStack(stack) {
        for (const line of String(stack || '').split('\n').slice(1)) {
            if (isMine(line)) continue;
            const n = line.match(/[?&]name=([^&#\s):]+)/) || line.match(/-extension:\/\/[^/]+\/(?:.*\/)?([^/?#\s):]+)\.user\.js/);
            if (n) return { kind: 'userscript', name: decodeURIComponent(n[1]).replace(/\.user\.js$/i, '').replace(/[-_]+/g, ' ').trim(), line: line.trim() };
            if (/(chrome|moz|safari-web)-extension:\/\//.test(line)) return { kind: 'extension', name: 'A browser extension', line: line.trim() };
            const u = line.match(/https?:\/\/[^\s)'"]+/);
            if (u) { try { return { kind: 'site', name: new URL(u[0]).hostname.replace(/^www\./, ''), line: line.trim() }; } catch {} }
        }
        return { kind: 'unknown', name: null };
    }
    // Only Prism's own <meta> gets the tracing: nothing global in the page is touched.
    function hookTag(el) {
        try {
            const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            const d = Object.getOwnPropertyDescriptor(W.HTMLMetaElement.prototype, 'content'), sa = W.Element.prototype.setAttribute;
            const note = () => { if (!selfWriting) lastWrite = { ...writerFromStack(new Error().stack), at: Date.now() }; };
            Object.defineProperty(el, 'content', { configurable: true, enumerable: true, get() { return d.get.call(this); }, set(v) { note(); d.set.call(this, v); } });
            Object.defineProperty(el, 'setAttribute', { configurable: true, writable: true, value(n, v) { if (String(n).toLowerCase() === 'content') note(); return sa.call(this, n, v); } });
        } catch (e) { /* no page access: changes are reported as "another script" */ }
    }

    // The site's own code grabbed "the first theme-color tag" (which is Prism's) to change its
    // color. Move that change onto the site's own tag, where it belongs, and put Prism's back.
    function adoptSiteWrite(w) {
        const v = tag.content;
        let own = [...document.head.querySelectorAll('meta[name="theme-color" i]')].find(m => m !== tag && !m.getAttribute('media'));
        if (!own) { own = document.createElement('meta'); own.name = 'theme-color'; own.setAttribute('data-prism-site', ''); tag.after(own); }
        own.content = v;
        selfWriting = true; tag.content = lastWritten; selfWriting = false;
        log(`${w.name}'s own code changed its color to ${v}. Kept as "Site's own color", Prism stays on top.`, w.line || '');
    }

    function whenHead(cb) {
        if (document.head) return cb();
        const mo = new MutationObserver(() => { if (document.head) { mo.disconnect(); cb(); } });
        mo.observe(document, { childList: true, subtree: true });
    }
    function writeColor(hex) {
        if (S.yielded || !hex) return;
        whenHead(() => {
            if (S.yielded) return;
            if (!tag) { tag = document.createElement('meta'); tag.name = 'theme-color'; tag.setAttribute('data-prism', VERSION); hookTag(tag); }
            lastWritten = hex;
            if (tag.content !== hex) { selfWriting = true; tag.content = hex; selfWriting = false; }
            // Browsers use the first theme-color tag, so ours goes at the top of <head>.
            if (!tag.isConnected || (S.takeover && document.head.querySelector('meta[name="theme-color" i]') !== tag)) document.head.prepend(tag);
        });
    }
    function removeTag() {
        lastWritten = null;
        if (tag?.isConnected) { removingOurs = true; tag.remove(); }
    }
    function currentTitleColor() {
        for (const m of document.querySelectorAll('meta[name="theme-color" i]')) {
            const media = m.getAttribute('media');
            if (media && !matchMedia(media).matches) continue;
            const c = normColor(m.content); if (c) return c;
        }
        return null;
    }
    function fight() { // true = too much back-and-forth, give up
        const now = Date.now();
        fights = fights.filter(t => now - t < 5000); fights.push(now);
        return fights.length >= 4;
    }

    function yieldTo(who, why) {
        if (S.yielded) return;
        S.yielded = true; S.takeover = false;
        S.yieldedTo = who || null;
        S.yieldColor = currentTitleColor();
        S.mode = 'yielded';
        log(`standing by: ${who || 'another script'} is setting the title bar (${why})`, S.yieldColor || '');
        ui.refresh();
    }
    function takeOver() {
        S.yielded = false; S.takeover = true; S.yieldedTo = null; fights = [];
        log('taking the title bar back for this page');
        resolve({ force: true });
    }

    function watchHead() {
        const mo = new MutationObserver(recs => {
            let foreignEdit = false, jumpedAhead = false, lostOurs = false, siteChanged = false, linksChanged = false;
            for (const r of recs) {
                if (r.type === 'attributes') {
                    if (r.target === tag) { if (tag.content !== lastWritten && lastWritten) foreignEdit = true; }
                    else if (isThemeMeta(r.target)) siteChanged = true;
                    else if (isIconLink(r.target) || (r.attributeName === 'rel' && r.target.tagName === 'LINK' && /(^|\s)(manifest|icon|apple-touch-icon)/i.test(r.oldValue || ''))) linksChanged = true;
                    continue;
                }
                for (const n of r.removedNodes) {
                    if (n === tag) { if (removingOurs) removingOurs = false; else if (lastWritten) lostOurs = true; }
                    else if (isThemeMeta(n)) siteChanged = true;
                    else if (isIconLink(n)) linksChanged = true;
                }
                for (const n of r.addedNodes) {
                    if (isIconLink(n)) linksChanged = true;
                    if (n === tag || !isThemeMeta(n)) continue;
                    siteChanged = true;
                    if (tag?.isConnected && lastWritten && (n.compareDocumentPosition(tag) & Node.DOCUMENT_POSITION_FOLLOWING)) jumpedAhead = true;
                }
            }
            checkNav();
            if (S.yielded) { S.yieldColor = currentTitleColor(); ui.refresh(); return; }
            const w = foreignEdit && lastWrite && Date.now() - lastWrite.at < 3000 ? lastWrite : { kind: 'unknown', name: null };
            lastWrite = null;
            if (foreignEdit && w.kind === 'site') {
                adoptSiteWrite(w);
                if (S.source === 'meta' && S.mode === 'auto') debounced(resolve, 150)();
                return;
            }
            if (foreignEdit || jumpedAhead) {
                if (w.line) log('changed by:', w.line);
                if (!S.takeover) return yieldTo(w.name, foreignEdit ? 'changed Prism\'s color' : 'added its own color in front');
                if (fight()) { S.takeover = false; return yieldTo(w.name, 'kept changing it back'); }
                if (foreignEdit) { selfWriting = true; tag.content = lastWritten; selfWriting = false; } else document.head.prepend(tag);
                return;
            }
            if (lostOurs) { // frameworks like Turbo swap the <head>; put ours back unless it keeps happening
                if (fight()) return yieldTo(null, 'kept removing Prism\'s color');
                document.head.prepend(tag);
                return;
            }
            if (siteChanged && S.source === 'meta' && S.mode === 'auto') debounced(resolve, 250)();
            // manifest or favicon swapped without a page load. If the saved result still fits, this is a
            // quick no-op; otherwise it re-checks. Debounced so animated favicon badges don't spam it.
            if (linksChanged && ['auto', 'fallback'].includes(S.mode)) debounced(resolve, 800)();
        });
        let watched = null;
        const watch = (first = false) => {
            if (document.head === watched) return;
            mo.disconnect(); watched = document.head;
            if (!watched) return;
            mo.observe(watched, { childList: true, subtree: true, attributes: true, attributeFilter: ['content', 'name', 'media', 'href', 'rel'], attributeOldValue: true });
            if (first) return;
            // the whole <head> was swapped out: put Prism's tag back and re-read the site's colors
            if (lastWritten && !S.yielded && tag && !tag.isConnected) watched.prepend(tag);
            debounced(resolve, 250)();
        };
        watch(true);

        // hand-off: another script can claim the title bar with <html data-titlebar-owner="Name">
        const checkOwner = () => {
            const o = document.documentElement.getAttribute('data-titlebar-owner');
            if (o && !S.takeover && !S.yielded) { removeTag(); yieldTo(o, 'claimed the title bar'); }
            else if (!o && S.yielded && S.yieldedTo) { S.yielded = false; S.yieldedTo = null; resolve({ force: true }); }
        };
        // one cheap observer on <html> itself (no subtree): catches a replaced <head> and the hand-off attribute
        new MutationObserver(() => { watch(); checkOwner(); }).observe(document.documentElement, { childList: true, attributes: true, attributeFilter: ['data-titlebar-owner'] });
        checkOwner();
    }

    /* ───────────────────────── resolve ───────────────────────── */

    const timers = {};
    const debounced = (fn, ms) => () => { clearTimeout(timers[fn.name]); timers[fn.name] = setTimeout(fn, ms); };
    const isApp = () => matchMedia('(display-mode: standalone), (display-mode: window-controls-overlay), (display-mode: minimal-ui), (display-mode: tabbed)').matches;
    const sourceSig = () => S.settings.sources.map(s => s.id + (s.on ? 1 : 0)).join(',');

    function idle(mode, msg) {
        S.mode = mode; S.applied = null; S.source = null; S.trail = {};
        removeTag(); log(msg); ui.refresh();
    }
    function apply(raw, info) {
        S.raw = raw; S.source = info.source; S.detail = info.detail || ''; S.trail = info.trail || {};
        S.fromCache = !!info.fromCache;
        S.applied = info.source === 'custom' ? raw : toned(raw, S.settings.tone);
        S.mode = info.source === 'custom' ? 'custom' : info.source === 'fallback' ? 'fallback' : 'auto';
        writeColor(S.applied);
        log(S.mode === 'custom' ? 'your color' : `from ${SOURCES[S.source]?.label || 'fallback'}${S.detail ? ' (' + S.detail + ')' : ''}`,
            S.raw, S.applied !== S.raw ? `→ ${S.settings.tone} → ${S.applied}` : '', '→ applied');
        ui.refresh();
    }

    let seq = 0;
    async function resolve({ force = false } = {}) {
        const my = ++seq;
        S.settings = loadSettings(); S.site = loadSite();
        if (!S.settings.enabled) return idle('disabled', 'off everywhere');
        if (S.site.off) return idle('off', 'off for ' + HOST);
        if (S.yielded) return ui.refresh();
        if (S.site.custom) return apply(S.site.custom, { source: 'custom' });

        const sig = sourceSig(), c = cacheGet();
        if (!force && c && c.sig === sig && Date.now() - c.ts < CACHE_DAYS * 864e5 && ['icon', 'manifest', 'favicon'].includes(c.source) && cacheFits(c))
            return apply(c.raw, { ...c, fromCache: true });

        S.mode = 'checking'; ui.refresh();
        log('checking', HOST);
        const trail = {}; let found = null;
        for (const { id, on } of S.settings.sources) {
            if (!on) { trail[id] = { state: 'skipped' }; continue; }
            if (found) continue;
            try {
                const r = await FINDERS[id]();
                if (my !== seq) return;
                found = { ...r, source: id };
                trail[id] = { state: 'used', note: r.detail };
                log(`✓ ${SOURCES[id].label}`, r.raw, r.detail);
            } catch (e) {
                if (my !== seq) return;
                trail[id] = { state: 'failed', note: e.message };
                log(`✗ ${SOURCES[id].label}: ${e.message}`);
            }
        }
        if (!found) found = { raw: FALLBACK, source: 'fallback', detail: '' };
        Object.assign(found, { trail, sig, ts: Date.now() });
        if (found.source !== 'fallback') cachePut(found);
        apply(found.raw, found);
    }

    /* ───────────────────────── navigation & live updates ───────────────────────── */

    let lastHref = location.href;
    function checkNav() {
        if (location.href === lastHref) return;
        lastHref = location.href;
        debounced(resolve, 400)();
    }

    /* ───────────────────────── UI ───────────────────────── */

    const SVGNS = 'http://www.w3.org/2000/svg';
    // The app-icon glyph as glass tubing (same shapes as tools/icons.js), tinted by the tile's
    // live color, so it changes with the script's state. Written by tools/live_glyphs.py.
    const GLASS_GLYPHS = {"hourglass":{"fills":[["M36.5 34 C36.5 43 46.5 46 46.5 50 C46.5 54 36.5 57 36.5 66 L63.5 66 C63.5 57 53.5 54 53.5 50 C53.5 46 63.5 43 63.5 34 Z",0.08],["M41 38.5 L59 38.5 C57.5 43.5 51.5 45.5 50 48 C48.5 45.5 42.5 43.5 41 38.5 Z",0.34],["M41 63.5 C43 58.5 47 57.5 50 57.5 C53 57.5 57 58.5 59 63.5 Z",0.38]],"tubes":[["M36.5 34 C36.5 43 46.5 46 46.5 50 C46.5 54 36.5 57 36.5 66 M63.5 34 C63.5 43 53.5 46 53.5 50 C53.5 54 63.5 57 63.5 66",3.6],["M32 31 H68 M32 69 H68",4.6]]},"prism":{"fills":[["M50 31 L70 66 H30 Z",0.08]],"tubes":[["M50 31 L70 66 H30 Z",4],["M24 59 L46 52.5",2.6],["M54 50 L77 43",2.6]]},"magnifier":{"fills":[["M45 30 A15 15 0 1 1 44.99 30 Z",0.12]],"tubes":[["M45 30 A15 15 0 1 1 44.99 30 Z",4.2],["M56.2 56.2 L69 69",5.6]],"shine":["M36 41 A10 10 0 0 1 42 34.6"]}};
    let glassGlyphN = 0;
    function glassGlyph(kind) {
        const NS = 'http://www.w3.org/2000/svg', G = GLASS_GLYPHS[kind], id = 'gg-blur-' + (++glassGlyphN);
        const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
        const svg = mk('svg', { viewBox: '20 20 60 60', class: 'gg', 'aria-hidden': 'true' });
        const f = mk('filter', { id, x: '-40%', y: '-40%', width: '180%', height: '180%' });
        f.append(mk('feGaussianBlur', { stdDeviation: '1.5' }));
        const defs = mk('defs', {}); defs.append(f); svg.append(defs);
        const g = mk('g', { class: 'gg-g' }); svg.append(g);
        const line = 'fill:none;stroke-linecap:round;stroke-linejoin:round;';
        for (const [d, o] of G.fills || []) g.append(mk('path', { d, style: 'fill:#fff;fill-opacity:' + o + ';stroke:none' }));
        for (const [d, w] of G.tubes) {
            const W = w * 1.25;
            g.append(mk('path', { d, filter: 'url(#' + id + ')', style: line + 'stroke:rgba(var(--a-rgb),.6);stroke-width:' + (W + 3) }));
            g.append(mk('path', { d, style: line + 'stroke:#fff;stroke-opacity:.98;stroke-width:' + W }));
            g.append(mk('path', { d, style: line + 'stroke:var(--fill-hi, var(--bg-fill, var(--bg)));stroke-opacity:.85;stroke-width:' + (W - 1.7) }));
            g.append(mk('path', { d, transform: 'translate(-.35 -.45)', style: line + 'stroke:#fff;stroke-opacity:.75;stroke-width:' + Math.max(.7, w * .3) }));
        }
        for (const d of G.shine || []) g.append(mk('path', { d, style: line + 'stroke:#fff;stroke-opacity:.8;stroke-width:2' }));
        return svg;
    }

    function icon(paths, size = 14, extra = {}) {
        const s = document.createElementNS(SVGNS, 'svg');
        s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
        s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', extra.sw || 2);
        s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
        for (const d of [].concat(paths)) { const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); s.append(p); }
        return s;
    }
    const ICONS = {
        prism: ['M12 3.5 21 19.5H3Z', 'M2 13.2 11 12.2', 'M13.5 11.6 22 8.5', 'M13.6 12.3 22 12.6'],
        close: ['M6 6l12 12', 'M18 6 6 18'],
        grip: ['M9 6h.01', 'M15 6h.01', 'M9 12h.01', 'M15 12h.01', 'M9 18h.01', 'M15 18h.01'],
        drop: ['m14.5 6.5 3 3', 'M19.4 4.6a2.1 2.1 0 0 0-3 0L13.5 7.5l3 3 2.9-2.9a2.1 2.1 0 0 0 0-3Z', 'M13.5 7.5 5 16v3h3l8.5-8.5'],
        refresh: ['M3 12a9 9 0 0 1 15.5-6.2L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-15.5 6.2L3 16', 'M3 21v-5h5'],
        check: ['M5 12.5l4.5 4.5L19 7'],
        sun: ['M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7', 'M12 2.5v2', 'M12 19.5v2', 'M2.5 12h2', 'M19.5 12h2', 'M5.3 5.3l1.4 1.4', 'M17.3 17.3l1.4 1.4', 'M5.3 18.7l1.4-1.4', 'M17.3 6.7l1.4-1.4'],
        moon: ['M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6Z'],
    };

    function h(tagName, attrs, ...kids) {
        const el = document.createElement(tagName);
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

    const CSS = `
:host{all:initial}
*{box-sizing:border-box;margin:0}
[hidden]{display:none!important}
.panel{
  /* light and dark glass: only these neutrals swap; the accent colors stay */
  --text:#1d1d1f;--sub:rgba(29,29,31,.64);--line:rgba(0,0,0,.07);--ctl:rgba(0,0,0,.055);--ctl-hi:rgba(0,0,0,.1);--sw-off:rgba(0,0,0,.13);
  --field:rgba(255,255,255,.6);--field-hi:#fff;--edge:rgba(255,255,255,.8);--hl:#fff;--drop:rgba(0,0,0,.34);--ck-edge:rgba(0,0,0,.22);
  --knob:#fff;--stripe-a:#fff;--stripe-b:#f0f0f2;--faint:rgba(0,0,0,.3);
  --mono:"SF Mono",ui-monospace,"Cascadia Code","JetBrains Mono",Consolas,monospace;
  position:fixed;top:16px;right:16px;width:400px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow:auto;overscroll-behavior:contain;
  font:13px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable Text","Segoe UI",Inter,system-ui,sans-serif;
  color:var(--text);border-radius:22px;scrollbar-width:none;
  background:radial-gradient(120% 60% at 0% 0%,rgba(var(--a-rgb),var(--glow)),transparent 64%),var(--bg);
  backdrop-filter:blur(28px) saturate(170%);-webkit-backdrop-filter:blur(28px) saturate(170%);
  border:1px solid var(--edge);
  box-shadow:0 0 0 .5px rgba(var(--a-rgb),.4),0 0 40px -12px rgba(var(--a-rgb),calc(var(--glow)*3)),0 28px 64px -18px var(--drop),inset 0 1px 0 var(--hl);
  transition:background-color .2s,box-shadow .2s;animation:in .18s cubic-bezier(.2,.8,.2,1)}
.panel[data-theme=dark]{--text:#f2f2f5;--sub:rgba(235,235,245,.62);--line:rgba(255,255,255,.09);--ctl:rgba(255,255,255,.08);--ctl-hi:rgba(255,255,255,.14);
  --sw-off:rgba(255,255,255,.2);--field:rgba(255,255,255,.06);--field-hi:rgba(255,255,255,.12);--edge:rgba(255,255,255,.12);--hl:rgba(255,255,255,.1);
  --drop:rgba(0,0,0,.6);--ck-edge:rgba(255,255,255,.3);--faint:rgba(255,255,255,.3);--knob:#55555f;--stripe-a:#2c2c33;--stripe-b:#222228;color-scheme:dark}
.panel::-webkit-scrollbar{display:none}
@keyframes in{from{opacity:0;transform:translateY(-6px) scale(.98)}}
@media (prefers-reduced-motion:reduce){.panel,.panel *{animation:none!important;transition:none!important}}
button{font:inherit;color:inherit;cursor:pointer}
.head{display:flex;align-items:center;gap:11px;padding:16px 16px 4px}
.logo{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;color:var(--on);flex:none;
  background:linear-gradient(140deg,var(--fill-hi),var(--fill));box-shadow:0 4px 14px -4px rgba(var(--a-rgb),.9),inset 0 1px 0 rgba(255,255,255,.35)}
/* glass tile like the app icon; the color still follows the script's state */
.logo{position:relative;overflow:hidden;color:#fff;
  background:radial-gradient(120% 90% at 50% 62%,rgba(11,11,22,.55),rgba(11,11,22,0) 70%),linear-gradient(145deg,color-mix(in srgb,var(--fill-hi) 72%,#0b0b16),color-mix(in srgb,var(--fill) 46%,#0b0b16));
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.3),inset 0 1px 0 rgba(255,255,255,.5),inset 0 0 6px 1px rgba(var(--a-rgb),.55),inset 0 -8px 12px -8px rgba(0,0,0,.45),0 4px 16px -4px rgba(var(--a-rgb),.95),0 0 12px -3px rgba(var(--a-rgb),.6)}
.logo::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(180deg,rgba(255,255,255,.28),rgba(255,255,255,0) 48%),linear-gradient(135deg,transparent 34%,rgba(255,255,255,.09) 34% 44%,transparent 44%)}
.logo svg{position:relative;filter:drop-shadow(0 0 1.2px rgba(255,255,255,.95)) drop-shadow(0 0 4px rgba(var(--a-rgb),.95))}
.logo svg.gg{width:88%;height:88%;filter:none;overflow:visible}
.title{font-weight:650;font-size:15.5px;letter-spacing:-.015em}
.sub{font-size:11.5px;color:var(--sub)}
.x{margin-left:auto;width:26px;height:26px;border-radius:50%;border:0;background:var(--ctl);display:grid;place-items:center;color:var(--sub)}
.x:hover{background:var(--ctl-hi);color:var(--text)}
/* sun/moon switch: light or dark glass (the device's choice until it's flipped) */
.mode{position:relative;flex:none;margin-left:auto;width:48px;height:26px;border:0;border-radius:13px;background:var(--ctl);padding:0 6px;display:flex;align-items:center;justify-content:space-between;color:var(--sub)}
.mode .mi{position:relative;z-index:1;display:grid;transition:color .18s}
.mode .knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:var(--knob);box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s cubic-bezier(.3,.7,.3,1)}
.panel[data-theme=dark] .mode .knob{transform:translateX(22px)}
.panel:not([data-theme=dark]) .mode .sun,.panel[data-theme=dark] .mode .moon{color:var(--text)}
.mode+.x{margin-left:0}
.siteline{display:flex;align-items:center;gap:8px;padding:6px 16px 12px;font:12px var(--mono);color:var(--sub)}
.siteline b{color:var(--text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{font:600 9.5px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;padding:4px 7px;border-radius:6px;background:var(--ctl);color:var(--sub);white-space:nowrap}
.card{margin:0 12px 6px;padding:12px 14px;border-radius:14px;background:rgba(var(--a-rgb),.09);border:1px solid rgba(var(--a-rgb),.22)}
.sec{padding:13px 16px;border-top:1px solid var(--line)}
.label{display:flex;align-items:center;gap:7px;font:600 10.5px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--ink);margin-bottom:10px}
.label::before{content:"";width:5px;height:5px;transform:rotate(45deg);background:var(--fill);box-shadow:0 0 6px rgba(var(--a-rgb),.9)}
.label i{font-style:normal;letter-spacing:.02em;text-transform:none;font-family:inherit;color:var(--sub);font-weight:400;margin-left:auto}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px}
.row+.row{margin-top:8px}
.t{font-weight:500}
.d{font-size:11.5px;color:var(--sub);margin-top:1px}
.sw{flex:none;position:relative;width:38px;height:23px;border:0;border-radius:12px;background:var(--sw-off);transition:background .18s}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:19px;height:19px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s cubic-bezier(.3,.7,.3,1)}
.sw[aria-checked=true]{background:var(--fill);box-shadow:0 0 12px -2px rgba(var(--a-rgb),.7)}
.sw[aria-checked=true]::after{transform:translateX(15px)}
.seg{display:flex;padding:2px;border-radius:10px;background:var(--ctl)}
.seg button{flex:1;border:0;background:none;padding:6px 0;border-radius:8px;font-size:12px;font-weight:500;transition:background .15s,color .15s}
.seg button.on{background:var(--fill);color:var(--on);box-shadow:0 1px 4px rgba(0,0,0,.14),0 0 14px -4px rgba(var(--a-rgb),.8)}
.hint{font-size:11.5px;color:var(--sub);margin-top:8px}
.list{display:flex;flex-direction:column;gap:6px}
.src{display:flex;align-items:center;gap:9px;padding:7px 10px 7px 6px;border-radius:11px;background:var(--field);border:1px solid var(--line);user-select:none;transition:box-shadow .15s,border-color .15s,opacity .15s}
.src.used{border-color:rgba(var(--a-rgb),.6);box-shadow:0 0 0 3px rgba(var(--a-rgb),.13),0 0 18px -6px rgba(var(--a-rgb),.8)}
.src.failed .nm,.src.skipped .nm{opacity:.45}
.src.drag{background:var(--bg-solid);box-shadow:0 12px 26px -10px rgba(0,0,0,.35);transform:scale(1.015)}
.src.fb{border-style:dashed;border-color:var(--faint);background:transparent;padding-left:10px}
.grip{border:0;background:none;color:var(--sub);padding:2px;border-radius:6px;cursor:grab;touch-action:none;display:grid}
.grip:active{cursor:grabbing}
.grip:focus-visible,.ck:focus-visible,.sw:focus-visible,.btn:focus-visible,.seg button:focus-visible{outline:2px solid var(--fill);outline-offset:2px}
.ck{flex:none;width:17px;height:17px;border-radius:5px;border:1.5px solid var(--ck-edge);background:var(--field-hi);display:grid;place-items:center;padding:0;color:var(--on)}
.ck svg{opacity:0}
.ck.on{background:var(--fill);border-color:var(--fill)}
.ck.on svg{opacity:1}
.nm{display:flex;flex-direction:column;min-width:0}
.nm small{font-size:11px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chip{margin-left:auto;flex:none;font:600 9px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;padding:4px 7px;border-radius:6px}
.chip.used{background:var(--fill);color:var(--on)}
.chip.failed,.chip.skipped{background:var(--ctl);color:var(--sub)}
code,.mono{font:12px var(--mono)}
.btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:10px;border:1px solid var(--line);background:var(--field);font-size:12px;font-weight:500;transition:background .15s}
.btn:hover{background:var(--field-hi)}
.btn.primary{background:var(--fill);color:var(--on);border-color:transparent;box-shadow:0 4px 14px -6px rgba(var(--a-rgb),1)}
.btn.primary:hover{filter:brightness(1.06)}
.btn.sm{height:26px;padding:0 9px;font-size:11.5px}
.link{border:0;background:none;padding:0;color:var(--ink);font-size:11.5px;font-weight:500}
.link:hover{text-decoration:underline}
.pick{display:flex;align-items:center;gap:10px}
.swatch{flex:none;width:48px;height:48px;border-radius:14px;background:var(--a);box-shadow:inset 0 0 0 1px rgba(0,0,0,.08),inset 0 1px 0 rgba(255,255,255,.3),0 8px 18px -8px rgba(var(--a-rgb),1)}
.swatch.none{background:repeating-linear-gradient(135deg,var(--stripe-a) 0 6px,var(--stripe-b) 6px 12px)}
.hexcol{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}
.hex{display:flex;align-items:center;height:32px;padding:0 10px;border-radius:10px;border:1px solid var(--line);background:var(--field);transition:border-color .15s,box-shadow .15s}
.hex:focus-within{border-color:var(--fill);box-shadow:0 0 0 3px rgba(var(--a-rgb),.18)}
.hex.bad{border-color:#ff3b30;box-shadow:0 0 0 3px rgba(255,59,48,.15)}
.hex span{font:13px var(--mono);color:var(--sub)}
.hex input{border:0;outline:0;background:none;width:100%;font:13px var(--mono);color:var(--text);padding:0 0 0 2px}
.hexcol small{font-size:11px;color:var(--sub)}
.notes{display:flex;gap:5px;align-items:baseline;white-space:nowrap}
.notes .link{font-size:11px}
.foot{position:sticky;bottom:0;border-top:1px solid var(--line);background:var(--bg-solid);border-radius:0 0 20px 20px}
.status{display:flex;align-items:center;gap:10px;padding:11px 14px 6px}
.dot{flex:none;width:10px;height:10px;border-radius:50%;background:var(--a);box-shadow:0 0 0 3px rgba(var(--a-rgb),.18),0 0 10px rgba(var(--a-rgb),.9)}
.dot.none{background:var(--sub);box-shadow:0 0 0 3px var(--ctl)}
.dot.pulse{animation:pulse .6s ease-out}
@keyframes pulse{0%{transform:scale(1.7)}100%{transform:scale(1)}}
.stxt{flex:1;font-size:11.5px;line-height:1.4;color:var(--sub);min-width:0}
.stxt b{color:var(--text);font-weight:600}
.stxt code{font-size:11px;color:var(--text)}
.ibtn{flex:none;width:24px;height:24px;border:0;border-radius:7px;background:none;color:var(--sub);display:grid;place-items:center}
.ibtn:hover{background:var(--ctl);color:var(--text)}
.ibtn.spin svg{animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.keys{padding:0 14px 12px 34px;font-size:10.5px;line-height:1.7;color:var(--sub)}
kbd{font:10px var(--mono);padding:1px 4px;border-radius:4px;background:var(--ctl)}
`;

    const ui = {
        host: null, root: null, el: {}, dragging: false, dropperOpen: false, lastDot: null,

        toggle() { this.host ? this.close() : this.open(); },

        open() {
            if (this.host) return;
            try {
                const host = this.host = h('prism-menu', { style: 'all:initial;position:fixed;inset:auto;top:0;right:0;margin:0;padding:0;border:0;width:0;height:0;overflow:visible;background:transparent;z-index:2147483647;display:block' });
                const root = this.root = host.attachShadow({ mode: 'closed' });
                try { const sh = new CSSStyleSheet(); sh.replaceSync(CSS); root.adoptedStyleSheets = [sh]; }
                catch { root.append(h('style', { text: CSS })); }
                root.append(this.build());
                this.remounts = 0;
                this.mount();
                this.refresh();
                this.onDown = e => { if (!this.dropperOpen && !e.composedPath().includes(host)) this.close(); };
                addEventListener('pointerdown', this.onDown, true);
                // some sites clear out elements they don't know about; put the menu back if that happens
                this.guard = new MutationObserver(() => { if (this.host && !this.host.isConnected && this.remounts++ < 5) { log('menu was removed by the page, putting it back'); this.mount(); } });
                this.remounts = 0;
                this.guard.observe(document.documentElement, { childList: true, subtree: true });
                log('menu opened');
            } catch (e) {
                console.error('[prism] menu failed to open:', e);
                this.host?.remove(); this.host = this.root = null;
            }
        },

        // Top layer (popover) sits above everything the site or other scripts draw, whatever their z-index.
        mount() {
            const host = this.host;
            // body first; if the page throws it out of the body, mount on <html> instead
            ((this.remounts ? null : document.body) || document.documentElement).append(host);
            if (host.showPopover) { try { host.popover = 'manual'; host.showPopover(); } catch (e) { log('top layer unavailable:', e.message); } }
        },

        close() {
            if (!this.host) return;
            removeEventListener('pointerdown', this.onDown, true);
            this.guard?.disconnect();
            const host = this.host; this.host = this.root = null; this.el = {}; this.lastDot = null;
            try { host.hidePopover?.(); } catch {}
            host.remove();
        },

        build() {
            const E = this.el;
            const panel = h('div', { class: 'panel', role: 'dialog', 'aria-label': 'Prism settings' });

            E.logo = h('div', { class: 'logo' }, glassGlyph('prism'));
            panel.append(
                h('div', { class: 'head' }, E.logo,
                    h('div', null, h('div', { class: 'title', text: 'Prism' }), h('div', { class: 'sub', text: 'Title bar color for every app' })),
                    E.mode = h('button', { class: 'mode', role: 'switch', 'aria-label': 'Dark mode', title: 'Light or dark',
                        onclick: () => { saveSettings({ appearance: this.dark() ? 'light' : 'dark' }); this.refresh(); } },
                        h('span', { class: 'knob' }), h('span', { class: 'mi sun' }, icon(ICONS.sun, 12)), h('span', { class: 'mi moon' }, icon(ICONS.moon, 12))),
                    h('button', { class: 'x', 'aria-label': 'Close', onclick: () => this.close() }, icon(ICONS.close, 13))),
                h('div', { class: 'siteline' }, h('b', { text: HOST || location.href }), E.kind = h('span', { class: 'pill' })),
            );

            E.master = toggle(true, () => { saveSettings({ enabled: !S.settings.enabled }); resolve(); }, 'Prism on or off');
            E.masterD = h('div', { class: 'd' });
            panel.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', null, h('div', { class: 't', text: 'Prism' }), E.masterD), E.master)));

            // SOURCES
            E.list = h('div', { class: 'list' });
            E.fb = h('div', { class: 'src fb' });
            E.srcHint = h('div', { class: 'hint' });
            panel.append(h('div', { class: 'sec' },
                h('div', { class: 'label' }, 'Sources', h('i', { text: 'drag to reorder' })),
                E.list, h('div', { style: 'height:6px' }), E.fb,
                h('div', { class: 'row', style: 'margin-top:8px;min-height:0' }, E.srcHint,
                    h('button', { class: 'link', text: 'Reset order', onclick: () => { saveSettings({ sources: clone(DEFAULT_SOURCES) }); resolve(); } }))));

            // TONE
            E.toneSeg = h('div', { class: 'seg' },
                ...Object.entries(TONES).map(([v, t]) =>
                    h('button', { 'data-v': v, text: t.label, onclick: () => { saveSettings({ tone: v }); if (S.raw && (S.mode === 'auto' || S.mode === 'fallback')) apply(S.raw, { source: S.source, detail: S.detail, trail: S.trail, fromCache: S.fromCache }); else resolve(); } })));
            E.toneD = h('div', { class: 'hint' });
            panel.append(h('div', { class: 'sec' }, h('div', { class: 'label', text: 'Tone' }), E.toneSeg, E.toneD));

            // THIS SITE
            E.swatch = h('div', { class: 'swatch' });
            E.hexIn = h('input', { spellcheck: 'false', maxlength: '7', 'aria-label': 'Hex color', placeholder: 'rrggbb' });
            E.hexBox = h('label', { class: 'hex' }, h('span', { text: '#' }), E.hexIn);
            E.hexNote = h('small');
            const ED = window.EyeDropper || (typeof unsafeWindow !== 'undefined' && unsafeWindow.EyeDropper);
            E.dropper = ED ? h('button', { class: 'btn primary', onclick: () => this.dropper(ED) }, icon(ICONS.drop, 14), 'Dropper') : null;
            E.off = toggle(false, () => { saveSite({ off: !S.site.off }); resolve(); }, 'Off for this site');
            E.auto = h('button', { class: 'link', text: 'Back to auto', onclick: () => { saveSite({ custom: null }); resolve(); } });
            panel.append(h('div', { class: 'sec' },
                h('div', { class: 'label', text: 'This site' }),
                h('div', { class: 'pick' }, E.swatch, h('div', { class: 'hexcol' }, E.hexBox, h('div', { class: 'notes' }, E.hexNote, E.auto)), E.dropper),
                h('div', { class: 'row', style: 'margin-top:12px' }, h('div', null, h('div', { class: 't', text: 'Off for this site' }), h('div', { class: 'd', text: 'Leave the title bar to the site' })), E.off)));

            E.hexIn.addEventListener('input', () => {
                const v = normHex(E.hexIn.value);
                E.hexBox.classList.toggle('bad', !v && E.hexIn.value.trim() !== '');
                if (!v) return;
                saveSite({ custom: v, off: null });
                if (S.yielded) { S.yielded = false; S.takeover = true; }
                apply(v, { source: 'custom' });
            });
            E.hexIn.addEventListener('blur', () => { E.hexBox.classList.remove('bad'); this.refresh(); });
            E.hexIn.addEventListener('keydown', e => { if (e.key === 'Enter') E.hexIn.blur(); });

            // APPEARANCE
            E.auto2 = toggle(true, () => { saveSettings({ appearance: S.settings.appearance === 'auto' ? (this.dark() ? 'dark' : 'light') : 'auto' }); this.refresh(); }, 'Match my device');
            panel.append(h('div', { class: 'sec' },
                h('div', { class: 'label', text: 'Appearance' }),
                h('div', { class: 'row' }, h('div', null, h('div', { class: 't', text: 'Match my device' }), h('div', { class: 'd', text: 'Light or dark follows your device until you flip the switch up top' })), E.auto2)));

            // TROUBLESHOOTING
            E.log = toggle(false, () => { saveSettings({ log: !S.settings.log }); log('console logging on', S); this.refresh(); }, 'Log to the console');
            panel.append(h('div', { class: 'sec' },
                h('div', { class: 'label', text: 'Troubleshooting' }),
                h('div', { class: 'row' }, h('div', null, h('div', { class: 't', text: 'Log to the console' }), h('div', { class: 'd', text: 'Lines start with [prism] (F12)' })), E.log)));

            // STATUS
            E.dot = h('div', { class: 'dot' });
            E.stxt = h('div', { class: 'stxt' });
            E.take = h('button', { class: 'btn sm', text: 'Take over', title: 'Use Prism\'s color on this page anyway', onclick: takeOver });
            E.refresh = h('button', { class: 'ibtn', title: 'Check this site again', 'aria-label': 'Check again', onclick: () => { colorMemo.clear(); manifestMemo.clear(); resolve({ force: true }); } }, icon(ICONS.refresh, 13));
            panel.append(h('div', { class: 'foot' },
                h('div', { class: 'status', role: 'status' }, E.dot, E.stxt, E.take, E.refresh),
                h('div', { class: 'keys' }, 'Open with ', h('kbd', { text: 'Alt' }), ' + ', h('kbd', { text: 'Shift' }), ' + ', h('kbd', { text: 'P' }), ' or the Tampermonkey menu · v' + VERSION + ' · every tab updates live')));

            panel.addEventListener('keydown', e => { if (e.key === 'Escape' && !this.dropperOpen) this.close(); });
            return panel;
        },

        async dropper(ED) {
            this.dropperOpen = true;
            try {
                const { sRGBHex } = await new ED().open();
                const v = normColor(sRGBHex);
                if (v) {
                    saveSite({ custom: v, off: null });
                    if (S.yielded) { S.yielded = false; S.takeover = true; }
                    apply(v, { source: 'custom' });
                    log('dropper picked', v);
                }
            } catch { /* cancelled */ }
            setTimeout(() => { this.dropperOpen = false; }, 0);
        },

        // light or dark glass: the saved choice, or the device's while it's on auto
        dark() { const ap = S.settings.appearance; return ap === 'dark' || (ap === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); },

        theme() {
            const off = ['disabled', 'off'].includes(S.mode);
            const a = S.mode === 'yielded' ? S.yieldColor : off ? null : S.applied;
            const p = this.root.querySelector('.panel'), st = p.style;
            const dark = this.dark(), base = dark ? [22, 22, 28] : [255, 255, 255];
            if (dark) p.setAttribute('data-theme', 'dark'); else p.removeAttribute('data-theme');
            if (!a) {
                st.setProperty('--a', '#8e8e93'); st.setProperty('--a-rgb', '142,142,147'); st.setProperty('--glow', '0');
                st.setProperty('--bg', dark ? 'rgba(22,22,28,.8)' : 'rgba(255,255,255,.84)'); st.setProperty('--bg-solid', dark ? 'rgb(30,30,36)' : 'rgb(250,250,252)');
                st.setProperty('--fill', '#8e8e93'); st.setProperty('--fill-hi', '#b8b8bd'); st.setProperty('--ink', dark ? '#aeaeb2' : '#6e6e73'); st.setProperty('--on', '#fff');
                return;
            }
            const rgb = hexToRgb(a);
            // the glass is the base tinted a little toward the color
            const tint = t => rgb.map((v, i) => Math.round(base[i] + (v - base[i]) * t));
            const mix = (t, alpha) => `rgba(${tint(t).join(',')},${alpha})`;
            const fill = dark ? (contrast(rgb, base) < 1.6 ? lightenTo(a, 1.6, base) : a) : (contrast(rgb, [255, 255, 255]) < 1.6 ? darkenTo(a, 1.6) : a);
            const [hh, ss, ll] = rgbToHsl(...hexToRgb(fill));
            st.setProperty('--a', a); st.setProperty('--a-rgb', rgb.join(','));
            st.setProperty('--glow', dark ? '.26' : '.2');
            st.setProperty('--bg', mix(dark ? 0.12 : 0.1, dark ? 0.8 : 0.84)); st.setProperty('--bg-solid', mix(dark ? 0.09 : 0.07, 1));
            st.setProperty('--fill', fill); st.setProperty('--fill-hi', rgbToHex(...hslToRgb(hh, ss, Math.min(ll + 0.14, 0.92))));
            st.setProperty('--ink', dark ? lightenTo(a, 4.5, tint(0.09)) : darkenTo(a, 4.2));
            st.setProperty('--on', lum(hexToRgb(fill)) > 0.42 ? '#1d1d1f' : '#fff');
        },

        refresh() {
            if (!this.root) return;
            const E = this.el, set_ = S.settings;
            this.theme();
            E.mode.setAttribute('aria-checked', String(this.dark()));
            E.auto2.setAttribute('aria-checked', String(set_.appearance === 'auto'));

            const app = isApp();
            E.kind.textContent = app ? 'Installed app' : 'Browser tab';
            E.kind.title = app ? 'The color shows in this app\'s title bar' : 'Desktop tabs ignore title bar colors; installed apps, Android Chrome and Safari use them';

            E.master.setAttribute('aria-checked', String(set_.enabled));
            E.masterD.textContent = set_.enabled ? 'Everything is on. Turn off to stop every feature at once.' : 'Everything is off. Your settings are kept.';


            for (const b of E.toneSeg.children) b.classList.toggle('on', b.dataset.v === set_.tone);
            E.toneD.textContent = TONES[set_.tone].desc + (S.mode === 'custom' ? '. Your own color stays exact.' : '');

            if (!this.dragging) this.renderSources();
            E.fb.replaceChildren(...[
                h('div', { class: 'nm' }, h('span', null, 'Fallback ', h('code', { text: FALLBACK })), h('small', { text: 'When nothing else works' })),
                S.mode === 'fallback' ? h('span', { class: 'chip used', text: 'in use' }) : null].filter(Boolean));
            E.fb.classList.toggle('used', S.mode === 'fallback');
            E.srcHint.textContent = S.mode === 'custom' ? 'Your color is overriding these on this site' : 'Top to bottom, first one that works wins';

            // this site
            const cur = S.mode === 'yielded' ? S.yieldColor : S.applied;
            const quiet = ['disabled', 'off'].includes(S.mode);
            E.swatch.classList.toggle('none', !cur || quiet);
            if (this.root.activeElement !== E.hexIn) E.hexIn.value = cur && !quiet ? cur.slice(1) : '';
            E.hexNote.textContent = S.mode === 'custom' ? 'Your color ·' : S.mode === 'yielded' ? 'Set by ' + (S.yieldedTo || 'another script') : quiet ? 'Type a hex or use the dropper' : S.mode === 'checking' ? 'Checking…' : 'Auto · type to set your own';
            E.off.setAttribute('aria-checked', String(!!S.site.off));
            E.auto.hidden = !S.site.custom;

            E.log.setAttribute('aria-checked', String(set_.log));
            this.status();
        },

        renderSources() {
            const E = this.el;
            E.list.replaceChildren(...S.settings.sources.map(({ id, on }) => {
                const tr = S.mode === 'auto' || S.mode === 'fallback' ? S.trail[id] : null;
                const st = !on ? 'skipped' : tr?.state;
                const row = h('div', { class: 'src' + (st ? ' ' + st : ''), 'data-id': id });
                const grip = h('button', { class: 'grip', 'aria-label': `Move ${SOURCES[id].label}` }, icon(ICONS.grip, 15, { sw: 3 }));
                const ck = h('button', { class: 'ck' + (on ? ' on' : ''), role: 'checkbox', 'aria-checked': String(on), 'aria-label': `Use ${SOURCES[id].label}`,
                    onclick: () => { saveSettings({ sources: S.settings.sources.map(s => s.id === id ? { ...s, on: !s.on } : s) }); resolve(); } }, icon(ICONS.check, 11, { sw: 3 }));
                const note = st === 'used' ? (tr.note || SOURCES[id].hint) : st === 'failed' ? tr.note : SOURCES[id].hint;
                row.append(...[grip, ck,
                    h('div', { class: 'nm' }, h('span', { text: SOURCES[id].label }), h('small', { text: note, title: note })),
                    st === 'used' ? h('span', { class: 'chip used', text: 'in use' }) : st === 'failed' ? h('span', { class: 'chip failed', text: 'missed' }) : null].filter(Boolean));
                this.dragify(grip, row);
                return row;
            }));
        },

        dragify(grip, row) {
            const list = this.el.list;
            const commit = () => {
                const order = [...list.children].map(r => r.dataset.id);
                const cur = S.settings.sources.map(s => s.id);
                if (order.join() === cur.join()) return;
                const byId = Object.fromEntries(S.settings.sources.map(s => [s.id, s]));
                saveSettings({ sources: order.map(i => byId[i]) });
                resolve();
            };
            grip.addEventListener('pointerdown', e => {
                if (this.dragging || e.button > 0) return;
                const id = e.pointerId;
                e.preventDefault();
                // Listen on window: moving the row in the DOM drops pointer capture.
                this.dragging = true; row.classList.add('drag');
                const move = ev => {
                    if (ev.pointerId !== id) return;
                    let before = null;
                    for (const r of list.children) {
                        if (r === row) continue;
                        const b = r.getBoundingClientRect();
                        if (ev.clientY < b.top + b.height / 2) { before = r; break; }
                    }
                    if (before ? row.nextElementSibling !== before : list.lastElementChild !== row) list.insertBefore(row, before);
                };
                const end = ev => {
                    if (ev.pointerId !== id) return;
                    removeEventListener('pointermove', move, true);
                    removeEventListener('pointerup', end, true);
                    removeEventListener('pointercancel', end, true);
                    this.dragging = false; row.classList.remove('drag');
                    commit();
                };
                addEventListener('pointermove', move, true);
                addEventListener('pointerup', end, true);
                addEventListener('pointercancel', end, true);
            });
            grip.addEventListener('keydown', e => {
                if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                e.preventDefault();
                if (e.key === 'ArrowUp' && row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
                if (e.key === 'ArrowDown' && row.nextElementSibling) list.insertBefore(row.nextElementSibling, row);
                const id = row.dataset.id;
                commit();
                setTimeout(() => this.el.list?.querySelector(`[data-id="${id}"] .grip`)?.focus(), 0);
            });
        },

        status() {
            const E = this.el, c = code => h('code', { text: code });
            const label = SOURCES[S.source]?.label;
            let parts, dot = S.applied;
            switch (S.mode) {
                case 'disabled': parts = [h('b', { text: 'Prism is off' }), ' · sites use their own title bar color']; dot = null; break;
                case 'off': parts = [h('b', { text: 'Off for this site' }), ' · the site sets its own color']; dot = null; break;
                case 'checking': parts = [h('b', { text: 'Checking this site…' })]; break;
                case 'custom': parts = [h('b', { text: 'Your color' }), ' · ', c(S.applied), ' set as the title bar']; break;
                case 'fallback': parts = [h('b', { text: 'Nothing found' }), ' · fallback ', c(S.applied), ' set as the title bar']; break;
                case 'yielded': dot = S.yieldColor; parts = [h('b', { text: S.yieldedTo || 'Another script' }), ' set ', S.yieldColor ? c(S.yieldColor) : 'the color', ' · Prism is standing by']; break;
                case 'auto':
                    parts = [h('b', { text: 'Pulled from ' + label }), S.detail ? ` (${S.detail})` : '', ' · ', c(S.raw),
                        S.applied !== S.raw ? [' → ', TONES[S.settings.tone].label.toLowerCase(), ' → ', c(S.applied)] : '',
                        ' set as the title bar', S.fromCache ? ' · saved from last visit' : ''];
                    break;
                default: parts = [h('b', { text: 'Starting…' })]; dot = null;
            }
            E.stxt.replaceChildren(...parts.flat());
            E.dot.classList.toggle('none', !dot);
            E.refresh.classList.toggle('spin', S.mode === 'checking');
            E.take.hidden = S.mode !== 'yielded';
            E.refresh.hidden = S.mode === 'yielded';
            if (dot && dot !== this.lastDot) { E.dot.classList.remove('pulse'); void E.dot.offsetWidth; E.dot.classList.add('pulse'); }
            this.lastDot = dot;
        },
    };

    /* ───────────────────────── start ───────────────────────── */

    // 0. Menu first, so nothing below can stop it from being reachable.
    try { GM_registerMenuCommand('Open Prism  (Alt+Shift+P)', () => ui.open()); } catch {}
    try { GM_registerMenuCommand('Turn Prism on/off', () => { saveSettings({ enabled: !S.settings.enabled }); resolve(); }); } catch {}
    const onKey = e => {
        if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyP' || e.key === 'P' || e.key === 'p')) {
            if (e.__prism) return; e.__prism = true;
            e.preventDefault(); e.stopImmediatePropagation(); ui.toggle();
        } else if (e.key === 'Escape' && ui.host && !ui.dropperOpen) ui.close();
    };
    addEventListener('keydown', onKey, true);
    document.addEventListener('keydown', onKey, true);

    // 1. Put last visit's color on instantly so the title bar doesn't flash gray.
    (() => {
        if (!S.settings.enabled || S.site.off) return;
        const c0 = cacheGet();
        // At document-start the <head> usually isn't parsed yet, so the manifest/favicon can't be compared.
        // If Tampermonkey ran late and the links are already there, check that the saved result still fits.
        const linksReady = !!document.querySelector('link[rel~="manifest" i], link[rel~="icon" i]');
        const fresh = c0 && c0.raw && c0.sig === sourceSig() && Date.now() - (c0.ts || 0) < CACHE_DAYS * 864e5
            && (!linksReady || !['icon', 'manifest', 'favicon'].includes(c0.source) || cacheFits(c0));
        const c = S.site.custom || (fresh ? toned(c0.raw, S.settings.tone) : null);
        if (c) { S.applied = c; writeColor(c); }
    })();

    // 2. Do the real check once the page's <head> has been parsed.
    const start = () => { whenHead(watchHead); resolve(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();

    // 3. Keep up with single-page navigation, dark mode flips, and settings changed in other tabs.
    addEventListener('popstate', checkNav);
    try { ['navigatesuccess', 'currententrychange'].forEach(ev => window.navigation?.addEventListener(ev, checkNav)); } catch {}
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { resolve(); ui.refresh(); });
    if (typeof GM_addValueChangeListener === 'function') {
        GM_addValueChangeListener('settings', (k, o, n, remote) => { if (remote) resolve(); });
        GM_addValueChangeListener('sites', (k, o, n, remote) => {
            if (remote && JSON.stringify(o?.[ORIGIN]) !== JSON.stringify(n?.[ORIGIN])) resolve();
            else if (remote) ui.refresh();
        });
    }

})();