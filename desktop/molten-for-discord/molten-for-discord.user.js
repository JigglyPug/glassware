// ==UserScript==
// @name         Molten for Discord
// @namespace    jigglypug
// @version      1.0.8
// @description  Molten glass for Discord: a lava-lamp background made from the image, video, stream or profile you're looking at (or the server's icon), frosted glass over it, favorite channels on the lava button, saved messages and reminders with notes, your own activity at a glance, glowing mentions and keywords, art-colored title bar and seek bar, Screenshot safe and privacy blur. Click the lava button in the top bar for settings.
// @match        https://discord.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      cdn.discordapp.com
// @connect      media.discordapp.net
// @connect      images-ext-1.discordapp.net
// @connect      images-ext-2.discordapp.net
// @run-at       document-idle
// @noframes
// @author       JigglyPug
// @license      MIT
// @icon         https://raw.githubusercontent.com/JigglyPug/glassware/main/assets/icons/molten-for-discord.png?v=2
// @homepageURL  https://jigglypug.github.io/glassware/desktop/molten-for-discord/
// @supportURL   https://github.com/JigglyPug/glassware/issues
// @updateURL    https://raw.githubusercontent.com/JigglyPug/glassware/main/desktop/molten-for-discord/molten-for-discord.user.js
// @downloadURL  https://raw.githubusercontent.com/JigglyPug/glassware/main/desktop/molten-for-discord/molten-for-discord.user.js
// ==/UserScript==

/* Molten for Discord: the Molten engine, rebuilt for Discord.
     - Lava: the background is what you're looking at: a playing video or stream, whoever is talking in a
       call, the profile you opened, or the image in the middle of the chat. With nothing on screen it takes
       your color for the server, its icon, then its banner, and last Discord purple. Calm / User / Crazy.
     - Glass: the server list, channels, chat, member list, menus and popouts turn to glass over the lava
     - Art colors: the installed-app title bar and the seek bar match the lava. With nothing to go on the
       title bar is handed back (to Prism, if it's installed: <html data-titlebar-owner>)
     - Favorites: point at the lava button and up to 10 favorites drip down; the full list, Recent and
       notes live in the panel. Saved messages in folders, with reminders.
     - Mentions and your keywords glow; Screenshot safe; privacy blur
   Click the lava button in the top bar to open the settings. Open Discord tabs sync live.
   Discord renames its layout's pieces often: if a surface stays solid, use General > "Copy layout report". */

(function boot() {
    'use strict';
    if (window.top !== window.self) return;
    // wait for the page to exist (Tampermonkey starts this at document-idle, but nothing should depend on it)
    if (!document.documentElement) {
        const wait = new MutationObserver(() => { if (document.documentElement) { wait.disconnect(); boot(); } });
        wait.observe(document, { childList: true });
        return;
    }

    /* ───────────────────────── the app ───────────────────────── */

    const APP = {
        name: 'Molten for Discord',
        slug: 'molten-for-discord',
        tagline: 'Molten glass for Discord',
        accent: '#5865f2',
        rgb: '88,101,242',
        on: '#ffffff',
        ink: '#3d48c4',
        inkDark: '#8f98ff',
        tabs: ['General', 'Lava', 'Favorites', 'Activity', 'Privacy'],
        master: true,
    };
    const ICON_SRC = 'data:image/webp;base64,UklGRp4LAABXRUJQVlA4WAoAAAAQAAAAXwAAXwAAQUxQSBECAAABh+SokSRHUlQb7X/5o7V3DCIiXVEK8UdQgU4hptrQIVS5LXUukhgkUSuHRVCuwArxnlDQRpJyjP/+HbOBiP5PAOOiLMXSXKK/6JjYAoO2JEmKJMk8qrl7mflpZd/o/z9kj2GYubky/RjjGCQiJoAIRXR7AxY3n9x/eLvbITqIn9r8nK6z1fJyOt+/vGrdLtdtqdUOUEQT83uvHj6ZkOHieO9k/3zZNCEhJKRO6b17+QKsX5tBwGxjd7Or5lsOQOXW/ddUiRwrweWnow4CHAYGE0qIPO1gMmxk7KhWTKAhV5txD3DttjGbIjKORXGp3ebkApOxuZivXQbrvUrOwZ2hJH2+0Tgn4AYlFl9gkpb7arnxUaQFGs1XT6/IW+7NVg/kvLBW83siczXTO2Qu9U+7qWGpyQ2VyK6Tnjq5iT7pK730ld4/wJ3e/75Vev8A9+891+yYZde2OLc6Jfn8yhXKbT27xKkdH52lZg4uj8hcV/tXR7NwWmZ7uz3YILPdC5/vTuWkHBsf9tvl1odpVX9yxCqa0Q2S1r1+sGqiNxrjyEdcv1U6tBE0TQWUjBmOShMUSfJqekdGibgytyVRJeE6H076slEOdnC5ACQscGUtNOpJMujXZsHGxyedCoiKsWultPNZjT4ZTrf33h9FqcZQAddSQqyW8+nJjfGNXr9BP5l+FtdS2/Xpwf7WWU9trQYAAFZQOCBmCQAAECsAnQEqYABgAD4pEodCoaEKPZqcDAFCWMApAWu1B51dkvs0WXumCAbdPpY8wDn3eYDzdPRD/cPUA/tPUa+jX5a/si/t5+63tS///CWNH/D3zMe6/brQJ/lX4l/MZzn/OY9fvsr5z0RP97+WPOyeOewJ/Hf7P/uPuA+Qn/b+533Mfmv9u/5v+N+Av+T/0n/af3LtW+i/+ywMr+JiG5t2TEM9inLolkUYuzU/rKHEhdgZNWK8A+mDS22+iymjBWvnPlaKp7JBo9xLdL/WZmYqN++DWPvCq1NIAPN4RfiZh2eNBSM1UrX+NCa9RFIKLoCEHv+fAV2u8AAisfG4xPaTLEOICc3FxMzqMyyzMzB/irFxlT3ETbct0OmwQxJkW3aX1fWpu9uhFw6GjClYdpe38pcxsq8xMqgfO8o2pxxM/rBB2tbOflOASUi6OwWEBsqkVbmt578zQgds2O2ABHn/wwAAzj+pMkoqAv/eOp6ttalxnp9Z5b+s6FpXzCsS7aNGZApa18m4O/Cj4PMSfiotMi2lneyL8zNxTW7nzQe357JPZ0rr7XwHt1U3LlEcP7+TvST8u50ff9LOPW4GTbb9UFIzRrQzr+sBp0qWzb0HKh6CMmKdHcDS6+2YgKGz82+CrffmyUbVFL6yc2sL/xG+rqtpaByjnE5beC09cu9XE6/d7afBYE1bb0J/lcRzSdqrHXZtEJlDTNJkKLI+2ZqHie0X+aQ4P8ibR/siIDQrxwiNyYu6z6lljnJF2ZzkngQ03/B2SY4KZGSUaHSHnsxhwRJS1u3xDSq5HjJcTqfOpLChbgE+X3XmzOhbINCgFp2zNAOfN/O06E1AP5zC6C/ERDR/oODWuou7hb0FUUEVQXEjOwS0qBPP2jaIqkIiAWA3i1ufzT/00I+cnHynX3bf6rP5CkOb6qivDWMZPrN9g2LIXzL7s6hqjLL5wRUl59SdO7YnfG7HrnOQgaux6rVYjmQU9hBQuWILkZm1TMl3IYzHqRvZoT7Uwk/Rrti8tlvOUrTDkrspQEQOz8v/ZbnRrMERhXLQwtzMLC70ggTSc1Q79VfEC35LSCJKlEPf39kJmhhLcXtD0Ze6FyLm8aR7W7KGtBG539oorjYK7F+gpO4B3NmzimyTPX0XzKTzzMb0+BY2ttQTsQ14EzPb6OK0noogUzKBGSaHGjNR78xX9XXGX4t8UirbFiIfhhmp34ova8WNY5bauzVlP6ebGXc3nRhagYuBdeQ892dxLSnwsPJW5eSnMy9hAlWjWtXgwrz2HuPZVPayccVfZGfw9oDg93eqoaxkdwA54YPBKJ7HM/a2Dz+tuE12Ne2jIWUIYRPyzrVLqry8uA7aef36/AYfcZqZLvVYry6/WiFU03He2yrKk5CI5Zxasmf3QGGaQtja4hmZ40cG0d5d6Wq2s5bTLzFPS4SrvHu3CtaMZYC2nlMiMHt+mW/0TwVExV9cbz/vEhj6jgLBktkLmAnJ5jaWEcj/Nc+3+s+otUXWcS99dCvZQuZCy3/1bz1enZyBD3NyrbFFHUIcQkMOlkV2mYHDJoZKB9hXZkH+6q2pxgE1uraO2f7lP1jxJyGWqcwJaqBnJpBLMwHQMVVDkLv89spCHihSAVySHMOzSVrtVBjpc1+oTZ7/LYFnn6ppIzd7Prdevo3fGTy+QP1h3K6N9J7G3BBl8rHXBDz0JFMRNVilXh07e+TqoLcpWgNottJfFuh+O2mEjPFuPEmufoOnJTBvDHOdZAoWISB9YHLDww1zTOvK1LGjH3FJeOFZk9FCojNZ/FhEY5V9gBWXDMYKyIb+0iKievIWs3P9BB2EgromOMZTfmkcNQPBGGL5cWZt8d0ZVKT7RmuNOkr1JOTurMGLKRQo0APYlqMEuZ8PETTmHiyp3Yg2fvIqoqdNfEtzymTSM8DfnZatmgZPFbCg1f45xRycwRqyT2jx3SiaKhwb5txEjr3UZ595Ba1FUpSSusW7mdR5dQM/dAvF411wqzAp/Gikyt3D05HMWuf7P2BkbPdmm4ADjW4/8mJADFkvvlgouFdZHq5BlWQzVbPkQN/gRumuxUP6/N2MtpwBLY42d5SSDGMG0Ql2E+9szggEyDKaL+/o5KVmhD+EcmaYWBh6zdVdBn6cr9kN7k8WORN+N2nmSD9dnbsM+nqTtAlVcgSgozF7WSDky8VDdHijFIuuLzyc0I+6gMyPtWCrAB6bFK6IY4zH+NKpEvwC/Lb23Py8b36otAbCZuKSCraT/zqJlja2SOSFfN010ffNsCoqEQsK006d4KAVW1moZQ5zQGCdysGxCsqIg8s7czQb6TmL2V3hI7gigI4wwZc+RukmYblyqKHix/Jfh0p4Fw+lwYDpNYkyWOHJr8UfgYi5rSJBN++Q/h/nskEvwJbyv+YhzGEKo1akAPxqQN7ZF2kv40dC2j+NruIgpTbCdsO1FAhcgN1H6eUIx8952GZ7iSUh/+gG5ueG5n2oyp4cbU5/oQeXc4v2ulufh9QdLSSITmTMaZyb+/8Ddw3GPf8GGYv9oA+Shc2uT/8PkEcUfxZv5/0edVKjhOUAeWg1YXCzw4cxhtNm2cI0JwhkBhE77D7Kt71FLncVAU08Nhd4LkP+hQ/yx1Mb1bkMyEk4Ia+MiwC5GypkzVZWeMzLxk3rS/3geyQ1t4BVDM4IkPgtYx/eA37OVuYtNCljo3I5Glj8ScxEJIwzE7EfxUq3l9JMOAJySJNTFCAeNKZgNKv//LlYMf7alg85uiGaC3BdtiUAX2nn6FGW6TvoCBBKZB37LWA2sq4q0OJ4g6oqkE0PJIiDl4S7LW3KFWlMG2W1dzcSgNxUK2ZllfFXXEO6oWoJR3dsrQIhvGFi4z441MQcAXjcsqwd8vgaODq2IkrabL5jKPRCh4okdwHhCAhftjsYpX05W1UtjySOtWqJ79I9MiWBvDFEQZz8tcoiPkEQKpSMugPzdM/k16ssj6HJ8cwMkMHfCqUviwYgTTsqpcKWYpOTR33OwdQqGbsmQKgVz3Qsr3kgm+TOjW/9/XoLBqNHJHL0ujtH4mq5eobnh8zKYGHINpNZMiVT8IrslQJbVhbTwBbR2gaTb2KRaZi1sJ8dx2z7WduEvj7pmJcuKx2sZvho7/8tYQQQ0jMhlWyO93lsunQ9Fiq1YSvLLIfau2oEbf7ns7S+PlK2Ooz3uEZvG05I9nYMGbV3D9AA'; // app icon (assets/icons), embedded by tools/panel_icons.py
    const VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '1.0.8';
    const HOST = location.hostname;
    const PAGE = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const PURPLE = [88, 101, 242];

    /* ───────────────────────── storage ───────────────────────── */

    const clone = o => JSON.parse(JSON.stringify(o));
    const get = (k, d) => { try { const v = GM_getValue(k); return v === undefined || v === null ? clone(d) : v; } catch { return clone(d); } };
    const set = (k, v) => { try { GM_setValue(k, v); } catch {} };
    const del = k => { try { GM_deleteValue(k); } catch {} };
    const watch = (k, fn) => { try { GM_addValueChangeListener(k, (n, o, v, remote) => { if (remote) fn(v); }); } catch {} };

    // Every setting with its kind and limits: saved values are checked against these on load, so old or
    // broken data never breaks the panel.
    const B = d => ({ t: 'bool', d }), CH = (d, o) => ({ t: 'choice', d, o }), N = (d, min, max) => ({ t: 'num', d, min, max }), TX = (d, max) => ({ t: 'text', d, max });
    const SPEC = {
        enabled: B(true), log: B(false), appearance: CH('auto', ['auto', 'light', 'dark']),
        titleColor: B(true), titleTone: CH('dark', ['dark', 'vivid', 'muted']), seekColor: B(true), seekTone: CH('bright', ['bright', 'title']),
        lavaOn: B(true), followMedia: B(true), profileLava: B(true), videoLava: B(true), clearMedia: B(true), videoFps: N(15, 1, 60), videoWidth: N(128, 32, 512),
        videoCropBars: B(true), voiceLava: B(true), voiceWhere: CH('call', ['call', 'any']), serverTint: B(true),
        frost: N(0.05, 0, 0.6), blur: N(0, 0, 30), chrome: N(0.45, 0, 1), radius: N(12, 0, 28), edges: B(true), textShadow: B(true),
        clearVideo: B(true), cleanup: B(true),
        mentionGlow: B(true), mentionBlobs: B(true), mentionStrength: CH('medium', ['soft', 'medium', 'bright']), keywords: TX('', 300),
        pauseScroll: B(true), pauseUnfocused: B(true), easeCalls: B(true),
        favHover: B(true), favDrops: B(true), keepRecent: B(true), msgDrops: B(true),
        shotSafe: B(false), shotMode: CH('blur', ['blur', 'replace']), shotName: TX('User', 24), shotAvatars: B(true), shotExtra: TX('', 200),
        blurMedia: B(false), blurDMs: B(false), blurServers: B(false), blurChat: B(false),
        track: B(true), trackDays: CH('90', ['30', '90', '365']),
    };
    const DEFAULTS = Object.fromEntries(Object.entries(SPEC).map(([k, v]) => [k, v.d]));
    function valid(k, v) {
        const s = SPEC[k];
        if (s.t === 'bool') return typeof v === 'boolean' ? v : s.d;
        if (s.t === 'choice') return s.o.includes(v) ? v : s.d;
        if (s.t === 'num') return typeof v === 'number' && isFinite(v) ? Math.min(s.max, Math.max(s.min, v)) : s.d;
        return typeof v === 'string' ? v.slice(0, s.max) : s.d;
    }
    function loadSettings() {
        const saved = get('settings', {}), out = {};
        for (const k of Object.keys(SPEC)) out[k] = valid(k, saved && typeof saved === 'object' ? saved[k] : undefined);
        return out;
    }
    const S = loadSettings();

    // The lava's look lives in three profiles, each remembering its own values.
    const PROFILE_KEYS = ['bgBlur', 'bgBrightness', 'bgSaturate', 'bgScale', 'blobs', 'blobSteps', 'motionSpeed', 'motionAmount', 'randomize'];
    const PRESETS = {
        calm: { bgBlur: 0.7, bgBrightness: 0.55, bgSaturate: 1.4, bgScale: 1.2, blobs: true, blobSteps: 30, motionSpeed: 0.5, motionAmount: 0.5, randomize: true },
        user: { bgBlur: 0.5, bgBrightness: 0.65, bgSaturate: 2, bgScale: 1.2, blobs: true, blobSteps: 45, motionSpeed: 1, motionAmount: 1, randomize: true },
        crazy: { bgBlur: 0.3, bgBrightness: 0.85, bgSaturate: 3.5, bgScale: 1.35, blobs: true, blobSteps: 120, motionSpeed: 2.5, motionAmount: 2.2, randomize: true },
    };
    const PROFILE_NAMES = { calm: 'Calm', user: 'User', crazy: 'Crazy' };
    const PLIM = { bgBlur: [0, 4.5], bgBrightness: [0, 6], bgSaturate: [0, 15], bgScale: [0.1, 7.5], blobSteps: [1, 720], motionSpeed: [0.05, 12], motionAmount: [0, 9] };
    function loadLava() {
        const st = get('lava', {}), out = { profile: PRESETS[st && st.profile] ? st.profile : 'user', profiles: {} };
        for (const p of Object.keys(PRESETS)) {
            const saved = (st && st.profiles && st.profiles[p]) || {}, o = Object.assign({}, PRESETS[p]);
            for (const k of PROFILE_KEYS) {
                const v = saved[k];
                if (typeof PRESETS[p][k] === 'boolean') { if (typeof v === 'boolean') o[k] = v; }
                else if (typeof v === 'number' && isFinite(v)) o[k] = Math.min(PLIM[k][1], Math.max(PLIM[k][0], v));
            }
            out.profiles[p] = o;
        }
        return out;
    }
    let LAVA = loadLava();

    // Your own lists, each read back through a checker: a value of the wrong shape is skipped, never trusted.
    const ID = /^\d{15,22}$/, GID = /^(@me|\d{15,22})$/;
    // what an older version saved as a name when a channel had unread messages ("• Discord"): not a name
    const JUNK_NAME = /^[•·●]?\s*discord$/i;
    const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
    const HEX = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : '';
    function cleanPlace(o) {
        if (!o || typeof o !== 'object' || !GID.test(o.gid) || !ID.test(o.cid)) return null;
        const junk = JUNK_NAME.test(str(o.name, 80).trim());
        return { gid: o.gid, cid: o.cid, name: junk ? 'Channel' : str(o.name, 80) || 'Channel', server: str(o.server, 80), kind: junk && o.kind === 'thread' ? 'channel' : ['channel', 'thread', 'dm', 'voice'].includes(o.kind) ? o.kind : 'channel',
            icon: /^https:\/\/cdn\.discordapp\.com\//.test(o.icon || '') ? str(o.icon, 300) : '', note: str(o.note, 200), named: o.named === true };
    }
    function readList(k, clean, cap, src = get) {
        const v = src(k, []); const out = [], seen = new Set();
        for (const x of Array.isArray(v) ? v : []) { const c = clean(x); if (c && !seen.has(c.gid + '/' + c.cid + '/' + (c.mid || ''))) { seen.add(c.gid + '/' + c.cid + '/' + (c.mid || '')); out.push(c); } if (out.length >= cap) break; }
        return out;
    }
    const FAV_CAP = 100, RECENT_CAP = 8, SAVED_CAP = 500, REMIND_CAP = 100;
    const readFavs = (src = get) => readList('favorites', cleanPlace, FAV_CAP, src);
    const readRecent = () => readList('recent', o => { const c = cleanPlace(o); if (c) c.at = +o.at || 0; return c; }, RECENT_CAP);
    function cleanSaved(o) {
        const c = cleanPlace(o); if (!c || !ID.test(o.mid)) return null;
        return Object.assign(c, { mid: o.mid, title: str(o.title, 120) || 'Message', author: str(o.author, 60), folder: str(o.folder, 20), at: +o.at || 0 });
    }
    function readSaved(src = get) {
        const v = src('saved', {}); const folders = [];
        for (const f of (v && Array.isArray(v.folders) ? v.folders : [])) if (f && /^[a-z0-9]{1,20}$/.test(f.id) && typeof f.name === 'string' && f.name.trim() && folders.length < 30) folders.push({ id: f.id, name: f.name.trim().slice(0, 30)});
        const items = []; const seen = new Set();
        for (const x of (v && Array.isArray(v.items) ? v.items : [])) { const c = cleanSaved(x); if (c && !seen.has(c.mid)) { seen.add(c.mid); if (!folders.some(f => f.id === c.folder)) c.folder = ''; items.push(c); } if (items.length >= SAVED_CAP) break; }
        return { folders, items };
    }
    function cleanReminder(o) {
        const c = cleanSaved(o); if (!c) return null;
        const due = +o.due; if (!isFinite(due) || due <= 0) return null;
        return Object.assign(c, { id: /^[a-z0-9]{1,20}$/.test(o.id) ? o.id : 'r' + due.toString(36), due, done: o.done === true, shown: +o.shown || 0 });
    }
    const readReminders = (src = get) => { const v = src('reminders', []); const out = []; for (const x of Array.isArray(v) ? v : []) { const c = cleanReminder(x); if (c) out.push(c); if (out.length >= REMIND_CAP) break; } return out; };
    function readMap(k, cleanVal, cap, src = get) {
        const v = src(k, {}), out = {}; let n = 0;
        if (v && typeof v === 'object' && !Array.isArray(v)) for (const [id, x] of Object.entries(v)) { const c = cleanVal(x); if (GID.test(id) && c && n++ < cap) out[id] = c; }
        return out;
    }
    const readColors = (src = get) => readMap('serverColors', HEX, 200, src);
    const readNotes = (src = get) => readMap('notes', x => str(x, 200).trim(), 300, src);
    const readBlurChannels = (src = get) => { const v = src('blurChannels', []); return (Array.isArray(v) ? v : []).filter(x => ID.test(x)).slice(0, 300); };
    // names Screenshot safe found for your account (never printed or sent anywhere)
    const readFound = () => { const v = get('found', []); return (Array.isArray(v) ? v : []).filter(x => typeof x === 'string' && x.trim().length >= 2).map(x => x.slice(0, 40)).slice(0, 8); };

    const D = { favs: readFavs(), recent: readRecent(), saved: readSaved(), reminders: readReminders(), colors: readColors(), notes: readNotes(), blurCh: readBlurChannels(), found: readFound() };
    const store = {
        favs: () => set('favorites', D.favs), recent: () => set('recent', D.recent), saved: () => set('saved', D.saved), reminders: () => set('reminders', D.reminders),
        colors: () => set('serverColors', D.colors), notes: () => set('notes', D.notes), blurCh: () => set('blurChannels', D.blurCh), found: () => set('found', D.found),
    };

    const log = (...a) => { if (S.log) console.log('%c[molten]', 'color:' + APP.accent + ';font-weight:600', ...a); };

    /* ───────────────────────── Discord's page ───────────────────────── */

    // Discord's class names carry a changing suffix (chat_a7d72e), so pieces are found by the stable part.
    const C = n => `:is([class^="${n}_"],[class*=" ${n}_"])`;
    const q = (s, r = document) => { try { return r.querySelector(s); } catch { return null; } };
    const qa = (s, r = document) => { try { return [...r.querySelectorAll(s)]; } catch { return []; } };
    const visible = e => { if (!e || !e.isConnected) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight ? r : null; };
    const isHttp = s => typeof s === 'string' && /^https?:/i.test(s);
    const bigger = u => u.replace(/([?&])size=\d+/, '$1size=256');

    const DC = {
        route() {
            const m = /^\/channels\/(@me|\d{15,22})(?:\/(\d{15,22}))?(?:\/(\d{15,22}))?/.exec(location.pathname);
            return m ? { gid: m[1], cid: m[2] || '', mid: m[3] || '' } : { gid: '', cid: '', mid: '' };
        },
        // Discord titles its window "Discord | #channel | Server" (or "@friend", or a thread's own name), with
        // "• " or "(3) " in front while something's unread: neither is a name
        title() {
            const parts = document.title.split(' | ').map(s => s.trim().replace(/^\(\d+\)\s*/, '').replace(/^[•·●]\s*/, '').trim()).filter(s => s && !JUNK_NAME.test(s));
            const first = parts[0] || '', last = parts.length > 1 ? parts[parts.length - 1] : '';
            return { name: first.replace(/^[#@]/, ''), sigil: /^[#@]/.test(first) ? first[0] : '', server: last };
        },
        guildItem(gid) { return gid && gid !== '@me' ? q(`[data-list-item-id="guildsnav___${gid}"]`) : null; },
        guildIcon(gid) {
            const it = this.guildItem(gid); const img = it && q('img', it);
            const src = img && (img.currentSrc || img.src);
            return src && /cdn\.discordapp\.com\/icons\//.test(src) ? bigger(src) : '';
        },
        guildBanner(gid) {
            for (const img of qa(`img[src*="/banners/${gid}/"]`)) if (isHttp(img.src)) return img.src;
            for (const e of qa(`[style*="/banners/${gid}/"]`)) { const m = /url\("?([^")]+)/.exec(e.style.backgroundImage || ''); if (m) return m[1]; }
            return '';
        },
        guildName(gid) {
            const it = this.guildItem(gid);
            const t = it && (it.getAttribute('aria-label') || (q('[aria-label]', it) || {}).ariaLabel || '');
            return t ? t.replace(/^[^,]*mentions?, /i, '').replace(/^unread, /i, '').trim() : '';
        },
        // a server's unread state, from its button in the server list (folders hide their servers' own)
        badge(gid) {
            const it = this.guildItem(gid); if (!it) return null;
            const li = it.closest(C('listItem')) || it.parentElement;
            const num = li && q(C('numberBadge'), li), pill = li && q(`${C('pill')} span`, li);
            const h = pill ? parseFloat(pill.style.height || getComputedStyle(pill).height) || 0 : 0;
            return { mentions: num ? parseInt(num.textContent, 10) || 0 : 0, unread: h > 0 && h <= 10 };
        },
        channelLink(cid) { return q(`[data-list-item-id="channels___${cid}"]`) || q(`a[href$="/${cid}"][data-list-item-id]`); },
        linkName(a) {
            const n = a && (q(C('name'), a) || q(C('channelName'), a));
            return ((n && n.textContent) || (a && a.getAttribute('aria-label')) || '').replace(/\s*\((text|voice|announcement|forum|thread|stage)[^)]*\)\s*$/i, '').trim().slice(0, 80);
        },
        here() {
            const r = this.route(); if (!r.cid) return null;
            // the channel list on the left says it best (name and kind); then the window title, then the header
            const t = this.title(), link = this.channelLink(r.cid), lab = (link && link.getAttribute('aria-label')) || '';
            const head = this.headerTitle(), hn = head ? (head.textContent || '').trim().slice(0, 80) : '';
            const name = this.linkName(link) || t.name || hn || 'Channel';
            const kind = r.gid === '@me' ? 'dm' : /voice|stage/i.test(lab) ? 'voice' : /thread|post/i.test(lab) ? 'thread' : 'channel';
            return { gid: r.gid, cid: r.cid, name, server: r.gid === '@me' ? 'Direct messages' : (t.server || this.guildName(r.gid)), kind, icon: this.guildIcon(r.gid), note: '', named: false };
        },
        go(path) {
            try { PAGE.history.pushState({}, '', path); PAGE.dispatchEvent(new PAGE.PopStateEvent('popstate', { state: {} })); }
            catch (e) { location.assign(path); }
        },
        inVoice() { return !!(q(C('rtcConnectionStatus')) || q(`${C('panels')} ${C('connection')}`)); },
        callScreen() { const c = q(C('callContainer')); const r = visible(c); return r && r.width > 260 && r.height > 160 ? c : null; },
        speaker() {
            for (const e of qa(C('speaking'))) {
                const tile = e.closest(C('tile')) || e.parentElement || e;
                const img = q('img[src*="/avatars/"],img[src*="/guild-avatars/"]', tile);
                if (img && isHttp(img.src)) return bigger(img.src);
            }
            for (const e of qa(C('avatarSpeaking'))) {
                const img = e.tagName === 'IMG' ? e : q('img', e);
                if (img && isHttp(img.src)) return bigger(img.src);
                const m = /url\("?([^")]+)/.exec(e.style.backgroundImage || ''); if (m && isHttp(m[1])) return bigger(m[1]);
            }
            return '';
        },
        profile() {
            const pop = q(`${C('userPopoutOuter')},${C('userProfileOuter')},${C('userProfileModalOuter')},${C('userPopoutInner')}`);
            if (!visible(pop)) return '';
            for (const e of qa(`${C('banner')}`, pop)) {
                const img = e.tagName === 'IMG' ? e : q('img', e);
                if (img && isHttp(img.src) && /\/banners\//.test(img.src)) return bigger(img.src);
                const m = /url\("?([^")]+)/.exec(e.style.backgroundImage || ''); if (m && isHttp(m[1])) return bigger(m[1]);
            }
            const av = q('img[src*="/avatars/"],img[src*="/guild-avatars/"]', pop);
            return av && isHttp(av.src) ? bigger(av.src) : '';
        },
        messages() { return q('ol[data-list-id="chat-messages"]'); },
        topbar() {
            // the row with Inbox and Help, up in the corner
            const top = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top < 70; };
            const inbox = ['[aria-label="Inbox"]', '[aria-label="Help"]', 'a[href*="support.discord.com"]'].map(s => qa(s).find(top)).find(Boolean);
            if (!inbox) return null;
            let item = inbox;
            for (let i = 0; item && i < 4 && item.parentElement; i++) {
                const pd = getComputedStyle(item.parentElement).display;
                if (/flex|grid/.test(pd) && item.parentElement.children.length >= 2) break;
                item = item.parentElement;
            }
            return item && item.parentElement ? item : null;
        },
        headerTitle() {
            const h = q(`section${C('title')}`) || q('section[aria-label="Channel header"]');
            return h ? q(`h1,h2,h3,${C('titleWrapper')}`, h) : null;
        },
    };

    /* ───────────────────────── styles ───────────────────────── */

    const STYLES = [];
    function style(css, always) {
        const s = document.createElement('style');
        s.dataset.molten = '';
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
        if (!always) { STYLES.push(s); if (!S.enabled) s.media = 'not all'; }
        return s;
    }
    const stylesOn = on => { for (const s of STYLES) s.media = on ? '' : 'not all'; };
    const root = document.documentElement;
    const attr = (k, on) => root.toggleAttribute(k, !!on);

    /* ───────────────────────── lava ───────────────────────── */

    // Layers: art (two, for crossfades), a canvas for videos, streams and calls, and soft color blobs.
    style(`
@keyframes mfd-pulse{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes mfd-drift{0%{transform:translate(0,0)}25%{transform:translate(-3%,2%)}50%{transform:translate(2%,-3%)}75%{transform:translate(-2%,-2%)}100%{transform:translate(0,0)}}
@keyframes mfd-tilt{0%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}100%{transform:rotate(-4deg)}}
@keyframes mfd-blobs{0%{background-position:18% 130%,78% 140%,35% 150%,88% 115%}25%{background-position:38% 88%,38% 100%,68% 108%,48% 92%}
  50%{background-position:45% 48%,25% 62%,30% 70%,85% 55%}75%{background-position:35% 5%,70% 20%,20% 30%,75% 15%}100%{background-position:20% -25%,68% -20%,40% -15%,85% -30%}}
div.mfd-art,canvas.mfd-video{position:fixed;top:-15%;left:-15%;width:130%;height:140vh;pointer-events:none;
  filter:blur(var(--mfd-blur)) saturate(var(--mfd-sat)) brightness(var(--mfd-bright));transform:scale(var(--mfd-scale));transform-origin:center;
  animation:mfd-pulse 10s ease-in-out infinite,mfd-drift 15s ease-in-out infinite,mfd-tilt 20s ease-in-out infinite;animation-composition:add;will-change:transform}
div.mfd-art{z-index:-52;background:var(--mfd-art) center/cover no-repeat #111;opacity:0;transition:opacity .9s ease}
div.mfd-art.on{opacity:1}
canvas.mfd-video{z-index:-50;object-fit:cover;opacity:0;transition:opacity .6s ease}
canvas.mfd-video.on{opacity:1}
div.mfd-blobs{position:fixed;inset:-15%;height:140vh;z-index:-49;pointer-events:none;display:none;background-repeat:no-repeat;
  background-image:radial-gradient(circle farthest-side,#fff 0%,#fff 45%,transparent 58%),radial-gradient(circle farthest-side,#fff 0%,rgba(255,255,255,.95) 40%,transparent 54%),
    radial-gradient(circle farthest-side,#fff 0%,#fff 48%,transparent 62%),radial-gradient(circle farthest-side,rgba(255,255,255,.85) 0%,rgba(255,255,255,.95) 38%,transparent 51%);
  background-size:55% 55%,40% 40%,65% 65%,35% 35%;mix-blend-mode:soft-light;filter:blur(20px) brightness(50) saturate(150%);
  animation:mfd-blobs 90s steps(var(--mfd-steps,40)) alternate infinite;opacity:var(--mfd-fade,1);transition:opacity .35s ease}
html:not([data-mfd-on]) :is(div.mfd-art,canvas.mfd-video,div.mfd-blobs){display:none!important}
/* opened media: light glass instead of the dark backdrop, the app behind out of view, black boxes see-through */
html[data-mfd-on][data-mfd-viewer] [data-mfd-vunder]{visibility:hidden!important}
html[data-mfd-on][data-mfd-viewer] [data-mfd-vbd]{background:rgba(8,6,18,.2)!important;opacity:1!important;-webkit-backdrop-filter:blur(4px) saturate(1.3)!important;backdrop-filter:blur(4px) saturate(1.3)!important}
html[data-mfd-on][data-mfd-viewer] [data-mfd-vbd]::before,html[data-mfd-on][data-mfd-viewer] [data-mfd-vbd]::after{background:transparent!important;opacity:0!important}
html[data-mfd-on] :is([data-mfd-vclr],[data-mfd-fclr]){background:transparent!important;background-color:transparent!important}
html[data-mfd-on] div.mfd-blobs{display:block}
html[data-mfd-noblobs] div.mfd-blobs{display:none!important}
html[data-mfd-still] :is(div.mfd-art,canvas.mfd-video,div.mfd-blobs){animation-play-state:paused!important}
`);
    const lavaVars = style('');
    const artMotion = style(''), blobMotion = style('');

    // what the lava runs on right now: the chosen profile, or Calm while you're in a call or watching a stream
    let eased = false;
    const P = () => (eased && S.easeCalls ? LAVA.profiles.calm : LAVA.profiles[LAVA.profile]);
    function writeLavaVars() {
        const p = P();
        lavaVars.textContent = `:root{--mfd-blur:calc(${p.bgBlur} * 100px);--mfd-bright:${p.bgBrightness};--mfd-sat:${p.bgSaturate};--mfd-scale:${p.bgScale};--mfd-steps:${Math.max(1, Math.round(p.blobSteps))}}`;
        attr('data-mfd-noblobs', !p.blobs);
    }

    /* Random motion: its shape is rolled once (and again on Shuffle); speed and amount scale it, so moving
       those sliders changes the motion smoothly and keeps its place in the cycle. */
    const rnd = (a, b) => a + Math.random() * (b - a), r1 = n => Math.round(n * 100) / 100, sign = () => (Math.random() < 0.5 ? -1 : 1);
    const STOPS = 9;
    const motion = () => { const p = P(); return { speed: Math.max(0.05, +p.motionSpeed || 1), amount: Math.max(0, +p.motionAmount || 0) }; };
    const newArtBase = () => ({ peak: rnd(0.04, 0.12), mid: Math.random(), drift: [0, 1, 2, 3].map(() => [rnd(-1, 1), rnd(-1, 1)]), tilt: sign() * rnd(2, 6), back: rnd(0.6, 1.2), d: [rnd(8, 14), rnd(12, 20), rnd(16, 26)], ph: [Math.random(), Math.random(), Math.random()] });
    function newBlobBase() {
        const b = { speed: [0, 1, 2, 3].map(() => rnd(0.7, 1.4)), sy: [130, 140, 150, 115].map(v => v + rnd(-12, 12)), ey: [-25, -20, -15, -30].map(v => v + rnd(-10, 10)),
            x0: [0, 1, 2, 3].map(() => rnd(10, 90)), dx: [], wy: [], dur: rnd(70, 120), ph: Math.random() };
        for (let i = 0; i < STOPS; i++) { b.dx.push([0, 1, 2, 3].map(() => rnd(-28, 28))); b.wy.push([0, 1, 2, 3].map(() => rnd(-10, 10))); }
        return b;
    }
    let artBase = newArtBase(), blobBase = newBlobBase(), artRun = null, blobRun = null, kf = 0;
    function keepPhase(run, i, dur, ph) { if (!run) return -ph * dur; const el = (performance.now() - run.at) / 1000 - run.delays[i]; return -(el / run.durs[i]) * dur; }
    function artKeyframes() {
        const m = motion(), b = artBase, n = ++kf;
        const peak = 1 + b.peak * m.amount, mid = 1 + b.peak * m.amount * (0.25 + 0.75 * b.mid);
        let css = `@keyframes mfd-pulse-${n}{0%{transform:scale(1)}35%{transform:scale(${r1(mid)})}65%{transform:scale(${r1(peak)})}100%{transform:scale(1)}}`;
        css += `@keyframes mfd-drift-${n}{0%{transform:translate(0%,0%)}`;
        for (let i = 1; i <= 4; i++) css += `${i * 20}%{transform:translate(${r1(b.drift[i - 1][0] * 4 * m.amount)}%,${r1(b.drift[i - 1][1] * 4 * m.amount)}%)}`;
        css += '100%{transform:translate(0%,0%)}}';
        const a = b.tilt * m.amount;
        css += `@keyframes mfd-tilt-${n}{0%{transform:rotate(${r1(a)}deg)}50%{transform:rotate(${r1(-a * b.back)}deg)}100%{transform:rotate(${r1(a)}deg)}}`;
        const durs = b.d.map(x => x / m.speed), delays = durs.map((d, i) => keepPhase(artRun, i, d, b.ph[i]));
        artRun = { durs, delays, at: performance.now() };
        return css + `div.mfd-art,canvas.mfd-video{animation-name:mfd-pulse-${n},mfd-drift-${n},mfd-tilt-${n};animation-duration:${durs.map(x => r1(x) + 's')};animation-delay:${delays.map(x => r1(x) + 's')}}`;
    }
    function blobKeyframes() {
        const m = motion(), b = blobBase, name = 'mfd-blobs-' + (++kf), x = b.x0.slice();
        let css = `@keyframes ${name}{`;
        for (let i = 0; i < STOPS; i++) {
            const t = i / (STOPS - 1), wob = Math.sin(Math.PI * t), pos = [];
            for (let k = 0; k < 4; k++) {
                x[k] = Math.min(95, Math.max(5, x[k] + b.dx[i][k] * m.amount));
                const y = b.sy[k] + (b.ey[k] - b.sy[k]) * Math.pow(t, b.speed[k]) + b.wy[i][k] * m.amount * wob;
                pos.push(Math.round(x[k]) + '% ' + Math.round(y) + '%');
            }
            css += `${r1(t * 100)}%{background-position:${pos.join(',')}}`;
        }
        const dur = b.dur / m.speed, delay = keepPhase(blobRun, 0, dur, b.ph);
        blobRun = { durs: [dur], delays: [delay], at: performance.now() };
        return css + `}div.mfd-blobs{animation-name:${name};animation-duration:${r1(dur)}s;animation-delay:${r1(delay)}s}`;
    }
    function applyMotion() {
        const p = P();
        if (p.randomize) artMotion.textContent = artKeyframes(); else { artMotion.textContent = ''; artRun = null; }
        if (p.randomize && p.blobs) blobMotion.textContent = blobKeyframes(); else { blobMotion.textContent = ''; blobRun = null; }
    }
    function shuffle() {
        root.style.setProperty('--mfd-fade', '0');
        setTimeout(() => { artBase = newArtBase(); blobBase = newBlobBase(); artRun = blobRun = null; applyMotion(); root.style.setProperty('--mfd-fade', '1'); }, 380);
    }

    /* ---------- generated art: Discord purple, or your color for a server ---------- */
    const artCache = new Map();
    function paletteArt(rgb) {
        const key = rgb.join(',');
        if (artCache.has(key)) return artCache.get(key);
        const [h, s, l] = hsl(rgb);
        const c = document.createElement('canvas'); c.width = c.height = 400;
        const x = c.getContext('2d');
        const g = x.createLinearGradient(0, 0, 400, 400);
        g.addColorStop(0, css(fromHsl(h, Math.min(1, s * 0.9), 0.12))); g.addColorStop(1, css(fromHsl((h + 0.08) % 1, s, 0.26)));
        x.fillStyle = g; x.fillRect(0, 0, 400, 400);
        const dots = [rgb, fromHsl((h + 0.92) % 1, Math.min(1, s * 1.1), Math.max(0.45, l)), fromHsl((h + 0.12) % 1, s, 0.6), fromHsl((h + 0.85) % 1, 0.8, 0.55), fromHsl(h, s, 0.72)];
        let seed = 99; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 12; i++) {
            const col = dots[i % dots.length], cx = r() * 400, cy = r() * 400, rad = 40 + r() * 130;
            const rg = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
            rg.addColorStop(0, css(col)); rg.addColorStop(1, 'rgba(' + col.map(Math.round).join(',') + ',0)');
            x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill();
        }
        const url = c.toDataURL('image/jpeg', 0.9);
        artCache.set(key, url);
        return url;
    }

    /* ---------- where the color comes from ---------- */
    // A playing video or stream draws itself (below); otherwise the first of these that has something.
    function source() {
        const r = DC.route();
        if (viewerNow && viewerNow.media.tagName === 'IMG' && S.followMedia) { const u = viewerNow.media.currentSrc || viewerNow.media.src; if (isHttp(u)) return { kind: 'media', url: u }; }
        if (S.voiceLava) {
            const sp = (S.voiceWhere === 'any' ? DC.inVoice() : DC.callScreen()) ? DC.speaker() : '';
            if (sp) { lastSpeaker = { url: sp, at: Date.now() }; return { kind: 'voice', url: sp }; }
            if (lastSpeaker && Date.now() - lastSpeaker.at < 4000) return { kind: 'voice', url: lastSpeaker.url };
        }
        if (S.profileLava) { const u = DC.profile(); if (u) return { kind: 'profile', url: u }; }
        if (S.followMedia) { const u = centerMedia(); if (u) return { kind: 'media', url: u }; }
        if (S.serverTint && r.gid && r.gid !== '@me') {
            const mine = D.colors[r.gid];
            if (mine) return { kind: 'custom', url: paletteArt(rgbOf(mine)), color: rgbOf(mine) };
            const icon = DC.guildIcon(r.gid); if (icon) return { kind: 'icon', url: icon };
            const banner = DC.guildBanner(r.gid); if (banner) return { kind: 'banner', url: banner };
        }
        return { kind: 'discord', url: paletteArt(PURPLE), color: PURPLE };
    }
    let lastSpeaker = null;
    const SKIP_IMG = /\/(avatars|guild-avatars|embed\/avatars|emojis|stickers|icons|role-icons|banners|app-icons|clan-badges|avatar-decoration-presets)\//;
    // the picture in the chat closest to the middle of the messages, big enough to be a real image
    function centerMedia() {
        const list = DC.messages(); if (!list) return '';
        const sc = list.closest(C('scroller')) || list.parentElement;
        const box = sc ? sc.getBoundingClientRect() : { top: 0, bottom: innerHeight };
        const mid = (Math.max(0, box.top) + Math.min(innerHeight, box.bottom)) / 2;
        let best = '', bestD = Infinity;
        for (const img of qa('[id^="message-accessories-"] img', list)) {
            const src = img.currentSrc || img.src;
            if (!isHttp(src) || SKIP_IMG.test(src) || img.closest(C('reactions'))) continue;
            const rc = img.getBoundingClientRect();
            if (rc.width < 80 || rc.height < 60 || rc.bottom < box.top || rc.top > box.bottom) continue;
            const d = Math.abs((rc.top + rc.bottom) / 2 - mid);
            if (d < bestD) { best = src; bestD = d; }
        }
        return best;
    }

    /* ---------- art layers with crossfade ---------- */
    let artNow = '', artFlip = 0, artToken = 0, artKind = '';
    let lavaIn = null;   // the fullscreen box the lava moved into, if any
    const lavaHost = () => (lavaIn && lavaIn.isConnected && document.fullscreenElement === lavaIn ? lavaIn : document.body);
    function artLayers() {
        const host = lavaHost();
        const list = host ? [...host.querySelectorAll(':scope > div.mfd-art')] : [];
        while (host && list.length < 2) { const d = document.createElement('div'); d.className = 'mfd-art'; d.setAttribute('aria-hidden', 'true'); host.prepend(d); list.push(d); }
        return list;
    }
    function setArt(src) {
        artKind = src.kind;
        if (src.url === artNow) { colorFrom(src); return; }
        const token = ++artToken;
        const show = () => {
            if (token !== artToken) return;
            const layers = artLayers(); if (layers.length < 2) return;
            artFlip = 1 - artFlip;
            const next = layers[artFlip], prev = layers[1 - artFlip];
            next.style.setProperty('--mfd-art', 'url("' + src.url.replace(/"/g, '%22') + '")');
            next.classList.add('on'); prev.classList.remove('on');
            artNow = src.url;
            colorFrom(src);
            log('lava source:', src.kind);
        };
        if (src.url.startsWith('data:')) return show();
        const probe = new Image();
        probe.onload = show;
        probe.onerror = () => { if (token === artToken) setArt({ kind: 'discord', url: paletteArt(PURPLE), color: PURPLE }); };
        probe.src = src.url;
    }
    function colorFrom(src) {
        if (vs.on) return;   // a playing video keeps the colors while it plays
        if (src.kind === 'discord') TITLE.release();
        else if (src.color) TITLE.fromColor(src.color);
        else TITLE.fromUrl(src.url);
    }
    let artTimer = 0;
    function scheduleArt(delay = 350) {
        clearTimeout(artTimer);
        artTimer = setTimeout(() => { if (S.enabled && (lavaActive() || S.titleColor || S.seekColor || S.mentionGlow)) setArt(source()); }, delay);
    }

    /* ---------- videos, streams and cameras ---------- */
    const vs = { key: '', on: false, drawn: false, lastTime: -1, nextSample: 0, union: null, samples: 0, rect: null, buf: null, bctx: null, small: null, sctx: null, cropBroken: false, colorAt: 0, tainted: false };
    let vCanvas = null, lastVideo = null;
    function findVideo() {
        if (!S.videoLava) return null;
        let best = null, bestArea = 0;
        for (const v of document.getElementsByTagName('video')) {
            if (!(v.videoWidth > 16 && v.videoHeight > 16 && v.readyState >= 2)) continue;
            if ((v.paused || v.ended) && v !== lastVideo) continue;
            const r = v.getBoundingClientRect();
            const area = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
            if (area < 0.5 * r.width * r.height || area < 20000) continue;   // mostly on screen, not a thumbnail peeking in
            if (area > bestArea) { best = v; bestArea = area; }
        }
        return best;
    }
    function ensureLayers() {
        const host = lavaHost(); if (!host) return;
        artLayers();
        if (!vCanvas || !vCanvas.isConnected) {
            vCanvas = q(':scope > canvas.mfd-video', host) || document.createElement('canvas');
            vCanvas.className = 'mfd-video' + (vs.on ? ' on' : ''); vCanvas.width = 128; vCanvas.height = 72; vCanvas.setAttribute('aria-hidden', 'true');
            host.prepend(vCanvas);
        }
        if (!q(':scope > div.mfd-blobs', host)) { const d = document.createElement('div'); d.className = 'mfd-blobs'; d.setAttribute('aria-hidden', 'true'); host.prepend(d); }
    }

    /* ---------- opened media: lava around it, not black ---------- */
    // Discord's media viewer (a picture or video opened full size) puts a dark backdrop over the whole app; a
    // fullscreen video is drawn alone, on black. Both get the lava instead: in the viewer the backdrop turns to light
    // glass and the app behind it steps out of view, so the lava (in the picture's colors) shows around it; in
    // fullscreen the lava layers move into the fullscreen box and its black goes see-through.
    const big = (el, frac) => { const r = el.getBoundingClientRect(); return r.width >= innerWidth * frac && r.height >= innerHeight * frac; };
    const darkBox = el => { const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(el).backgroundColor); if (!m) return false; const a = m[1].split(',').map(Number); return (a.length < 4 || a[3] >= 0.4) && a[0] + a[1] + a[2] < 150; };
    // the dark boxes between a picture or video and the layer it sits in, sized like the screen: made see-through
    function clearAround(media, stop, attr) {
        for (let n = media; n && n !== stop.parentElement; n = n.parentElement) if (n === media ? n.tagName === 'VIDEO' : big(n, 0.8) && darkBox(n)) n.setAttribute(attr, '');
    }
    let viewerNow = null;
    // The viewer, found by what it is, not by Discord's class names (which change, and differ between pictures and
    // videos): the biggest picture or video on screen, outside the chat, big or centered (see below), with
    // a dark, empty, full-screen layer beside it on the way up (the backdrop Discord dims the app with).
    const dim = el => {
        const cs = getComputedStyle(el), m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor); if (!m) return false;
        const a = m[1].split(',').map(Number), alpha = (a.length < 4 ? 1 : a[3]) * (parseFloat(cs.opacity) || 0);
        return alpha >= 0.3 && a[0] + a[1] + a[2] < 200;
    };
    // the empty full-screen layer beside the one the media sits in (Discord's "scrim"): inside an open modal dialog
    // it counts however it's painted (the dark can sit on a ::before), outside one only if it's dark itself
    function backdropFor(best, modal) {
        const top = document.getElementById('app-mount');
        for (let n = best; n && n.parentElement && n !== top && n !== document.body; n = n.parentElement)
            for (const sib of n.parentElement.children)
                if (sib !== n && !sib.contains(best) && sib.childElementCount === 0 && !sib.textContent.trim() && big(sib, 0.9) && (modal && !modal.contains(sib) ? true : dim(sib))) return sib;
        return null;
    }
    function findViewer() {
        const vw = innerWidth, vh = innerHeight;
        // Discord's viewer first: an open modal dialog laid over the whole screen (a profile card's dialog isn't), with
        // a picture, GIF or video in it at any size from 96px (a GIF opens at its own small size)
        for (const dlg of qa('[aria-modal="true"],dialog[open]')) {
            if (!big(dlg, 0.9) && !(dlg.firstElementChild && big(dlg.firstElementChild, 0.9))) continue;
            let m = null, a = 0;
            for (const x of qa('img,video', dlg)) { const r = x.getBoundingClientRect(); if (r.width >= 96 && r.height >= 96 && r.width * r.height > a) { m = x; a = r.width * r.height; } }
            const bd = m && backdropFor(m, dlg); if (bd) return { bd, media: m };
        }
        // otherwise the biggest picture or video on screen, outside the chat, big or centered, with a dark backdrop beside it
        let best = null, area = 0;
        for (const m of document.querySelectorAll('img,video')) {
            if (m.closest('li[id^="chat-messages-"]')) continue;
            const r = m.getBoundingClientRect();
            const a = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
            if (a > area) { best = m; area = a; }
        }
        if (!best) return null;
        // big, or smaller but centered on the screen the way the viewer shows a small picture (a profile's banner isn't)
        const r = best.getBoundingClientRect(), centered = Math.abs((r.left + r.right) / 2 - vw / 2) < vw * 0.15 && Math.abs((r.top + r.bottom) / 2 - vh / 2) < vh * 0.15;
        if (area < vw * vh * (centered ? 0.04 : 0.2)) return null;
        const bd = backdropFor(best, best.closest('[aria-modal="true"],dialog[open]'));
        return bd ? { bd, media: best } : null;
    }
    function checkViewer() {
        const v = lavaActive() && S.clearMedia ? findViewer() : null;
        if (v && viewerNow && v.bd === viewerNow.bd && v.media === viewerNow.media) return;
        for (const n of qa('[data-mfd-vbd],[data-mfd-vunder],[data-mfd-vclr]')) { n.removeAttribute('data-mfd-vbd'); n.removeAttribute('data-mfd-vunder'); n.removeAttribute('data-mfd-vclr'); }
        viewerNow = v;
        document.documentElement.toggleAttribute('data-mfd-viewer', !!v);
        if (v) {
            v.bd.setAttribute('data-mfd-vbd', '');
            // everything beside the viewer, on the way up to Discord's root, steps out of view (the app behind it)
            const top = document.getElementById('app-mount');
            for (let n = v.bd; n && n !== top && n.parentElement && n !== document.body; n = n.parentElement)
                for (const sib of n.parentElement.children) if (sib !== n && !sib.contains(v.bd) && !sib.contains(v.media) && !/^(SCRIPT|STYLE|LINK)$/.test(sib.tagName)) sib.setAttribute('data-mfd-vunder', '');
            clearAround(v.media, v.bd.parentElement, 'data-mfd-vclr');   // up to the level the backdrop sits at
        }
        scheduleArt(0);
    }
    function onFullscreen() {
        const fe = document.fullscreenElement;
        const want = fe && fe !== document.documentElement && fe !== document.body && lavaActive() && S.clearMedia && fe.querySelector('video') ? fe : null;
        if (want === lavaIn) return;
        const layers = qa('div.mfd-art,canvas.mfd-video,div.mfd-blobs');
        if (lavaIn) for (const n of qa('[data-mfd-fclr]')) n.removeAttribute('data-mfd-fclr');
        lavaIn = want;
        const host = lavaHost();
        for (const n of layers.reverse()) host.prepend(n);
        if (want) { want.setAttribute('data-mfd-fclr', ''); const v = q('video', want); if (v) clearAround(v, want, 'data-mfd-fclr'); }
        vs.drawn = false;
        checkViewer();   // what's on screen changed: a viewer's marks are set again (or dropped) for it
    }
    document.addEventListener('fullscreenchange', onFullscreen);
    function removeLayers() { for (const n of qa('div.mfd-art,canvas.mfd-video,div.mfd-blobs')) n.remove(); vCanvas = null; artNow = ''; vs.drawn = false; }
    function setVideoOn(on) { if (on === vs.on) return; vs.on = on; if (vCanvas) vCanvas.classList.toggle('on', on); if (!on) { vs.colorAt = 0; scheduleArt(0); } }
    function resetCrop() { vs.union = null; vs.samples = 0; vs.rect = null; vs.nextSample = 0; }
    function sampleCrop(v) {
        const Wd = 64, Ht = Math.max(8, Math.round(Wd * v.videoHeight / v.videoWidth));
        if (!vs.small) { vs.small = document.createElement('canvas'); vs.sctx = vs.small.getContext('2d', { willReadFrequently: true }); }
        if (vs.small.width !== Wd || vs.small.height !== Ht) { vs.small.width = Wd; vs.small.height = Ht; }
        vs.sctx.drawImage(v, 0, 0, Wd, Ht);
        let d; try { d = vs.sctx.getImageData(0, 0, Wd, Ht).data; } catch (e) { vs.cropBroken = true; return; }
        const col = new Float32Array(Wd), row = new Float32Array(Ht); let total = 0;
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Wd; x++) { const i = (y * Wd + x) * 4, l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; col[x] += l / Ht; row[y] += l / Wd; total += l; }
        if (total / (Wd * Ht) < 12) return;
        const T = 18; let x0 = 0, x1 = Wd - 1, y0 = 0, y1 = Ht - 1;
        while (x0 < x1 && col[x0] <= T) x0++; while (x1 > x0 && col[x1] <= T) x1--; while (y0 < y1 && row[y0] <= T) y0++; while (y1 > y0 && row[y1] <= T) y1--;
        const u = vs.union; vs.union = u ? { x0: Math.min(u.x0, x0), x1: Math.max(u.x1, x1), y0: Math.min(u.y0, y0), y1: Math.max(u.y1, y1) } : { x0, x1, y0, y1 };
        if (++vs.samples < 3) return;
        const b = vs.union, bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
        if (bw < Wd * 0.35 || bh < Ht * 0.35 || (bw / Wd > 0.97 && bh / Ht > 0.97)) { vs.rect = null; return; }
        vs.rect = { sx: b.x0 / Wd * v.videoWidth, sy: b.y0 / Ht * v.videoHeight, sw: bw / Wd * v.videoWidth, sh: bh / Ht * v.videoHeight };
    }
    function drawVideo(v) {
        const key = (v.currentSrc || 'stream') + '|' + v.videoWidth + 'x' + v.videoHeight;
        if (key !== vs.key) { vs.key = key; resetCrop(); vs.drawn = false; vs.cropBroken = false; vs.tainted = false; }
        const now = performance.now();
        if (S.videoCropBars && !vs.cropBroken && now >= vs.nextSample) { sampleCrop(v); vs.nextSample = now + (vs.samples < 12 ? 1000 : 4000); }
        const r = (S.videoCropBars && vs.rect) || { sx: 0, sy: 0, sw: v.videoWidth, sh: v.videoHeight };
        const bw = Math.round(S.videoWidth), bh = Math.min(512, Math.max(16, Math.round(bw * r.sh / r.sw)));
        if (!vs.buf) { vs.buf = document.createElement('canvas'); vs.bctx = vs.buf.getContext('2d', { willReadFrequently: true }); }
        if (vs.buf.width !== bw || vs.buf.height !== bh) { vs.buf.width = bw; vs.buf.height = bh; }
        vs.bctx.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, bw, bh);
        if (vCanvas) { if (vCanvas.width !== bw || vCanvas.height !== bh) { vCanvas.width = bw; vCanvas.height = bh; } vCanvas.getContext('2d').drawImage(vs.buf, 0, 0); }
        vs.lastTime = v.currentTime; vs.drawn = true;
        // the video's own colors for the title bar and seek bar, every couple of seconds (when it lets us read them)
        if (!vs.tainted && now >= vs.colorAt) {
            vs.colorAt = now + 2000;
            try { const col = pickData(vs.bctx.getImageData(0, 0, bw, bh).data); if (col) TITLE.fromColor(col); } catch (e) { vs.tainted = true; }
        }
    }

    /* ---------- on/off ---------- */
    const lavaActive = () => S.enabled && S.lavaOn;
    function applyRoot() {
        attr('data-mfd-on', lavaActive());
        attr('data-mfd-glass', S.enabled);
        if (lavaActive()) ensureLayers(); else { setVideoOn(false); removeLayers(); }
    }

    /* ───────────────────────── colors ───────────────────────── */

    const css = c => 'rgb(' + c.map(Math.round).join(',') + ')';
    const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const hexOf = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    function hsl([r, g, b]) {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
        if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
        return [h, s, l];
    }
    function fromHsl(h, s, l) {
        if (!s) return [l * 255, l * 255, l * 255];
        const qq = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - qq;
        const f = t => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (qq - p) * 6 * t : t < 1 / 2 ? qq : t < 2 / 3 ? p + (qq - p) * (2 / 3 - t) * 6 : p; };
        return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
    }
    // the most colorful common color in some pixels (near-black and near-white don't count)
    function pickData(d) {
        const buckets = new Map(); let ar = 0, ag = 0, ab = 0, an = 0;
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2]; if (d[i + 3] < 128) continue;
            ar += r; ag += g; ab += b; an++;
            const [, s, l] = hsl([r, g, b]); if (l < 0.07 || l > 0.93) continue;
            const key = (r >> 5) << 6 | (g >> 5) << 3 | (b >> 5), w = 0.2 + s * s * 3, e = buckets.get(key) || [0, 0, 0, 0];
            e[0] += r * w; e[1] += g * w; e[2] += b * w; e[3] += w; buckets.set(key, e);
        }
        let best = null; for (const e of buckets.values()) if (!best || e[3] > best[3]) best = e;
        return best && best[3] > 0.5 ? [best[0] / best[3], best[1] / best[3], best[2] / best[3]] : an ? [ar / an, ag / an, ab / an] : null;
    }
    function pick(img) {
        const c = document.createElement('canvas'); c.width = c.height = 40;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, 40, 40);
        return pickData(x.getImageData(0, 0, 40, 40).data);   // throws if the picture can't be read
    }
    function loadImg(src, cors) {
        return new Promise((res, rej) => {
            const im = new Image(); if (cors) im.crossOrigin = 'anonymous';
            const t = setTimeout(() => rej(new Error('timed out')), 8000);
            im.onload = () => { clearTimeout(t); res(im); }; im.onerror = () => { clearTimeout(t); rej(new Error('could not load')); };
            im.src = src;
        });
    }
    // when Discord's image server doesn't let the page read pixels, fetch the picture through Tampermonkey
    // (Discord's own image addresses only: @connect lists them)
    function gmFetch(url) {
        return new Promise((res, rej) => {
            if (!/^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net|images-ext-[12]\.discordapp\.net)\//.test(url)) return rej(new Error('not a Discord image'));
            GM_xmlhttpRequest({ method: 'GET', url, responseType: 'blob', timeout: 8000, anonymous: true,
                onload: r => (r.status >= 200 && r.status < 300 && r.response ? res(r.response) : rej(new Error('HTTP ' + r.status))),
                onerror: () => rej(new Error('failed')), ontimeout: () => rej(new Error('timed out')) });
        });
    }
    const colorCache = new Map();
    async function colorOf(url) {
        if (colorCache.has(url)) return colorCache.get(url);
        let col = null;
        if (url.startsWith('data:')) { try { col = pick(await loadImg(url, false)); } catch (e) { col = null; } }
        else {
            try { col = pick(await loadImg(url, true)); } catch (e) {
                try { const obj = URL.createObjectURL(await gmFetch(url)); try { col = pick(await loadImg(obj, false)); } finally { URL.revokeObjectURL(obj); } }
                catch (e2) { log('art color: could not read the picture (' + (e2 && e2.message) + ')'); }
            }
        }
        colorCache.set(url, col); if (colorCache.size > 80) colorCache.delete(colorCache.keys().next().value);
        return col;
    }

    /* ───────────────────────── title bar and seek bar ───────────────────────── */

    // The title bar (installed app) and the seek bar take the lava's color. While Molten colors the title
    // bar it says so on <html data-titlebar-owner>, so Prism stands by; with nothing on screen to take a
    // color from, it lets go and Prism (or Discord's own color) comes back.
    const OWNER = 'Molten for Discord';
    const seekStyle = style('');
    const TITLE = (() => {
        let shown = null, anim = 0, source = '', col = null, seek = null, claimed = false, rewrites = [], yielded = false;
        function metas() {
            let list = qa('meta[name="theme-color"]');
            if (!list.length && document.head) { const m = document.createElement('meta'); m.name = 'theme-color'; m.dataset.mfdMade = '1'; document.head.appendChild(m); list = [m]; }
            for (const m of list) if (m.dataset.mfdOrig === undefined && !m.dataset.mfdMade) m.dataset.mfdOrig = m.getAttribute('content') || '';
            return list;
        }
        function write(c) {
            for (const m of metas()) {
                if (c) { const v = css(c); if (m.getAttribute('content') !== v) m.setAttribute('content', v); }
                else if (m.dataset.mfdMade) m.remove();
                else if (m.dataset.mfdOrig !== undefined) { m.setAttribute('content', m.dataset.mfdOrig); delete m.dataset.mfdOrig; }
            }
            shown = c;
        }
        function show(c) {
            cancelAnimationFrame(anim);
            if (!c || !shown) { write(c); return; }
            const from = shown.slice(), t0 = performance.now();
            const step = () => { const t = Math.min(1, (performance.now() - t0) / 450); write(from.map((v, i) => v + (c[i] - v) * t)); if (t < 1) anim = requestAnimationFrame(step); else anim = 0; };
            anim = requestAnimationFrame(step);
        }
        function claim(on) {
            if (on === claimed) return; claimed = on;
            if (on) root.setAttribute('data-titlebar-owner', OWNER); else if (root.getAttribute('data-titlebar-owner') === OWNER) root.removeAttribute('data-titlebar-owner');
        }
        function tone(c) {
            let [h, s, l] = hsl(c);
            if (S.titleTone === 'vivid') { s = Math.min(1, s * 1.15); l = Math.min(0.5, Math.max(0.3, l)); }
            else if (S.titleTone === 'muted') { s *= 0.4; l = Math.min(0.3, Math.max(0.16, l)); }
            else { s *= 0.85; l = Math.min(0.24, Math.max(0.12, l * 0.6)); }
            return fromHsl(h, s, l);
        }
        function bright(c) {
            const [h, s, l] = hsl(c);
            return s < 0.08 ? fromHsl(h, s, 0.8) : fromHsl(h, Math.min(1, Math.max(s, 0.55)), Math.min(0.7, Math.max(0.55, l)));
        }
        function paintSeek() {
            const c = S.enabled && S.seekColor ? (S.seekTone === 'title' ? tone(col || PURPLE) : bright(col || PURPLE)) : null;
            seek = c;
            seekStyle.textContent = c ? `${C('mediaBarProgress')}{background-color:${css(c)}!important}${C('mediaBarGrabber')}{background-color:${css(c)}!important}` : '';
            const g = bright(col || PURPLE).map(Math.round);
            root.style.setProperty('--mfd-glow', g.join(' '));
            told();
        }
        const told = () => document.dispatchEvent(new CustomEvent('mfd-colors'));
        function apply(c) {
            col = c;
            if (S.enabled && S.titleColor && !yielded) { claim(true); show(tone(c)); } else { show(null); claim(false); }
            paintSeek();
        }
        // nothing on screen to take a color from: hand the title bar back
        function release() { source = ''; col = null; show(null); claim(false); paintSeek(); }
        async function fromUrl(url) {
            source = url;
            const c = await colorOf(url);
            if (source !== url) return;   // something newer took over
            if (c) apply(c); else release();
        }
        function fromColor(c) { source = ''; apply(c); }
        // every second: put the color back if Discord rewrote the tag; if something else keeps rewriting it, stop
        // competing (two scripts taking turns is what makes a title bar flash)
        function tick() {
            if (!claimed || !shown || anim || yielded) return;
            const m = q('meta[name="theme-color"]');
            if (m && m.getAttribute('content') !== css(shown)) {
                const now = Date.now(); rewrites = rewrites.filter(t => now - t < 20000); rewrites.push(now);
                if (rewrites.length >= 3) { yielded = true; show(null); claim(false); log('title bar: another script keeps changing it, so Molten stepped back'); ui.render(); return; }
                write(shown);
            }
        }
        return { fromUrl, fromColor, release, tick, refresh: () => (col ? apply(col) : release()), paintSeek, yielded: () => yielded,
            color: () => (claimed && shown ? css(tone(col || PURPLE)) : ''), seek: () => (seek ? css(seek) : ''), owner: () => claimed };
    })();

    /* ───────────────────────── glass ───────────────────────── */

    const glassStyle = style('');
    const GLASS = (() => {
        const w = a => 'rgba(255,255,255,' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
        function write() {
            const f = S.frost, ch = S.chrome, R = S.radius + 'px';
            const frost = w(f), frostHi = w(f + 0.07), chip = w(Math.max(0.12, f + 0.1)), haze = w(ch * 0.14), menu = 'rgba(28,24,40,.42)';
            const edge = S.edges ? w(0.22 + f) : 'transparent', line = 'rgba(255,255,255,.14)';
            const G = 'html[data-mfd-glass]';
            const shadow = S.textShadow ? '0 1px 3px rgba(0,0,0,.55),0 0 1px rgba(0,0,0,.35)' : 'none';
            const bf = S.blur ? `-webkit-backdrop-filter:blur(${S.blur}px) saturate(1.3);backdrop-filter:blur(${S.blur}px) saturate(1.3);` : '';
            // Discord's color variables: backgrounds go clear or to glass, text goes white (the lava is dark
            // under the glass, in Discord's light theme as much as its dark one)
            const vars = {
                clear: ['--background-primary', '--background-tertiary', '--background-base-low', '--background-base-lowest', '--bg-base-primary', '--bg-base-tertiary',
                    '--chat-background', '--chat-background-default', '--app-frame-background', '--home-background', '--background-gradient-chat', '--background-mobile-primary'],
                haze: ['--background-secondary', '--background-secondary-alt', '--background-base-lower', '--bg-base-secondary', '--background-mobile-secondary'],
                chip: ['--channeltextarea-background', '--input-background', '--background-surface-high', '--background-surface-higher', '--background-surface-highest',
                    '--bg-surface-raised', '--deprecated-card-bg', '--deprecated-card-editable-bg', '--background-code', '--background-mod-normal', '--background-mod-subtle'],
                hi: ['--background-message-hover', '--background-modifier-hover', '--background-modifier-selected', '--background-modifier-active', '--bg-mod-faint', '--bg-mod-subtle', '--bg-mod-strong'],
                menu: ['--background-floating', '--background-nested-floating', '--bg-surface-overlay', '--modal-background', '--modal-footer-background', '--background-mod-strong'],
                text: ['--text-normal', '--text-default', '--text-primary', '--text-strong', '--header-primary', '--interactive-active', '--interactive-hover', '--white-500'],
                soft: ['--text-muted', '--text-secondary', '--text-tertiary', '--text-subtle', '--header-secondary', '--channels-default', '--channel-icon', '--interactive-normal'],
                line: ['--border-subtle', '--border-faint', '--border-normal', '--background-modifier-accent'],
                none: ['--app-frame-border'],
            };
            const val = { clear: 'transparent', haze, chip, hi: frostHi, menu, text: '#fff', soft: 'rgba(255,255,255,.72)', line, none: 'transparent' };
            const decl = Object.entries(vars).map(([k, list]) => list.map(v => v + ':' + val[k] + '!important').join(';')).join(';') + ';--interactive-muted:rgba(255,255,255,.35)!important';
            let c =
                `${G},${G} [class*="theme-"]{${decl}}` +
                `${G},${G} body{background:#000!important}` +
                `${G} body{color:#fff;text-shadow:${shadow}}` +
                `${G} body,${G} #app-mount,${G} :is(${C('bg')},${C('app')},${C('appMount')},${C('layers')},${C('base')},${C('content')},${C('page')},${C('chat')},${C('chatContent')},` +
                    `${C('container')}:has(> ${C('base')}),${C('wrapper')}:has(> ${C('scroller')}),[data-mfd-clear]){background:transparent!important;background-color:transparent!important}` +
                // the server list, channels and member list: a light haze so they read as panes
                `${G} :is(${C('guilds')},${C('sidebar')},${C('membersWrap')},${C('members')},${C('panels')},section${C('title')}){background-color:${haze}!important}` +
                // the message box, embeds and popouts: glass with a bright edge
                `${G} :is(${C('channelTextArea')} ${C('scrollableContainer')},${C('embedFull')},${C('attachment')}){background:${chip}!important;border:1px solid ${edge}!important;border-radius:${R}!important}` +
                `${G} :is([role="menu"],${C('menu')},${C('popout')},${C('userPopoutOuter')},${C('userProfileOuter')},${C('autocomplete')},${C('tooltip')},[role="dialog"]${C('root')}){` +
                    `background:${menu}!important;border:1px solid ${edge}!important;border-radius:${R}!important;-webkit-backdrop-filter:blur(26px) saturate(1.4)!important;backdrop-filter:blur(26px) saturate(1.4)!important}` +
                `${G} [class*="theme-"]${C('layer')}>${C('backdrop')}{background:rgba(0,0,0,.35)!important}` +
                `${G} :is(${C('messageListItem')}) :is([role="article"]){border-radius:${R}}` +
                `${G} [data-mfd-card]{background:${frost}!important;border:1px solid ${edge}!important;border-radius:${R}!important}` +
                `${G} :is(${C('codeContainer')},pre code,code.inline){background:rgba(0,0,0,.28)!important;border-color:${line}!important}`;
            if (S.blur) c += `${G} :is(${C('chat')},${C('sidebar')},${C('membersWrap')}){isolation:isolate;position:relative}` +
                `${G} :is(${C('chat')},${C('sidebar')},${C('membersWrap')})::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:${frost};${bf}}`;
            else c += `${G} :is(${C('chat')}){background-color:${frost}!important}`;
            if (S.clearVideo) c += `${G} :is(${C('wrapperPaused')},${C('wrapperPlaying')},${C('wrapperControlsHidden')},${C('imageWrapper')},${C('embedVideo')},${C('videoWrapper')},${C('loadingOverlay')},${C('mosaicItem')}),` +
                `${G} :is(${C('wrapper')}):has(> video),${G} video{background:transparent!important;background-color:transparent!important}`;
            glassStyle.textContent = c;
        }

        /* Leftover solid backgrounds Discord paints with fixed colors (not its variables): find big opaque
           blocks under a few sample points and clear them. Every few seconds, only while the page is visible. */
        const SKIP = 'img,video,canvas,svg,button,input,textarea,[role="menu"],[role="dialog"],[role="article"],mfd-layer,molten-for-discord-panel,#mfd-lava,.mfd-art,.mfd-blobs';
        const rgba = s => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(s); return m ? { a: m[4] === undefined ? 1 : +m[4], lum: 0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3] } : null; };
        function clean() {
            const Wd = innerWidth, Ht = innerHeight, seen = new Set();
            for (const fx of [0.03, 0.15, 0.5, 0.85, 0.97]) for (const fy of [0.08, 0.5, 0.92]) for (const e of document.elementsFromPoint(fx * Wd, fy * Ht) || []) {
                if (seen.has(e)) continue; seen.add(e);
                if (e === root || e === document.body || e.hasAttribute('data-mfd-clear') || e.hasAttribute('data-mfd-card') || e.matches(SKIP) || e.closest(SKIP)) continue;
                const r = e.getBoundingClientRect(), area = r.width * r.height;
                if (!(area >= Wd * Ht * 0.04 || (r.height >= Ht * 0.5 && r.width >= 60))) continue;
                const c = rgba(getComputedStyle(e).backgroundColor);
                if (!c || c.a < 0.85) continue;
                e.setAttribute('data-mfd-clear', '');
                log('cleared a solid background:', e.tagName.toLowerCase());
            }
        }
        function unclean() { for (const e of qa('[data-mfd-clear],[data-mfd-card]')) { e.removeAttribute('data-mfd-clear'); e.removeAttribute('data-mfd-card'); } }
        // what's on screen, for tuning the skin when Discord changes: colors and pieces only, never message
        // text, names or the ids in the address
        function report() {
            const out = ['Molten for Discord layout report', 'version ' + VERSION, 'page: ' + location.pathname.replace(/\d{15,22}/g, '…'),
                'html class: ' + root.className, ''];
            const cs = getComputedStyle(root), vars = [];
            for (let i = 0; i < cs.length; i++) { const p = cs[i]; if (p.startsWith('--') && /background|bg-|text|header|interactive|border|chat/.test(p)) vars.push(p + ': ' + cs.getPropertyValue(p).trim()); }
            out.push('Color variables (' + vars.length + '):', ...vars.slice(0, 160), '', 'Solid surfaces on screen:');
            const seen = new Set();
            for (const fx of [0.03, 0.1, 0.3, 0.5, 0.7, 0.9, 0.97]) for (const fy of [0.05, 0.3, 0.5, 0.7, 0.95]) for (const e of document.elementsFromPoint(fx * innerWidth, fy * innerHeight) || []) {
                if (seen.has(e)) continue; seen.add(e);
                const c = getComputedStyle(e).backgroundColor, a = rgba(c); if (!a || a.a < 0.4) continue;
                const r = e.getBoundingClientRect();
                out.push('  ' + e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '') + '  ' + c + '  ' + Math.round(r.width) + 'x' + Math.round(r.height));
            }
            const found = ['ol[data-list-id="chat-messages"]', '[data-list-item-id^="guildsnav___"]', '[data-list-item-id^="channels___"]', C('callContainer'), C('mediaBarProgress'), C('mentioned'), '[aria-label="Inbox"]'];
            out.push('', 'Pieces found:', ...found.map(s => '  ' + s.split(',')[0] + ': ' + qa(s).length));
            return out.join('\n');
        }
        return { write, clean, unclean, report };
    })();

    /* ───────────────────────── mentions and keywords ───────────────────────── */

    const mentionStyle = style(`
/* each mention gets its own blobs (seedBlobs): where across the box each one sits (--mbx1..4), whether it rises or sinks
   (--mby1..4 at the start, --mbz1..4 at the end, --mbm1..4 halfway), its speed and its starting point */
@keyframes mfd-mblob{0%{background-position:var(--mbx1,6%) var(--mby1,135%),var(--mbx2,24%) var(--mby2,-45%),var(--mbx3,52%) var(--mby3,150%),var(--mbx4,74%) var(--mby4,-40%)}
  50%{background-position:calc(var(--mbx1,6%) + 9%) var(--mbm1,30%),calc(var(--mbx2,24%) + 7%) var(--mbm2,85%),calc(var(--mbx3,52%) - 7%) var(--mbm3,15%),calc(var(--mbx4,74%) - 8%) var(--mbm4,70%)}
  100%{background-position:calc(var(--mbx1,6%) + 4%) var(--mbz1,-50%),calc(var(--mbx2,24%) + 4%) var(--mbz2,140%),calc(var(--mbx3,52%) + 5%) var(--mbz3,-45%),calc(var(--mbx4,74%) + 6%) var(--mbz4,135%)}}
html[data-mfd-mg] :is(${C('mentioned')},[data-mfd-kw]){background:linear-gradient(90deg,rgb(var(--mfd-glow) / calc(.24 * var(--mfd-ms))),rgb(var(--mfd-glow) / calc(.1 * var(--mfd-ms))) 55%,rgb(var(--mfd-glow) / calc(.04 * var(--mfd-ms))))!important;
  box-shadow:inset 3px 0 0 rgb(var(--mfd-glow))!important;border-radius:0 10px 10px 0;isolation:isolate}
html[data-mfd-mg] ${C('mentioned')}::before{background:rgb(var(--mfd-glow))!important;box-shadow:none!important;border-radius:0!important}
/* a mention right above or below joins the same box */
html[data-mfd-mg] li[id^="chat-messages-"]:has(:is(${C('mentioned')},[data-mfd-kw])) + li[id^="chat-messages-"] :is(${C('mentioned')},[data-mfd-kw]){border-top-right-radius:0}
html[data-mfd-mg] li[id^="chat-messages-"]:has(+ li[id^="chat-messages-"] :is(${C('mentioned')},[data-mfd-kw])) :is(${C('mentioned')},[data-mfd-kw]){border-bottom-right-radius:0}
/* lava blobs: round drops of a fixed size rising and sinking inside the box, never stretched to the message's width */
html[data-mfd-mg][data-mfd-mb] :is(${C('mentioned')},[data-mfd-kw])::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;
  background-image:radial-gradient(circle closest-side,rgb(var(--mfd-glow) / .8) 58%,transparent),radial-gradient(circle closest-side,rgb(var(--mfd-glow) / .6) 52%,transparent),
    radial-gradient(circle closest-side,rgb(var(--mfd-glow) / .72) 56%,transparent),radial-gradient(circle closest-side,rgb(255 255 255 / .22) 40%,transparent);
  background-size:58px 58px,38px 38px,48px 48px,30px 30px;background-repeat:no-repeat;filter:blur(3.5px);opacity:min(1,calc(.55 * var(--mfd-ms)));
  clip-path:inset(0 round 0 10px 10px 0);animation:mfd-mblob var(--mbd,11s) ease-in-out var(--mbo,0s) infinite alternate;
  /* at rest (reduced motion, or paused) each message's blobs sit halfway along their own paths, not all in one corner */
  background-position:calc(var(--mbx1,6%) + 9%) var(--mbm1,30%),calc(var(--mbx2,24%) + 7%) var(--mbm2,85%),calc(var(--mbx3,52%) - 7%) var(--mbm3,15%),calc(var(--mbx4,74%) - 8%) var(--mbm4,70%)}
html[data-mfd-still][data-mfd-mb] :is(${C('mentioned')},[data-mfd-kw])::after{animation-play-state:paused}
@media (prefers-reduced-motion:reduce){html[data-mfd-mb] :is(${C('mentioned')},[data-mfd-kw])::after{animation:none}}
`);
    let KW = null;
    function keywordRe() {
        const words = S.keywords.split(',').map(s => s.trim()).filter(s => s.length >= 2).slice(0, 30);
        KW = words.length ? new RegExp('(^|[^\\p{L}\\p{N}])(' + words.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=$|[^\\p{L}\\p{N}])', 'iu') : null;
    }
    function markKeywords(scope) {
        const on = S.enabled && S.mentionGlow && KW;
        for (const c of qa('[id^="message-content-"]', scope)) {
            const art = c.closest('[role="article"]'); if (!art) continue;
            art.toggleAttribute('data-mfd-kw', !!(on && KW.test(c.textContent || '')));
        }
    }
    // Each message's own blobs, picked from its id: different from its neighbours, the same every time Discord
    // redraws it (so they don't jump). Set as custom properties on the message row; the CSS above reads them.
    function seedBlobs(scope) {
        for (const li of (scope && scope.matches && scope.matches('li[id^="chat-messages-"]') ? [scope] : qa('li[id^="chat-messages-"]', scope))) {
            if (li.dataset.mfdSeed === li.id) continue;
            let n = 2166136261;   // FNV-1a of the id, then a small generator from it
            for (let i = 0; i < li.id.length; i++) n = Math.imul(n ^ li.id.charCodeAt(i), 16777619);
            const rnd = () => { n = Math.imul(n ^ (n >>> 15), 2246822507); n = Math.imul(n ^ (n >>> 13), 3266489909); return ((n ^= n >>> 16) >>> 0) / 4294967296; };
            const lane = [[1, 20], [20, 42], [40, 64], [60, 88]], st = li.style;
            for (const [i, [a, b]] of lane.sort(() => rnd() - 0.5).entries()) {
                const up = rnd() < 0.5;
                st.setProperty('--mbx' + (i + 1), Math.round(a + rnd() * (b - a)) + '%');
                st.setProperty('--mby' + (i + 1), (up ? 130 + rnd() * 25 : -35 - rnd() * 20).toFixed(0) + '%');
                st.setProperty('--mbm' + (i + 1), (10 + rnd() * 80).toFixed(0) + '%');
                st.setProperty('--mbz' + (i + 1), (up ? -35 - rnd() * 20 : 130 + rnd() * 25).toFixed(0) + '%');
            }
            st.setProperty('--mbd', (8 + rnd() * 7).toFixed(1) + 's');
            st.setProperty('--mbo', (-rnd() * 15).toFixed(1) + 's');
            li.dataset.mfdSeed = li.id;
        }
    }
    function applyMentions() {
        attr('data-mfd-mg', S.enabled && S.mentionGlow);
        attr('data-mfd-mb', S.enabled && S.mentionGlow && S.mentionBlobs);
        root.style.setProperty('--mfd-ms', { soft: 0.55, medium: 1, bright: 1.6 }[S.mentionStrength]);
        keywordRe(); markKeywords(document); if (S.enabled && S.mentionGlow && S.mentionBlobs) seedBlobs(document);
    }

    /* ───────────────────────── privacy ───────────────────────── */

    const privacyStyle = style('');
    function applyBlur() {
        const r = DC.route();
        attr('data-mfd-bm', S.enabled && S.blurMedia);
        attr('data-mfd-bd', S.enabled && S.blurDMs);
        attr('data-mfd-bs', S.enabled && S.blurServers);
        attr('data-mfd-bc', S.enabled && S.blurChat && D.blurCh.includes(r.cid));
    }
    style(`
html[data-mfd-bm] [id^="message-accessories-"] :is(img,video){filter:blur(26px) saturate(1.2);transition:filter .2s}
html[data-mfd-bm] [id^="message-accessories-"]:hover :is(img,video){filter:none}
html[data-mfd-bd] :is([data-list-item-id^="private-channels-"],${C('privateChannels')} a[href^="/channels/@me/"]):not(:hover) :is(${C('name')},${C('avatar')},${C('subText')},img){filter:blur(7px)}
html[data-mfd-bd] [data-list-item-id^="guildsnav___"][href^="/channels/@me/"]:not(:hover) img{filter:blur(6px)}
html[data-mfd-bs] [data-list-item-id^="guildsnav___"]:not([data-list-item-id="guildsnav___home"]):not([href^="/channels/@me/"]):not(:hover) :is(img,${C('acronym')},${C('childWrapper')}){filter:blur(6px)}
html[data-mfd-bc] [id^="message-content-"]{filter:blur(6px);transition:filter .2s}
html[data-mfd-bc] [role="article"]:hover [id^="message-content-"]{filter:none}
`);

    /* Screenshot safe: your own names and avatar, wherever they show. Names come from your account area
       (bottom left) plus any you add. Text is changed in place or its line blurred; nothing is logged. */
    const SHOT = (() => {
        const orig = new WeakMap(), wrote = new WeakMap(), marked = new Set();
        let re = null, uid = '';
        const active = () => S.enabled && S.shotSafe;
        function learn() {
            const panel = q(C('panels')); if (!panel) return;
            const av = q('img[src*="/avatars/"]', panel);
            const m = av && /\/avatars\/(\d{15,22})\//.exec(av.src); if (m) uid = m[1];
            const nm = q(`${C('nameTag')} ${C('title')},${C('panelTitleContainer')},${C('nameTag')}`, panel);
            const name = nm && (orig.get(nm.firstChild) || nm.textContent || '').trim();
            if (name && name.length >= 2 && !D.found.includes(name) && name !== S.shotName) { D.found = [name, ...D.found].slice(0, 8); store.found(); }
        }
        function build() {
            const names = [...D.found, ...S.shotExtra.split(',').map(s => s.trim())].filter(s => s.length >= 2);
            // whole names only: "Sam" hides Sam and Sam's, never Samsung
            re = names.length ? new RegExp('(?<![\\p{L}\\p{N}])(' + names.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}\\p{N}])', 'giu') : null;
            privacyStyle.textContent = active() ? (
                `${C('panels')} :is(${C('nameTag')},${C('avatarWrapper')},${C('panelTitleContainer')},${C('panelSubtextContainer')}){filter:blur(7px)}` +
                `${C('panels')} :is(${C('nameTag')},${C('avatarWrapper')}):hover{filter:none}` +
                '[data-mfd-priv]{filter:blur(6px);transition:filter .15s}[data-mfd-priv]:hover{filter:none}' +
                (S.shotAvatars && uid ? `img[src*="/avatars/${uid}/"],[style*="/avatars/${uid}/"]{filter:blur(8px);transition:filter .15s}img[src*="/avatars/${uid}/"]:hover,[style*="/avatars/${uid}/"]:hover{filter:none}` : '')) : '';
            OWN.refresh();
        }
        function walk(scope) {
            if (!active() || !re) return;
            const tw = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
            for (let n = tw.nextNode(); n; n = tw.nextNode()) one(n);
        }
        function one(n) {
            const p = n.parentElement; if (!p || p.closest('script,style,textarea,input,[contenteditable="true"],molten-for-discord-panel,mfd-layer')) return;
            const v = n.nodeValue; if (!v || v === wrote.get(n)) return;
            re.lastIndex = 0; if (!re.test(v)) return;
            re.lastIndex = 0;
            if (S.shotMode === 'replace') { orig.set(n, v); const nv = v.replace(re, S.shotName || 'User'); wrote.set(n, nv); n.nodeValue = nv; marked.add(n); }
            else { p.setAttribute('data-mfd-priv', ''); marked.add(p); }
        }
        function restore() {
            for (const x of marked) {
                if (x.nodeType === 3) { if (x.isConnected && orig.has(x) && x.nodeValue === wrote.get(x)) x.nodeValue = orig.get(x); }
                else x.removeAttribute('data-mfd-priv');
            }
            marked.clear();
        }
        function apply() { restore(); learn(); build(); if (active() && document.body) walk(document.body); }
        function added(nodes) {
            if (!active() || !re) return;
            for (const n of nodes) { if (n.nodeType === 3) one(n); else if (n.nodeType === 1) walk(n); }
            // Discord reuses elements (the server name at the top, a channel header): one that no longer
            // holds a hidden name comes out of the blur
            for (const x of marked) {
                if (!x.isConnected) { marked.delete(x); continue; }
                if (x.nodeType === 1) { re.lastIndex = 0; if (!re.test(x.textContent || '')) { x.removeAttribute('data-mfd-priv'); marked.delete(x); } }
            }
        }
        return { apply, added, learn, words: () => active() ? re : null };
    })();

    // Screenshot safe reaches Molten's own pieces too (this panel, the flyout, popups, the note chip): each
    // hidden name is blurred word by word, and a box holding one is blurred, until you point at it.
    const OWN = (() => {
        const roots = new Map();
        let frame = 0;
        function mark(root) {
            const re = SHOT.words();
            if (!re) { for (const e of [...root.querySelectorAll('span.pv')]) e.replaceWith(e.textContent); for (const e of root.querySelectorAll('.pv')) e.classList.remove('pv'); return; }
            const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), hits = [];
            for (let n = tw.nextNode(); n; n = tw.nextNode()) {
                const p = n.parentElement; if (!p || p.tagName === 'STYLE' || p.classList.contains('pv') || p.closest('svg')) continue;
                re.lastIndex = 0; if (re.test(n.nodeValue)) hits.push(n);
            }
            for (const n of hits) {
                const frag = document.createDocumentFragment();
                n.nodeValue.split(re).forEach((t, i) => { if (t) frag.append(i % 2 ? Object.assign(document.createElement('span'), { className: 'pv', textContent: t }) : t); });
                n.replaceWith(frag);
            }
            for (const i of root.querySelectorAll('input[type=text]')) { re.lastIndex = 0; i.classList.toggle('pv', !!i.value && re.test(i.value)); }
        }
        // each piece is watched only while Screenshot safe is on; otherwise nothing runs at all
        function sync(r) {
            let mo = roots.get(r);
            if (!(r.host && r.host.isConnected)) { if (mo) mo.disconnect(); roots.delete(r); return; }
            if (SHOT.words() && !mo) { mo = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(sweep); }); mo.observe(r, { childList: true, subtree: true, characterData: true }); roots.set(r, mo); }
            else if (!SHOT.words() && mo) { mo.disconnect(); roots.set(r, null); }
            mark(r);
        }
        function sweep() { frame = 0; for (const r of [...roots.keys()]) sync(r); }
        function watch(root) { if (!roots.has(root)) { roots.set(root, null); sync(root); } }
        return { watch, refresh: sweep };
    })();

    /* ───────────────────────── favorites, recent, saved, reminders ───────────────────────── */

    const keyOf = p => p.gid + '/' + p.cid;
    const pathOf = p => '/channels/' + p.gid + '/' + p.cid + (p.mid ? '/' + p.mid : '');
    const isFav = (gid, cid) => D.favs.some(f => f.gid === gid && f.cid === cid);
    const sigil = p => (p.kind === 'dm' ? '@' : p.kind === 'thread' ? '↳' : p.kind === 'voice' ? '♪' : '#');
    function toggleFav(p) {
        if (!p) return;
        const i = D.favs.findIndex(f => keyOf(f) === keyOf(p));
        if (i >= 0) D.favs.splice(i, 1); else if (D.favs.length < FAV_CAP) D.favs.push(cleanPlace(p));
        store.favs(); refreshAll();
    }
    function moveFav(i, to) {
        if (to < 0 || to >= D.favs.length || i === to) return;
        const [f] = D.favs.splice(i, 1); D.favs.splice(to, 0, f); store.favs(); refreshAll();
    }
    const LINK = /^https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(@me|\d{15,22})\/(\d{15,22})(?:\/(\d{15,22}))?/i;
    function parseLink(s) { const m = LINK.exec((s || '').trim()); return m ? { gid: m[1], cid: m[2], mid: m[3] || '' } : null; }
    // a place's name and server, from what Discord shows (the sidebar, the server list)
    function describe(gid, cid) {
        const r = DC.route(), here = r.cid === cid ? DC.here() : null;
        if (here) return here;
        const link = DC.channelLink(cid);
        return { gid, cid, name: DC.linkName(link) || 'Channel', server: gid === '@me' ? 'Direct messages' : DC.guildName(gid), kind: gid === '@me' ? 'dm' : 'channel', icon: DC.guildIcon(gid), note: '', named: false };
    }
    // names follow Discord's as you visit (unless you renamed it yourself)
    function refreshNames(here) {
        const ch = new Set();
        const lists = { favs: D.favs, recent: D.recent, saved: D.saved.items, reminders: D.reminders };
        for (const [s, list] of Object.entries(lists)) for (const f of list) {
            let p = keyOf(f) === keyOf(here) ? here : null;
            // a channel in the list on the left gives its name even before you open it
            if (!p && f.gid === here.gid && !f.named) { const a = DC.channelLink(f.cid), n = DC.linkName(a); if (n) p = { name: n, server: here.server, icon: here.icon, kind: /voice|stage/i.test(a.getAttribute('aria-label') || '') ? 'voice' : /thread|post/i.test(a.getAttribute('aria-label') || '') ? 'thread' : 'channel' }; }
            if (!p) continue;
            for (const k of ['server', 'icon', 'kind']) if (p[k] && f[k] !== p[k]) { f[k] = p[k]; ch.add(s); }
            if (!f.named && p.name && p.name !== 'Channel' && f.name !== p.name) { f.name = p.name; ch.add(s); }
        }
        for (const s of ch) store[s]();
        if (ch.size) refreshAll();
    }
    let lastPlace = '', recentTimer = 0;
    function visited() {
        clearTimeout(recentTimer);
        recentTimer = setTimeout(() => {
            const here = DC.here(); if (!here) return;
            refreshNames(here); ACT.seen(here);
            if (!S.keepRecent) return;
            D.recent = [Object.assign(cleanPlace(here), { at: Date.now() }), ...D.recent.filter(f => keyOf(f) !== keyOf(here))].slice(0, RECENT_CAP);
            store.recent(); if (ui.host && ui.tab === 2) ui.render();
        }, 1200);
    }

    // colors for a server: yours if you picked one, else its icon's, else Discord purple
    const iconColors = new Map();
    function serverRgb(gid, icon) {
        if (D.colors[gid]) return rgbOf(D.colors[gid]);
        if (icon && iconColors.has(icon)) return iconColors.get(icon) || PURPLE;
        if (icon && !iconColors.has(icon)) { iconColors.set(icon, null); colorOf(icon).then(c => { iconColors.set(icon, c); FLY.repaint(); ui.repaintDots(); }); }
        return PURPLE;
    }

    let uidN = 0;
    const newId = p => p + Date.now().toString(36) + (uidN++).toString(36);
    function savedFrom(li) {
        const m = /^chat-messages-(\d{15,22})-(\d{15,22})$/.exec(li.id || ''); if (!m) return null;
        const r = DC.route(), here = DC.here() || describe(r.gid, m[1]);
        let author = '';
        for (let e = li; e && !author; e = e.previousElementSibling) { const u = q(`${C('username')}`, e); if (u) author = u.textContent.trim(); }
        const text = ((q('[id^="message-content-"]', li) || {}).textContent || '').replace(/\s+/g, ' ').trim();
        const media = !!q('[id^="message-accessories-"] :is(img,video)', li);
        const title = text ? text.slice(0, 80) + (text.length > 80 ? '…' : '') : (media ? 'Image' : 'Message') + (author ? ' from ' + author : '');
        return Object.assign(cleanPlace(Object.assign({}, here, { cid: m[1] })), { mid: m[2], title, author: author.slice(0, 60), folder: '', at: Date.now() });
    }
    function saveMessage(item, folder) {
        const i = D.saved.items.findIndex(x => x.mid === item.mid);
        if (i >= 0) { D.saved.items[i].folder = folder; if (item.note) D.saved.items[i].note = item.note; } else D.saved.items.unshift(Object.assign(item, { folder }));
        D.saved.items = D.saved.items.slice(0, SAVED_CAP); store.saved(); refreshAll();
    }
    function addFolder(name) {
        name = (name || '').trim().slice(0, 30); if (!name || D.saved.folders.length >= 30) return '';
        const ex = D.saved.folders.find(f => f.name.toLowerCase() === name.toLowerCase()); if (ex) return ex.id;
        const id = newId('f').slice(0, 20); D.saved.folders.push({ id, name }); store.saved(); return id;
    }
    const folderOf = id => D.saved.folders.find(f => f.id === id) || { id: '', name: 'Unsorted' };
    // A reminder can be up to a year away: far enough for anything, and a typo in the calendar can't park one in 2099.
    const REMIND_MAX = 366 * 864e5;
    function remind(item, due) {
        due = Math.min(Date.now() + REMIND_MAX, Math.max(Date.now() + 60e3, due));
        D.reminders.push(Object.assign(cleanSaved(Object.assign({}, item, { at: item.at || Date.now() })), { id: newId('r').slice(0, 20), due, done: false, shown: 0 }));
        // over the limit, finished reminders go first (oldest first), then the one furthest away: never one that's due sooner
        D.reminders.sort((a, b) => a.due - b.due);
        while (D.reminders.length > REMIND_CAP) { const i = D.reminders.findIndex(r => r.done); D.reminders.splice(i >= 0 ? i : D.reminders.length - 1, 1); }
        store.reminders(); refreshAll();
    }
    const at9 = d => { d.setHours(9, 0, 0, 0); return +d; };
    const PRESETS_T = [
        ['20 min', () => Date.now() + 20 * 60e3],
        ['1 hour', () => Date.now() + 60 * 60e3],
        ['Tonight', () => { const d = new Date(); d.setHours(20, 0, 0, 0); if (d <= Date.now() + 10 * 60e3) d.setDate(d.getDate() + 1); return +d; }],
        ['Tomorrow', () => { const d = new Date(); d.setDate(d.getDate() + 1); return at9(d); }],
        ['Next week', () => { const d = new Date(); d.setDate(d.getDate() + 7); return at9(d); }],
    ];
    // the dial, scaled like a clock: 60 minutes or 24 hours in one turn, and 12 for days, weeks and months.
    // Days and weeks keep counting as you wind past the top; days and longer also get a time of day inside.
    const UNITS = {
        min: { label: 'Min', word: 'minute', turn: 60, major: 5, max: 60, d: 30, ms: 60e3 },
        hour: { label: 'Hours', word: 'hour', turn: 24, major: 6, max: 24, d: 2, ms: 36e5 },
        day: { label: 'Days', word: 'day', turn: 12, major: 3, max: 365, d: 1, at: true },
        week: { label: 'Weeks', word: 'week', turn: 12, major: 3, max: 52, d: 1, at: true },
        month: { label: 'Months', word: 'month', turn: 12, major: 3, max: 12, d: 1, at: true },
    };
    function dueFor(unit, n, tod) {
        const u = UNITS[unit]; if (!u.at) return Date.now() + n * u.ms;
        const d = new Date();
        if (unit === 'month') { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
        else d.setDate(d.getDate() + n * (unit === 'week' ? 7 : 1));
        d.setHours(Math.floor(tod / 60), tod % 60, 0, 0);
        return +d;
    }
    const fmtTime = t => {
        const d = new Date(t), now = new Date();
        const day = d.toDateString() === now.toDateString() ? 'Today' : d.toDateString() === new Date(Date.now() + 864e5).toDateString() ? 'Tomorrow'
            : d.toDateString() === new Date(Date.now() - 864e5).toDateString() ? 'Yesterday'
            : Math.abs(d - now) < 6 * 864e5 ? d.toLocaleDateString(undefined, { weekday: 'short' })
            : d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
        return day + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    };
    // "in 2h 15m", "in 3d", "12m ago"
    function countdown(t) {
        const ms = t - Date.now(), a = Math.abs(ms), m = Math.round(a / 60e3);
        const hh = Math.round((m % 1440) / 60), s = m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '')
            : m < 10080 ? Math.floor(m / 1440) + 'd' + (hh && hh < 24 ? ' ' + hh + 'h' : '') : m < 60 * 24 * 60 ? Math.round(m / 10080) + 'wk' : Math.round(m / 43200) + 'mo';
        return s === 'now' ? 'now' : ms > 0 ? 'in ' + s : s + ' ago';
    }

    // Reminders: due ones pop up in whichever Discord tab sees them first; ones that came due while
    // Discord was closed are gathered into one "You missed" popup the next time it opens.
    const BOOT = Date.now();
    function checkReminders() {
        if (!S.enabled) return;
        const now = Date.now(), fresh = readReminders();
        D.reminders = fresh;
        const due = fresh.filter(r => !r.done && !r.shown && r.due <= now);
        if (!due.length) return;
        for (const r of due) r.shown = now;
        store.reminders();
        const missed = due.filter(r => r.due < BOOT - 60e3), now_ = due.filter(r => r.due >= BOOT - 60e3);
        if (missed.length) POP.missed(missed);
        for (const r of now_) POP.reminder(r);
        if (ui.host && ui.tab === 2) ui.render();
    }
    function finishReminder(id, snooze) {
        const r = D.reminders.find(x => x.id === id); if (!r) return;
        if (snooze) { r.due = Date.now() + snooze; r.shown = 0; } else r.done = true;
        D.reminders = D.reminders.filter(x => !x.done || Date.now() - x.due < 7 * 864e5);
        store.reminders(); refreshAll();
    }

    /* ───────────────────────── your activity (kept in this browser, never sent anywhere) ───────────────────────── */

    // Time counts only while Discord is the window in front and you're using it (or you're in a call, or a
    // video plays), so two Discord tabs never count the same minute. One stored value per day ('act:2026-11-03'):
    // writing today never touches the rest. Every value is read back through a checker.
    const DAY_KEY = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const AKEY = k => 'act:' + k;
    const HIST = { 30: 30, 90: 90, 365: 365 };
    const PLACE_KEY = /^(home|@me\/\d{15,22}|\d{15,22}\/\d{15,22})$/;
    const newDay = () => ({ t: {}, m: {}, h: Array(24).fill(0), ss: 0, long: 0, first: null });
    function cleanDay(v) {
        if (!v || typeof v !== 'object') return null;
        const num = (x, max) => typeof x === 'number' && isFinite(x) && x > 0 ? Math.min(max, x) : 0;
        const map = (o, max) => { const out = {}; let n = 0; if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, x] of Object.entries(o)) { const c = num(x, max); if (c && PLACE_KEY.test(k) && n++ < 400) out[k] = c; } return out; };
        return { t: map(v.t, 86400), m: map(v.m, 5000), h: Array.from({ length: 24 }, (_, i) => num(Array.isArray(v.h) ? v.h[i] : 0, 3600)),
            ss: Math.round(num(v.ss, 500)), long: num(v.long, 86400), first: typeof v.first === 'number' && v.first >= 0 && v.first < 1440 ? Math.floor(v.first) : null };
    }
    const readActDays = () => { const v = get('actDays', []); return [...new Set((Array.isArray(v) ? v : []).filter(k => typeof k === 'string' && /^\d{4}-\d\d-\d\d$/.test(k)))].sort().slice(-400); };
    // what each place was called when you were last there (the dashboard can't ask Discord about a server you've left)
    function readActPlaces() {
        const v = get('actPlaces', {}), out = {};
        if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, o] of Object.entries(v)) {
            if (!PLACE_KEY.test(k) || k === 'home' || !o || typeof o !== 'object') continue;
            const junk = JUNK_NAME.test(str(o.n, 80).trim());
            out[k] = { n: junk ? '' : str(o.n, 80), s: str(o.s, 80), k: junk && o.k === 'thread' ? 'channel' : ['channel', 'thread', 'dm', 'voice'].includes(o.k) ? o.k : 'channel',
                i: /^https:\/\/cdn\.discordapp\.com\//.test(o.i || '') ? str(o.i, 300) : '', at: +o.at || 0 };
        }
        return out;
    }
    const ACT = (() => {
        const IDLE = 5 * 60e3, GAP = 10 * 60e3, STEP = 5e3, EVERY = 30e3;
        let last = 0, input = Date.now(), pend = {}, pendAt = Date.now(), meta = {}, sess = null;
        const mark = () => { input = Date.now(); };
        for (const t of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) addEventListener(t, mark, { capture: true, passive: true });
        const keyHere = () => { const r = DC.route(); return r.cid ? r.gid + '/' + r.cid : 'home'; };
        const using = () => S.enabled && S.track && !document.hidden && document.hasFocus() && (Date.now() - input < IDLE || DC.inVoice() || vs.on);
        const day = k => pend[k] || (pend[k] = newDay());
        function tick() {
            const now = Date.now();
            if (!using()) { last = 0; if (now - pendAt > EVERY) flush(); return; }
            const dt = last ? Math.min(now - last, STEP) : 0; last = now;
            const d = new Date(now), o = day(DAY_KEY(d)), p = keyHere();
            // a session: time in Discord with no break longer than 10 minutes (shared by every Discord tab)
            if (!sess || now - sess.last > GAP) {
                const sh = get('actSession', null);
                if (sh && typeof sh === 'object' && now - (+sh.last || 0) <= GAP && +sh.start <= now) sess = { start: +sh.start, last: now };
                else { sess = { start: now, last: now }; o.ss++; }
            } else sess.last = now;
            if (o.first == null) o.first = d.getHours() * 60 + d.getMinutes();
            if (dt) { o.t[p] = (o.t[p] || 0) + dt / 1000; o.h[d.getHours()] += dt / 1000; }
            o.long = Math.max(o.long, (sess.last - sess.start) / 1000);
            if (now - pendAt > EVERY) flush();
        }
        // add what this tab counted to what's stored (another tab may have counted earlier today)
        function flush(prune) {
            pendAt = Date.now();
            const keys = Object.keys(pend);
            if (sess && keys.length) set('actSession', { start: sess.start, last: sess.last });
            let days = readActDays(), grew = false;
            for (const k of keys) {
                const a = pend[k], o = cleanDay(get(AKEY(k), null)) || newDay(), r1 = x => Math.round(x * 10) / 10;
                for (const [p, v] of Object.entries(a.t)) o.t[p] = r1((o.t[p] || 0) + v);
                for (const [p, v] of Object.entries(a.m)) o.m[p] = (o.m[p] || 0) + v;
                a.h.forEach((v, i) => { o.h[i] = r1(Math.min(3600, o.h[i] + v)); });
                o.ss += a.ss; o.long = Math.round(Math.max(o.long, a.long));
                if (a.first != null) o.first = o.first == null ? a.first : Math.min(o.first, a.first);
                set(AKEY(k), o);
                if (!days.includes(k)) { days.push(k); grew = true; }
            }
            pend = {};
            if (grew || prune === true) {
                // only the history you chose is kept; older days are deleted, not just hidden
                const cut = DAY_KEY(new Date(Date.now() - (HIST[S.trackDays] - 1) * 864e5));
                for (const k of days) if (k < cut) del(AKEY(k));
                days = days.filter(k => k >= cut).sort(); set('actDays', days);
            }
            if (Object.keys(meta).length) {
                const pl = Object.assign(readActPlaces(), meta); meta = {};
                set('actPlaces', Object.fromEntries(Object.entries(pl).sort((a, b) => b[1].at - a[1].at).slice(0, 400)));
            }
            if (keys.length) { set('actStamp', Date.now()); ui.activityChanged(); }
        }
        // a message you sent (Enter in Discord's message box, not while editing an old one)
        function sent() { if (!S.enabled || !S.track) return; const o = day(DAY_KEY(new Date())), p = keyHere(); o.m[p] = (o.m[p] || 0) + 1; input = Date.now(); }
        document.addEventListener('keydown', e => {
            if (e.key !== 'Enter' || e.shiftKey || e.isComposing || !e.isTrusted) return;
            const box = e.target && e.target.closest && e.target.closest('[role="textbox"]');
            if (!box || !box.closest(C('channelTextArea')) || box.closest('li[id^="chat-messages-"]')) return;
            if (!box.textContent.trim() || visible(q(C('autocomplete')))) return;
            sent();
        }, true);
        function seen(here) { if (S.track && here && here.cid) meta[here.gid + '/' + here.cid] = { n: here.name, s: here.server, k: here.kind, i: here.icon, at: Date.now() }; }
        function clear() {
            pend = {}; meta = {}; sess = null;
            for (const k of readActDays()) del(AKEY(k));
            del('actDays'); del('actPlaces'); del('actSession'); set('actStamp', Date.now());
        }
        // the days to show: from the first one stored (up to the history you keep) to today
        function days() {
            flush();
            const now = new Date(), stored = readActDays(), todayK = DAY_KEY(now);
            const first = stored[0] && stored[0] < todayK ? stored[0] : todayK;
            const since = Math.round((new Date(todayK + 'T12:00:00') - new Date(first + 'T12:00:00')) / 864e5) + 1;
            const n = Math.max(1, Math.min(since, HIST[S.trackDays])), out = [];
            for (let i = n - 1; i >= 0; i--) { const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 12); const k = DAY_KEY(dt); out.push({ k, dt, o: cleanDay(get(AKEY(k), null)) || newDay() }); }
            return out;
        }
        addEventListener('pagehide', flush); addEventListener('blur', flush);
        document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
        return { tick, flush, seen, clear, days };
    })();

    /* ───────────────────────── your data: export and import ───────────────────────── */

    function download(name, text, type) {
        const url = URL.createObjectURL(new Blob([text], { type }));
        const a = document.createElement('a'); a.href = url; a.download = name; a.style.display = 'none';
        (document.body || document.documentElement).append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    // your activity, one row per day and place: what the Activity tab shows, for a spreadsheet
    function exportActivity() {
        ACT.flush();
        const places = readActPlaces(), rows = [['date', 'type', 'server', 'channel', 'seconds', 'messages_sent']];
        for (const k of readActDays()) {
            const o = cleanDay(get(AKEY(k), null)); if (!o) continue;
            for (const p of [...new Set([...Object.keys(o.t), ...Object.keys(o.m)])].sort()) {
                const m = places[p] || {}, dm = p.startsWith('@me/');
                rows.push([k, p === 'home' ? 'home' : dm ? 'dm' : m.k || 'channel', p === 'home' ? '' : dm ? 'Direct messages' : m.s || '',
                    p === 'home' ? 'Home' : m.n || 'Unknown (' + p.split('/')[1] + ')', Math.round(o.t[p] || 0), o.m[p] || 0]);
            }
        }
        // a name a spreadsheet would run as a formula (=, +, -, @, or a tab or return first) gets an apostrophe in front,
        // which spreadsheets show as plain text; quotes only keep commas and line breaks inside one cell
        const cell = x => { let t = String(x); if (typeof x === 'string' && /^[\s]*[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
        download('molten-for-discord-activity-' + DAY_KEY(new Date()) + '.csv', rows.map(r => r.map(cell).join(',')).join('\n'), 'text/csv');
    }
    // everything you made here except your activity (that's the CSV) and the names Screenshot safe hides:
    // they stay out, so a backup you pass around can't show what Screenshot safe is there to hide
    const PRIVATE_SETTINGS = ['shotName', 'shotExtra'];
    // the names Screenshot safe hides (the ones it found for your account and the ones you added), wherever
    // they turn up in what's exported: a saved message's author, its preview, a note
    function scrubNames(v) {
        const names = [...D.found, ...S.shotExtra.split(',')].map(x => x.trim()).filter(x => x.length >= 2);
        if (!names.length) return v;
        const re = new RegExp(names.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
        const walk = x => typeof x === 'string' ? x.replace(re, 'User') : Array.isArray(x) ? x.map(walk) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)])) : x;
        return walk(v);
    }
    function exportData() {
        const settings = Object.assign({}, S); for (const k of PRIVATE_SETTINGS) delete settings[k];
        download('molten-for-discord-data.json', JSON.stringify({ 'molten-for-discord': VERSION, exported: new Date().toISOString(), settings, lava: clone(LAVA),
            favorites: D.favs, saved: scrubNames(D.saved), reminders: scrubNames(D.reminders), notes: scrubNames(D.notes), serverColors: D.colors, blurChannels: D.blurCh }, null, 2), 'application/json');
    }
    // An imported file is read as untrusted: every part goes through the same checks as what's stored here,
    // nothing over IMPORT_MAX bytes is read at all, and the lists are added to what you have (nothing is
    // removed): favorites, saved messages and reminders you already have stay as they are.
    const IMPORT_MAX = 1024 * 1024;
    function importData(done) {
        const pick = document.createElement('input'); pick.type = 'file'; pick.accept = '.json,application/json'; pick.style.display = 'none';
        pick.onchange = () => {
            const f = pick.files && pick.files[0]; pick.remove(); if (!f) return;
            if (f.size > IMPORT_MAX) return done('That file is too big to be a Molten for Discord backup.');
            f.text().then(text => {
                let o; try { o = JSON.parse(text); } catch (e) { return done('That file isn\'t a Molten for Discord backup.'); }
                if (!o || typeof o !== 'object' || Array.isArray(o) || !('molten-for-discord' in o)) return done('That file isn\'t a Molten for Discord backup.');
                const src = (k, d) => (k in o ? o[k] : d), got = [];
                // settings: only the ones Molten has, each the right kind and in range; never the hidden names
                if (o.settings && typeof o.settings === 'object' && !Array.isArray(o.settings)) {
                    const patch = {};   // a value of the wrong kind is skipped, so yours stays (a number out of range is pulled into range)
                    for (const k of Object.keys(SPEC)) { const v = o.settings[k]; if (k in o.settings && !PRIVATE_SETTINGS.includes(k) && (valid(k, v) === v || (SPEC[k].t === 'num' && typeof v === 'number' && isFinite(v)))) patch[k] = v; }
                    if (Object.keys(patch).length) { save(patch); got.push('settings'); }
                }
                if (o.lava && typeof o.lava === 'object' && !Array.isArray(o.lava)) { set('lava', o.lava); LAVA = loadLava(); set('lava', clone(LAVA)); lavaLive('profile'); got.push('lava looks'); }   // loadLava checks every value
                const add = (have, more, key, cap) => { const ids = new Set(have.map(key)); let n = 0; for (const x of more) if (!ids.has(key(x)) && have.length < cap) { have.push(x); ids.add(key(x)); n++; } return n; };
                const nf = add(D.favs, readFavs(src), x => x.gid + '/' + x.cid, FAV_CAP);
                const sv = readSaved(src);
                for (const fo of sv.folders) if (!D.saved.folders.some(x => x.id === fo.id) && D.saved.folders.length < 30) D.saved.folders.push(fo);
                const ns = add(D.saved.items, sv.items, x => x.mid, SAVED_CAP);
                const nr = add(D.reminders, readReminders(src), x => x.id, REMIND_CAP);
                for (const [m, more] of [[D.notes, readNotes(src)], [D.colors, readColors(src)]]) for (const [k, v] of Object.entries(more)) if (!(k in m)) m[k] = v;
                for (const c of readBlurChannels(src)) if (!D.blurCh.includes(c) && D.blurCh.length < 300) D.blurCh.push(c);
                store.favs(); store.saved(); store.reminders(); store.notes(); store.colors(); store.blurCh(); refreshAll();
                const n = (x, one, many) => x + ' ' + (x === 1 ? one : many);
                done('Imported ' + [...got, n(nf, 'favorite', 'favorites'), n(ns, 'saved message', 'saved messages'), n(nr, 'reminder', 'reminders')].join(', ') + '. What you already had is kept.');
            }, () => done('Couldn\'t read that file.'));
        };
        (document.body || document.documentElement).append(pick); pick.click();
    }

    // Pack circles (biggest first) as tightly as they go around the first: each next one takes the spot
    // nearest the middle where it touches two that are already placed. Wider than tall, to fit the card.
    function packCircles(rs, gap) {
        const out = [];
        const fits = c => out.every(o => Math.hypot(o.x - c.x, o.y - c.y) >= o.r + c.r + gap - 1e-6);
        for (const r of rs) {
            if (!out.length) { out.push({ x: 0, y: 0, r }); continue; }
            if (out.length === 1) { out.push({ x: out[0].r + r + gap, y: 0, r }); continue; }
            let best = null;
            for (let a = 0; a < out.length; a++) for (let b = a + 1; b < out.length; b++) {
                const A = out[a], B = out[b], ra = A.r + r + gap, rb = B.r + r + gap, dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
                if (d > ra + rb || d < Math.abs(ra - rb) || !d) continue;
                const l = (ra * ra - rb * rb + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, ra * ra - l * l));
                const mx = A.x + l * dx / d, my = A.y + l * dy / d;
                for (const sgn of [1, -1]) {
                    const c = { x: mx - sgn * hh * dy / d, y: my + sgn * hh * dx / d, r };
                    const score = Math.hypot(c.x / 1.45, c.y);
                    if ((!best || score < best.score) && fits(c)) best = Object.assign(c, { score });
                }
            }
            out.push(best || { x: Math.max(...out.map(o => o.x + o.r)) + r + gap, y: 0, r });
        }
        return out;
    }

    // the dashboard's numbers, in Hourglass's shape: finished days only for the range, today on its own
    const fmtDur = sec => { const m = Math.round((sec || 0) / 60); if (m < 1) return sec > 0 ? '<1m' : '0m'; const hh = Math.floor(m / 60), r = m % 60; return hh ? (r ? hh + 'h ' + r + 'm' : hh + 'h') : r + 'm'; };
    const hourName = n => (n % 12 || 12) + (n < 12 ? ' AM' : ' PM');
    const sumOf = a => a.reduce((x, y) => x + y, 0);
    const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dow = d => (d.getDay() + 6) % 7;
    const dayTot = o => sumOf(Object.values(o.t)), dayMsgs = o => sumOf(Object.values(o.m));
    const shortDate = dt => dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    function actData(range) {
        const now = new Date(), all = ACT.days(), today = all[all.length - 1], past = all.slice(0, -1);
        const R = range === 'month' ? 28 : 7, full = past.length >= R;
        const win = past.slice(-R), base = past.slice(0, Math.max(0, past.length - R));
        const period = full ? (range === 'month' ? 'the past 4 weeks' : 'the past 7 days') : win.length === 1 ? 'your first day' : 'your first ' + win.length + ' days';
        const inP = win.length === 1 ? 'on your first day' : 'in ' + period;
        const mean = a => a.length ? sumOf(a) / a.length : 0;
        const enough = base.length >= 7, need = Math.max(0, R + 7 - past.length);
        const opened = x => dayTot(x.o) >= 60 || dayMsgs(x.o) > 0;

        // today against the usual for this weekday (every stored one), up to this time of day
        const H = now.getHours(), frac = now.getMinutes() / 60, t = dow(now);
        const soFar = o => { let v = 0; for (let i = 0; i < H; i++) v += o.h[i]; return v + o.h[H] * frac; };
        const same = past.filter(x => dow(x.dt) === t), uset = same.length >= 2 ? same : past;
        const usual = uset.length ? { kind: same.length >= 2 ? WEEKDAYS[t] : 'day', now: mean(uset.map(x => soFar(x.o))), day: mean(uset.map(x => dayTot(x.o))) } : null;

        // where: a bubble per server (each DM is its own), named from what you saw when you were there
        const names = readActPlaces();
        const groupOf = k => k === 'home' ? 'home' : k.startsWith('@me/') ? k : k.split('/')[0];
        const group = (list, pick, by = groupOf) => { const g = {}; for (const x of list) for (const [k, v] of Object.entries(pick(x.o))) { const id = by(k), e = g[id] || (g[id] = { id, v: 0, ch: {} }); e.v += v; e.ch[k] = (e.ch[k] || 0) + v; } return g; };
        function about(e, channel) {
            if (e.id === 'home') return { name: 'Home', sub: 'friends and your DM list', go: '/channels/@me', icon: '', dm: false };
            const top = Object.entries(e.ch).sort((a, b) => b[1] - a[1])[0][0], m = names[top] || {}, [gid, cid] = top.split('/');
            if (gid === '@me') return { name: m.n || 'A direct message', sub: 'direct message', go: '/channels/@me/' + cid, icon: m.i || '', dm: true };
            // the server's name and icon from whichever of its channels you saw last
            let lm = m; for (const [k, x] of Object.entries(names)) if (k.startsWith(gid + '/') && x.at > (lm.at || 0)) lm = x;
            if (channel) return { name: sigil({ kind: m.k || 'channel' }) + (m.n || 'a channel'), sub: 'in ' + (lm.s || DC.guildName(gid) || 'a server'), go: '/channels/' + gid + '/' + cid, icon: lm.i || DC.guildIcon(gid) || '', dm: false, letter: (m.n || '#')[0] };
            return { name: lm.s || DC.guildName(gid) || 'A server', sub: 'mostly ' + sigil({ kind: m.k || 'channel' }) + (m.n || 'one channel'), go: '/channels/' + gid + '/' + cid, icon: lm.i || DC.guildIcon(gid) || '', dm: false };
        }
        const bubbleDays = win.some(x => dayTot(x.o) > 0) ? win : [today];
        // what the bubbles can show: time or messages by server, time with each person, time by channel
        const ranked = (g, min, keep, channel) => Object.values(g).filter(e => e.v >= min && (!keep || keep(e))).sort((a, b) => b.v - a.v).map(e => Object.assign(e, about(e, channel)));
        const lists = {
            time: ranked(group(bubbleDays, o => o.t), 30),
            msgs: ranked(group(bubbleDays, o => o.m), 1),
            people: ranked(group(bubbleDays, o => o.t), 30, e => e.id.startsWith('@me/')),
            channels: ranked(group(bubbleDays, o => o.t, k => k), 30, e => e.id !== 'home', true),
        };
        const where = lists.time, whereTot = sumOf(where.map(e => e.v));

        // how much: the daily average in the range, against everything before it
        const avgNow = mean(win.map(x => dayTot(x.o))), avgWas = enough ? mean(base.map(x => dayTot(x.o))) : null;
        const msgNow = mean(win.map(x => dayMsgs(x.o))), msgWas = enough ? mean(base.map(x => dayMsgs(x.o))) : null;
        const talk = Object.values(group(win, o => o.m)).sort((a, b) => b.v - a.v).map(e => Object.assign(e, about(e)))[0] || null;

        // what changed: each place's daily average in the range against everything before it
        const gNow = group(win, o => o.t), gWas = group(base, o => o.t);
        const ids = new Set([...Object.keys(gNow), ...Object.keys(gWas)]);
        const moved = enough ? [...ids].map(id => { const e = gNow[id] || gWas[id], v = (gNow[id] ? gNow[id].v : 0) / win.length, was = (gWas[id] ? gWas[id].v : 0) / base.length;
            return Object.assign({ id, now: v, was, d: v - was, spark: win.map(x => sumOf(Object.entries(x.o.t).filter(([k]) => groupOf(k) === id).map(([, s]) => s))) }, about(e)); })
            .filter(s => Math.abs(s.d) >= 300).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 5) : [];

        // when: the average for each weekday and hour in the range, and where the day's weight sits
        const grid = [0, 1, 2, 3, 4, 5, 6].map(d => { const ds = win.filter(x => dow(x.dt) === d); return Array.from({ length: 24 }, (_, i) => mean(ds.map(x => x.o.h[i]))); });
        const hrs = Array.from({ length: 24 }, (_, i) => sumOf(win.map(x => x.o.h[i]))), hTot = sumOf(hrs);
        let peak = 0; for (let i = 1; i <= 21; i++) if (hrs[i] + hrs[i + 1] + hrs[i + 2] > hrs[peak] + hrs[peak + 1] + hrs[peak + 2]) peak = i;
        const peakShare = hTot ? (hrs[peak] + hrs[peak + 1] + hrs[peak + 2]) / hTot : 0;
        const center = list => { let w = 0, s = 0; for (const x of list) for (let i = 0; i < 24; i++) { const v = x.o.h[i]; s += v * (i < 5 ? i + 24.5 : i + .5); w += v; } return w ? s / w : null; };
        const cNow = center(win), cWas = enough ? center(base) : null;

        // how often: five whole weeks (Sunday first), and runs of days you opened Discord
        const byKey = Object.fromEntries(all.map(x => [x.k, x])), ws = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay(), 12);
        const cal = Array.from({ length: 35 }, (_, i) => { const dt = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i - 28, 12), k = DAY_KEY(dt), x = byKey[k];
            return { dt, k, v: x ? dayTot(x.o) : 0, on: !!x && opened(x), counted: !!x && (x !== today || opened(x)), today: x === today, future: dt > now && x !== today }; });
        const calDays = cal.filter(c => c.counted && !c.future), calOn = calDays.filter(c => c.on).length;
        let run = 0; for (let i = all.length - 1; i >= 0; i--) { if (opened(all[i])) run++; else if (all[i] !== today) break; }
        let best = 0, r = 0; for (const x of all) { if (opened(x)) { r++; best = Math.max(best, r); } else if (x !== today) r = 0; }

        // records: finished days only, so none of them is today's number
        const top = f => past.reduce((b, x) => f(x.o) > (b ? f(b.o) : 0) ? x : b, null);
        const rec = { day: top(dayTot), msgs: top(dayMsgs), long: top(o => o.long) };

        return { now, t, today, R, full, win, base, period, inP, enough, need, usual, todayTot: dayTot(today.o), todayMsgs: dayMsgs(today.o), where, whereTot, lists, firstDay: bubbleDays[0] === today,
            avgNow, avgWas, msgNow, msgWas, talk, moved, grid, hTot, peak, peakShare, cNow, cWas, cal, calDays, calOn, run, best, rec, hasHistory: past.length > 0 };
    }

    /* ───────────────────────── our own layer: lava button, flyout, drops, popups ───────────────────────── */

    const dark = () => S.appearance === 'dark' || (S.appearance === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    const SVGNS = 'http://www.w3.org/2000/svg';
    function lavaIcon(size) {
        const s = document.createElementNS(SVGNS, 'svg');
        for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true' })) s.setAttribute(k, v);
        for (const c of [[9, 15, 5], [15.5, 8.5, 3.2], [16.5, 17, 2]]) { const e = document.createElementNS(SVGNS, 'circle'); e.setAttribute('cx', c[0]); e.setAttribute('cy', c[1]); e.setAttribute('r', c[2]); e.setAttribute('fill', 'currentColor'); s.append(e); }
        return s;
    }
    style(`
#mfd-lava{position:relative;flex:none;display:grid;place-items:center;width:32px;height:32px;margin:0 2px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--interactive-normal,#b5bac1);cursor:pointer;opacity:.85;transition:background .15s,color .15s,opacity .15s}
#mfd-lava:hover,#mfd-lava.open{background:rgba(128,128,128,.2);opacity:1;color:var(--interactive-hover,#fff)}
#mfd-lava.lava-on{opacity:1;color:#5865f2}
#mfd-lava.off{opacity:.35;filter:none}
#mfd-lava.float{position:fixed;top:8px;right:120px;z-index:2147483000;background:rgba(22,22,28,.6)}
`, true);
    function ensureButton() {
        let b = document.getElementById('mfd-lava');
        if (!b) {
            b = document.createElement('button'); b.id = 'mfd-lava'; b.type = 'button'; b.setAttribute('aria-label', 'Molten for Discord');
            b.append(lavaIcon(20));
            b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); FLY.close(true); ui.toggle(); });
            b.addEventListener('mouseenter', () => FLY.hover(true)); b.addEventListener('mouseleave', () => FLY.hover(false));
        }
        const anchor = DC.topbar();
        if (anchor) { if (b.nextElementSibling !== anchor || b.parentElement !== anchor.parentElement) anchor.parentElement.insertBefore(b, anchor); }
        else if (document.body && b.parentElement !== document.body) document.body.append(b);   // no top bar found: float in the corner
        b.classList.toggle('float', !anchor);
        b.classList.toggle('lava-on', lavaActive()); b.classList.toggle('off', !S.enabled); b.classList.toggle('open', !!ui.host);
        b.title = S.enabled ? 'Molten for Discord' : 'Molten for Discord is off (click to turn it back on)';
        return b;
    }

    // Everything Molten draws outside the panel lives in one shadow root, on the same glass as the panel.
    // The reminder picker shows up in both the panel and the message menu, so its look is shared.
    const PICKER_CSS = `
.rp{display:grid;gap:10px}
.rp-pre{display:flex;flex-wrap:wrap;gap:6px}
.lp{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:10px;padding:6px 12px;background:var(--ctl);color:var(--text);font:inherit;font-size:12px;font-weight:550;cursor:pointer;transition:background .15s,color .15s}
.lp:hover{background:var(--ctl-hi)}
.lp.on,.lp.saved{background:var(--a);color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.14),0 0 14px -4px rgba(var(--a-rgb),.8)}
.lp:focus-visible{outline:2px solid var(--a);outline-offset:2px}
.rp-fine{display:grid;gap:8px;padding:10px;border-radius:12px;background:var(--ctl)}
.rp-units{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2px;padding:2px;border-radius:10px;background:var(--ctl)}
.rp-units button{border:0;border-radius:8px;padding:5px 2px;background:none;color:var(--sub);font:inherit;font-size:11.5px;font-weight:550;cursor:pointer}
.rp-units button.on{background:var(--a);color:#fff;box-shadow:0 0 12px -4px rgba(var(--a-rgb),.9)}
.rp-units button:focus-visible{outline:2px solid var(--a);outline-offset:1px}
.dial{position:relative;width:180px;height:180px;margin:2px auto 0;touch-action:none}
.dial-svg{display:block;width:100%;height:100%;cursor:grab}
.dial.turning .dial-svg{cursor:grabbing}
.dial .tick{stroke:var(--sub);stroke-width:1.2;stroke-linecap:round;opacity:.45}
.dial .tick.big{stroke-width:2;opacity:.75}
.dial .lap{fill:none;opacity:.45}
.dial .dknob.over{filter:drop-shadow(-2px 0 3px rgba(0,0,0,.55))}
.dial .track{fill:none;stroke:var(--ctl-hi)}
.dial .arc{fill:none;stroke-linecap:round;filter:drop-shadow(0 0 5px rgba(var(--a-rgb),.55));transition:stroke-dasharray .12s ease-out}
.dial.turning .arc{transition:none}
.dial .dknob{fill:#fff;stroke:rgba(0,0,0,.18);stroke-width:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))}
.dial .dring{outline:none}
.dial .dring:focus-visible .track{stroke:rgba(var(--a-rgb),.45)}
.dial-mid{position:absolute;inset:0;display:grid;place-content:center;text-align:center;pointer-events:none;line-height:1.2}
.dial-mid b{font-size:16px;font-weight:700}
.dial-mid span{font-size:11.5px;color:var(--sub)}
.rp-cal{display:grid;gap:5px;font-size:11.5px;color:var(--sub)}
.rp-when{width:100%;height:30px;padding:0 6px;border-radius:8px;border:1px solid var(--line);background:var(--field);color:var(--text);font:inherit;font-size:12px;color-scheme:light}
[data-theme=dark] .rp-when{color-scheme:dark}
.rp.exact .rp-when{border-color:var(--a);box-shadow:0 0 0 1px var(--a)}
.rp-when:focus-visible{outline:2px solid var(--a);outline-offset:2px}
.rp-out{font-size:12.5px;font-weight:600;color:var(--ink);text-align:center}
.rp-set{border:0;border-radius:10px;padding:8px 10px;background:var(--a);color:#fff;font:inherit;font-size:12.5px;font-weight:650;cursor:pointer;box-shadow:0 0 16px -6px rgba(var(--a-rgb),.9)}
.rp-set:hover{filter:brightness(1.1)}
.rp-set:focus-visible{outline:2px solid var(--a);outline-offset:2px}
`;
    const LAYER_CSS = `
.pv{display:inline-block;filter:blur(5px);transition:filter .15s}
.pv:hover,input.pv:focus{filter:none}
:host{all:initial}
*{box-sizing:border-box;margin:0}
[hidden]{display:none!important}
.v{--a:${APP.accent};--a-rgb:${APP.rgb};--ink:${APP.ink};--glass:rgba(255,255,255,.84);--text:#1d1d1f;--sub:rgba(29,29,31,.64);--edge:rgba(255,255,255,.8);--hl:#fff;--drop:rgba(0,0,0,.34);
  --ctl:rgba(0,0,0,.055);--ctl-hi:rgba(0,0,0,.1);--line:rgba(0,0,0,.07);--field:rgba(255,255,255,.6);
  font:13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI Variable Text","Segoe UI",Inter,system-ui,sans-serif;color:var(--text);text-align:left;white-space:normal}
.v[data-theme=dark]{--glass:rgba(22,22,28,.8);--text:#f2f2f5;--sub:rgba(235,235,245,.62);--edge:rgba(255,255,255,.12);--hl:rgba(255,255,255,.1);--drop:rgba(0,0,0,.6);
  --ctl:rgba(255,255,255,.08);--ctl-hi:rgba(255,255,255,.14);--line:rgba(255,255,255,.09);--field:rgba(255,255,255,.06);--ink:${APP.inkDark}}
.glass{position:fixed;z-index:2147483600;border-radius:16px;background:radial-gradient(120% 40% at 0% 0%,rgba(var(--a-rgb),.18),transparent 70%),var(--glass);
  -webkit-backdrop-filter:blur(28px) saturate(170%);backdrop-filter:blur(28px) saturate(170%);border:1px solid var(--edge);
  box-shadow:0 0 0 .5px rgba(var(--a-rgb),.4),0 22px 50px -16px var(--drop),inset 0 1px 0 var(--hl)}
button{font:inherit;color:inherit;cursor:pointer}
.lbl{display:flex;align-items:center;gap:7px;font:600 10.5px/1 "SF Mono",ui-monospace,"Cascadia Code",Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--ink)}
.lbl::before{content:"";width:5px;height:5px;transform:rotate(45deg);background:var(--ink);box-shadow:0 0 6px rgba(var(--a-rgb),.9)}
.btn{border:0;border-radius:8px;padding:7px 10px;background:var(--ctl);font-size:12px;font-weight:500;text-align:center}
.btn:hover{background:var(--ctl-hi)}
.btn.primary{background:var(--a);color:#fff;font-weight:600}
.btns{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:6px}
.btn:focus-visible,.row:focus-visible,.more:focus-visible{outline:2px solid var(--a);outline-offset:2px}
/* lava: a drop that falls, a bubble that pops, droplets that sputter, and glass that erupts out of it */
.drop{position:fixed;z-index:2147483601;width:18px;height:18px;border-radius:50% 50% 50% 50%/58% 58% 42% 42%;pointer-events:none;
  background:radial-gradient(circle at 34% 28%,rgba(255,255,255,.85),transparent 34%),radial-gradient(circle at 50% 60%,var(--c1),var(--c2));
  box-shadow:0 0 14px 2px var(--c1);animation:drip .3s cubic-bezier(.55,0,.7,.2) forwards}
@keyframes drip{0%{transform:translate(-50%,-18px) scale(.35,.35)}40%{transform:translate(-50%,-4px) scale(.75,1.55)}70%{transform:translate(-50%,6px) scale(1.25,.8)}100%{transform:translate(-50%,10px) scale(1.6,.9);opacity:0}}
.bub{position:fixed;z-index:2147483602;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle at 34% 30%,rgba(255,255,255,.9),transparent 30%),radial-gradient(circle,var(--c1),var(--c2));box-shadow:0 0 18px 4px var(--c1);animation:pop .3s cubic-bezier(.3,.6,.4,1) forwards}
@keyframes pop{0%{transform:scale(.25)}55%{transform:scale(1.15,.95)}75%{transform:scale(1.35);opacity:1}100%{transform:scale(1.9);opacity:0}}
.ring{position:fixed;z-index:2147483602;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;pointer-events:none;border:2px solid var(--c1);animation:ring .42s .14s ease-out both}
@keyframes ring{from{transform:scale(.6);opacity:.9}to{transform:scale(3);opacity:0}}
.spit{position:fixed;z-index:2147483602;width:var(--s);height:var(--s);margin:calc(var(--s) / -2) 0 0 calc(var(--s) / -2);border-radius:50%;pointer-events:none;
  background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.8),transparent 40%),var(--c);box-shadow:0 0 8px var(--c);animation:spit .62s cubic-bezier(.2,.7,.4,1) var(--d,0s) both}
@keyframes spit{0%{transform:translate(0,0) scale(.3)}40%{transform:translate(calc(var(--dx) * .75),calc(var(--dy) * .75 - 12px)) scale(1)}100%{transform:translate(var(--dx),calc(var(--dy) + 22px)) scale(.2);opacity:0}}
.goo{position:fixed;z-index:2147483599;pointer-events:none;filter:url(#mfd-goo);opacity:.9;animation:gfade .26s .34s ease forwards}
.goo b{position:absolute;width:var(--s);height:var(--s);left:var(--x);top:var(--y);margin:calc(var(--s) / -2) 0 0 calc(var(--s) / -2);border-radius:50%;background:var(--c);animation:swell .42s cubic-bezier(.2,.9,.3,1.15) both}
@keyframes swell{from{transform:translate(0,0) scale(.08)}to{transform:translate(var(--tx),var(--ty)) scale(1)}}
@keyframes gfade{to{opacity:0}}
.erupt{animation:erupt .5s .08s cubic-bezier(.2,.85,.25,1.15) both}
@keyframes erupt{0%{clip-path:circle(0 at var(--ox) var(--oy));transform:scale(.94);opacity:.3}55%{clip-path:circle(80% at var(--ox) var(--oy));transform:scale(1.025);opacity:1}
  78%{transform:scale(.995)}100%{clip-path:circle(150% at var(--ox) var(--oy));transform:none}}
.sink{animation:sink .22s cubic-bezier(.5,0,.8,.4) forwards!important}
@keyframes sink{from{clip-path:circle(150% at var(--ox) var(--oy))}to{clip-path:circle(0 at var(--ox) var(--oy));transform:scale(.9);opacity:.2}}
.blobs{position:absolute;inset:0;overflow:hidden;border-radius:inherit;pointer-events:none;opacity:.5}
.blobs::before,.blobs::after{content:"";position:absolute;width:60%;height:70%;border-radius:50%;filter:blur(26px);background:var(--c1);opacity:.55;animation:bl 3.2s ease-in-out infinite alternate}
.blobs::after{width:45%;height:55%;background:var(--c2);animation-duration:2.4s;animation-direction:alternate-reverse}
@keyframes bl{0%{transform:translate(-20%,-30%) scale(.8)}50%{transform:translate(90%,40%) scale(1.15)}100%{transform:translate(20%,110%) scale(.9)}}
.in{opacity:0;animation:rin .22s ease forwards;animation-delay:calc(.34s + var(--i,0) * .03s)}
@keyframes rin{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.drop,.bub,.ring,.spit,.goo{display:none}.erupt,.sink,.in,.blobs::before,.blobs::after{animation:none!important;opacity:1;clip-path:none}}
/* favorites flyout */
.fly{width:290px;padding:12px 8px 8px;overflow:hidden}
.fly .head{position:relative;display:flex;align-items:center;gap:4px;padding:0 6px 8px}
.fly .head .lbl{flex:1}
.more{border:0;background:none;color:var(--ink);font-size:12px;font-weight:600;padding:3px 6px;border-radius:6px}
.more:hover{background:var(--ctl)}
.row{position:relative;display:flex;align-items:center;gap:9px;width:100%;border:0;background:none;padding:6px 8px;border-radius:10px;text-align:left}
.row:hover{background:var(--ctl)}
.row .dot{flex:none;width:22px;height:22px;border-radius:8px;display:grid;place-items:center;font:700 12px/1 system-ui,sans-serif;color:#fff;background:rgb(var(--sc));
  box-shadow:0 0 10px -2px rgb(var(--sc));overflow:hidden}
.row .dot img{width:100%;height:100%;object-fit:cover;display:block}
.row .tx{flex:1;min-width:0}
.row .t{font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .s{font-size:11px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .u{flex:none;min-width:8px;height:8px;border-radius:4px;background:var(--text);opacity:.8}
.row .m{flex:none;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#f23f43;color:#fff;font:700 11px/18px system-ui,sans-serif;text-align:center}
.empty{padding:6px 8px 4px;color:var(--sub);font-size:12px}
/* the lava drops on channels and messages: just the glowing glyph */
.pin{position:fixed;z-index:2147483500;width:26px;height:26px;padding:0;border:0;background:none;display:grid;place-items:center;color:#9aa2ff;
  filter:drop-shadow(0 0 4px rgba(88,101,242,.95)) drop-shadow(0 1px 1px rgba(0,0,0,.6));opacity:.9;transition:transform .18s cubic-bezier(.3,.7,.3,1.4),color .15s}
.pin:hover{transform:scale(1.22) rotate(-8deg);opacity:1;color:#c9cdff}
.pin:active{transform:scale(.9)}
.pin.on{color:#fff;filter:drop-shadow(0 0 7px rgba(88,101,242,1)) drop-shadow(0 0 2px rgba(88,101,242,1)) drop-shadow(0 1px 1px rgba(0,0,0,.6))}
.pin svg circle:nth-child(2){animation:bob 2.6s ease-in-out infinite alternate}
.pin svg circle:nth-child(3){animation:bob 1.9s ease-in-out infinite alternate-reverse}
@keyframes bob{from{transform:translateY(0)}to{transform:translateY(-1.2px)}}
.pin:focus-visible{outline:2px solid var(--a);outline-offset:2px;border-radius:8px}
/* on messages it stays faint, so the chat isn't full of bright drops, and lights up when you point at it */
.pin.msg{opacity:.3;filter:none;transition:opacity .15s,transform .18s cubic-bezier(.3,.7,.3,1.4),filter .15s}
.pin.msg.on{opacity:.5}
.pin.msg:hover,.pin.msg:focus-visible{opacity:1;filter:drop-shadow(0 0 4px rgba(88,101,242,.95)) drop-shadow(0 1px 1px rgba(0,0,0,.6))}
/* the save / remind menu */
.menu{width:300px;max-height:calc(100vh - 16px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;padding:12px;display:grid;gap:10px}
.menu .sum{font-size:11.5px;opacity:.75;text-align:center;margin-top:2px}
.menu > .rp-set{position:sticky;bottom:0}
.menu .tiles{display:flex;flex-wrap:wrap;gap:6px}
.menu input[type=text]{width:100%;height:30px;padding:0 9px;border-radius:10px;border:1px solid var(--line);background:var(--field);color:var(--text);font:inherit;font-size:12px}
.menu input[type=text]:focus{outline:2px solid var(--a);outline-offset:1px}
.menu .gone{border:0;background:none;color:var(--sub);font-size:11.5px;text-align:left;padding:0;text-decoration:underline}
/* reminders */
.pop{width:300px;padding:14px;overflow:hidden}
.pop .t{position:relative;font-weight:600;margin:8px 0 2px}
.pop .nt{position:relative;margin-top:8px;padding:6px 9px;border-radius:9px;background:rgba(var(--a-rgb),.14);font-size:12.5px;font-weight:600;overflow-wrap:anywhere}
.pop .s{position:relative;font-size:11.5px;color:var(--sub);margin-bottom:12px}
.pop .list{position:relative;display:grid;grid-template-columns:minmax(0,1fr);gap:4px;margin:8px 0 12px;max-height:200px;overflow-y:auto;overflow-x:hidden}
.pop .list .t{white-space:normal;overflow-wrap:anywhere}
.pop .btns{position:relative}
/* a channel's note, next to its name */
.note{position:fixed;z-index:2147483400;max-width:320px;padding:3px 9px;border-radius:9px;font-size:11.5px;color:var(--text);background:var(--glass);
  -webkit-backdrop-filter:blur(28px) saturate(170%);backdrop-filter:blur(28px) saturate(170%);box-shadow:0 0 0 1px var(--edge),inset 0 1px 0 var(--hl);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.note::before{content:"";display:inline-block;width:5px;height:5px;margin:0 7px 1px 0;transform:rotate(45deg);background:var(--ink)}
` + PICKER_CSS;
    const LAYER = (() => {
        let host = null, rootEl = null, wrap = null;
        function ensure() {
            if (host && host.isConnected) return wrap;
            host = document.createElement('mfd-layer');
            rootEl = host.attachShadow({ mode: 'closed' });
            rootEl.append(Object.assign(document.createElement('style'), { textContent: LAYER_CSS }));
            // the gooey edge for lava bursting open: a blur, then a sharp alpha threshold, so blobs merge like molten wax
            const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true'); svg.style.position = 'absolute';
            const f = document.createElementNS(SVGNS, 'filter'); f.id = 'mfd-goo';
            const b = document.createElementNS(SVGNS, 'feGaussianBlur'); b.setAttribute('in', 'SourceGraphic'); b.setAttribute('stdDeviation', '7');
            const m = document.createElementNS(SVGNS, 'feColorMatrix'); m.setAttribute('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9');
            f.append(b, m); svg.append(f); rootEl.append(svg);
            wrap = document.createElement('div'); wrap.className = 'v'; rootEl.append(wrap);
            for (const t of ['click', 'mousedown', 'pointerdown', 'keydown', 'keyup', 'keypress', 'wheel', 'paste', 'copy', 'cut', 'drop', 'beforeinput', 'input']) host.addEventListener(t, e => e.stopPropagation());
            document.documentElement.append(host);
            OWN.watch(rootEl);
            theme();
            return wrap;
        }
        function theme() { if (wrap) wrap.dataset.theme = dark() ? 'dark' : 'light'; }
        return { ensure, theme, active: () => rootEl && rootEl.activeElement };
    })();
    /* Pasting into our text boxes. Discord sends a paste it thinks happened outside a text box to its chat box,
       and it can't see into our sealed-off panel, so: a window listener (ahead of anything on the page) keeps
       a paste in our panel from reaching Discord; if Discord took it anyway, the box puts the text in itself.
       A Discord link pasted into a "paste a link" box goes straight in. */
    function putText(box, t) {
        box.setRangeText(t.replace(/\s+/g, ' ').trim(), box.selectionStart ?? box.value.length, box.selectionEnd ?? box.value.length, 'end');
        box.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const linkIn = box => setTimeout(() => { if (box.isConnected && box.dataset.link && LINK.test(box.value)) box.dispatchEvent(new Event('change')); }, 0);
    function ownPaste(e) {
        const t = e.clipboardData && e.clipboardData.getData('text/plain'), box = e.currentTarget;
        if (!t || !box || typeof box.setRangeText !== 'function') return;
        e.preventDefault(); e.stopPropagation(); putText(box, t); linkIn(box);
    }
    addEventListener('paste', e => {
        const host = e.target, box = host && (host === ui.host ? ui.root && ui.root.activeElement : host.tagName === 'MFD-LAYER' ? LAYER.active() : null);
        if (!box || box.tagName !== 'INPUT') return;
        e.stopImmediatePropagation();
        const t = e.clipboardData && e.clipboardData.getData('text/plain');
        if (e.defaultPrevented && t) putText(box, t);   // Discord got there first: the text still lands here
        linkIn(box);
    }, true);
    const el = (tag, attrs, ...kids) => {
        const e = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (v == null || v === false) continue;
            if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'style') e.style.cssText = v;
            else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
        }
        for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid);
        if (tag === 'input' && (!attrs || !attrs.type || attrs.type === 'text')) e.addEventListener('paste', ownPaste);
        return e;
    };
    const lavaColors = () => ({ c1: TITLE.seek() || css(PURPLE), c2: APP.accent });
    const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* A lava burst: a bubble swells at (x, y) and pops, droplets sputter out, molten blobs swell toward the
       box's corners, and the glass box erupts out of the same spot. sink() pulls it back in. */
    const BURST = {
        open(box, x, y) {
            const wrap = LAYER.ensure(), { c1, c2 } = lavaColors(), r = box.getBoundingClientRect();
            box.style.setProperty('--ox', Math.round(x - r.left) + 'px'); box.style.setProperty('--oy', Math.round(y - r.top) + 'px');
            box.style.setProperty('--c1', c1); box.style.setProperty('--c2', c2);
            box.classList.add('erupt');
            if (calm()) return;
            const bits = [el('div', { class: 'bub', style: `left:${x}px;top:${y}px;--c1:${c1};--c2:${c2}` }), el('div', { class: 'ring', style: `left:${x}px;top:${y}px;--c1:${c1}` })];
            for (let i = 0; i < 8; i++) {
                const a = -Math.PI / 2 + (i - 3.5) * 0.42 + rnd(-0.2, 0.2), d = rnd(26, 52), s = rnd(4, 8);
                bits.push(el('i', { class: 'spit', style: `left:${x}px;top:${y}px;--s:${s.toFixed(1)}px;--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d).toFixed(1)}px;--c:${i % 2 ? c2 : c1};--d:${(i * 0.012).toFixed(3)}s` }));
            }
            const goo = el('div', { class: 'goo', style: `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px` });
            const ox = x - r.left, oy = y - r.top, spots = [[0.15, 0.2], [0.85, 0.2], [0.5, 0.5], [0.2, 0.85], [0.8, 0.85], [0.5, 0.12]];
            spots.forEach(([fx, fy], i) => goo.append(el('b', { style: `--x:${ox}px;--y:${oy}px;--s:${Math.round(Math.max(r.width, r.height) * rnd(0.42, 0.62))}px;--tx:${Math.round(fx * r.width - ox)}px;--ty:${Math.round(fy * r.height - oy)}px;--c:${i % 2 ? c2 : c1};animation-delay:${(i * 0.025).toFixed(3)}s` })));
            wrap.insertBefore(goo, box); wrap.append(...bits);
            setTimeout(() => { goo.remove(); for (const b of bits) b.remove(); }, 900);
        },
        sink(box, done) {
            if (!box || !box.isConnected) { if (done) done(); return; }
            if (calm()) { box.remove(); if (done) done(); return; }
            box.classList.remove('erupt'); box.classList.add('sink');
            setTimeout(() => { box.remove(); if (done) done(); }, 230);
        },
    };

    /* The reminder picker: preset pills; then pick a unit and turn the dial. The outer ring is how many,
       the inner ring (Days and longer) is the time of day, like a 24-hour clock. The date at the bottom follows
       as you turn. The browser's own calendar covers an exact day and time. onSet(due) gets the time. */
    let dialN = 0;
    // onSet(due) sets the reminder right away (the panel's editors). With onPick, it's a choice in a form instead
    // (the message menu, which saves with one button): presets and the dial only pick a time, onPick(due) reports it,
    // "No reminder" (picked to begin with) reports 0, and there's no button of its own.
    function remindPicker(onSet, onPick) {
        let unit = 'hour', n = UNITS.hour.d, tod = 9 * 60, exact = 0, chosen = !onPick, preset = -1;
        const id = 'mfd-dial-' + (++dialN), R1 = 74, R2 = 54, C = 90;
        const NS = SVGNS, mk = (t, a) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
        const svg = mk('svg', { viewBox: '0 0 180 180', class: 'dial-svg' });
        const defs = mk('defs', {});
        for (const [gid, a, b] of [[id + '-o', '#8f98ff', APP.accent], [id + '-i', '#c9cdff', '#8f98ff']]) {
            const g = mk('linearGradient', { id: gid, x1: '0', y1: '0', x2: '1', y2: '1' });
            g.append(mk('stop', { offset: '0', 'stop-color': a }), mk('stop', { offset: '1', 'stop-color': b })); defs.append(g);
        }
        const ticks = mk('g', { class: 'ticks' });
        svg.append(defs, ticks);
        const ring = (r, w, grad) => {
            const track = mk('circle', { cx: C, cy: C, r, class: 'track', 'stroke-width': w });
            const lap = mk('circle', { cx: C, cy: C, r, class: 'lap', 'stroke-width': w, stroke: `url(#${grad})` });   // full turns already wound
            const arc = mk('circle', { cx: C, cy: C, r, class: 'arc', 'stroke-width': w, stroke: `url(#${grad})`, pathLength: '100', transform: `rotate(-90 ${C} ${C})` });
            const knob = mk('circle', { r: w / 2 - 1.5, class: 'dknob' });
            const g = mk('g', { class: 'dring', tabindex: '0', role: 'slider' }); g.append(track, lap, arc, knob);
            return { g, lap, arc, knob, r };
        };
        const outer = ring(R1, 16, id + '-o'), inner = ring(R2, 12, id + '-i');
        svg.append(outer.g, inner.g);
        const big = el('b'), small = el('span'), center = el('div', { class: 'dial-mid' }, big, small);
        const dial = el('div', { class: 'dial' }, svg, center);
        const out = el('div', { class: 'rp-out', 'aria-live': 'polite' });
        const pad = v => String(v).padStart(2, '0'), local = t => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
        const cal = el('input', { class: 'rp-when', type: 'datetime-local', 'aria-label': 'Exact date and time' });
        const clock = m => new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        // the most this unit can wind to without passing the two-year cap
        const top = u => { let m = u.max; while (m > 1 && dueFor(Object.keys(UNITS).find(k => UNITS[k] === u), m, tod) > Date.now() + REMIND_MAX) m--; return m; };
        const due = () => exact || Math.min(Date.now() + REMIND_MAX, dueFor(unit, n, tod));
        let drawnTicks = '';
        function drawTicks() {
            const u = UNITS[unit]; if (drawnTicks === unit) return; drawnTicks = unit;
            ticks.replaceChildren();
            const major = u.major;
            for (let k = 0; k < u.turn; k++) {
                const a = k / u.turn * 2 * Math.PI, len = k % major ? 3 : 6;
                ticks.append(mk('line', { x1: C + Math.sin(a) * 87, y1: C - Math.cos(a) * 87, x2: C + Math.sin(a) * (87 - len), y2: C - Math.cos(a) * (87 - len), class: k % major ? 'tick' : 'tick big' }));
            }
        }
        const setArc = (rg, f, wound) => {
            rg.lap.style.display = wound ? '' : 'none';
            rg.arc.setAttribute('stroke-dasharray', Math.max(0.001, f * 100) + ' 100');
            const a = f * 2 * Math.PI; rg.knob.setAttribute('cx', C + Math.sin(a) * rg.r); rg.knob.setAttribute('cy', C - Math.cos(a) * rg.r);
            rg.knob.classList.toggle('over', !!wound);
        };
        const show = () => {
            const u = UNITS[unit], turns = Math.floor(n / u.turn), rest = n - turns * u.turn;
            drawTicks();
            // a whole number of turns shows as one full ring; anything past it fills on top of the turns already wound
            setArc(outer, rest || !turns ? rest / u.turn : 1, turns > 0 && rest > 0);
            setArc(inner, tod / 1440, false);
            inner.g.style.display = u.at ? '' : 'none';
            outer.g.setAttribute('aria-label', u.label + ' from now'); outer.g.setAttribute('aria-valuemin', 1); outer.g.setAttribute('aria-valuemax', top(u)); outer.g.setAttribute('aria-valuenow', n);
            inner.g.setAttribute('aria-label', 'Time of day'); inner.g.setAttribute('aria-valuetext', clock(tod));
            big.textContent = n + ' ' + u.word + (n === 1 ? '' : 's');
            small.textContent = u.at ? 'at ' + clock(tod) : 'from now';
            cal.min = local(Date.now() + 60e3); cal.max = local(Date.now() + REMIND_MAX);
            out.textContent = !chosen ? 'No reminder' : exact ? fmtTime(exact) + ' · ' + countdown(exact) : fmtTime(due()) + ' · ' + countdown(due());
            for (const b of units.children) { const on = chosen && !exact && b.dataset.u === unit; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
            box.classList.toggle('exact', !!exact);
            if (onPick) {
                pres.forEach((b, i) => { const on = i === preset && chosen; b.classList.toggle('saved', on); b.setAttribute('aria-pressed', String(on)); });
                noneBtn.classList.toggle('saved', !chosen); noneBtn.setAttribute('aria-pressed', String(!chosen));
                onPick(chosen ? due() : 0);
            }
        };
        const touch = () => { exact = 0; cal.value = ''; chosen = true; preset = -1; };
        const setN = v => { n = Math.min(top(UNITS[unit]), Math.max(1, Math.round(v))); };
        // turning winds: the angle moved since the last step adds up, so going past the top keeps counting
        const angleAt = e => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 180 - C, y = (e.clientY - r.top) / r.height * 180 - C; return { f: ((Math.atan2(x, -y) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI), d: Math.hypot(x, y) }; };
        svg.addEventListener('pointerdown', e => {
            if (e.button > 0) return;
            const { f, d } = angleAt(e), which = UNITS[unit].at && d < (R1 + R2) / 2 ? 'inner' : 'outer';
            if (d < R2 - 14) return;
            e.preventDefault(); svg.setPointerCapture(e.pointerId); dial.classList.add('turning'); touch();
            const u = UNITS[unit];
            // a press on the ring jumps there within the turn you're on; then dragging winds from there
            let pos = which === 'outer' ? Math.floor((n - 1e-9) / u.turn) + f : f, last = f;
            if (which === 'outer') { if (Math.floor(pos * u.turn) < 1 && n <= u.turn) pos = Math.max(pos, 1 / u.turn); setN(pos * u.turn); } else tod = Math.round(f * 96) * 15 % 1440;
            show();
            const move = ev => {
                const g = angleAt(ev).f; let dlt = g - last; if (dlt > 0.5) dlt -= 1; if (dlt < -0.5) dlt += 1; last = g;
                if (which === 'outer') { pos = Math.min(top(u) / u.turn, Math.max(1 / u.turn, pos + dlt)); setN(pos * u.turn); }
                else { pos = pos + dlt; tod = ((Math.round(pos * 96) * 15) % 1440 + 1440) % 1440; }
                show();
            };
            const up = () => { svg.removeEventListener('pointermove', move); svg.removeEventListener('pointerup', up); svg.removeEventListener('pointercancel', up); dial.classList.remove('turning'); };
            svg.addEventListener('pointermove', move); svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
        });
        // keys: arrows one step, Page Up / Page Down a whole turn
        outer.g.addEventListener('keydown', e => { const u = UNITS[unit], s = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: u.turn, PageDown: -u.turn }[e.key]; if (!s) return; e.preventDefault(); touch(); setN(n + s); show(); });
        inner.g.addEventListener('keydown', e => { const s = { ArrowUp: 15, ArrowRight: 15, ArrowDown: -15, ArrowLeft: -15, PageUp: 180, PageDown: -180 }[e.key]; if (!s) return; e.preventDefault(); touch(); tod = (tod + s + 1440) % 1440; show(); });
        cal.addEventListener('change', () => { const t = cal.value ? +new Date(cal.value) : 0; exact = t > Date.now() ? Math.min(t, Date.now() + REMIND_MAX) : 0; if (exact) { chosen = true; preset = -1; } show(); });
        const units = el('div', { class: 'rp-units', role: 'radiogroup', 'aria-label': 'Unit' }, Object.entries(UNITS).map(([k, u]) =>
            el('button', { type: 'button', role: 'radio', 'data-u': k, text: u.label, onclick: () => { unit = k; n = u.d; touch(); show(); } })));
        const noneBtn = el('button', { class: 'lp', type: 'button', text: 'No reminder', onclick: () => { chosen = false; preset = -1; exact = 0; cal.value = ''; show(); } });
        const pres = PRESETS_T.map(([t, f], i) => el('button', { class: 'lp', type: 'button', text: t,
            onclick: () => { if (!onPick) return onSet(f()); exact = Math.min(Date.now() + REMIND_MAX, f()); cal.value = ''; chosen = true; preset = i; show(); } }));
        const box = el('div', { class: 'rp' },
            el('div', { class: 'rp-pre' }, onPick ? noneBtn : null, pres),
            el('div', { class: 'rp-fine' }, units, dial, out,
                el('label', { class: 'rp-cal' }, el('span', { text: 'Or pick an exact day and time' }), cal),
                onPick ? null : el('button', { class: 'rp-set', type: 'button', text: 'Remind me', onclick: () => onSet(due()) })));
        show();
        return box;
    }
    // the folders as lava pills (in the message menu and a saved message's editor)
    function folderPills(current, onPick) {
        return [{ id: '', name: 'Unsorted' }, ...D.saved.folders].map(f =>
            el('button', { class: 'lp' + (current === f.id ? ' saved' : ''), type: 'button', text: f.name, 'aria-pressed': String(current === f.id), onclick: () => onPick(f.id) }));
    }
    function placeIcon(p, size) {
        const c = serverRgb(p.gid, p.icon);
        const dot = el('span', { class: 'dot', style: '--sc:' + c.map(Math.round).join(' ') + (size ? ';width:' + size + 'px;height:' + size + 'px' : '') });
        if (p.icon) dot.append(el('img', { src: p.icon.replace(/size=\d+/, 'size=64'), alt: '', onerror: e => e.target.remove() }));
        else dot.textContent = p.kind === 'dm' ? '@' : (p.server || p.name || '#').trim()[0] || '#';
        return dot;
    }

    // the favorites list that drips out of the lava button and bursts open
    const FLY = (() => {
        let box = null, openT = 0, closeT = 0, inside = false, first = true;
        function hover(on) {
            clearTimeout(openT); clearTimeout(closeT);
            if (on) { if (S.enabled && S.favHover && !ui.host && !box) openT = setTimeout(open, 230); }
            else closeT = setTimeout(() => { if (!inside) close(); }, 300);
        }
        function open() {
            const b = document.getElementById('mfd-lava'); const r = visible(b); if (!r) return;
            const wrap = LAYER.ensure(); LAYER.theme();
            const { c1, c2 } = lavaColors(), x = r.left + r.width / 2, top = r.bottom + 8;
            const drop = el('div', { class: 'drop', style: `left:${x}px;top:${r.bottom - 4}px;--c1:${c1};--c2:${c2}` });
            const width = 290, left = Math.max(8, Math.min(innerWidth - width - 8, r.right - width + 6));
            box = el('div', { class: 'glass fly', role: 'menu', 'aria-label': 'Favorites', style: `left:${left}px;top:${top}px`,
                onmouseenter: () => { inside = true; clearTimeout(closeT); }, onmouseleave: () => { inside = false; hover(false); } });
            first = true; fill(); first = false;
            if (!calm()) wrap.append(drop);
            wrap.append(box);
            BURST.open(box, x, top + 4);
            setTimeout(() => drop.remove(), 320);
            document.addEventListener('keydown', esc, true);
            b.classList.add('open');
        }
        // only the first fill animates in; later ones (an icon's color arriving, unread dots) just update
        function fill() {
            if (!box) return;
            const list = D.favs.slice(0, 10), IN = first ? ' in' : '', n = D.saved.items.length;
            box.replaceChildren(box.querySelector('.blobs') || el('div', { class: 'blobs' }),
                el('div', { class: 'head' + IN }, el('div', { class: 'lbl', text: 'Favorites' }),
                    el('button', { class: 'more', type: 'button', text: 'Messages' + (n ? ' ' + n : '') + ' ›', title: 'Your saved messages', onclick: () => { close(true); ui.open(2, 'messages'); } }),
                    el('button', { class: 'more', type: 'button', text: 'Full menu ›', onclick: () => { close(true); ui.open(2, 'channels'); } })),
                ...(list.length ? list.map((f, i) => {
                    const bd = f.gid !== '@me' ? DC.badge(f.gid) : null;
                    return el('button', { class: 'row' + IN, type: 'button', role: 'menuitem', style: '--i:' + i, onclick: () => { close(true); DC.go(pathOf(f)); } },
                        placeIcon(f), el('span', { class: 'tx' }, el('div', { class: 't', text: sigil(f) + ' ' + f.name }), el('div', { class: 's', text: f.note || f.server })),
                        bd && bd.mentions ? el('span', { class: 'm', text: String(Math.min(99, bd.mentions)) }) : bd && bd.unread ? el('span', { class: 'u', title: 'Unread' }) : null);
                }) : [el('div', { class: 'empty' + IN, text: 'No favorites yet. Point at a channel in the list on the left and click its lava drop, or open the full menu.' })]));
        }
        function esc(e) { if (e.key === 'Escape') close(true); }
        function close(now) {
            clearTimeout(openT); clearTimeout(closeT); inside = false;
            document.removeEventListener('keydown', esc, true);
            const b = document.getElementById('mfd-lava'); if (b) b.classList.remove('open');
            if (box) { const x = box; box = null; if (now) x.remove(); else BURST.sink(x); }
        }
        return { hover, close, repaint: fill, isOpen: () => !!box };
    })();

    // the little lava drops: on a channel in the sidebar (add it to favorites) and on a message (save or remind)
    const DROPS = (() => {
        let chBtn = null, msgBtn = null, menu = null, chFor = null, msgFor = null, hideT = 0;
        const icon = () => lavaIcon(20);
        function ensure() {
            const wrap = LAYER.ensure();
            if (!chBtn) {
                chBtn = el('button', { class: 'pin', type: 'button', hidden: true, onmouseenter: () => clearTimeout(hideT), onmouseleave: later,
                    onclick: e => { e.stopPropagation(); if (chFor) { const r = chBtn.getBoundingClientRect(); const was = isFav(chFor.gid, chFor.cid); toggleFav(chFor); place(); if (!was) spark(r.left + r.width / 2, r.top + r.height / 2); } } }, icon());
                msgBtn = el('button', { class: 'pin msg', type: 'button', hidden: true, title: 'Save or remind me', 'aria-label': 'Save or remind me', onmouseenter: () => clearTimeout(hideT), onmouseleave: later,
                    onclick: e => { e.stopPropagation(); openMenu(); } }, icon());
                wrap.append(chBtn, msgBtn);
            }
        }
        // a little sputter when something lands in your favorites
        function spark(x, y) {
            if (calm()) return;
            const { c1, c2 } = lavaColors(), wrap = LAYER.ensure(), bits = [el('div', { class: 'ring', style: `left:${x}px;top:${y}px;--c1:${c2}` })];
            for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.55, d = rnd(16, 28); bits.push(el('i', { class: 'spit', style: `left:${x}px;top:${y}px;--s:5px;--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d).toFixed(1)}px;--c:${i % 2 ? c2 : c1}` })); }
            wrap.append(...bits); setTimeout(() => { for (const b of bits) b.remove(); }, 800);
        }
        function later() { clearTimeout(hideT); hideT = setTimeout(hide, 350); }
        function hide() { if (menu) return; if (chBtn) chBtn.hidden = true; if (msgBtn) msgBtn.hidden = true; chFor = msgFor = null; }
        function place() {
            if (chFor && chBtn) { const on = isFav(chFor.gid, chFor.cid); chBtn.classList.toggle('on', on); chBtn.title = on ? 'Remove from favorites' : 'Add to favorites'; chBtn.setAttribute('aria-label', chBtn.title); }
        }
        function onOver(e) {
            if (!S.enabled || ui.host && ui.host.contains(e.target)) return;
            const t = e.target; if (!t || !t.closest || t.tagName === 'MFD-LAYER') return;
            if (S.favDrops) {
                const a = t.closest('[data-list-item-id^="channels___"],a[href^="/channels/@me/"]');
                if (a && !a.closest('molten-for-discord-panel')) {
                    const link = a.tagName === 'A' ? a : (a.closest('a') || q('a', a) || a);
                    let m = /^\/channels\/(@me|\d{15,22})\/(\d{15,22})/.exec(link.getAttribute('href') || '');
                    if (!m) { const idm = /^channels___(\d{15,22})$/.exec(a.getAttribute('data-list-item-id') || ''); if (idm) m = [0, DC.route().gid, idm[1]]; }
                    if (m && m[2] && GID.test(m[1])) {
                        ensure(); clearTimeout(hideT);
                        const row = (a.closest('[class*="containerDefault_"],li') || a).getBoundingClientRect();
                        chFor = Object.assign(describe(m[1], m[2]), { name: DC.linkName(a) || 'Channel' });
                        if (m[1] === '@me') chFor.kind = 'dm';
                        const side = q(C('children'), a.closest('li') || a); const sr = visible(side);
                        chBtn.style.left = Math.round((sr && sr.width > 4 ? sr.left - 28 : row.right - 30)) + 'px';
                        chBtn.style.top = Math.round(row.top + (row.height - 26) / 2) + 'px';
                        chBtn.hidden = false; place();
                        return;
                    }
                }
            }
            if (S.msgDrops) {
                const li = t.closest('li[id^="chat-messages-"]');
                if (li) {
                    ensure(); clearTimeout(hideT); msgFor = li;
                    const r = li.getBoundingClientRect();
                    const bar = q(`${C('buttonsInner')},${C('buttons')} [role="group"]`, li); const br = visible(bar);
                    const saved = (/-(\d{15,22})$/.exec(li.id) || [])[1];
                    msgBtn.classList.toggle('on', !!saved && D.saved.items.some(x => x.mid === saved));
                    // next to the name and time; a follow-up message without them: at the end of its first line
                    let spot = null;
                    const time = visible(q('h3 time', li) || q(`h3 ${C('timestamp')}`, li));
                    if (time) spot = { x: time.right + 6, y: time.top + time.height / 2 };
                    else {
                        const c = q('[id^="message-content-"]', li);
                        if (c && c.textContent.trim()) {
                            const rg = document.createRange(); rg.selectNodeContents(c);
                            const rects = [...rg.getClientRects()].filter(x => x.width > 0);
                            if (rects.length) { const f = rects[0], line = rects.filter(x => Math.abs(x.top - f.top) < 4); spot = { x: Math.max(...line.map(x => x.right)) + 6, y: f.top + f.height / 2 }; }
                        }
                    }
                    const most = br ? br.left - 32 : r.right - 200;   // never under the reaction bar
                    msgBtn.style.left = Math.round(spot ? Math.min(spot.x, most) : most) + 'px';
                    msgBtn.style.top = Math.round(spot ? spot.y - 13 : br ? br.top + (br.height - 26) / 2 : r.top + 4) + 'px';
                    msgBtn.hidden = false;
                    return;
                }
            }
            if (!(chBtn && (chBtn.contains(t) || msgBtn.contains(t)))) later();
        }
        function openMenu() {
            if (!msgFor) return;
            const item = savedFrom(msgFor); if (!item) return;
            const wrap = LAYER.ensure(); LAYER.theme();
            closeMenu();
            const r = msgBtn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
            const savedNow = () => D.saved.items.find(x => x.mid === item.mid);
            const s = savedNow();
            // A form: a note, a folder and a reminder, each optional and changeable, and nothing happens until Save.
            // Save puts the message in the folder picked (Unsorted if nothing at all was picked) and sets the reminder
            // if one was; the note goes with both, so later you know why.
            let folder = s ? s.folder : null, due = 0;
            const noteIn = el('input', { type: 'text', placeholder: 'What\'s this for? (optional)', 'aria-label': 'Note', maxlength: '200', value: s ? s.note : '',
                onkeydown: e => { if (e.key === 'Enter') e.target.blur(); } });
            const withNote = () => Object.assign({}, item, { note: noteIn.value.trim().slice(0, 200) });
            const sum = el('div', { class: 'sum', 'aria-live': 'polite' });
            // where Save puts it: the folder picked; a saved message stays where it is; a new one goes to Unsorted,
            // unless only a reminder was picked (then it's just the reminder)
            const target = () => folder !== null ? folder : s ? s.folder : due ? null : '';
            const summary = () => {
                const f = target();
                sum.textContent = [f !== null ? (s && f === s.folder ? 'Stays in ' : 'Saves to ') + folderOf(f).name : 'Not saved', due ? 'reminds you ' + fmtTime(due) : 'no reminder'].join(' · ');
            };
            const pills = el('div', { class: 'tiles' });
            const drawPills = () => {
                pills.replaceChildren(...folderPills(folder, id => { folder = folder === id && !s ? null : id; drawPills(); summary(); }),
                    el('button', { class: 'lp', type: 'button', text: '+ New folder', onclick: e => { e.currentTarget.hidden = true; newIn.hidden = false; newIn.focus(); } }));
            };
            const newIn = el('input', { type: 'text', placeholder: 'Name a new folder, then Enter', 'aria-label': 'New folder', maxlength: '30', hidden: true,
                onkeydown: e => { if (e.key === 'Enter' && newIn.value.trim()) { folder = addFolder(newIn.value); newIn.value = ''; newIn.hidden = true; drawPills(); summary(); } } });
            const commit = () => {
                const f = target();
                if (f !== null) saveMessage(withNote(), f);
                const x = s && savedNow(); if (x) { x.note = withNote().note; store.saved(); refreshAll(); }   // a cleared note clears
                if (due) remind(withNote(), due);
                closeMenu(true);
            };
            drawPills();
            const left = Math.max(8, Math.min(innerWidth - 308, x - 264)), top = Math.max(8, Math.min(innerHeight - 470, y + 16));
            menu = el('div', { class: 'glass menu', role: 'dialog', 'aria-label': 'Save or remind me', style: `left:${left}px;top:${top}px` },
                el('div', { class: 'blobs' }),
                el('div', { class: 'lbl', text: 'Note' }), noteIn,
                el('div', { class: 'lbl', text: s ? 'Saved in ' + folderOf(s.folder).name + ' · move to' : 'Save to' }),
                pills, newIn,
                s ? el('button', { class: 'gone', type: 'button', text: 'Remove from saved', onclick: () => { D.saved.items = D.saved.items.filter(x => x.mid !== item.mid); store.saved(); refreshAll(); closeMenu(true); } }) : null,
                el('div', { class: 'lbl', text: 'Remind me' }),
                remindPicker(null, d => { due = d; summary(); }),
                sum, el('button', { class: 'rp-set', type: 'button', text: 'Save', onclick: commit }));
            summary();
            wrap.append(menu);
            // keep it on screen: shift up if it would run off the bottom, and scroll inside on very short windows
            const mr = menu.getBoundingClientRect();
            if (mr.bottom > innerHeight - 8) menu.style.top = Math.max(8, innerHeight - 8 - mr.height) + 'px';
            BURST.open(menu, x, y);
            setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
            document.addEventListener('keydown', escMenu, true);
        }
        // a press anywhere outside closes the menu (inside our own layer, the page sees only the layer itself)
        function outside(e) { if (!menu || (e.target && e.target.tagName === 'MFD-LAYER')) return; closeMenu(true); }
        function escMenu(e) { if (e.key === 'Escape') closeMenu(true); }
        function closeMenu(andHide) { 
            document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', escMenu, true);
            if (menu) { const m = menu; menu = null; BURST.sink(m); }
            if (andHide) hide();
        }
        // one listener for the whole page, started once
        document.addEventListener('mouseover', onOver, { passive: true });
        return { hide: () => { closeMenu(); hide(); }, pins: () => { if (!menu) hide(); } };
    })();

    // reminder popups: a drop falls from the top edge and the card bursts out of it
    const POP = (() => {
        const open = [];
        function card(kids, label) {
            const wrap = LAYER.ensure(); LAYER.theme();
            const { c1, c2 } = lavaColors();
            const top = 56 + open.reduce((h, x) => h + x.offsetHeight + 10, 0), right = 16, x = innerWidth - right - 150;
            const drop = el('div', { class: 'drop', style: `left:${x}px;top:${top - 14}px;--c1:${c1};--c2:${c2}` });
            const box = el('div', { class: 'glass pop', role: 'alertdialog', 'aria-label': label, style: `right:${right}px;top:${top}px` }, el('div', { class: 'blobs' }), kids);
            if (!calm()) wrap.append(drop);
            wrap.append(box); open.push(box);
            BURST.open(box, x, top + 6);
            setTimeout(() => drop.remove(), 320);
            return box;
        }
        function dismiss(box) { const i = open.indexOf(box); if (i >= 0) open.splice(i, 1); BURST.sink(box); }
        function reminder(r) {
            let box = null;
            box = card([el('div', { class: 'lbl', text: 'Reminder' }), r.note ? el('div', { class: 'nt', text: r.note }) : null, el('div', { class: 't', text: r.title }),
                el('div', { class: 's', text: sigil(r) + r.name + (r.server && r.kind !== 'dm' ? ' · ' + r.server : '') + ' · ' + fmtTime(r.due) }),
                el('div', { class: 'btns' },
                    el('button', { class: 'btn primary', type: 'button', text: 'Jump', onclick: () => { DC.go(pathOf(r)); finishReminder(r.id); dismiss(box); } }),
                    el('button', { class: 'btn', type: 'button', text: 'Snooze 10 min', onclick: () => { finishReminder(r.id, 10 * 60e3); dismiss(box); } }),
                    el('button', { class: 'btn', type: 'button', text: 'Done', onclick: () => { finishReminder(r.id); dismiss(box); } }))], 'Reminder');
        }
        function missed(list) {
            let box = null;
            box = card([el('div', { class: 'lbl', text: 'While you were away' }),
                el('div', { class: 't', text: 'You missed ' + list.length + ' reminder' + (list.length === 1 ? '' : 's') }),
                el('div', { class: 'list' }, list.map(r => el('button', { class: 'row', type: 'button', onclick: () => { DC.go(pathOf(r)); finishReminder(r.id); } },
                    placeIcon(r, 20), el('span', { class: 'tx' }, el('div', { class: 't', text: r.title }), el('div', { class: 's', text: (r.note ? r.note + ' · ' : '') + 'Was due ' + fmtTime(r.due) }))))),
                el('div', { class: 'btns' },
                    el('button', { class: 'btn', type: 'button', text: 'See reminders', onclick: () => { ui.open(2, 'reminders'); dismiss(box); } }),
                    el('button', { class: 'btn primary', type: 'button', text: 'Done with all', onclick: () => { for (const r of list) finishReminder(r.id); dismiss(box); } }))], 'Missed reminders');
        }
        return { reminder, missed };
    })();

    // a channel's note, as a small glass chip next to its name in the header
    const NOTE = (() => {
        let chip = null;
        function place() {
            const r = DC.route(), text = S.enabled && r.cid ? D.notes[r.cid] : '';
            const t = text && DC.headerTitle(), tr = visible(t);
            if (!tr) { if (chip) chip.hidden = true; return; }
            if (!chip) { chip = el('div', { class: 'note', role: 'note', title: 'Channel note (click to edit)', onclick: () => ui.open(2, 'channels') }); LAYER.ensure().append(chip); }
            chip.textContent = text; chip.hidden = false;
            chip.style.left = Math.round(tr.right + 10) + 'px'; chip.style.top = Math.round(tr.top + (tr.height - 22) / 2) + 'px';
        }
        return { place };
    })();

    /* ───────────────────────── panel ───────────────────────── */

    const ICONS = {
        chev: ['m6 9 6 6 6-6'],
        sun: ['M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7', 'M12 2.5v2', 'M12 19.5v2', 'M2.5 12h2', 'M19.5 12h2', 'M5.3 5.3l1.4 1.4', 'M17.3 17.3l1.4 1.4', 'M5.3 18.7l1.4-1.4', 'M17.3 6.7l1.4-1.4'],
        moon: ['M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6Z'],
        folder: ['M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z'],
        inbox: ['M3.5 13h4.5l1.2 2.5h5.6l1.2-2.5h4.5', 'M6 5.5h12l2.5 7.5v4.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V13z'],
        grip: ['M9 6h.01', 'M15 6h.01', 'M9 12h.01', 'M15 12h.01', 'M9 18h.01', 'M15 18h.01'],
        down: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
        up: ['M12 21V9', 'm7 14 5-5 5 5', 'M5 3h14'],
        trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12', 'M9 7V4h6v3'],
    };
    function icon(paths, size = 14, sw = 2) {
        const s = document.createElementNS(SVGNS, 'svg');
        for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
        for (const d of [].concat(paths)) { const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); s.append(p); }
        return s;
    }
    function gwCloseIcon() {   // glassware:icon (the close button's ×, stamped by tools/frame.py)
        const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg');
        for (const [k, v] of [['viewBox', '0 0 24 24'], ['width', '13'], ['height', '13'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2.2'], ['stroke-linecap', 'round'], ['aria-hidden', 'true']]) s.setAttribute(k, v);
        for (const d of ['M6 6l12 12', 'M18 6 6 18']) { const q = document.createElementNS(NS, 'path'); q.setAttribute('d', d); s.append(q); }
        return s;
    }   // glassware:icon end
    function gwSheetGestures(sheet, grip, close, wall) {   // glassware:sheet (a phone sheet's touch handling, stamped by tools/frame.py)
        // Touches inside the sheet stay inside: none reach the page behind (wall: where they stop, the shadow
        // host when there is one, so the panel's own listeners still hear them). Pull the handle or the
        // header (grip: a selector, or a test of the touched element) down and the sheet follows the finger; let go past 90px, or flick, and
        // it closes; any shorter and it springs back. Buttons and switches in the header still just tap.
        for (const t of ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointerup', 'click']) (wall || sheet).addEventListener(t, e => e.stopPropagation());
        let y0 = null, t0 = 0, dy = 0;
        const isGrip = typeof grip === 'function' ? grip : t => !!t.closest(grip);
        sheet.addEventListener('touchstart', e => {
            const t = e.target;
            if (e.touches.length !== 1 || !t.closest || !isGrip(t) || t.closest('button,input,select,textarea,a,label,[role="tab"],[role="switch"]')) return;
            y0 = e.touches[0].clientY; t0 = Date.now(); dy = 0; sheet.style.transition = 'none';
        }, { passive: true });
        sheet.addEventListener('touchmove', e => {
            if (y0 === null) return;
            dy = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = dy ? 'translateY(' + dy + 'px)' : '';
            if (dy > 4 && e.cancelable) e.preventDefault();   // the page mustn't scroll or pull-to-refresh underneath
        }, { passive: false });
        const end = () => {
            if (y0 === null) return;
            const flick = dy > 30 && dy / Math.max(1, Date.now() - t0) > 0.6; y0 = null;
            sheet.style.transition = 'transform .2s ease';
            if (dy > 90 || flick) { sheet.style.transform = 'translateY(100%)'; setTimeout(() => { close(); sheet.style.transform = ''; sheet.style.transition = ''; }, 180); }
            else sheet.style.transform = '';
        };
        sheet.addEventListener('touchend', end); sheet.addEventListener('touchcancel', end);
    }   // glassware:sheet end
    const h = el;
    const toggle = (on, onclick, label) => h('button', { class: 'sw', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label, onclick });

    // The glass recipe (tools/lib/tokens.json): only neutrals swap between light and dark; accents stay.
    const CSS = `
:host{all:initial}
*{box-sizing:border-box;margin:0}
[hidden]{display:none!important}
.panel{
  --a:${APP.accent};--a-rgb:${APP.rgb};--on:${APP.on};--ink:${APP.ink};
  --glass:rgba(255,255,255,.84);--solid:rgb(250,250,252);--text:#1d1d1f;--sub:rgba(29,29,31,.64);--line:rgba(0,0,0,.07);
  --danger:#d22d39;--edge:rgba(255,255,255,.8);--hl:#fff;--drop:rgba(0,0,0,.34);--ctl:rgba(0,0,0,.055);--ctl-hi:rgba(0,0,0,.1);--sw-off:rgba(0,0,0,.13);
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
  --danger:#f2575f;--edge:rgba(255,255,255,.12);--hl:rgba(255,255,255,.1);--drop:rgba(0,0,0,.6);--ctl:rgba(255,255,255,.08);--ctl-hi:rgba(255,255,255,.14);
  --sw-off:rgba(255,255,255,.2);--field:rgba(255,255,255,.06);--field-hi:rgba(255,255,255,.12);--knob:#55555f;--ink:${APP.inkDark};color-scheme:dark}
@keyframes in{from{opacity:0;transform:translateY(-6px) scale(.98)}}
@media (prefers-reduced-motion:reduce){.panel,.panel *{animation:none!important;transition:none!important}}
button,input{font:inherit;color:inherit}
button{cursor:pointer}
.top{flex:none}
.body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:none}
.body::-webkit-scrollbar{display:none}
.grab{display:none}
.head{display:flex;align-items:center;gap:11px;padding:18px 18px 4px}
.logo{position:relative;flex:none;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff;overflow:hidden;
  background:linear-gradient(145deg,color-mix(in srgb,var(--a) 72%,#0b0b16),color-mix(in srgb,var(--a) 40%,#0b0b16));
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.3),0 4px 16px -4px rgba(var(--a-rgb),.95)}
.logo-img{position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;display:block}
.nm{min-width:0}
.title{font-weight:650;font-size:16px;letter-spacing:-.015em}
.tag{font-size:12px;color:var(--sub)}
/* glassware:frame start: shared controls, stamped by tools/frame.py; edit them there */
.panel .mode{position:relative;flex:none;display:flex;align-items:center;justify-content:space-between;width:50px;height:28px;margin:0 0 0 auto;padding:0 7px;border:0;border-radius:14px;background:var(--ctl);color:var(--sub);cursor:pointer;box-sizing:border-box;min-width:0;min-height:0;max-height:none;line-height:1;text-transform:none;letter-spacing:normal}
.panel .mode svg{position:relative;z-index:1;flex:none;display:block;width:13px;height:13px;transition:color .18s}
.panel .mode .knob{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:var(--knob);box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s cubic-bezier(.3,.7,.3,1)}
.panel[data-theme=dark] .mode .knob{transform:translateX(22px)}
.panel .mode .sun,.panel[data-theme=dark] .mode .moon{color:var(--text)}
.panel[data-theme=dark] .mode .sun{color:var(--sub)}
.panel .x{flex:none;display:grid;place-items:center;width:28px;height:28px;margin:0 0 0 -3px;padding:0;border:0;border-radius:50%;background:var(--ctl);color:var(--sub);cursor:pointer;box-sizing:border-box;min-width:0;min-height:0;max-height:none;line-height:1;text-transform:none;letter-spacing:normal}
.panel .x:hover{background:var(--ctl-hi);color:var(--text)}
.panel .sw{flex:none;position:relative;width:40px;height:24px;margin:0;padding:0;border:0;border-radius:12px;background:var(--sw-off);cursor:pointer;transition:background .18s;box-sizing:border-box;min-width:0;min-height:0;max-height:none;line-height:1;text-transform:none;letter-spacing:normal}
.panel .sw::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s cubic-bezier(.3,.7,.3,1)}
.panel .sw[aria-checked=true]{background:var(--a);box-shadow:0 0 12px -2px color-mix(in srgb,var(--a) 70%,transparent)}
.panel .sw[aria-checked=true]::after{transform:translateX(16px)}
.panel .mode:focus-visible,.panel .x:focus-visible,.panel .sw:focus-visible{outline:2px solid var(--a);outline-offset:2px}
@media (max-width:600px){.panel .x{flex:none;display:grid;place-items:center;width:36px;height:36px;margin:0 0 0 -3px;padding:0;border:0;border-radius:50%;background:var(--ctl);color:var(--sub);cursor:pointer;box-sizing:border-box;min-width:0;min-height:0;max-height:none;line-height:1;text-transform:none;letter-spacing:normal}.panel .x:hover{background:var(--ctl-hi);color:var(--text)}.panel .sw{flex:none;position:relative;width:46px;height:28px;margin:0;padding:0;border:0;border-radius:14px;background:var(--sw-off);cursor:pointer;transition:background .18s;box-sizing:border-box;min-width:0;min-height:0;max-height:none;line-height:1;text-transform:none;letter-spacing:normal}.panel .sw::after{content:"";position:absolute;top:2px;left:2px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s cubic-bezier(.3,.7,.3,1)}.panel .sw[aria-checked=true]{background:var(--a);box-shadow:0 0 12px -2px color-mix(in srgb,var(--a) 70%,transparent)}.panel .sw[aria-checked=true]::after{transform:translateX(18px)}.panel .mode:focus-visible,.panel .x:focus-visible,.panel .sw:focus-visible{outline:2px solid var(--a);outline-offset:2px}}
/* glassware:frame end */
.ctx{display:flex;align-items:center;gap:8px;padding:6px 16px 12px;font:12px var(--mono);color:var(--sub)}
.ctx b{color:var(--text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{font:600 9.5px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;padding:4px 7px;border-radius:6px;background:var(--ctl);color:var(--sub);white-space:nowrap}
.pill.on{background:rgba(var(--a-rgb),.16);color:var(--ink)}
.tabs{display:flex;gap:2px;margin:0 14px 10px;padding:3px;border-radius:12px;background:var(--ctl)}
.tabs button{flex:1;min-width:0;border:0;background:none;padding:7px 4px;border-radius:9px;font-size:12.5px;font-weight:500;color:var(--sub)}
.tabs button.on{background:var(--field-hi);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.12)}
.card{margin:0 14px 8px;padding:12px 14px;border-radius:16px;background:rgba(var(--a-rgb),.09);border:1px solid rgba(var(--a-rgb),.22)}
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
.seg{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);padding:2px;border-radius:10px;background:var(--ctl);flex:none}
.seg.wide{grid-auto-flow:row;grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));margin-top:8px}
.seg button{border:0;background:none;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:500;color:var(--sub);transition:background .15s,color .15s}
.seg button.on{background:var(--a);color:var(--on);box-shadow:0 1px 4px rgba(0,0,0,.14),0 0 14px -4px rgba(var(--a-rgb),.8)}
.pick{flex:none;display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px 0 10px;border:0;border-radius:13px;background:var(--ctl);font-size:12px;font-weight:500}
.pick[aria-expanded=true] svg{transform:rotate(180deg)}
.slide{display:flex;align-items:center;gap:8px;margin-top:8px}
.slide input[type=range]{flex:1;accent-color:var(--a)}
.num{width:58px;height:28px;padding:0 6px;border-radius:8px;border:1px solid var(--line);background:var(--field);font:12px var(--mono);text-align:right;color:var(--text)}
.sw:focus-visible,.seg button:focus-visible,.pick:focus-visible,.tabs button:focus-visible{outline:2px solid var(--a);outline-offset:2px}
.foot{flex:none;padding:10px 16px 12px;border-top:1px solid var(--line);font-size:11px;color:var(--sub);text-align:center}
@media (max-width:600px){
  .panel{top:auto;right:0;left:0;bottom:0;width:100%;max-width:none;max-height:86vh;max-height:86dvh;border-radius:24px 24px 0 0;border-bottom:0;
    padding-bottom:env(safe-area-inset-bottom);animation:up .22s cubic-bezier(.2,.8,.2,1)}
  .grab{display:block;width:38px;height:5px;border-radius:3px;background:var(--sw-off);margin:8px auto 0}
  .head{padding-top:10px}
  .row{min-height:36px}
  @keyframes up{from{transform:translateY(30px);opacity:0}}
}
`;

    const ui = {
        host: null, root: null, panel: null, tab: 0, open_: new Set(), edit: null, sub: 'channels', folder: null, range: 'week', field: 'time', hot: false,

        toggle() { this.host ? this.close() : this.open(); },
        open(tab, sub) {
            if (typeof tab === 'number') this.tab = tab;
            if (sub) { this.sub = sub; this.folder = null; this.edit = null; }
            if (this.host) { this.render(); return; }
            FLY.close(true); DROPS.hide();
            this.host = document.createElement(APP.slug + '-panel');
            this.root = this.host.attachShadow({ mode: 'closed' });
            this.root.append(h('style', { text: CSS + CSS2 + PICKER_CSS }));
            this.panel = h('div', { class: 'panel', role: 'dialog', 'aria-label': APP.name, tabindex: '-1' });
            this.root.append(this.panel);
            // clicks and keys inside the panel never reach the site
            for (const t of ['click', 'mousedown', 'pointerdown', 'keydown', 'keyup', 'keypress', 'wheel', 'touchstart', 'mouseover', 'paste', 'copy', 'cut', 'drop', 'beforeinput', 'input'])
                this.host.addEventListener(t, e => { e.stopPropagation(); if (t === 'keydown' && e.key === 'Escape') this.close(); });
            if (matchMedia('(pointer: coarse)').matches) gwSheetGestures(this.panel, '.grab, .head', () => this.close(), this.host);
            this.esc = e => { if (e.key === 'Escape') this.close(); };
            document.addEventListener('keydown', this.esc, true);
            document.documentElement.append(this.host);
            OWN.watch(this.root);
            this.render();
            this.panel.focus({ preventScroll: true });
            ensureButton();
        },
        close() {
            if (!this.host) return;
            document.removeEventListener('keydown', this.esc, true);
            this.host.remove(); this.host = this.root = this.panel = null; this.edit = null;
            ensureButton();
        },
        // someone typing in the panel: a change from another tab waits, so their words aren't wiped
        typing() { const a = this.root && this.root.activeElement; return !!(a && a.tagName === 'INPUT' && a.classList.contains('txt') && this.dirty); },
        render() {
            if (!this.panel) return;
            this.hot = false;
            const scroll = this.panel.querySelector('.body')?.scrollTop || 0;
            this.panel.dataset.theme = dark() ? 'dark' : 'light';
            const tile = h('div', { class: 'logo' }, lavaIcon(20), h('img', { class: 'logo-img', src: ICON_SRC, alt: '', onerror: e => e.target.remove() }));
            const mode = h('button', { class: 'mode', role: 'switch', 'aria-checked': String(dark()), 'aria-label': 'Dark mode', title: 'Light or dark',
                onclick: () => save({ appearance: dark() ? 'light' : 'dark' }) },
                h('span', { class: 'mi sun' }, icon(ICONS.sun, 13)), h('span', { class: 'mi moon' }, icon(ICONS.moon, 12)), h('span', { class: 'knob' }));
            const top = h('div', { class: 'top' },
                h('div', { class: 'grab' }),
                h('div', { class: 'head' }, tile, h('div', { class: 'nm' }, h('div', { class: 'title', text: APP.name }), h('div', { class: 'tag', text: APP.tagline })),
                    mode, h('button', { class: 'x', 'aria-label': 'Close', onclick: () => this.close() }, gwCloseIcon())),
                h('div', { class: 'ctx' }, h('b', { text: HOST || 'discord.com' }), h('span', { class: 'pill' + (S.enabled ? ' on' : ''), text: S.enabled ? 'On' : 'Off' })),
                h('div', { class: 'tabs', role: 'tablist' }, APP.tabs.map((t, i) =>
                    h('button', { class: i === this.tab ? 'on' : null, role: 'tab', 'aria-selected': String(i === this.tab), text: t, onclick: () => { this.tab = i; this.edit = null; this.render(); } }))));
            const act = this.tab === 3 && S.enabled, body = h('div', { class: 'body' + (act && S.blurDMs ? ' bd' : '') + (act && S.blurServers ? ' bs' : '') }, [this.general, this.lava, this.favorites, this.activity, this.privacy][this.tab].call(this));
            const foot = h('div', { class: 'foot', text: `Open from the lava button or the Tampermonkey menu · v${VERSION} · every tab updates live` });
            this.panel.replaceChildren(top, body, foot);
            body.scrollTop = scroll;
        },
        repaintDots() { if (this.host && this.tab === 2 && !this.dragging && !this.typing()) this.render(); },

        /* ---------- building blocks ---------- */
        sec(title, ...kids) { return h('div', { class: 'sec' }, title ? h('div', { class: 'label', text: title }) : null, kids); },
        row(title, desc, control, extra) { return h('div', { class: 'row' }, h('div', { class: 'tx' }, h('div', { class: 't', text: title }), desc ? h('div', { class: 'd', text: desc }) : null, extra || null), control); },
        tgl(key, title, desc) { return this.row(title, desc, toggle(S[key], () => save({ [key]: !S[key] }), title)); },
        // settings that belong to a switch: shown only while it's on (kind 'off': only while it's off;
        // 'far': its switch sits somewhere else). Nothing is reset while they're folded away.
        fold(show, kind, ...kids) { return h('div', { 'data-fold': kind || 'on', hidden: !show }, kids); },
        choice(title, desc, options, cur, pickFn, key) {
            const seg = wide => h('div', { class: 'seg' + (wide ? ' wide' : ''), role: 'radiogroup', 'aria-label': title, style: wide ? '--cols:' + Math.min(options.length, options.some(o => o[1].length > 9) ? 3 : 4) : null },
                options.map(([v, label]) => h('button', { class: v === cur ? 'on' : null, role: 'radio', 'aria-checked': String(v === cur), text: label, onclick: () => { this.open_.delete(key || title); pickFn(v); } })));
            if (options.length <= 3 && options.every(o => o[1].length <= 8)) return this.row(title, desc, seg(false));
            const open = this.open_.has(key || title), now = options.find(o => o[0] === cur);
            const pick = h('button', { class: 'pick', 'aria-expanded': String(open), onclick: () => { open ? this.open_.delete(key || title) : this.open_.add(key || title); this.render(); } }, now ? now[1] : '', icon(ICONS.chev, 12));
            return h('div', {}, this.row(title, desc, pick), open ? seg(true) : null);
        },
        ch(key, title, desc, options) { return this.choice(title, desc, options, S[key], v => save({ [key]: v }), key); },
        slider(title, desc, o, cur, def, live, commit) {
            const dec = String(o.step).includes('.') ? String(o.step).split('.')[1].length : 0, fmt = v => Number(v).toFixed(dec);
            const num = h('input', { class: 'num', type: 'number', min: o.min, max: o.hard || o.max, step: o.step, value: fmt(cur), 'aria-label': title,
                onchange: e => { const v = +e.target.value; if (isFinite(v)) commit(Math.min(o.hard || o.max, Math.max(o.min, v))); } });
            const range = h('input', { type: 'range', min: o.min, max: o.max, step: o.step, value: cur, 'aria-label': title,
                oninput: e => { num.value = fmt(e.target.value); live(+e.target.value); }, onchange: e => commit(+e.target.value),
                onpointerdown: () => this.panel && this.panel.classList.add('peek') });
            return h('div', { class: 'fld' }, h('div', { class: 'fh' }, h('div', { class: 'tx' }, h('div', { class: 't', text: title }), desc ? h('div', { class: 'd', text: desc }) : null),
                def !== undefined ? h('span', { class: 'def', text: 'default ' + def + (o.unit ? ' ' + o.unit : '') }) : null), h('div', { class: 'slide' }, range, num));
        },
        sl(key, title, desc, o) {
            return this.slider(title, desc, o, S[key], SPEC[key].d, v => { S[key] = v; liveApply(key); }, v => save({ [key]: v }));
        },
        lsl(key, title, desc, o) {
            const p = LAVA.profiles[LAVA.profile];
            return this.slider(title, desc, o, p[key], PRESETS[LAVA.profile][key], v => { p[key] = v; lavaLive(key); }, v => { p[key] = v; saveLava(); lavaLive(key); this.render(); });
        },
        btns(...list) { return h('div', { class: 'btns' }, list.filter(Boolean).map(([t, fn, primary, dis]) => h('button', { class: 'btn' + (primary ? ' primary' : ''), type: 'button', text: t, onclick: fn, disabled: dis || null }))); },
        note(t) { return h('div', { class: 'note', text: t }); },
        swatch(title, get) {
            const chip = h('span', { class: 'swatch' }), d = h('div', { class: 'd' });
            const show = () => { const c = get(); chip.style.background = c || 'transparent'; d.textContent = c || 'Nothing yet (Discord\'s own color)'; };
            show();
            const on = () => { if (!chip.isConnected) return document.removeEventListener('mfd-colors', on); show(); };
            document.addEventListener('mfd-colors', on);
            return h('div', { class: 'row' }, h('div', { class: 'tx' }, h('div', { class: 't', text: title }), d), chip);
        },
        text(value, ph, onCommit, label, max) {
            return h('input', { class: 'txt', type: 'text', value: value || '', placeholder: ph, 'aria-label': label || ph, maxlength: String(max || 200),
                oninput: () => { this.dirty = true; }, onchange: e => { this.dirty = false; onCommit(e.target.value.trim()); }, onkeydown: e => { if (e.key === 'Enter') e.target.blur(); } });
        },
        master() {
            return h('div', { class: 'card' }, h('div', { class: 'row' },
                h('div', { class: 'tx' }, h('div', { class: 't', text: APP.name }),
                    h('div', { class: 'd', text: S.enabled ? 'Everything is on. Turn off to stop every feature at once.' : 'Everything is off. Your settings are kept.' })),
                toggle(S.enabled, () => save({ enabled: !S.enabled }), 'Turn ' + APP.name + ' on or off')));
        },
        offNote() { return this.sec(null, this.note('Molten for Discord is off. Turn it back on in General; everything here is kept.')); },

        /* ---------- General ---------- */
        general() {
            const out = [this.master()];
            out.push(this.fold(S.enabled, 'far',
                this.sec('Title bar',
                    this.tgl('titleColor', 'Match the title bar to the art', 'Same picture, video or server the lava is showing'),
                    this.fold(S.titleColor, 'on',
                        this.ch('titleTone', 'Tone', 'Dark is easiest to read', [['dark', 'Dark'], ['vivid', 'Vivid'], ['muted', 'Muted']]),
                        this.swatch('Current color', () => TITLE.color()),
                        this.note(TITLE.yielded() ? 'Another script kept changing the title bar color, so Molten stepped back to stop the flashing. Turn the other script off for Discord, then refresh.'
                            : 'With nothing on screen to take a color from, the title bar goes back to Discord\'s own color, or to Prism if you use it. It shows when Discord is installed as an app.'))),
                this.sec('Video seek bar',
                    this.tgl('seekColor', 'Match the seek bar to the art', 'The played part and the ball on videos and audio'),
                    this.fold(S.seekColor, 'on',
                        this.ch('seekTone', 'Tone', 'Bright is easiest to see', [['bright', 'Bright'], ['title', 'Match title bar']]),
                        this.swatch('Current color', () => TITLE.seek())))));
            out.push(this.sec('Appearance', this.row('Match my device', 'Light or dark follows your device until you flip the switch up top',
                toggle(S.appearance === 'auto', () => save({ appearance: S.appearance === 'auto' ? (dark() ? 'dark' : 'light') : 'auto' }), 'Match my device'))));
            out.push(this.yourData());
            const status = h('div', { class: 'd status' });
            out.push(this.sec('Troubleshooting', this.tgl('log', 'Log to the console', 'Lines start with [molten] (F12)'),
                this.btns(['Copy layout report', async () => {
                    const text = GLASS.report();
                    try { await navigator.clipboard.writeText(text); status.textContent = 'Copied. Paste it to whoever is tuning the skin.'; }
                    catch (e) { console.log(text); status.textContent = 'Could not copy; the report is in the console (F12).'; }
                }]), status,
                this.note('The report lists the colors and pieces on screen, without messages, names or ids.')));
            return out;
        },

        /* ---------- Lava ---------- */
        lava() {
            if (!S.enabled) return [this.offNote()];
            const p = LAVA.profile, PR = PRESETS[p], cur = LAVA.profiles[p], r = DC.route();
            const out = [this.sec(null, this.tgl('lavaOn', 'Lava background', 'Off = clear glass over a plain black page'),
                this.fold(S.lavaOn, 'on',
                    h('div', { class: 'seg prof', role: 'radiogroup', 'aria-label': 'Profile' }, Object.keys(PRESETS).map(k =>
                        h('button', { class: k === p ? 'on' : null, role: 'radio', 'aria-checked': String(k === p), text: PROFILE_NAMES[k], onclick: () => { LAVA.profile = k; saveLava(); lavaLive('profile'); this.render(); } }))),
                    h('div', { class: 'd hint', text: 'Each profile remembers its own look. Edits below change ' + PROFILE_NAMES[p] + '.' }),
                    this.lsl('bgBlur', 'Blur', '× 100 px', { min: 0, max: 1.5, step: 0.01, hard: 4.5 }),
                    this.lsl('bgBrightness', 'Brightness', null, { min: 0, max: 2, step: 0.01, hard: 6 }),
                    this.lsl('bgSaturate', 'Saturation', null, { min: 0, max: 5, step: 0.05, hard: 15 }),
                    this.lsl('bgScale', 'Zoom', null, { min: 1, max: 2.5, step: 0.01, hard: 7.5 })))];
            out.push(this.fold(S.lavaOn, 'far', this.sec('Motion',
                this.row('Random motion', 'Off = a fixed animation', toggle(cur.randomize, () => { cur.randomize = !cur.randomize; saveLava(); lavaLive('randomize'); this.render(); }, 'Random motion')),
                this.fold(cur.randomize, 'on',
                    this.lsl('motionSpeed', 'Speed', '1 = normal, 2 = twice as fast', { min: 0.1, max: 4, step: 0.05, unit: '×', hard: 12 }),
                    this.lsl('motionAmount', 'Amount', 'How far it breathes, drifts, tilts and wanders', { min: 0, max: 3, step: 0.05, unit: '×', hard: 9 })),
                this.row('Moving color blobs', 'Turning these off saves the most GPU', toggle(cur.blobs, () => { cur.blobs = !cur.blobs; saveLava(); lavaLive('blobs'); this.render(); }, 'Moving color blobs')),
                this.fold(cur.blobs, 'on', this.lsl('blobSteps', 'Blob smoothness', 'Lower = cheaper, choppier', { min: 5, max: 240, step: 1, hard: 720 })),
                this.btns(['Shuffle motion', shuffle], ['Reset ' + PROFILE_NAMES[p], () => { LAVA.profiles[p] = Object.assign({}, PR); saveLava(); lavaLive('profile'); this.render(); }]))));
            const mine = r.gid && r.gid !== '@me' ? D.colors[r.gid] || '' : '';
            const others = Object.keys(D.colors).filter(g => g !== r.gid);
            out.push(this.sec('Colors',
                this.tgl('videoLava', 'Videos and streams', 'A playing video, stream or camera takes over the lava'),
                this.fold(S.videoLava, 'on',
                    this.sl('videoFps', 'Frame rate', 'Lower = cheaper; it is blurred anyway', { min: 1, max: 60, step: 1, unit: 'fps' }),
                    this.sl('videoWidth', 'Frame copy width', 'Small is fine behind the blur', { min: 32, max: 512, step: 16, unit: 'px' }),
                    this.tgl('videoCropBars', 'Crop black bars', 'Leaves bars baked into a video out of the lava')),
                this.tgl('clearMedia', 'Lava around opened media', 'A picture or video opened full size, or a video in fullscreen, sits in the glass and lava instead of black'),
                this.tgl('voiceLava', 'Voice in the lava', 'In a call, the lava takes the avatar of whoever is talking'),
                this.fold(S.voiceLava, 'on', this.ch('voiceWhere', 'Where', 'Anywhere = while you\'re connected, whatever you\'re looking at', [['call', 'Call screen'], ['any', 'Anywhere']])),
                this.tgl('profileLava', 'Profiles in the lava', 'Opening someone\'s profile takes their banner or avatar'),
                this.tgl('followMedia', 'Follow media as you scroll', 'The picture closest to the middle of the chat'),
                this.tgl('serverTint', 'Server colors', 'Nothing on screen? Your color for the server, its icon, then its banner. Off = Discord purple'),
                this.fold(S.serverTint, 'on',
                    r.gid && r.gid !== '@me' ? this.row('This server\'s color', mine ? 'Yours, instead of its icon and banner' : 'From its icon. Pick one to use your own',
                        h('div', { class: 'inline' }, h('input', { class: 'color', type: 'color', value: mine || hexOf(serverRgb(r.gid, DC.guildIcon(r.gid))), 'aria-label': 'This server\'s color',
                            onchange: e => { D.colors[r.gid] = e.target.value.toLowerCase(); store.colors(); refreshAll(); scheduleArt(0); } }),
                            mine ? h('button', { class: 'btn sm', type: 'button', text: 'Reset', onclick: () => { delete D.colors[r.gid]; store.colors(); refreshAll(); scheduleArt(0); } }) : null))
                        : this.note('Open a server to pick its color.'),
                    others.length ? this.row('Other servers with your color', others.length + ' server' + (others.length === 1 ? '' : 's'),
                        h('button', { class: 'btn sm', type: 'button', text: 'Clear', onclick: () => { for (const g of others) delete D.colors[g]; store.colors(); refreshAll(); } })) : null)));
            out.push(this.sec('Glass',
                this.sl('frost', 'Frost on the chat', '0 = perfectly clear glass', { min: 0, max: 0.4, step: 0.01 }),
                this.sl('blur', 'Blur behind panes', '0 = see the lava sharp through the glass (fastest)', { min: 0, max: 30, step: 1, unit: 'px' }),
                this.sl('chrome', 'Sidebar & header frost', 'A little haze on the server list, channels and members', { min: 0, max: 1, step: 0.05 }),
                this.sl('radius', 'Roundness', null, { min: 0, max: 28, step: 1, unit: 'px' }),
                this.tgl('edges', 'Bright edges', 'One thin white line around the message box, embeds and menus'),
                this.tgl('textShadow', 'Text shadow', 'Keeps the white writing readable over bright lava'),
                this.tgl('clearVideo', 'See-through video bars', 'The black around narrow or wide videos shows the glass and lava instead'),
                this.tgl('cleanup', 'Clear leftover solid backgrounds', 'Finds big solid blocks Discord paints and makes them see-through'),
                this.btns(['Reset glass', () => save(Object.fromEntries(['frost', 'blur', 'chrome', 'radius', 'edges', 'textShadow', 'clearVideo', 'cleanup'].map(k => [k, SPEC[k].d])))])));
            out.push(this.sec('Mentions and keywords',
                this.tgl('mentionGlow', 'Lava glow on mentions', 'Messages that mention you glow in the lava\'s color'),
                this.fold(S.mentionGlow, 'on',
                    this.tgl('mentionBlobs', 'Lava blobs', 'Soft blobs drifting inside the glow'),
                    this.ch('mentionStrength', 'Strength', null, [['soft', 'Soft'], ['medium', 'Medium'], ['bright', 'Bright']]),
                    h('div', { class: 'fld' }, h('div', { class: 't', text: 'Keywords' }), h('div', { class: 'd', text: 'Messages with these words glow too. Separate them with commas.' }),
                        this.text(S.keywords, 'e.g. pizza, raid night', v => save({ keywords: v }), 'Keywords', 300)))));
            out.push(this.sec('Performance',
                this.tgl('pauseScroll', 'Pause the lava while scrolling', 'Smoother on long chats'),
                this.tgl('pauseUnfocused', 'Pause when Discord isn\'t the active window', 'Even when you can still see it on another screen'),
                this.tgl('easeCalls', 'Calm during calls and streams', 'Switches to Calm while you\'re in a call or watching a stream'),
                this.note('No media on screen? The lava uses your color for the server, its icon, then its banner, and last Discord purple. Hold a slider to see through this panel.')));
            return out;
        },

        /* ---------- Favorites ---------- */
        favorites() {
            const out = [];
            if (!S.enabled) out.push(this.offNote());
            const up = D.reminders.filter(x => !x.done).length;
            const views = [['channels', 'Channels', D.favs.length], ['messages', 'Messages', D.saved.items.length], ['reminders', 'Reminders', up]];
            out.push(h('div', { class: 'subs', role: 'tablist', 'aria-label': 'Favorites' }, views.map(([k, t, n]) =>
                h('button', { class: k === this.sub ? 'on' : null, role: 'tab', 'aria-selected': String(k === this.sub), onclick: () => { this.sub = k; this.edit = null; this.folder = null; this.render(); } },
                    h('span', { text: t }), n ? h('i', { text: String(n) }) : null))));
            return out.concat(this.sub === 'messages' ? this.messages() : this.sub === 'reminders' ? this.reminders() : this.channels());
        },
        channels() {
            const here = DC.here(), r = DC.route(), out = [];
            const status = h('div', { class: 'd status' });
            const paste = this.text('', 'Paste a channel link…', v => {
                const l = parseLink(v);
                if (!l) { status.textContent = v ? 'That isn\'t a Discord channel link.' : ''; return; }
                if (isFav(l.gid, l.cid)) { status.textContent = 'Already in your favorites.'; return; }
                toggleFav(describe(l.gid, l.cid));
            }, 'Paste a channel link');
            paste.dataset.link = '1';
            const inFav = here && isFav(here.gid, here.cid);
            out.push(h('div', { class: 'addcard' }, h('div', { class: 'label', text: 'Add a favorite' }),
                h('div', { class: 'addrow' }, paste, h('button', { class: 'btn primary', type: 'button', text: 'Add', onclick: e => { const i = e.currentTarget.previousElementSibling; i.dispatchEvent(new Event('change')); } })),
                here ? h('button', { class: 'lp' + (inFav ? ' on' : ''), type: 'button', text: (inFav ? 'In favorites: ' : 'Add this channel: ') + sigil(here) + here.name, onclick: () => toggleFav(here) })
                    : h('div', { class: 'd', text: 'Or point at a channel in the list on the left and click its lava drop.' }), status));
            out.push(this.sec('Favorites',
                h('div', { class: 'd hint', text: D.favs.length ? 'Pointing at the lava button shows the first 10. Drag the grips to reorder.' : 'Nothing here yet.' }),
                D.favs.length ? h('div', { class: 'list' }, D.favs.map(f => this.favRow(f))) : null));
            out.push(this.sec('This channel',
                here ? h('div', { class: 'fld' }, h('div', { class: 't', text: 'Note' }), h('div', { class: 'd', text: 'Shows beside the channel name at the top' }),
                    this.text(D.notes[r.cid] || '', 'Add a short note…', v => { if (v) D.notes[r.cid] = v; else delete D.notes[r.cid]; store.notes(); refreshAll(); }, 'Channel note', 200))
                    : this.note('Open a channel to give it a note.')));
            out.push(this.fold(S.enabled, 'far', this.sec('Lava button',
                this.tgl('favHover', 'Show favorites when you point at it', 'Off = the lava button only opens this panel'),
                this.tgl('favDrops', 'Lava drop on channels', 'Point at a channel in the list on the left and click its drop to add or remove it'))));
            out.push(this.sec('Recent',
                this.tgl('keepRecent', 'Keep a Recent list', 'The last ' + RECENT_CAP + ' channels you opened, on this computer'),
                this.fold(S.keepRecent, 'on',
                    D.recent.length ? h('div', { class: 'list' }, D.recent.map(f => h('div', { class: 'item' },
                        h('button', { class: 'go', type: 'button', onclick: () => DC.go(pathOf(f)) }, placeIcon(f), h('span', { class: 'tx' }, h('div', { class: 't', text: sigil(f) + ' ' + f.name }), h('div', { class: 'd', text: f.server }))),
                        h('button', { class: 'ib' + (isFav(f.gid, f.cid) ? ' on' : ''), type: 'button', title: isFav(f.gid, f.cid) ? 'Remove from favorites' : 'Add to favorites', 'aria-label': isFav(f.gid, f.cid) ? 'Remove from favorites' : 'Add to favorites', onclick: () => toggleFav(f) }, lavaIcon(16)))))
                        : this.note('Channels you open show up here.'),
                    D.recent.length ? this.btns(['Clear recent', () => { D.recent = []; store.recent(); this.render(); }]) : null)));
            return out;
        },
        // Messages: folders first, as lava tiles; open one to see what's in it
        messages() {
            const out = [], F = D.saved.folders, count = id => D.saved.items.filter(x => x.folder === id).length;
            if (this.folder === null) {
                const newIn = this.text('', 'Name it, then Enter', v => { if (v) { this.folder = addFolder(v) || null; this.render(); } }, 'New folder name', 30);
                newIn.hidden = true;
                const tile = f => h('button', { class: 'tile', type: 'button', onclick: () => { this.folder = f.id; this.edit = null; this.render(); } },
                    h('span', { class: 'ficon' }, icon(f.id ? ICONS.folder : ICONS.inbox, 17)), h('span', { class: 'tn', text: f.name }), h('span', { class: 'tc', text: count(f.id) + (count(f.id) === 1 ? ' message' : ' messages') }));
                out.push(this.sec('Folders',
                    h('div', { class: 'tiles' }, [{ id: '', name: 'Unsorted' }, ...F].map(tile),
                        h('button', { class: 'tile add', type: 'button', onclick: e => { e.currentTarget.hidden = true; newIn.hidden = false; newIn.focus(); } }, h('span', { class: 'plus', text: '+' }), h('span', { class: 'tn', text: 'New folder' }))),
                    newIn));
                const latest = D.saved.items.slice(0, 5);
                out.push(this.sec('Latest saves', latest.length ? h('div', { class: 'list' }, latest.map(x => this.savedRow(x, true))) : this.note('Point at any message and click its lava drop to save it here.')));
            } else {
                const f = folderOf(this.folder), items = D.saved.items.filter(x => x.folder === this.folder);
                const renaming = this.edit === 'rename';
                out.push(h('div', { class: 'fhead' },
                    h('button', { class: 'back', type: 'button', 'aria-label': 'All folders', title: 'All folders', onclick: () => { this.folder = null; this.edit = null; this.render(); } }, icon(['m15 6-6 6 6 6'], 16)),
                    h('span', { class: 'ficon' }, icon(f.id ? ICONS.folder : ICONS.inbox, 17)), h('div', { class: 'tx' }, h('div', { class: 'fn', text: f.name }), h('div', { class: 'd', text: items.length + (items.length === 1 ? ' message' : ' messages') })),
                    f.id ? h('button', { class: 'ib', type: 'button', 'aria-label': 'Rename folder', title: 'Rename', 'aria-expanded': String(renaming), onclick: () => { this.edit = renaming ? null : 'rename'; this.render(); } }, icon(['M4 20h4L19 9l-4-4L4 16z'], 13)) : null,
                    f.id ? h('button', { class: 'ib', type: 'button', 'aria-label': 'Delete folder', title: 'Delete folder (its messages move to Unsorted)', onclick: () => { for (const x of D.saved.items) if (x.folder === f.id) x.folder = ''; D.saved.folders = F.filter(y => y.id !== f.id); this.folder = null; store.saved(); this.render(); } }, icon(['M5 7h14', 'M10 11v6', 'M14 11v6', 'M6 7l1 12h10l1-12', 'M9 7V4h6v3'], 13)) : null));
                if (renaming) out.push(h('div', { class: 'sec' }, this.text(f.name, 'Folder name', v => { if (v) { f.name = v.slice(0, 30); store.saved(); } this.edit = null; this.render(); }, 'Folder name', 30)));
                out.push(this.sec(null, items.length ? h('div', { class: 'list' }, items.map(x => this.savedRow(x))) : this.note('Nothing in here yet. Point at a message, click its lava drop and pick ' + f.name + '.')));
            }
            const status = h('div', { class: 'd status' });
            const paste = this.text('', 'Paste a message link…', v => {
                const l = parseLink(v);
                if (!l || !l.mid) { status.textContent = v ? 'That isn\'t a link to a message (right-click one, Copy Message Link).' : ''; return; }
                const place = describe(l.gid, l.cid);
                saveMessage(Object.assign(cleanPlace(place), { mid: l.mid, title: 'Message in ' + sigil(place) + place.name, author: '', at: Date.now() }), this.folder || '');
            }, 'Paste a message link');
            paste.dataset.link = '1';
            out.push(this.sec('Save by link', paste, status));
            out.push(this.fold(S.enabled, 'far', this.sec('Lava drop on messages',
                this.tgl('msgDrops', 'Lava drop on messages', 'Point at a message and click its drop to save it or set a reminder'))));
            return out;
        },
        savedRow(x, showFolder) {
            const editing = this.edit === 's' + x.mid, f = folderOf(x.folder);
            const row = h('div', { class: 'item' + (editing ? ' open' : '') },
                h('button', { class: 'go', type: 'button', title: 'Jump to the message', onclick: () => DC.go(pathOf(x)) }, placeIcon(x),
                    h('span', { class: 'tx' }, h('div', { class: 't wrap', text: x.title }),
                        h('div', { class: 'd wrap', text: [x.note, showFolder ? f.name : '', sigil(x) + x.name, new Date(x.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })].filter(Boolean).join(' · ') }))),
                h('button', { class: 'ib', type: 'button', 'aria-label': 'Edit', title: 'Rename, add a note, move or set a reminder', 'aria-expanded': String(editing), onclick: () => { this.edit = editing ? null : 's' + x.mid; this.render(); } }, icon(['M4 20h4L19 9l-4-4L4 16z'], 13)),
                h('button', { class: 'ib', type: 'button', 'aria-label': 'Remove', title: 'Remove', onclick: () => { D.saved.items = D.saved.items.filter(y => y !== x); store.saved(); refreshAll(); } }, gwCloseIcon()));
            if (!editing) return row;
            return h('div', {}, row, h('div', { class: 'editor' },
                this.text(x.title, 'Title', v => { x.title = v || x.title; store.saved(); this.render(); }, 'Title', 120),
                this.text(x.note, 'Note (optional)', v => { x.note = v; store.saved(); this.render(); }, 'Note', 200),
                h('div', { class: 'elabel', text: 'Folder' }),
                h('div', { class: 'pills' }, folderPills(x.folder, id => { x.folder = id; store.saved(); this.render(); })),
                h('div', { class: 'elabel', text: 'Remind me' }),
                remindPicker(due => { remind(x, due); this.edit = null; this.sub = 'reminders'; this.render(); })));
        },
        // Reminders: what's coming with a live countdown, and what you missed
        reminders() {
            const now = Date.now(), live = D.reminders.filter(x => !x.done).sort((a, b) => a.due - b.due);
            const missed = live.filter(x => x.due <= now), up = live.filter(x => x.due > now);
            const row = (x, late) => {
                const editing = this.edit === 'r' + x.id;
                const line = h('div', { class: 'item' + (editing ? ' open' : '') },
                    h('button', { class: 'go', type: 'button', title: 'Jump to the message', onclick: () => DC.go(pathOf(x)) }, placeIcon(x),
                        h('span', { class: 'tx' }, x.note ? h('div', { class: 'rn wrap', text: x.note }) : null, h('div', { class: 't wrap', text: x.title }), h('div', { class: 'd wrap', text: fmtTime(x.due) + ' · ' + sigil(x) + x.name }))),
                    h('span', { class: 'cd' + (late ? ' late' : ''), 'data-due': String(x.due), text: countdown(x.due) }),
                    h('button', { class: 'ib', type: 'button', 'aria-label': 'Edit reminder', title: 'Add a note or change the time', 'aria-expanded': String(editing), onclick: () => { this.edit = editing ? null : 'r' + x.id; this.render(); } }, icon(['M4 20h4L19 9l-4-4L4 16z'], 13)),
                    late ? h('button', { class: 'ib', type: 'button', 'aria-label': 'Snooze an hour', title: 'Snooze an hour', onclick: () => finishReminder(x.id, 36e5) }, icon(['M12 7v5l3 2', 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z'], 13)) : null,
                    h('button', { class: 'ib', type: 'button', 'aria-label': late ? 'Done' : 'Cancel reminder', title: late ? 'Done' : 'Cancel', onclick: () => finishReminder(x.id) }, gwCloseIcon()));
                if (!editing) return line;
                return h('div', {}, line, h('div', { class: 'editor' },
                    this.text(x.note, 'What\'s this for? (optional)', v => { x.note = v; store.reminders(); this.render(); }, 'Note', 200),
                    h('div', { class: 'elabel', text: 'Change the time' }),
                    remindPicker(due => { x.due = Math.min(Date.now() + REMIND_MAX, Math.max(Date.now() + 60e3, due)); x.shown = 0; D.reminders.sort((a, b) => a.due - b.due); store.reminders(); this.edit = null; this.render(); })));
            };
            return [
                missed.length ? this.sec('Missed', h('div', { class: 'list' }, missed.map(x => row(x, true))), this.btns(['Done with all', () => { for (const x of missed) finishReminder(x.id); }])) : null,
                this.sec('Coming up', up.length ? h('div', { class: 'list' }, up.map(x => row(x, false))) : this.note('Nothing coming up. Set one from a message\'s lava drop, or from a saved message.')),
                this.sec(null, this.note('Reminders pop up in Discord when they\'re due. Any that come due while Discord is closed show up the next time it opens. Up to a year ahead.')),
            ];
        },
        // one favorite: a grip to drag it (as in Prism's source list), the place, and edit / remove
        favRow(f) {
            const editing = this.edit === 'f' + keyOf(f);
            const grip = h('button', { class: 'grip', type: 'button', 'aria-label': 'Move ' + f.name, title: 'Drag to reorder' }, icon(ICONS.grip, 15, 3));
            const wrap = h('div', { class: 'fw', 'data-k': keyOf(f) },
                h('div', { class: 'item' + (editing ? ' open' : '') }, grip,
                    h('button', { class: 'go', type: 'button', onclick: () => DC.go(pathOf(f)) }, placeIcon(f),
                        h('span', { class: 'tx' }, h('div', { class: 't', text: sigil(f) + ' ' + f.name }), h('div', { class: 'd', text: (f.note ? f.note + ' · ' : '') + f.server }))),
                    h('button', { class: 'ib', type: 'button', 'aria-label': 'Edit ' + f.name, title: 'Rename or add a note', 'aria-expanded': String(editing), onclick: () => { this.edit = editing ? null : 'f' + keyOf(f); this.render(); } }, icon(['M4 20h4L19 9l-4-4L4 16z'], 13)),
                    h('button', { class: 'ib', type: 'button', 'aria-label': 'Remove ' + f.name, title: 'Remove', onclick: () => toggleFav(f) }, gwCloseIcon())),
                editing ? h('div', { class: 'editor' },
                    this.text(f.name, 'Name', v => { f.name = v || describe(f.gid, f.cid).name; f.named = !!v; store.favs(); refreshAll(); }, 'Name', 80),
                    this.text(f.note, 'Note (optional)', v => { f.note = v; store.favs(); refreshAll(); }, 'Note', 200)) : null);
            this.dragify(grip, wrap);
            return wrap;
        },
        // Drag a row by its grip and the others make room as it passes; arrow keys on the grip move it too.
        dragify(grip, row) {
            const commit = () => {
                const list = row.parentElement; if (!list) return;
                const order = [...list.children].map(r => r.dataset.k);
                if (order.join() === D.favs.map(keyOf).join()) return;
                const by = Object.fromEntries(D.favs.map(f => [keyOf(f), f]));
                D.favs = order.map(k => by[k]).filter(Boolean);
                store.favs(); refreshAll();
            };
            grip.addEventListener('pointerdown', e => {
                if (this.dragging || e.button > 0) return;
                const id = e.pointerId, list = row.parentElement;
                e.preventDefault();
                // listen on the window: moving the row in the page drops pointer capture
                this.dragging = true; row.classList.add('drag');
                const move = ev => {
                    if (ev.pointerId !== id) return;
                    let before = null;
                    for (const r of list.children) { if (r === row) continue; const b = r.getBoundingClientRect(); if (ev.clientY < b.top + b.height / 2) { before = r; break; } }
                    if (before ? row.nextElementSibling !== before : list.lastElementChild !== row) list.insertBefore(row, before);
                };
                const end = ev => {
                    if (ev.pointerId !== id) return;
                    removeEventListener('pointermove', move, true); removeEventListener('pointerup', end, true); removeEventListener('pointercancel', end, true);
                    this.dragging = false; row.classList.remove('drag');
                    commit();
                };
                addEventListener('pointermove', move, true); addEventListener('pointerup', end, true); addEventListener('pointercancel', end, true);
            });
            grip.addEventListener('keydown', e => {
                if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                e.preventDefault();
                const list = row.parentElement, k = row.dataset.k;
                if (e.key === 'ArrowUp' && row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
                if (e.key === 'ArrowDown' && row.nextElementSibling) list.insertBefore(row.nextElementSibling, row);
                commit();
                setTimeout(() => { const g = this.panel && [...this.panel.querySelectorAll('.fw')].find(r => r.dataset.k === k); if (g) g.querySelector('.grip').focus(); }, 0);
            });
        },

        /* ---------- Privacy ---------- */
        /* ---------- Activity: your Discord, in Hourglass's dashboard shape ---------- */
        // every card asks one question and answers it in plain short sentences first (CLAUDE.md: Dashboards)
        activity() {
            const out = [];
            if (!S.enabled) out.push(this.offNote());
            else if (!S.track) out.push(this.sec(null, this.note('Activity is off, so nothing new is counted. Turn it on at the bottom of this tab.')));
            const A = actData(this.range), nowTxt = A.now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const card = (q, ans, ranged, ...kids) => h('div', { class: 'qc', 'data-q': q, 'data-range': ranged ? '' : null }, h('div', { class: 'label', text: q }), h('div', { class: 'ans', text: ans }), ...kids);
            const level = text => h('div', { class: 'lvl', text });
            const dayTip = x => x.dt.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
            const span = !A.full && A.win.length ? [...A.win, A.today] : A.win;
            const dayLabel = x => x === A.today ? 'Today so far' : dayTip(x);
            const stat = (big, small) => h('div', null, h('b', { text: big }), h('span', { text: small }));
            const n1 = v => String(Math.round(v));
            const dots = v => `--s:${(.42 + .58 * Math.sqrt(Math.min(1, v))).toFixed(2)};--d:${Math.round(25 + 75 * Math.min(1, v))}%`;

            /* ── at a glance ── */
            out.push(level('At a glance'));
            const U = A.usual, kind = U ? U.kind : '';
            let todayAns;
            if (!U) todayAns = "Today's your first day being counted. Your usual shows up tomorrow.";
            else if (U.now < 300) todayAns = `You're usually on under 5m by ${nowTxt} on a ${kind}. Today you're at ${fmtDur(A.todayTot)}.`;
            else {
                const d = A.todayTot - U.now;
                todayAns = Math.abs(d) < Math.max(300, U.now * .1) ? `You're right around your usual ${kind} for ${nowTxt}.`
                    : `You're ${fmtDur(Math.abs(d))} ${d > 0 ? 'above' : 'below'} your usual ${kind} for ${nowTxt}.`;
            }
            const T = A.today.o, clockOf = m => (Math.floor(m / 60) % 12 || 12) + ':' + String(m % 60).padStart(2, '0') + (m < 720 ? ' AM' : ' PM');
            out.push(card("How's today going?", todayAns, false,
                h('div', { class: 'stats four' },
                    stat(fmtDur(A.todayTot), 'so far today'),
                    stat(String(T.ss), T.ss === 1 ? 'session today' : 'sessions today'),
                    stat(String(A.todayMsgs), A.todayMsgs === 1 ? 'message sent' : 'messages sent'),
                    stat(T.first != null ? clockOf(T.first) : '—', 'first opened')),
                U ? h('div', { class: 'd', style: 'margin-top:8px' }, 'By now you usually have ', h('b', { text: fmtDur(U.now) }), '.', kind !== 'day' ? [' A whole ' + kind + ' is usually ', h('b', { text: fmtDur(U.day) }), '.'] : null) : null));

            /* ── where and when: the bubbles, with what they show and the range on an orbit around them ── */
            out.push(level('Where and when'));
            const F = A.lists[this.field] ? this.field : 'time', L = A.lists[F], L0 = L[0], LT = sumOf(L.map(e => e.v)), pc = L0 ? Math.round(L0.v / LT * 100) : 0;
            const msgsOf = v => Math.round(v) + (Math.round(v) === 1 ? ' message' : ' messages');
            const Q = { time: 'Where does your time go?', msgs: 'Where do you talk?', people: 'Who do you spend time with?', channels: 'Which channels hold you?' }[F];
            let hero;
            if (!L0) hero = { time: 'Nothing counted yet. Bubbles fill in as you use Discord.', msgs: 'Nothing sent yet. Bubbles fill in as you talk.',
                people: 'Nothing in your DMs yet. Bubbles fill in as you chat.', channels: 'Nothing counted yet. Bubbles fill in as you use Discord.' }[F];
            else if (A.firstDay) hero = `Nothing finished yet. ${L0.name} leads today so far.`;
            else hero = { time: `${L0.name} took the most time ${A.inP}. That's ${pc}% of your Discord time.`,
                msgs: `${L0.name} got the most of your messages ${A.inP}. That's ${pc}% of them.`,
                people: `You spent the most time with ${L0.name} ${A.inP}. That's ${pc}% of your DM time.`,
                channels: `${L0.name} held you the longest ${A.inP}. That's ${pc}% of your channel time.` }[F];
            out.push(card(Q, hero, A.full && !A.firstDay, this.orbit(L, LT, F === 'msgs' ? msgsOf : fmtDur, F)));

            // How much are you on Discord? (a bar per day, with the average)
            let muchAns;
            if (!A.win.length) muchAns = 'Your daily average shows up after your first full day.';
            else if (A.avgWas == null) muchAns = `You averaged ${fmtDur(A.avgNow)} a day ${A.inP}.`;
            else { const d = A.avgNow - A.avgWas; muchAns = `You averaged ${fmtDur(A.avgNow)} a day ${A.inP}. ` + (Math.abs(d) < 300 ? "That's about the same as before." : `That's ${fmtDur(Math.abs(d))} ${d > 0 ? 'more' : 'less'} than before.`); }
            const dtop = Math.ceil(Math.max(3600, ...span.map(x => dayTot(x.o))) / 3600) * 3600;
            out.push(card('How much are you on Discord?', muchAns, A.full,
                A.win.length ? this.barChart({ name: 'days', aria: 'Time on Discord each day, with your average', bars: span.map(x => ({ v: dayTot(x.o), now: x === A.today, tip: dayLabel(x) + ' · ' + fmtDur(dayTot(x.o)) })),
                    max: dtop, top: fmtDur(dtop), line: { v: A.avgNow, text: 'avg' }, x: this.xDays(span, A.today) }) : null));

            // How much do you talk? (messages a day)
            let talkAns;
            if (!A.win.length) talkAns = 'Messages you send show up after your first full day.';
            else if (!A.msgNow) talkAns = `You didn't send any messages ${A.inP}.`;
            else {
                talkAns = `You sent ${n1(A.msgNow)} messages a day ${A.inP}.`;
                if (A.msgWas != null) { const d = A.msgNow - A.msgWas; talkAns += Math.abs(d) < Math.max(2, A.msgWas * .1) ? " That's about as many as before." : ` That's ${d > 0 ? 'up' : 'down'} from ${n1(A.msgWas)}.`; }
            }
            const mtop = Math.max(10, Math.ceil(Math.max(...span.map(x => dayMsgs(x.o))) / 10) * 10);
            out.push(card('How much do you talk?', talkAns, A.full,
                A.win.length ? this.barChart({ name: 'messages', aria: 'Messages you sent each day', bars: span.map(x => ({ v: dayMsgs(x.o), now: x === A.today, tip: dayLabel(x) + ' · ' + msgsOf(dayMsgs(x.o)) })),
                    max: mtop, top: String(mtop), x: this.xDays(span, A.today) }) : null));

            /* ── what's changing ── */
            out.push(level("What's changing"));
            let chAns; const top = A.moved[0];
            if (!A.enough) chAns = `Changes show up after ${A.need} more day${A.need === 1 ? '' : 's'} of history.`;
            else if (!top) chAns = `Nothing moved much ${A.inP}. Every place stayed within 5m a day.`;
            else if (top.was < 60) chAns = `${top.name} is new ${A.inP}. It's at ${fmtDur(top.now)} a day.`;
            else chAns = `${top.name} ${top.d > 0 ? 'rose' : 'dropped'} the most ${A.inP}. It went from ${fmtDur(top.was)} to ${fmtDur(top.now)} a day.`;
            const sign = d => (d > 0 ? '+' : '−') + fmtDur(Math.abs(d));
            const big = Math.max(1, ...A.moved.map(s => Math.max(s.now, s.was)));
            out.push(card('What changed?', chAns, A.full,
                A.moved.length ? h('div', { class: 'sl', text: 'Places that moved · time a day · each day' }) : null,
                A.moved.map(s => h('button', { class: 'srow2', type: 'button', title: 'Go to ' + s.name, onclick: () => DC.go(s.go) },
                    this.bubbleFace(s, 30, Math.max(s.now, s.was) / big), h('div', { class: 'nm' }, h('b', { class: s.dm ? 'who' : null, text: s.name }), h('small', { text: fmtDur(s.was) + ' → ' + fmtDur(s.now) })),
                    this.spark(s), h('div', { class: 'delta ' + (s.d > 0 ? 'up' : 'down'), text: sign(s.d) })))));

            // When are you on? (weekday by hour: a dot per hour, bigger and deeper the more you're on)
            let whenAns;
            if (!A.hTot) whenAns = 'Nothing yet. Your busiest hours show up after a full day.';
            else {
                whenAns = `Your busiest hours ${A.inP} were ${hourName(A.peak)} to ${hourName((A.peak + 3) % 24)}.`;
                if (A.cWas != null) { const r = Math.round((A.cNow - A.cWas) * 2) / 2, a = Math.abs(r);
                    whenAns += a < .5 ? " That's about the same time as before." : " That's about " + (a === .5 ? 'half an hour' : a === 1 ? 'an hour' : (Math.floor(a) + (a % 1 ? '½' : '')) + ' hours') + (r > 0 ? ' later' : ' earlier') + ' than before.'; }
            }
            const gmax = Math.max(60, ...A.grid.flat());
            const scale = text => h('div', { class: 'scale', 'data-axis': 'y' }, 'Less', [.15, .45, .75, 1].map(v => h('i', { style: dots(v) })), 'More', h('span', { style: 'margin-left:6px', text: text }));
            out.push(card('When are you on?', whenAns, A.full,
                A.hTot ? h('div', { class: 'ch hmw', 'data-chart': 'hours', role: 'img', 'aria-label': 'Average time on Discord by weekday and hour' },
                    h('div', { class: 'hya', 'data-axis': 'y' }, WEEKDAYS.map(d => h('span', { text: d.slice(0, 3) }))),
                    h('div', { class: 'hm' }, A.grid.flatMap((row, ri) => row.map((v, i) => { const tip = WEEKDAYS[ri] + 's, ' + hourName(i) + ' · ' + fmtDur(v) + ' on average';
                        return h('span', { title: tip, 'data-tip': tip }, v >= 30 ? h('i', { style: dots(v / gmax) }) : null); }))),
                    this.xHours(), scale('· time on Discord in that hour')) : null,
                A.hTot ? h('div', { class: 'd', style: 'margin-top:8px', text: `Those three hours hold ${Math.round(A.peakShare * 100)}% of your Discord time.` }) : null));

            // How often are you on? (five whole weeks of dots)
            const nDays = A.calDays.length;
            const oftenAns = !nDays ? 'Nothing yet. Days fill in as you use Discord.' : nDays === 1 ? 'Today is the first day counted. Days fill in from here.'
                : `You opened Discord on ${A.calOn} of the last ${nDays} days.` + (A.run >= 2 ? ` You're on a ${A.run}-day run.` : A.best >= 2 ? ` Your best run is ${A.best} days.` : '');
            const ctop = Math.max(3600, ...A.cal.map(c => c.v));
            const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
            out.push(card('How often are you on?', oftenAns, false,
                h('div', { class: 'ch calw', 'data-chart': 'calendar', role: 'img', 'aria-label': 'The last five weeks: how long you were on Discord each day' },
                    h('div', { class: 'cya', 'data-axis': 'y' }, [0, 1, 2, 3, 4].map(r => h('span', { text: shortDate(A.cal[r * 7].dt) }))),
                    h('div', { class: 'cal' }, A.cal.map(c => { const tip = (c.today ? 'Today so far' : dayTip(c)) + ' · ' + (c.future ? 'still to come' : !c.counted ? 'not counted' : fmtDur(c.v));
                        return h('span', { class: (c.future ? 'future' : !c.counted ? 'none' : '') + (c.today ? ' today' : ''), title: tip, 'data-tip': c.future ? null : tip }, c.on ? h('i', { style: dots(c.v / ctop) }) : null); })),
                    h('div', { class: 'xa', 'data-axis': 'x', style: 'grid-template-columns:repeat(7,minmax(0,1fr))' }, letters.map(l => h('span', { text: l }))),
                    scale('· time on Discord that day'))));

            // What are your records? (finished days, all you keep)
            const R0 = A.rec, rd = x => shortDate(x.dt);
            const recAns = !R0.long ? 'Records show up after your first full day.' : `Your longest session was ${fmtDur(R0.long.o.long)} on ${rd(R0.long)}.`;
            out.push(card('What are your records?', recAns, false,
                R0.day || R0.msgs ? h('div', { class: 'stats' },
                    R0.day ? stat(fmtDur(dayTot(R0.day.o)), 'busiest day · ' + rd(R0.day)) : null,
                    R0.msgs ? stat(msgsOf(dayMsgs(R0.msgs.o)), 'most in a day · ' + rd(R0.msgs)) : null) : null));

            /* ── settings ── */
            out.push(this.fold(S.enabled, 'far', this.sec('Activity',
                this.tgl('track', 'Count my activity', 'Time while Discord is in front and you\'re using it, and messages you send. Stays in this browser.'),
                this.fold(S.track, 'on', this.ch('trackDays', 'Keep', 'Older days are deleted', [['30', '30 days'], ['90', '90 days'], ['365', '1 year']])),
                this.note('Export or erase it in General, under Your data.'))));
            if (matchMedia('(pointer: coarse)').matches) for (const c of out) if (c.dataset && c.dataset.q !== undefined && !c.querySelector('.orb') && c.querySelector('[data-tip]')) this.tapTips(c);
            return out;
        },
        // Your data, laid out like Hourglass's: where it's kept, then export, import and erase. Erasing asks
        // first, in words, and waits for OK.
        yourData() {
            const btn = (text, ic, fn, cls) => h('button', { class: 'btn' + (cls ? ' ' + cls : ''), type: 'button', onclick: fn }, icon(ic, 13, 2.2), text);
            const ask = this.eraseAsk ? h('div', { class: 'ask', role: 'alertdialog', 'aria-label': 'Erase your activity' },
                h('div', { class: 't', text: 'Erase all your activity?' }),
                h('div', { class: 'd', text: 'Every day of time and messages counted here is deleted. Favorites, saved messages and reminders stay. This can\'t be undone.' }),
                h('div', { class: 'btns' }, h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => { this.eraseAsk = false; this.render(); } }),
                    h('button', { class: 'btn danger-fill', type: 'button', text: 'OK, erase', onclick: () => { ACT.clear(); this.eraseAsk = false; this.dataMsg = 'Your activity was erased.'; this.render(); } }))) : null;
            return this.sec('Your data',
                h('div', { class: 'd', text: 'Saved only in Tampermonkey in this browser. A saved message keeps a short preview (its first 80 characters), its author and a link. Exports leave out the names Screenshot safe hides.' }),
                h('div', { class: 'dbtns' },
                    btn('Export CSV', ICONS.down, () => exportActivity()),
                    btn('Export data', ICONS.down, () => exportData()),
                    btn('Import data', ICONS.up, () => importData(m => { this.dataMsg = m; this.render(); })),
                    btn('Erase activity', ICONS.trash, () => { this.eraseAsk = true; this.dataMsg = ''; this.render(); }, 'danger')),
                ask, this.dataMsg ? h('div', { class: 'd imp', role: 'status', text: this.dataMsg }) : null);
        },
        // a button that asks once more before it does something you can't undo
        confirmBtn(text, again, fn) {
            const b = h('button', { class: 'btn', type: 'button', text, onclick: () => { if (b.dataset.armed) fn(); else { b.dataset.armed = '1'; b.textContent = again; b.classList.add('warn'); } } });
            b.addEventListener('blur', () => { delete b.dataset.armed; b.textContent = text; b.classList.remove('warn'); });
            return h('div', { class: 'btns' }, b);
        },
        tapTips(c, hint) {
            const read = h('div', { class: 'readout', text: hint || 'Tap a day for details' });
            c.append(read);
            c.addEventListener('click', e => { const t = e.target.closest('[data-tip]'); if (!t || !c.contains(t)) return;
                c.querySelectorAll('.tapped').forEach(x => x.classList.remove('tapped')); t.classList.add('tapped'); read.textContent = t.dataset.tip; read.classList.add('on'); });
        },
        xDays(days, today) {
            return h('div', { class: 'xa', 'data-axis': 'x', style: `grid-template-columns:repeat(${days.length},minmax(0,1fr))` },
                days.length <= 8 ? days.map(x => h('span', { class: x === today ? 'now' : null, text: x.dt.toLocaleDateString(undefined, { weekday: 'narrow' }) }))
                    : days.map((x, i) => i % 7 ? null : h('span', { style: 'grid-column:span 7;text-align:left', text: shortDate(x.dt) })));
        },
        xHours() { return h('div', { class: 'xa', 'data-axis': 'x', style: 'grid-template-columns:repeat(4,minmax(0,1fr))' }, ['12 AM', '6 AM', '12 PM', '6 PM'].map(x => h('span', { style: 'text-align:left', text: x }))); },
        // a bar per day against max, a gridline at the top, a dashed average if given, labelled axes (as in Hourglass)
        barChart({ name, aria, bars, max, top, line, x }) {
            const n = bars.length;
            return h('div', { class: 'ch', 'data-chart': name, role: 'img', 'aria-label': aria },
                h('div', { class: 'ya', 'data-axis': 'y' }, h('span', { style: 'top:0%', text: top }), line && line.v / max < .88 ? h('span', { style: `top:${100 - line.v / max * 100}%`, text: line.text }) : null),
                h('div', { class: 'pl', style: 'height:72px' }, h('div', { class: 'gl2', style: 'top:0%' }),
                    line ? h('div', { class: 'goal', style: `top:${100 - line.v / max * 100}%` }) : null,
                    h('div', { class: 'bars', style: `grid-template-columns:repeat(${n},minmax(0,1fr));gap:${n > 12 ? 2 : 8}px` },
                        bars.map(b => h('div', { class: 'bar' + (b.now ? ' now' : ''), title: b.tip, 'data-tip': b.tip }, b.v ? h('i', { style: `height:${Math.max(2, b.v / max * 100)}%` }) : null)))),
                x);
        },
        spark(s) {
            const mk = (t, a) => { const e = document.createElementNS(SVGNS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
            const mx = Math.max(...s.spark, 1), Wd = 64, Hd = 22, p = 2, n = Math.max(1, s.spark.length - 1);
            const d = s.spark.map((v, i) => (i ? 'L' : 'M') + (p + i * (Wd - 2 * p) / n).toFixed(1) + ' ' + (Hd - p - v / mx * (Hd - 2 * p)).toFixed(1)).join(' ');
            const svg = mk('svg', { class: 'spk', width: Wd, height: Hd, viewBox: `0 0 ${Wd} ${Hd}`, role: 'img', 'aria-label': s.name + ', each day' });
            svg.append(mk('path', { class: 'sparkf', d: d + ` L${Wd - p} ${Hd - p} L${p} ${Hd - p} Z` }), mk('path', { class: 'spark', d }));
            return svg;
        },
        // a place's face: its server icon, or its first letter on a lava drop that's deeper purple the more it holds
        bubbleFace(e, size, depth) {
            const st = (size ? `width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px;` : '') + `--d:${Math.round(25 + 75 * Math.min(1, depth == null ? 1 : depth))}%`;
            const f = h('span', { class: 'bf' + (e.dm ? ' who' : e.icon ? ' srv' : ''), style: st });
            const letter = () => { f.textContent = e.id === 'home' ? '⌂' : e.dm ? '@' : e.rest ? '+' : ((e.letter || e.name).trim()[0] || '#').toUpperCase(); };
            if (e.icon) f.append(h('img', { src: e.icon.replace(/size=\d+/, 'size=128'), alt: '', draggable: 'false', onerror: ev => { ev.target.remove(); letter(); } })); else letter();
            return f;
        },
        // The bubbles sit in the middle of an orbit: what they show along its top, the range along its bottom.
        orbit(list, total, fmt, field) {
            const at = (deg, rx, ry) => { const a = deg * Math.PI / 180; return `left:${(50 + rx * Math.cos(a)).toFixed(1)}%;top:${(50 - ry * Math.sin(a)).toFixed(1)}%`; };
            const chip = (on, text, style, pick) => h('button', { class: 'ab' + (on ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': String(on), style, text, onclick: pick });
            const ring = document.createElementNS(SVGNS, 'svg'); ring.setAttribute('class', 'ring'); ring.setAttribute('viewBox', '0 0 100 100'); ring.setAttribute('preserveAspectRatio', 'none'); ring.setAttribute('aria-hidden', 'true');
            const el_ = document.createElementNS(SVGNS, 'ellipse'); for (const [k, v] of Object.entries({ cx: 50, cy: 50, rx: 42, ry: 46 })) el_.setAttribute(k, v); ring.append(el_);
            const fields = h('div', { class: 'arc', role: 'radiogroup', 'aria-label': 'The bubbles show' },
                [['time', 'Time'], ['msgs', 'Messages'], ['people', 'People'], ['channels', 'Channels']].map(([v, t], i) =>
                    chip(field === v, t, at([146, 109, 71, 34][i], 42, 46), () => { this.field = v; this.render(); })));
            const ranges = h('div', { class: 'arc rangebar', role: 'radiogroup', 'aria-label': 'Range' },
                [['week', '7 days'], ['month', '4 weeks']].map(([v, t], i) => chip(this.range === v, t, at([238, 302][i], 42, 46), () => { this.range = v; this.render(); })));
            const B = list.length ? this.bubbles(list, total, fmt) : { box: h('div', { class: 'bub empty', text: 'Nothing here yet' }), read: h('div', { class: 'readout', text: '' }) };
            const what = { time: 'A bubble per server or DM', msgs: 'A bubble per server or DM', people: 'A bubble per person', channels: 'A bubble per channel' }[field];
            return [h('div', { 'data-chart': 'places' }, h('div', { class: 'orb' }, ring, B.box, fields, ranges),
                h('div', { class: 'bkey' }, h('span', { 'data-axis': 'x', text: what }), h('span', { 'data-axis': 'y', text: field === 'msgs' ? 'bigger = more messages' : 'bigger = more time' }))), B.read];
        },
        // Bubbles (area = amount). Point at one and it swells while its neighbors lean out of the way, the way
        // an Apple Watch's app grid does; click one to go there.
        bubbles(list, total, fmt) {
            const MAX = 16, W = 340, H = 290, G = 3;
            let items = list.slice(0, MAX);
            if (list.length > MAX) { const rest = list.slice(MAX - 1); items = list.slice(0, MAX - 1).concat({ id: 'rest', name: rest.length + ' more', sub: 'together', v: sumOf(rest.map(e => e.v)), icon: '', rest: true }); }
            const big = items[0].v, rs = items.map(e => Math.max(.3, Math.sqrt(e.v / big)) * 50);
            const pos = packCircles(rs, G);
            const x0 = Math.min(...pos.map(p => p.x - p.r)), x1 = Math.max(...pos.map(p => p.x + p.r)), y0 = Math.min(...pos.map(p => p.y - p.r)), y1 = Math.max(...pos.map(p => p.y + p.r));
            const k = Math.min((W - 8) / (x1 - x0), (H - 8) / (y1 - y0), 96 / 50), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
            const B = pos.map(p => ({ x: W / 2 + (p.x - cx) * k, y: H / 2 + (p.y - cy) * k, r: p.r * k }));
            const hint = 'Point at a bubble for details. Click one to go there.';
            const read = h('div', { class: 'readout', text: hint });
            const pct = e => Math.max(1, Math.round(e.v / total * 100)) + '%';
            const tipOf = e => e.name + ' · ' + fmt(e.v) + ' · ' + pct(e) + (e.sub ? ' · ' + e.sub : '');
            const say = e => { read.replaceChildren(h('b', { class: e.dm ? 'who' : null, text: e.name }), ' · ' + fmt(e.v) + ' · ' + pct(e) + (e.sub ? ' · ' + e.sub : '') + (e.go ? ' · click to go there' : '')); read.classList.add('on'); };
            const box = h('div', { class: 'bub', role: 'group', 'aria-label': 'One bubble per place, sized by how much it holds' });
            const btns = items.map((e, i) => {
                const b = B[i];
                const btn = h('button', { class: 'bb' + (e.rest ? ' rest' : ''), type: 'button', 'aria-label': tipOf(e), 'data-tip': tipOf(e),
                    style: `left:${((b.x - b.r) / W * 100).toFixed(2)}%;top:${((b.y - b.r) / H * 100).toFixed(2)}%;width:${(b.r * 2 / W * 100).toFixed(2)}%` }, this.bubbleFace(e, 0, Math.sqrt(e.v / big)));
                btn.addEventListener('click', () => {
                    if (e.go && btn.classList.contains('hot')) { DC.go(e.go); return; }
                    for (const x of box.querySelectorAll('.bb')) x.classList.remove('hot', 'tapped');
                    lens(b.x, b.y, true); btn.classList.add('hot', 'tapped'); say(e);
                });
                btn.addEventListener('focus', () => { lens(b.x, b.y, true); say(e); });
                return btn;
            });
            box.append(...btns);
            // the lens: bubbles near the point swell, the rest shrink a little and lean away from it
            let raf = 0;
            const lens = (px, py, snap) => {
                btns.forEach((btn, i) => {
                    const b = B[i], dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy), inside = d <= b.r;
                    const near = Math.exp(-Math.pow(Math.max(0, d - b.r) / 46, 2));
                    const s = inside ? 1.28 : .88 + .2 * near, push = inside ? 0 : 9 * near;
                    const ux = d ? dx / d : 0, uy = d ? dy / d : 0;
                    btn.style.transform = `translate(${(ux * push).toFixed(1)}px,${(uy * push).toFixed(1)}px) scale(${s.toFixed(3)})`;
                    btn.classList.toggle('hot', inside); btn.style.zIndex = inside ? 3 : near > .5 ? 2 : 1;
                    if (inside && !snap) say(items[i]);
                });
            };
            const rest = () => { cancelAnimationFrame(raf); this.hot = false; for (const btn of btns) { btn.style.transform = ''; btn.style.zIndex = ''; btn.classList.remove('hot', 'tapped'); } read.textContent = hint; read.classList.remove('on'); };
            box.addEventListener('pointermove', ev => {
                if (ev.pointerType === 'touch') return;
                this.hot = true; const r = box.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W, py = (ev.clientY - r.top) / r.height * H;
                cancelAnimationFrame(raf); raf = requestAnimationFrame(() => lens(px, py, false));
            });
            box.addEventListener('pointerleave', ev => { if (ev.pointerType !== 'touch') rest(); });
            box.addEventListener('focusout', ev => { if (!box.contains(ev.relatedTarget)) rest(); });
            return { box, read };
        },
        activityChanged() { if (this.host && this.tab === 3 && !this.hot && !this.typing()) this.render(); },
        privacy() {
            if (!S.enabled) return [this.offNote()];
            const r = DC.route(), blurring = D.blurCh.includes(r.cid);
            return [
                this.sec('Screenshot safe',
                    this.tgl('shotSafe', 'Hide my name and avatar', 'Your names and picture everywhere on Discord, for screenshots and screen sharing'),
                    this.fold(S.shotSafe, 'on',
                        this.ch('shotMode', 'How', null, [['blur', 'Blur'], ['replace', 'Replace']]),
                        this.fold(S.shotMode === 'replace', 'far', h('div', { class: 'fld' }, h('div', { class: 't', text: 'Show this instead' }), this.text(S.shotName, 'User', v => save({ shotName: v || 'User' }), 'Name to show instead', 24))),
                        this.tgl('shotAvatars', 'Blur my avatar', 'Your picture next to your messages, in lists and popouts'),
                        h('div', { class: 'fld names' }, h('div', { class: 't', text: 'Names it hides' }),
                            h('div', { class: 'd nl', text: D.found.length ? D.found.join(', ') : 'Found from your account area, bottom left, once it shows.' }),
                            h('div', { class: 'd', text: 'More names, separated by commas (nicknames you use in servers)' }),
                            this.text(S.shotExtra, 'Add names…', v => save({ shotExtra: v }), 'More names to hide', 200)))),
                this.sec('Privacy blur',
                    h('div', { class: 'd hint', text: 'Blurred until you point at them.' }),
                    this.tgl('blurMedia', 'Images and videos', 'In messages and embeds'),
                    this.tgl('blurDMs', 'Direct messages', 'Names and pictures in your DM list'),
                    this.tgl('blurServers', 'Server icons', 'The icons in the server list on the left'),
                    this.tgl('blurChat', 'Messages in chosen channels', 'Message text in the channels you pick'),
                    this.fold(S.blurChat, 'on',
                        r.cid ? this.row('Blur this channel', blurring ? 'Messages here are blurred' : 'Messages here show normally',
                            toggle(blurring, () => { D.blurCh = blurring ? D.blurCh.filter(x => x !== r.cid) : [...D.blurCh, r.cid].slice(-300); store.blurCh(); refreshAll(); }, 'Blur this channel')) : this.note('Open a channel to choose it.'),
                        D.blurCh.length ? this.row('Channels picked', D.blurCh.length + ' channel' + (D.blurCh.length === 1 ? '' : 's'),
                            h('button', { class: 'btn sm', type: 'button', text: 'Clear', onclick: () => { D.blurCh = []; store.blurCh(); refreshAll(); } })) : null)),
            ];
        },
    };
    // the panel's own pieces, on top of the kit's (same tokens: corners from the scale, colors from the theme)
    const CSS2 = `
/* like the other Molten panels: no scale-in (it would wait on the lava's first frames) */
.pv{display:inline-block;filter:blur(5px);transition:filter .15s}
.pv:hover,input.pv:focus{filter:none}
.panel{animation:none}
.panel.peek{opacity:.18;transition:opacity .15s}
.logo svg{position:relative;color:#fff}
.sec>.row:first-child,.sec>.label+.row{margin-top:0}
.sec [data-fold]>*+*,.sec>*+*{margin-top:10px}
.sec>.label+*{margin-top:0}
.hint{margin:0 0 4px}
.seg.prof{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);margin-top:12px}
.seg.prof button{padding:8px 4px}
.fld .fh{display:flex;justify-content:space-between;gap:8px}
.def{flex:none;font-size:11px;color:var(--sub)}
.btns{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:6px;margin-top:12px}
.btn{border:0;border-radius:8px;padding:7px 10px;background:var(--ctl);font-size:12.5px;font-weight:500;text-align:center;line-height:1.25}
.btn:hover{background:var(--ctl-hi)}
.btn.primary{background:var(--a);color:var(--on);font-weight:600}
.btn[disabled]{opacity:.55;cursor:default}
.btn.sm{padding:5px 10px;font-size:12px}
.btn:focus-visible,.ib:focus-visible,.go:focus-visible,.txt:focus-visible,.color:focus-visible{outline:2px solid var(--a);outline-offset:2px}
.note{font-size:11.5px;color:var(--sub);margin-top:12px}
.panel:focus{outline:none}
.status{min-height:15px;color:var(--ink)}
.addcard .status:empty{display:none}
.swatch{flex:none;width:44px;height:24px;border-radius:6px;border:1px solid var(--line)}
.txt{display:block;width:100%;height:32px;margin-top:6px;padding:0 10px;border-radius:10px;border:1px solid var(--line);background:var(--field);color:var(--text);font:inherit;font-size:12.5px}
.txt::placeholder{color:var(--sub)}
.gap{height:2px}
.inline{display:flex;align-items:center;gap:6px;flex:none}
.color{width:44px;height:28px;padding:2px;border:1px solid var(--line);border-radius:8px;background:var(--field);cursor:pointer}
.list{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;margin-top:8px}
.item{display:flex;align-items:center;gap:2px;border-radius:12px;background:var(--ctl);padding:3px}
.fw{user-select:none}
.fw.drag .item{background:var(--solid);box-shadow:0 12px 26px -10px rgba(0,0,0,.35);transform:scale(1.015)}
.grip{flex:none;display:grid;place-items:center;border:0;background:none;color:var(--sub);padding:2px;border-radius:6px;cursor:grab;touch-action:none}
.grip:active{cursor:grabbing}
.grip:focus-visible{outline:2px solid var(--a);outline-offset:2px}
.item .go{flex:1;min-width:0;display:flex;align-items:center;gap:9px;border:0;background:none;padding:5px 6px;border-radius:9px;text-align:left}
.item .go:hover{background:var(--ctl)}
.item .tx{min-width:0}
.item .t,.item .d{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item .t.wrap,.item .d.wrap{white-space:normal;overflow-wrap:anywhere}
.item .rn{font-size:12px;font-weight:650;color:var(--ink);overflow-wrap:anywhere}
.ib{flex:none;width:26px;height:26px;display:grid;place-items:center;border:0;border-radius:8px;background:none;color:var(--sub)}
.ib:hover{background:var(--ctl-hi);color:var(--text)}
.ib[disabled]{opacity:.3;cursor:default}
.ib.on{color:var(--ink)}
.dot{flex:none;width:24px;height:24px;border-radius:8px;display:grid;place-items:center;overflow:hidden;font:700 12px/1 system-ui,sans-serif;color:#fff;background:rgb(var(--sc));box-shadow:0 0 10px -3px rgb(var(--sc))}
.dot img{width:100%;height:100%;object-fit:cover;display:block}
.editor{padding:4px 4px 8px}
.seg.folders button,.editor .seg button{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.names .nl{filter:blur(5px);transition:filter .2s;word-break:break-word}
.names:hover .nl{filter:none}
/* Favorites' views: lava sub-tabs, folder tiles, countdown chips */
.subs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin:0 14px 6px;padding:4px;border-radius:12px;background:var(--ctl)}
.subs button{display:flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:9px;padding:7px 4px;background:none;color:var(--sub);font-size:12.5px;font-weight:550}
.subs button i{font-style:normal;min-width:18px;padding:1px 5px;border-radius:9px;background:var(--ctl-hi);font-size:10.5px;font-weight:700;color:var(--text)}
.subs button.on{color:#fff;background:var(--a);box-shadow:0 1px 4px rgba(0,0,0,.14),0 0 14px -4px rgba(var(--a-rgb),.8)}
.subs button.on i{background:rgba(255,255,255,.25);color:#fff}
.subs button:focus-visible,.tile:focus-visible,.back:focus-visible,.lp:focus-visible{outline:2px solid var(--a);outline-offset:2px}
.addcard{margin:6px 14px 4px;padding:12px;border-radius:16px;background:var(--ctl);display:grid;gap:8px}
.addcard .label{margin-bottom:0}
.addrow{display:flex;gap:6px;align-items:center}
.addrow .txt{margin-top:0;flex:1}
.addrow .btn{flex:none;height:32px;padding:0 14px}
.addcard>.lp{justify-self:start;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}
.tile{position:relative;display:grid;justify-items:start;gap:2px;min-height:68px;padding:10px;border:0;border-radius:16px;text-align:left;background:var(--ctl);transition:background .15s,box-shadow .15s}
.tile:hover{background:var(--ctl-hi);box-shadow:inset 0 0 0 1px rgba(var(--a-rgb),.45)}
.ficon{flex:none;width:30px;height:30px;display:grid;place-items:center;border-radius:10px;color:var(--ink);background:rgba(var(--a-rgb),.14);margin-bottom:4px}
.tile .tn{font-weight:600;font-size:12.5px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tile .tc{font-size:11px;color:var(--sub)}
.tile.add{place-content:center;justify-items:center;background:none;box-shadow:inset 0 0 0 1.5px var(--line)}
.tile.add .plus{font-size:20px;line-height:1;color:var(--ink)}
.fhead{display:flex;align-items:center;gap:10px;margin:6px 14px 0;padding:10px 10px 10px 6px;border-radius:16px;background:var(--ctl)}
.fhead .ficon{margin:0}
.fhead>svg{flex:none;color:var(--ink)}
.fhead .tx{flex:1;min-width:0}
.fhead .fn{font-weight:650;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.back{flex:none;width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:10px;background:none;color:var(--sub)}
.back:hover{background:var(--ctl-hi);color:var(--text)}
.cd{flex:none;padding:3px 8px;border-radius:9px;font:600 11px/1.3 var(--mono);color:var(--ink);background:rgba(var(--a-rgb),.14)}
.cd.late{color:#fff;background:var(--a)}
.editor{display:grid;gap:8px}
.editor .txt{margin-top:0}
.elabel{font-size:11.5px;color:var(--sub);margin-top:4px}
.pills{display:flex;flex-wrap:wrap;gap:6px}
/* Activity: Hourglass's dashboard pieces (cards, axes, levels), kept short and round around the bubbles */
.lvl{margin:12px 18px 7px;font:600 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--sub)}
.body>.lvl:first-child,.sec+.lvl{margin-top:4px}
.qc{margin:0 14px 8px;padding:13px 14px;border-radius:16px;background:var(--field);border:1px solid var(--line);min-width:0}
.qc .label{margin-bottom:8px}
.qc .label::before{content:"";width:5px;height:5px;transform:rotate(45deg);background:var(--a);box-shadow:0 0 6px rgba(var(--a-rgb),.9);flex:none}
.ans{font-size:14px;font-weight:600;line-height:1.36;letter-spacing:-.012em;margin:0 0 10px;text-wrap:pretty}
.qc .d b{color:var(--text);font-weight:600}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px 12px;margin-top:4px}
.stats.four{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.stats>div{display:flex;flex-direction:column;gap:2px;min-width:0}
.stats b{font-weight:650;font-size:15px;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stats.four b{font-size:13.5px}
.stats.four>div:first-child b{color:var(--ink)}
.stats span{font-size:10.5px;color:var(--sub)}
.ch{display:grid;grid-template-columns:34px minmax(0,1fr);column-gap:8px;min-width:0}
.ch .ya{position:relative;font:9.5px var(--mono);color:var(--sub)}
.ch .ya span{position:absolute;right:0;transform:translateY(-50%);white-space:nowrap}
.ch .pl{position:relative;border-bottom:1px solid var(--ctl-hi)}
.ch .xa,.calw .xa{grid-column:2;display:grid;font:10px var(--mono);color:var(--sub);margin-top:5px}
.xa span{white-space:nowrap;text-align:center;min-width:0}
.xa span.now{color:var(--ink);font-weight:700}
.gl2{position:absolute;left:0;right:0;border-top:1px solid var(--line)}
.goal{position:absolute;left:0;right:0;border-top:1.5px dashed var(--sub);z-index:1}
.bars{position:absolute;inset:0;display:grid;align-items:end}
.bar{position:relative;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;min-width:0}
.bar>i{display:block;width:100%;max-width:16px;min-height:6px;border-radius:999px;background:var(--a)}
.bar.now>i{opacity:.55;outline:1.5px dashed rgba(var(--a-rgb),.9);outline-offset:2px}
/* dots: bigger and deeper purple the more you were on, like the bubbles */
.hm span>i,.cal span>i,.scale i{display:block;border-radius:50%;width:calc(var(--s) * 100%);aspect-ratio:1;margin:auto;background:color-mix(in srgb,#3b45c0 var(--d),#7c86f6)}
.hmw{grid-template-columns:30px minmax(0,1fr)}
.hya{display:grid;grid-template-rows:repeat(7,11px);row-gap:1px;font:9px/11px var(--mono);color:var(--sub);text-align:right}
.hm{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));grid-auto-rows:11px;gap:1px}
.hm span{display:grid;place-items:center;min-width:0}
.hm span>i{width:auto;height:calc(var(--s) * 11px)}
.scale{display:flex;flex-wrap:wrap;align-items:center;gap:4px;font-size:10.5px;color:var(--sub);margin-top:8px;grid-column:2}
.scale i{width:calc(var(--s) * 12px);margin:0}
.calw{grid-template-columns:40px minmax(0,1fr)}
.cya{display:grid;grid-template-rows:repeat(5,1fr);row-gap:4px;font:9.5px var(--mono);color:var(--sub);text-align:right;align-items:center;white-space:nowrap}
.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.cal span{display:grid;place-items:center;height:20px;border-radius:50%}
.cal span>i{width:auto;height:calc(var(--s) * 18px)}
.cal span.none::before,.cal span.future::before{content:"";width:8px;height:8px;border-radius:50%;border:1px dashed var(--sub)}
.cal span.future{opacity:.6}
.cal span.today>i{box-shadow:0 0 0 2px var(--solid),0 0 0 3.5px var(--a)}
.bar.tapped>i,.hm span.tapped>i,.cal span.tapped>i{outline:2px solid var(--a);outline-offset:2px;box-shadow:0 0 12px -2px rgba(var(--a-rgb),.9)}
.readout{margin-top:8px;font:500 11.5px var(--mono);color:var(--sub);min-height:16px;overflow-wrap:anywhere}
.readout.on{color:var(--text)}
.sl{font:600 10px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--sub);margin:10px 0 4px}
.srow2{display:grid;grid-template-columns:30px minmax(0,1fr) 64px 56px;align-items:center;gap:10px;width:100%;padding:6px 0;border:0;border-top:1px solid var(--line);background:none;text-align:left;color:inherit;font:inherit}
.srow2:hover .nm b{color:var(--ink)}
.srow2:focus-visible,.bb:focus-visible,.ab:focus-visible{outline:2px solid var(--a);outline-offset:2px}
.nm{display:flex;flex-direction:column;min-width:0}
.nm b{font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nm small{font-size:11px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.spark{stroke:var(--a);fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.sparkf{fill:rgba(var(--a-rgb),.14);stroke:none}
.spk{justify-self:center}
.delta{font:600 10.5px var(--mono);text-align:right;color:var(--ink)}
.delta.down{color:var(--sub)}
/* the orbit: what the bubbles show along its top, the range along its bottom, the bubbles in the middle */
.orb{position:relative;width:100%;aspect-ratio:340/330;margin-top:-2px}
.orb .ring{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.orb .ring ellipse{fill:none;stroke:rgba(var(--a-rgb),.38);stroke-width:1;stroke-dasharray:2 4;vector-effect:non-scaling-stroke}
.arc{position:absolute;inset:0;pointer-events:none}
.ab{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;border:1px solid var(--line);border-radius:999px;padding:5px 11px;background:var(--glass);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:var(--sub);font-size:11.5px;font-weight:600;white-space:nowrap;transition:background .15s,color .15s;z-index:4}
.ab:hover{color:var(--text);background:var(--field-hi)}
.ab.on{background:var(--a);border-color:transparent;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.14),0 0 14px -4px rgba(var(--a-rgb),.8)}
.bub{position:absolute;left:17%;width:66%;top:21%;height:58%}
.bub.empty{display:grid;place-items:center;font-size:12px;color:var(--sub);border-radius:50%;border:1px dashed var(--ctl-hi)}
.bb{position:absolute;aspect-ratio:1;padding:0;border:0;border-radius:50%;background:none;cursor:pointer;container-type:inline-size;
  transition:transform .28s cubic-bezier(.2,.8,.2,1);transform-origin:50% 50%;will-change:transform}
.bb .bf{width:100%;height:100%;font-size:clamp(9px,40cqi,26px)}
.bb.hot .bf{box-shadow:0 0 0 2px var(--solid),0 0 0 4px var(--a),0 8px 22px -6px rgba(var(--a-rgb),.9)}
.bb.rest .bf{background:var(--ctl-hi);color:var(--text);font-size:clamp(9px,30cqi,14px)}
.bf{flex:none;position:relative;display:grid;place-items:center;overflow:hidden;border-radius:50%;color:#fff;font-weight:700;line-height:1;
  background:radial-gradient(circle at 34% 28%,rgba(255,255,255,.34),transparent 46%),color-mix(in srgb,#3b45c0 var(--d,60%),#7c86f6);
  box-shadow:inset 0 -3px 8px rgba(0,0,0,.18),0 2px 8px -3px rgba(var(--a-rgb),.6)}
.bf img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%}
.bf.srv{background:var(--ctl);box-shadow:0 0 0 2px color-mix(in srgb,#3b45c0 var(--d,60%),#7c86f6)}
.bkey{display:flex;justify-content:space-between;gap:10px;margin-top:2px;font:10px var(--mono);color:var(--sub)}
.body.bd .who{filter:blur(5px)}
.body.bd .who:hover,.body.bd .bb.hot .who{filter:none}
.body.bs .bf.srv img{filter:blur(6px)}
@media (prefers-reduced-motion:reduce){.bb{transition:none}}
.btn.warn{background:var(--a);color:#fff}
.dbtns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
.dbtns .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px}
.btn.danger{color:var(--danger)}
.btn.danger-fill{background:#d22d39;color:#fff;font-weight:600}   /* the deeper red in both themes, so white text reads */
.ask{margin-top:12px;padding:12px;border-radius:10px;background:var(--ctl);box-shadow:inset 0 0 0 1px var(--danger)}
.ask .d{margin-top:4px}
.imp{margin-top:10px}
`;

    /* ───────────────────────── keeping everything in step ───────────────────────── */

    function liveApply(key) {
        if (['frost', 'blur', 'chrome', 'radius', 'edges', 'textShadow', 'clearVideo'].includes(key)) GLASS.write();
        if (key === 'cleanup' && !S.cleanup) GLASS.unclean();
        if (['titleColor', 'titleTone', 'seekColor', 'seekTone'].includes(key)) TITLE.refresh();
        if (['mentionGlow', 'mentionBlobs', 'mentionStrength', 'keywords'].includes(key)) applyMentions();
        if (['blurMedia', 'blurDMs', 'blurServers', 'blurChat'].includes(key)) applyBlur();
        if (['shotSafe', 'shotMode', 'shotName', 'shotAvatars', 'shotExtra'].includes(key)) SHOT.apply();
        if (['lavaOn', 'followMedia', 'profileLava', 'voiceLava', 'voiceWhere', 'serverTint'].includes(key)) { applyRoot(); scheduleArt(0); }
        if (key === 'videoLava' || key === 'videoWidth' || key === 'videoCropBars') { vs.drawn = false; resetCrop(); }
        if (key === 'easeCalls' || key === 'pauseUnfocused' || key === 'pauseScroll') stillness();
        if (key === 'favHover' && !S.favHover) FLY.close(true);
        if (key === 'favDrops' || key === 'msgDrops') DROPS.hide();
        if (key === 'appearance') LAYER.theme();
        if (key === 'trackDays') ACT.flush(true);
    }
    // the page watcher only runs while Molten is on
    let watching = false;
    function watchPage(on) {
        if (on === watching) return;
        watching = on;
        if (on) mo.observe(document.getElementById('app-mount') || document.body || root, { childList: true, subtree: true, characterData: true });
        else { mo.disconnect(); pending = []; }
    }
    function applyAll() {
        stylesOn(S.enabled); watchPage(S.enabled);
        applyRoot(); GLASS.write(); writeLavaVars(); applyMotion(); applyMentions(); applyBlur(); SHOT.apply(); TITLE.refresh(); LAYER.theme(); NOTE.place();
        if (!S.enabled) { GLASS.unclean(); TITLE.release(); FLY.close(true); DROPS.hide(); }
        ensureButton(); scheduleArt(0);
    }
    function save(patch) {
        const before = Object.assign({}, S);
        for (const [k, v] of Object.entries(patch)) if (k in SPEC) S[k] = valid(k, v);
        set('settings', Object.assign({}, S));
        if ('enabled' in patch && patch.enabled !== before.enabled) applyAll();
        else for (const k of Object.keys(patch)) if (S[k] !== before[k]) liveApply(k);
        ui.render(); ensureButton();
    }
    let lavaSaveT = 0;
    function saveLava() { clearTimeout(lavaSaveT); lavaSaveT = setTimeout(() => set('lava', clone(LAVA)), 200); }
    let motionFrame = 0;
    function lavaLive(key) {
        writeLavaVars();
        if (key === 'motionSpeed' || key === 'motionAmount') { cancelAnimationFrame(motionFrame); motionFrame = requestAnimationFrame(applyMotion); }
        else if (key !== 'bgBlur' && key !== 'bgBrightness' && key !== 'bgSaturate' && key !== 'bgScale') applyMotion();
    }
    // the lists and the panel and flyout that show them
    function refreshAll() { FLY.repaint(); NOTE.place(); applyBlur(); if (!ui.typing() && !ui.dragging) ui.render(); }
    document.addEventListener('pointerup', () => { if (ui.panel) ui.panel.classList.remove('peek'); }, true);

    // stillness: the lava pauses while you scroll or while Discord isn't the active window, and calms down in calls
    let scrollT = 0, scrolling = false;
    function stillness() {
        attr('data-mfd-still', (S.pauseScroll && scrolling) || (S.pauseUnfocused && !document.hasFocus()) || document.hidden);
        const e = S.easeCalls && (DC.inVoice() || (vs.on && !!DC.callScreen()));
        if (e !== eased) { eased = e; writeLavaVars(); applyMotion(); }
    }
    document.addEventListener('scroll', () => {
        if (!scrolling) { scrolling = true; stillness(); DROPS.pins(); }
        clearTimeout(scrollT);
        scrollT = setTimeout(() => { scrolling = false; stillness(); if (S.followMedia) scheduleArt(150); }, 220);
    }, { capture: true, passive: true });
    addEventListener('focus', stillness); addEventListener('blur', stillness);
    document.addEventListener('visibilitychange', () => { stillness(); if (!document.hidden) checkReminders(); });

    // One watcher for Discord's page, started once: new messages (keywords, Screenshot safe), popouts
    // opening and closing (profiles in the lava) and the channel changing. Work is gathered up per frame.
    let pending = [], frame = 0, lastPath = location.pathname, lastTitle = document.title;
    function onFrame() {
        frame = 0;
        const nodes = pending; pending = [];
        if (!S.enabled) return;
        if (location.pathname !== lastPath || document.title !== lastTitle) {
            const moved = location.pathname !== lastPath;
            lastPath = location.pathname; lastTitle = document.title;
            if (moved) { DROPS.hide(); visited(); applyBlur(); scheduleArt(500); } else visited();
            if (ui.host && !ui.typing()) ui.render();
        }
        const added = [];
        for (const n of nodes) if (n.isConnected) added.push(n);
        if (!added.length) return;
        if (KW) for (const n of added) if (n.nodeType === 1 && (n.matches('li[id^="chat-messages-"]') || n.querySelector('[id^="message-content-"]'))) markKeywords(n);
        if (S.mentionGlow && S.mentionBlobs) for (const n of added) if (n.nodeType === 1 && (n.matches('li[id^="chat-messages-"]') || n.querySelector('li[id^="chat-messages-"]'))) seedBlobs(n);
        SHOT.added(added);
        if (S.profileLava || S.followMedia) for (const n of added) if (n.nodeType === 1 && (n.querySelector('img') || n.tagName === 'IMG')) { scheduleArt(300); break; }
        if (S.clearMedia) for (const n of added) if (n.nodeType === 1 && (/^(IMG|VIDEO)$/.test(n.tagName) || n.querySelector('img,video'))) { checkViewer(); break; }
    }
    const mo = new MutationObserver(list => {
        for (const m of list) { if (m.type === 'characterData') pending.push(m.target); else for (const n of m.addedNodes) pending.push(n); if (m.removedNodes.length && !frame && S.profileLava) scheduleArt(400); }
        if (viewerNow && !viewerNow.bd.isConnected) checkViewer();   // the viewer closed: the app comes straight back
        if (pending.length > 4000) pending = pending.slice(-4000);
        if (!frame) frame = requestAnimationFrame(onFrame);
    });

    // The loop: once a second normally, at the video's frame rate while one plays, every few seconds in the background.
    // Only the video drawing follows the frame rate: the upkeep below goes by the clock (every(), in ms), so a
    // 60 fps video doesn't check reminders or clean the page 60 times a second.
    let loopT = 0;
    const lastRun = {};
    const every = (k, ms, now) => { if (now - (lastRun[k] || 0) < ms) return false; lastRun[k] = now; return true; };
    function loop() {
        clearTimeout(loopT);
        let delay = 1000;
        try {
            const now = Date.now();
            if (document.hidden) { if (every('hidden', 30e3, now)) { checkReminders(); ACT.tick(); } loopT = setTimeout(loop, 2000); return; }
            if (every('button', 2000, now) || !document.getElementById('mfd-lava')) ensureButton();
            if (!S.enabled) { loopT = setTimeout(loop, 2000); return; }
            if (lavaActive() && every('layers', 2000, now)) ensureLayers();
            if (location.pathname !== lastPath || document.title !== lastTitle) onFrame();
            if (every('second', 1000, now)) { TITLE.tick(); ACT.tick(); if (S.clearMedia || viewerNow) checkViewer(); }
            if (every('still', 3000, now)) { stillness(); NOTE.place(); if (S.voiceLava && DC.inVoice()) scheduleArt(0); }
            if (every('remind', 5000, now)) { checkReminders(); if (FLY.isOpen()) FLY.repaint(); }
            // the countdown chips in the open panel keep counting
            if (ui.panel && every('countdown', 10e3, now)) for (const c of ui.panel.querySelectorAll('.cd[data-due]')) c.textContent = countdown(+c.dataset.due);
            if (S.cleanup && !scrolling && every('clean', 3000, now)) GLASS.clean();
            if (S.shotSafe && every('learn', 4000, now)) SHOT.learn();
            const still = root.hasAttribute('data-mfd-still');
            const v = lavaActive() ? (still ? (vs.on ? lastVideo : null) : findVideo()) : null;
            setVideoOn(!!v); lastVideo = v;
            if (v && !still) {
                delay = v.paused || v.ended ? 300 : Math.round(1000 / Math.max(1, S.videoFps / (eased ? 2 : 1)));
                if (!vs.drawn || v.currentTime !== vs.lastTime || v.srcObject) drawVideo(v);
            }
        } catch (e) { log('loop error:', e && e.message); }
        loopT = setTimeout(loop, delay);
    }

    /* ───────────────────────── start ───────────────────────── */

    GM_registerMenuCommand('Open Molten for Discord', () => ui.toggle());
    GM_registerMenuCommand('Turn Molten for Discord on/off', () => save({ enabled: !S.enabled }));
    GM_registerMenuCommand('Turn lava on/off', () => save({ lavaOn: !S.lavaOn }));
    GM_registerMenuCommand('Turn screenshot safe on/off', () => save({ shotSafe: !S.shotSafe }));

    // settings and lists changed in another tab
    watch('settings', () => { const n = loadSettings(), was = Object.assign({}, S); Object.assign(S, n); if (n.enabled !== was.enabled) applyAll(); else for (const k of Object.keys(SPEC)) if (n[k] !== was[k]) liveApply(k); if (!ui.typing()) ui.render(); ensureButton(); });
    watch('lava', () => { LAVA = loadLava(); writeLavaVars(); applyMotion(); if (!ui.typing()) ui.render(); });
    watch('favorites', () => { D.favs = readFavs(); refreshAll(); });
    watch('recent', () => { D.recent = readRecent(); if (ui.host && ui.tab === 2 && !ui.typing() && !ui.dragging) ui.render(); });
    watch('saved', () => { D.saved = readSaved(); refreshAll(); });
    watch('reminders', () => { D.reminders = readReminders(); if (ui.host && ui.tab === 2 && !ui.typing()) ui.render(); });
    watch('serverColors', () => { D.colors = readColors(); refreshAll(); scheduleArt(0); });
    watch('notes', () => { D.notes = readNotes(); refreshAll(); });
    watch('blurChannels', () => { D.blurCh = readBlurChannels(); refreshAll(); });
    watch('found', () => { D.found = readFound(); SHOT.apply(); });
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { ui.render(); LAYER.theme(); }); } catch {}

    log('v' + VERSION + ' started');
    applyAll();   // starts the page watcher too (watchPage), if Molten is on
    visited();
    loop();
})();
