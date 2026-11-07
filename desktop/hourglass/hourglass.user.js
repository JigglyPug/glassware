// ==UserScript==
// @name         Hourglass
// @namespace    jigglypug
// @version      1.5.2
// @description  Screen time for every site, plus a lockdown schedule that blocks distractions. Frosted dashboard with charts, schedule sliders, passes, Music mode, listening time and a late-night nudge. Works on phones too.
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @noframes
// @author       JigglyPug
// @license      MIT
// @icon         https://raw.githubusercontent.com/JigglyPug/glassware/main/assets/icons/hourglass.png?v=2
// @homepageURL  https://jigglypug.github.io/glassware/desktop/hourglass/
// @supportURL   https://github.com/JigglyPug/glassware/issues
// @updateURL    https://raw.githubusercontent.com/JigglyPug/glassware/main/desktop/hourglass/hourglass.user.js
// @downloadURL  https://raw.githubusercontent.com/JigglyPug/glassware/main/desktop/hourglass/hourglass.user.js
// ==/UserScript==

(function () {
    'use strict';

    /* ───────────────────────── constants ───────────────────────── */

    const VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '1.5.2';
    const CAT = {
        social: { n: 'Socials',  c: '#5E5CE6' },
        shop:   { n: 'Shopping', c: '#32ADE6' },
        music:  { n: 'Music',    c: '#FF9FB2' },
        custom: { n: 'Custom',   c: '#A2845E' },
    };
    // light gray reads on dark glass; light glass needs a deeper gray (the audit's hard-to-see check)
    const OTHER = { n: 'Everything else', get c() { return isDark() ? '#C7C7CC' : '#AEAEB2'; } };
    const CATS = ['social', 'shop', 'music', 'custom'];
    const HCOL = ['social', 'shop', 'music', 'custom', 'other']; // order inside each hourly bucket
    const colorOf = cat => (CAT[cat] || OTHER).c;
    const THEMES = {
        free: { a: '#5E5CE6', rgb: '94,92,230', fill: '#5E5CE6', hi: '#9391F7', ink: '#4442B8', on: '#fff', bg: 'rgba(246,246,255,.84)', solid: 'rgb(248,248,255)' },
        lock: { a: '#F0A030', rgb: '240,160,48', fill: '#EE9A22', hi: '#FFC36A', ink: '#8A5200', on: '#1d1d1f', bg: 'rgba(255,250,242,.84)', solid: 'rgb(255,250,243)' },
        off:  { a: '#8e8e93', rgb: '142,142,147', fill: '#8e8e93', hi: '#b8b8bd', ink: '#5e5e63', on: '#fff', bg: 'rgba(255,255,255,.84)', solid: 'rgb(250,250,252)' },
    };
    // the same states on dark glass: the colors stay, the glass and accent text change
    const DARK = {
        free: { ink: '#B3B1FF', bg: 'rgba(26,26,44,.8)', solid: 'rgb(28,28,46)' },
        lock: { ink: '#FFC36A', bg: 'rgba(36,30,22,.8)', solid: 'rgb(38,32,24)' },
        off:  { ink: '#aeaeb2', bg: 'rgba(28,28,32,.8)', solid: 'rgb(30,30,34)' },
    };
    // light or dark glass: the saved choice ('appearance': auto, light or dark), or the device's while it's on auto
    const isDark = () => { const ap = get('appearance', 'auto'); return ap === 'dark' || (ap !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); };
    const themed = k => isDark() ? Object.assign({}, THEMES[k], DARK[k]) : THEMES[k];
    const markTheme = el => { if (el) { if (isDark()) el.setAttribute('data-theme', 'dark'); else el.removeAttribute('data-theme'); } };
    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const DEFAULT_SITES = [
        ['reddit.com', 'social'], ['youtube.com', 'social'], ['discord.com', 'social'], ['x.com', 'social'], ['twitter.com', 'social'],
        ['instagram.com', 'social'], ['facebook.com', 'social'], ['snapchat.com', 'social'],
        ['amazon.com', 'shop'], ['temu.com', 'shop'],
        ['music.youtube.com', 'music'],
    ].map(([d, cat]) => ({ d, cat, rule: 'sched', on: true }));
    const workday = () => ({ on: true, blocks: [{ s: 14, e: 36 }] });              // 7 AM – 6 PM (half-hour units)
    const DEFAULT_SCHED = () => [workday(), workday(), workday(), workday(), workday(), { on: true, blocks: [{ s: 12, e: 20 }] }, { on: false, blocks: [] }];
    const DEFAULTS = { enabled: true, passes: 3, passLen: 5, passWait: 30, idle: 3, video: true, hist: 90, weekStart: 'mon', gateDelay: 5, showAttempts: true, goal: 180,
        listen: true, nudge: true, bedS: 46, bedE: 10, nudgeAfter: 20, nudgeScope: 'list' }; // bedS/bedE in half-hour units (46 = 11 PM, 10 = 5 AM)
    const PRESETS = [
        { n: 'Workday', r: '9–5', b: [{ s: 18, e: 34 }] },
        { n: 'Long day', r: '7–6', b: [{ s: 14, e: 36 }] },
        { n: 'Mornings', r: '6–10', b: [{ s: 12, e: 20 }] },
        { n: 'Evenings', r: '6–10 PM', b: [{ s: 36, e: 44 }] },
        { n: 'Late night', r: '11 PM–7 AM', b: [{ s: 46, e: 48 }], next: [{ s: 0, e: 14 }] },
        { n: 'All day', r: '24h', b: [{ s: 0, e: 48 }] },
    ];
    const GUESS = {
        social: ['tiktok.com', 'twitch.tv', 'pinterest.com', 'tumblr.com', 'threads.net', 'bsky.app', 'linkedin.com', '9gag.com', 'kick.com', 'quora.com', 'imgur.com', 'telegram.org', 'whatsapp.com'],
        shop: ['ebay.com', 'walmart.com', 'target.com', 'etsy.com', 'aliexpress.com', 'shein.com', 'bestbuy.com', 'wish.com', 'newegg.com', 'costco.com', 'wayfair.com'],
        music: ['spotify.com', 'soundcloud.com', 'pandora.com', 'music.apple.com', 'deezer.com', 'tidal.com', 'bandcamp.com'],
    };
    const SLD = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'ne', 'or', 'go', 'gob', 'gouv', 'nic', 'mil', 'ltd', 'plc', 'sch', 'nhs', 'police', 'info', 'biz']);
    const TWO_LEVEL = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.jp', 'co.nz', 'com.br', 'com.mx', 'co.in', 'co.kr', 'com.tr', 'com.cn', 'com.sg']);
    const FLUSH_MS = 15000, SESSION_GAP = 120000, SUGGEST_MIN = 30 * 60, WARN_S = 30;

    /* ───────────────────────── storage ───────────────────────── */

    const clone = o => JSON.parse(JSON.stringify(o));
    const get = (k, d) => { try { const v = GM_getValue(k); return v === undefined ? (d === undefined ? undefined : clone(d)) : v; } catch { return d === undefined ? undefined : clone(d); } };
    const set = (k, v) => { try { GM_setValue(k, v); } catch {} };
    const del = k => { try { GM_deleteValue(k); } catch {} };

    /* ───────────────────────── time + format ───────────────────────── */

    const pad = n => String(n).padStart(2, '0');
    const dayKey = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const dow = (d = new Date()) => (d.getDay() + 6) % 7;                         // 0 = Monday
    const unitsNow = (d = new Date()) => (d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60) / 30;
    const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const minOfDay = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
    const sum = a => a.reduce((x, y) => x + (y || 0), 0);
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    function fmtDur(sec) {
        const m = Math.round((sec || 0) / 60);
        if (m < 1) return sec > 0 ? '<1m' : '0m';
        const h = Math.floor(m / 60), r = m % 60;
        return h ? (r ? h + 'h ' + r + 'm' : h + 'h') : r + 'm';
    }
    function fmtU(u) { // half-hour units → "7:00 AM"
        if (u <= 0 || u >= 48) return '12:00 AM';
        const h = Math.floor(u / 2), m = u % 2 ? '30' : '00';
        return (h % 12 || 12) + ':' + m + (h < 12 ? ' AM' : ' PM');
    }
    function shortU(u) { // "7 AM", "6:30 PM"
        if (u > 48) u -= 48;
        if (u <= 0 || u >= 48) return '12 AM';
        const h = Math.floor(u / 2), m = u % 2 ? ':30' : '';
        return (h % 12 || 12) + m + (h < 12 ? ' AM' : ' PM');
    }
    const hourName = h => (h % 12 || 12) + (h < 12 ? ' AM' : ' PM');
    const clock = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + pad(m) : m) + ':' + pad(x); };

    /* ───────────────────────── domains ───────────────────────── */

    const normHost = h => (h || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    function cleanDomain(input) {
        let d = (input || '').trim().toLowerCase();
        d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[\/?#:]/)[0].replace(/^\*\./, '');
        d = normHost(d);
        return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
    }
    function baseDomain(host) {
        if (!host || /^\d+(\.\d+){3}$/.test(host) || !host.includes('.')) return host;
        const p = host.split('.');
        if (p.length <= 2) return host;
        const multi = TWO_LEVEL.has(p.slice(-2).join('.')) || (p[p.length - 1].length === 2 && SLD.has(p[p.length - 2]));
        return multi ? p.slice(-3).join('.') : p.slice(-2).join('.');
    }
    function matchSite(host, sites) {
        let best = null;
        for (const s of sites) if (host === s.d || host.endsWith('.' + s.d)) if (!best || s.d.length > best.d.length) best = s;
        return best;
    }
    function guessCat(d) {
        for (const k of Object.keys(GUESS)) if (GUESS[k].some(g => d === g || d.endsWith('.' + g))) return k;
        return 'custom';
    }
    const HOST = normHost(location.hostname);
    // Layout: Settings › General can force Desktop or Phone; Auto decides below.
    const LAYOUT = (() => { try { const v = GM_getValue('layout'); return v === 'desktop' || v === 'phone' ? v : 'auto'; } catch { return 'auto'; } })();
    // Phones: the browser's own mobile flag, a mobile user agent, or an iPad (iPadOS reports itself as a Mac).
    // "Desktop site" mode on a phone hides both, so a touch screen also counts, but only when the screen is phone-sized:
    // touchscreen laptops often report their touchpad as a coarse pointer, and they should keep the desktop panel.
    const MOBILE = LAYOUT === 'phone' ? true : LAYOUT === 'desktop' ? false : (() => {
        try {
            const ua = navigator.userAgent;
            if (navigator.userAgentData?.mobile === true) return true;
            if (/Android|iPhone|iPod|iPad|Mobile|Silk|Kindle|Opera Mini/i.test(ua)) return true;
            if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
            const phoneSized = Math.min(screen.width, screen.height) <= 600;
            return phoneSized && navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches;
        } catch { return false; }
    })();

    /* ───────────────────────── state ───────────────────────── */

    const S = {};
    function freshPasses() { return { day: dayKey(), used: [], open: {} }; }
    function load() {
        const saved = get('settings');
        S.cfg = Object.assign(clone(DEFAULTS), saved || {});
        // setup mode: a brand-new install counts screen time but blocks nothing until you tap Start lockdown.
        // Installs from before 1.2.1 already have saved settings, so they stay armed.
        if (typeof S.cfg.armed !== 'boolean') S.cfg.armed = !!saved;
        S.sched = get('schedule', DEFAULT_SCHED());
        S.schedPend = get('schedPending', {});
        S.sites = get('sites', DEFAULT_SITES);
        S.sitesPend = get('sitesPending', {});
        S.ignored = get('ignored', []);
        S.music = !!get('music', false);
        S.passes = get('passes', freshPasses());
        if (S.passes.day !== dayKey()) S.passes = freshPasses();
    }
    const saveCfg = () => set('settings', S.cfg);
    const statKey = host => { const m = matchSite(host, S.sites); return m ? m.d : baseDomain(host); };
    const catOf = key => { const m = S.sites.find(s => s.d === key) || matchSite(key, S.sites); return m ? m.cat : 'other'; };

    /* ───────────────────────── schedule ───────────────────────── */

    function slots(day) { const s = new Set(); if (day && day.on) for (const b of day.blocks) for (let i = b.s; i < b.e; i++) s.add(i); return s; }
    function looser(oldDay, newDay) { const a = slots(oldDay), b = slots(newDay); for (const x of a) if (!b.has(x)) return true; return false; }
    const dayHours = day => slots(day).size / 2;
    function currentBlock(date = new Date()) {
        const d = S.sched[dow(date)], u = unitsNow(date);
        if (!d || !d.on) return null;
        const hit = d.blocks.find(b => u >= b.s && u < b.e);
        if (!hit) return null;
        let end = hit.e, grew = true; // merge touching blocks into one stretch
        while (grew) { grew = false; for (const b of d.blocks) if (b.s <= end && b.e > end) { end = b.e; grew = true; } }
        if (end >= 48) { // runs into tomorrow morning
            const nx = S.sched[(dow(date) + 1) % 7];
            if (nx && nx.on) { let e2 = 0; grew = true; while (grew) { grew = false; for (const b of nx.blocks) if (b.s <= e2 && b.e > e2) { e2 = b.e; grew = true; } } end = 48 + e2; }
        }
        return { s: hit.s, e: end };
    }
    // armAt: "start at the next lockdown" skips the block you were in when you tapped Start
    const isArmed = () => S.cfg.armed === true && !(S.cfg.armAt && Date.now() < S.cfg.armAt);
    const inLockdown = () => S.cfg.enabled && isArmed() && !!currentBlock();
    function lockWindow(i) {
        const d = S.sched[i];
        if (!d || !d.on || !d.blocks.length) return null;
        return { s: Math.min(...d.blocks.map(b => b.s)), e: Math.max(...d.blocks.map(b => b.e)) };
    }
    function blocksText(i) {
        const d = S.sched[i];
        if (!d || !d.on || !d.blocks.length) return null;
        const merged = [];
        for (const b of [...d.blocks].sort((x, y) => x.s - y.s)) { const last = merged[merged.length - 1]; if (last && b.s <= last.e) last.e = Math.max(last.e, b.e); else merged.push({ s: b.s, e: b.e }); }
        return merged.map(b => shortU(b.s) + ' – ' + shortU(b.e)).join(', ');
    }
    // bedtime window can wrap past midnight (11 PM → 5 AM)
    function inBedtime(d = new Date()) {
        const u = unitsNow(d), a = S.cfg.bedS % 48, b = S.cfg.bedE % 48;
        return a > b ? (u >= a || u < b) : (u >= a && u < b);
    }
    function nightId(d = new Date()) {
        const a = S.cfg.bedS % 48, b = S.cfg.bedE % 48;
        return a > b && unitsNow(d) < b ? dayKey(addDays(d, -1)) : dayKey(d);
    }
    function lastNightId(d = new Date()) {
        const a = S.cfg.bedS % 48, b = S.cfg.bedE % 48;
        if (a > b) return dayKey(addDays(d, -1));
        return unitsNow(d) >= b ? dayKey(d) : dayKey(addDays(d, -1));
    }
    function nextLockdownText() {
        const now = new Date(), u = unitsNow(now), t = dow(now);
        const later = (S.sched[t].on ? S.sched[t].blocks : []).filter(b => b.s > u).sort((a, b) => a.s - b.s)[0];
        if (later) return 'next lockdown today at ' + shortU(later.s);
        for (let k = 1; k <= 7; k++) {
            const d = S.sched[(t + k) % 7];
            if (d.on && d.blocks.length) return 'next lockdown ' + (k === 1 ? 'tomorrow' : DAYS[(t + k) % 7]) + ' at ' + shortU(Math.min(...d.blocks.map(b => b.s)));
        }
        return 'no lockdown on your schedule';
    }
    function lockLeftSec() {
        const b = currentBlock(); if (!b) return 0;
        return Math.max(0, (b.e - unitsNow()) * 1800);
    }
    // looser edits made during lockdown wait here, then apply once it ends
    function applyPendingIfFree() {
        if (currentBlock()) return false;
        let changed = false;
        if (Object.keys(S.schedPend).length) {
            for (const [i, d] of Object.entries(S.schedPend)) S.sched[+i] = d;
            S.schedPend = {}; set('schedule', S.sched); set('schedPending', {}); changed = true;
        }
        if (Object.keys(S.sitesPend).length) {
            S.sites = S.sites.map(s => S.sitesPend[s.d] ? Object.assign({}, s, S.sitesPend[s.d]) : s);
            S.sitesPend = {}; set('sites', S.sites); set('sitesPending', {}); changed = true;
        }
        return changed;
    }

    /* ───────────────────────── stats ───────────────────────── */

    const DKEY = k => 'day:' + k;
    const emptyHours = () => Array.from({ length: 24 }, () => [0, 0, 0, 0, 0]);
    const newDay = () => ({ s: {}, v: {}, h: emptyHours(), first: null, long: null, att: {}, attH: Array(24).fill(0), pass: [], ls: {} });
    let pend = null, lastFlush = Date.now();
    function pendFor(k) {
        if (!pend || pend.day !== k) { if (pend) flush(); pend = { day: k, s: {}, v: {}, h: {}, first: null, long: null, att: {}, attH: {}, pass: [], ls: {}, nt: {} }; }
        return pend;
    }
    function flush() {
        lastFlush = Date.now();
        if (!pend) return;
        const p = pend; pend = null;
        if (Object.keys(p.nt).length) {
            const n = get('nights', {});
            for (const id in p.nt) { const x = n[id] || (n[id] = { all: 0, list: 0 }); x.all = Math.round((x.all + p.nt[id].all) * 10) / 10; x.list = Math.round((x.list + p.nt[id].list) * 10) / 10; }
            const ids = Object.keys(n).sort(); while (ids.length > 60) delete n[ids.shift()];
            set('nights', n);
        }
        if (!Object.keys(p.s).length && !Object.keys(p.v).length && !Object.keys(p.att).length && !p.pass.length && !Object.keys(p.ls).length) return;
        const o = get(DKEY(p.day), null) || newDay();
        for (const k in p.s) o.s[k] = Math.round(((o.s[k] || 0) + p.s[k]) * 10) / 10;
        for (const k in p.v) o.v[k] = (o.v[k] || 0) + p.v[k];
        for (const hr in p.h) { const a = o.h[hr] || (o.h[hr] = [0, 0, 0, 0, 0]); p.h[hr].forEach((v, i) => { a[i] = Math.round((a[i] + v) * 10) / 10; }); }
        if (p.first != null && (o.first == null || p.first < o.first)) o.first = p.first;
        if (p.long && (!o.long || p.long.sec > o.long.sec)) o.long = p.long;
        for (const k in p.att) o.att[k] = (o.att[k] || 0) + p.att[k];
        for (const hr in p.attH) o.attH[hr] = (o.attH[hr] || 0) + p.attH[hr];
        o.pass = (o.pass || []).concat(p.pass);
        o.ls = o.ls || {};
        for (const k in p.ls) o.ls[k] = Math.round(((o.ls[k] || 0) + p.ls[k]) * 10) / 10;
        set(DKEY(p.day), o);
        registerDay(p.day);
    }
    // Regular saves take turns across tabs. Saving adds a tab's new time to the stored total, so two
    // tabs saving at the same instant would both add to the same old total and one tab's time would
    // be lost. A tab claims the turn, waits a moment for other tabs to see the claim, and saves only
    // if the claim is still its own; otherwise it tries again shortly. Claims expire, so a closed tab
    // never blocks saving, and after a few tries a tab saves anyway. Saves when leaving a page can't
    // wait, so they stay immediate.
    const TURN = 'saveTurn', TURN_MS = 3000;
    let turnWait = false;
    function flushSoon(done, tries = 0) {
        lastFlush = Date.now();
        if (!pend) { if (done) done(); return; }
        if (turnWait) return;                          // this tab's save is already on its way
        const retry = () => { turnWait = false; setTimeout(() => flushSoon(done, tries + 1), 300 + Math.random() * 500); };
        const cur = get(TURN, null);
        if (tries < 8 && cur && cur.id !== TAB_ID && Date.now() - cur.t < TURN_MS) { turnWait = true; return retry(); }
        const mine = { id: TAB_ID, t: Date.now() };
        turnWait = true; set(TURN, mine);
        setTimeout(() => {
            const now = get(TURN, null);
            if (tries < 8 && now && (now.id !== TAB_ID || now.t !== mine.t) && Date.now() - now.t < TURN_MS) return retry();
            flush();
            const after = get(TURN, null); if (after && after.id === TAB_ID) del(TURN);
            turnWait = false;
            if (done) done();
        }, 250);
    }
    function registerDay(k) {
        const idx = get('days', []);
        if (idx.includes(k)) return;
        idx.push(k); idx.sort();
        const cutoff = dayKey(addDays(new Date(), -S.cfg.hist));
        while (idx.length && idx[0] < cutoff) del(DKEY(idx.shift()));
        set('days', idx);
    }
    function prune() {
        const idx = get('days', []), cutoff = dayKey(addDays(new Date(), -S.cfg.hist));
        let n = 0; while (idx.length && idx[0] < cutoff) { del(DKEY(idx.shift())); n++; }
        if (n) set('days', idx);
    }
    function recordAttempt(key) { const p = pendFor(dayKey()), hr = new Date().getHours(); p.att[key] = (p.att[key] || 0) + 1; p.attH[hr] = (p.attH[hr] || 0) + 1; flush(); }
    function recordPass(key) { pendFor(dayKey()).pass.push({ d: key, at: minOfDay() }); flush(); }

    /* ───────────────────────── tracker ───────────────────────── */

    let lastInput = Date.now(), lastTick = Date.now(), session = null;
    const bump = () => { lastInput = Date.now(); };
    for (const ev of ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'touchmove', 'scroll', 'pointerdown']) addEventListener(ev, bump, { capture: true, passive: true });
    function mediaPlaying() {
        for (const m of document.querySelectorAll('video,audio')) if (!m.paused && !m.ended && m.readyState > 2) return true;
        return false;
    }
    function isActive(now) {
        if (!S.cfg.enabled || !HOST || blocker.up) return false;
        if (document.visibilityState !== 'visible') return false;
        const focused = document.hasFocus(), playing = S.cfg.video && mediaPlaying();
        if (!focused && !playing) return false;
        return now - lastInput < S.cfg.idle * 60000 || playing;
    }
    function track(now, dt) {
        if (!isActive(now) || dt <= 0) return;
        const k = dayKey(), key = statKey(HOST), hr = new Date().getHours(), p = pendFor(k);
        p.s[key] = (p.s[key] || 0) + dt;
        (p.h[hr] || (p.h[hr] = [0, 0, 0, 0, 0]))[HCOL.indexOf(catOf(key))] += dt;
        const mod = minOfDay();
        if (p.first == null || mod < p.first) p.first = mod;
        if (!session || session.key !== key || session.day !== k || now - session.last > SESSION_GAP) {
            session = { key, day: k, sec: 0, at: mod, last: now };
            p.v[key] = (p.v[key] || 0) + 1;
        }
        session.sec += dt; session.last = now;
        if (!p.long || session.sec > p.long.sec) p.long = { d: key, sec: Math.round(session.sec), at: session.at };
        if (inBedtime()) { const id = nightId(), x = p.nt[id] || (p.nt[id] = { all: 0, list: 0 }); x.all += dt; if (catOf(key) !== 'other') x.list += dt; }
    }

    // listening: sound playing in any tab, even hidden or behind a game. One tab counts at a time.
    const TAB_ID = Math.random().toString(36).slice(2);
    let lastListen = Date.now();
    function audible() {
        for (const m of document.querySelectorAll('video,audio')) if (!m.paused && !m.ended && m.readyState > 2 && !m.muted && m.volume > 0) return true;
        return false;
    }
    function trackListen(now) {
        let dt = (now - lastListen) / 1000; lastListen = now;
        if (dt > 70) dt = 0; // hidden tabs can tick slowly; anything longer means the PC slept
        if (MOBILE || dt <= 0 || !S.cfg.enabled || !S.cfg.listen || !HOST || blocker.up || !audible()) return;
        const o = get('listenOwner', null);
        if (o && o.id !== TAB_ID && now - o.at < 5000) return;
        const held = !!o && o.id === TAB_ID && now - o.at < 5000;
        set('listenOwner', { id: TAB_ID, at: now });
        if (!held) return; // claim now, count from the next tick: if two tabs race, the last writer wins and only it counts
        const p = pendFor(dayKey()), key = statKey(HOST);
        p.ls[key] = (p.ls[key] || 0) + dt;
    }
    function listenToday() {
        const k = dayKey(), o = get(DKEY(k), null);
        return sum(Object.values(o?.ls || {})) + (pend && pend.day === k ? sum(Object.values(pend.ls)) : 0);
    }
    function nightTotal(id, scope) {
        const n = get('nights', {})[id] || { all: 0, list: 0 }, pp = pend && pend.nt[id];
        return n[scope] + (pp ? pp[scope] : 0);
    }

    /* ───────────────────────── icons + dom ───────────────────────── */

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

    function icon(paths, size = 14, sw = 2) {
        const s = document.createElementNS(SVGNS, 'svg');
        s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
        s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', sw);
        s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
        for (const d of [].concat(paths)) { const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); s.append(p); }
        return s;
    }
    const ICONS = {
        glass: ['M6 2.5h12', 'M6 21.5h12', 'M7.5 2.5v3c0 2.4 1.9 3.9 4.5 6.5-2.6 2.6-4.5 4.1-4.5 6.5v3', 'M16.5 2.5v3c0 2.4-1.9 3.9-4.5 6.5 2.6 2.6 4.5 4.1 4.5 6.5v3', 'M9.5 19h5'],
        close: ['M6 6l12 12', 'M18 6 6 18'],
        lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
        music: ['M9 18V5l12-2v13', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
        plus: ['M12 5v14', 'M5 12h14'],
        chev: ['m6 9 6 6 6-6'],
        trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
        down: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
        up: ['M12 21V9', 'm7 14 5-5 5 5', 'M5 3h14'],
        globe: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M3 12h18', 'M12 3c2.5 2.7 2.5 15.3 0 18', 'M12 3c-2.5 2.7-2.5 15.3 0 18'],
        check: ['M5 12.5l4.5 4.5L19 7'],
        moon: ['M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7Z'],
        sun: ['M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7', 'M12 2.5v2', 'M12 19.5v2', 'M2.5 12h2', 'M19.5 12h2', 'M5.3 5.3l1.4 1.4', 'M17.3 17.3l1.4 1.4', 'M5.3 18.7l1.4-1.4', 'M17.3 6.7l1.4-1.4'],
        headphones: ['M4 15v-3a8 8 0 0 1 16 0v3', 'M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2Z', 'M20 15a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2Z'],
    };
    function gwCloseIcon() {   // glassware:icon (the close button's ×, stamped by tools/frame.py)
        const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg');
        for (const [k, v] of [['viewBox', '0 0 24 24'], ['width', '13'], ['height', '13'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2.2'], ['stroke-linecap', 'round'], ['aria-hidden', 'true']]) s.setAttribute(k, v);
        for (const d of ['M6 6l12 12', 'M18 6 6 18']) { const q = document.createElementNS(NS, 'path'); q.setAttribute('d', d); s.append(q); }
        return s;
    }   // glassware:icon end
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
    function sv(tag, attrs, ...kids) {
        const el = document.createElementNS(SVGNS, tag);
        for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
        for (const kid of kids.flat()) if (kid != null) el.append(kid);
        return el;
    }
    const toggle = (on, onclick, label, disabled) => h('button', { class: 'sw', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label, disabled: !!disabled, onclick });
    function hostEl(id) {
        const host = document.createElement('hourglass-ui');
        host.id = id;
        host.style.cssText = 'all:initial;position:fixed;inset:auto;z-index:2147483647;';
        return host;
    }
    const frames = new Set();
    function fitFrame(el) {
        const v = window.visualViewport;
        const st = el.style, k = (MOBILE && v && v.scale) || 1; // set one by one so the theme variables on the frame survive
        st.position = 'fixed'; st.transformOrigin = '0 0';
        if (!MOBILE || !v) { st.left = st.top = '0'; st.width = st.height = '100%'; st.transform = ''; return; }
        st.left = v.offsetLeft + 'px'; st.top = v.offsetTop + 'px'; st.width = v.width * k + 'px'; st.height = v.height * k + 'px'; st.transform = k === 1 ? '' : `scale(${1 / k})`;
    }
    function frame(cls) {
        const el = h('div', { class: 'frame ' + (cls || '') + (MOBILE ? ' m' : '') });
        fitFrame(el); frames.add(el);
        return el;
    }
    const refit = () => { for (const el of frames) if (el.isConnected) fitFrame(el); else frames.delete(el); };
    try { visualViewport.addEventListener('resize', refit); visualViewport.addEventListener('scroll', refit); } catch {}
    addEventListener('resize', refit);
    function mount(host) {
        const t = document.body || document.documentElement;
        if (t) { t.append(host); return; }
        new MutationObserver((_, o) => { const x = document.body || document.documentElement; if (x) { o.disconnect(); if (!host.isConnected) x.append(host); } }).observe(document, { childList: true, subtree: true });
    }

    /* ───────────────────────── shared css ───────────────────────── */

    const BASE_CSS = `
:host{all:initial}
*{box-sizing:border-box;margin:0}
[hidden]{display:none!important}
button{font:inherit;color:inherit;cursor:pointer}
button:disabled{cursor:not-allowed}
.vars{--guide:rgba(29,29,31,.4);--faint:rgba(0,0,0,.3);--text:#1d1d1f;--sub:rgba(29,29,31,.64);--line:rgba(0,0,0,.07);
  /* light and dark glass: only these neutrals swap; purple, amber and the category colors stay */
  --edge:rgba(255,255,255,.8);--hl:#fff;--drop:rgba(0,0,0,.34);--ctl:rgba(0,0,0,.055);--ctl-hi:rgba(0,0,0,.1);--sw-off:rgba(0,0,0,.13);
  --field:rgba(255,255,255,.65);--field-hi:#fff;--track:rgba(0,0,0,.1);--knob:#fff;--danger:#b4271b;--warn-ink:#8a2440;--good:#1f7a3a;--music-ink:#c2335a;
  --veil:rgba(255,248,238,.6);--veil-soft:rgba(255,250,243,.42);--card:rgba(255,252,247,.84);--warn-bg:rgba(255,236,206,.95);--mono:"SF Mono",ui-monospace,"Cascadia Code","JetBrains Mono",Consolas,monospace;
  font:13px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable Text","Segoe UI",Inter,system-ui,sans-serif;color:var(--text);-webkit-font-smoothing:antialiased}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 13px;border-radius:10px;border:1px solid var(--line);background:var(--field);font-size:12px;font-weight:500;transition:background .15s,opacity .5s,transform .5s;white-space:nowrap}
.btn:hover{background:var(--field-hi)}
.btn:disabled{opacity:.45}
.dbtns{display:grid;grid-template-columns:repeat(3,max-content) 1fr;gap:8px}
.dbtns .danger{justify-self:end}
.btn.primary{background:var(--fill);color:var(--on);border-color:transparent;box-shadow:0 4px 14px -6px rgba(var(--a-rgb),1)}
.btn.primary:hover{filter:brightness(1.06)}
.btn.sm{height:28px;padding:0 10px;font-size:11.5px;border-radius:8px}
.btn.danger{color:var(--danger)}
.btn:focus-visible,.sw:focus-visible,.seg button:focus-visible,.ibtn:focus-visible,.day:focus-visible,.chip:focus-visible,.wkr:focus-visible,.link:focus-visible,.gbtn:focus-visible,.disc:focus-visible{outline:2px solid var(--fill);outline-offset:2px}
.fade{opacity:0;transform:translateY(6px);pointer-events:none}
.fade.ready{opacity:1;transform:none;pointer-events:auto}
.pill{display:inline-flex;align-items:center;gap:5px;font:600 9.5px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;padding:5px 7px;border-radius:6px;background:var(--ctl);color:var(--sub);white-space:nowrap}
.pill.acc{background:rgba(var(--a-rgb),.16);color:var(--ink)}
.pill.warn{background:rgba(var(--a-rgb),.22);color:var(--ink)}
.link{border:0;background:none;padding:0;color:var(--ink);font-size:11.5px;font-weight:500}
.link:hover{text-decoration:underline}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
.vars[data-theme=dark]{--guide:rgba(235,235,245,.42);--faint:rgba(255,255,255,.3);--text:#f2f2f5;--sub:rgba(235,235,245,.62);--line:rgba(255,255,255,.09);
  --edge:rgba(255,255,255,.12);--hl:rgba(255,255,255,.1);--drop:rgba(0,0,0,.6);--ctl:rgba(255,255,255,.08);--ctl-hi:rgba(255,255,255,.14);--sw-off:rgba(255,255,255,.2);
  --field:rgba(255,255,255,.06);--field-hi:rgba(255,255,255,.12);--track:rgba(255,255,255,.16);--knob:#55555f;--danger:#ff8a80;--warn-ink:#ffb3c1;--good:#5fd38a;--music-ink:#ff8fab;
  --veil:rgba(14,13,20,.62);--veil-soft:rgba(14,13,20,.42);--card:rgba(28,26,34,.8);--warn-bg:rgba(74,52,18,.95);color-scheme:dark}
`;

    /* ───────────────────────── blocker ───────────────────────── */

    const BLOCK_CSS = BASE_CSS + `
.frame{pointer-events:none}
.frame>*{pointer-events:auto}
.veil{position:absolute;inset:0;display:grid;grid-template-columns:minmax(0,1fr);place-items:center;overflow:auto;padding:20px;
  background:radial-gradient(70% 60% at 50% 45%,rgba(var(--a-rgb),.22),var(--veil) 70%);
  backdrop-filter:blur(16px) saturate(80%);-webkit-backdrop-filter:blur(16px) saturate(80%);animation:vin .35s ease-out}
@keyframes vin{from{opacity:0}}
.card{width:520px;max-width:100%;padding:34px 36px 26px;border-radius:28px;text-align:center;background:var(--card);
  backdrop-filter:blur(28px) saturate(170%);-webkit-backdrop-filter:blur(28px) saturate(170%);border:1px solid var(--edge);
  box-shadow:0 0 0 .5px rgba(var(--a-rgb),.5),0 0 60px -14px rgba(var(--a-rgb),.9),0 40px 90px -30px var(--drop),inset 0 1px 0 var(--hl)}
.logo{width:64px;height:64px;margin:0 auto 16px;border-radius:19px;display:grid;place-items:center;color:var(--on);background:linear-gradient(140deg,var(--fill-hi),var(--fill));box-shadow:0 10px 26px -8px rgba(var(--a-rgb),1),inset 0 1px 0 rgba(255,255,255,.4)}
/* glass tile like the app icon; the color still follows the script's state */
.logo{position:relative;overflow:hidden;color:#fff;
  background:radial-gradient(120% 90% at 50% 62%,rgba(11,11,22,.55),rgba(11,11,22,0) 70%),linear-gradient(145deg,color-mix(in srgb,var(--fill-hi) 72%,#0b0b16),color-mix(in srgb,var(--fill) 46%,#0b0b16));
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.3),inset 0 1px 0 rgba(255,255,255,.5),inset 0 0 6px 1px rgba(var(--a-rgb),.55),inset 0 -8px 12px -8px rgba(0,0,0,.45),0 4px 16px -4px rgba(var(--a-rgb),.95),0 0 12px -3px rgba(var(--a-rgb),.6)}
.logo::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(180deg,rgba(255,255,255,.28),rgba(255,255,255,0) 48%),linear-gradient(135deg,transparent 34%,rgba(255,255,255,.09) 34% 44%,transparent 44%)}
.logo svg{position:relative;filter:drop-shadow(0 0 1.2px rgba(255,255,255,.95)) drop-shadow(0 0 4px rgba(var(--a-rgb),.95))}
.logo svg.gg{width:88%;height:88%;filter:none;overflow:visible}
.logo svg{animation:flip 6s ease-in-out infinite}
@keyframes flip{0%,82%{transform:rotate(0)}100%{transform:rotate(180deg)}}
h1{margin:14px 0 4px;font-size:26px;letter-spacing:-.025em;font-weight:650;line-height:1.2}

h1 span{color:var(--ink)}
.cd{font:600 54px/1 var(--mono);letter-spacing:-.02em;margin:16px 0 4px;font-variant-numeric:tabular-nums}
.cdl{font-size:12.5px;color:var(--sub)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin:22px 0}
.stat{padding:11px 8px;border-radius:14px;background:var(--field);border:1px solid var(--line)}
.stat b{display:block;font-size:17px;font-weight:650;letter-spacing:-.02em}
.stat small{font-size:11px;color:var(--sub)}
.btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.btns .btn{height:44px;min-width:150px;padding:0 18px;border-radius:13px;font-size:14px;font-weight:600}
.foot{margin-top:16px;font-size:12px;color:var(--sub)}
.ring{position:relative;width:150px;height:150px;margin:10px auto 6px}
.ring svg{transform:rotate(-90deg)}
.ring .n{position:absolute;inset:0;display:grid;place-items:center;font:600 40px/1 var(--mono)}
.ring circle.p{transition:stroke-dashoffset 1s linear}
.passpill{position:absolute;right:22px;bottom:22px;display:flex;align-items:center;gap:12px;padding:10px 10px 10px 16px;border-radius:16px;background:var(--card);
  backdrop-filter:blur(28px) saturate(170%);-webkit-backdrop-filter:blur(28px) saturate(170%);border:1px solid var(--edge);
  box-shadow:0 0 0 .5px rgba(var(--a-rgb),.5),0 18px 40px -16px rgba(0,0,0,.4),0 0 30px -10px rgba(var(--a-rgb),.9);animation:vin .3s ease-out;transition:transform .3s}
.passpill .dot{width:10px;height:10px;border-radius:50%;background:var(--fill);box-shadow:0 0 0 3px rgba(var(--a-rgb),.2),0 0 10px rgba(var(--a-rgb),.9)}
.passpill b{font:600 14px var(--mono)}
.passpill small{display:block;font-size:11px;color:var(--sub)}
.passpill.warn{background:var(--warn-bg);transform:scale(1.04);box-shadow:0 0 0 1.5px var(--fill),0 18px 40px -16px rgba(0,0,0,.4),0 0 40px -6px rgba(var(--a-rgb),1)}
.passpill.warn .dot{animation:pulse 1s ease-in-out infinite}
@keyframes pulse{50%{transform:scale(1.5)}}
@media (max-width:560px){
  .veil{padding:14px}
  .card{padding:26px 20px 20px;border-radius:24px}
  .logo{width:54px;height:54px;border-radius:16px;margin-bottom:12px}
  h1{font-size:21px}
  .cd{font-size:44px;margin-top:12px}
  .stats{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:18px 0}
  .stat{padding:10px 4px}.stat b{font-size:15px}
  .btns .btn{flex:1;min-width:0;padding:0 10px}
  .passpill{left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));justify-content:space-between}
}
.m .veil{padding:14px}
.m .card{padding:26px 20px 20px;border-radius:24px}
.m .logo{width:54px;height:54px;border-radius:16px;margin-bottom:12px}
.m h1{font-size:21px}
.m .cd{font-size:44px;margin-top:12px}
.m .stats{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:18px 0}
.m .stat{padding:10px 4px}.m .stat b{font-size:15px}
.m .btns .btn{flex:1;min-width:0;padding:0 10px}
.m .passpill{left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));justify-content:space-between}
`;
    const blocker = {
        host: null, root: null, wrap: null, el: {}, up: false, state: null, reason: null, waitLeft: 0, waitTimer: null, prevOverflow: null, expired: false,

        ensure() {
            if (this.host) { if (!this.host.isConnected) mount(this.host); return; }
            this.host = hostEl('hourglass-block');
            const root = this.root = this.host.attachShadow({ mode: 'closed' });
            root.append(h('style', { text: BLOCK_CSS }));
            this.wrap = frame('vars');
            this.retheme();
            root.append(this.wrap);
            mount(this.host);
        },
        // light or dark, following the panel's switch
        retheme() {
            if (!this.wrap) return;
            const T = themed('lock');
            markTheme(this.wrap);
            for (const [k, v] of Object.entries({ '--a-rgb': T.rgb, '--fill': T.fill, '--fill-hi': T.hi, '--ink': T.ink, '--on': T.on })) this.wrap.style.setProperty(k, v);
        },

        show(reason, countIt) {
            this.ensure();
            this.reason = reason;
            if (!this.up) {
                this.up = true; this.state = 'blocked';
                this.prevOverflow = document.documentElement?.style.overflow || '';
                if (document.documentElement) document.documentElement.style.overflow = 'hidden';
                if (countIt) recordAttempt(reason.site.d);
                this.render();
            }
        },
        hide() {
            if (!this.up) return;
            this.up = false; this.state = null; clearInterval(this.waitTimer);
            if (document.documentElement) document.documentElement.style.overflow = this.prevOverflow || '';
            this.el.veil?.remove(); this.el.veil = null;
        },
        passesLeft() { return Math.max(0, S.cfg.passes - S.passes.used.length); },

        render() {
            if (!this.up) return;
            const r = this.reason, d = r.site.d, E = this.el;
            E.veil?.remove();
            let card;
            if (this.state === 'waiting') {
                const C = 402.12;
                E.ring = sv('circle', { class: 'p', cx: 75, cy: 75, r: 64, fill: 'none', stroke: THEMES.lock.fill, 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-dasharray': C, 'stroke-dashoffset': 0 });
                E.n = h('div', { class: 'n', text: String(this.waitLeft) });
                E.openBtn = h('button', { class: 'btn primary fade', disabled: true, text: 'Open for ' + S.cfg.passLen + ' min', onclick: () => this.usePass() });
                card = h('div', { class: 'card', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Waiting before a pass' },
                    h('span', { class: 'pill', text: 'Pass · ' + this.passesLeft() + ' of ' + S.cfg.passes + ' left' }),
                    h('h1', { text: 'Take a breath.' }),
                    h('div', { class: 'cdl', text: 'Still want ' + d + ' once this runs out?' }),
                    h('div', { class: 'ring' }, sv('svg', { width: 150, height: 150, viewBox: '0 0 150 150', 'aria-hidden': 'true' },
                        sv('circle', { cx: 75, cy: 75, r: 64, fill: 'none', stroke: 'rgba(0,0,0,.08)', 'stroke-width': 10 }), E.ring), E.n),
                    h('div', { class: 'btns', style: 'margin-top:14px' },
                        h('button', { class: 'btn', text: 'Never mind', onclick: () => { clearInterval(this.waitTimer); this.state = 'blocked'; this.render(); } }), E.openBtn),
                    h('div', { class: 'foot', text: 'Never mind keeps your pass.' }));
            } else if (this.state === 'closed') {
                card = h('div', { class: 'card' },
                    h('div', { class: 'logo' }, icon(ICONS.check, 28, 2.2)),
                    h('h1', { text: 'Good call.' }),
                    h('div', { class: 'cdl', text: "Your browser won't let Hourglass close this tab on its own. Close it whenever you're ready." }));
            } else {
                const att = (get(DKEY(dayKey()), null)?.att || {})[d] || 0;
                const week = sum(lastDays(7).map(x => (x.o?.s || {})[d] || 0));
                const left = this.passesLeft();
                const sched = r.kind === 'sched';
                E.cd = sched ? h('div', { class: 'cd', 'aria-label': 'Time left', text: clock(lockLeftSec()) }) : null;
                card = h('div', { class: 'card', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': d + ' is locked' },
                    h('div', { class: 'logo' }, glassGlyph('hourglass')),
                    h('span', { class: 'pill' }, icon(ICONS.lock, 10, 2.8), sched ? 'Lockdown' : 'Always blocked'),
                    h('h1', null, h('span', { text: d }), sched ? ' is locked until ' + shortU(currentBlock()?.e ?? 0) : ' is blocked all day'),
                    E.cd, sched ? h('div', { class: 'cdl', text: 'until it opens again' }) : h('div', { class: 'cdl', text: 'You set this site to Always in Hourglass.' }),
                    h('div', { class: 'stats' },
                        S.cfg.showAttempts ? h('div', { class: 'stat' }, h('b', { text: ordinal(att || 1) + ' try' }), h('small', { text: 'today' })) : null,
                        h('div', { class: 'stat' }, h('b', { text: fmtDur(week) }), h('small', { text: 'here this week' })),
                        h('div', { class: 'stat' }, h('b', { text: left + ' of ' + S.cfg.passes }), h('small', { text: 'passes left' }))),
                    h('div', { class: 'btns' },
                        h('button', { class: 'btn primary', text: 'Close tab', onclick: () => this.closeTab() }),
                        h('button', { class: 'btn', text: left ? 'Use a pass' : 'No passes left', disabled: !left, onclick: () => this.startWait() })),
                    h('div', { class: 'foot' }, left ? 'A pass opens only ' + d + ', for ' + S.cfg.passLen + ' minutes, after a ' + S.cfg.passWait + '-second wait. ' : 'Passes reset at midnight. ',
                        h('button', { class: 'link', text: 'Open Hourglass', onclick: () => ui.open() })));
            }
            E.veil = h('div', { class: 'veil' }, card);
            this.wrap.append(E.veil);
            const focusable = card.querySelector('button:not([disabled])'); focusable?.focus({ preventScroll: true });
        },

        startWait() {
            if (!this.passesLeft()) return;
            this.state = 'waiting'; this.waitLeft = S.cfg.passWait; this.render();
            const C = 402.12, total = S.cfg.passWait;
            clearInterval(this.waitTimer);
            this.waitTimer = setInterval(() => {
                this.waitLeft = Math.max(0, this.waitLeft - 1);
                if (this.el.n) this.el.n.textContent = String(this.waitLeft);
                if (this.el.ring) this.el.ring.setAttribute('stroke-dashoffset', (C * (1 - this.waitLeft / total)).toFixed(1));
                if (!this.waitLeft) { clearInterval(this.waitTimer); this.el.openBtn.disabled = false; this.el.openBtn.classList.add('ready'); this.el.openBtn.focus(); }
            }, 1000);
        },
        usePass() {
            S.passes = get('passes', freshPasses());
            if (S.passes.day !== dayKey()) S.passes = freshPasses();
            if (!this.passesLeft()) { this.state = 'blocked'; this.render(); return; }
            const d = this.reason.site.d;
            S.passes.used.push({ d, at: Date.now() });
            S.passes.open[d] = Date.now() + S.cfg.passLen * 60000;
            set('passes', S.passes);
            recordPass(d);
            this.hide();
            this.renderPill();
        },
        closeTab() {
            try { window.close(); } catch {}
            setTimeout(() => {
                if (!this.up) return;
                if (history.length > 1) { history.back(); setTimeout(() => { if (this.up) { this.state = 'closed'; this.render(); } }, 600); }
                else { this.state = 'closed'; this.render(); }
            }, 150);
        },
        cycle(back) { if (this.el.veil) cycleFocus(this.root, this.el.veil, back); },
        tickCountdown() {
            if (this.host && !this.host.isConnected && (this.up || this.el.pill)) mount(this.host);
            if (this.up && this.state === 'blocked' && this.el.cd) this.el.cd.textContent = clock(lockLeftSec());
        },

        // pass pill
        renderPill() {
            const m = HOST && matchSite(HOST, S.sites), until = m && S.passes.open[m.d];
            const left = until ? (until - Date.now()) / 1000 : 0;
            if (!until || left <= 0 || this.up) { this.el.pill?.remove(); this.el.pill = null; return; }
            this.ensure();
            if (!this.el.pill) {
                this.el.pt = h('b'); this.el.ps = h('small');
                this.el.pill = h('div', { class: 'passpill', role: 'status' }, h('span', { class: 'dot' }), h('div', null, this.el.pt, this.el.ps),
                    h('button', { class: 'btn sm', text: 'End now', onclick: () => { S.passes = get('passes', freshPasses()); delete S.passes.open[m.d]; set('passes', S.passes); this.expired = true; evaluate(); } }));
                this.wrap.append(this.el.pill);
            }
            const warn = left <= WARN_S;
            this.el.pill.classList.toggle('warn', warn);
            this.el.pt.textContent = clock(left) + ' left';
            this.el.ps.textContent = warn ? m.d + ' locks again in ' + Math.ceil(left) + 's' : 'Pass on ' + m.d;
            this.expired = left <= 2.5;
        },
    };
    const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

    function blockReason() {
        if (!S.cfg.enabled || !isArmed() || !HOST) return null;
        const s = matchSite(HOST, S.sites);
        if (!s || !s.on) return null;
        if (S.music && s.cat === 'music') return null;
        const open = S.passes.open[s.d];
        if (open && open > Date.now()) return null;
        if (s.rule === 'always') return { site: s, kind: 'always' };
        if (currentBlock()) return { site: s, kind: 'sched' };
        return null;
    }
    function evaluate() {
        const r = blockReason();
        if (r) {
            const fresh = !blocker.up;
            blocker.show(r, fresh && !blocker.expired);
            blocker.expired = false;
        } else blocker.hide();
        blocker.renderPill();
    }
    // keep the page quiet and inert while blocked
    addEventListener('keydown', e => {
        if (!blocker.up) return;
        const path = e.composedPath();
        if (ui.host && path.includes(ui.host)) return; // the menu handles its own keys
        if (e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); blocker.cycle(e.shiftKey); return; }
        if (!path.some(n => n && n.tagName === 'HOURGLASS-UI')) { e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
    function cycleFocus(root, box, back) {
        const f = [...box.querySelectorAll('button:not([disabled]),input:not([disabled])')].filter(x => x.offsetParent !== null);
        if (!f.length) return;
        const i = f.indexOf(root.activeElement);
        f[(i < 0 ? 0 : (i + (back ? -1 : 1) + f.length) % f.length)].focus();
    }
    function hush() { if (!blocker.up) return; for (const m of document.querySelectorAll('video,audio')) if (!m.paused) { try { m.pause(); } catch {} } }

    /* ───────────────────────── late-night nudge ───────────────────────── */

    const NUDGE_CSS = `
.nudge{--n-text:#1d1d3a;--n-sub:rgba(29,29,58,.64);--n-glass:rgba(255,255,255,.84);--n-edge:rgba(255,255,255,.8);--n-hl:#fff;--n-drop:rgba(0,0,0,.34);--n-ctl:rgba(29,29,58,.06);--n-ctl-hi:rgba(29,29,58,.11);--n-ctl-edge:rgba(29,29,58,.1);--n-primary:#5e5ce6;--n-primary-ink:#fff}
[data-theme=dark] .nudge{--n-text:#f4f4ff;--n-sub:rgba(244,244,255,.74);--n-glass:rgba(22,22,28,.8);--n-edge:rgba(255,255,255,.12);--n-hl:rgba(255,255,255,.1);--n-drop:rgba(0,0,0,.6);--n-ctl:rgba(255,255,255,.1);--n-ctl-hi:rgba(255,255,255,.18);--n-ctl-edge:rgba(255,255,255,.16);--n-primary:#fff;--n-primary-ink:#1d1d3a}
.nudge{position:absolute;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);width:440px;max-width:calc(100vw - 32px);display:flex;gap:14px;padding:16px 16px 14px;border-radius:20px;color:var(--n-text);
  background:radial-gradient(120% 40% at 0% 0%,rgba(147,145,247,.2),transparent 70%),var(--n-glass);backdrop-filter:blur(28px) saturate(170%);-webkit-backdrop-filter:blur(28px) saturate(170%);
  border:1px solid var(--n-edge);box-shadow:inset 0 1px 0 var(--n-hl),0 0 0 .5px rgba(94,92,230,.6),0 24px 60px -20px var(--n-drop),0 0 40px -12px rgba(94,92,230,.9);animation:nin .45s cubic-bezier(.2,.8,.2,1)}
@keyframes nin{from{opacity:0;transform:translate(-50%,14px)}}
.nudge .moon{flex:none;width:42px;height:42px;border-radius:13px;display:grid;place-items:center;color:#fff;background:linear-gradient(140deg,#9391F7,#4B49C8);box-shadow:0 6px 18px -6px rgba(94,92,230,1),inset 0 1px 0 rgba(255,255,255,.3)}
.nudge .nb{flex:1;min-width:0}
.nudge h3{margin:1px 0 3px;font-size:15.5px;font-weight:650;letter-spacing:-.015em}
.nudge p{margin:0;font-size:12.5px;line-height:1.45;color:var(--n-sub)}
.nudge .nbtns{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}
.nudge .btn{height:32px;font-size:12px;border-color:var(--n-ctl-edge);background:var(--n-ctl);color:var(--n-text)}
.nudge .btn:hover{background:var(--n-ctl-hi)}
.nudge .btn.primary{background:var(--n-primary);color:var(--n-primary-ink);border-color:transparent;box-shadow:0 4px 14px -6px rgba(94,92,230,.6)}
.nudge .link{color:var(--n-sub);margin-left:auto}
.nudge .nx{flex:none;width:26px;height:26px;border-radius:50%;border:0;background:var(--n-ctl);color:var(--n-sub);display:grid;place-items:center;padding:0}
.nudge .nx:hover{background:var(--n-ctl-hi);color:var(--n-text)}
.nudge .btn:focus-visible,.nudge .link:focus-visible,.nudge .nx:focus-visible{outline:2px solid #9391F7;outline-offset:2px}
`;
    const nudge = {
        el: null,
        state() {
            const id = nightId();
            let s = get('nudge', null);
            if (!s || s.id !== id) s = { id, next: S.cfg.nudgeAfter * 60, muted: false, count: 0 };
            return s;
        },
        scope() { return S.cfg.nudgeScope === 'all' ? 'all' : 'list'; },
        tonight() { return nightTotal(nightId(), this.scope()); },
        check(now) {
            if (this.el || !S.cfg.enabled || !isArmed() || !S.cfg.nudge || !HOST || !inBedtime() || blocker.up || !document.hasFocus() || !isActive(now)) return;
            if (this.scope() === 'list' && catOf(statKey(HOST)) === 'other') return;
            const s = this.state();
            if (s.muted) return;
            const t = this.tonight();
            if (t < s.next) return;
            s.count++; s.next = t + S.cfg.nudgeAfter * 60; set('nudge', s);
            this.show(t, s.count);
        },
        show(t, count) {
            blocker.ensure();
            if (!blocker.root.getElementById('nudge-css')) blocker.root.append(h('style', { id: 'nudge-css', text: NUDGE_CSS }));
            this.hide();
            const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const where = this.scope() === 'all' ? 'online' : 'on distracting sites';
            const [title, body] = count <= 1
                ? ["It's getting late", `It's ${time} and you've spent ${fmtDur(t)} ${where} tonight. Maybe call it a night?`]
                : count === 2
                    ? ['Still up?', `${fmtDur(t)} ${where} tonight so far. Your schedule is free, but sleep still counts.`]
                    : ['Time to wind down', `It's ${time}. Logging off now is a gift to tomorrow-you.`];
            const later = () => { const s = this.state(); s.next = this.tonight() + 15 * 60; set('nudge', s); this.hide(); };
            const mute = () => { const s = this.state(); s.muted = true; set('nudge', s); this.hide(); };
            this.el = h('div', { class: 'nudge', role: 'status', 'aria-live': 'polite' },
                h('div', { class: 'moon' }, icon(ICONS.moon, 21, 1.9)),
                h('div', { class: 'nb' }, h('h3', { text: title }), h('p', { text: body }),
                    h('div', { class: 'nbtns' },
                        h('button', { class: 'btn primary', text: 'Close this tab', onclick: () => { this.hide(); try { window.close(); } catch {} } }),
                        h('button', { class: 'btn', text: '15 more minutes', onclick: later }),
                        h('button', { class: 'link', text: 'Not tonight', onclick: mute }))),
                h('button', { class: 'nx', 'aria-label': 'Hide for now', title: 'Hide for now. It comes back after another ' + S.cfg.nudgeAfter + ' min of late-night browsing.', onclick: () => this.hide() }, icon(ICONS.close, 11, 2.4)));
            blocker.wrap.append(this.el);
        },
        hide() { this.el?.remove(); this.el = null; },
    };

    /* ───────────────────────── dashboard data ───────────────────────── */

    function lastDays(n, end = new Date()) {
        const out = [];
        for (let i = n - 1; i >= 0; i--) { const dt = addDays(end, -i), k = dayKey(dt); out.push({ k, dt, o: get(DKEY(k), null) }); }
        return out;
    }
    const totalOf = o => o ? sum(Object.values(o.s || {})) : 0;
    const catSums = o => { const a = [0, 0, 0, 0, 0]; if (o) for (const hr of o.h || []) if (hr) hr.forEach((v, i) => { a[i] += v; }); return a; };

    function dashData(range) {
        const now = new Date(), t = dow(now), todayK = dayKey(now);
        // everything stored since Hourglass was installed (up to the history setting); a 0m day is a real day
        const installK = get('days', [])[0] || todayK;
        const since = Math.round((new Date(todayK + 'T12:00:00') - new Date(installK + 'T12:00:00')) / 864e5) + 1;
        const all = lastDays(clamp(since || 1, 1, S.cfg.hist), now);
        const today = all[all.length - 1], o = today.o || newDay();
        const past = all.slice(0, -1);                       // full days only; today has its own card
        const R = range === 'month' ? 28 : 7, full = past.length >= R;
        const win = past.slice(-R), base = past.slice(0, Math.max(0, past.length - R));
        const period = full ? (range === 'month' ? 'the past 4 weeks' : 'the past 7 days') : win.length === 1 ? 'your first day' : 'your first ' + win.length + ' days';
        const inP = win.length === 1 ? 'on your first day' : 'in ' + period;   // "in the past 7 days"
        const mean = a => a.length ? sum(a) / a.length : 0;
        const hourTot = (x, i) => sum(x?.h?.[i] || []);
        const next = x => all[all.indexOf(x) + 1];

        // today against the usual for this weekday (every stored one), up to this time of day
        const H = now.getHours(), frac = now.getMinutes() / 60;
        const soFar = x => { let s = 0; for (let i = 0; i < H; i++) s += hourTot(x, i); return s + hourTot(x, H) * frac; };
        const same = past.filter(x => dow(x.dt) === t), uset = same.length >= 2 ? same : past;
        const usual = uset.length ? { kind: same.length >= 2 ? DAYS[t] : 'day', now: mean(uset.map(x => soFar(x.o))), day: mean(uset.map(x => totalOf(x.o))),
            hours: Array.from({ length: 24 }, (_, i) => mean(uset.map(x => hourTot(x.o, i)))) } : null;
        const todayTot = totalOf(today.o);

        // what changed: each site's daily average in the range against everything before it
        const listed = k => !!(S.sites.find(s => s.d === k) || matchSite(k, S.sites));
        const siteAvg = (list, k) => mean(list.map(x => (x.o?.s || {})[k] || 0));
        const keys = new Set(); for (const x of past) for (const k in x.o?.s || {}) keys.add(k);
        const enough = base.length >= 7, need = Math.max(0, R + 7 - past.length);
        const sites = [...keys].map(k => { const v = siteAvg(win, k), was = siteAvg(base, k); return { k, now: v, was, d: v - was, cat: catOf(k), listed: listed(k) }; });
        // the same by category (the four on your list, then everything else)
        const catAvg = list => { const a = [0, 0, 0, 0, 0]; for (const x of list) catSums(x.o).forEach((v, i) => { a[i] += v / list.length; }); return a; };
        const catNow = catAvg(win), catWas = catAvg(base);
        const moved = enough ? sites.filter(s => Math.abs(s.d) >= 300).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 5) : [];
        // busy sites off your list (the old "Consider adding"), unless they're already in the list above
        const sugs = sites.filter(s => !s.listed && !S.ignored.some(g => g.d === s.k) && s.now >= SUGGEST_MIN && !moved.includes(s)).sort((a, b) => b.now - a.now).slice(0, 3);

        // when you drift: the average for each weekday and hour in the range, and where the day's weight sits
        const order = S.cfg.weekStart === 'sun' ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
        const grid = order.map(d => { const ds = win.filter(x => dow(x.dt) === d); return Array.from({ length: 24 }, (_, i) => mean(ds.map(x => hourTot(x.o, i)))); });
        const hrs = Array.from({ length: 24 }, (_, i) => sum(win.map(x => hourTot(x.o, i)))), hTot = sum(hrs);
        let peak = 0; for (let i = 1; i <= 21; i++) if (hrs[i] + hrs[i + 1] + hrs[i + 2] > hrs[peak] + hrs[peak + 1] + hrs[peak + 2]) peak = i;
        const peakShare = hTot ? (hrs[peak] + hrs[peak + 1] + hrs[peak + 2]) / hTot : 0;
        // after midnight counts as late, not early
        const center = list => { let w = 0, s = 0; for (const x of list) for (let i = 0; i < 24; i++) { const v = hourTot(x.o, i); s += v * (i < 5 ? i + 24.5 : i + .5); w += v; } return w ? s / w : null; };
        const cNow = center(win), cWas = enough ? center(base) : null;
        // a late night: 10 minutes or more online after bedtime (bedtime's hour on, and the next morning until it ends)
        const bS = Math.floor(S.cfg.bedS / 2) % 24, bE = Math.ceil(S.cfg.bedE / 2) % 24;
        const nightSec = x => { let s = 0; if (bS > bE) { for (let i = bS; i < 24; i++) s += hourTot(x.o, i); for (let i = 0; i < bE; i++) s += hourTot(next(x)?.o, i); }
            else for (let i = bS; i < bE; i++) s += hourTot(next(x)?.o, i); return s; };
        const lateNights = win.filter(x => nightSec(x) >= 600).length;

        // lockdown: blocked tries per lockdown day (by today's schedule, or any day with a try) and passes used
        const att = x => sum(Object.values(x.o?.att || {}));
        const lockOn = x => (S.sched[dow(x.dt)].on && S.sched[dow(x.dt)].blocks.length > 0) || att(x) > 0;
        const lw = win.filter(lockOn), lb = base.filter(lockOn);
        const triesNow = lw.length ? sum(lw.map(att)) / lw.length : null, triesWas = lb.length >= 3 ? sum(lb.map(att)) / lb.length : null;
        const tried = {}; for (const x of win) for (const [k, v] of Object.entries(x.o?.att || {})) tried[k] = (tried[k] || 0) + v;
        const mostTried = Object.entries(tried).sort((a, b) => b[1] - a[1])[0];
        const passesUsed = sum(win.map(x => (x.o?.pass || []).length));

        // today's own numbers (the hourly card's stats and the lockdown line in the top card)
        const visits = sum(Object.values(o.v || {})), sitesToday = Object.keys(o.s || {}).length, attToday = sum(Object.values(o.att || {}));
        // how much: the daily average in the range, against everything before it
        const avgNow = mean(win.map(x => totalOf(x.o))), avgWas = enough ? mean(base.map(x => totalOf(x.o))) : null;
        for (const s of sites) s.spark = win.map(x => (x.o?.s || {})[s.k] || 0);
        const topSites = enough ? [] : sites.filter(s => s.now > 0).sort((a, b) => b.now - a.now).slice(0, 5);   // too new to compare: just the busiest
        // the streak calendar: five whole weeks, ending with this one (week start from Settings)
        const byKey = Object.fromEntries(all.map(x => [x.k, x])), ws = addDays(now, -(S.cfg.weekStart === 'sun' ? now.getDay() : t));
        const cal = Array.from({ length: 35 }, (_, i) => { const dt = addDays(ws, i - 28), k = dayKey(dt), x = byKey[k];
            return { dt, k, v: x ? totalOf(x.o) : 0, counted: !!x, today: k === todayK, future: dt > now && k !== todayK }; });
        // goal: days under it in the range; the streak and best run over everything stored (today counts while it's under)
        const goal = S.cfg.goal * 60;
        const under = win.filter(x => totalOf(x.o) <= goal).length;
        let streak = 0; for (let i = all.length - 1; i >= 0; i--) { if (totalOf(all[i].o) > goal) break; streak++; }
        let best = 0, run = 0; for (const x of all) { if (totalOf(x.o) <= goal) { run++; best = Math.max(best, run); } else run = 0; }

        return { now, t, o, R, full, win, base, period, inP, enough, need, usual, todayTot, todayHours: Array.from({ length: 24 }, (_, i) => (o.h || [])[i] || [0, 0, 0, 0, 0]), H, frac, catNow, catWas,
            moved, sugs, order, grid, hTot, peak, peakShare, cNow, cWas, lateNights, att, lockOn, triesNow, triesWas, mostTried, passesUsed,
            goal, under, streak, best, hasHistory: past.length > 0, visits, sitesToday, attToday, avgNow, avgWas, topSites, cal };
    }

    /* ───────────────────────── panel css ───────────────────────── */

    const PANEL_CSS = BASE_CSS + `
.panel{position:fixed;top:16px;right:16px;width:760px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);display:flex;flex-direction:column;overflow:hidden;border-radius:22px;
  background:radial-gradient(120% 40% at 0% 0%,rgba(var(--a-rgb),var(--glow)),transparent 64%),var(--bg);
  backdrop-filter:blur(28px) saturate(170%);-webkit-backdrop-filter:blur(28px) saturate(170%);border:1px solid var(--edge);
  box-shadow:0 0 0 .5px rgba(var(--a-rgb),.4),0 0 40px -12px rgba(var(--a-rgb),calc(var(--glow)*3)),0 28px 64px -18px var(--drop),inset 0 1px 0 var(--hl);
  animation:in .18s cubic-bezier(.2,.8,.2,1)}
@keyframes in{from{opacity:0;transform:translateY(-6px) scale(.98)}}
.scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;padding-bottom:4px}
.head{display:flex;align-items:center;gap:11px;padding:18px 18px 4px}
.logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:var(--on);flex:none;background:linear-gradient(140deg,var(--fill-hi),var(--fill));box-shadow:0 4px 14px -4px rgba(var(--a-rgb),.9),inset 0 1px 0 rgba(255,255,255,.35)}
/* glass tile like the app icon; the color still follows the script's state */
.logo{position:relative;overflow:hidden;color:#fff;
  background:radial-gradient(120% 90% at 50% 62%,rgba(11,11,22,.55),rgba(11,11,22,0) 70%),linear-gradient(145deg,color-mix(in srgb,var(--fill-hi) 72%,#0b0b16),color-mix(in srgb,var(--fill) 46%,#0b0b16));
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.3),inset 0 1px 0 rgba(255,255,255,.5),inset 0 0 6px 1px rgba(var(--a-rgb),.55),inset 0 -8px 12px -8px rgba(0,0,0,.45),0 4px 16px -4px rgba(var(--a-rgb),.95),0 0 12px -3px rgba(var(--a-rgb),.6)}
.logo::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(180deg,rgba(255,255,255,.28),rgba(255,255,255,0) 48%),linear-gradient(135deg,transparent 34%,rgba(255,255,255,.09) 34% 44%,transparent 44%)}
.logo svg{position:relative;filter:drop-shadow(0 0 1.2px rgba(255,255,255,.95)) drop-shadow(0 0 4px rgba(var(--a-rgb),.95))}
.logo svg.gg{width:88%;height:88%;filter:none;overflow:visible}
.title{font-weight:650;font-size:16px;letter-spacing:-.015em}
.sub{font-size:12px;color:var(--sub)}
/* sun/moon switch: light or dark glass (the device's choice until it's flipped) */
/* glassware:frame start: shared controls, stamped by tools/frame.py; edit them there */
.vars .mode{position:relative;flex:none;display:flex;align-items:center;justify-content:space-between;width:50px;height:28px;margin:0 0 0 auto;padding:0 7px;border:0;border-radius:14px;background:var(--ctl);color:var(--sub);cursor:pointer;box-sizing:border-box;min-width:0;min-height:0;max-height:none;line-height:1;text-transform:none;letter-spacing:normal}
.vars .mode svg{position:relative;z-index:1;flex:none;display:block;width:13px;height:13px;transition:color .18s}
.vars .mode .knob{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:var(--knob);box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s cubic-bezier(.3,.7,.3,1)}
.vars[data-theme=dark] .mode .knob{transform:translateX(22px)}
.vars .mode .sun,.vars[data-theme=dark] .mode .moon{color:var(--text)}
.vars[data-theme=dark] .mode .sun{color:var(--sub)}
.vars .x{flex:none;display:grid;place-items:center;width:28px;height:28px;margin:0 0 0 -3px;padding:0;border:0;border-radius:50%;background:var(--ctl);color:var(--sub);cursor:pointer;box-sizing:border-box;min-width:0;min-height:0;max-height:none;line-height:1;text-transform:none;letter-spacing:normal}
.vars .x:hover{background:var(--ctl-hi);color:var(--text)}
.vars .sw{flex:none;position:relative;width:40px;height:24px;margin:0;padding:0;border:0;border-radius:12px;background:var(--sw-off);cursor:pointer;transition:background .18s;box-sizing:border-box;min-width:0;min-height:0;max-height:none;line-height:1;text-transform:none;letter-spacing:normal}
.vars .sw::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s cubic-bezier(.3,.7,.3,1)}
.vars .sw[aria-checked=true]{background:var(--fill);box-shadow:0 0 12px -2px color-mix(in srgb,var(--fill) 70%,transparent)}
.vars .sw[aria-checked=true]::after{transform:translateX(16px)}
.vars .mode:focus-visible,.vars .x:focus-visible,.vars .sw:focus-visible{outline:2px solid var(--fill);outline-offset:2px}
.m .vars .x{flex:none;display:grid;place-items:center;width:36px;height:36px;margin:0 0 0 -3px;padding:0;border:0;border-radius:50%;background:var(--ctl);color:var(--sub);cursor:pointer;box-sizing:border-box;min-width:0;min-height:0;max-height:none;line-height:1;text-transform:none;letter-spacing:normal}
.m .vars .x:hover{background:var(--ctl-hi);color:var(--text)}
.m .vars .sw{flex:none;position:relative;width:46px;height:28px;margin:0;padding:0;border:0;border-radius:14px;background:var(--sw-off);cursor:pointer;transition:background .18s;box-sizing:border-box;min-width:0;min-height:0;max-height:none;line-height:1;text-transform:none;letter-spacing:normal}
.m .vars .sw::after{content:"";position:absolute;top:2px;left:2px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s cubic-bezier(.3,.7,.3,1)}
.m .vars .sw[aria-checked=true]{background:var(--fill);box-shadow:0 0 12px -2px color-mix(in srgb,var(--fill) 70%,transparent)}
.m .vars .sw[aria-checked=true]::after{transform:translateX(18px)}
.m .vars .mode:focus-visible, .m .vars .x:focus-visible, .m .vars .sw:focus-visible{outline:2px solid var(--fill);outline-offset:2px}
/* glassware:frame end */
.siteline{display:flex;align-items:center;gap:8px;padding:6px 18px 12px;font:12px var(--mono);color:var(--sub)}
.siteline b{color:var(--text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tabs{margin:0 14px 12px}
.seg{display:flex;padding:3px;border-radius:12px;background:var(--ctl);gap:2px}
.seg button{flex:1;border:0;background:none;min-height:34px;padding:6px 0;border-radius:9px;font-size:12.5px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:6px;transition:background .15s,color .15s,opacity .15s}
.seg button:hover{background:var(--field-hi)}
.seg button.on{background:var(--fill);color:var(--on);box-shadow:0 1px 4px rgba(0,0,0,.14),0 0 14px -4px rgba(var(--a-rgb),.8)}
.seg button.dim{opacity:.45}
.seg button.dim:hover{opacity:.7}
.seg.sm{border-radius:9px;padding:2px}
.seg.sm button{min-height:26px;font-size:11.5px;padding:4px 9px;border-radius:7px}
.seg button:disabled{opacity:.45}
.card{margin:0 14px 10px;padding:16px 18px;border-radius:16px;background:rgba(var(--a-rgb),.09);border:1px solid rgba(var(--a-rgb),.22)}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));gap:10px;padding:0 14px 10px}
.tile{padding:15px 16px;border-radius:16px;background:var(--field);border:1px solid var(--line);min-width:0}
.tile.full{margin:0 14px 10px}
.label{display:flex;align-items:center;gap:7px;font:600 10.5px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--ink);margin-bottom:12px;min-height:12px}
.label::before{content:"";width:5px;height:5px;transform:rotate(45deg);background:var(--fill);box-shadow:0 0 6px rgba(var(--a-rgb),.9);flex:none}
.label i{font-style:normal;letter-spacing:.02em;text-transform:none;font-family:inherit;color:var(--sub);font-weight:400;margin-left:auto}
.label .seg,.label .pill{margin-left:auto}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:32px}
.row+.row{margin-top:10px}
.t{font-weight:500}
.d{font-size:11.5px;color:var(--sub);margin-top:2px}
.d b{color:var(--text);font-weight:600}
.d b{white-space:nowrap}
.d b.good{color:var(--good)}
.d b.bad{color:var(--danger)}
.big{font-weight:650;font-size:38px;letter-spacing:-.035em;line-height:1.05;margin:2px 0 4px}
.mono{font:12px var(--mono)}
.sw:disabled{opacity:.45}
.ibtn{flex:none;width:30px;height:30px;border:0;border-radius:8px;background:none;color:var(--sub);display:grid;place-items:center}
.ibtn:hover{background:var(--ctl);color:var(--text)}
.ibtn:disabled{opacity:.35}
.foot{border-top:1px solid var(--line);background:var(--bg-solid)}
.status{display:flex;align-items:center;gap:10px;padding:11px 14px 6px 18px}
.dot{flex:none;width:10px;height:10px;border-radius:50%;background:var(--a);box-shadow:0 0 0 3px rgba(var(--a-rgb),.18),0 0 10px rgba(var(--a-rgb),.9)}
.stxt{flex:1;font-size:11.5px;line-height:1.4;color:var(--sub);min-width:0}
.stxt b{color:var(--text);font-weight:600}
.music{width:38px;height:38px;border-radius:12px;border:1px solid var(--line);background:var(--field)}
.music.on{background:#FF9FB2;color:#5a1020;border-color:transparent;box-shadow:0 0 16px -4px #FF6482}
.mlabel{font:600 9.5px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--warn-ink)}
.listen{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--sub);padding:6px 10px;border-radius:10px;background:rgba(255,159,178,.16);white-space:nowrap}
.listen svg{color:var(--music-ink)}
.listen b{font:600 12px var(--mono);color:var(--text)}
.keys{font-size:10.5px;color:var(--sub);padding:0 18px 12px}
.lockbar{position:relative;height:12px;border-radius:6px;background:var(--ctl);margin-top:4px}
.lb-on{position:absolute;top:0;bottom:0;border-radius:6px;background:repeating-linear-gradient(135deg,rgba(var(--a-rgb),.55) 0 5px,rgba(var(--a-rgb),.32) 5px 10px)}
.lb-now{position:absolute;top:-4px;bottom:-4px;width:2px;border-radius:1px;background:var(--text)}
.ticks{display:flex;justify-content:space-between;font:10px var(--mono);color:var(--sub);margin-top:6px}
.qc .label{margin-bottom:10px}
.ans{font-size:15px;font-weight:600;line-height:1.38;letter-spacing:-.012em;margin:0 0 14px;text-wrap:pretty}
.rangebar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:6px 14px 12px;padding:0 4px;font-size:12px;color:var(--sub)}
.rangebar .seg button{white-space:nowrap}
.ch{display:grid;grid-template-columns:44px minmax(0,1fr);column-gap:8px;min-width:0}
.ch .ya{position:relative;font:9.5px var(--mono);color:var(--sub)}
.ch .ya span{position:absolute;right:0;transform:translateY(-50%);white-space:nowrap}
.ch .pl{position:relative;border-bottom:1px solid var(--ctl-hi)}
.ch .xa{grid-column:2;display:grid;font:10px var(--mono);color:var(--sub);margin-top:6px}
.ch .xa span{white-space:nowrap;text-align:center;min-width:0}
.key{display:flex;flex-wrap:wrap;gap:6px 12px;margin:10px 0 0 52px;font-size:11.5px;color:var(--sub)}
.key span{display:inline-flex;align-items:center;gap:6px}
.key i.sw2{display:inline-block;width:9px;height:9px;border-radius:3px}
.key i.k2{display:inline-block;width:12px;height:0;border-top:2px solid var(--sub)}
.key i.k3{width:12px;height:10px;border:1px dashed rgba(var(--a-rgb),.7);border-radius:3px;background:repeating-linear-gradient(135deg,rgba(var(--a-rgb),.35) 0 3px,transparent 3px 6px)}
.gl2{position:absolute;left:0;right:0;border-top:1px solid var(--line)}
.goal{position:absolute;left:0;right:0;border-top:1.5px dashed var(--guide);z-index:1}
.band2{position:absolute;top:0;bottom:0;border-left:1px dashed rgba(var(--a-rgb),.7);border-right:1px dashed rgba(var(--a-rgb),.7);background:repeating-linear-gradient(135deg,rgba(var(--a-rgb),.1) 0 5px,transparent 5px 10px)}
.bars{position:absolute;inset:0;display:grid;align-items:end}
.bar{position:relative;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;min-width:0}
.bar>i{display:block;width:100%;max-width:24px;min-height:2px;border-radius:4px 4px 2px 2px;background:var(--fill)}
.bar.over>i{background:var(--danger)}
.bar.off>i{background:var(--ctl-hi)}
.sb{display:flex;flex-direction:column-reverse;width:100%;max-width:24px;min-height:2px;border-radius:4px 4px 2px 2px;overflow:hidden;gap:1px}
.sb i{display:block;flex-basis:0;min-height:0}
.bar .us{position:absolute;left:12%;right:12%;height:2px;margin-bottom:-1px;border-radius:1px;background:var(--sub);z-index:1}
.hbar{display:flex;height:12px;border-radius:6px;overflow:hidden;gap:2px;background:var(--ctl)}
.hbar i{display:block;flex-basis:0}
.crow{display:grid;grid-template-columns:10px minmax(0,1fr) auto 64px;align-items:center;gap:8px;font-size:12.5px;padding:7px 0;border-top:1px solid var(--line)}
.crow i{width:10px;height:10px;border-radius:3px}
.crow b{font:500 12px var(--mono)}
.sl{font:600 10px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--sub);margin:16px 0 4px}
.lvl{margin:16px 18px 8px;font:600 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--sub)}
.lvl:first-child{margin-top:2px}
.glance{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:22px;align-items:start}
.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;margin-top:14px}
.stats.five{grid-template-columns:repeat(auto-fit,minmax(110px,1fr));padding-top:12px;border-top:1px solid var(--line)}
.stats>div{display:flex;flex-direction:column;gap:3px;min-width:0}
.stats b{font-weight:650;font-size:17px;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stats span{font-size:11px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.spark{stroke:var(--fill);fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.sparkf{fill:rgba(var(--a-rgb),.12);stroke:none}
.spk{justify-self:center}
.sug2{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:6px 0 6px 26px;font-size:12px;color:var(--sub)}
.calw{grid-template-columns:44px minmax(0,1fr)}
.cya{display:grid;grid-template-rows:repeat(5,1fr);row-gap:5px;font:9.5px var(--mono);color:var(--sub);text-align:right;align-items:center;white-space:nowrap}
.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}
.cal i{display:block;height:24px;border-radius:6px;background:var(--ctl)}
.cal i.under{background:var(--fill)}
.cal i.over{background:color-mix(in srgb,var(--danger) 72%,transparent)}
.cal i.future{background:transparent;border:1px dashed var(--faint)}
.cal i.today{box-shadow:0 0 0 2px var(--bg-solid),0 0 0 3.5px var(--fill)}
.key i.cu{background:var(--fill)}.key i.co{background:color-mix(in srgb,var(--danger) 72%,transparent)}
.bar .pdot{width:6px;height:6px;border-radius:50%;background:var(--ink);margin-bottom:4px;flex:none}
.srow2{display:grid;grid-template-columns:30px minmax(0,1fr) 64px 62px;align-items:center;gap:12px;padding:8px 0;border-top:1px solid var(--line)}
.srow2.wa{grid-template-columns:30px minmax(0,1fr) 64px 62px 150px}
.srow2 .acts{display:flex;gap:6px;justify-content:flex-end}
.srow2:not(.wa) .acts{display:none}
.hmw{grid-template-columns:30px minmax(0,1fr)}
.hya{display:grid;grid-template-rows:repeat(7,16px);row-gap:2px;font:9.5px/16px var(--mono);color:var(--sub);text-align:right}
.hm{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));grid-auto-rows:16px;gap:2px}
.hm i{display:block;border-radius:3px}
.hmw .scale{grid-column:2;margin-top:10px}
.lkt{display:flex;justify-content:space-between;gap:10px;margin:14px 0 6px;font-size:11.5px;color:var(--sub)}
.lkt b{color:var(--text);font-weight:600}
.delta{font:600 10.5px var(--mono);text-align:right}
.delta.up{color:var(--danger)}.delta.down{color:var(--good)}.delta.flat{color:var(--sub)}
.fav{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-weight:650;font-size:13px;color:#fff;flex:none}
.nm{display:flex;flex-direction:column;min-width:0}
.nm b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nm small{font-size:11px;color:var(--sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scale{display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--sub);margin-top:10px}
.scale i{width:12px;height:12px;border-radius:3px;display:inline-block}
.disc{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;padding:10px 0 4px;border-top:1px solid var(--line);margin-top:4px;color:var(--sub);font-size:12px;font-weight:500;text-align:left}
.disc svg{transition:transform .2s}
.disc.open svg{transform:rotate(180deg)}
.ign{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:6px 0 6px 26px;font-size:12px;color:var(--sub)}
.empty{padding:14px 16px 16px;border-top:1px solid var(--line);font-size:12px;color:var(--sub)}
.welcome .wbtns{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.welcome .btn.on{border-color:var(--fill);color:var(--ink)}
.banner{margin:0 14px 10px;padding:12px 14px;border-radius:14px;background:rgba(var(--a-rgb),.16);border:1px solid rgba(var(--a-rgb),.4);display:flex;gap:10px;align-items:flex-start}
.banner .bt{flex:1}
.banner .bt>b{display:block;font-weight:600;margin-bottom:2px}
.pend{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.pend span{display:inline-flex;align-items:center;gap:6px;padding:4px 4px 4px 9px;border-radius:8px;background:var(--field);border:1px dashed rgba(var(--a-rgb),.6);font-size:11.5px}
.pend button{border:0;background:var(--ctl);width:20px;height:20px;border-radius:6px;display:grid;place-items:center;padding:0;color:var(--sub)}
.wk{display:flex;flex-direction:column;gap:2px}
.wkr{display:grid;grid-template-columns:38px 1fr 54px;align-items:center;gap:10px;width:100%;min-height:34px;padding:4px 8px;border:0;border-radius:10px;background:none;text-align:left}
.wkr:hover{background:var(--field-hi)}
.wkr.sel{background:rgba(var(--a-rgb),.12)}
.wkr .dn{font:600 11px var(--mono);letter-spacing:.06em;text-transform:uppercase}
.wkr .hrs{font:11px var(--mono);color:var(--sub);text-align:right}
.trk{position:relative;height:14px;border-radius:7px;background:var(--ctl);display:block}
.trk .bk{position:absolute;top:0;bottom:0;border-radius:7px;background:linear-gradient(90deg,var(--fill-hi),var(--fill))}
.trk .gh{position:absolute;top:-3px;bottom:-3px;border-radius:9px;border:1.5px dashed var(--ink);background:var(--field)}
.trk .now{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--text);border-radius:1px}
.trk .q{position:absolute;top:3px;bottom:3px;width:1px;background:var(--faint)}
.wkt{display:grid;grid-template-columns:38px 1fr 54px;gap:10px;padding:2px 8px 0}
.wkt div{display:flex;justify-content:space-between;font:10px var(--mono);color:var(--sub)}
.days{display:flex;gap:6px;flex-wrap:wrap}
.day{position:relative;width:44px;height:44px;border-radius:12px;border:1px solid var(--line);background:var(--field);font-weight:600;font-size:13px}
.day:hover{background:var(--field-hi)}
.day.sel{background:var(--fill);color:var(--on);border-color:transparent;box-shadow:0 4px 14px -6px rgba(var(--a-rgb),1)}
.day.has::after{content:"";position:absolute;left:50%;bottom:5px;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:var(--fill)}
.day.sel.has::after{background:var(--on)}
.blkc{padding:12px 14px 10px;border-radius:12px;background:var(--field);border:1px solid var(--line)}
.blkc+.blkc{margin-top:8px}
.blkc.pending{border:1.5px dashed var(--ink)}
.times{display:flex;align-items:center;gap:10px}
.tchip{font:600 15px var(--mono);letter-spacing:-.01em;padding:7px 10px;border-radius:9px;background:rgba(var(--a-rgb),.12);color:var(--text);min-width:96px;text-align:center}
.arrow{color:var(--sub)}
.dur{margin-left:auto;font:11.5px var(--mono);color:var(--sub)}
.dual{position:relative;height:44px;margin-top:6px}
.dual .rail{position:absolute;left:11px;right:11px;top:19px;height:6px;border-radius:3px;background:var(--ctl)}
.dual .fr{position:absolute;top:17px;height:10px;border-radius:5px;background:linear-gradient(90deg,var(--fill-hi),var(--fill));box-shadow:0 0 12px -2px rgba(var(--a-rgb),.7)}
.rng{position:absolute;left:0;top:0;width:100%;height:44px;margin:0;background:none;-webkit-appearance:none;appearance:none;pointer-events:none;outline:none}
.rng::-webkit-slider-runnable-track{background:none;height:44px;border:0}
.rng::-moz-range-track{background:none;border:0}
.rng::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;pointer-events:auto;width:22px;height:22px;margin-top:11px;border-radius:50%;background:#fff;border:0;box-shadow:0 1px 4px rgba(0,0,0,.3),0 0 0 4px rgba(var(--a-rgb),.2);cursor:grab}
.rng::-moz-range-thumb{pointer-events:auto;width:22px;height:22px;border-radius:50%;background:#fff;border:0;box-shadow:0 1px 4px rgba(0,0,0,.3),0 0 0 4px rgba(var(--a-rgb),.2);cursor:grab}
.rng:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 3px var(--fill)}
.ht{display:flex;justify-content:space-between;padding:0 4px;font:10px var(--mono);color:var(--sub)}
/* presets and data buttons sit in equal columns, never a ragged wrap */
.chips{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.chip{display:inline-flex;align-items:center;justify-content:center;flex-wrap:wrap;column-gap:4px;min-height:32px;height:auto;padding:4px 10px;border-radius:16px;text-align:center;border:1px solid var(--line);background:var(--field);font-size:12px;font-weight:500}
.chip:hover{background:var(--field-hi);border-color:rgba(var(--a-rgb),.5)}
.chip small{color:var(--sub);font:10.5px var(--mono)}
.slr{display:grid;grid-template-columns:minmax(0,1fr) minmax(120px,210px) 66px;align-items:center;gap:14px;min-height:44px}
.slr+.slr{margin-top:6px}
.r1{-webkit-appearance:none;appearance:none;width:100%;height:28px;background:none;margin:0;outline:none}
.r1::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(90deg,var(--fill) var(--p),var(--track) var(--p))}
.r1::-moz-range-track{height:6px;border-radius:3px;background:var(--ctl-hi)}
.r1::-moz-range-progress{height:6px;border-radius:3px;background:var(--fill)}
.r1::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;margin-top:-7px;border-radius:50%;background:#fff;border:0;box-shadow:0 1px 4px rgba(0,0,0,.3),0 0 0 3px rgba(var(--a-rgb),.2);cursor:grab}
.r1::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#fff;border:0;box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:grab}
.r1:disabled{opacity:.45}
.r1:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 3px var(--fill)}
.val{font:600 12px var(--mono);text-align:center;padding:6px 0;border-radius:8px;background:rgba(var(--a-rgb),.12)}
.addr{display:flex;gap:8px;align-items:center}
.field{flex:1;display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;border-radius:10px;border:1px solid var(--line);background:var(--field-hi);transition:border-color .15s,box-shadow .15s}
.field:focus-within{border-color:var(--fill);box-shadow:0 0 0 3px rgba(var(--a-rgb),.18)}
.field.bad{border-color:#ff3b30;box-shadow:0 0 0 3px rgba(255,59,48,.15)}
.field input{border:0;outline:0;background:none;flex:1;font:13px var(--mono);color:var(--text);min-width:0}
.field svg{color:var(--sub);flex:none}
.grp{border-radius:16px;background:var(--field);border:1px solid var(--line);margin:0 14px 10px;overflow:hidden}
.gh2{display:flex;align-items:center;gap:10px;padding:10px 14px 10px 10px}
.gbtn{display:flex;align-items:center;gap:10px;flex:1;border:0;background:none;padding:4px;border-radius:8px;text-align:left;min-height:36px;min-width:0}
.gbtn svg{transition:transform .2s;color:var(--sub);flex:none}
.gbtn.closed svg{transform:rotate(-90deg)}
.gdot{width:12px;height:12px;border-radius:4px;flex:none}
.gname{font-weight:600;font-size:13.5px}
.gmeta{font:11px var(--mono);color:var(--sub);margin-left:auto;white-space:nowrap}
/* the narrowest phones: the group's count and time go under its name */
@media (max-width:380px){.gbtn{flex-wrap:wrap;row-gap:2px}.gmeta{flex-basis:100%;margin-left:40px}}
.site{display:grid;grid-template-columns:30px minmax(0,1fr) auto 40px 30px;align-items:center;gap:12px;padding:9px 14px;border-top:1px solid var(--line)}
.site.off .nm,.site.off .fav{opacity:.45}
.site.pend{background:rgba(var(--a-rgb),.07)}
.note{display:flex;gap:8px;align-items:center;padding:10px 14px;border-top:1px solid var(--line);font-size:11.5px;color:var(--warn-ink);background:rgba(255,159,178,.12)}
.gate{position:absolute;inset:0;z-index:6;display:flex;justify-content:center;align-items:flex-start;padding:120px 16px 16px;border-radius:22px;
  background:var(--veil-soft);backdrop-filter:blur(9px) saturate(120%);-webkit-backdrop-filter:blur(9px) saturate(120%);animation:gin .3s ease-out}
@keyframes gin{from{opacity:0}}
.gcard{width:420px;max-width:100%;padding:28px 28px 22px;border-radius:22px;text-align:center;background:var(--card);border:1px solid var(--edge);
  box-shadow:0 0 0 .5px rgba(var(--a-rgb),.5),0 30px 70px -20px rgba(0,0,0,.4),0 0 50px -16px rgba(var(--a-rgb),.9)}
.glogo{width:56px;height:56px;margin:0 auto 14px;border-radius:17px;display:grid;place-items:center;color:var(--on);background:linear-gradient(140deg,var(--fill-hi),var(--fill));box-shadow:0 8px 22px -6px rgba(var(--a-rgb),1)}
.glogo svg{animation:flip 5s ease-in-out infinite}
.glogo{position:relative;overflow:hidden;color:#fff;background:radial-gradient(120% 90% at 50% 62%,rgba(11,11,22,.55),rgba(11,11,22,0) 70%),linear-gradient(145deg,color-mix(in srgb,var(--fill-hi) 72%,#0b0b16),color-mix(in srgb,var(--fill) 46%,#0b0b16));box-shadow:inset 0 0 0 1px rgba(255,255,255,.3),inset 0 1px 0 rgba(255,255,255,.5),inset 0 0 6px 1px rgba(var(--a-rgb),.55),0 4px 16px -4px rgba(var(--a-rgb),.95)}.glogo::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.28),rgba(255,255,255,0) 48%),linear-gradient(135deg,transparent 34%,rgba(255,255,255,.09) 34% 44%,transparent 44%)}.glogo svg.gg{position:relative;width:88%;height:88%;overflow:visible}
@keyframes flip{0%,80%{transform:rotate(0)}100%{transform:rotate(180deg)}}
.gcard h2{margin:0 0 6px;font-size:21px;letter-spacing:-.02em;font-weight:650}
.gcard p{margin:0 auto;max-width:330px;font-size:12.5px;line-height:1.5;color:var(--sub)}
.gbar{height:6px;border-radius:3px;background:var(--ctl);overflow:hidden;margin:20px 0 6px}
.gbar i{display:block;height:100%;width:0;border-radius:3px;background:linear-gradient(90deg,var(--fill-hi),var(--fill));animation:gfill linear forwards}
@keyframes gfill{to{width:100%}}
.gwait{font:11px var(--mono);color:var(--sub);height:16px}
.gbtns{display:flex;gap:8px;justify-content:center;margin-top:14px}
.gbtns .btn{height:40px;min-width:130px;font-size:13px}
.frame{pointer-events:none}.frame>*{pointer-events:auto}
.scrim{position:absolute;inset:0;background:rgba(12,12,24,.3);animation:gin .2s ease-out}
.panel.m{position:absolute;top:auto;left:0;right:0;bottom:0;width:100%;max-width:none;max-height:calc(100% - 28px);border-radius:24px 24px 0 0;
  border-bottom:0;padding-bottom:env(safe-area-inset-bottom);animation:sheet .3s cubic-bezier(.2,.8,.2,1)}
@keyframes sheet{from{opacity:0;transform:translateY(48px)}}
.grab{width:42px;height:5px;border-radius:3px;background:var(--sw-off);margin:9px auto 0;flex:none}
.m .head{padding-top:8px}
.m .tabs .seg button{min-height:40px;font-size:13px}
.m .seg.sm button{min-height:34px}
.m .r1{height:40px}
.m .r1::-webkit-slider-thumb{width:26px;height:26px;margin-top:-10px}
.m .rng::-webkit-slider-thumb{width:28px;height:28px;margin-top:8px}
.m .rng::-moz-range-thumb{width:28px;height:28px}
.m .dual .rail{left:14px;right:14px}
.m .ibtn{width:36px;height:36px}
.m .btn.sm{height:34px}
.m .keys{display:none}
.m .row{flex-wrap:wrap}.m .seg.sm button{white-space:nowrap}.m .row>.seg[style*="width"]{width:auto!important}
.m .foot{padding-bottom:4px}
.m .site{grid-template-columns:30px minmax(0,1fr) 46px 36px}.m .site>.seg{grid-column:2/-1;grid-row:2;justify-self:start}
.m .slr{grid-template-columns:minmax(0,1fr) 66px}.m .slr>div:first-child{grid-column:1/-1}
.m .dbtns{grid-template-columns:repeat(2,minmax(0,1fr))}.m .dbtns .btn{justify-self:stretch}.m .chips{grid-template-columns:repeat(2,minmax(0,1fr))}
.m .srow2,.m .srow2.wa{grid-template-columns:30px minmax(0,1fr) 62px}.m .srow2 .spk{display:none}.m .srow2 .acts{grid-column:2/-1;justify-content:flex-start}.m .srow2 .acts:empty{display:none}
/* the accent, never a neutral: browsers that darken pages themselves leave outlines alone */
.bar.tapped>i,.bar.tapped>.sb,.hm i.tapped,.cal i.tapped{outline:2px solid var(--fill);outline-offset:2px;box-shadow:0 0 12px -2px rgba(var(--a-rgb),.9)}
.m .bar,.m .hm i{cursor:pointer}
.readout{margin-top:10px;font:500 11.5px var(--mono);color:var(--sub);min-height:16px}
.readout.on{color:var(--text)}
@media (max-width:620px){
  .dbtns{grid-template-columns:repeat(2,minmax(0,1fr))}.dbtns .btn{justify-self:stretch}.chips{grid-template-columns:repeat(2,minmax(0,1fr))}
  .srow2,.srow2.wa{grid-template-columns:30px minmax(0,1fr) 62px}.srow2 .spk{display:none}.srow2 .acts{grid-column:2/-1;justify-content:flex-start}.srow2 .acts:empty{display:none}
  .site{grid-template-columns:30px minmax(0,1fr) 40px 30px}.site>.seg{grid-column:2/-1;grid-row:2;justify-self:start}
  .slr{grid-template-columns:minmax(0,1fr) 66px}.slr>div:first-child{grid-column:1/-1}
  .listen{display:none}
}
`;

    /* ───────────────────────── panel ───────────────────────── */

    const ui = {
        host: null, root: null, panel: null, scroll: null, tab: 'dash', unlocked: false, range: 'week', day: dow(), ignOpen: false, closed: {},
        addText: '', addCat: 'custom', addBad: false, dragging: false, timer: null, gateTimer: null, resetArm: 0,

        toggle() { this.host ? this.close() : this.open(); },
        open() {
            if (this.host) return;
            load(); flush(); applyPendingIfFree();
            this.tab = 'dash'; this.unlocked = false; this.day = dow(); this.resetArm = 0;
            const host = this.host = hostEl('hourglass-panel');
            const root = this.root = host.attachShadow({ mode: 'closed' });
            root.append(h('style', { text: PANEL_CSS }));
            this.panel = h('div', { class: 'panel vars' + (MOBILE ? ' m' : ''), role: 'dialog', 'aria-label': 'Hourglass' });
            if (MOBILE) {
                const f = frame();
                f.append(h('div', { class: 'scrim', onclick: () => this.close() }), this.panel);
                root.append(f);
                this.prevOverflow = document.documentElement.style.overflow;
                document.documentElement.style.overflow = 'hidden';
            } else root.append(this.panel);
            mount(host);
            this.onKey = e => {
                if (!e.composedPath().includes(host)) return;
                if (e.key === 'Escape') { if (this.gateOpen) this.closeGate(); else this.close(); }
                else if (e.key === 'Tab' && this.gateOpen) { e.preventDefault(); const g = this.root.querySelector('.gcard'); if (g) cycleFocus(this.root, g, e.shiftKey); }
            };
            addEventListener('keydown', this.onKey, true);
            this.render();
            this.timer = setInterval(() => { if (!this.dragging && this.tab === 'dash' && !this.gateOpen) flushSoon(() => { if (this.host && this.tab === 'dash' && !this.dragging && !this.gateOpen) this.render(); }); else this.renderFoot(); }, 10000);
        },
        close() {
            if (!this.host) return;
            clearInterval(this.timer); clearInterval(this.gateTimer);
            removeEventListener('keydown', this.onKey, true);
            this.host.remove(); this.host = this.root = this.panel = this.scroll = null; this.gateOpen = false;
            if (MOBILE && !blocker.up) document.documentElement.style.overflow = this.prevOverflow || '';
        },
        locked() { return inLockdown() && !this.unlocked; },

        theme() {
            const T = themed(!S.cfg.enabled ? 'off' : inLockdown() ? 'lock' : 'free');
            const st = this.panel.style;
            markTheme(this.panel);
            for (const [k, v] of Object.entries({ '--a': T.a, '--a-rgb': T.rgb, '--fill': T.fill, '--fill-hi': T.hi, '--ink': T.ink, '--on': T.on, '--bg': T.bg, '--bg-solid': T.solid, '--glow': S.cfg.enabled ? '.2' : '0' })) st.setProperty(k, v);
        },

        render() {
            if (!this.panel) return;
            const keep = this.scroll ? this.scroll.scrollTop : 0;
            this.theme();
            const lock = inLockdown(), m = HOST && matchSite(HOST, S.sites);
            const tabs = [['dash', 'Dashboard'], ['sched', 'Schedule'], ['sites', 'Sites'], ['set', 'Settings']];
            const locked = this.locked();
            if (locked && this.tab !== 'dash') this.tab = 'dash';
            const head = h('div', { class: 'head' },
                h('div', { class: 'logo' }, glassGlyph('hourglass')),
                h('div', null, h('div', { class: 'title', text: 'Hourglass' }), h('div', { class: 'sub', text: 'Screen time and lockdown for every site' })),
                h('button', { class: 'mode', role: 'switch', 'aria-checked': String(isDark()), 'aria-label': 'Dark mode', title: 'Light or dark',
                    onclick: () => { set('appearance', isDark() ? 'light' : 'dark'); blocker.retheme(); this.render(); } },
                    h('span', { class: 'knob' }), h('span', { class: 'mi2 sun' }, icon(ICONS.sun, 13)), h('span', { class: 'mi2 moon' }, icon(ICONS.moon, 13))),
                h('button', { class: 'x', 'aria-label': 'Close', onclick: () => this.close() }, gwCloseIcon()));
            const siteline = h('div', { class: 'siteline' },
                h('b', { text: HOST || location.href }),
                h('span', { class: 'pill', text: m ? CAT[m.cat].n + ' · ' + (m.on ? (m.rule === 'always' ? 'Always' : 'Schedule') : 'Counted only') : 'Not on your list' }),
                h('span', { style: 'margin-left:auto' }),
                h('span', { class: 'pill ' + (lock ? 'warn' : 'acc'), text: !S.cfg.enabled ? 'Paused' : !S.cfg.armed ? 'Setup' : lock ? 'Lockdown' : 'Free time' }));
            const tabBar = h('div', { class: 'tabs' }, h('div', { class: 'seg', role: 'tablist' }, tabs.map(([k, label]) => {
                const dim = locked && k !== 'dash';
                return h('button', { role: 'tab', 'aria-selected': String(this.tab === k), class: (this.tab === k ? 'on' : '') + (dim ? ' dim' : ''), onclick: () => this.go(k) },
                    dim ? icon(ICONS.lock, 12, 2.2) : null, label);
            })));
            this.scroll = h('div', { class: 'scroll' });
            if (S.cfg.enabled && (!S.cfg.armed || (S.cfg.armAt && !isArmed()))) this.scroll.append(this.welcome());
            if (lock && this.unlocked && this.tab !== 'dash') this.scroll.append(this.banner());
            const body = this.tab === 'sched' ? this.vSchedule() : this.tab === 'sites' ? this.vSites() : this.tab === 'set' ? this.vSettings() : this.vDash();
            this.scroll.append(...[].concat(body));
            this.footEl = h('div', { class: 'foot' });
            const kids = [MOBILE ? h('div', { class: 'grab', 'aria-hidden': 'true' }) : null, head, siteline, tabBar, this.scroll, this.footEl].filter(Boolean);
            if (this.gateOpen) kids.push(this.gateEl());
            this.panel.replaceChildren(...kids);
            this.renderFoot();
            this.scroll.scrollTop = keep;
        },
        renderFoot() {
            if (!this.footEl) return;
            const lock = inLockdown();
            const pendingStart = S.cfg.armed && !isArmed();
            const head = !S.cfg.enabled ? 'Paused' : !S.cfg.armed ? 'Setup' : pendingStart ? 'Starting soon' : lock ? 'Lockdown' : 'Free time';
            const tail = !S.cfg.enabled ? 'nothing is tracked or blocked' : !S.cfg.armed ? 'counting screen time, nothing is blocked yet'
                : pendingStart ? 'lockdown starts after ' + new Date(S.cfg.armAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : lock ? fmtDur(lockLeftSec()) + ' left, until ' + shortU(currentBlock().e) : nextLockdownText();
            this.footEl.replaceChildren(
                h('div', { class: 'status', role: 'status' }, h('div', { class: 'dot' }), h('div', { class: 'stxt' }, h('b', { text: head }), ' · ' + tail),
                    S.cfg.listen && !MOBILE ? h('span', { class: 'listen', title: 'Listening time today: sound playing in any tab, even while you are tabbed out' }, icon(ICONS.headphones, 13), h('b', { text: fmtDur(listenToday()) }), ' today') : null,
                    S.music ? h('span', { class: 'mlabel', text: 'Music mode' }) : null,
                    h('button', { class: 'ibtn music' + (S.music ? ' on' : ''), 'aria-pressed': String(S.music), 'aria-label': 'Music mode', title: 'Music mode: let your Music sites play during lockdown',
                        onclick: () => { S.music = !S.music; set('music', S.music); evaluate(); this.render(); } }, icon(ICONS.music, 17))),
                h('div', { class: 'keys', text: 'Open from the Tampermonkey menu · v' + VERSION + ' · every tab updates live' }));
        },
        go(k) {
            if (this.locked() && k !== 'dash') { this.openGate(k); return; }
            this.tab = k; this.render(); this.scroll.scrollTop = 0;
        },

        /* gate */
        openGate(target) {
            this.gateOpen = true; this.gateTarget = target; this.gateLeft = S.cfg.gateDelay;
            clearInterval(this.gateTimer);
            this.render();
            this.gateTimer = setInterval(() => {
                this.gateLeft = Math.max(0, this.gateLeft - 1);
                if (this.el_gw) this.el_gw.textContent = this.gateLeft ? 'Take a second · ' + this.gateLeft : 'Still want to?';
                if (!this.gateLeft) { clearInterval(this.gateTimer); this.el_gc.disabled = false; this.el_gc.classList.add('ready'); }
            }, 1000);
        },
        closeGate() { clearInterval(this.gateTimer); this.gateOpen = false; this.render(); },
        gateEl() {
            const end = shortU(currentBlock()?.e ?? 0);
            this.el_gw = h('div', { class: 'gwait', text: this.gateLeft ? 'Take a second · ' + this.gateLeft : 'Still want to?' });
            this.el_gc = h('button', { class: 'btn primary fade' + (this.gateLeft ? '' : ' ready'), disabled: !!this.gateLeft, text: 'Continue',
                onclick: () => { clearInterval(this.gateTimer); this.gateOpen = false; this.unlocked = true; this.tab = this.gateTarget; this.render(); this.scroll.scrollTop = 0; } });
            const bar = h('i'); bar.style.animationDuration = S.cfg.gateDelay + 's';
            const g = h('div', { class: 'gate' }, h('div', { class: 'gcard', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Is this important?' },
                h('div', { class: 'glogo' }, glassGlyph('hourglass')),
                h('h2', { text: 'Is this important?' }),
                h('p', { text: "You're in lockdown until " + end + '. You can make your rules stricter now. Anything that loosens them waits until lockdown ends.' }),
                h('div', { class: 'gbar' }, bar), this.el_gw,
                h('div', { class: 'gbtns' }, h('button', { class: 'btn', text: 'Never mind', onclick: () => this.closeGate() }), this.el_gc)));
            setTimeout(() => g.querySelector('.btn')?.focus({ preventScroll: true }), 0);
            return g;
        },
        arm(at) {
            S.cfg.armed = true; S.cfg.armAt = at || 0; this.startAsk = false;
            saveCfg(); evaluate(); this.render();
        },
        welcome() {
            const b = currentBlock();
            const card = h('div', { class: 'card welcome' });
            if (S.cfg.armed && S.cfg.armAt) {
                const t = new Date(S.cfg.armAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                card.append(h('div', { class: 'row' }, h('div', null, h('div', { class: 't', text: 'Lockdown starts after ' + t }), h('div', { class: 'd', text: 'Today\'s current block is skipped. Your schedule is in charge after that.' })),
                    h('button', { class: 'btn', text: 'Start now instead', onclick: () => this.arm(0) })));
                return card;
            }
            card.append(h('div', { class: 'label' }, 'Welcome to Hourglass', h('i', { text: 'Setup' })),
                h('div', { class: 'd', style: 'margin:-4px 0 12px;font-size:12.5px;line-height:1.5', text: "Hourglass is counting your screen time, but nothing is blocked yet. Check your sites and schedule, then start lockdown when you're ready. Settings only lock once lockdown is running." }));
            if (this.startAsk && b) {
                const end = shortU(b.e);
                card.append(h('div', { class: 'd', style: 'margin-bottom:10px', text: "You're inside your scheduled hours right now (until " + end + '). Start now and your sites lock immediately, with settings locked until ' + end + '.' }),
                    h('div', { class: 'wbtns' },
                        h('button', { class: 'btn primary', text: 'Start at ' + end, onclick: () => { const d = new Date(), u = unitsNow(d); this.arm(Date.now() + Math.max(0, (b.e - u) * 1800000)); } }),
                        h('button', { class: 'btn', text: 'Start now', onclick: () => this.arm(0) }),
                        h('button', { class: 'link', text: 'Not yet', onclick: () => { this.startAsk = false; this.render(); } })));
            } else {
                card.append(h('div', { class: 'wbtns' },
                    h('button', { class: 'btn' + (this.tab === 'sites' ? ' on' : ''), text: 'Review sites', onclick: () => this.go('sites') }),
                    h('button', { class: 'btn' + (this.tab === 'sched' ? ' on' : ''), text: 'Review schedule', onclick: () => this.go('sched') }),
                    h('button', { class: 'btn primary', style: 'margin-left:auto', onclick: () => { if (currentBlock()) { this.startAsk = true; this.render(); } else this.arm(0); } }, icon(ICONS.lock, 13, 2.2), 'Start lockdown')));
            }
            return card;
        },
        banner() {
            const end = shortU(currentBlock()?.e ?? 0);
            const items = [];
            for (const [i, d] of Object.entries(S.schedPend)) items.push({ text: DAYS[i].slice(0, 3) + ': ' + (d.on && d.blocks.length ? 'shorter lockdown' : 'lockdown off'), cancel: () => { delete S.schedPend[i]; set('schedPending', S.schedPend); this.render(); } });
            for (const [d, p] of Object.entries(S.sitesPend)) items.push({ text: d + ': ' + (p.on === false ? 'off' : 'Schedule'), cancel: () => { delete S.sitesPend[d]; set('sitesPending', S.sitesPend); this.render(); } });
            return h('div', { class: 'banner' }, h('span', { style: 'color:var(--ink);flex:none;margin-top:1px' }, icon(ICONS.lock, 18)),
                h('div', { class: 'bt' }, h('b', { text: 'Lockdown is on until ' + end }),
                    h('div', { class: 'd', text: "Stricter changes apply right away. Anything that loosens your rules waits until lockdown ends. Passes and the master switch can't change until then." }),
                    items.length ? h('div', { class: 'pend' }, items.map(it => h('span', null, it.text + ' · ', h('b', { style: 'font-weight:600', text: 'at ' + end }),
                        h('button', { 'aria-label': 'Cancel this change', onclick: it.cancel }, icon(ICONS.close, 10, 3))))) : null));
        },

        tapTips(tile, hint) {
            const read = h('div', { class: 'readout', text: hint || 'Tap a day for details' });
            tile.append(read);
            tile.addEventListener('click', e => {
                const t = e.target.closest('[data-tip]');
                if (!t || !tile.contains(t)) return;
                tile.querySelectorAll('.tapped').forEach(x => x.classList.remove('tapped'));
                t.classList.add('tapped'); read.textContent = t.dataset.tip; read.classList.add('on');
            });
        },

        /* ── small builders */
        label(text, right) { return h('div', { class: 'label' }, text, right == null ? null : typeof right === 'string' ? h('i', { text: right }) : right); },
        seg(opts, cur, pick, sm, extra) {
            return h('div', Object.assign({ class: 'seg' + (sm ? ' sm' : ''), role: 'group' }, extra || {}), opts.map(([v, n]) => h('button', { class: cur === v ? 'on' : '', 'aria-pressed': String(cur === v), text: n, onclick: () => pick(v) })));
        },
        slider({ min, max, step = 1, value, disabled, label, fmt, commit }) {
            const val = h('div', { class: 'val', text: fmt(value) });
            const inp = h('input', { class: 'r1', type: 'range', min, max, step, value, disabled: !!disabled, 'aria-label': label });
            const paint = v => { inp.style.setProperty('--p', ((v - min) / (max - min) * 100) + '%'); val.textContent = fmt(v); };
            paint(value);
            inp.addEventListener('input', () => { this.dragging = true; paint(+inp.value); });
            inp.addEventListener('change', () => { this.dragging = false; commit(+inp.value); });
            return [inp, val];
        },
        slr(title, desc, s) { return h('div', { class: 'slr' }, h('div', null, h('div', { class: 't', text: title }), h('div', { class: 'd', text: desc })), ...s); },
        lockPill() { return inLockdown() ? h('span', { class: 'pill warn' }, icon(ICONS.lock, 10, 2.6), 'Locked until ' + shortU(currentBlock().e)) : null; },

        /* ── dashboard */
        vDash() {
            const D = dashData(this.range), T = !S.cfg.enabled ? THEMES.off : inLockdown() ? THEMES.lock : THEMES.free;
            const out = [], nowTxt = D.now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            // every card asks one question and answers it in plain short sentences first (CLAUDE.md: Dashboards)
            const card = (q, ans, ranged, ...kids) => h('div', { class: 'tile full qc', 'data-q': q, 'data-range': ranged ? '' : null }, this.label(q), h('div', { class: 'ans', text: ans }), ...kids);
            const level = text => h('div', { class: 'lvl', text });
            const dayTip = x => x.dt.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
            const catName = i => (CAT[HCOL[i]] || OTHER).n;
            const stack = (cats, tot) => h('div', { class: 'sb', style: `height:${tot}%` }, cats.map((v, k) => v > 0 ? h('i', { style: `flex-grow:${v};background:${colorOf(HCOL[k])}` }) : null));
            const xDays = days => h('div', { class: 'xa', 'data-axis': 'x', style: `grid-template-columns:repeat(${days.length},minmax(0,1fr))` },
                days.length <= 7 ? days.map(x => h('span', { text: x.dt.toLocaleDateString(undefined, { weekday: 'narrow' }) }))
                    : days.map((x, i) => i % 7 ? null : h('span', { style: 'grid-column:span 7;text-align:left', text: x.dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) })));
            const xHours = () => h('div', { class: 'xa', 'data-axis': 'x', style: 'grid-template-columns:repeat(4,minmax(0,1fr))' }, ['12 AM', '6 AM', '12 PM', '6 PM'].map(x => h('span', { style: 'text-align:left', text: x })));
            // a bar per column: heights against max, gridlines, a dashed line (an average or the goal) if given, labelled axes
            const barChart = ({ name, aria, n, bars, max, ticks, line, x, height = 110, under }) => h('div', { class: 'ch', 'data-chart': name, role: 'img', 'aria-label': aria },
                h('div', { class: 'ya', 'data-axis': 'y' }, ticks.map(t => h('span', { style: `top:${100 - t.v / max * 100}%`, text: t.text })), line ? h('span', { style: `top:${100 - line.v / max * 100}%`, text: line.text }) : null),
                h('div', { class: 'pl', style: `height:${height}px` }, ...(under || []),
                    ...ticks.map(t => h('div', { class: 'gl2', style: `top:${100 - t.v / max * 100}%` })),
                    line ? h('div', { class: 'goal', style: `top:${100 - line.v / max * 100}%` }) : null,
                    h('div', { class: 'bars', style: `grid-template-columns:repeat(${n},minmax(0,1fr));gap:${n > 12 ? 2 : 8}px` }, bars)),
                x);
            const legend = (...extra) => h('div', { class: 'key' }, HCOL.map(k => h('span', null, h('i', { class: 'sw2', style: 'background:' + colorOf(k) }), (CAT[k] || OTHER).n)), ...extra);
            const sign = d => (d > 0 ? '+' : d < 0 ? '−' : '') + fmtDur(Math.abs(d));
            const sched = S.sched[D.t], passLeft = Math.max(0, S.cfg.passes - S.passes.used.length), twText = blocksText(D.t);
            const clockOf = m => (Math.floor(m / 60) % 12 || 12) + ':' + pad(m % 60) + (m < 720 ? ' AM' : ' PM');

            /* ── at a glance ── */
            out.push(level('At a glance'));
            const U = D.usual, kind = U ? U.kind : '';
            let todayAns;
            if (!U) todayAns = "Today's your first day with Hourglass. Your usual shows up tomorrow.";
            else if (U.now < 300) todayAns = `You usually have under 5m by ${nowTxt} on a ${kind}. Today you're at ${fmtDur(D.todayTot)}.`;
            else {
                const d = D.todayTot - U.now;
                todayAns = Math.abs(d) < Math.max(300, U.now * .1) ? `You're right around your usual ${kind} for ${nowTxt}.`
                    : `You're ${fmtDur(Math.abs(d))} ${d > 0 ? 'above' : 'below'} your usual ${kind} for ${nowTxt}.`;
            }
            out.push(card("How's today going?", todayAns, false,
                h('div', { class: 'glance' },
                    h('div', null, h('div', { class: 'big', text: fmtDur(D.todayTot) }), h('div', { class: 'd', text: 'online so far today' }),
                        U ? h('div', { class: 'd', style: 'margin-top:10px' }, 'By now you usually have ', h('b', { text: fmtDur(U.now) }), '.', kind !== 'day' ? [' A whole ' + kind + ' is usually ', h('b', { text: fmtDur(U.day) }), '.'] : null) : null),
                    h('div', null, h('div', { class: 'lkt', style: 'margin-top:4px' }, h('span', { text: 'Lockdown today' }), h('b', { text: twText || 'Off today' })),
                        h('div', { class: 'lockbar' }, ...(sched.on ? sched.blocks.map(b => h('div', { class: 'lb-on', style: `left:${b.s / 48 * 100}%;width:${(b.e - b.s) / 48 * 100}%` })) : []),
                            h('div', { class: 'lb-now', style: `left:${unitsNow() / 48 * 100}%` })),
                        h('div', { class: 'ticks' }, ['12a', '6a', '12p', '6p', '12a'].map(t => h('span', { text: t }))),
                        h('div', { class: 'stats' },
                            h('div', null, h('b', { text: D.attToday + (D.attToday === 1 ? ' try' : ' tries') }), h('span', { text: 'blocked today' })),
                            h('div', null, h('b', { text: passLeft + ' of ' + S.cfg.passes }), h('span', { text: 'passes left' })))))));

            /* ── where and when ── */
            out.push(level('Where and when'));
            const cToday = catSums(D.o), topCat = cToday.reduce((bi, v, i, a) => v > a[bi] ? i : bi, 0);
            const busiest = D.todayHours.map(sum).reduce((bi, v, i, a) => v > a[bi] ? i : bi, 0);
            const whereAns = !D.todayTot ? 'Nothing yet today. Your hours fill in as you browse.'
                : `Your busiest hour today was ${hourName(busiest)}. ${catName(topCat)} took the most time.`;
            const hmax = Math.ceil(Math.max(1800, ...D.todayHours.map(sum), ...(U ? U.hours : [])) / 1800) * 1800;
            const hTicks = Array.from({ length: hmax / 1800 }, (_, i) => ({ v: (i + 1) * 1800, text: fmtDur((i + 1) * 1800) })).filter((t, i, a) => a.length <= 3 || (i + 1) % 2 === 0);
            const L = D.o.long, stat = (big, small) => h('div', null, h('b', { text: big }), h('span', { text: small }));
            const whereCard = card('Where did today go?', whereAns, false,
                barChart({ name: 'today', aria: 'Time online each hour today by category, with your usual ' + kind, n: 24, max: hmax, ticks: hTicks, height: 140, x: xHours(),
                    under: sched.on ? sched.blocks.map(b => h('div', { class: 'band2', style: `left:${b.s / 48 * 100}%;width:${(b.e - b.s) / 48 * 100}%` })) : [],
                    bars: D.todayHours.map((hr, i) => {
                        const tot = sum(hr), tip = hourName(i) + ' · ' + fmtDur(tot) + (U ? ' · usually ' + fmtDur(U.hours[i]) : '');
                        return h('div', { class: 'bar', title: tip, 'data-tip': tip }, tot ? stack(hr, tot / hmax * 100) : null,
                            U && U.hours[i] >= 60 ? h('b', { class: 'us', style: `bottom:${U.hours[i] / hmax * 100}%` }) : null);
                    }) }),
                legend(U ? h('span', null, h('i', { class: 'k2' }), 'Usual ' + kind) : null, sched.on && sched.blocks.length ? h('span', null, h('i', { class: 'k3' }), 'Lockdown') : null),
                D.todayTot ? h('div', { class: 'stats five' },
                    stat(D.visits + (D.visits === 1 ? ' visit' : ' visits'), 'today'),
                    stat(D.visits ? fmtDur(D.todayTot / D.visits) : '—', 'average visit'),
                    stat(L ? fmtDur(L.sec) : '—', L ? 'longest · ' + L.d : 'longest visit'),
                    stat(D.o.first != null ? clockOf(D.o.first) : '—', 'first visit'),
                    stat(D.sitesToday + (D.sitesToday === 1 ? ' site' : ' sites'), 'visited')) : null);
            out.push(whereCard);

            // the range every card below covers
            out.push(h('div', { class: 'rangebar' }, h('span', { text: 'The past' }),
                this.seg([['week', '7 days'], ['month', '4 weeks']], this.range, v => { this.range = v; this.render(); }, true, { 'aria-label': 'Range' }),
                h('span', { text: 'against everything before' })));

            const g1 = h('div', { class: 'grid2' });
            // How much are you online? (a bar per day, stacked by category, with the average)
            let muchAns;
            if (!D.win.length) muchAns = 'Your daily average shows up after your first full day.';
            else if (D.avgWas == null) muchAns = `You averaged ${fmtDur(D.avgNow)} a day ${D.inP}.`;
            else {
                const d = D.avgNow - D.avgWas;
                muchAns = `You averaged ${fmtDur(D.avgNow)} a day ${D.inP}. ` + (Math.abs(d) < 300 ? "That's about the same as before." : `That's ${fmtDur(Math.abs(d))} ${d > 0 ? 'more' : 'less'} than before.`);
            }
            const dtop = Math.ceil(Math.max(3600, ...D.win.map(x => totalOf(x.o))) / 3600) * 3600;
            const weekCard = card('How much are you online?', muchAns, D.full,
                D.win.length ? barChart({ name: 'days', aria: 'Time online per day by category, with your average', n: D.win.length, max: dtop, ticks: [{ v: dtop, text: fmtDur(dtop) }], line: { v: D.avgNow, text: 'avg' }, x: xDays(D.win),
                    bars: D.win.map(x => { const v = totalOf(x.o), tip = dayTip(x) + ' · ' + fmtDur(v); return h('div', { class: 'bar', title: tip, 'data-tip': tip }, v ? stack(catSums(x.o), v / dtop * 100) : null); }) }) : null);
            // Where does your time go? (categories, with the change from before)
            const cAll = sum(D.catNow), cTop = D.catNow.reduce((bi, v, i, a) => v > a[bi] ? i : bi, 0);
            let catAns;
            if (!cAll) catAns = 'Your categories show up after your first full day.';
            else {
                const nm = catName(cTop);
                catAns = `${nm} ${nm.endsWith('s') ? 'take' : 'takes'} the most time ${D.inP}.`;
                if (D.enough) {
                    const ch = D.catNow.map((v, i) => ({ i, d: v - D.catWas[i], was: D.catWas[i] })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
                    if (ch && Math.abs(ch.d) >= 300) { const n2 = ch.i === cTop ? (nm.endsWith('s') ? 'They' : 'It') : catName(ch.i);
                        catAns += ch.was < 60 ? ` ${n2} is new.` : ` ${n2} ${ch.d > 0 ? 'grew' : 'shrank'} the most, ${ch.d > 0 ? 'up' : 'down'} ${Math.round(Math.abs(ch.d) / ch.was * 100)}%.`; }
                }
            }
            const catCard = card('Where does your time go?', catAns, D.full,
                cAll ? h('div', { class: 'hbar', role: 'img', 'aria-label': 'Share of your time by category' }, D.catNow.map((v, k) => v > 0 ? h('i', { style: `flex-grow:${v};background:${colorOf(HCOL[k])}` }) : null)) : null,
                cAll ? h('div', { class: 'sl', text: 'Share of your time · change' }) : null,
                HCOL.map((k, i) => {
                    if (D.catNow[i] < 60 && D.catWas[i] < 60) return null;   // a category you don't use
                    const was = D.catWas[i], d = D.catNow[i] - was, pct = was >= 60 ? Math.round(d / was * 100) : null;
                    const txt = !D.enough ? '' : pct == null ? 'new' : Math.abs(pct) < 5 ? 'same' : (pct > 0 ? '+' : '−') + Math.abs(pct) + '%';
                    return h('div', { class: 'crow', title: fmtDur(D.catNow[i]) + ' a day' }, h('i', { style: 'background:' + colorOf(k) }), h('span', { text: (CAT[k] || OTHER).n }), h('b', { text: Math.round(D.catNow[i] / cAll * 100) + '%' }),
                        h('span', { class: 'delta ' + (txt === 'same' || !txt ? 'flat' : d > 0 ? 'up' : 'down'), text: txt }));
                }));
            g1.append(weekCard, catCard);
            out.push(g1);

            // What changed? (the sites that moved, with their trend; busy sites off your list fold away)
            let chAns;
            const top = D.moved[0];
            if (!D.enough) chAns = `Changes show up after ${D.need} more day${D.need === 1 ? '' : 's'} of history.`;
            else if (!top) chAns = `Nothing moved much ${D.inP}. Every site stayed within 5m a day.`;
            else if (top.was < 60) chAns = `${top.k} is new ${D.inP}. It's at ${fmtDur(top.now)} a day.`;
            else chAns = `${top.k} ${top.d > 0 ? 'rose' : 'dropped'} the most ${D.inP}. It went from ${fmtDur(top.was)} to ${fmtDur(top.now)} a day.`;
            const rows = D.enough ? D.moved : D.topSites;
            const addBtns = s => [h('button', { class: 'btn sm primary', onclick: () => this.addSite(s.k, guessCat(s.k)) }, icon(ICONS.plus, 12, 2.4), 'Add'),
                h('button', { class: 'btn sm', text: 'Ignore', onclick: () => { S.ignored.push({ d: s.k, avg: s.now }); set('ignored', S.ignored); this.render(); } })];
            const offList = s => !s.listed && !S.ignored.some(g => g.d === s.k);
            const acts = rows.some(offList);
            const spark = s => { const mx = Math.max(...s.spark, 1), W = 64, Hh = 22, p = 2, n = Math.max(1, s.spark.length - 1);
                const d = s.spark.map((v, i) => (i ? 'L' : 'M') + (p + i * (W - 2 * p) / n).toFixed(1) + ' ' + (Hh - p - v / mx * (Hh - 2 * p)).toFixed(1)).join(' ');
                return sv('svg', { class: 'spk', width: W, height: Hh, viewBox: `0 0 ${W} ${Hh}`, role: 'img', 'aria-label': s.k + ', each day' }, sv('path', { class: 'sparkf', d: d + ` L${W - p} ${Hh - p} L${p} ${Hh - p} Z` }), sv('path', { class: 'spark', d })); };
            const sugOpen = this.ignOpen;
            out.push(card('What changed?', chAns, D.full,
                rows.length ? h('div', { class: 'sl', text: (D.enough ? 'Sites that moved' : 'Your top sites so far') + ' · time a day · each day' }) : null,
                rows.map(s => h('div', { class: 'srow2' + (acts ? ' wa' : '') },
                    h('div', { class: 'fav', style: 'background:' + colorOf(s.cat) + (s.listed && s.cat !== 'music' ? '' : ';color:#1d1d1f'), text: s.k[0].toUpperCase() }),
                    h('div', { class: 'nm' }, h('b', { text: s.k }), h('small', { text: (s.listed ? CAT[s.cat].n : 'Not on your list') + ' · ' + (D.enough ? fmtDur(s.was) + ' → ' : '') + fmtDur(s.now) })),
                    spark(s),
                    h('div', { class: 'delta ' + (!D.enough || Math.abs(s.d) < 60 ? 'flat' : s.d > 0 ? 'up' : 'down'), text: D.enough ? sign(s.d) : '' }),
                    h('div', { class: 'acts' }, offList(s) ? addBtns(s) : null))),
                h('button', { class: 'disc' + (sugOpen ? ' open' : ''), 'aria-expanded': String(sugOpen), onclick: () => { this.ignOpen = !this.ignOpen; this.render(); } }, icon(ICONS.chev, 14),
                    'Site suggestions · ' + D.sugs.length + (S.ignored.length ? ' · ' + S.ignored.length + ' ignored' : '')),
                sugOpen ? [
                    D.sugs.length ? D.sugs.map(s => h('div', { class: 'sug2' }, h('span', { class: 'mono', style: 'color:var(--text)', text: s.k }), h('span', { class: 'mono', text: fmtDur(s.now) + ' a day · not on your list' }), h('div', { class: 'acts' }, addBtns(s))))
                        : h('div', { class: 'ign', text: 'No other busy sites off your list.' }),
                    ...S.ignored.map(g => h('div', { class: 'ign' }, h('span', { class: 'mono', style: 'color:var(--text)', text: g.d }), h('span', { class: 'mono', text: fmtDur(g.avg) + ' a day when ignored' }),
                        h('button', { class: 'link', text: 'Stop ignoring', onclick: () => { S.ignored = S.ignored.filter(x => x.d !== g.d); set('ignored', S.ignored); this.render(); } })))] : null));

            /* ── what's changing ── */
            out.push(level("What's changing"));
            let drAns;
            if (!D.hTot) drAns = 'Nothing yet. Your busiest hours show up after a day of browsing.';
            else {
                drAns = `Your busiest hours ${D.inP} were ${hourName(D.peak)} to ${hourName((D.peak + 3) % 24)}.`;
                if (D.cWas != null) {
                    const r = Math.round((D.cNow - D.cWas) * 2) / 2, a = Math.abs(r);
                    drAns += a < .5 ? " That's about the same time as before." : " That's about " + (a === .5 ? 'half an hour' : a === 1 ? 'an hour' : (Math.floor(a) + (a % 1 ? '½' : '')) + ' hours') + (r > 0 ? ' later' : ' earlier') + ' than before.';
                }
            }
            const gmax = Math.max(60, ...D.grid.flat());
            const shade = v => v > 0 ? `rgba(${T.rgb},${(.56 + .44 * Math.pow(v / gmax, 1.3)).toFixed(2)})` : 'var(--ctl)';
            const nightsTxt = D.win.length === 1 ? (D.lateNights ? 'You were online after ' : 'You were offline by ') + shortU(S.cfg.bedS) + ' on your first night.'
                : `You were online after ${shortU(S.cfg.bedS)} on ${D.lateNights} of ${D.full ? 'the past ' + D.R : 'your first ' + D.win.length} nights.`;
            const drift = card('When do you drift?', drAns, D.full,
                !D.hTot ? null : h('div', { class: 'ch hmw', 'data-chart': 'hours', role: 'img', 'aria-label': 'Average time online by weekday and hour' },
                    h('div', { class: 'hya', 'data-axis': 'y' }, D.order.map(d => h('span', { text: DAYS[d].slice(0, 3) }))),
                    h('div', { class: 'hm' }, D.grid.flatMap((row, ri) => row.map((v, i) => {
                        const tip = DAYS[D.order[ri]] + 's, ' + hourName(i) + ' · ' + fmtDur(v) + ' on average';
                        return h('i', { style: 'background:' + shade(v), title: tip, 'data-tip': tip });
                    }))),
                    xHours(),
                    h('div', { class: 'scale', 'data-axis': 'y' }, 'Less', ...[.56, .71, .85, 1].map(a => h('i', { style: `background:rgba(${T.rgb},${a})` })), 'More',
                        h('span', { style: 'margin-left:6px', text: D.R === 7 ? '· time online in that hour' : '· average time online in that hour' }))),
                D.hTot ? h('div', { class: 'd', style: 'margin-top:10px', text: `Those three hours hold ${Math.round(D.peakShare * 100)}% of your time online. ` + nightsTxt }) : null);
            out.push(drift);

            const g2 = h('div', { class: 'grid2' });
            // Is lockdown working?
            const n1 = v => String(Math.round(v * 10) / 10);
            let lkAns;
            if (!D.win.length) lkAns = 'Blocked tries show up here after your first full day.';
            else if (D.triesNow == null) lkAns = `No lockdown ${D.inP}. Nothing was blocked.`;
            else if (D.triesWas == null) lkAns = D.win.length === 1 ? `You tried a blocked site ${n1(D.triesNow)} times on your first day.` : `You tried a blocked site ${n1(D.triesNow)} times a lockdown day ${D.inP}.`;
            else {
                const r = D.triesNow / Math.max(.1, D.triesWas), now_ = n1(D.triesNow), was = n1(D.triesWas);
                lkAns = r < .8 ? `Blocked tries fell ${D.inP}. You tried ${now_} times a lockdown day, down from ${was}.`
                    : r > 1.25 ? `Blocked tries rose ${D.inP}. You tried ${now_} times a lockdown day, up from ${was}.`
                        : `Blocked tries held steady ${D.inP}. You tried about ${now_} times a lockdown day.`;
            }
            const tmax = Math.max(4, ...D.win.map(D.att));
            g2.append(card('Is lockdown working?', lkAns, D.full,
                D.win.length ? barChart({ name: 'tries', aria: 'Blocked tries per day; dots are passes used', n: D.win.length, max: tmax, ticks: [{ v: tmax, text: tmax + ' tries' }], x: xDays(D.win),
                    bars: D.win.map(x => {
                        const n = D.att(x), p = (x.o?.pass || []).length, tip = dayTip(x) + ' · ' + n + (n === 1 ? ' try' : ' tries') + (p ? ', ' + p + (p === 1 ? ' pass' : ' passes') : '');
                        return h('div', { class: 'bar' + (D.lockOn(x) ? '' : ' off'), title: tip, 'data-tip': tip }, p ? h('b', { class: 'pdot' }) : null, h('i', { style: `height:${n / tmax * 100}%` }));
                    }) }) : null,
                D.win.length ? h('div', { class: 'd', style: 'margin-top:8px' }, D.mostTried ? ['Most tried: ', h('b', { text: D.mostTried[0] }), ' · '] : null, (D.passesUsed ? D.passesUsed + (D.passesUsed === 1 ? ' pass' : ' passes') + ' used' : 'No passes used') + ' · dots mark days with a pass') : null));

            // Are you under your goal? (the streak calendar: five whole weeks)
            const goalTxt = fmtDur(D.goal);
            const glAns = D.streak ? `You're on a ${D.streak}-day streak under your ${goalTxt} goal.` + (D.best > D.streak ? ` Your best run is ${D.best} days.` : '')
                : `Today is over your ${goalTxt} goal.` + (D.best ? ` Your best run is ${D.best} day${D.best === 1 ? '' : 's'}.` : '');
            const shown = D.cal.filter(c => c.counted && !c.future), underN = shown.filter(c => c.v <= D.goal).length;
            const letters = S.cfg.weekStart === 'sun' ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
            g2.append(card('Are you under your goal?', glAns, false,
                h('div', { class: 'ch calw', 'data-chart': 'calendar', role: 'img', 'aria-label': 'The last five weeks: days under and over your goal' },
                    h('div', { class: 'cya', 'data-axis': 'y' }, [0, 1, 2, 3, 4].map(r => h('span', { text: D.cal[r * 7].dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }))),
                    h('div', { class: 'cal' }, D.cal.map(c => {
                        const tip = dayTip(c) + (c.future ? '' : !c.counted ? ' · before Hourglass' : ' · ' + fmtDur(c.v) + (c.v > D.goal ? ' · over goal' : ' · under goal'));
                        return h('i', { class: (c.future ? 'future' : !c.counted ? 'none' : c.v > D.goal ? 'over' : 'under') + (c.today ? ' today' : ''), title: tip, 'data-tip': tip });
                    })),
                    h('div', { class: 'xa', 'data-axis': 'x', style: 'grid-template-columns:repeat(7,minmax(0,1fr))' }, letters.map(l => h('span', { text: l })))),
                h('div', { class: 'key', style: 'margin-left:0' }, h('span', null, h('i', { class: 'sw2 cu' }), 'Under goal'), h('span', null, h('i', { class: 'sw2 co' }), 'Over goal')),
                shown.length ? h('div', { class: 'd', style: 'margin-top:8px', text: `Under your goal on ${underN} of the ${shown.length} days shown.` }) : null));
            out.push(g2);
            if (MOBILE) { this.tapTips(whereCard, 'Tap an hour for details'); this.tapTips(drift, 'Tap an hour for details'); this.tapTips(weekCard); for (const c of g2.children) this.tapTips(c); }
            return out;
        },

        /* ── schedule */
        viewDay(i) { return S.schedPend[i] || S.sched[i]; },
        setDay(i, nd) {
            nd = clone(nd);
            const merged = [];
            for (const b of nd.blocks.filter(b => b.e > b.s).sort((a, b) => a.s - b.s)) { const last = merged[merged.length - 1]; if (last && b.s <= last.e) last.e = Math.max(last.e, b.e); else merged.push({ s: b.s, e: b.e }); }
            nd.blocks = merged;
            if (!nd.blocks.length) nd.on = false;
            if (inLockdown() && looser(S.sched[i], nd)) S.schedPend[i] = nd;
            else { S.sched[i] = nd; delete S.schedPend[i]; }
            set('schedule', S.sched); set('schedPending', S.schedPend);
        },
        vSchedule() {
            const lock = inLockdown(), t = dow(), u = unitsNow();
            const totalH = sum(DAYS.map((_, i) => dayHours(this.viewDay(i))));
            const pct = b => `left:${b.s / 48 * 100}%;width:${(b.e - b.s) / 48 * 100}%`;
            const week = h('div', { class: 'tile full' }, this.label('Lockdown this week', totalH + 'h total'),
                h('div', { class: 'wk' }, DAYS.map((full, i) => {
                    const a = S.sched[i], dr = S.schedPend[i];
                    return h('button', { class: 'wkr' + (this.day === i ? ' sel' : ''), 'aria-label': 'Edit ' + full, onclick: () => { this.day = i; this.render(); } },
                        h('span', { class: 'dn', text: full.slice(0, 3) }),
                        h('span', { class: 'trk' }, ...[25, 50, 75].map(q => h('span', { class: 'q', style: `left:${q}%` })),
                            ...(a.on ? a.blocks.map(b => h('span', { class: 'bk', style: pct(b) })) : []),
                            ...(dr && dr.on ? dr.blocks.map(b => h('span', { class: 'gh', style: pct(b) })) : []),
                            i === t ? h('span', { class: 'now', style: `left:${u / 48 * 100}%` }) : null),
                        h('span', { class: 'hrs', text: dr ? dayHours(dr) + 'h*' : dayHours(a) ? dayHours(a) + 'h' : 'Free' }));
                })),
                h('div', { class: 'wkt' }, h('span'), h('div', null, ['12a', '6a', '12p', '6p', '12a'].map(x => h('span', { text: x }))), h('span')),
                Object.keys(S.schedPend).length ? h('div', { class: 'd', style: 'margin-top:8px', text: '* Dashed outline = a looser change waiting until ' + shortU(currentBlock()?.e ?? 0) }) : null);

            const i = this.day, sd = this.viewDay(i), pending = !!S.schedPend[i], full = DAYS[i];
            const editor = h('div', { class: 'tile full' });
            editor.append(h('div', { class: 'row', style: 'margin-bottom:14px;flex-wrap:wrap' },
                h('div', { class: 'days' }, DAYS.map((d, k) => {
                    const v = this.viewDay(k);
                    return h('button', { class: 'day' + (k === i ? ' sel' : '') + (v.on && v.blocks.length ? ' has' : ''), 'aria-label': d, 'aria-pressed': String(k === i), text: d[0], onclick: () => { this.day = k; this.render(); } });
                })),
                h('div', { style: 'display:flex;align-items:center;gap:10px' },
                    h('div', { style: 'text-align:right' }, h('div', { class: 't', text: full }), h('div', { class: 'd', text: !sd.on ? 'Free all day' : dayHours(sd) + 'h of lockdown' + (pending ? ' · waits until ' + shortU(currentBlock()?.e ?? 0) : '') })),
                    toggle(sd.on, () => { const nd = clone(sd); nd.on = !nd.on; if (nd.on && !nd.blocks.length) nd.blocks = [{ s: 18, e: 34 }]; this.setDay(i, nd); this.render(); }, 'Lockdown on ' + full))));
            if (sd.on) {
                sd.blocks.forEach((b, bi) => editor.append(this.blockEditor(i, sd, b, bi, pending)));
                editor.append(h('div', { class: 'row', style: 'margin-top:10px' },
                    h('button', { class: 'btn', onclick: () => { const nd = clone(sd); const last = nd.blocks[nd.blocks.length - 1]; nd.blocks.push(last && last.e <= 40 ? { s: Math.min(46, last.e + 2), e: Math.min(48, last.e + 8) } : { s: 0, e: 12 }); this.setDay(i, nd); this.render(); } }, icon(ICONS.plus, 13, 2.2), 'Add a time block'),
                    h('span', { class: 'd', text: 'Drag the handles · 30-minute steps' })));
            } else {
                editor.append(h('div', { class: 'blkc', style: 'text-align:center;padding:22px' }, h('div', { class: 't', text: 'No lockdown on ' + full }), h('div', { class: 'd', text: 'Every site is free all day. Turn the switch on to add hours.' })));
            }
            editor.append(h('div', { class: 'label', style: 'margin:20px 0 10px' }, 'Quick presets', h('i', { text: 'Applies to ' + full })),
                h('div', { class: 'chips' }, PRESETS.map(p => h('button', { class: 'chip', title: p.next ? full + ' 11 PM to midnight, plus 12–7 AM on ' + DAYS[(i + 1) % 7] + ' morning' : null,
                    onclick: () => {
                        this.setDay(i, { on: true, blocks: clone(p.b) });
                        if (p.next) { const j = (i + 1) % 7, nd = clone(this.viewDay(j)); nd.on = true; nd.blocks = nd.blocks.concat(clone(p.next)); this.setDay(j, nd); }
                        this.render();
                    } }, p.n, h('small', { text: p.r })))),
                h('div', { class: 'row', style: 'margin-top:14px;padding-top:12px;border-top:1px solid var(--line)' },
                    h('span', { class: 'd', text: 'Copy ' + full + "'s hours" }),
                    h('div', { style: 'display:flex;gap:8px' },
                        h('button', { class: 'btn', text: 'To weekdays', onclick: () => { [0, 1, 2, 3, 4].forEach(k => this.setDay(k, sd)); this.render(); } }),
                        h('button', { class: 'btn', text: 'To every day', onclick: () => { [0, 1, 2, 3, 4, 5, 6].forEach(k => this.setDay(k, sd)); this.render(); } }))));

            const commitCfg = k => v => { if (inLockdown()) return; S.cfg[k] = v; saveCfg(); evaluate(); this.render(); };
            const passes = h('div', { class: 'tile full', style: 'margin-bottom:14px' },
                this.label('Passes', this.lockPill()),
                h('div', { class: 'd', style: 'margin:-4px 0 10px', text: "A pass opens only the site you're on. Set these before lockdown starts." }),
                this.slr('Passes per day', 'Shared by every site, resets at midnight', this.slider({ min: 0, max: 10, value: S.cfg.passes, disabled: lock, label: 'Passes per day', fmt: v => String(v), commit: commitCfg('passes') })),
                this.slr('Pass length', 'How long the site stays open', this.slider({ min: 1, max: 15, value: S.cfg.passLen, disabled: lock, label: 'Pass length in minutes', fmt: v => v + ' min', commit: commitCfg('passLen') })),
                this.slr('Wait before a pass', 'A pause to think it over first', this.slider({ min: 10, max: 60, step: 5, value: S.cfg.passWait, disabled: lock, label: 'Wait before a pass in seconds', fmt: v => v + ' s', commit: commitCfg('passWait') })));
            return [week, editor, passes];
        },
        blockEditor(i, sd, b, bi, pending) {
            const st = h('span', { class: 'tchip' }), et = h('span', { class: 'tchip' }), dur = h('span', { class: 'dur' }), fr = h('div', { class: 'fr' });
            const a = h('input', { class: 'rng', type: 'range', min: 0, max: 48, step: 1, value: b.s, 'aria-label': 'Lockdown start' });
            const z = h('input', { class: 'rng', type: 'range', min: 0, max: 48, step: 1, value: b.e, 'aria-label': 'Lockdown end' });
            const cur = { s: b.s, e: b.e };
            const paint = () => {
                st.textContent = fmtU(cur.s); et.textContent = cur.e >= 48 ? '12:00 AM' : fmtU(cur.e); dur.textContent = fmtDur((cur.e - cur.s) * 1800);
                const th = MOBILE ? 28 : 22;
                fr.style.left = `calc(${th / 2}px + (100% - ${th}px) * ${cur.s / 48})`; fr.style.width = `calc((100% - ${th}px) * ${(cur.e - cur.s) / 48})`;
            };
            a.addEventListener('input', () => { this.dragging = true; cur.s = Math.min(+a.value, cur.e - 1); a.value = cur.s; paint(); });
            z.addEventListener('input', () => { this.dragging = true; cur.e = Math.max(+z.value, cur.s + 1); z.value = cur.e; paint(); });
            const commit = () => { this.dragging = false; const nd = clone(sd); nd.blocks[bi] = { s: cur.s, e: cur.e }; this.setDay(i, nd); this.render(); };
            a.addEventListener('change', commit); z.addEventListener('change', commit);
            paint();
            return h('div', { class: 'blkc' + (pending ? ' pending' : '') },
                h('div', { class: 'times' }, st, h('span', { class: 'arrow', text: '→' }), et, dur,
                    h('button', { class: 'ibtn', 'aria-label': 'Remove this block', onclick: () => { const nd = clone(sd); nd.blocks.splice(bi, 1); this.setDay(i, nd); this.render(); } }, icon(ICONS.close, 14))),
                h('div', { class: 'dual' }, h('div', { class: 'rail' }), fr, a, z),
                h('div', { class: 'ht' }, ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p', '12a'].map(x => h('span', { text: x }))));
        },

        /* ── sites */
        viewSite(s) { return Object.assign({}, s, S.sitesPend[s.d] || {}); },
        setSites(ds, patch) {
            ds = [].concat(ds);
            const lock = inLockdown();
            for (const s of S.sites) {
                if (!ds.includes(s.d)) continue;
                const want = Object.assign({}, this.viewSite(s), patch);
                const isLooser = (s.on && !want.on) || (s.rule === 'always' && want.rule === 'sched');
                if (lock && isLooser) S.sitesPend[s.d] = { rule: want.rule, on: want.on };
                else { s.rule = want.rule; s.on = want.on; delete S.sitesPend[s.d]; }
            }
            set('sites', S.sites); set('sitesPending', S.sitesPend);
            evaluate(); this.render();
        },
        addSite(input, cat) {
            const d = cleanDomain(input);
            if (!d) { this.addBad = true; this.render(); return; }
            this.addBad = false;
            if (!S.sites.some(s => s.d === d)) { S.sites.push({ d, cat: cat || guessCat(d), rule: 'sched', on: true }); set('sites', S.sites); }
            S.ignored = S.ignored.filter(g => g.d !== d); set('ignored', S.ignored);
            this.addText = ''; evaluate(); this.render();
        },
        vSites() {
            const lock = inLockdown(), o = get(DKEY(dayKey()), null) || newDay();
            const here = HOST ? statKey(HOST) : null, hereListed = !!(HOST && matchSite(HOST, S.sites));
            const input = h('input', { placeholder: 'e.g. tiktok.com', value: this.addText, 'aria-label': 'Site to add', spellcheck: 'false',
                oninput: e => { this.addText = e.target.value; }, onkeydown: e => { if (e.key === 'Enter') this.addSite(this.addText, this.addCat); } });
            const add = h('div', { class: 'tile full' }, this.label('Add a site'),
                h('div', { class: 'addr' }, h('label', { class: 'field' + (this.addBad ? ' bad' : '') }, icon(ICONS.globe, 15), input),
                    h('button', { class: 'btn primary', style: 'height:38px', text: 'Add', onclick: () => this.addSite(this.addText, this.addCat) })),
                h('div', { class: 'row', style: 'margin-top:10px;flex-wrap:wrap' },
                    this.seg(CATS.map(k => [k, CAT[k].n]), this.addCat, v => { this.addCat = v; this.render(); }, true, { 'aria-label': 'Category for the new site', style: 'flex:none' }),
                    here ? (hereListed ? h('span', { class: 'pill acc', text: here + ' is on your list' })
                        : h('button', { class: 'btn', text: 'Add this site · ' + here, onclick: () => this.addSite(here, this.addCat === 'custom' ? guessCat(here) : this.addCat) })) : null),
                h('div', { class: 'd', style: 'margin-top:12px' }, h('b', { text: 'Schedule' }), ' blocks during lockdown · ', h('b', { text: 'Always' }), " blocks all day, every day · switch a site off to only count its time. Every site's time is counted either way. Adding ", h('span', { class: 'mono', text: 'reddit.com' }), ' covers all of Reddit.'));
            const groups = CATS.map(k => {
                const list = S.sites.filter(s => s.cat === k), open = !this.closed[k];
                const tot = sum(list.map(s => (o.s || {})[s.d] || 0));
                const views = list.map(s => this.viewSite(s));
                const g = h('div', { class: 'grp' },
                    h('div', { class: 'gh2' },
                        h('button', { class: 'gbtn' + (open ? '' : ' closed'), 'aria-expanded': String(open), onclick: () => { this.closed[k] = open; this.render(); } },
                            icon(ICONS.chev, 14), h('span', { class: 'gdot', style: 'background:' + CAT[k].c }), h('span', { class: 'gname', text: CAT[k].n }),
                            h('span', { class: 'gmeta', text: list.length + (list.length === 1 ? ' site' : ' sites') + ' · ' + fmtDur(tot) + ' today' })),
                        toggle(list.length && views.every(v => v.on), () => this.setSites(list.map(s => s.d), { on: !views.every(v => v.on) }), 'All ' + CAT[k].n + ' sites', !list.length)));
                if (open) {
                    if (k === 'music') g.append(h('div', { class: 'note' }, icon(ICONS.music, 14), "Music mode (the note in the bottom corner) lets these play during lockdown. It's " + (S.music ? 'on' : 'off') + ' right now.'));
                    list.forEach(s => {
                        const v = this.viewSite(s), pend = !!S.sitesPend[s.d], t = (o.s || {})[s.d] || 0;
                        g.append(h('div', { class: 'site' + (v.on ? '' : ' off') + (pend ? ' pend' : '') },
                            h('div', { class: 'fav', style: 'background:' + CAT[k].c + (k === 'music' ? ';color:#5a1020' : ''), text: s.d[0].toUpperCase() }),
                            h('div', { class: 'nm' }, h('b', { text: s.d }), h('small', { text: pend ? 'Change waits until ' + shortU(currentBlock()?.e ?? 0) : t ? fmtDur(t) + ' today' : 'Not visited today' })),
                            this.seg([['sched', 'Schedule'], ['always', 'Always']], v.rule, r => this.setSites(s.d, { rule: r }), true, { 'aria-label': 'Rule for ' + s.d }),
                            toggle(v.on, () => this.setSites(s.d, { on: !v.on }), s.d + ' blocking on'),
                            h('button', { class: 'ibtn', 'aria-label': 'Remove ' + s.d, title: lock ? 'Remove sites after lockdown' : 'Remove', disabled: lock,
                                onclick: () => { S.sites = S.sites.filter(x => x.d !== s.d); delete S.sitesPend[s.d]; set('sites', S.sites); set('sitesPending', S.sitesPend); evaluate(); this.render(); } }, icon(ICONS.trash, 14))));
                    });
                    if (!list.length) g.append(h('div', { class: 'empty' }, 'No sites yet. Pick ', h('b', { text: CAT[k].n }), ' above when you add one.'));
                }
                return g;
            });
            return [add, ...groups, h('div', { style: 'height:4px' })];
        },

        /* ── settings */
        vSettings() {
            const lock = inLockdown(), c = S.cfg;
            const upd = (k, v) => { c[k] = v; saveCfg(); if (k === 'hist') prune(); evaluate(); this.render(); };
            const master = h('div', { class: 'card' }, h('div', { class: 'row' },
                h('div', null, h('div', { class: 't', text: 'Hourglass' }), h('div', { class: 'd', text: lock ? "Can't be turned off during lockdown. It unlocks at " + shortU(currentBlock().e) + '.' : c.enabled ? 'Counting every site and enforcing your schedule.' : 'Paused. Nothing is counted or blocked.' })),
                toggle(c.enabled, () => { if (!inLockdown()) upd('enabled', !c.enabled); }, 'Hourglass on', lock)));
            const tracking = h('div', { class: 'tile full' }, this.label('Tracking'),
                this.slr('Idle timeout', 'Stop the clock after no mouse or keys', this.slider({ min: 1, max: 10, value: c.idle, label: 'Idle timeout in minutes', fmt: v => v + ' min', commit: v => upd('idle', v) })),
                h('div', { class: 'row', style: 'margin-top:12px' }, h('div', null, h('div', { class: 't', text: 'Playing video or music counts as active' }), h('div', { class: 'd', text: 'Keeps the clock running while you watch without touching anything' })), toggle(c.video, () => upd('video', !c.video), 'Video counts as active')),
                h('div', { class: 'row' }, h('div', null, h('div', { class: 't', text: 'Keep history' }), h('div', { class: 'd', text: 'Older days roll off automatically' })),
                    this.seg([[30, '30 days'], [90, '90 days'], [365, '1 year']], c.hist, v => upd('hist', v), true, { style: 'width:230px' })),
                h('div', { style: 'margin-top:10px' }, this.slr('Daily goal', 'For streaks only. It never blocks anything.', this.slider({ min: 2, max: 16, value: c.goal / 30, label: 'Daily goal', fmt: v => fmtDur(v * 1800), commit: v => upd('goal', v * 30) }))));
            const lockT = h('div', { class: 'tile full' }, this.label('Lockdown', this.lockPill()),
                this.slr('Think-it-over delay', 'Seconds before Continue appears on "Is this important?"', this.slider({ min: 3, max: 15, value: c.gateDelay, disabled: lock, label: 'Think-it-over delay in seconds', fmt: v => v + ' s', commit: v => { if (!inLockdown()) upd('gateDelay', v); } })),
                h('div', { class: 'row', style: 'margin-top:12px' }, h('div', null, h('div', { class: 't', text: 'Show attempts on the block screen' }), h('div', { class: 'd', text: '"7th try today" can be a useful nudge' })), toggle(c.showAttempts, () => upd('showAttempts', !c.showAttempts), 'Show attempts')),
                h('div', { class: 'row' }, h('div', null, h('div', { class: 't', text: 'Looser changes wait until lockdown ends' }), h('div', { class: 'd', text: "Always on. That's the whole point." })), h('span', { class: 'pill acc' }, icon(ICONS.lock, 10, 2.6), 'Built in')));
            if (!MOBILE) tracking.append(h('div', { class: 'row', style: 'margin-top:10px' }, h('div', null, h('div', { class: 't', text: 'Count listening time' }), h('div', { class: 'd', text: 'Sound playing in any tab, even tabbed out into a game. Shown next to Music mode, kept apart from screen time.' })), toggle(c.listen, () => upd('listen', !c.listen), 'Count listening time')));
            const off = !c.nudge;
            const bed = h('div', { class: 'tile full' }, this.label('Late-night nudge', inBedtime() ? 'Bedtime now' : null),
                h('div', { class: 'row' }, h('div', null, h('div', { class: 't', text: 'Take-a-break reminder' }), h('div', { class: 'd', text: "A friendly nudge when you're still browsing past bedtime, even outside lockdown." })), toggle(c.nudge, () => upd('nudge', !c.nudge), 'Late-night nudge')),
                h('div', { style: 'margin-top:8px;' + (off ? 'opacity:.5' : '') },
                    this.slr('Bedtime starts', 'When late-night time starts counting', this.slider({ min: 36, max: 54, value: c.bedS < 24 ? c.bedS + 48 : c.bedS, disabled: off, label: 'Bedtime starts', fmt: v => fmtU(v % 48), commit: v => upd('bedS', v % 48) })),
                    this.slr('Bedtime ends', 'Morning, when it stops', this.slider({ min: 2, max: 22, value: c.bedE, disabled: off, label: 'Bedtime ends', fmt: v => fmtU(v), commit: v => upd('bedE', v) })),
                    this.slr('Nudge after', 'Minutes of late-night browsing between nudges', this.slider({ min: 5, max: 60, step: 5, value: c.nudgeAfter, disabled: off, label: 'Nudge after minutes', fmt: v => v + ' min', commit: v => upd('nudgeAfter', v) })),
                    h('div', { class: 'row', style: 'margin-top:8px' }, h('div', null, h('div', { class: 't', text: 'Counts time on' }), h('div', { class: 'd', text: 'Your list is the sites in the Sites tab' })),
                        this.seg([['list', 'Your list'], ['all', 'Every site']], c.nudgeScope, v => upd('nudgeScope', v), true, { style: 'width:200px' }))),
                h('div', { class: 'row', style: 'margin-top:12px;padding-top:12px;border-top:1px solid var(--line)' },
                    h('div', { class: 'd', text: (inBedtime() ? 'Tonight so far: ' : 'Last night: ') + fmtDur(nightTotal(inBedtime() ? nightId() : lastNightId(), nudge.scope())) }),
                    h('button', { class: 'btn', onclick: () => nudge.show(nudge.tonight(), 1) }, icon(ICONS.moon, 13), 'Preview')));
            const general = h('div', { class: 'tile full' }, this.label('General'),
                h('div', { class: 'row' }, h('div', { class: 't', text: 'Week starts on' }), this.seg([['mon', 'Monday'], ['sun', 'Sunday']], c.weekStart, v => upd('weekStart', v), true, { style: 'width:170px' })),
                (() => {
                    const want = get('layout', 'auto'), pending = want !== LAYOUT;
                    return h('div', { class: 'row' },
                        h('div', null, h('div', { class: 't', text: 'Layout' }),
                            h('div', { class: 'd' }, pending ? ['Reload the page to switch. ', h('button', { class: 'link', text: 'Reload now', onclick: () => location.reload() })]
                                : 'Auto uses the phone layout on phones. Showing the ' + (MOBILE ? 'phone' : 'desktop') + ' layout.')),
                        this.seg([['auto', 'Auto'], ['desktop', 'Desktop'], ['phone', 'Phone']], want, v => { set('layout', v); this.render(); }, true, { style: 'width:230px' }));
                })());
            const armed = Date.now() - this.resetArm < 4000;
            const data = h('div', { class: 'tile full', style: 'margin-bottom:14px' }, this.label('Your data'),
                h('div', { class: 'd', style: 'margin:-4px 0 12px', text: 'Saved only in Tampermonkey on this PC. Only site names are kept, never full addresses or page titles.' }),
                h('div', { class: 'dbtns' },
                    h('button', { class: 'btn', onclick: () => exportCSV() }, icon(ICONS.down, 13, 2.2), 'Export CSV'),
                    h('button', { class: 'btn', onclick: () => exportSettings() }, icon(ICONS.down, 13, 2.2), 'Export settings'),
                    h('button', { class: 'btn', disabled: lock, title: lock ? 'Import after lockdown' : null, onclick: () => importSettings(() => this.render()) }, icon(ICONS.up, 13, 2.2), 'Import settings'),
                    h('button', { class: 'btn danger', disabled: lock, text: armed ? 'Click again to erase' : 'Reset all stats',
                        onclick: () => { if (inLockdown()) return; if (Date.now() - this.resetArm < 4000) { resetStats(); this.resetArm = 0; } else this.resetArm = Date.now(); this.render(); } })));
            const look = h('div', { class: 'tile full' }, this.label('Appearance'),
                h('div', { class: 'row' }, h('div', null, h('div', { class: 't', text: 'Match my device' }), h('div', { class: 'd', text: 'Light or dark follows your device until you flip the switch up top' })),
                    toggle(get('appearance', 'auto') === 'auto', () => { set('appearance', get('appearance', 'auto') === 'auto' ? (isDark() ? 'dark' : 'light') : 'auto'); blocker.retheme(); this.render(); }, 'Match my device')));
            return [master, tracking, lockT, bed, general, look, data];
        },
    };

    /* ───────────────────────── data import/export ───────────────────────── */

    function download(name, text, type) {
        const url = URL.createObjectURL(new Blob([text], { type }));
        const a = h('a', { href: url, download: name, style: 'display:none' });
        (document.body || document.documentElement).append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    function exportCSV() {
        flush();
        const rows = [['date', 'site', 'category', 'seconds', 'visits', 'blocked_tries', 'listening_seconds']];
        for (const k of get('days', [])) {
            const o = get(DKEY(k), null); if (!o) continue;
            const keys = new Set([...Object.keys(o.s || {}), ...Object.keys(o.att || {}), ...Object.keys(o.ls || {})]);
            for (const d of keys) rows.push([k, d, (CAT[catOf(d)] || OTHER).n, Math.round((o.s || {})[d] || 0), (o.v || {})[d] || 0, (o.att || {})[d] || 0, Math.round((o.ls || {})[d] || 0)]);
        }
        download('hourglass-' + dayKey() + '.csv', rows.map(r => r.map(x => /[",\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : x).join(',')).join('\n'), 'text/csv');
    }
    function exportSettings() {
        download('hourglass-settings.json', JSON.stringify({ hourglass: VERSION, settings: S.cfg, schedule: S.sched, sites: S.sites, ignored: S.ignored }, null, 2), 'application/json');
    }
    function importSettings(done) {
        if (inLockdown()) return;
        const inp = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
        inp.addEventListener('change', async () => {
            try {
                const j = JSON.parse(await inp.files[0].text());
                if (j.settings) { S.cfg = Object.assign(clone(DEFAULTS), j.settings); if (typeof j.settings.armed !== 'boolean') S.cfg.armed = true; S.cfg.armAt = 0; saveCfg(); }
                if (Array.isArray(j.schedule) && j.schedule.length === 7) { S.sched = j.schedule; set('schedule', S.sched); }
                if (Array.isArray(j.sites)) { S.sites = j.sites.filter(s => s && cleanDomain(s.d)); set('sites', S.sites); }
                if (Array.isArray(j.ignored)) { S.ignored = j.ignored; set('ignored', S.ignored); }
                evaluate();
            } catch {}
            inp.remove(); done && done();
        });
        (document.body || document.documentElement).append(inp); inp.click();
    }
    function resetStats() {
        pend = null;
        for (const k of get('days', [])) del(DKEY(k));
        set('days', []);
        del('nights');   // bedtime totals (the late-night nudge) are stats too
    }

    /* ───────────────────────── wiring ───────────────────────── */

    load();
    applyPendingIfFree();
    prune();

    try { GM_registerMenuCommand('Open Hourglass', () => ui.open()); } catch {}

    const KEYS = ['settings', 'schedule', 'schedPending', 'sites', 'sitesPending', 'ignored', 'music', 'passes', 'appearance', 'layout'];
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { blocker.retheme(); if (ui.host) ui.render(); }); } catch {}
    try {
        for (const k of KEYS) GM_addValueChangeListener(k, (name, oldV, newV, remote) => {
            if (!remote) return;
            load(); evaluate(); if (name === 'appearance') blocker.retheme();
            // re-render unless someone is typing in this panel (a focused panel alone isn't a reason to stay stale)
            const typing = (() => { try { const a = ui.root && ui.root.activeElement; return !!a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && !/^(range|checkbox|radio|button)$/.test(a.type); } catch { return false; } })();
            if (ui.host && !ui.dragging && !typing) ui.render();
        });
    } catch {}

    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); else { load(); evaluate(); } });
    addEventListener('pagehide', flush);

    evaluate();
    setInterval(() => {
        const now = Date.now();
        let dt = (now - lastTick) / 1000; lastTick = now;
        if (dt > 5) dt = 0; // asleep or throttled
        if (S.passes.day !== dayKey()) { S.passes = freshPasses(); set('passes', S.passes); }
        if (applyPendingIfFree() && ui.host) ui.render();
        track(now, dt);
        trackListen(now);
        if (now - lastFlush > FLUSH_MS) flushSoon();
        evaluate();
        blocker.tickCountdown();
        hush();
        nudge.check(now);
    }, 1000);
})();