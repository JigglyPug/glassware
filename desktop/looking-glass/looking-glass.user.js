// ==UserScript==
// @name         Looking-Glass
// @namespace    jigglypug
// @version      1.0.2
// @description  A small circle in the corner of every video, in the site's own color. Tap it to open the video file in its own tab. Facebook, Instagram, Reddit, X, TikTok, YouTube and any page with a plain video, on phone and PC.
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @connect      *
// @sandbox      JavaScript
// @run-at       document-start
// @noframes
// @author       jigglypug
// @license      MIT
// @homepageURL  https://github.com/JigglyPug/userscripts/tree/main/desktop/looking-glass
// @supportURL   https://github.com/JigglyPug/userscripts/issues
// @updateURL    https://raw.githubusercontent.com/JigglyPug/userscripts/main/desktop/looking-glass/looking-glass.user.js
// @downloadURL  https://raw.githubusercontent.com/JigglyPug/userscripts/main/desktop/looking-glass/looking-glass.user.js
// ==/UserScript==

(function () {
    'use strict';

    /* ───────────────────────── constants ───────────────────────── */

    const VERSION = '1.0.2';
    const PW = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const HOST = location.hostname.toLowerCase().replace(/^(www|m|mobile|web|old|new)\./, '');
    const TOUCH = matchMedia('(hover: none) and (pointer: coarse)').matches;
    const DEFAULTS = {
        on: true, corner: 'tr', size: 'm', idle: 90, which: 'all', show: 'always', minSize: 160, cover: true,
        active: false, quality: 'best', noDirect: 'post', deep: true, hold: true, recent: true,
    };
    const SIZES = { s: 26, m: 32, l: 40 };
    const INSET = 10;
    const FALLBACK = '#5E5CE6';
    const CORNERS = { tl: 'Top left', tr: 'Top right', bl: 'Bottom left', br: 'Bottom right' };
    // [color, name, optional badge fill]
    const BRANDS = {
        'facebook.com': ['#0866FF', 'Facebook blue'], 'fb.watch': ['#0866FF', 'Facebook blue'], 'messenger.com': ['#0866FF', 'Messenger blue'],
        'instagram.com': ['#D62976', 'Instagram', 'linear-gradient(45deg,#FEDA75 0%,#FA7E1E 25%,#D62976 50%,#962FBF 75%,#4F5BD5 100%)'],
        'threads.net': ['#101010', 'Threads black'], 'threads.com': ['#101010', 'Threads black'],
        'reddit.com': ['#FF4500', 'Reddit orange'], 'youtube.com': ['#FF0033', 'YouTube red'],
        'tiktok.com': ['#FE2C55', 'TikTok', 'linear-gradient(135deg,#25F4EE -30%,#111 32%,#111 68%,#FE2C55 130%)'],
        'x.com': ['#0F1419', 'X black'], 'twitter.com': ['#0F1419', 'X black'], 'bsky.app': ['#1185FE', 'Bluesky blue'],
        'twitch.tv': ['#9146FF', 'Twitch purple'], 'kick.com': ['#53FC18', 'Kick green'], 'vimeo.com': ['#17D5FF', 'Vimeo blue'],
        'tumblr.com': ['#001935', 'Tumblr navy'], 'imgur.com': ['#1BB76E', 'Imgur green'], 'pinterest.com': ['#E60023', 'Pinterest red'],
        'linkedin.com': ['#0A66C2', 'LinkedIn blue'], 'streamable.com': ['#0F90FA', 'Streamable blue'], 'rumble.com': ['#85C742', 'Rumble green'],
        'bilibili.com': ['#00AEEC', 'Bilibili blue'], 'snapchat.com': ['#FFFC00', 'Snapchat yellow'], 'discord.com': ['#5865F2', 'Discord blurple'],
        '9gag.com': ['#111111', '9GAG black'], 'vk.com': ['#0077FF', 'VK blue'], 'dailymotion.com': ['#0A0A0A', 'Dailymotion black'],
        'netflix.com': ['#E50914', 'Netflix red'], 'soundcloud.com': ['#FF5500', 'SoundCloud orange'], 'telegram.org': ['#26A5E4', 'Telegram blue'],
    };

    /* ───────────────────────── storage ───────────────────────── */

    const clone = o => JSON.parse(JSON.stringify(o));
    const get = (k, d) => { try { const v = GM_getValue(k); return v === undefined ? (d === undefined ? undefined : clone(d)) : v; } catch { return d === undefined ? undefined : clone(d); } };
    const set = (k, v) => { try { GM_setValue(k, v); } catch {} };
    const S = {};
    function load() {
        S.cfg = Object.assign({}, DEFAULTS, get('settings', {}));
        S.sites = get('sites', {});
        S.recent = get('recent', []);
    }
    load();
    const saveCfg = () => set('settings', S.cfg);
    const siteCfg = () => S.sites[HOST] || {};
    function setSite(patch) {
        const cur = Object.assign({}, S.sites[HOST] || {}, patch);
        for (const k of Object.keys(cur)) if (cur[k] == null || cur[k] === false) delete cur[k];
        if (Object.keys(cur).length) S.sites[HOST] = cur; else delete S.sites[HOST];
        set('sites', S.sites);
    }
    const enabledHere = () => S.cfg.on && !siteCfg().off;
    const cornerHere = () => siteCfg().corner || S.cfg.corner;
    const badgeSize = () => (SIZES[S.cfg.size] || 32) + (TOUCH ? 6 : 0);

    /* ───────────────────────── link index ─────────────────────────
       Every video URL the page ever hands us (page JSON, network replies, player props)
       is filed under the IDs it belongs to. A badge then asks "which ID is *this* video?"
       and looks it up, instead of grabbing the first URL on the page.                      */

    const IDX = new Map();           // id -> { hd, sd, rank }
    let learned = 0;
    const HD_KEYS = ['browser_native_hd_url', 'playable_url_quality_hd', 'hd_src', 'hdSrc', 'hd_src_no_ratelimit', 'hdPlaybackUrl'];
    const SD_KEYS = ['browser_native_sd_url', 'playable_url', 'sd_src', 'sdSrc', 'sd_src_no_ratelimit', 'sdPlaybackUrl', 'video_url', 'videoUrl', 'playAddr', 'downloadAddr', 'playbackUrl'];
    const ID_KEYS = ['videoId', 'video_id', 'videoID', 'videoFBID', 'id', 'pk', 'id_str', 'rest_id', 'aweme_id', 'media_id', 'mediaId'];
    const CODE_KEYS = ['code', 'shortcode'];
    const MARK = /browser_native|playable_url|video_versions|"video_url"|playAddr|video_info|hd_src|hdSrc/;

    const isUrl = v => typeof v === 'string' && /^https?:\/\//.test(v) && !/\.(jpe?g|png|webp|gif|heic)(\?|$)/i.test(v);
    const okId = v => (typeof v === 'string' || typeof v === 'number') && /^\d{6,}(_\d+)?$/.test(String(v));
    const okCode = v => typeof v === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(v) && /[A-Za-z]/.test(v) && !/^\d+$/.test(v);

    function linksOf(o) {
        let hd = null, sd = null;
        for (const k of HD_KEYS) if (isUrl(o[k])) { hd = o[k]; break; }
        for (const k of SD_KEYS) if (isUrl(o[k])) { sd = o[k]; break; }
        const vv = o.video_versions || o.videoVersions;
        if (Array.isArray(vv) && vv.length) {
            const s = vv.filter(x => x && isUrl(x.url)).sort((a, b) => (b.width || 0) - (a.width || 0));
            if (s.length) { hd = hd || s[0].url; sd = sd || s[s.length - 1].url; }
        }
        const vi = o.video_info && o.video_info.variants;
        if (Array.isArray(vi)) {
            const m = vi.filter(x => x && x.content_type === 'video/mp4' && isUrl(x.url)).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
            if (m.length) { hd = m[0].url; sd = m[m.length - 1].url; }
        }
        return hd || sd ? { hd: hd || sd, sd: sd || hd } : null;
    }
    function idsOf(o) {
        const out = [];
        for (const k of ID_KEYS) { const v = o[k]; if (okId(v)) { const s = String(v).split('_')[0]; if (!out.includes(s)) out.push(s); } }
        for (const k of CODE_KEYS) { const v = o[k]; if (okCode(v) && !out.includes(v)) out.push(v); }
        return out;
    }
    function record(id, l, rank) {
        id = String(id);
        const e = IDX.get(id);
        if (e && e.rank < rank) return;               // equal or stronger data replaces older data, so refreshed (re-signed) links win
        if (e && e.hd === l.hd && e.sd === l.sd && e.rank === rank) return;
        IDX.set(id, { hd: l.hd, sd: l.sd, rank });
        learned++;
    }
    // walk any JSON: when an object holds video URLs, file them under the nearest IDs above it
    function harvest(root) {
        if (!root || typeof root !== 'object') return;
        const stack = [[root, []]];
        let n = 0;
        while (stack.length && n++ < 400000) {
            const [o, ctx] = stack.pop();
            if (Array.isArray(o)) { for (const x of o) if (x && typeof x === 'object') stack.push([x, ctx]); continue; }
            const own = idsOf(o);
            const chain = own.length ? [own, ...ctx].slice(0, 3) : ctx;
            const l = linksOf(o);
            if (l) chain.forEach((g, rank) => g.forEach(id => record(id, l, rank)));
            for (const k in o) { const v = o[k]; if (v && typeof v === 'object') stack.push([v, chain]); }
        }
    }
    const unesc = s => { try { return JSON.parse('"' + s + '"'); } catch { return s.replace(/\\\//g, '/').replace(/\\u0026/g, '&'); } };
    const RX_URL = /"(browser_native_hd_url|browser_native_sd_url|playable_url_quality_hd|playable_url|hd_src|sd_src|video_url)"\s*:\s*"((?:[^"\\]|\\.)+)"/g;
    const RX_ID = /"(?:videoId|video_id|videoID|id)"\s*:\s*"?(\d{6,})/g;
    // for script text that isn't clean JSON: pair each URL with the last video ID written before it
    function harvestLoose(text) {
        const pairs = {};
        for (const m of text.matchAll(RX_URL)) {
            const back = text.slice(Math.max(0, m.index - 5000), m.index);
            let id = null; for (const x of back.matchAll(RX_ID)) id = x[1];
            if (!id) continue;
            const p = pairs[id] || (pairs[id] = {});
            const hd = /hd/.test(m[1]);
            if (hd && !p.hd) p.hd = unesc(m[2]); else if (!hd && !p.sd) p.sd = unesc(m[2]);
        }
        for (const [id, p] of Object.entries(pairs)) record(id, { hd: p.hd || p.sd, sd: p.sd || p.hd }, 2);
    }
    // Last resort for a fetched post page whose links we couldn't tie to IDs: only trust it
    // when the page holds exactly one video, so a suggested clip can never be mistaken for ours.
    function soleUrlIn(text) {
        const hd = new Set(), sd = new Set();
        for (const m of text.matchAll(RX_URL)) (/hd/.test(m[1]) ? hd : sd).add(unesc(m[2]).split('?')[0]);
        const all = new Set([...hd, ...sd]);
        if (hd.size > 1 || sd.size > 1 || !all.size) return null;
        if (all.size > 1 && !(hd.size === 1 && sd.size === 1)) return null;
        for (const m of text.matchAll(RX_URL)) if (/hd/.test(m[1])) return unesc(m[2]);
        for (const m of text.matchAll(RX_URL)) return unesc(m[2]);
        return null;
    }
    function feedText(t) {
        if (typeof t !== 'string' || t.length < 30 || !MARK.test(t)) return;
        t = t.replace(/^\s*for \(;;\);/, '');
        try { harvest(JSON.parse(t)); return; } catch {}
        let any = false;
        for (const line of t.split(/\r?\n/)) {
            const s = line.trim();
            if (s[0] !== '{' && s[0] !== '[') continue;
            try { harvest(JSON.parse(s)); any = true; } catch {}
        }
        if (!any) harvestLoose(t);
    }
    function harvestHtml(html) {
        for (const m of html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) feedText(m[1]);
        harvestLoose(html);
    }
    const lookup = ids => { for (const id of ids) { const e = IDX.get(String(id)); if (e) return e; } return null; };
    const pick = e => S.cfg.quality === 'saver' ? (e.sd || e.hd) : (e.hd || e.sd);
    const qual = (e, u) => e.hd && e.sd && e.hd !== e.sd ? (u === e.hd ? 'HD' : 'SD') : '';

    /* ───────────────────────── sites ───────────────────────── */

    const SITE_LIST = [
        { key: 'facebook', name: 'Facebook', re: /(^|\.)(facebook\.com|fb\.watch)$/, net: true, fiber: true,
            links: [/\/(?:reel|reels)\/(\d{6,})/, /\/videos\/(?:[^/?#]+\/)*?(\d{6,})/, /[?&](?:v|video_id)=(\d{6,})/],
            post: id => /^\d{6,}$/.test(id) ? 'https://www.facebook.com/watch/?v=' + id : null,
            deep: id => /^\d{6,}$/.test(id) ? { url: 'https://www.facebook.com/watch/?v=' + id, kind: 'html' } : null },
        { key: 'instagram', name: 'Instagram', re: /(^|\.)instagram\.com$/, net: true, fiber: true,
            links: [/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/],
            post: id => okCode(id) ? 'https://www.instagram.com/p/' + id + '/' : null,
            deep: id => okCode(id) ? { url: 'https://www.instagram.com/p/' + id + '/?__a=1&__d=dis', kind: 'json', headers: { 'X-IG-App-ID': '936619743392459' } } : null },
        { key: 'x', name: 'X', re: /(^|\.)(x|twitter)\.com$/, net: true, links: [/\/status\/(\d{6,})/],
            scope: el => el.closest('article'),
            post: id => /^\d{6,}$/.test(id) ? 'https://x.com/i/status/' + id : null },
        { key: 'tiktok', name: 'TikTok', re: /(^|\.)tiktok\.com$/, net: true, links: [/\/video\/(\d{8,})/], attrIds: /(\d{15,})/,
            post: id => /^\d{8,}$/.test(id) ? 'https://www.tiktok.com/@/video/' + id : null,
            deep: id => /^\d{8,}$/.test(id) ? { url: 'https://www.tiktok.com/@/video/' + id, kind: 'html' } : null },
        { key: 'reddit', name: 'Reddit', re: /(^|\.)reddit\.com$/, players: 'shreddit-player, shreddit-player-2', special: redditResolve },
        { key: 'youtube', name: 'YouTube', re: /(^|\.)youtube\.com$/, special: ytResolve },
    ];
    const SITE = SITE_LIST.find(s => s.re.test(HOST)) || null;
    const PLAYER_SEL = 'video' + (SITE && SITE.players ? ', ' + SITE.players : '');

    function redditResolve(el) {
        const p = (el.closest && el.closest('shreddit-player, shreddit-player-2')) || el;
        const post = el.closest && el.closest('shreddit-post');
        const permalink = post && post.getAttribute('permalink');
        const out = { post: permalink ? new URL(permalink, location.origin).href : null };
        try {
            const j = JSON.parse(p.getAttribute('packaged-media-json') || 'null');
            const perms = ((j && j.playbackMp4s && j.playbackMp4s.permutations) || []).filter(x => x && x.source && isUrl(x.source.url))
                .sort((a, b) => ((b.source.dimensions || {}).height || 0) - ((a.source.dimensions || {}).height || 0));
            if (perms.length) return Object.assign(out, { hd: perms[0].source.url, sd: perms[perms.length - 1].source.url, how: 'Reddit MP4' });
        } catch {}
        const src = p.getAttribute && p.getAttribute('src');
        if (isUrl(src)) return Object.assign(out, { hd: src, sd: src, how: 'Reddit stream (HLS)' });
        const v = el.tagName === 'VIDEO' ? el : null, s = v && (v.currentSrc || v.src);
        if (isUrl(s)) return Object.assign(out, { hd: s, sd: s, how: 'video tag' });
        return out;
    }
    function ytId(href) {
        try { const u = new URL(href, location.origin); return u.searchParams.get('v') || (u.pathname.match(/\/(?:shorts|live|embed)\/([\w-]{11})/) || [])[1] || null; } catch { return null; }
    }
    function ytResolve(el) {
        let id = null;
        const card = el.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer, ytm-shorts-lockup-view-model');
        if (card) { const a = card.querySelector('a[href*="watch?v="], a[href*="/shorts/"]'); id = a && ytId(a.href); }
        if (!id && el.closest('#movie_player, ytd-player, ytd-reel-video-renderer, ytd-shorts, #player-container-id')) id = ytId(location.href);
        if (!id) return null;
        const u = 'https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0';
        return { hd: u, sd: u, how: 'clean player (embed)', q: 'Clean', post: null };
    }

    /* ───────────────────────── network + page data ───────────────────────── */

    const exp = f => (typeof exportFunction === 'function' ? exportFunction(f, PW) : f); // Firefox needs this to hand functions to the page
    function hookNet() {
        try {
            const X = PW.XMLHttpRequest.prototype, send = X.send;
            X.send = exp(function () {
                try {
                    this.addEventListener('load', exp(function () {
                        try {
                            const t = this.responseType;
                            if (t === '' || t === 'text') feedText(this.responseText);
                            else if (t === 'json' && this.response) harvest(this.response);
                        } catch {}
                    }));
                } catch {}
                return send.apply(this, arguments);
            });
        } catch {}
        try {
            const F = PW.fetch;
            PW.fetch = exp(function () {
                const p = F.apply(this, arguments);
                try {
                    p.then(exp(r => {
                        try {
                            const ct = (r.headers.get('content-type') || '');
                            if (/json|javascript|text\/plain|text\/html/.test(ct) || !ct) r.clone().text().then(exp(feedText), exp(() => {}));
                        } catch {}
                    }), exp(() => {}));
                } catch {}
                return p;
            });
        } catch {}
    }
    const seenScripts = new WeakSet();
    function scanScripts() {
        for (const s of document.querySelectorAll('script:not([src])')) {
            if (seenScripts.has(s)) continue;
            seenScripts.add(s);
            const t = s.textContent;
            if (t && t.length > 40 && MARK.test(t)) feedText(t);
        }
    }
    if (SITE && SITE.net) hookNet();

    /* ───────────────────────── which video is this? ───────────────────────── */

    function fiberOf(el) {
        for (let n = el, i = 0; n && i < 6; n = n.parentElement, i++) {
            const o = n.wrappedJSObject || n;
            try { for (const k of Object.keys(o)) if (k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')) return o[k]; } catch {}
        }
        return null;
    }
    const FIBER_IDS = ['videoID', 'videoId', 'videoFBID', 'video_id', 'mediaId', 'media_id', 'pk'];
    const FIBER_NEST = ['video', 'media', 'data', 'item', 'post', 'attachment', 'playable', 'videoData', 'reel', 'clip', 'node', 'implementation', 'playerData'];
    // strong = props that are explicitly a video/media ID; weak = a plain "id" on a nested object
    function inspectProps(o, strong, weak, d) {
        let l = null; try { l = linksOf(o); } catch {}
        if (l) return l;
        for (const k of FIBER_IDS) { const v = o[k]; if (okId(v)) { const s = String(v).split('_')[0]; if (!strong.includes(s)) strong.push(s); } }
        for (const k of CODE_KEYS) { const v = o[k]; if (okCode(v) && !strong.includes(v)) strong.push(v); }
        if (d >= 1 && okId(o.id)) { const s = String(o.id).split('_')[0]; if (!weak.includes(s)) weak.push(s); }
        if (d < 2) for (const k of FIBER_NEST) {
            let v; try { v = o[k]; } catch { continue; }
            if (v && typeof v === 'object' && !Array.isArray(v) && !v.$$typeof) { const r = inspectProps(v, strong, weak, d + 1); if (r) return r; }
        }
        return null;
    }
    // React keeps each component's props on the DOM node. Walk up from the <video> until the
    // subtree holds a second video: whatever we find before then belongs to this video only.
    function fromFiber(el) {
        let f = fiberOf(el);
        if (!f) return null;
        const strong = [], weak = [];
        const ids = () => strong.concat(weak.filter(x => !strong.includes(x)));
        try {
            for (let i = 0; f && i < 45; i++, f = f.return) {
                const sn = f.stateNode;
                if (i > 0 && sn && sn.nodeType === 1 && sn.querySelectorAll && sn.querySelectorAll(PLAYER_SEL).length > 1) break;
                const p = f.memoizedProps;
                if (p && typeof p === 'object') { const l = inspectProps(p, strong, weak, 0); if (l) return { hd: l.hd, sd: l.sd, ids: ids() }; }
            }
        } catch {}
        return strong.length || weak.length ? { ids: ids() } : null;
    }
    const countPlayers = n => n.querySelectorAll(PLAYER_SEL).length;
    function idsFromHref(href, out) {
        for (const rx of SITE.links) { const m = href.match(rx); if (m && !out.includes(m[1])) out.push(m[1]); }
    }
    function linkIds(el) {
        const out = [];
        if (!SITE || !SITE.links) return out;
        const scope = SITE.scope && SITE.scope(el);
        if (scope) {
            const timed = [...scope.querySelectorAll('a[href] time')].map(t => t.closest('a')).filter(Boolean);
            for (const a of timed.concat([...scope.querySelectorAll('a[href]')])) { idsFromHref(a.getAttribute('href') || '', out); if (out.length >= 3) break; }
            return out;
        }
        let n = el.parentElement;
        for (let depth = 0; n && n !== document.body && depth < 14 && out.length < 3; depth++, n = n.parentElement) {
            if (countPlayers(n) > 1) break; // stepped into a neighbouring post
            const dv = n.getAttribute('data-video-id'); if (okId(dv) && !out.includes(dv)) out.push(dv);
            if (SITE.attrIds && n.id) { const m = n.id.match(SITE.attrIds); if (m && !out.includes(m[1])) out.push(m[1]); }
            if (n.tagName === 'A') idsFromHref(n.getAttribute('href') || '', out);
            for (const a of n.querySelectorAll('a[href]')) { idsFromHref(a.getAttribute('href') || '', out); if (out.length >= 3) break; }
        }
        return out;
    }
    function pageIds() {
        const out = [];
        if (SITE && SITE.links) idsFromHref(location.href, out);
        return out;
    }
    function srcOf(el) {
        if (el.tagName !== 'VIDEO') return null;
        const s = el.currentSrc || el.src || '';
        if (/^https?:/.test(s)) return s;
        for (const so of el.querySelectorAll('source[src]')) if (/^https?:/.test(so.src)) return so.src;
        return null;
    }
    function dataStore(el) { // m.facebook.com keeps the file right on the player
        const n = el.closest && el.closest('[data-store]');
        if (!n) return null;
        try { const j = JSON.parse(n.getAttribute('data-store')); return isUrl(j.src) ? j.src : isUrl(j.hd_src) ? j.hd_src : null; } catch { return null; }
    }
    function ogVideo() {
        const m = document.querySelector('meta[property="og:video:secure_url"], meta[property="og:video:url"], meta[property="og:video"], meta[name="twitter:player:stream"]');
        const c = m && m.getAttribute('content');
        return isUrl(c) && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(c) ? c : null;
    }
    const samePage = u => { try { const a = new URL(u), b = new URL(location.href); return a.host.replace(/^www\./, '') === b.host.replace(/^www\./, '') && a.pathname === b.pathname && a.search === b.search; } catch { return false; } };

    // main = the most visible video on screen; only it may borrow the page's own ID (reels pages)
    function resolve(el, main) {
        const out = { url: null, q: '', how: '', post: null, deepIds: [] };
        const done = (e, how) => { out.url = pick(e); out.q = e.q || qual(e, out.url); out.how = how; };
        const ids = [];
        if (SITE && SITE.special) {
            const r = SITE.special(el);
            if (r) { if (r.hd) done(r, r.how); out.post = r.post && !samePage(r.post) ? r.post : null; return out; }
        }
        if (SITE && SITE.fiber) {
            const f = fromFiber(el);
            if (f) { ids.push(...f.ids); if (f.hd) done(f, 'player data'); }
        }
        if (!out.url) { for (const id of linkIds(el)) if (!ids.includes(id)) ids.push(id); const e = lookup(ids); if (e) done(e, 'page data'); }
        if (!out.url) { const s = srcOf(el) || dataStore(el); if (s) done({ hd: s, sd: s }, 'video tag'); }
        if (main) for (const id of pageIds()) if (!ids.includes(id)) ids.push(id);
        if (!out.url && main) { const e = lookup(ids); if (e) done(e, 'this page'); }
        if (!out.url && main && items.size === 1) { const og = ogVideo(); if (og) done({ hd: og, sd: og }, 'page tags'); }
        if (SITE) {
            for (const id of ids) { const p = SITE.post && SITE.post(id); if (p && !samePage(p)) { out.post = p; break; } }
            if (SITE.deep) out.deepIds = ids.filter(id => SITE.deep(id));
        }
        return out;
    }
    // A failed lookup only blocks that ID for a short cooldown (no hammering on repeated taps),
    // then a later tap tries again. Requests already in flight are shared, not repeated.
    const DEEP_COOLDOWN = 12000;
    const deepFailed = new Map(), deepBusy = new Map();
    function deepOne(id, d) {
        if (deepBusy.has(id)) return deepBusy.get(id);
        const job = (async () => {
            const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
            try {
                const r = await fetch(d.url, { credentials: 'include', headers: d.headers || {}, signal: ctl.signal });
                if (!r.ok) return null;
                const t = await r.text(); // the timeout covers the body too
                if (d.kind === 'json') feedText(t); else harvestHtml(t);
                const e = lookup([id]);
                if (e) return e;
                if (d.kind === 'html') { const u = t.includes(id) ? soleUrlIn(t) : null; if (u) { record(id, { hd: u, sd: u }, 3); return IDX.get(id); } }
                return null;
            } catch { return null; } finally { clearTimeout(tm); }
        })();
        deepBusy.set(id, job);
        job.then(e => { deepBusy.delete(id); if (e) deepFailed.delete(id); else deepFailed.set(id, Date.now()); });
        return job;
    }
    async function deepLookup(ids) {
        for (const id of ids) {
            const d = SITE.deep(id);
            if (!d) continue;
            const failedAt = deepFailed.get(id);
            if (failedAt && Date.now() - failedAt < DEEP_COOLDOWN) continue;
            const e = await deepOne(id, d);
            if (e) return e;
        }
        return null;
    }

    /* ───────────────────────── color ───────────────────────── */

    const hex2 = n => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
    const toHex = (r, g, b) => '#' + hex2(r) + hex2(g) + hex2(b);
    const rgbOf = hex => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || ''); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [94, 92, 230]; };
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
    function hsl([r, g, b]) {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
        if (!d) return [0, 0, l];
        const s = d / (1 - Math.abs(2 * l - 1));
        const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return [(hh * 60 + 360) % 360, s, l];
    }
    function cssToHex(str) {
        try {
            const c = document.createElement('canvas').getContext('2d');
            c.fillStyle = '#010203'; c.fillStyle = str;
            const v = c.fillStyle;
            if (v === '#010203' && !/^#?010203$/i.test(str)) return null;
            if (v[0] === '#') return v;
            const m = v.match(/[\d.]+/g); return m ? toHex(+m[0], +m[1], +m[2]) : null;
        } catch { return null; }
    }
    function themeOf(hex, fillOverride) {
        const c = rgbOf(hex), L = lum(c);
        return {
            hex, rgb: c.join(','), fill: hex, bg: fillOverride || hex,
            hi: toHex(...mix(c, [255, 255, 255], .3)),
            ink: L < .03 ? '#1d1d1f' : toHex(...mix(c, [0, 0, 0], L > .5 ? .58 : L > .25 ? .38 : .18)),
            on: L > .55 ? '#1d1d1f' : '#fff',
        };
    }
    let COLOR = { name: 'Default', ...themeOf(FALLBACK) };
    function setColor(hex, fill, name) {
        COLOR = Object.assign(themeOf(hex, fill), { name });
        layer.paint();
        if (ui.panel) ui.render();
    }
    function brandOf(host) {
        for (const [d, v] of Object.entries(BRANDS)) if (host === d || host.endsWith('.' + d)) return v;
        return null;
    }
    function blobOf(url) {
        return new Promise((res, rej) => {
            if (typeof GM_xmlhttpRequest === 'function') {
                try {
                    GM_xmlhttpRequest({ method: 'GET', url, responseType: 'blob', timeout: 6000,
                        onload: r => r.status >= 200 && r.status < 300 && r.response ? res(r.response) : rej(), onerror: rej, ontimeout: rej });
                    return;
                } catch {}
            }
            fetch(url).then(r => r.ok ? r.blob() : rej()).then(res, rej);
        });
    }
    async function sampleIcon(url) {
        const blob = await blobOf(url);
        const ou = URL.createObjectURL(blob);
        try {
            const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = ou; });
            const cv = document.createElement('canvas'); cv.width = cv.height = 32;
            const cx = cv.getContext('2d', { willReadFrequently: true });
            cx.drawImage(img, 0, 0, 32, 32);
            const px = cx.getImageData(0, 0, 32, 32).data;
            const bins = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
            let dark = 0, solid = 0;
            for (let i = 0; i < px.length; i += 4) {
                if (px[i + 3] < 140) continue;
                solid++;
                const c = [px[i], px[i + 1], px[i + 2]], [hh, s, l] = hsl(c);
                if (s < .28 || l < .1 || l > .93) { if (l < .25) dark++; continue; }
                const bn = bins[Math.floor(hh / 15) % 24], w = s * (1 - Math.abs(l - .5));
                bn.w += w; bn.r += c[0] * w; bn.g += c[1] * w; bn.b += c[2] * w;
            }
            const best = bins.reduce((a, b) => b.w > a.w ? b : a);
            if (solid && best.w > solid * .05) return toHex(best.r / best.w, best.g / best.w, best.b / best.w);
            if (solid && dark > solid * .4) return '#1d1d1f';
            return null;
        } finally { URL.revokeObjectURL(ou); }
    }
    async function iconColor() {
        const links = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"], link[rel="shortcut icon"]')]
            .map(l => ({ href: l.href, size: parseInt(((l.sizes && l.sizes.value) || '').split('x')[0], 10) || (/apple/.test(l.rel) ? 180 : 16) }))
            .sort((a, b) => b.size - a.size).map(x => x.href);
        links.push(location.origin + '/favicon.ico');
        for (const href of [...new Set(links)].slice(0, 4)) { try { const c = await sampleIcon(href); if (c) return c; } catch {} }
        return null;
    }
    function pageColor() {
        const m = document.querySelector('meta[name="theme-color"]');
        const hx = m && cssToHex(m.getAttribute('content') || '');
        if (!hx) return null;
        const [, s, l] = hsl(rgbOf(hx));
        return s > .3 && l > .15 && l < .85 ? hx : null;
    }
    async function detectColor() {
        const b = brandOf(HOST);
        if (b) return setColor(b[0], b[2] || null, b[1]);
        const cache = get('colors', {}), c = cache[HOST];
        if (c && Date.now() - c.at < 14 * 864e5) return setColor(c.hex, null, c.name);
        let hx = await iconColor().catch(() => null), name = 'From the site icon';
        if (!hx) { hx = pageColor(); name = 'From the page color'; }
        if (!hx) return setColor(FALLBACK, null, 'Default');
        cache[HOST] = { hex: hx, name, at: Date.now() };
        const keys = Object.keys(cache); if (keys.length > 300) for (const k of keys.sort((a, z) => cache[a].at - cache[z].at).slice(0, 50)) delete cache[k];
        set('colors', cache);
        setColor(hx, null, name);
    }

    /* ───────────────────────── icons + dom ───────────────────────── */

    const SVGNS = 'http://www.w3.org/2000/svg';
    function icon(paths, size = 14, sw = 2) {
        const s = document.createElementNS(SVGNS, 'svg');
        s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
        s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', sw);
        s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
        for (const d of [].concat(paths)) { const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); s.append(p); }
        return s;
    }
    const ICONS = {
        mirror: ['M12 2.5c3.3 0 6 3 6 6.8s-2.7 6.7-6 6.7-6-3-6-6.7 2.7-6.8 6-6.8Z', 'M12 16v5.5', 'M9.5 21.5h5', 'M9.3 7.2c.5-1.2 1.5-2 2.7-2.2'],
        arrow: ['M7 17 17 7', 'M8.5 7H17v8.5'],
        close: ['M6 6l12 12', 'M18 6 6 18'],
        check: ['M5 12.5l4.5 4.5L19 7'],
        copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
        link: ['M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4l-1 1', 'M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1-1'],
        tab: ['M3.5 8h17v12h-17z', 'M3.5 8 6 4.5h6L14 8'],
        eyeOff: ['M3 3l18 18', 'M10.6 10.6a2 2 0 0 0 2.8 2.8', 'M9.9 5.2A9.6 9.6 0 0 1 12 5c6 0 9.5 7 9.5 7a16 16 0 0 1-3 3.8', 'M6.6 6.6A16 16 0 0 0 2.5 12S6 19 12 19a9.4 9.4 0 0 0 5.3-1.6'],
        power: ['M12 3v8', 'M6.3 7a8 8 0 1 0 11.4 0'],
        sliders: ['M4 7h9', 'M17 7h3', 'M15 5v4', 'M4 17h3', 'M11 17h9', 'M9 15v4'],
        trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
        play: ['M9 7v10l8-5z'],
    };
    function h(tagName, attrs, ...kids) {
        const el = document.createElement(tagName);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (v == null || v === false) continue;
            if (k === 'class') el.className = v;
            else if (k === 'text') el.textContent = v;
            else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
            else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
            else el.setAttribute(k, v === true ? '' : v);
        }
        for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
        return el;
    }
    const toggle = (on, onclick, label, disabled) => h('button', { class: 'sw', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label, disabled: !!disabled, onclick });
    function mount(host) {
        const t = document.body || document.documentElement;
        if (t) { t.append(host); return; }
        new MutationObserver((_, o) => { const x = document.body || document.documentElement; if (x) { o.disconnect(); if (!host.isConnected) x.append(host); } }).observe(document, { childList: true, subtree: true });
    }
    function ago(t) {
        const s = (Date.now() - t) / 1000;
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        return Math.floor(s / 86400) + 'd ago';
    }
    function openUrl(url, active) {
        try { if (typeof GM_openInTab === 'function') { GM_openInTab(url, { active: !!active, insert: true, setParent: true }); return; } } catch {}
        window.open(url, '_blank', 'noopener');
    }
    function copy(text) {
        try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(text, 'text'); return; } } catch {}
        try { navigator.clipboard.writeText(text); } catch {}
    }

    /* ───────────────────────── shared css ───────────────────────── */

    const FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable Text","Segoe UI",Inter,system-ui,sans-serif';
    const MONO = '"SF Mono",ui-monospace,"Cascadia Code","JetBrains Mono",Consolas,monospace';
    const BASE_CSS = `
:host{all:initial}
*{box-sizing:border-box;margin:0}
[hidden]{display:none!important}
button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
button:disabled{cursor:not-allowed}
.vars{--text:#1d1d1f;--sub:rgba(29,29,31,.66);--line:rgba(0,0,0,.07);--mono:${MONO};
  font:13px/1.35 ${FONT};color:var(--text);-webkit-font-smoothing:antialiased}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 13px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.7);font-size:12px;font-weight:500;transition:background .15s;white-space:nowrap}
.btn:hover{background:#fff}
.btn.sm{height:28px;padding:0 10px;font-size:11.5px;border-radius:8px}
.btn.danger{color:#b4271b}
.pill{display:inline-flex;align-items:center;gap:5px;font:600 9.5px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;padding:5px 7px;border-radius:6px;background:rgba(0,0,0,.05);color:var(--sub);white-space:nowrap}
.pill.acc{background:rgba(var(--a-rgb),.16);color:var(--ink)}
.link{border:0;background:none;padding:0;color:var(--ink);font-size:11.5px;font-weight:500}
.link:hover{text-decoration:underline}
.btn:focus-visible,.sw:focus-visible,.seg button:focus-visible,.ibtn:focus-visible,.link:focus-visible,.cp button:focus-visible,.mi:focus-visible,.x:focus-visible,.chip:focus-visible{outline:2px solid var(--fill);outline-offset:2px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

    /* ───────────────────────── badge layer ───────────────────────── */

    const LAYER_CSS = BASE_CSS + `
.layer{position:fixed;inset:0;pointer-events:none;overflow:hidden}
.b{position:absolute;left:0;top:0;width:var(--s);height:var(--s);padding:0;border:0;background:none;pointer-events:auto;outline:none;touch-action:manipulation;will-change:transform;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.c{position:absolute;inset:0;border-radius:50%;display:grid;place-items:center;background:var(--bg);color:var(--on);
  box-shadow:0 0 0 1.5px rgba(255,255,255,.92),0 3px 12px -2px rgba(0,0,0,.5),0 0 18px -4px rgba(var(--a-rgb),.95);
  opacity:0;transform:scale(.55);transition:opacity .2s,transform .26s cubic-bezier(.2,.9,.3,1.25)}
.b.in .c{opacity:var(--idle);transform:scale(1)}
.b.in:hover .c,.b.in:focus-visible .c,.b.in.hot .c{opacity:1;transform:scale(1.09)}
.b.in:active .c{transform:scale(.92)}
.b:focus-visible .c{box-shadow:0 0 0 2.5px #fff,0 0 0 5px var(--fill),0 3px 12px -2px rgba(0,0,0,.5)}
.b.post .c{background:rgba(18,18,22,.5);backdrop-filter:blur(10px) saturate(160%);-webkit-backdrop-filter:blur(10px) saturate(160%);color:#fff;
  box-shadow:inset 0 0 0 2px rgba(var(--a-rgb),1),0 0 0 1px rgba(255,255,255,.55),0 3px 12px -2px rgba(0,0,0,.5)}
.b.busy .c::before{content:"";position:absolute;inset:-4px;border-radius:50%;border:2.5px solid transparent;border-top-color:#fff;border-right-color:rgba(255,255,255,.5);animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.b.seen::after{content:"";position:absolute;right:-2px;bottom:-2px;width:10px;height:10px;border-radius:50%;background:#34C759;box-shadow:0 0 0 1.5px #fff,0 1px 3px rgba(0,0,0,.4);pointer-events:none}
.b.pop .c{animation:pop .5s cubic-bezier(.2,.9,.3,1.4)}
@keyframes pop{40%{transform:scale(1.25)}}
.tip{position:absolute;top:50%;right:calc(100% + 8px);transform:translate(4px,-50%);white-space:nowrap;padding:6px 10px;border-radius:10px;
  background:rgba(20,20,24,.84);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#fff;font:600 11.5px/1 ${FONT};
  opacity:0;pointer-events:none;transition:opacity .15s,transform .15s;box-shadow:0 6px 18px -6px rgba(0,0,0,.5)}
.tip small{font:500 10px/1 ${MONO};opacity:.7;margin-left:6px;letter-spacing:.04em}
.b.l .tip{right:auto;left:calc(100% + 8px);transform:translate(-4px,-50%)}
@media (hover:hover){.b.in:hover .tip{opacity:1;transform:translate(0,-50%)}}
.menu{position:absolute;width:240px;padding:6px;border-radius:18px;pointer-events:auto;background:rgba(255,255,255,.9);
  backdrop-filter:blur(28px) saturate(170%);-webkit-backdrop-filter:blur(28px) saturate(170%);border:1px solid rgba(255,255,255,.9);
  box-shadow:0 0 0 .5px rgba(var(--a-rgb),.5),0 24px 50px -16px rgba(0,0,0,.45),0 0 34px -12px rgba(var(--a-rgb),.9),inset 0 1px 0 #fff;
  animation:min .18s cubic-bezier(.2,.8,.2,1);transform-origin:var(--ox) var(--oy)}
@keyframes min{from{opacity:0;transform:scale(.94)}}
.mh{display:flex;align-items:center;gap:8px;padding:8px 10px 8px}
.mh .lg{width:24px;height:24px;border-radius:8px;display:grid;place-items:center;flex:none;background:var(--bg);color:var(--on);box-shadow:0 3px 10px -3px rgba(var(--a-rgb),.9)}
.mt{display:flex;flex-direction:column;min-width:0}
.mh b{font-weight:650;font-size:13px;letter-spacing:-.01em}
.mh small{font-size:11px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mh .pill{margin-left:auto}
.mi{display:flex;align-items:center;gap:11px;width:100%;min-height:${TOUCH ? 44 : 38}px;padding:0 10px;border:0;border-radius:11px;background:none;font-size:13.5px;font-weight:500;text-align:left}
.mi:hover{background:rgba(var(--a-rgb),.12)}
.mi svg{color:var(--ink);flex:none}
.mi.dim{color:var(--sub)}
.mi.dim svg{color:var(--sub)}
.msep{height:1px;background:var(--line);margin:4px 8px}
.toast{position:absolute;left:50%;bottom:calc(26px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);max-width:calc(100vw - 32px);display:flex;align-items:center;gap:10px;
  padding:11px 16px 11px 12px;border-radius:16px;background:rgba(255,255,255,.92);backdrop-filter:blur(24px) saturate(170%);-webkit-backdrop-filter:blur(24px) saturate(170%);
  border:1px solid #fff;box-shadow:0 0 0 .5px rgba(var(--a-rgb),.5),0 18px 40px -16px rgba(0,0,0,.4),0 0 30px -10px rgba(var(--a-rgb),.9);font-size:12.5px;font-weight:500;
  animation:tin .3s cubic-bezier(.2,.8,.2,1)}
@keyframes tin{from{opacity:0;transform:translate(-50%,10px)}}
.toast .dot{flex:none;width:10px;height:10px;border-radius:50%;background:var(--fill);box-shadow:0 0 0 3px rgba(var(--a-rgb),.2),0 0 10px rgba(var(--a-rgb),.9)}
`;
    let PX = -1, PY = -1;
    const layer = {
        host: null, root: null, wrap: null, menuEl: null, menuIt: null, toastEl: null, toastT: 0, ready: false,
        ensure() {
            if (this.host) { if (!this.host.isConnected) this.attach(); return; }
            this.host = document.createElement('looking-glass-ui');
            this.host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;display:block;';
            this.root = this.host.attachShadow({ mode: 'closed' });
            this.root.append(h('style', { text: LAYER_CSS }));
            this.wrap = h('div', { class: 'layer vars' });
            this.root.append(this.wrap);
            this.attach();
            this.paint();
            this.ready = true;
            // keep page handlers from treating badge taps as taps on the video
            for (const ev of ['click', 'pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'dblclick'])
                this.host.addEventListener(ev, e => e.stopPropagation());
        },
        attach() {
            const fs = document.fullscreenElement || document.webkitFullscreenElement;
            const target = fs && fs.tagName !== 'VIDEO' ? fs : (document.body || document.documentElement);
            if (target && this.host.parentNode !== target) target.append(this.host); else if (!target) mount(this.host);
        },
        paint() {
            if (!this.wrap) return;
            const st = this.wrap.style, T = COLOR;
            for (const [k, v] of Object.entries({ '--a-rgb': T.rgb, '--fill': T.fill, '--bg': T.bg, '--ink': T.ink, '--on': T.on, '--s': badgeSize() + 'px', '--idle': (S.cfg.idle / 100).toFixed(2) })) st.setProperty(k, v);
            for (const it of items.values()) if (it.b) this.glyph(it);
        },
        glyph(it) {
            it.core.replaceChildren(icon(ICONS.arrow, Math.round(badgeSize() * .5), 2.4));
        },
        badge(it) {
            const core = h('span', { class: 'c' }), tip = h('span', { class: 'tip' });
            const b = h('button', { class: 'b', 'aria-label': 'Open this video in a new tab' }, core, tip);
            it.b = b; it.core = core; it.tip = tip;
            this.glyph(it);
            let timer = 0, sx = 0, sy = 0, held = false;
            const clear = () => { clearTimeout(timer); timer = 0; };
            b.addEventListener('pointerdown', e => {
                held = false; sx = e.clientX; sy = e.clientY;
                if (!S.cfg.hold || e.button > 0) return;
                clear(); timer = setTimeout(() => { held = true; timer = 0; this.openMenu(it); }, 480);
            });
            b.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clear(); });
            b.addEventListener('pointerup', clear); b.addEventListener('pointercancel', clear); b.addEventListener('pointerleave', clear);
            b.addEventListener('contextmenu', e => { if (!S.cfg.hold) return; e.preventDefault(); e.stopPropagation(); clear(); if (!held) { held = true; this.openMenu(it); } });
            b.addEventListener('click', e => { e.preventDefault(); if (held) { held = false; return; } act(it, 'open'); });
            b.addEventListener('mouseenter', () => { it.hover = true; });
            b.addEventListener('mouseleave', () => { it.hover = false; kick(); });
            this.wrap.append(b);
            return b;
        },
        place(it, x, y, left, res) {
            const b = it.b || this.badge(it);
            b.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
            b.classList.toggle('l', left);
            const kind = res.url ? 'ready' : res.deepIds.length && S.cfg.deep ? 'maybe' : 'post';
            b.classList.toggle('post', kind === 'post');
            b.classList.toggle('seen', !!it.seen);
            const label = kind === 'post' ? 'Open the post' : 'Open video';
            const meta = res.q;
            if (it.tipText !== label + meta) { it.tipText = label + meta; it.tip.replaceChildren(...[label, meta ? h('small', { text: meta }) : null].filter(Boolean)); }
            b.setAttribute('aria-label', kind === 'post' ? 'Open this post in a new tab' : 'Open this video in a new tab');
            if (b.hidden || !b.classList.contains('in')) { b.hidden = false; requestAnimationFrame(() => b.classList.add('in')); }
        },
        hide(it) {
            if (!it.b || it.b.hidden || this.menuIt === it) return;
            it.b.classList.remove('in');
            it.b.hidden = true;
        },
        flash(it) { if (!it.b) return; it.b.classList.remove('pop'); void it.b.offsetWidth; it.b.classList.add('pop'); },
        busy(it, on) { if (it.b) it.b.classList.toggle('busy', on); },

        toast(msg) {
            this.ensure();
            this.toastEl && this.toastEl.remove();
            this.toastEl = h('div', { class: 'toast', role: 'status' }, h('span', { class: 'dot' }), h('span', { text: msg }));
            this.wrap.append(this.toastEl);
            clearTimeout(this.toastT);
            this.toastT = setTimeout(() => { this.toastEl && this.toastEl.remove(); this.toastEl = null; }, 3200);
        },

        openMenu(it) {
            this.closeMenu();
            const res = resolve(it.el, it.main); it.res = res; it.resAt = performance.now();
            this.menuIt = it;
            it.b && it.b.classList.add('hot');
            const go = mode => () => { this.closeMenu(); act(it, mode); };
            const has = !!res.url || (res.deepIds.length && S.cfg.deep);
            const items_ = [
                h('div', { class: 'mh' }, h('span', { class: 'lg' }, icon(ICONS.mirror, 14, 2.1)),
                    h('div', { class: 'mt' }, h('b', { text: 'Looking-Glass' }),
                        h('small', { text: res.url ? 'Found in ' + res.how : has ? 'Looks it up on the post page when you tap' : 'No file found, only the post' })),
                    h('span', { class: 'pill acc', text: res.url ? (res.q || 'Ready') : has ? 'On tap' : 'Post only' })),
                has ? h('button', { class: 'mi', onclick: go('open') }, icon(ICONS.arrow, 17, 2.2), S.cfg.active ? 'Open video' : 'Open video in background') : null,
                has ? h('button', { class: 'mi', onclick: go('other') }, icon(ICONS.tab, 17), S.cfg.active ? 'Open in background' : 'Open and switch to it') : null,
                has ? h('button', { class: 'mi', onclick: go('copy') }, icon(ICONS.copy, 17), 'Copy video link') : null,
                res.post ? h('button', { class: 'mi', onclick: go('post') }, icon(ICONS.link, 17), 'Open the post') : null,
                h('div', { class: 'msep' }),
                h('button', { class: 'mi dim', onclick: () => { this.closeMenu(); it.hidden = true; kick(); this.toast('Hidden on this video until you reload'); } }, icon(ICONS.eyeOff, 17), 'Hide on this video'),
                h('button', { class: 'mi dim', onclick: () => { this.closeMenu(); setSite({ off: true }); kick(); this.toast('Looking-Glass is off on ' + HOST + '. Turn it back on from the menu.'); } }, icon(ICONS.power, 17), 'Turn off on ' + HOST),
                h('button', { class: 'mi dim', onclick: () => { this.closeMenu(); ui.open(); } }, icon(ICONS.sliders, 17), 'Settings'),
            ];
            const m = this.menuEl = h('div', { class: 'menu', role: 'menu' }, items_);
            this.wrap.append(m);
            const br = it.b.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight, vw = innerWidth, vh = innerHeight;
            let x = it.b.classList.contains('l') ? br.left : br.right - mw;
            let y = br.bottom + 8;
            if (y + mh > vh - 8) y = br.top - mh - 8;
            x = Math.max(8, Math.min(vw - mw - 8, x)); y = Math.max(8, Math.min(vh - mh - 8, y));
            m.style.left = x + 'px'; m.style.top = y + 'px';
            m.style.setProperty('--ox', (br.left + br.width / 2 - x) + 'px'); m.style.setProperty('--oy', (br.top + br.height / 2 - y) + 'px');
            if (!TOUCH) { const first = m.querySelector('.mi'); first && first.focus({ preventScroll: true }); }
            // The shadow root is closed, so from the page we can't see *where* inside it a tap landed.
            // Page side: close on taps outside our layer. Inside the shadow: close unless it hit the menu or its badge.
            this.outside = e => { if (!e.composedPath().includes(this.host)) this.closeMenu(); };
            this.inside = e => { const p = e.composedPath(); if (!p.includes(m) && !(it.b && p.includes(it.b))) this.closeMenu(); };
            this.keys = e => { if (e.key === 'Escape') this.closeMenu(); };
            setTimeout(() => {
                addEventListener('pointerdown', this.outside, true); this.root.addEventListener('pointerdown', this.inside, true);
                addEventListener('keydown', this.keys, true); addEventListener('scroll', this.onScrollClose, { capture: true, passive: true });
            }, 0);
        },
        onScrollClose: () => layer.closeMenu(),
        closeMenu() {
            if (!this.menuEl) return;
            this.menuEl.remove(); this.menuEl = null;
            this.menuIt && this.menuIt.b && this.menuIt.b.classList.remove('hot');
            this.menuIt = null;
            removeEventListener('pointerdown', this.outside, true); this.root.removeEventListener('pointerdown', this.inside, true);
            removeEventListener('keydown', this.keys, true); removeEventListener('scroll', this.onScrollClose, true);
            kick();
        },
    };

    /* ───────────────────────── tracking ───────────────────────── */

    const items = new Map();   // element -> { el, b, res, resAt, main, seen, hidden }
    const inView = new Set();
    const io = new IntersectionObserver(es => { for (const e of es) e.isIntersecting ? inView.add(e.target) : inView.delete(e.target); kick(); }, { threshold: [0, .2, .5] });
    let shownCount = 0, readyCount = 0, lastHow = '';
    function scan() {
        if (document.visibilityState === 'hidden') return;
        if (SITE && SITE.net) scanScripts();
        if (!enabledHere()) { for (const it of items.values()) layer.hide(it); shownCount = readyCount = 0; return; }
        for (const el of document.querySelectorAll(PLAYER_SEL)) {
            if (items.has(el)) continue;
            if (SITE && SITE.players && el.tagName === 'VIDEO' && el.closest(SITE.players)) continue;
            items.set(el, { el, b: null, res: null, resAt: 0, main: false, seen: false, hidden: false });
            io.observe(el);
        }
        for (const [el, it] of items) if (!el.isConnected) { io.unobserve(el); inView.delete(el); it.b && it.b.remove(); items.delete(el); }
        kick();
    }
    let raf = 0;
    const kick = () => { if (!raf) raf = requestAnimationFrame(update); };

    // cached briefly (not forever) because headers often switch to fixed/sticky after you scroll
    const fixedCache = new WeakMap(), FIXED_TTL = 1500;
    function fixedAncestor(n) {
        const now = performance.now();
        for (let x = n, i = 0; x && x.nodeType === 1 && i < 30; x = x.parentElement, i++) {
            let c = fixedCache.get(x);
            if (!c || now - c.t > FIXED_TTL) { const p = getComputedStyle(x).position; c = { v: p === 'fixed' || p === 'sticky', t: now }; fixedCache.set(x, c); }
            if (c.v) return x;
        }
        return null;
    }
    function playerBox(el) {
        const r = el.getBoundingClientRect();
        let box = el;
        for (let n = el.parentElement, i = 0; n && i < 8; n = n.parentElement, i++) {
            const q = n.getBoundingClientRect();
            if (Math.abs(q.width - r.width) > 14 || Math.abs(q.height - r.height) > 14) break;
            box = n;
        }
        return box;
    }
    // something fixed (a site header, a nav bar) sitting on top of this spot?
    function coverAt(x, y, el) {
        let list; try { list = document.elementsFromPoint(x, y); } catch { return null; }
        const box = playerBox(el);
        for (const t of list) {
            if (t === layer.host || t === ui.host) continue;
            if (t === el || box.contains(t) || t.contains(el)) return null;
            const fx = fixedAncestor(t);
            return fx && !fx.contains(el) ? fx : null;
        }
        return null;
    }
    function update() {
        raf = 0;
        if (!enabledHere() || document.visibilityState === 'hidden') { for (const it of items.values()) layer.hide(it); return; }
        layer.ensure();
        const size = badgeSize(), vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight, min = S.cfg.minSize;
        const cand = [];
        for (const el of inView) {
            const it = items.get(el);
            if (!it || it.hidden) continue;
            const r = el.getBoundingClientRect();
            if (r.width < min || r.height < min * .5) continue;
            const L = Math.max(r.left, 0), R = Math.min(r.right, vw), T = Math.max(r.top, 0), B = Math.min(r.bottom, vh);
            if (R - L < size + INSET * 2 || B - T < size + INSET * 2) continue;
            cand.push({ it, L, R, T, B, area: (R - L) * (B - T) });
        }
        let main = null;
        for (const c of cand) if (!main || c.area > main.area) main = c;
        const shown = new Set(), now = performance.now(), corner = cornerHere(), top = corner[0] === 't', right = corner[1] === 'r';
        readyCount = 0;
        for (const c of cand) {
            const it = c.it, isMain = c === main;
            if (S.cfg.which === 'main' && !isMain && layer.menuIt !== it) continue;
            if (S.cfg.show === 'hover' && !TOUCH && !it.hover && layer.menuIt !== it && !(PX >= c.L && PX <= c.R && PY >= c.T && PY <= c.B)) continue;
            if (!it.res || now - it.resAt > 1500 || it.main !== isMain) { it.main = isMain; it.res = resolve(it.el, isMain); it.resAt = now; }
            const res = it.res;
            if (!res.url && !(S.cfg.deep && res.deepIds.length) && !(S.cfg.noDirect === 'post' && res.post)) continue;
            let x = right ? c.R - INSET - size : c.L + INSET;
            let y = top ? c.T + INSET : c.B - INSET - size;
            if (S.cfg.cover) {
                // test the edge that faces the video's border (where bars creep in) and the middle
                const cx = x + size / 2, edge = top ? y + 2 : y + size - 2;
                const cov = coverAt(cx, edge, it.el) || coverAt(cx, y + size / 2, it.el);
                if (cov) {
                    const cr = cov.getBoundingClientRect();
                    if (top && cr.bottom + INSET + size <= c.B - INSET) y = cr.bottom + INSET;
                    else if (!top && cr.top - INSET - size >= c.T + INSET) y = cr.top - INSET - size;
                    else continue;
                    if (coverAt(cx, top ? y + 2 : y + size - 2, it.el)) continue;
                }
            }
            layer.place(it, x, y, !right, res);
            shown.add(it);
            if (res.url) readyCount++;
        }
        for (const it of items.values()) if (!shown.has(it)) layer.hide(it);
        shownCount = shown.size;
    }

    /* ───────────────────────── open ───────────────────────── */

    async function act(it, mode) {
        const res = resolve(it.el, it.main);
        it.res = res; it.resAt = performance.now();
        if (mode === 'post') { if (res.post) { openUrl(res.post, S.cfg.active); layer.flash(it); } else layer.toast('No post link found for this video'); return; }
        let url = res.url, q = res.q, how = res.how;
        if (!url && S.cfg.deep && res.deepIds.length) {
            layer.busy(it, true);
            const e = await deepLookup(res.deepIds);
            layer.busy(it, false);
            if (e) { url = pick(e); q = qual(e, url); how = 'post page'; it.resAt = 0; }
        }
        if (!url) {
            if (res.post && S.cfg.noDirect === 'post') { openUrl(res.post, S.cfg.active); layer.flash(it); layer.toast('No direct file found, so the post opened instead'); }
            else layer.toast("Couldn't find this video's file yet. Let it play a moment, then try again.");
            return;
        }
        lastHow = how;
        if (mode === 'copy') { copy(url); layer.flash(it); layer.toast('Video link copied'); return; }
        openUrl(url, mode === 'other' ? !S.cfg.active : S.cfg.active);
        it.seen = true; layer.flash(it); kick();
        if (S.cfg.recent) {
            S.recent = get('recent', []).filter(r => r.u !== url);
            S.recent.unshift({ u: url, p: res.post, h: HOST, c: COLOR.hex, q, at: Date.now() });
            S.recent = S.recent.slice(0, 20);
            set('recent', S.recent);
        }
    }

    /* ───────────────────────── panel ───────────────────────── */

    const PANEL_CSS = BASE_CSS + `
.panel{position:fixed;top:16px;right:16px;width:440px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);display:flex;flex-direction:column;overflow:hidden;border-radius:22px;
  background:radial-gradient(120% 40% at 0% 0%,rgba(var(--a-rgb),.2),transparent 64%),rgba(255,255,255,.86);
  backdrop-filter:blur(28px) saturate(170%);-webkit-backdrop-filter:blur(28px) saturate(170%);border:1px solid rgba(255,255,255,.8);
  box-shadow:0 0 0 .5px rgba(var(--a-rgb),.4),0 0 40px -12px rgba(var(--a-rgb),.6),0 28px 64px -18px rgba(0,0,0,.34),inset 0 1px 0 #fff;
  animation:in .18s cubic-bezier(.2,.8,.2,1)}
@keyframes in{from{opacity:0;transform:translateY(-6px) scale(.98)}}
.scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;padding-bottom:4px}
.grab{display:none}
.head{display:flex;align-items:center;gap:11px;padding:18px 18px 4px}
.logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:var(--on);flex:none;background:var(--bg-fill);box-shadow:0 4px 14px -4px rgba(var(--a-rgb),.9),inset 0 1px 0 rgba(255,255,255,.35)}
.title{font-weight:650;font-size:16px;letter-spacing:-.015em}
.sub{font-size:11.5px;color:var(--sub)}
.x{margin-left:auto;width:28px;height:28px;border-radius:50%;border:0;background:rgba(0,0,0,.06);display:grid;place-items:center;color:var(--sub);flex:none}
.x:hover{background:rgba(0,0,0,.1);color:var(--text)}
.siteline{display:flex;align-items:center;gap:8px;padding:6px 18px 12px;font:12px var(--mono);color:var(--sub);min-width:0}
.siteline b{color:var(--text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sw8{width:12px;height:12px;border-radius:4px;flex:none;background:var(--bg-fill);box-shadow:0 0 0 1px rgba(0,0,0,.08)}
.card{margin:0 14px 10px;padding:14px 16px;border-radius:16px;background:rgba(var(--a-rgb),.09);border:1px solid rgba(var(--a-rgb),.22)}
.tile{margin:0 14px 10px;padding:15px 16px;border-radius:16px;background:rgba(255,255,255,.6);border:1px solid var(--line);min-width:0}
.label{display:flex;align-items:center;gap:7px;font:600 10.5px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--ink);margin-bottom:12px;min-height:12px}
.label::before{content:"";width:5px;height:5px;transform:rotate(45deg);background:var(--fill);box-shadow:0 0 6px rgba(var(--a-rgb),.9);flex:none}
.label i{font-style:normal;letter-spacing:.02em;text-transform:none;font-family:inherit;color:var(--sub);font-weight:400;margin-left:auto}
.label .link{margin-left:auto;letter-spacing:0;text-transform:none;font-family:${FONT}}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:34px}
.row+.row,.row+.slr,.slr+.row{margin-top:10px}
.t{font-weight:500}
.d{font-size:11.5px;color:var(--sub);margin-top:2px}
.d b{color:var(--text);font-weight:600}
.sw{flex:none;position:relative;width:40px;height:24px;border:0;border-radius:12px;background:rgba(0,0,0,.13);transition:background .18s}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s cubic-bezier(.3,.7,.3,1)}
.sw[aria-checked=true]{background:var(--fill);box-shadow:0 0 12px -2px rgba(var(--a-rgb),.7)}
.sw[aria-checked=true]::after{transform:translateX(16px)}
.sw:disabled{opacity:.45}
.seg{display:flex;padding:3px;border-radius:12px;background:rgba(0,0,0,.055);gap:2px;flex:none}
.seg button{flex:1;border:0;background:none;min-height:30px;padding:4px 10px;border-radius:9px;font-size:12px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:6px;transition:background .15s,color .15s;white-space:nowrap}
.seg button:hover{background:rgba(255,255,255,.5)}
.seg button.on{background:var(--fill);color:var(--on);box-shadow:0 1px 4px rgba(0,0,0,.14),0 0 14px -4px rgba(var(--a-rgb),.8)}
.slr{display:grid;grid-template-columns:minmax(0,1fr) minmax(110px,150px) 58px;align-items:center;gap:12px;min-height:44px}
.r1{-webkit-appearance:none;appearance:none;width:100%;height:28px;background:none;margin:0;outline:none}
.r1::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(90deg,var(--fill) var(--p),rgba(0,0,0,.1) var(--p))}
.r1::-moz-range-track{height:6px;border-radius:3px;background:rgba(0,0,0,.1)}
.r1::-moz-range-progress{height:6px;border-radius:3px;background:var(--fill)}
.r1::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;margin-top:-7px;border-radius:50%;background:#fff;border:0;box-shadow:0 1px 4px rgba(0,0,0,.3),0 0 0 3px rgba(var(--a-rgb),.2);cursor:grab}
.r1::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#fff;border:0;box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:grab}
.r1:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 3px var(--fill)}
.val{font:600 12px var(--mono);text-align:center;padding:6px 0;border-radius:8px;background:rgba(var(--a-rgb),.12)}
.cp{position:relative;flex:none;width:76px;height:48px;border-radius:11px;background:linear-gradient(160deg,#3a3a44,#16161c);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 4px 12px -6px rgba(0,0,0,.5)}
.cp::after{content:"";position:absolute;left:50%;top:50%;width:0;height:0;margin:-6px 0 0 -3px;border-left:9px solid rgba(255,255,255,.28);border-top:6px solid transparent;border-bottom:6px solid transparent}
.cp button{position:absolute;width:24px;height:24px;border:0;border-radius:50%;background:none;display:grid;place-items:center;padding:0}
.cp button::after{content:"";width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.22);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.45);transition:transform .15s,background .15s}
.cp button:hover::after{background:rgba(255,255,255,.5)}
.cp button.on::after{width:12px;height:12px;background:var(--bg-fill);box-shadow:0 0 0 1.5px #fff,0 0 10px rgba(var(--a-rgb),1)}
.cp .tl{left:1px;top:1px}.cp .tr{right:1px;top:1px}.cp .bl{left:1px;bottom:1px}.cp .br{right:1px;bottom:1px}
.cpw{display:flex;align-items:center;gap:10px}
.ibtn{flex:none;width:30px;height:30px;border:0;border-radius:8px;background:none;color:var(--sub);display:grid;place-items:center}
.ibtn:hover{background:rgba(0,0,0,.06);color:var(--text)}
.rrow{display:grid;grid-template-columns:10px minmax(0,1fr) auto 30px 30px;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--line)}
.rrow:first-of-type{border-top:0}
.rrow i{width:10px;height:10px;border-radius:50%}
.rrow .nm{display:flex;flex-direction:column;min-width:0}
.rrow .nm b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rrow .nm small{font-size:11px;color:var(--sub)}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 6px 0 11px;border-radius:15px;border:1px solid var(--line);background:rgba(255,255,255,.7);font:12px var(--mono)}
.chip span{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.06);color:var(--sub)}
.chip:hover span{background:rgba(0,0,0,.12);color:var(--text)}
.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:12px}
.kv span{color:var(--sub)}
.kv b{font:500 12px var(--mono);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.foot{border-top:1px solid var(--line);background:rgba(250,250,252,.92)}
.status{display:flex;align-items:center;gap:10px;padding:11px 14px 6px 18px}
.dot{flex:none;width:10px;height:10px;border-radius:50%;background:var(--fill);box-shadow:0 0 0 3px rgba(var(--a-rgb),.18),0 0 10px rgba(var(--a-rgb),.9)}
.dot.off{background:#8e8e93;box-shadow:none}
.stxt{flex:1;font-size:11.5px;line-height:1.4;color:var(--sub);min-width:0}
.stxt b{color:var(--text);font-weight:600}
.keys{font-size:10.5px;color:var(--sub);padding:0 18px 12px}
@media (max-width:620px){
  .panel{top:auto;bottom:0;left:0;right:0;width:100%;max-width:none;max-height:88vh;border-radius:24px 24px 0 0;animation:up .26s cubic-bezier(.2,.8,.2,1);padding-bottom:env(safe-area-inset-bottom,0px)}
  @keyframes up{from{transform:translateY(40px);opacity:0}}
  .grab{display:block;width:38px;height:5px;border-radius:3px;background:rgba(0,0,0,.16);margin:8px auto 0}
  .head{padding-top:10px}
  .x{width:34px;height:34px}
  .sw{width:46px;height:28px;border-radius:14px}.sw::after{width:24px;height:24px}.sw[aria-checked=true]::after{transform:translateX(18px)}
  .seg button{min-height:36px}
  .slr{grid-template-columns:minmax(0,1fr) 58px}.slr>div:first-child{grid-column:1/-1}
  .ibtn{width:38px;height:38px}
  .row.wrap{flex-wrap:wrap}
}
`;
    const ui = {
        host: null, root: null, panel: null, scroll: null, timer: null,
        toggle() { this.host ? this.close() : this.open(); },
        open() {
            if (this.host) return;
            load();
            const host = this.host = document.createElement('looking-glass-panel');
            host.style.cssText = 'all:initial;position:fixed;inset:auto;z-index:2147483647;';
            const root = this.root = host.attachShadow({ mode: 'closed' });
            root.append(h('style', { text: PANEL_CSS }));
            this.panel = h('div', { class: 'panel vars', role: 'dialog', 'aria-label': 'Looking-Glass' });
            root.append(this.panel);
            mount(host);
            for (const ev of ['click', 'pointerdown', 'mousedown', 'touchstart', 'keydown', 'wheel']) host.addEventListener(ev, e => e.stopPropagation());
            this.onKey = e => { if (e.key === 'Escape' && e.composedPath().includes(host)) this.close(); };
            addEventListener('keydown', this.onKey, true);
            this.render();
            if (!TOUCH) { const f = this.root.querySelector('.x'); f && f.focus({ preventScroll: true }); }
            this.timer = setInterval(() => this.renderFoot(), 1500);
        },
        close() {
            if (!this.host) return;
            clearInterval(this.timer);
            removeEventListener('keydown', this.onKey, true);
            this.host.remove(); this.host = this.root = this.panel = this.scroll = null;
        },
        theme() {
            const st = this.panel.style, T = COLOR;
            for (const [k, v] of Object.entries({ '--a-rgb': T.rgb, '--fill': T.fill, '--bg-fill': T.bg, '--ink': T.ink, '--on': T.on })) st.setProperty(k, v);
        },
        label(text, right) { return h('div', { class: 'label' }, text, right == null ? null : typeof right === 'string' ? h('i', { text: right }) : right); },
        seg(opts, cur, pickFn) {
            return h('div', { class: 'seg', role: 'group' }, opts.map(([v, n]) => h('button', { class: cur === v ? 'on' : '', 'aria-pressed': String(cur === v), text: n, onclick: () => pickFn(v) })));
        },
        slider({ min, max, step = 1, value, label, fmt, commit }) {
            const val = h('div', { class: 'val', text: fmt(value) });
            const inp = h('input', { class: 'r1', type: 'range', min, max, step, value, 'aria-label': label });
            const paint = v => { inp.style.setProperty('--p', ((v - min) / (max - min) * 100) + '%'); val.textContent = fmt(v); };
            paint(value);
            inp.addEventListener('input', () => { paint(+inp.value); commit(+inp.value, true); });
            inp.addEventListener('change', () => commit(+inp.value, false));
            return [inp, val];
        },
        slr(title, desc, s) { return h('div', { class: 'slr' }, h('div', null, h('div', { class: 't', text: title }), h('div', { class: 'd', text: desc })), ...s); },
        row(title, desc, ctl, cls) { return h('div', { class: 'row' + (cls ? ' ' + cls : '') }, h('div', null, h('div', { class: 't', text: title }), desc ? h('div', { class: 'd', text: desc }) : null), ctl); },
        cornerPick(cur, pickFn) {
            return h('div', { class: 'cp', role: 'group', 'aria-label': 'Badge corner' }, Object.keys(CORNERS).map(k =>
                h('button', { class: k + (cur === k ? ' on' : ''), 'aria-pressed': String(cur === k), 'aria-label': CORNERS[k], title: CORNERS[k], onclick: () => pickFn(k) })));
        },

        render() {
            if (!this.panel) return;
            const keep = this.scroll ? this.scroll.scrollTop : 0;
            this.theme();
            const on = enabledHere();
            const head = h('div', { class: 'head' },
                h('div', { class: 'logo' }, icon(ICONS.mirror, 19, 1.9)),
                h('div', null, h('div', { class: 'title', text: 'Looking-Glass' }), h('div', { class: 'sub', text: 'Open any video on its own' })),
                h('button', { class: 'x', 'aria-label': 'Close', onclick: () => this.close() }, icon(ICONS.close, 13, 2.2)));
            const siteline = h('div', { class: 'siteline' },
                h('span', { class: 'sw8' }), h('b', { text: HOST || location.host }),
                h('span', { class: 'pill', text: COLOR.name }),
                h('span', { style: 'margin-left:auto' }),
                h('span', { class: 'pill ' + (on ? 'acc' : ''), text: !S.cfg.on ? 'Paused' : on ? (SITE ? SITE.name : 'Any video') : 'Off here' }));
            this.scroll = h('div', { class: 'scroll' }, this.vMain());
            this.footEl = h('div', { class: 'foot' });
            this.panel.replaceChildren(h('div', { class: 'grab' }), head, siteline, this.scroll, this.footEl);
            this.renderFoot();
            this.scroll.scrollTop = keep;
        },
        renderFoot() {
            if (!this.footEl) return;
            const on = enabledHere();
            const n = shownCount, r = readyCount;
            const tail = !S.cfg.on ? 'paused everywhere' : !on ? 'turned off on this site' : n ? n + ' video' + (n === 1 ? '' : 's') + ' on screen, ' + r + ' with a direct file' : 'no videos on screen right now';
            this.footEl.replaceChildren(
                h('div', { class: 'status', role: 'status' }, h('div', { class: 'dot' + (on ? '' : ' off') }), h('div', { class: 'stxt' }, h('b', { text: on ? 'Watching' : 'Off' }), ' · ' + tail)),
                h('div', { class: 'keys', text: (TOUCH ? 'Hold a badge for more' : 'Right-click a badge for more') + ' · open from the userscript menu · v' + VERSION }));
        },
        vMain() {
            const c = S.cfg, st = siteCfg();
            const upd = (k, v, live) => { c[k] = v; if (!live) saveCfg(); layer.paint(); for (const it of items.values()) it.resAt = 0; kick(); if (!live) this.render(); };
            const updSite = patch => { setSite(patch); kick(); if ('color' in patch) detectColor(); else this.render(); };

            const here = h('div', { class: 'card' }, this.label('This site', SITE ? SITE.name + ' support' : 'Any plain video'),
                this.row('Badges on ' + HOST, !c.on ? 'Paused everywhere. Turn it back on in General.' : st.off ? 'Off here. Every other site still gets badges.' : 'A circle in the corner of each video', toggle(!st.off, () => updSite({ off: !st.off }), 'Badges on this site', !c.on)),
                this.row('Corner here', st.corner ? 'Only on ' + HOST + '. ' : 'Same as everywhere else',
                    h('div', { class: 'cpw' }, st.corner ? h('button', { class: 'link', text: 'Reset', onclick: () => updSite({ corner: null }) }) : null,
                        this.cornerPick(cornerHere(), k => updSite({ corner: k === c.corner ? null : k })))),
                null);

            const badge = h('div', { class: 'tile' }, this.label('Badge'),
                this.row('Corner', 'Where the circle sits on every site', this.cornerPick(c.corner, k => upd('corner', k))),
                this.row('Size', null, this.seg([['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], c.size, v => upd('size', v))),
                this.slr('Resting opacity', 'Goes solid when you hover or tap', this.slider({ min: 30, max: 100, step: 5, value: c.idle, label: 'Resting opacity', fmt: v => v + '%', commit: (v, live) => upd('idle', v, live) })),
                this.row('Show on', null, this.seg([['all', 'Every video'], ['main', 'Main one']], c.which, v => upd('which', v)), 'wrap'),
                TOUCH ? null : this.row('Appear', 'On hover keeps it out of the way on PC', this.seg([['always', 'Always'], ['hover', 'On hover']], c.show, v => upd('show', v)), 'wrap'),
                this.slr('Skip small videos', 'Ignores thumbnails and tiny previews', this.slider({ min: 80, max: 400, step: 20, value: c.minSize, label: 'Smallest video width', fmt: v => v + ' px', commit: (v, live) => upd('minSize', v, live) })),
                this.row('Duck under headers', 'Slides down when a site bar covers the corner', toggle(c.cover, () => upd('cover', !c.cover), 'Duck under headers')));

            const opening = h('div', { class: 'tile' }, this.label('Opening'),
                this.row('Switch to the new tab', 'Off opens it quietly in the background', toggle(c.active, () => upd('active', !c.active), 'Switch to the new tab')),
                this.row('Quality', null, this.seg([['best', 'Best'], ['saver', 'Data saver']], c.quality, v => upd('quality', v))),
                this.row('No direct file', 'What a tap does when only the post can be found', this.seg([['post', 'Open post'], ['hide', 'Hide badge']], c.noDirect, v => upd('noDirect', v)), 'wrap'),
                this.row('Look harder', 'Quietly loads the post page to find the file when the feed hasn\'t shared it', toggle(c.deep, () => upd('deep', !c.deep), 'Look harder')),
                this.row(TOUCH ? 'Hold for more' : 'Right-click for more', 'Copy link, open the post, hide, settings', toggle(c.hold, () => upd('hold', !c.hold), 'Badge menu')));

            const out = [here, badge, opening];

            const rec = get('recent', []);
            const recent = h('div', { class: 'tile' }, this.label('Recent', c.recent && rec.length ? h('button', { class: 'link', text: 'Clear', onclick: () => { set('recent', []); this.render(); } }) : null),
                this.row('Keep a list of opened videos', 'Saved only in your userscript manager', toggle(c.recent, () => upd('recent', !c.recent), 'Keep a recent list')));
            if (c.recent && rec.length) {
                const list = h('div', { style: 'margin-top:10px' });
                for (const r of rec.slice(0, 8)) list.append(h('div', { class: 'rrow' },
                    h('i', { style: 'background:' + (r.c || FALLBACK) }),
                    h('div', { class: 'nm' }, h('b', { text: r.h }), h('small', { text: ago(r.at) })),
                    r.q ? h('span', { class: 'pill', text: r.q }) : h('span'),
                    h('button', { class: 'ibtn', 'aria-label': 'Open again', title: 'Open again', onclick: () => openUrl(r.u, c.active) }, icon(ICONS.arrow, 15, 2.2)),
                    h('button', { class: 'ibtn', 'aria-label': 'Copy link', title: 'Copy link', onclick: () => { copy(r.u); layer.toast('Video link copied'); } }, icon(ICONS.copy, 15))));
                recent.append(list, h('div', { class: 'd', style: 'margin-top:6px', text: 'Direct links from big sites expire after a while. If one stops working, open it from the post again.' }));
            }
            out.push(recent);

            const offSites = Object.entries(S.sites).filter(([, v]) => v.off).map(([k]) => k).filter(k => k !== HOST);
            if (offSites.length) out.push(h('div', { class: 'tile' }, this.label('Turned off on'),
                h('div', { class: 'chips' }, offSites.map(d => h('button', { class: 'chip', 'aria-label': 'Turn back on for ' + d, onclick: () => { const s = S.sites[d]; delete s.off; if (!Object.keys(s).length) delete S.sites[d]; set('sites', S.sites); this.render(); } }, d, h('span', null, icon(ICONS.close, 9, 2.6)))))));

            out.push(h('div', { class: 'tile' }, this.label('General'),
                this.row('Looking-Glass', c.on ? 'On for every site you haven\'t turned off' : 'Paused. No badges anywhere.', toggle(c.on, () => upd('on', !c.on), 'Looking-Glass on'))));

            out.push(h('div', { class: 'tile', style: 'margin-bottom:14px' }, this.label('Diagnostics', SITE ? SITE.name : 'Generic'),
                h('div', { class: 'kv' },
                    h('span', { text: 'Video links learned' }), h('b', { text: String(IDX.size) }),
                    h('span', { text: 'Videos tracked' }), h('b', { text: String(items.size) }),
                    h('span', { text: 'Last open came from' }), h('b', { text: lastHow || 'nothing yet' }),
                    h('span', { text: 'Device' }), h('b', { text: TOUCH ? 'Touch' : 'Mouse' }))));
            return out;
        },
    };

    /* ───────────────────────── wiring ───────────────────────── */

    try {
        GM_registerMenuCommand('Open Looking-Glass', () => ui.open());
        GM_registerMenuCommand('Badges on / off for this site', () => { setSite({ off: !siteCfg().off }); kick(); layer.toast(siteCfg().off ? 'Off on ' + HOST : 'On for ' + HOST); });
    } catch {}
    try {
        for (const k of ['settings', 'sites']) GM_addValueChangeListener(k, (n, o, v, remote) => {
            if (!remote) return;
            load(); layer.paint(); for (const it of items.values()) it.resAt = 0; kick();
            if (k === 'sites') detectColor();
            if (ui.host) ui.render();
        });
    } catch {}

    function start() {
        layer.ensure();
        detectColor();
        scan();
        setInterval(scan, 800);
        setInterval(kick, 350); // catches layout shifts that don't fire scroll
        const opt = { capture: true, passive: true };
        for (const ev of ['scroll', 'resize', 'wheel', 'touchmove', 'transitionend', 'animationend']) addEventListener(ev, kick, opt);
        addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { PX = e.clientX; PY = e.clientY; if (S.cfg.show === 'hover') kick(); } }, opt);
        for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => { layer.attach(); kick(); });
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { load(); scan(); } });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();