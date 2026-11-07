// ==UserScript==
// @name         Kaleidoscope
// @namespace    jigglypug.anime.clipboard
// @version      2.10.8
// @description  AI recommendations from your AniList list. Pick a mode (recent, top rated, wildcard, airing now, backlog) and Kaleidoscope has Claude build a recommendation board in the background, then opens it for you. Also finds sequels you haven't watched. Click the ✦ button on AniList.
// @match        https://anilist.co/*
// @match        https://claude.ai/*
// @noframes
// @run-at       document-start
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        window.close
// @connect      claude.ai
// @author       JigglyPug
// @license      MIT
// @icon         https://raw.githubusercontent.com/JigglyPug/glassware/main/assets/icons/kaleidoscope.png?v=2
// @homepageURL  https://jigglypug.github.io/glassware/desktop/kaleidoscope/
// @supportURL   https://github.com/JigglyPug/glassware/issues
// @updateURL    https://raw.githubusercontent.com/JigglyPug/glassware/main/desktop/kaleidoscope/kaleidoscope.user.js
// @downloadURL  https://raw.githubusercontent.com/JigglyPug/glassware/main/desktop/kaleidoscope/kaleidoscope.user.js
// ==/UserScript==

/* Kaleidoscope: AniList -> Claude recommendations
     - Recommend tab: five modes. Each builds a prompt from your live AniList list.
     - Sequels tab: finds sequels to shows you finished that aren't on your list (no AI needed).
     - Settings tab: what happens in Claude, standing preferences added to every prompt.
   The hand-off: on AniList the prompt is saved to Tampermonkey storage and claude.ai/new is opened
   with a one-time id; this same script (running on claude.ai) pastes it in, in that tab only. In "Board only" mode Claude runs in a
   background tab: once the reply is finished, the board's HTML is read from the chat, the Claude
   tab closes, and the board opens at anilist.co/kaleidoscope/board. The prompt is always copied to your
   clipboard too, so Ctrl+V works if anything goes wrong.
*/

(function () {
  'use strict';

  const HANDOFF_KEY = 'kaleidoscope.handoff';
  const HANDOFF_TTL = 10 * 60 * 1000; // a prompt older than this is ignored on claude.ai (long enough to sign in)
  const TAB_KEY = 'kaleidoscope.tab'; // (per tab, in sessionStorage) the id of the hand-off this claude.ai tab was opened for
  const newTabId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const tagged = (url, tab) => url + '#kaleidoscope-tab=' + tab;
  const RESULT_KEY = 'kaleidoscope.result';
  const BOARDS_KEY = 'kaleidoscope.boards';
  const TIMES_KEY = 'kaleidoscope.times';
  // AniList redirects unknown pages to /404, but the #part survives, so boards are found by it on any page.
  const BOARD_URL = id => 'https://anilist.co/home#kaleidoscope-board=' + id;
  const GONE_TITLE = 'It looks like that board was deleted';
  const GONE_TEXT = 'Its Claude chat is gone, so it can\'t be updated or followed up. You can still open and save this board, or make a new one.';

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
  function rawStyle(css) {
    const s = document.createElement('style');
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
    return s;
  }
  const onReady = fn => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };

  if (location.hostname === 'anilist.co') {
    const m = location.hash.match(/^#kaleidoscope-board=([\w-]+)/);
    // also opens links from 2.3.0-2.3.2, which landed on /404#id
    const old = /^\/(404|kaleidoscope\/board)\/?$/.test(location.pathname) && /^#[a-z0-9]+$/.test(location.hash) &&
      GM_getValue(BOARDS_KEY, []).some(b => '#' + b.id === location.hash);
    if (m || old) return showBoard(m ? m[1] : location.hash.slice(1));
  }
  if (location.hostname === 'claude.ai') onReady(claudeSide);
  else onReady(aniListSide);

  // =====================================================================
  //  BOARD PAGE: any anilist.co page with #kaleidoscope-board=id shows a captured board
  // =====================================================================
  function showBoard(id) {
    // Wait until the page's <body> exists (stopping any earlier leaves Chrome unable to paint),
    // then stop AniList's own app from loading and swap in the board.
    if (!document.body) {
      const mo = new MutationObserver(() => { if (document.body) { mo.disconnect(); showBoard(id); } });
      mo.observe(document, { childList: true, subtree: true });
      return;
    }
    try { window.stop(); } catch (e) { /* ignore */ }
    const boards = GM_getValue(BOARDS_KEY, []);
    console.log('[Kaleidoscope] showing board ' + id);
    const b = boards.find(x => x.id === id) || (!id && boards[boards.length - 1]);
    if (!b) return renderPage(
      '<!DOCTYPE html><html><head><title>Kaleidoscope</title></head><body style="margin:0;background:#0B1622;color:#9FADBD;' +
      'font:16px system-ui,sans-serif;display:grid;place-items:center;height:100vh"><div style="text-align:center">' +
      '<div style="font-size:40px;font-weight:800;color:#fff">Kaleido<span style="color:#3DB4F2">scope</span></div>' +
      '<p>That board isn\'t saved anymore. Kaleidoscope only keeps your latest board, but this one is still in its Claude chat.</p><a href="https://anilist.co/" style="color:#3DB4F2">Back to AniList</a></div></body></html>');

    // The board runs in a sealed-off frame: its own scripts (charts, covers) work, but it has no
    // access to AniList's page, your AniList session or this script. It's written by an AI, so it's
    // treated as untrusted code (CLAUDE.md, Security): it can't open pop-ups or windows, this page's
    // policy stops the frame from navigating anywhere (its links come through here, AniList only), and
    // nothing of yours is ever sent into it: your recent activity shows on this page, above the board.
    renderPage('<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="frame-src \'none\'">' +
      '<title>Kaleidoscope</title><style>' +
      'html,body{margin:0;height:100%;background:#0B1622;overflow:hidden}' +
      'body{display:flex;flex-direction:column}' +
      'iframe{flex:1;min-height:0;border:0;width:100%;display:block;background:#0B1622}' + recentCss() + '</style></head>' +
      '<body><div class="krecent" hidden></div><iframe sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></body></html>');
    const frame = document.querySelector('iframe');
    document.title = frame.title = new DOMParser().parseFromString(b.html, 'text/html').title || 'Kaleidoscope';
    // The board opens right away; the Recent activity strip fills in above it whenever AniList answers.
    const A = (b.type || 'ANIME') !== 'MANGA';
    // The board can ask for a link to be opened (it can't open anything itself); only AniList addresses go.
    window.addEventListener('message', e => {
      if (e.source !== frame.contentWindow || !e.data || typeof e.data.adxOpen !== 'string') return;
      const u = boardLink(e.data.adxOpen);
      if (u) GM_openInTab(u, { active: true });
      else console.log('[Kaleidoscope] a board link outside AniList was not opened');
    });
    frame.srcdoc = prepareBoard(b.html);
    fetchRecent(b).then(x => showRecent(document.querySelector('.krecent'), x, A), e => console.log('[Kaleidoscope] recent strip skipped: ' + (e && e.message)));
    {
      // Save + follow-up buttons, bottom right
      const pill = 'display:flex;align-items:center;gap:8px;background:#151F2E;color:#EDF1F5;font:600 14px/1 Overpass,system-ui,sans-serif;' +
        'padding:12px 18px;border-radius:999px;text-decoration:none;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.45);border:1px solid rgba(61,180,242,.35)';
      const bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;display:flex;gap:10px';
      const save = document.createElement('button');
      save.type = 'button';
      save.style.cssText = pill;
      save.title = 'Download this board as an HTML file to keep';
      save.innerHTML = '<span style="color:#3DB4F2;font-size:15px">⤓</span>Save';
      save.addEventListener('click', () => saveBoardFile(b));
      bar.append(save);
      if (b.conv && !b.chatGone) {
        let state = null;
        const check = chatState(b).then(st => { state = st; return st; });
        const fu = document.createElement('a');
        fu.href = b.conv;
        fu.target = '_blank';
        fu.rel = 'noopener';
        fu.title = 'Opens the chat this board came from, so a follow-up doesn\'t rebuild everything';
        fu.style.cssText = pill;
        fu.innerHTML = '<span style="color:#3DB4F2;font-size:16px">✦</span>Ask a follow-up in Claude';
        const gone = () => { markBoardGone(b.id); fu.remove(); pageNotice(GONE_TITLE, GONE_TEXT); };
        fu.addEventListener('click', async e => {
          if (state && state !== 'gone') return; // answer ready and the chat exists: let the link open it
          e.preventDefault();
          if (state === 'gone') return gone();
          // answer not ready yet: wait a moment for it before opening anything
          const st = await Promise.race([check, sleep(3000).then(() => 'unknown')]);
          if (st === 'gone') return gone();
          GM_openInTab(b.conv, { active: true }); // the browser blocks normal pop-ups after a wait
        });
        bar.append(fu);
      }
      document.body.append(bar);
    }
  }

  // Does a board's Claude chat still exist? Asked from AniList through Tampermonkey (with your Claude login).
  function claudeGet(path) {
    return new Promise(res => {
      try {
        GM_xmlhttpRequest({
          method: 'GET', url: 'https://claude.ai' + path, headers: { Accept: 'application/json' }, timeout: 8000,
          onload: r => res({ status: r.status, text: r.responseText || '' }),
          onerror: () => res({ status: 0, text: '' }), ontimeout: () => res({ status: 0, text: '' }),
        });
      } catch (e) { res({ status: 0, text: '' }); }
    });
  }
  async function chatState(board) {
    const conv = ((board.conv || '').match(/\/chat\/([0-9a-f-]{36})/) || [])[1];
    if (!conv) return 'gone';
    let org = board.org;
    if (!org) {
      const r = await claudeGet('/api/organizations');
      try {
        const l = JSON.parse(r.text);
        const o = Array.isArray(l) && (l.find(x => (x.capabilities || []).includes('chat')) || l[0]);
        org = o && o.uuid;
      } catch (e) { /* unknown */ }
    }
    if (!org) return 'unknown';
    const r = await claudeGet('/api/organizations/' + org + '/chat_conversations/' + conv);
    const json = /^\s*[{[]/.test(r.text);
    if (r.status === 200 && json) return 'exists';
    if (r.status === 404 || ((r.status === 403 || r.status === 410) && json)) return 'gone';
    return 'unknown'; // offline, signed out, a challenge page… treat as "might exist"
  }
  function markBoardGone(id) {
    const boards = GM_getValue(BOARDS_KEY, []);
    let changed = false;
    for (const x of boards) if (x.id === id && !x.chatGone) { x.chatGone = true; changed = true; }
    if (changed) GM_setValue(BOARDS_KEY, boards);
  }

  // Simple OK dialog on the board page.
  function pageNotice(title, text) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(11,22,34,.72);display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = '<div style="max-width:380px;width:100%;background:#151F2E;border:1px solid rgba(61,180,242,.3);border-radius:14px;padding:18px;' +
      'box-shadow:0 14px 40px rgba(0,0,0,.55);font:14px/1.5 Overpass,system-ui,sans-serif;color:#C9D7E3">' +
      '<div style="color:#EDF1F5;font-weight:700;font-size:15px;margin-bottom:6px"></div><div></div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:14px"><button type="button" style="border:0;border-radius:8px;' +
      'background:#3DB4F2;color:#fff;font:650 13px Overpass,system-ui,sans-serif;padding:8px 18px;cursor:pointer">OK</button></div></div>';
    const [t, p] = ov.firstElementChild.children; // title, text
    t.textContent = title;
    p.textContent = text;
    const done = () => ov.remove();
    ov.querySelector('button').addEventListener('click', done);
    ov.addEventListener('mousedown', e => { if (e.target === ov) done(); });
    document.body.append(ov);
    ov.querySelector('button').focus();
  }

  // Download a board as a standalone HTML file (Kaleidoscope itself only keeps the latest one).
  function saveBoardFile(b) {
    const d = new Date(b.ts || Date.now());
    const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const name = ('Kaleidoscope - ' + (b.label || 'Board') + (b.updated ? ' (updated)' : '') + ' - ' + day + '.html').replace(/[\\/:*?"<>|]/g, '');
    const doc = new DOMParser().parseFromString(b.html, 'text/html');
    doc.head.prepend(boardPolicy(doc));   // the saved file keeps the board's limits on what it may load
    const url = URL.createObjectURL(new Blob(['<!DOCTYPE html>\n' + doc.documentElement.outerHTML], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    (document.body || document.documentElement).append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }

  // Replace the whole page with the board. Scripts are re-created so they run (DOMParser leaves them inert).
  function renderPage(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const root = document.importNode(doc.documentElement, true);
    document.replaceChild(root, document.documentElement);
    for (const old of [...root.querySelectorAll('script')]) {
      const sc = document.createElement('script');
      for (const at of old.attributes) sc.setAttribute(at.name, at.value);
      sc.textContent = old.textContent;
      old.replaceWith(sc);
    }
  }

  // "Recent activity" strip above Taste profile: your 5 latest list changes, Cover Flow style.
  // Drawn by Kaleidoscope when the board opens (no Claude usage), with live data and covers from AniList.
  async function fetchRecent(b) {
    const user = b.user || ((b.html.match(/User\s*<b>([^<]+)<\/b>/i) || [])[1] || '').trim();
    if (!user) return null;
    const type = b.type || 'ANIME';
    const A = type !== 'MANGA';
    const gql = async (query, variables) => {
      const r = await fetch('https://graphql.anilist.co', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
      const j = await r.json();
      if (j.errors) throw new Error(j.errors[0].message);
      return j.data;
    };
    const title = m => (m.title && (m.title.english || m.title.romaji)) || 'Untitled';
    const d = await gql(`query ($u: String, $t: MediaType) {
      Page(perPage: 5) { mediaList(userName: $u, type: $t, sort: UPDATED_TIME_DESC) {
        status progress media { id title { english romaji } coverImage { large } }
      } } }`, { u: user, t: type });
    const KIND = {
      COMPLETED: ['Completed', '#68D639'], CURRENT: [A ? 'Watching' : 'Reading', '#3DB4F2'],
      REPEATING: [A ? 'Rewatching' : 'Rereading', '#3DB4F2'], PLANNING: ['Added', '#9256F3'],
      DROPPED: ['Dropped', '#E85D75'], PAUSED: ['Paused', '#F79A63'],
    };
    const items = d.Page.mediaList.map(x => {
      const k = KIND[x.status] || [x.status, '#728AA1'];
      const label = (x.status === 'CURRENT' || x.status === 'REPEATING') && x.progress ? k[0] + ' · ' + (A ? 'ep ' : 'ch ') + x.progress : k[0];
      return { id: x.media.id, title: title(x.media), cover: x.media.coverImage && x.media.coverImage.large, label, color: k[1] };
    });
    return items;
  }

  // The Recent activity strip, on the page around the board (never inside it: the board is untrusted).
  // (a function, not a const: the board page stops the script before later consts are set up)
  function recentCss() {
    return (
    '.krecent{flex:none;padding:12px 22px 14px;background:#0B1622;border-bottom:1px solid rgba(61,180,242,.18);' +
    'font-family:Overpass,system-ui,-apple-system,"Segoe UI",sans-serif;animation:kr-in .35s ease}' +
    '.krecent[hidden]{display:none}' +
    '.kr-h{display:flex;align-items:center;gap:10px;color:#9FADBD;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}' +
    '.kr-h::before{content:"";width:4px;height:14px;border-radius:2px;background:#3DB4F2}' +
    '.kr-h button{margin-left:auto;padding:4px 10px;border:1px solid rgba(61,180,242,.35);border-radius:6px;background:#151F2E;color:#EDF1F5;' +
    'font:600 12px/1 Overpass,system-ui,sans-serif;letter-spacing:0;text-transform:none;cursor:pointer}' +
    '.kr-flow{display:flex;gap:12px;margin-top:10px;overflow-x:auto;scrollbar-width:thin}' +
    '.kr-c{flex:none;display:flex;gap:10px;align-items:center;width:230px;padding:6px;border-radius:10px;background:#151F2E;text-decoration:none;color:#EDF1F5}' +
    '.kr-c:hover{background:#1A2638}' +
    '.kr-cv{position:relative;flex:none;width:44px;height:64px;border-radius:6px;overflow:hidden;display:grid;place-items:center;' +
    'color:#fff;font-weight:800;font-size:13px}' +
    '.kr-cv img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}' +
    '.kr-t{display:block;font-size:13px;font-weight:700;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}' +
    '.kr-b{display:inline-block;margin-top:5px;border-radius:999px;padding:2px 8px;font-size:10.5px;font-weight:800;color:#fff}' +
    '@keyframes kr-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}');
  }
  // Builds the strip from AniList's answer, as text only. Hidden or shown is remembered.
  function showRecent(box, items, A) {
    if (!box || !items || !items.length) return;
    const HIDE_KEY = 'kaleidoscope.recentHidden';
    const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
    const draw = () => {
      const hidden = !!GM_getValue(HIDE_KEY, false);
      box.textContent = '';
      const head = mk('div', 'kr-h', 'Recent activity');
      const btn = mk('button', '', hidden ? 'Show' : 'Hide');
      btn.type = 'button';
      btn.addEventListener('click', () => { GM_setValue(HIDE_KEY, !hidden); draw(); });
      head.append(btn);
      box.append(head);
      if (!hidden) {
        const flow = mk('div', 'kr-flow');
        for (const it of items.slice(0, 5)) {
          const a = mk('a', 'kr-c');
          a.href = 'https://anilist.co/' + (A ? 'anime' : 'manga') + '/' + Number(it.id);
          a.target = '_blank';
          a.rel = 'noopener';
          const title = String(it.title || '');
          const cv = mk('span', 'kr-cv', title.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(''));
          cv.style.background = 'linear-gradient(145deg,' + String(it.color) + ',#1A2638)';
          if (it.cover) { const img = mk('img'); img.alt = ''; img.onerror = () => img.remove(); img.src = String(it.cover); cv.append(img); }
          const txt = mk('span');
          txt.append(mk('span', 'kr-t', title));
          const badge = mk('span', 'kr-b', String(it.label || ''));
          badge.style.background = String(it.color);
          txt.append(badge);
          a.append(cv, txt);
          flow.append(a);
        }
        box.append(flow);
      }
      box.hidden = false;
    };
    draw();
  }

  // Get the board ready for its sealed-off frame: its content policy, DNS prefetching off, and the guard
  // that sends its links here. Nothing else goes in: no data of yours, no messages afterwards.
  function prepareBoard(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const guard = doc.createElement('script');
    guard.textContent = '(' + boardGuard.toString() + ')();';
    // no-dns-prefetch: a link to a made-up address would otherwise be looked up, which content policies don't cover
    const dns = doc.createElement('meta');
    dns.httpEquiv = 'x-dns-prefetch-control';
    dns.content = 'off';
    doc.head.prepend(boardPolicy(doc), dns, guard);
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }

  // What a board may load: AniList's API (covers) and images, inline scripts and styles, plus scripts,
  // styles and fonts from the common code CDNs. Nothing else: no other network calls, images, forms or
  // frames, so whatever the board's code does, nothing it shows can be sent anywhere.
  function boardPolicy(doc) {
    const m = doc.createElement('meta');
    m.httpEquiv = 'Content-Security-Policy';
    m.content = "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; " +
      "style-src 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; " +
      "font-src https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com data:; " +
      "img-src https://s4.anilist.co https://img.anili.st data: blob:; connect-src https://graphql.anilist.co; " +
      "media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'";
    return m;
  }
  // Only AniList links leave the board (anything else could carry the board's contents off in its address).
  function boardLink(u) {
    try {
      const x = new URL(u, 'https://anilist.co/');
      return x.protocol === 'https:' && (x.hostname === 'anilist.co' || x.hostname.endsWith('.anilist.co')) ? x.href : null;
    } catch (e) { return null; }
  }
  // Runs first inside the board's frame (copied in as text). Links and window.open() go to Kaleidoscope,
  // which opens AniList addresses only; WebRTC, which page policies can't restrict, is switched off.
  function boardGuard() {
    var send = function (u) { try { window.parent.postMessage({ adxOpen: String(new URL(String(u), document.baseURI)) }, '*'); } catch (e) { /* not a link */ } };
    try { window.open = function (u) { send(u); return null; }; } catch (e) { /* ignore */ }
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var h = a.getAttribute('href') || '';
      if (!h || h.charAt(0) === '#') return;
      e.preventDefault();
      send(a.href);
    }, true);
    ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'RTCSessionDescription', 'RTCIceCandidate'].forEach(function (k) {
      try { Object.defineProperty(window, k, { value: undefined, configurable: false, writable: false }); } catch (e) { /* ignore */ }
    });
  }

  // =====================================================================
  //  CLAUDE SIDE: paste the waiting prompt; in board mode, capture the result
  // =====================================================================
  function claudeSide() {
    // The tab Kaleidoscope opens carries a one-time id in its address; the tab remembers it (through
    // signing in), and only that tab takes the waiting prompt, never another claude.ai tab you open.
    const tagged = (location.hash.match(/(?:^#|&)kaleidoscope-tab=([\w-]+)/) || [])[1];
    if (tagged) {
      try { sessionStorage.setItem(TAB_KEY, tagged); } catch (e) { /* ignore */ }
      try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    }
    let mine = tagged || null;
    try { mine = mine || sessionStorage.getItem(TAB_KEY); } catch (e) { /* ignore */ }
    let data = GM_getValue(HANDOFF_KEY, null);
    if (!data || !data.text || Date.now() - data.ts > HANDOFF_TTL) return;
    if (!data.tab || data.tab !== mine) return; // not the tab this prompt was opened for
    const path = location.pathname;
    // Signed out: tell AniList, and keep the prompt waiting so it continues once you sign in.
    const tellSignedOut = () => {
      if (!data.capture) return;
      GM_setValue(HANDOFF_KEY, Object.assign({}, data, { ts: Date.now(), toldSignin: true }));
      GM_setValue(RESULT_KEY, { job: data.job, ts: Date.now(), signin: true });
      console.log('[Kaleidoscope] signed out of Claude; waiting for you to sign in.');
    };
    if (/^\/(login|logout|signin|sign-in|signup|sign-up|auth)(\/|$)/i.test(path)) {
      if (!data.toldSignin) tellSignedOut();
      return;
    }
    // The board's chat is gone: tell AniList (it shows an OK message) and don't send anything.
    const tellChatGone = () => {
      GM_deleteValue(HANDOFF_KEY);
      GM_setValue(RESULT_KEY, { job: data.job, ts: Date.now(), ok: false, chatGone: true, closeTab: true });
      console.log('[Kaleidoscope] the board\'s chat is gone, so nothing was sent.');
      setTimeout(() => { try { window.close(); } catch (e) { /* the AniList tab closes it */ } }, 800);
    };
    if (data.update) {
      const onChat = path.startsWith('/chat/' + data.convId);
      if (!onChat && !path.startsWith('/new')) return;
      if (!onChat && data.toldSignin && !data.backToChat && data.convId) {
        // after signing in Claude lands on /new: go back to the board's chat first
        GM_setValue(HANDOFF_KEY, Object.assign({}, data, { backToChat: true }));
        location.href = location.origin + '/chat/' + data.convId;
        return;
      }
      if (!onChat) return tellChatGone(); // Claude sent us to a new chat: the old one is gone
    } else if (!path.startsWith('/new')) return; // some other page: leave it waiting
    GM_deleteValue(HANDOFF_KEY); // one use only, so a refresh doesn't paste it again
    try { sessionStorage.removeItem(TAB_KEY); } catch (e) { /* ignore */ }
    const capture = !!data.capture;
    const t0 = data.started || Date.now();

    rawStyle(
      '#kaleidoscope-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;' +
      'background:#151F2E;color:#EDF1F5;border:1px solid rgba(61,180,242,.35);border-radius:12px;padding:10px 16px;' +
      'font:13px/1.45 Overpass,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45);' +
      'transition:opacity .3s;max-width:calc(100vw - 40px)}' +
      '#kaleidoscope-toast b{color:#3DB4F2}' +
      '#kaleidoscope-toast.err{border-color:rgba(232,93,117,.5)}'
    );
    const toast = (msg, err, sticky) => {
      let t = document.getElementById('kaleidoscope-toast');
      if (!t) { t = document.createElement('div'); t.id = 'kaleidoscope-toast'; document.body.appendChild(t); }
      t.className = err ? 'err' : '';
      t.innerHTML = '<b>Kaleidoscope</b> · ';
      t.append(msg);
      t.style.opacity = '1';
      clearTimeout(t._h);
      if (!sticky) t._h = setTimeout(() => { t.style.opacity = '0'; }, err ? 9000 : 5000);
    };
    const report = r => GM_setValue(RESULT_KEY, Object.assign({ job: data.job, ts: Date.now(), fellBack: !!data.fellBack }, r));
    const fail = (msg, conv) => {
      toast(msg, true, true);
      if (capture) report({ ok: false, error: msg, conv: conv || location.href });
    };
    const limitFail = line => {
      console.log('[Kaleidoscope] Claude usage limit: ' + line);
      toast('Claude usage limit reached: ' + line, true, true);
      if (capture) report({ ok: false, limit: true, error: line, conv: location.href });
    };
    // handles the special results from pasteAndSend
    const sendFailed = err => {
      if (err === 'SIGNIN') { toast('You\'re signed out of Claude. Sign in and Kaleidoscope picks up from here.', true, true); return tellSignedOut(); }
      if (err.startsWith('LIMIT:')) return limitFail(err.slice(6));
      return fail(err);
    };

    const findComposer = () =>
      document.querySelector('div.ProseMirror[contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"][role="textbox"]') ||
      document.querySelector('fieldset [contenteditable="true"]');
    const looksSignedOut = () => !findComposer() &&
      [...document.querySelectorAll('a,button')].some(e => /^(log ?in|sign ?in|continue with (google|email|apple))/i.test((e.textContent || '').trim()));
    // Claude's "out of messages / usage limit" notice, read only around the chat box (and alerts),
    // so text inside the chat itself can't trigger it. Early warnings ("approaching…") are ignored.
    function limitText() {
      const box = findComposer();
      const areas = [...document.querySelectorAll('[role="alert"],[role="status"]')];
      const near = box && (box.closest('fieldset') || box.closest('form'));
      if (near && near.parentElement) areas.push(near.parentElement.parentElement || near.parentElement);
      const texts = areas.map(a => a.innerText || '');
      if (!box && document.body) texts.push((document.body.innerText || '').slice(-1500));
      for (const t of texts) {
        for (const line of t.split('\n')) {
          if (/out of (free )?messages|usage limit|reached (your|the) (message |usage )?limit|message limit/i.test(line) &&
            !/approach|remaining|left this/i.test(line)) return line.trim().slice(0, 160);
        }
      }
      return '';
    }
    const findSend = () => {
      const b = document.querySelector('button[aria-label="Send message"]') ||
        document.querySelector('button[aria-label*="Send" i]:not([aria-label*="feedback" i])');
      return b && !b.disabled ? b : null;
    };

    // Paste text into the chat box and (optionally) send it. Returns an error message, or '' on success.
    async function pasteAndSend(text, send) {
      const box = await waitFor(findComposer, 20000, 250);
      if (!box) {
        if (looksSignedOut()) return 'SIGNIN';
        const lim = limitText();
        if (lim) return 'LIMIT:' + lim;
        return 'Couldn\'t find the chat box. Your prompt is on the clipboard, so press Ctrl+V.';
      }
      await sleep(500); // let the page finish wiring up the editor
      const lim0 = limitText();
      if (lim0) return 'LIMIT:' + lim0;
      if (!insertText(box, text)) return 'Couldn\'t paste automatically. Your prompt is on the clipboard, so press Ctrl+V.';
      if (!send) return '';
      const btn = await waitFor(findSend, 15000, 300);
      if (!btn) {
        const lim = limitText();
        if (lim) return 'LIMIT:' + lim;
        return 'Prompt added, but the send button never appeared. Press Enter to send.';
      }
      btn.click();
      return '';
    }

    (async () => {
      let org = null;
      let before = 0;
      if (data.update) {
        // Make sure the old chat still exists, and count its replies so we know which one is new.
        try {
          org = await getOrg();
          const r = await fetch(convApi(org, data.convId), { credentials: 'include', headers: { Accept: 'application/json' } });
          if (r.status === 404 || r.status === 403 || r.status === 410) return tellChatGone();
          before = replies(await r.json()).length;
        } catch (e) {
          return fail('Couldn\'t open the board\'s chat (' + (e && e.message) + ').');
        }
      }

      const err = await pasteAndSend(data.text, data.autoSend);
      if (err) return sendFailed(err);
      if (!data.autoSend) return toast(data.label + ' prompt is ready. Press Enter to send.');
      if (!capture) return toast(data.label + ' prompt sent.');

      toast((data.update ? 'Updating' : 'Building') + ' your ' + data.label.toLowerCase() + ' board. This tab closes itself when it\'s done.');
      try {
        if (data.update) await captureUpdate(org, before);
        else await captureBoard();
      } catch (e) {
        if (e && e.limit) return limitFail(e.message);
        console.error('[Kaleidoscope]', e);
        fail('Couldn\'t ' + (data.update ? 'update' : 'grab') + ' the board (' + (e && e.message) + '). It\'s still in this chat.');
      }
    })();

    const convApi = (org, conv) => '/api/organizations/' + org + '/chat_conversations/' + conv +
      '?tree=True&rendering_mode=messages&render_all_tools=true';
    const replies = json => {
      const msgs = json && Array.isArray(json.chat_messages) ? json.chat_messages : null;
      return msgs ? msgs.filter(m => m && m.sender === 'assistant') : (json ? [json] : []);
    };
    async function getJson(url) {
      try {
        const r = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
        return r.ok ? await r.json() : null;
      } catch (e) { return null; }
    }

    async function captureBoard() {
      const conv = await waitFor(() => (location.pathname.match(/^\/chat\/([0-9a-f-]{36})/) || [])[1], 60000, 500);
      if (!conv) throw new Error('the chat never started');
      const org = await getOrg();
      const url = convApi(org, conv);
      let last = '';
      let stable = 0;
      const deadline = Date.now() + 12 * 60 * 1000;
      while (Date.now() < deadline) {
        await sleep(4000);
        const rs = replies(await getJson(url));
        if (!rs.length) {
          const lim = limitText();
          if (lim) throw Object.assign(new Error(lim), { limit: true });
          continue;
        }
        const html = findHtml(rs[rs.length - 1]);
        const done = html && /<\/html>\s*$/i.test(html);
        if (done && html === last) stable++; // same text twice in a row = finished
        else stable = 0;
        last = html || last;
        if (done && stable >= 1) return finish(html, conv, org);
      }
      throw new Error('no finished board after 12 minutes');
    }

    // Same chat: wait for the new reply, apply its edit list to the saved board.
    // If the edits don't fit, ask once for the complete page.
    async function captureUpdate(org, before) {
      const conv = data.convId;
      const url = convApi(org, conv);
      let base = before;
      let sig = '';
      let stable = 0;
      let retried = false;
      const deadline = Date.now() + 12 * 60 * 1000;
      while (Date.now() < deadline) {
        await sleep(4000);
        const rs = replies(await getJson(url));
        if (rs.length <= base) {
          const lim = limitText();
          if (lim) throw Object.assign(new Error(lim), { limit: true });
          continue;
        }
        const reply = rs[rs.length - 1];
        const s = JSON.stringify(reply);
        if (s === sig) stable++;
        else { sig = s; stable = 0; }
        if (stable < 1) continue; // wait until the reply stops growing

        const full = findHtml(reply);
        if (full && /<\/html>\s*$/i.test(full) && full.length > 2000) return finish(full, conv, org);
        const edits = findEdits(reply);
        const res = applyEdits(data.baseHtml, edits);
        console.log('[Kaleidoscope] update reply: ' + edits.length + ' edits, ' + res.missed + ' didn\'t match exactly one spot');
        if (edits.length && !res.missed) return finish(res.html, conv, org);
        if (retried) throw new Error(edits.length ? res.missed + ' of ' + edits.length + ' edits didn\'t match the page' : 'Claude didn\'t send any edits');
        retried = true;
        base = rs.length;
        sig = '';
        stable = 0;
        toast('Some edits didn\'t fit, so Kaleidoscope asked Claude for the full page.');
        const err2 = await pasteAndSend(
          'Some of those edits didn\'t match the page exactly' + (edits.length ? ' (' + res.missed + ' of ' + edits.length + ')' : '') +
          '. Please send the complete updated page instead: one HTML document from <!DOCTYPE html> to </html>, ' +
          'in a ```html code block, with no other text.', true);
        if (err2 && err2.startsWith('LIMIT:')) throw Object.assign(new Error(err2.slice(6)), { limit: true });
        if (err2) throw new Error(err2);
      }
      throw new Error('no updated board after 12 minutes');
    }

    async function finish(html, conv, org) {
      const convUrl = location.origin + '/chat/' + conv;
      const id = data.job;
      GM_setValue(BOARDS_KEY, [{
        id, label: data.label, mode: data.mode, html, conv: convUrl, ts: Date.now(),
        user: data.user, type: data.type, snap: data.snap || null, updated: !!data.update, org: org || null,
      }]); // only the latest board is kept
      const times = GM_getValue(TIMES_KEY, {});
      const key = data.timeKey || data.mode;
      times[key] = (times[key] || []).concat(Date.now() - t0).slice(-5);
      GM_setValue(TIMES_KEY, times);
      // Only close if you're still on this chat; if you've moved to another one in this tab, leave it be.
      const stillHere = location.pathname.startsWith('/chat/' + conv);
      report({ ok: true, conv: convUrl, ms: Date.now() - t0, closeTab: stillHere, updated: !!data.update });
      GM_openInTab(BOARD_URL(id), { active: true });
      console.log('[Kaleidoscope] board ' + (data.update ? 'updated' : 'captured') + ' (' + html.length + ' chars). Still on its chat: ' + stillHere);
      if (!stillHere) { toast('Board ready and opened on AniList.'); return; }
      toast('Board ready. Closing this tab…', false, true);
      await sleep(1200);
      try { window.close(); } catch (e) { console.log('[Kaleidoscope] window.close threw: ' + (e && e.message)); }
      await sleep(1500);
      console.log('[Kaleidoscope] this tab is still open, so closing it was blocked here. The AniList tab will try too.');
      toast('Board ready and opened on AniList. You can close this tab.', false, true);
    }

    async function getOrg() {
      const m = document.cookie.match(/(?:^|;\s*)lastActiveOrg=([0-9a-f-]{36})/);
      if (m) return m[1];
      const r = await fetch('/api/organizations', { credentials: 'include', headers: { Accept: 'application/json' } });
      const list = await r.json();
      const o = (Array.isArray(list) && (list.find(x => (x.capabilities || []).includes('chat')) || list[0])) || null;
      if (!o || !o.uuid) throw new Error('couldn\'t find your Claude account id');
      return o.uuid;
    }

    // The board is the longest complete HTML document anywhere in the reply (artifact, file or code block).
    function findHtml(obj) {
      let best = '';
      const visit = v => {
        if (typeof v === 'string') {
          const i = v.search(/<!DOCTYPE html|<html[\s>]/i);
          if (i < 0) return;
          const j = v.toLowerCase().lastIndexOf('</html>');
          const h = j > i ? v.slice(i, j + 7) : v.slice(i);
          if (h.length > best.length) best = h;
        } else if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v === 'object') Object.values(v).forEach(visit);
      };
      visit(obj);
      return best;
    }

    // Edits come back as {"edits":[{"find","replace"}]} in a json block. If Claude edited its
    // artifact instead, its old_str/new_str pairs work the same way.
    function findEdits(obj) {
      const out = [];
      let fromJson = false;
      const visit = v => {
        if (typeof v === 'string') {
          if (fromJson || !v.includes('"edits"')) return;
          const cands = [];
          const re = /```(?:json)?\s*([\s\S]*?)```/g;
          let m;
          while ((m = re.exec(v))) cands.push(m[1]);
          cands.push(v.slice(v.indexOf('{'), v.lastIndexOf('}') + 1));
          for (const c of cands) {
            try {
              const j = JSON.parse(c);
              if (j && Array.isArray(j.edits)) {
                out.push(...j.edits.filter(e => e && typeof e.find === 'string' && e.find && typeof e.replace === 'string'));
                fromJson = true;
                return;
              }
            } catch (e) { /* not this one */ }
          }
        } else if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v === 'object') {
          if (!fromJson && typeof v.old_str === 'string' && v.old_str && typeof v.new_str === 'string') out.push({ find: v.old_str, replace: v.new_str });
          Object.values(v).forEach(visit);
        }
      };
      visit(obj);
      return out;
    }
    function applyEdits(html, edits) {
      let missed = 0;
      for (const e of edits) {
        const i = html.indexOf(e.find);
        // must match exactly one spot: none, or more than one, counts as a miss (then the full page is requested)
        if (i < 0 || html.indexOf(e.find, i + 1) >= 0) { missed++; continue; }
        html = html.slice(0, i) + e.replace + html.slice(i + e.find.length);
      }
      return { html, missed };
    }

    // A paste event lets Claude handle it like a real paste (long text becomes an attachment).
    // If nothing handles it, fall back to typing it in.
    function insertText(el, text) {
      el.focus();
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
        if (ev.clipboardData) {
          el.dispatchEvent(ev);
          if (ev.defaultPrevented) return true;
        }
      } catch (e) { /* fall through */ }
      try { return document.execCommand('insertText', false, text); } catch (e) { return false; }
    }
  }

  // =====================================================================
  //  ANILIST SIDE
  // =====================================================================
  function aniListSide() {
    const ACCENT = '#3DB4F2';
    const DEFAULT_PREFS = '';
    const DEFAULTS = { type: 'ANIME', dest: 'claude', claudeMode: 'board', prefs: DEFAULT_PREFS, tab: 'rec', btnPos: 'top', hidePlanned: true, appearance: 'auto' };
    const cfg = Object.assign({}, DEFAULTS, GM_getValue('kaleidoscope.settings', {}));
    if (!['auto', 'light', 'dark'].includes(cfg.appearance)) cfg.appearance = 'auto';
    const save = () => GM_setValue('kaleidoscope.settings', cfg);

    // AniList genre-bar colors, one per mode
    const MODES = [
      { id: 'recent', color: '#3DB4F2', title: 'More like my recent', hint: 'Keeps your current streak going' },
      { id: 'top', color: '#5CC22F', title: 'More like my top rated', hint: 'Built on what your favorites have in common' },
      { id: 'wild', color: '#9256F3', title: 'Wildcard', hint: 'Outside your usual genres, still your taste' },
      { id: 'airing', color: '#F779A4', title: 'What\'s airing now', hint: 'Picks from this season\'s real lineup', animeOnly: true },
      { id: 'backlog', color: '#E85D75', title: 'Clear my backlog', hint: 'What to start next from Planning and Paused' },
    ];

    // ---------------- Data ----------------
    async function gql(query, variables) {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 429) throw new Error('AniList rate limit hit. Wait a minute and try again.');
      const json = await res.json().catch(() => null);
      if (!json) throw new Error('AniList returned an unreadable response.');
      if (json.errors && json.errors.length) throw new Error('AniList: ' + json.errors.map(e => e.message).join('; '));
      return json.data;
    }

    const titleOf = m => ((m.title && (m.title.english || m.title.romaji)) || 'Untitled').replace(/\|/g, '/');
    const fmtDate = d => {
      if (!d || !d.year) return '';
      let s = String(d.year);
      if (d.month) s += '-' + String(d.month).padStart(2, '0');
      if (d.month && d.day) s += '-' + String(d.day).padStart(2, '0');
      return s;
    };

    const LIST_Q = `query ($u: String, $t: MediaType) {
      MediaListCollection(userName: $u, type: $t) {
        lists { entries {
          status progress updatedAt
          score(format: POINT_10_DECIMAL)
          startedAt { year month day }
          completedAt { year month day }
          media { id format episodes chapters genres title { english romaji } }
        } }
      }
    }`;

    async function fetchList(user, type) {
      const data = await gql(LIST_Q, { u: user, t: type });
      const lists = data && data.MediaListCollection && data.MediaListCollection.lists;
      if (!lists) throw new Error('AniList didn\'t return a list for ' + user + '. Is it private?');
      const seen = new Map(); // custom lists repeat entries, so keep each show once
      for (const l of lists) {
        for (const e of l.entries || []) {
          if (!e || !e.media || seen.has(e.media.id)) continue;
          const m = e.media;
          seen.set(m.id, {
            id: m.id,
            title: titleOf(m),
            status: e.status,
            score: e.score || 0,
            progress: e.progress || 0,
            total: type === 'ANIME' ? m.episodes : m.chapters,
            format: m.format || '',
            genres: m.genres || [],
            start: fmtDate(e.startedAt),
            finish: fmtDate(e.completedAt),
            updatedAt: e.updatedAt || 0,
          });
        }
      }
      return [...seen.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    }

    function currentSeason() {
      const d = new Date();
      const m = d.getMonth();
      // AniList: Winter = Dec-Feb, Spring = Mar-May, Summer = Jun-Aug, Fall = Sep-Nov
      if (m === 11) return { season: 'WINTER', year: d.getFullYear() + 1 };
      return { season: ['WINTER', 'WINTER', 'SPRING', 'SPRING', 'SPRING', 'SUMMER', 'SUMMER', 'SUMMER', 'FALL', 'FALL', 'FALL'][m], year: d.getFullYear() };
    }

    const AIRING_Q = `query ($page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo { hasNextPage }
        media(status: RELEASING, type: ANIME, isAdult: false, format_in: [TV, TV_SHORT, ONA], sort: POPULARITY_DESC) {
          id format episodes genres averageScore season seasonYear
          title { english romaji }
          coverImage { large }
          tags { name rank isMediaSpoiler isGeneralSpoiler }
        }
      }
    }`;

    async function fetchAiring() {
      const out = [];
      for (let page = 1; page <= 2; page++) {
        const d = await gql(AIRING_Q, { page });
        out.push(...d.Page.media);
        if (!d.Page.pageInfo.hasNextPage) break;
      }
      return out;
    }

    const REL_Q = `query ($ids: [Int], $page: Int) {
      Page(page: $page, perPage: 50) {
        media(id_in: $ids) {
          id
          relations { edges { relationType node {
            id type format status
            title { english romaji }
            coverImage { medium }
            startDate { year }
          } } }
        }
      }
    }`;

    async function findSequels(list, type) {
      const byId = new Map(list.map(e => [e.id, e]));
      const done = list.filter(e => e.status === 'COMPLETED' || e.status === 'REPEATING');
      const out = new Map();
      for (let i = 0; i < done.length; i += 50) {
        const chunk = done.slice(i, i + 50);
        const d = await gql(REL_Q, { ids: chunk.map(e => e.id), page: 1 });
        for (const m of d.Page.media) {
          for (const edge of (m.relations && m.relations.edges) || []) {
            const n = edge.node;
            if (edge.relationType !== 'SEQUEL' || !n || n.type !== type) continue;
            if (n.format === 'MUSIC' || n.status === 'CANCELLED') continue;
            const mine = byId.get(n.id);
            if (mine && mine.status !== 'PLANNING') continue; // already watching/finished/dropped it
            if (out.has(n.id)) continue;
            out.set(n.id, {
              id: n.id,
              title: titleOf(n),
              cover: n.coverImage && n.coverImage.medium,
              year: n.startDate && n.startDate.year,
              status: n.status,
              format: n.format,
              planned: !!mine,
              after: byId.get(m.id) ? byId.get(m.id).title : '',
            });
          }
        }
      }
      const order = { RELEASING: 0, FINISHED: 1, HIATUS: 2, NOT_YET_RELEASED: 3 };
      return [...out.values()].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (b.year || 0) - (a.year || 0));
    }

    // Cache so the prompt is ready the moment you click (the browser only allows opening a new
    // tab right after a click, so the list is loaded when the panel opens, not when you pick a mode).
    const cache = { lists: new Map(), airing: null };
    function getList(user, type, force) {
      const k = user.toLowerCase() + ':' + type;
      const c = cache.lists.get(k);
      if (c && !force && Date.now() - c.ts < 5 * 60 * 1000) return c;
      const entry = { ts: Date.now(), data: null, err: null };
      entry.p = fetchList(user, type).then(d => (entry.data = d), e => { entry.err = e; if (cache.lists.get(k) === entry) cache.lists.delete(k); throw e; }); // a reload may have replaced this entry
      cache.lists.set(k, entry);
      return entry;
    }
    function getAiring() {
      const c = cache.airing;
      if (c && Date.now() - c.ts < 15 * 60 * 1000) return c;
      const entry = { ts: Date.now(), data: null };
      entry.p = fetchAiring().then(d => (entry.data = d), e => { if (cache.airing === entry) cache.airing = null; throw e; });
      cache.airing = entry;
      return entry;
    }

    function getUsername() {
      const m = location.pathname.match(/^\/user\/([^/]+)/);
      if (m) return decodeURIComponent(m[1]);
      const a = document.querySelector('.nav a[href^="/user/"], #nav a[href^="/user/"]') ||
        document.querySelector('a[href^="/user/"]');
      const mm = a && a.getAttribute('href').match(/^\/user\/([^/]+)/);
      return mm ? decodeURIComponent(mm[1]) : null;
    }

    // ---------------- Prompt ----------------
    const STATUS_CODE = { CURRENT: 'W', COMPLETED: 'C', REPEATING: 'R', PAUSED: 'P', DROPPED: 'D', PLANNING: 'L' };

    function statsText(list, A) {
      const NAMES = { CURRENT: A ? 'watching' : 'reading', COMPLETED: 'completed', REPEATING: A ? 'rewatching' : 'rereading', PAUSED: 'paused', DROPPED: 'dropped', PLANNING: 'planning' };
      const by = {};
      for (const e of list) by[e.status] = (by[e.status] || 0) + 1;
      const scored = list.filter(e => e.score > 0);
      const mean = scored.length ? (scored.reduce((a, e) => a + e.score, 0) / scored.length).toFixed(2) : '-';
      const hist = Array(10).fill(0);
      for (const e of scored) hist[Math.min(10, Math.max(1, Math.round(e.score))) - 1]++;
      const g = {};
      for (const e of list) {
        if (e.status === 'PLANNING') continue;
        for (const x of e.genres) {
          const o = g[x] || (g[x] = { n: 0, sum: 0, c: 0 });
          o.n++;
          if (e.score) { o.sum += e.score; o.c++; }
        }
      }
      const genres = Object.entries(g).sort((a, b) => b[1].n - a[1].n).slice(0, 12)
        .map(([k, v]) => k + ' ' + v.n + (v.c ? ' (avg ' + (v.sum / v.c).toFixed(1) + ')' : ''));
      const months = [];
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        months.push(key + ' ' + list.filter(e => e.finish && e.finish.startsWith(key)).length);
      }
      const units = list.reduce((a, e) => a + (e.status === 'PLANNING' ? 0 : e.progress), 0);
      return [
        'Entries by status: ' + Object.keys(NAMES).filter(k => by[k]).map(k => NAMES[k] + ' ' + by[k]).join(', '),
        'Mean score: ' + mean + ' (' + scored.length + ' scored)',
        'Score distribution 1-10: ' + hist.map((n, i) => (i + 1) + ':' + n).join(', '),
        'Top genres, excluding planning (count, my avg score): ' + genres.join(', '),
        'Finished per month, last 12: ' + months.join(', '),
        'Total ' + (A ? 'episodes watched' : 'chapters read') + ': ' + units,
      ].join('\n');
    }

    // The board design is fixed here so every result looks the same.
    const BOARD_SPEC = (noun, A) =>
      'OUTPUT: build a recommendation board\n' +
      'Deliver your answer as a single self-contained HTML page (an artifact) with exactly this design, so every board looks the same:\n' +
      '- Style: AniList dark theme. Page #0B1622, cards #151F2E, raised elements #1A2638, body text #9FADBD, headings #EDF1F5, accent #3DB4F2. ' +
      'Font: Overpass, falling back to system-ui. Cards with 12px rounded corners and soft shadows, generous spacing, responsive grid that works on a phone.\n' +
      '- Genre chips in AniList genre colors: Action #68D639, Adventure #E85D75, Comedy #F79A63, Drama #02A9FF, Fantasy #F779A4, Horror #A3412C, ' +
      'Mystery #5C6BC0, Psychological #8E44AD, Romance #E6977A, Sci-Fi #3DB4F2, Slice of Life #7BD555, Sports #F7C948, Supernatural #9256F3, Thriller #D35454, others #728AA1.\n' +
      '- Charts: plain inline SVG/CSS only, no external libraries, so nothing fails to load.\n' +
      'Sections, in this order:\n' +
      '1. Header: "Kaleidoscope" (Kaleido in white, scope in #3DB4F2), the request name, my username, today\'s date, and my mood if I gave one.\n' +
      '2. Taste profile: 4 stat tiles from <my_stats> (total, completed, mean score, ' + (A ? 'episodes watched' : 'chapters read') + '), ' +
      'a horizontal bar chart of my top genres (count, labeled with my avg score), a score distribution chart, a small finished-per-month chart, ' +
      'and 3-5 short takeaways from your analysis (what I love, what I drop, pacing, fights/powers/character dynamics).\n' +
      '3. Recommendations: one card per pick, highest predicted rating first. Each card: cover image, title, format · ' + (A ? 'episodes' : 'chapters') +
      ' · year · status, genre chips, a large predicted-rating badge, "Why you\'ll like it", "Similar to" (chips of titles from my list), ' +
      '"Avoids" (what I disliked that it skips), and an "Open on AniList" button.\n' +
      '4. At a glance: a comparison table of every pick (title, predicted rating, genres, length, year, similar to).\n' +
      '5. Anything specific to this request (skips, prerequisites, drops) as its own small section at the end.\n' +
      'Cover images: if a cover URL is given in a list below, use it directly. Otherwise load it in the page from AniList\'s public API ' +
      '(POST https://graphql.anilist.co, query Media(id: ID) when you know the id, or Media(search: "TITLE", type: ' + (A ? 'ANIME' : 'MANGA') + '), ' +
      'requesting coverImage { large } siteUrl). If a cover can\'t load, show a neat placeholder (a gradient in the first genre\'s color with the title\'s initials), never a broken image.\n' +
      'Just before </body>, include a hidden list of your picks for Kaleidoscope, in exactly this form: ' +
      '<script type="application/json" id="kaleidoscope-picks">[{"title":"English title","id":ANILIST_ID_OR_null,"predicted":8.5}]</script>\n' +
      'Write the complete page in one go, from <!DOCTYPE html> to </html>, with no placeholders or "rest unchanged" shortcuts.\n' +
      'In the chat itself, keep your reply to a short summary. The board is the deliverable.';

    function buildPrompt(modeId, user, type, list, airing, note) {
      const A = type === 'ANIME';
      const noun = A ? 'anime' : 'manga';
      const verb = A ? 'watch' : 'read';
      const unit = A ? 'eps' : 'ch';
      const fromMyList = modeId === 'backlog';

      const lines = list.map(e => [
        e.id,
        e.title,
        STATUS_CODE[e.status] || e.status,
        e.score ? +e.score.toFixed(1) : '-',
        e.progress + '/' + (e.total || '?') + ' ' + unit,
        e.format,
        e.genres.join(', '),
        (e.start || e.finish) ? (e.start || '?') + ' → ' + (e.finish || '') : '',
      ].join(' | '));

      const parts = [];

      // 1. Core: always the same, whatever the mode
      parts.push(
        'You are an expert ' + noun + ' recommender.\n' +
        'Here is my FULL AniList ' + noun + ' list (user: ' + user + ', ' + list.length + ' entries) including scores and statuses.\n' +
        'Format: id | title | status | my score /10 | progress | format | genres | started → finished\n' +
        'Status: W=' + (A ? 'watching' : 'reading') + ', C=completed, R=' + (A ? 'rewatching' : 'rereading') +
        ', P=paused, D=dropped, L=planning. "-" = unscored. Sorted by most recently updated first.\n\n' +
        '<my_list>\n' + lines.join('\n') + '\n</my_list>\n\n' +
        '<my_stats> (computed exactly from the list above; use these numbers for charts and tiles)\n' +
        statsText(list, A) + '\n</my_stats>'
      );
      parts.push(
        'First, deeply analyze my taste:\n' +
        '- What I consistently rate highly\n' +
        '- What I drop or rate poorly\n' +
        '- Preferred pacing\n' +
        '- Type of fights, power systems, and character dynamics I enjoy\n\n' +
        'Then, for EACH recommendation, give:\n' +
        '- Why I would like it (based on my actual behavior)\n' +
        '- What it is similar to from my list\n' +
        '- Why it avoids things I disliked\n' +
        '- Predicted rating I would give it (1-10, same scale as my scores)\n' +
        '- A link: https://anilist.co/' + noun + '/ID when the id is in a list I gave you, otherwise https://anilist.co/search/' + noun + '?search=TITLE (URL-encoded)\n\n' +
        'Rules:\n' +
        (fromMyList
          ? '- This time, only pick from my own list (see the request below)\n'
          : '- Do NOT recommend anything already in my list, in any status' +
            (modeId === 'airing' ? ' (titles marked [P] below are fine: they\'re on my Planning list)' : '') + '\n') +
        '- Use BOTH likes and dislikes to guide picks\n' +
        '- Be specific and grounded in my data, but flexible if you think it\'s something I would enjoy\n' +
        '- Only state years, episode/chapter counts and airing status you\'re confident about; leave a field out rather than guess'
      );
      parts.push(BOARD_SPEC(noun, A));

      // 2. Standing preferences
      if (cfg.prefs && cfg.prefs.trim()) parts.push('My standing preferences:\n' + cfg.prefs.trim());

      // 3. Mood
      const mood = moodText.trim();
      if (mood) parts.push('Right now I\'m in the mood for: ' + mood + '\nWeigh this heavily.');
      if (note) parts.push('Feedback on the last board you made for me: ' + note + '\nTake this into account.');

      // 4. This request: what the mode adds on top of the core
      let req = '';
      if (modeId === 'recent') {
        req =
          'THIS REQUEST: More like my recent\n' +
          'Give extra weight in your analysis to my ~15 most recently active entries (top of the list, ignoring L): what have I been into lately?\n' +
          'Recommend 5 ' + noun + ' that keep that streak going. For each, also say which recent title(s) of mine it\'s closest to.';
      } else if (modeId === 'top') {
        req =
          'THIS REQUEST: More like my top rated\n' +
          'Anchor your analysis on everything I scored 8 or higher, and contrast it with what I dropped or scored 5 or lower. What do my favorites share that my low scores lack?\n' +
          'Recommend 5 ' + noun + ' built on those shared traits. For each, also say which favorites it echoes.';
      } else if (modeId === 'wild') {
        req =
          'THIS REQUEST: Wildcard\n' +
          'Find the genres and formats I almost never touch.\n' +
          'Recommend 3 ' + noun + ' from outside my comfort zone that still hit my underlying taste. Be bold, no safe picks. ' +
          'For each, also explain why it\'s a stretch for me and why it still fits.';
      } else if (modeId === 'backlog') {
        req =
          'THIS REQUEST: Clear my backlog\n' +
          'Only pick from my Planning (L) and Paused (P) entries. No new titles this time.\n' +
          'Rank the top 5 I should ' + verb + ' next. Also flag any that need a prior season or entry first, and any I should probably drop from my list.';
      } else if (modeId === 'airing') {
        const s = currentSeason();
        const byId = new Map(list.map(e => [e.id, e]));
        const cands = airing.filter(m => { const mine = byId.get(m.id); return !mine || mine.status === 'PLANNING'; });
        const cl = cands.map(m => {
          const isNew = m.season === s.season && m.seasonYear === s.year;
          const planned = byId.has(m.id);
          const tags = (m.tags || []).filter(t => !t.isMediaSpoiler && !t.isGeneralSpoiler && t.rank >= 60).slice(0, 4).map(t => t.name);
          return [
            m.id,
            titleOf(m) + (isNew ? ' ★' : '') + (planned ? ' [P]' : ''),
            m.format,
            (m.episodes || '?') + ' eps',
            (m.genres || []).join(', '),
            tags.join(', ') || '-',
            m.averageScore ? m.averageScore + '%' : '-',
            (m.coverImage && m.coverImage.large) || '-',
          ].join(' | ');
        });
        req =
          'THIS REQUEST: What\'s airing now\n' +
          'Below are the ' + cands.length + ' most popular anime airing right now, pulled live from AniList today. ' +
          '★ = premiered this season (' + s.season.toLowerCase() + ' ' + s.year + '), [P] = already on my Planning list. ' +
          'Shows already on my list in any other status were removed.\n' +
          'Only choose from this list. Your own knowledge of recent anime may be out of date.\n' +
          'Format: id | title | format | episodes | genres | top tags | community score | cover image URL\n\n' +
          '<airing_now>\n' + cl.join('\n') + '\n</airing_now>\n\n' +
          'Rank the top 6 for me. Then name 2-3 popular ones I should skip and why, and flag any that need an earlier season I haven\'t seen.';
      }
      parts.push(req);

      return parts.join('\n\n');
    }

    // ---------------- Panel (Molten Tools layout, AniList colors) ----------------
    // Everything lives inside a shadow root so AniList's own CSS and scripts can't touch it.
    const PANEL_CSS = (
      '#kaleidoscope-toggle{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:40px;height:40px;padding:0;border:0;' +
      'border-radius:50%;background:#151F2E;color:#EDF1F5;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;' +
      'font-size:19px;line-height:1;box-shadow:0 4px 14px rgba(0,0,0,.45);transition:color .15s,box-shadow .15s,background .15s}' +
      '#kaleidoscope-toggle:hover{color:' + ACCENT + ';box-shadow:0 4px 18px rgba(61,180,242,.3)}' +
      '#kaleidoscope-toggle.open{color:' + ACCENT + ';background:#0B1622}' +

      // Light and dark glass (the Glassware recipe) in AniList's palette: only these neutrals swap; the blue stays.
      '#kaleidoscope-panel,#kaleidoscope-job{--k-glass:rgba(21,31,46,.8);--k-solid:#151F2E;--k-well:#0B1622;--k-well-hi:#1A2638;--k-sw-off:#2B3A4F;' +
      '--k-title:#fff;--k-strong:#EDF1F5;--k-text:#C9D7E3;--k-muted:#9FADBD;--k-dim:#728AA1;--k-dimmer:#5F7186;--k-ink:#7FC9F5;--k-line:rgba(255,255,255,.06);' +
      '--k-edge:rgba(255,255,255,.12);--k-hl:rgba(255,255,255,.1);--k-drop:rgba(0,0,0,.6);--k-btn:rgba(255,255,255,.07);--k-btn-hi:rgba(255,255,255,.13);' +
      '--k-scrim:rgba(11,22,34,.72);--k-good:#68D639;--k-bad:#E85D75;--k-warn:#F7C948;--k-knob:#3a4b63;color-scheme:dark}' +
      '#kaleidoscope-panel[data-theme=light],#kaleidoscope-job[data-theme=light]{--k-glass:rgba(255,255,255,.84);--k-solid:#fafbfc;--k-well:rgba(92,114,138,.08);--k-well-hi:rgba(92,114,138,.15);' +
      '--k-sw-off:rgba(92,114,138,.3);--k-title:#1f2d3d;--k-strong:#1f2d3d;--k-text:#3a4a5c;--k-muted:#55697e;--k-dim:#5f7388;--k-dimmer:#73869b;--k-ink:#1a7fbf;' +
      '--k-line:rgba(0,0,0,.07);--k-edge:rgba(255,255,255,.8);--k-hl:#fff;--k-drop:rgba(0,0,0,.34);--k-btn:rgba(92,114,138,.1);--k-btn-hi:rgba(92,114,138,.18);' +
      '--k-scrim:rgba(237,241,245,.6);--k-good:#2e8a12;--k-bad:#c23a52;--k-warn:#9a7400;--k-knob:#fff;color-scheme:light}' +
      // sun/moon switch: light or dark glass (the device's choice until it's flipped)
      // accent text on light glass uses the deeper blue so it stays readable
      '#kaleidoscope-panel[data-theme=light] .kld-tab.on,#kaleidoscope-panel[data-theme=light] .kld-reload:hover,#kaleidoscope-panel[data-theme=light] .kld-more:hover,#kaleidoscope-panel[data-theme=light] .kld-item:hover .kld-it,#kaleidoscope-panel[data-theme=light] .kld-title b{color:var(--k-ink)}' +
      // glassware:frame start: shared controls, stamped by tools/frame.py; edit them there
      '#kaleidoscope-panel button{display:inline-block;height:auto;min-height:0;align-items:center;line-height:inherit;vertical-align:middle}' +
      '#kaleidoscope-panel .kld-mode-sw{position:relative!important;flex:none!important;display:flex!important;align-items:center!important;justify-content:space-between!important;width:50px!important;height:28px!important;margin:0 0 0 auto!important;padding:0 7px!important;border:0!important;border-radius:14px!important;background:var(--k-well)!important;color:var(--k-muted)!important;cursor:pointer!important;box-sizing:border-box!important;min-width:0!important;min-height:0!important;max-height:none!important;line-height:1!important;text-transform:none!important;letter-spacing:normal!important}' +
      '#kaleidoscope-panel .kld-mode-sw svg{position:relative!important;z-index:1!important;flex:none!important;display:block!important;width:13px!important;height:13px!important;transition:color .18s!important}' +
      '#kaleidoscope-panel .kld-mode-sw .kld-knob{position:absolute!important;top:3px!important;left:3px!important;width:22px!important;height:22px!important;border-radius:50%!important;background:var(--k-knob)!important;box-shadow:0 1px 3px rgba(0,0,0,.25)!important;transition:transform .2s cubic-bezier(.3,.7,.3,1)!important}' +
      '#kaleidoscope-panel[data-theme=dark] .kld-mode-sw .kld-knob{transform:translateX(22px)!important}' +
      '#kaleidoscope-panel .kld-mode-sw .kld-sun,#kaleidoscope-panel[data-theme=dark] .kld-mode-sw .kld-moon{color:var(--k-strong)!important}' +
      '#kaleidoscope-panel[data-theme=dark] .kld-mode-sw .kld-sun{color:var(--k-muted)!important}' +
      '#kaleidoscope-panel .kld-x{flex:none!important;display:grid!important;place-items:center!important;width:28px!important;height:28px!important;margin:0 0 0 8px!important;padding:0!important;border:0!important;border-radius:50%!important;background:var(--k-well)!important;color:var(--k-muted)!important;cursor:pointer!important;box-sizing:border-box!important;min-width:0!important;min-height:0!important;max-height:none!important;line-height:1!important;text-transform:none!important;letter-spacing:normal!important}' +
      '#kaleidoscope-panel .kld-x:hover{background:var(--k-well-hi)!important;color:var(--k-strong)!important}' +
      '#kaleidoscope-panel input.kld-switch{flex:none!important;position:relative!important;width:40px!important;height:24px!important;margin:0!important;padding:0!important;border:0!important;border-radius:12px!important;background:var(--k-sw-off)!important;cursor:pointer!important;transition:background .18s!important;box-sizing:border-box!important;min-width:0!important;min-height:0!important;max-height:none!important;line-height:1!important;text-transform:none!important;letter-spacing:normal!important;appearance:none!important;-webkit-appearance:none!important}' +
      '#kaleidoscope-panel input.kld-switch::after{content:""!important;position:absolute!important;top:2px!important;left:2px!important;width:20px!important;height:20px!important;border-radius:50%!important;background:#fff!important;box-shadow:0 1px 3px rgba(0,0,0,.25)!important;transition:transform .18s cubic-bezier(.3,.7,.3,1)!important}' +
      '#kaleidoscope-panel input.kld-switch:checked{background:' + ACCENT + '!important;box-shadow:0 0 12px -2px color-mix(in srgb,' + ACCENT + ' 70%,transparent)!important}' +
      '#kaleidoscope-panel input.kld-switch:checked::after{transform:translateX(16px)!important}' +
      '#kaleidoscope-panel .kld-mode-sw:focus-visible,#kaleidoscope-panel .kld-x:focus-visible,#kaleidoscope-panel input.kld-switch:focus-visible{outline:2px solid ' + ACCENT + '!important;outline-offset:2px!important}' +
      // glassware:frame end
      '#kaleidoscope-panel{position:fixed;top:16px;right:16px;width:400px;box-sizing:border-box;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);height:auto;min-height:0;' +
      'display:flex;flex-direction:column;z-index:2147483647;background:radial-gradient(120% 40% at 0% 0%,rgba(61,180,242,.16),transparent 64%),var(--k-glass);' +
      '-webkit-backdrop-filter:blur(28px) saturate(170%);backdrop-filter:blur(28px) saturate(170%);color:var(--k-text);' +
      'border:1px solid var(--k-edge);border-radius:22px;box-shadow:0 0 0 .5px rgba(61,180,242,.35),0 0 40px -12px rgba(61,180,242,.45),0 14px 44px var(--k-drop),inset 0 1px 0 var(--k-hl);' +
      'font:13px/1.45 Overpass,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:left;opacity:1;visibility:visible}' +
      '#kaleidoscope-panel *{box-sizing:border-box;font-family:inherit !important;letter-spacing:normal}' +
      '#kaleidoscope-panel label{color:inherit!important;text-shadow:inherit!important}' +   // sites style <label>
      '#kaleidoscope-panel .kld-head{display:flex;align-items:flex-start;justify-content:space-between;padding:14px 18px 10px 18px}' +
      '#kaleidoscope-panel .kld-title{font-weight:800;font-size:17px;color:var(--k-title);line-height:1.2}' +
      '#kaleidoscope-panel .kld-title b{color:' + ACCENT + ';font-weight:800}' +
      '#kaleidoscope-panel .kld-tagline{font-size:12px;color:var(--k-ink);margin:1px 0 2px}' +
      '#kaleidoscope-panel .kld-sub{color:var(--k-dim);font-size:11.5px}' +
      '#kaleidoscope-panel .kld-sub b{color:var(--k-text);font-weight:600}' +
      '#kaleidoscope-panel .kld-reload{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-left:5px;' +
      'padding:0;border:0;border-radius:50%;background:transparent;color:var(--k-dim);font-size:13px;line-height:1;cursor:pointer;vertical-align:-3px}' +
      '#kaleidoscope-panel .kld-reload:hover{color:' + ACCENT + ';background:rgba(61,180,242,.12)}' +
      '#kaleidoscope-panel .kld-reload.spin{color:' + ACCENT + ';animation:kld-spin .8s linear infinite}' +
      '#kaleidoscope-panel .kld-tabs{display:flex;gap:4px;margin:0 14px 6px;padding:4px;background:var(--k-well);border-radius:12px}' +
      '#kaleidoscope-panel .kld-tab{flex:1;padding:7px 4px;border:0;border-radius:9px;background:transparent;color:var(--k-muted);' +
      'cursor:pointer;font-size:12.5px;font-weight:600}' +
      '#kaleidoscope-panel .kld-tab:hover{color:var(--k-strong)}' +
      '#kaleidoscope-panel .kld-tab.on{background:rgba(61,180,242,.16);color:' + ACCENT + '}' +
      '#kaleidoscope-panel .kld-body{overflow-y:auto;padding:2px 16px 16px;scrollbar-width:thin;scrollbar-color:var(--k-sw-off) transparent}' +
      '#kaleidoscope-panel .kld-sec{margin:18px 0 6px;display:flex;align-items:center;gap:7px;color:var(--k-ink);font:700 10.5px/1.2 ui-monospace,"SF Mono","Cascadia Mono",Menlo,monospace !important;letter-spacing:.16em;text-transform:uppercase}' +
      '#kaleidoscope-panel .kld-sec::before{content:"";width:6px;height:6px;border-radius:1px;background:' + ACCENT + ';transform:rotate(45deg);flex:none}' +
      '#kaleidoscope-panel .kld-brand{display:flex;align-items:center;gap:11px;min-width:0}' +
      '#kaleidoscope-panel .kld-icon{width:34px;height:34px;border-radius:10px;flex:none;display:grid;place-items:center;' +
      'background:linear-gradient(145deg,#4cc2ff,#2257d6);box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}' +
      '#kaleidoscope-panel .kld-icon{position:relative}' +
      '#kaleidoscope-panel .kld-icon-img{position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;display:block}' +
      '#kaleidoscope-panel .kld-icon svg{width:22px;height:22px;display:block}' +
      '#kaleidoscope-panel .kld-ctx{display:flex;align-items:center;gap:8px;margin:0 16px 10px;min-width:0}' +
      '#kaleidoscope-panel .kld-ctx .kld-sub{font:12.5px ui-monospace,"SF Mono","Cascadia Mono",Menlo,monospace !important}' +
      '#kaleidoscope-panel .kld-footline{padding:9px 16px 12px;font-size:11.5px;color:var(--k-dim);border-top:1px solid var(--k-line)}' +
      '#kaleidoscope-panel .kld-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0}' +
      '#kaleidoscope-panel label.kld-row{cursor:pointer}' +
      '#kaleidoscope-panel .kld-label{flex:1;min-width:0;color:var(--k-strong)}' +
      '#kaleidoscope-panel .kld-hint{display:block;color:var(--k-dim);font-size:11.5px;margin-top:1px}' +
      '#kaleidoscope-panel .kld-seg{display:flex;gap:4px;padding:4px;background:var(--k-well);border-radius:12px}' +
      '#kaleidoscope-panel .kld-segbtn{flex:1;padding:8px 4px;border:0;border-radius:9px;background:transparent;color:var(--k-muted);' +
      'cursor:pointer;font-size:12.5px;font-weight:600}' +
      '#kaleidoscope-panel .kld-segbtn:hover{color:var(--k-strong)}' +
      '#kaleidoscope-panel .kld-segbtn.kld-segicon{flex:0 0 44px;font-size:15px;padding:6px 0}' +
      '#kaleidoscope-panel .kld-segbtn.on{background:' + ACCENT + ';color:#0B1622}' +
      '#kaleidoscope-panel input.kld-text,#kaleidoscope-panel textarea.kld-text{width:100%;background:var(--k-well);color:var(--k-strong);' +
      'border:1px solid var(--k-line);border-radius:8px;padding:8px 10px;font-size:12.5px;outline:none;margin:0}' +
      '#kaleidoscope-panel textarea.kld-text{min-height:74px;resize:vertical;line-height:1.45;margin-top:6px}' +
      '#kaleidoscope-panel .kld-text:focus{border-color:' + ACCENT + '}' +
      '#kaleidoscope-panel .kld-text::placeholder{color:var(--k-dimmer)}' +
      '#kaleidoscope-panel .kld-modes{display:flex;flex-direction:column;gap:6px}' +
      '#kaleidoscope-panel .kld-mode{display:flex;align-items:center;gap:11px;width:100%;padding:9px 12px;border:0;border-radius:10px;' +
      'background:var(--k-well);color:var(--k-strong);cursor:pointer;text-align:left;transition:background .12s,transform .08s}' +
      '#kaleidoscope-panel .kld-mode:hover{background:var(--k-well-hi)}' +
      '#kaleidoscope-panel .kld-mode:active{transform:scale(.985)}' +
      '#kaleidoscope-panel .kld-mode .kld-dot{width:9px;height:9px;border-radius:50%;flex:none;background:var(--c);box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 20%,transparent)}' +
      '#kaleidoscope-panel .kld-mode .kld-label{font-weight:600;font-size:13px}' +
      '#kaleidoscope-panel .kld-mode .kld-go{color:var(--k-dimmer);font-size:15px;flex:none;transition:color .12s,transform .12s}' +
      '#kaleidoscope-panel .kld-mode:hover .kld-go{color:var(--c);transform:translateX(2px)}' +
      '#kaleidoscope-panel .kld-mode.busy .kld-go{animation:kld-spin .8s linear infinite;color:var(--c)}' +
      '@keyframes kld-spin{to{transform:rotate(360deg)}}' +
      '#kaleidoscope-panel .kld-mode[disabled]{opacity:.35;cursor:not-allowed}' +
      '#kaleidoscope-panel .kld-mode[disabled]:hover{background:var(--k-well)}' +
      '#kaleidoscope-panel .kld-btns{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:6px;margin-top:12px}.kld-btns>.kld-btn{text-align:center}' +
      '#kaleidoscope-panel .kld-btn{padding:7px 12px;border:0;border-radius:8px;background:var(--k-btn);color:var(--k-strong);cursor:pointer;font-size:12.5px}' +
      '#kaleidoscope-panel .kld-btn:hover{background:var(--k-btn-hi)}' +
      '#kaleidoscope-panel .kld-btn.primary{background:' + ACCENT + ';color:#0B1622;font-weight:650}' +
      '#kaleidoscope-panel .kld-btn.primary:hover{background:#5CC2F5}' +
      '#kaleidoscope-panel .kld-btn[disabled]{opacity:.5;cursor:wait}' +
      '#kaleidoscope-panel .kld-status{min-height:16px;font-size:12px;color:var(--k-good);margin-top:10px}' +
      '#kaleidoscope-panel .kld-status.err{color:var(--k-bad)}' +
      '#kaleidoscope-panel .kld-status.wait{color:var(--k-muted)}' +
      '#kaleidoscope-panel .kld-info{background:var(--k-well);border-radius:10px;padding:9px 11px;margin:8px 0 4px;font-size:12px;color:var(--k-muted)}' +
      '#kaleidoscope-panel .kld-info b{color:var(--k-strong);font-weight:650}' +
      '#kaleidoscope-panel .kld-note{color:var(--k-dimmer);font-size:11.5px;margin-top:12px}' +
      '#kaleidoscope-panel .kld-off{opacity:.4;pointer-events:none}' +
      '#kaleidoscope-panel .kld-item{display:flex;align-items:center;gap:10px;padding:6px;margin-bottom:6px;background:var(--k-well);' +
      'border-radius:10px;text-decoration:none;color:inherit}' +
      '#kaleidoscope-panel .kld-item:hover{background:var(--k-well-hi)}' +
      '#kaleidoscope-panel .kld-item img,#kaleidoscope-panel .kld-item .kld-ph{width:34px;height:48px;object-fit:cover;border-radius:5px;flex:none;background:var(--k-well-hi)}' +
      '#kaleidoscope-panel .kld-item .kld-it{color:var(--k-strong);font-size:12.5px;font-weight:600;line-height:1.3}' +
      '#kaleidoscope-panel .kld-item:hover .kld-it{color:' + ACCENT + '}' +
      '#kaleidoscope-panel .kld-item .kld-is{color:var(--k-dim);font-size:11px;margin-top:2px}' +
      '#kaleidoscope-panel .kld-modal{position:absolute;inset:0;z-index:5;border-radius:16px;background:var(--k-scrim);' +
      '-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:18px;outline:none}' +
      '#kaleidoscope-panel .kld-mcard{width:100%;background:var(--k-solid);border:1px solid rgba(61,180,242,.3);border-radius:14px;padding:16px;' +
      'box-shadow:0 14px 40px rgba(0,0,0,.55)}' +
      '#kaleidoscope-panel .kld-mt{color:var(--k-strong);font-weight:700;font-size:14.5px;margin-bottom:6px}' +
      '#kaleidoscope-panel .kld-mp{color:var(--k-text);font-size:13px;line-height:1.5}' +
      '#kaleidoscope-panel .kld-mp b{color:var(--k-strong);font-weight:650}' +
      '#kaleidoscope-panel .kld-mh{color:var(--k-dim);font-size:11.5px;margin-top:8px}' +
      '#kaleidoscope-panel .kld-lastcard{background:var(--k-well);border-radius:10px;padding:9px 10px 10px 12px}' +
      '#kaleidoscope-panel .kld-last{display:flex;align-items:center;justify-content:space-between;gap:10px}' +
      '#kaleidoscope-panel .kld-upd{border-top:1px solid var(--k-line);margin-top:10px;padding-top:10px}' +
      '#kaleidoscope-panel .kld-upd textarea.kld-text{background:var(--k-solid);margin-top:8px}' +
      '#kaleidoscope-panel .kld-updt{color:var(--k-strong);font-weight:600;font-size:12.5px;margin-bottom:4px}' +
      '#kaleidoscope-panel .kld-chg{font-size:12px;line-height:1.65}' +
      '#kaleidoscope-panel .kld-sign{display:inline-block;width:14px;font-weight:700}' +
      '#kaleidoscope-panel .kld-ct{color:var(--k-strong)}' +
      '#kaleidoscope-panel .kld-cd{color:var(--k-dim)}' +
      '#kaleidoscope-panel .kld-more{display:inline-block;margin-top:3px;padding:2px 8px 2px 0;border:0;background:none;color:var(--k-dim);' +
      'font-size:12px;cursor:pointer;border-radius:6px}' +
      '#kaleidoscope-panel .kld-more:hover{color:' + ACCENT + '}' +
      '#kaleidoscope-panel .kld-chg{max-height:260px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--k-sw-off) transparent}' +
      '#kaleidoscope-panel .kld-last .kld-label{font-weight:600;font-size:12.5px}' +
      '#kaleidoscope-panel .kld-last .kld-btn{padding:6px 10px;font-size:12px}' +
      '#kaleidoscope-toggle.busy{color:' + ACCENT + ';animation:kld-pulse 1.4s ease-in-out infinite}' +
      '@keyframes kld-pulse{50%{opacity:.45}}' +
      '#kaleidoscope-job{position:fixed;right:20px;bottom:20px;z-index:2147483646;width:320px;max-width:calc(100vw - 40px);background:var(--k-glass);-webkit-backdrop-filter:blur(28px) saturate(170%);backdrop-filter:blur(28px) saturate(170%);' +
      'border:1px solid rgba(61,180,242,.25);border-radius:14px;box-shadow:0 14px 40px var(--k-drop);padding:12px 14px 14px;color:var(--k-text);' +
      'font:13px/1.45 Overpass,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
      '#kaleidoscope-job *{box-sizing:border-box;font-family:inherit}' +
      '#kaleidoscope-job.ok{border-color:rgba(104,214,57,.35)}' +
      '#kaleidoscope-job.err{border-color:rgba(232,93,117,.45)}' +
      '#kaleidoscope-job .kld-jh{display:flex;align-items:center;justify-content:space-between}' +
      '#kaleidoscope-job .kld-jt{color:var(--k-strong);font-weight:700;font-size:13.5px}' +
      '#kaleidoscope-job .kld-jx{width:24px;height:24px;border:0;border-radius:50%;background:var(--k-line);color:var(--k-muted);cursor:pointer;font-size:14px;line-height:24px;padding:0}' +
      '#kaleidoscope-job .kld-jx:hover{background:var(--k-btn-hi);color:var(--k-title)}' +
      '#kaleidoscope-job .kld-js{color:var(--k-dim);font-size:12px;margin-top:1px}' +
      '#kaleidoscope-job .kld-jtrack{height:6px;background:var(--k-well);border-radius:3px;margin:10px 0 6px;overflow:hidden}' +
      '#kaleidoscope-job .kld-jfill{height:100%;width:0;background:linear-gradient(90deg,#3DB4F2,#9256F3);border-radius:3px;transition:width 1s linear}' +
      '#kaleidoscope-job .kld-jeta{font-size:11.5px;color:var(--k-muted)}' +
      '#kaleidoscope-job .kld-jnote{margin-top:8px;font-size:12px;color:var(--k-warn)}' +
      '#kaleidoscope-job .kld-btns{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:6px;margin-top:10px}' +
      '#kaleidoscope-job .kld-btn{padding:7px 12px;border:0;border-radius:8px;background:var(--k-btn);color:var(--k-strong);cursor:pointer;font-size:12.5px}' +
      '#kaleidoscope-job .kld-btn:hover{background:var(--k-btn-hi)}' +
      '#kaleidoscope-job .kld-btn.primary{background:' + ACCENT + ';color:#0B1622;font-weight:650}' +
      '#kaleidoscope-panel .kld-badge{margin-left:auto;flex:none;font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:6px;color:#fff;white-space:nowrap}'
    );

    const host = document.createElement('kaleidoscope-root');
    host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483647;display:block';
    const root = host.attachShadow({ mode: 'open' });
    const panelStyle = document.createElement('style');
    panelStyle.textContent = PANEL_CSS;
    root.append(panelStyle);
    (document.body || document.documentElement).append(host);

    // Small button for AniList's top bar, next to search and your avatar (like Molten's).
    const navHost = document.createElement('kaleidoscope-nav');
    navHost.style.cssText = 'all:initial;display:inline-flex;align-items:center;vertical-align:middle;margin:0 8px;flex:none';
    const navRoot = navHost.attachShadow({ mode: 'open' });
    const navStyle = document.createElement('style');
    navStyle.textContent =
      'button{width:34px;height:34px;padding:0;border:0;border-radius:50%;background:transparent;color:#9FADBD;cursor:pointer;' +
      'display:inline-flex;align-items:center;justify-content:center;font:18px/1 system-ui,sans-serif;transition:color .15s,background .15s}' +
      'button:hover{color:#EDF1F5;background:rgba(255,255,255,.08)}' +
      'button.open{color:' + ACCENT + ';background:rgba(61,180,242,.14)}' +
      'button.busy{color:' + ACCENT + ';animation:p 1.4s ease-in-out infinite}@keyframes p{50%{opacity:.4}}';
    const navBtn = document.createElement('button');
    navBtn.type = 'button';
    navBtn.textContent = '✦';
    navBtn.title = 'Kaleidoscope';
    navBtn.setAttribute('aria-label', 'Kaleidoscope');
    navRoot.append(navStyle, navBtn);

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
    function labelBlock(label, hint) {
      const l = el('span', 'kld-label', label);
      if (hint) l.append(el('span', 'kld-hint', hint));
      return l;
    }
    // Light or dark glass: cfg.appearance is auto (match the device), light or dark.
    const isDark = () => cfg.appearance === 'dark' || (cfg.appearance !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    function applyLook() {
      for (const n of [panelEl, jobEl]) if (n) n.setAttribute('data-theme', isDark() ? 'dark' : 'light');
      const m = panelEl && panelEl.querySelector('.kld-mode-sw');
      if (m) m.setAttribute('aria-checked', String(isDark()));
      // "Match my device" follows along when the switch up top (or another tab) picks a theme
      if (panelEl) for (const i of panelEl.querySelectorAll('input[data-gw-match]')) i.checked = cfg.appearance === 'auto';
    }
    // the sun/moon switch for the panel header
    function lookSwitch() {
      const NS = 'http://www.w3.org/2000/svg';
      const ico = (cls, paths) => {
        const s = document.createElementNS(NS, 'svg');
        s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
        s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('class', cls);
        for (const d of paths) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.append(p); }
        return s;
      };
      const b = el('button', 'kld-mode-sw');
      b.type = 'button'; b.title = 'Light or dark';
      b.setAttribute('role', 'switch'); b.setAttribute('aria-label', 'Dark mode');
      b.append(el('span', 'kld-knob'),
        ico('kld-sun', ['M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7', 'M12 2.5v2', 'M12 19.5v2', 'M2.5 12h2', 'M19.5 12h2', 'M5.3 5.3l1.4 1.4', 'M17.3 17.3l1.4 1.4', 'M5.3 18.7l1.4-1.4', 'M17.3 6.7l1.4-1.4']),
        ico('kld-moon', ['M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6Z']));
      b.addEventListener('click', () => { cfg.appearance = isDark() ? 'light' : 'dark'; save(); applyLook(); });
      return b;
    }
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyLook()); } catch (e) {}
    function section(parent, title) { parent.append(el('div', 'kld-sec', title)); }
    function toggleRow(parent, label, hint, get, set) {
      const row = el('label', 'kld-row');
      const c = el('input', 'kld-switch');
      c.type = 'checkbox';
      c.checked = !!get();
      c.addEventListener('change', () => set(c.checked));
      row.append(labelBlock(label, hint), c);
      parent.append(row);
      return row;
    }
    function segRow(parent, options, get, set) {
      const seg = el('div', 'kld-seg');
      for (const [val, text, tip, icon] of options) {
        const b = el('button', 'kld-segbtn' + (icon ? ' kld-segicon' : '') + (get() === val ? ' on' : ''), text);
        b.type = 'button';
        if (tip) { b.title = tip; b.setAttribute('aria-label', tip); }
        b.addEventListener('click', () => { if (get() !== val) set(val); });
        seg.append(b);
      }
      parent.append(seg);
      return seg;
    }
    function btn(parent, text, fn, primary) {
      const b = el('button', 'kld-btn' + (primary ? ' primary' : ''), text);
      b.type = 'button';
      b.addEventListener('click', fn);
      parent.append(b);
      return b;
    }

    let panelEl = null;
    let bodyEl = null;
    let subEl = null;
    let statusEl = null;
    let busy = false;
    let moodText = '';
    let sequelResult = null; // { key, items } | { key, err }
    let lastStatus = null;
    const noun = () => (cfg.type === 'ANIME' ? 'anime' : 'manga');

    function say(msg, kind) {
      lastStatus = { msg, kind };
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.className = 'kld-status' + (kind ? ' ' + kind : '');
    }
    function statusLine(parent) {
      statusEl = el('div', 'kld-status');
      parent.append(statusEl);
      if (lastStatus) say(lastStatus.msg, lastStatus.kind);
    }

    const ICON_SRC = 'data:image/webp;base64,UklGRsgLAABXRUJQVlA4WAoAAAAQAAAAXwAAXwAAQUxQSBECAAABh+SokSRHUlQb7X/5o7V3DCIiXVEK8UdQgU4hptrQIVS5LXUukhgkUSuHRVCuwArxnlDQRpJyjP/+HbOBiP5PAOOiLMXSXKK/6JjYAoO2JEmKJMk8qrl7mflpZd/o/z9kj2GYubky/RjjGCQiJoAIRXR7AxY3n9x/eLvbITqIn9r8nK6z1fJyOt+/vGrdLtdtqdUOUEQT83uvHj6ZkOHieO9k/3zZNCEhJKRO6b17+QKsX5tBwGxjd7Or5lsOQOXW/ddUiRwrweWnow4CHAYGE0qIPO1gMmxk7KhWTKAhV5txD3DttjGbIjKORXGp3ebkApOxuZivXQbrvUrOwZ2hJH2+0Tgn4AYlFl9gkpb7arnxUaQFGs1XT6/IW+7NVg/kvLBW83siczXTO2Qu9U+7qWGpyQ2VyK6Tnjq5iT7pK730ld4/wJ3e/75Vev8A9+891+yYZde2OLc6Jfn8yhXKbT27xKkdH52lZg4uj8hcV/tXR7NwWmZ7uz3YILPdC5/vTuWkHBsf9tvl1odpVX9yxCqa0Q2S1r1+sGqiNxrjyEdcv1U6tBE0TQWUjBmOShMUSfJqekdGibgytyVRJeE6H076slEOdnC5ACQscGUtNOpJMujXZsHGxyedCoiKsWultPNZjT4ZTrf33h9FqcZQAddSQqyW8+nJjfGNXr9BP5l+FtdS2/Xpwf7WWU9trQYAAFZQOCCQCQAAUCgAnQEqYABgAD4pEodCoaEKBcaqDAFCUAVyeORhtgHss8s99fg7k5+n0k95F1zPMn5tf/D9Q3+p9LfqOvQA/ar05fZB/v//R9NXBgGz+sb5b8idAz65PoOL3eLfzL/M/kJk1f83bv8dvnj/4/+U/LH2xflf9t/6f+M+AP+W/0//b/cF81XsP/Xf2Xf2C/+wMO3meZ3/SH24l2xkRkAdZQY2Qd0ZRndUajNLCZy0JPNYs4+pO0ttwU8eaX6Fr5ZuhDrAw1oTDgLzuqsTwjNrPaFLVeE1jFqqsretUaNP/ZHziedM7N+d2wsM5TF1my39/NYfYr72PpMS1gZQ3f9PeH59H3618o9hTrTzXEpKL9bN5PaMHiIJdBQr62gAsePKyDw+7b/+01Csuwr7r8jj+d6eG4F4nNtzae1SRK+bDOolgFlD3NvLi/1G4AD+tryXeO7CHww/YvmtH2388TnZEtbpw2yNGm3xk3zAAm8MBJzC0URmnBCc4dY5kDiVWFVWX15qVaqtIFuSbyZenAyvzka59DsDVObf/vq8JQKOvHWwn6WJQRN8WaO/VAwA0/xK9o/vy//2v997ih+Pxp3vtvpVo5k/fdnrE4F/iecMG7sU3/zoWlP1lVmSXPs1huRz7+hu2WtKmypcWMSNtsEr/ZYkCwrSDchJFn20AAVboaztgoUAZX3R7zu1IEgeHvjshwMKkaJNAA40gaIX8gl9Nr5B4v7IXn9HZtHnfXHeoar8w8JFwMlcBUXX+fz+uk0zr1Yl/xs3ex5ObiIvpZT3m09ozEqbtd5I8W57JnNHDEwBQK1bJBjtxQgeQEa7CKrPropBPfNr8WvHfiE4SznIaQ72GxIR5myzVmKVAUjjLGz0lKiybneCNJ2oO4FZm+oiaifNtbGOM9auPkMWlZ+dstAlT6WFXIpetsNphnCWbLAvxTVLuYLn/2D+sBwbyrlmpPq5p8Cf8gENNG58ITvXoCUrhQcUXhkvrCCIFIUZmcSTmR03eN/np+yau+G2xJNNmuMq6un9IrFvq9amA3bmP5/2YKgsWnTh9zLJrdiDrQDj9KMISv1+3w/5PCmtW01Q1jR6YZLkptVUg1cCFWOWCoE0knizZyB2dWor/1BV/FfhEmcsEUdHkpns8ncxT7lHuLGE68iuf9r4OtnLKrVXTioJ18NkYuq5a8pocJpwRk7njbv1JzzFuNxGeihq7C2VIjt9G0qTIs9CrrmtFcOIo7IvnM5sTE4d2I1TDf4PaXaZ4HlbLVMgZs7AN3P4N1mxu5n8Osq7zGW4xXvmDPuOkrk2RvSxPAsZzF4YNxRvd/8wPyPzn9fWFEc909K1bjipoCbDWXDOyJ1NpSn7TMgK+qHa67+eIxIbnlLP6u7ixtxDZX80BrCOLv5u/jQuqwtRzpasdj9VsD//bn2clzEFcSCHg2B/ZvkrR3kEIw+E+FNw+Snt3odTuv/UifwJtY5/ICBHI9Ner35pJcOs8MbIvK07nu3iiRHZG+fG4j8fN97aKmuYVbLQRU0eYB9UyDf7pdl11oPCCpFBksFkB+Fgy3RO7zQl32oMGuMSB4eqW4rycvGYcNYexUKqz7ivGFoibDPq5S49fmGBsNUN0T1vGGxYLpCE/3PpnvPwY4RAzfwauuBh0//v/Nvu24TtdgYrTPrVk/nU8YLqVGzLa9zMcHzFuPwhHMrjYaa3v4S8qRFuHwOvv/qkYW5kc5dNHgL1Xl5g5XPNsTkK/sP283uaVjmuL8Ke4LFFjrNE5dsQx29AyuwGO0MFPsk2DNW3J07x3ht0DnN4Pm25tLsp824VjP2EILveakSzF9ACRUkRN/TNGgnXg+PQDeD0rUR8TRGdegfAZBIVWk1ZJBwIyV19yHw/vZKGRGDrzD/rTK5TFUwJtAfsvj9nNJ3x4SM+vYvzBHHAitrPqgp2YeaAvzqmfmVuLE+jNfTWZJ+mtWXWf6866sdmpkr4+S7dTse0IHG3szEevqP1bqTry0D9Sx6yt3wM9zY+5OSYuV54pJ1ldhtDyi2mR332yAqrg5x+xfo8b5HF7HXnLHzZQ+apaev8JY6sj0dKB6dD/psFX17EB/kx4mXoKQbhQTDxlDRqCLSuG+Ex80G2OkY9oHtSm7mQU2Ks4X7O+x38Dk9WonZs6z4wTBjQCIGOT80w0/ml9oVglT0Mnf4+2RDW1sdJqkvdfKuCzmqRXs/0vxcd3nYjrsqtshhUJHZgLnRks6GmJVGNhK/xzkGDZCv0WNe66VR2diBB0A4IrkcPcPQ9zm5LtRm+QwxL7UoHeWNlyiErEUtVt5Z8jtyk83ABIJr6tkEQoKzGfz5Q/tBesQ1l8B0uD8vXkujDBh2gY2SxksZhqzPOlTAfvn6WUyTsAWki+YmeTNQScKkOfNryzlO6rhxib9562r3b7N97VUJ83qQYLHx+VUMMu5HpR7wUJixN/QK7yjNXbZHLOr8VpHcDlYDK/Kfe1jo2/2Y/ZAqUTwjcjF2pjBv3NTFjJj0Qpywjnw9hIzmgUDOmg3LXHAiPcQ8LnF0rzP8JubmAeEA7OUfPyxjk3uJna1iSawREOCr/8dtOXDFEC5jHt/ZYvYLGQAUCe3ez8L9GhLnfuS05I8zBgHo/zPyZGDw2jRZ/jf/8njnpvD0tVWEBjgyLnbBh1jYyGQr5/Iel8IM6cXxjwx+qcpMf/g83/wpOhc9w3lrVNBfbHZdcLouh32bwTEX+wOr2GdF6pXsRZzdE3tfjmQ4fIbsi4jXRiS1gYX0aEXbpOkCmcyytAPcbICWZvwPJemFJf2+P3La67tWmDueMb/rWV2Q+TNpzkHQFMfo+4D/lChHlxCX7jXH8LZNYUgQM+zIXhoo+BXIOr5L7sR2w3TX05mUwm0taZ46+/0de4EJxdwjpSe53aenryL15VbF3YxLLaeF5uveRrofXd5qHwMYxJvgGovI4xgXf4XuxiYf9fQ5Ej/L8QYfheUnZLB19VQm/ze6sznLHAtrrNX2nb/gQSETPeTjEChMJe6HywkaG75Et5f3LXZg6eJdBW4xgmlN/C1WvP9wcqh4aFeB9+//EnH9EFUn58EP5K/LfGYXo8ICYLz5gaufaze0mPNEnGmlLWov230r6dGPqVRaiWw3siuV8XYvsylRSRZRkfb7txdryM6tkZzLjGnplkKKTOuo5QsEb7vM+z4vOfc6h80i5QAgfSv8W1Fjl7BoD920yUcYUUT+OpnuL9+enI+zoPmMc6VPDRcGBZo5AsZnvKkWUAAAA'; // app icon (assets/icons), embedded by tools/panel_icons.py
    const VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '';
    function iconTile() {
      const tile = el('div', 'kld-icon');
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      { const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', 'M12 3.4 19.5 7.7v8.6L12 20.6 4.5 16.3V7.7Z'); p.setAttribute('fill', '#fff'); p.setAttribute('fill-opacity', '.28');
        p.setAttribute('stroke', '#fff'); p.setAttribute('stroke-width', '1.6'); p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('stroke-linecap', 'round');
        svg.append(p); }
      { const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', 'M12 3.4V20.6M4.5 7.7l15 8.6M19.5 7.7l-15 8.6'); p.setAttribute('fill', 'none'); p.setAttribute('fill-opacity', '0');
        p.setAttribute('stroke', '#fff'); p.setAttribute('stroke-width', '1.1'); p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('stroke-linecap', 'round');
        svg.append(p); }
      tile.append(svg);
      const img = el('img', 'kld-icon-img');
      img.alt = '';
      img.addEventListener('error', () => img.remove());
      img.src = ICON_SRC;
      tile.append(img);
      return tile;
    }

    function updateSub() {
      if (!subEl) return;
      const user = getUsername();
      subEl.textContent = '';
      if (!user) { subEl.append('Open a profile or log in to load a list'); return; }
      subEl.append('List: ', el('b', null, user));
      const c = cache.lists.get(user.toLowerCase() + ':' + cfg.type);
      if (c && c.data) subEl.append(' · ' + c.data.length + ' ' + noun());
      else if (c && !c.err) subEl.append(' · loading…');
      const r = el('button', 'kld-reload' + (reloading ? ' spin' : ''), '↻');
      r.type = 'button';
      r.title = 'Reload your list from AniList';
      r.addEventListener('click', forceReload);
      subEl.append(r);
    }

    // Fetch the list (and airing lineup) fresh, without reloading the page.
    let reloading = false;
    function forceReload() {
      if (reloading) return;
      const user = getUsername();
      if (!user) return;
      cache.lists.clear();
      cache.airing = null;
      sequelResult = null;
      reloading = true;
      const p = getList(user, cfg.type).p;
      if (cfg.type === 'ANIME') getAiring().p.catch(() => { /* reported if you pick that mode */ });
      updateSub();
      p.then(d => { reloading = false; lastStatus = { msg: 'Reloaded: ' + d.length + ' ' + noun() + '.' }; render(); },
        e => { reloading = false; lastStatus = { msg: e.message || 'Couldn\'t reload.', kind: 'err' }; render(); });
    }

    // Start loading as soon as the panel opens, so a click can open Claude right away.
    function preload() {
      const user = getUsername();
      updateSub();
      if (!user) return;
      const c = getList(user, cfg.type);
      if (!c.data) c.p.then(updateSub, e => { updateSub(); say(e.message, 'err'); });
      else if (Date.now() - c.ts > 60 * 1000) {
        // show the cached list right away, then quietly refresh it so "Changes since this board" is current
        getList(user, cfg.type, true).p.then(() => { if (panelEl) render(); }, () => { /* keep the cached one */ });
      }
      if (cfg.type === 'ANIME') getAiring().p.catch(() => { /* reported if you pick that mode */ });
    }

    let chatCheck = null; // { id, p, state }
    function checkLastBoardChat() {
      const b = GM_getValue(BOARDS_KEY, []).slice(-1)[0];
      if (!b) { chatCheck = null; return null; }
      const c = { id: b.id, state: null };
      c.p = chatState(b).then(st => { c.state = st; console.log('[Kaleidoscope] last board\'s chat: ' + st); return st; });
      chatCheck = c;
      return c;
    }

    // The board's chat was deleted: remember it and say so with a plain OK.
    function boardGone(board) {
      markBoardGone(board.id);
      if (!panelEl) open();
      render();
      const ov = el('div', 'kld-modal');
      const card = el('div', 'kld-mcard');
      card.append(el('div', 'kld-mt', GONE_TITLE), el('div', 'kld-mp', GONE_TEXT));
      const row = el('div', 'kld-btns');
      row.style.justifyContent = 'flex-end';
      btn(row, 'OK', () => ov.remove(), true);
      card.append(row);
      ov.append(card);
      ov.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); ov.remove(); } });
      ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
      panelEl.append(ov);
      ov.tabIndex = -1;
      ov.focus();
    }
    async function followUp(board) {
      const c = chatCheck && chatCheck.id === board.id ? chatCheck : checkLastBoardChat();
      if (c.state) {
        if (c.state === 'gone') return boardGone(board);
        return window.open(board.conv, '_blank'); // answer was ready: open right away
      }
      // answer not ready yet: wait a moment for it before opening anything
      say('Checking the board\'s chat…', 'wait');
      const st = await Promise.race([c.p, sleep(3000).then(() => 'unknown')]);
      say('');
      if (st === 'gone') return boardGone(board);
      // opened through Tampermonkey, since the browser blocks normal pop-ups after a wait
      GM_openInTab(board.conv, { active: true });
    }

    // Small confirm dialog inside the menu.
    function confirmNewBoard(board, onProceed) {
      if (!panelEl) return;
      console.log('[Kaleidoscope] asking before a new board (last board: ' + board.label + ')');
      const old = panelEl.querySelector('.kld-modal');
      if (old) old.remove();
      const ov = el('div', 'kld-modal');
      const card = el('div', 'kld-mcard');
      card.append(el('div', 'kld-mt', 'You already have a board'));
      const p = el('div', 'kld-mp', 'It looks like you already have a board made (');
      p.append(el('b', null, board.label + ' · ' + ago(board.ts)), '). Would you like to update it instead?');
      card.append(p, el('div', 'kld-mh', 'To update it, cancel and use Update board under Last board.'));
      const row = el('div', 'kld-btns');
      row.style.justifyContent = 'flex-end';
      const cancel = () => {
        ov.remove();
        const lb = panelEl && panelEl.querySelector('.kld-lastcard');
        if (lb) lb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
      btn(row, 'Cancel', cancel);
      btn(row, 'Proceed anyway', () => { ov.remove(); onProceed(); }, true);
      card.append(row);
      ov.append(card);
      ov.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); } });
      ov.addEventListener('mousedown', e => { if (e.target === ov) cancel(); });
      panelEl.append(ov);
      ov.tabIndex = -1;
      ov.focus();
    }

    // ---------------- Board updates ----------------
    const SNAP_STATUS = { CURRENT: 'W', COMPLETED: 'C', REPEATING: 'R', PAUSED: 'P', DROPPED: 'D', PLANNING: 'L' };
    // A small copy of the list as it was when a board was made, to see what changed since.
    function makeSnap(list) {
      const e = {};
      for (const x of list) e[x.id] = [SNAP_STATUS[x.status] || x.status, x.score || 0, x.progress || 0, x.title];
      return { at: Date.now(), e };
    }
    function boardPicks(html) {
      const m = (html || '').match(/<script[^>]*id=["'][\w-]*picks["'][^>]*>([\s\S]*?)<\/script>/i);
      if (!m) return [];
      try { const j = JSON.parse(m[1]); return Array.isArray(j) ? j : []; } catch (e) { return []; }
    }
    const normT = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

    function computeChanges(board, list) {
      const A = board.type !== 'MANGA';
      const unit = A ? 'eps' : 'ch';
      const W = { W: A ? 'watching' : 'reading', C: 'completed', R: A ? 'rewatching' : 'rereading', P: 'paused', D: 'dropped', L: 'planning' };
      const picks = boardPicks(board.html);
      const isPick = (id, title) => picks.some(p => (p.id && +p.id === +id) || (p.title && normT(p.title) === normT(title)));
      const old = board.snap.e;
      const now = {};
      for (const x of list) now[x.id] = x;
      const out = [];
      for (const x of list) {
        const st = SNAP_STATUS[x.status] || x.status;
        const prog = x.progress + '/' + (x.total || '?') + ' ' + unit;
        const sc = x.score ? ', scored ' + +x.score.toFixed(1) : '';
        const o = old[x.id];
        let sign = null;
        let detail = '';
        if (!o) { sign = '+'; detail = 'added as ' + W[st] + ', ' + prog + sc; }
        else {
          // status, progress and score are each checked, so nothing gets left out when several change at once
          const parts = [];
          const stChanged = o[0] !== st;
          const progChanged = (o[2] || 0) !== (x.progress || 0);
          const scoreChanged = (o[1] || 0) !== (x.score || 0);
          if (stChanged) parts.push(W[o[0]] + ' → ' + W[st]);
          if (progChanged) parts.push((o[2] || 0) + ' → ' + prog);
          else if (stChanged) parts.push(prog);
          if (scoreChanged) parts.push('score ' + (o[1] ? +(+o[1]).toFixed(1) : 'none') + ' → ' + (x.score ? +x.score.toFixed(1) : 'none'));
          if (parts.length) { sign = stChanged && st === 'D' ? '−' : '↑'; detail = parts.join(', '); }
        }
        if (sign) out.push({ sign, title: x.title, id: x.id, detail, pick: isPick(x.id, x.title) });
      }
      for (const id of Object.keys(old)) {
        if (!now[id]) out.push({ sign: '−', title: old[id][3], id: +id, detail: 'removed from my list', pick: isPick(id, old[id][3]) });
      }
      const rank = c => (c.pick ? 0 : 1);
      return out.sort((a, b) => rank(a) - rank(b));
    }

    let updateNote = '';
    let changesOpen = false; // "+ N more changes" expanded?
    function buildUpdate(board) {
      const box = el('div', 'kld-upd');
      const user = board.user || getUsername();
      const type = board.type || 'ANIME';
      if (!user) { box.append(el('span', 'kld-hint', 'Open a profile or log in to check for changes.')); return box; }
      const lc = getList(user, type);
      if (!lc.data) {
        box.append(el('span', 'kld-hint', 'Checking your list for changes…'));
        lc.p.then(() => { if (panelEl && cfg.tab === 'rec') render(); }, () => { /* error shown elsewhere */ });
        return box;
      }
      const list = lc.data;
      const changes = board.snap ? computeChanges(board, list) : null;
      if (changes && !changes.length) {
        box.append(el('span', 'kld-hint', 'No changes since this board. Add feedback to update it anyway.'));
      } else if (changes) {
        box.append(el('div', 'kld-updt', 'Changes since this board'));
        const ul = el('div', 'kld-chg');
        const COLORS = { '+': '#68D639', '−': '#E85D75', '↑': ACCENT };
        const shown = changesOpen ? changes : changes.slice(0, 5);
        for (const c of shown) {
          const line = el('div');
          const sign = el('span', 'kld-sign', c.sign);
          sign.style.color = COLORS[c.sign];
          line.append(sign, el('span', 'kld-ct', c.title), el('span', 'kld-cd', ' · ' + (c.pick ? 'one of its picks · ' : '') + c.detail));
          ul.append(line);
        }
        if (changes.length > 5) {
          // collapsed by default; click to show every change, click again to collapse
          const more = changes.length - 5;
          const t = el('button', 'kld-more', changesOpen ? 'Show less ▴' : '+ ' + more + ' more change' + (more === 1 ? '' : 's') + ' ▾');
          t.type = 'button';
          t.setAttribute('aria-expanded', String(changesOpen));
          t.addEventListener('click', () => { changesOpen = !changesOpen; render(); });
          ul.append(t);
        }
        box.append(ul);
      } else {
        box.append(el('span', 'kld-hint', 'This board was made before Kaleidoscope tracked changes, so an update sends your whole current list.'));
      }
      const ta = el('textarea', 'kld-text');
      ta.placeholder = 'Optional: "loved Caiman, more like him"';
      ta.value = updateNote;
      ta.style.minHeight = '54px';
      ta.addEventListener('input', () => { updateNote = ta.value; });
      box.append(ta);
      const row = el('div', 'kld-btns');
      row.style.justifyContent = 'flex-end';
      row.style.marginTop = '8px';
      btn(row, 'Update board', () => runUpdate(board, list, changes), true);
      box.append(row);
      return box;
    }

    function buildUpdatePrompt(board, list, changes, note, A) {
      const unit = A ? 'eps' : 'ch';
      const parts = ['UPDATE THE BOARD YOU MADE ABOVE (don\'t rebuild it)'];
      if (changes) {
        parts.push(changes.length
          ? 'Since you made it, here\'s what changed on my AniList. Everything not listed is the same as before.\n<changes>\n' +
            changes.map(c => c.sign + ' ' + c.title + ' (id ' + c.id + '): ' + c.detail + (c.pick ? ' (one of your picks)' : '')).join('\n') + '\n</changes>'
          : 'Nothing changed on my list since you made it.');
      } else {
        parts.push('Here\'s my list as it is now. Compare it with the list I sent before and ignore everything that\'s the same.\n<my_list_now>\n' +
          list.map(e => [e.id, e.title, STATUS_CODE[e.status] || e.status, e.score ? +e.score.toFixed(1) : '-',
            e.progress + '/' + (e.total || '?') + ' ' + unit, e.format, e.genres.join(', ')].join(' | ')).join('\n') + '\n</my_list_now>');
      }
      parts.push('<my_stats> (updated, computed exactly from my list now)\n' + statsText(list, A) + '\n</my_stats>');
      if (note) parts.push('My feedback on the board: ' + note);
      parts.push(
        'Update the board for this: replace picks I\'ve since added, watched, dropped or said I didn\'t like (new picks follow the same rules and card layout as before), ' +
        're-check predicted ratings, and update any stat tiles, charts, takeaways and the header date these changes affect. ' +
        'If the header wordmark or the page <title> says anything other than "Kaleidoscope", change it to "Kaleidoscope" (Kaleido in white, scope in #3DB4F2). ' +
        'Leave everything else exactly as it is, including the design.\n\n' +
        'Reply ONLY with an edit list for the HTML page you made, as one ```json code block and nothing else:\n' +
        '{"edits":[{"find":"exact text from the current page","replace":"new text"}]}\n' +
        '- Each "find" is copied exactly from the current page (spaces and punctuation included) and is long enough to appear only once.\n' +
        '- Edits are applied in order, so a later "find" must match the page after the earlier edits.\n' +
        '- Keep the hidden picks list in sync with the picks, as <script type="application/json" id="kaleidoscope-picks">.\n' +
        '- Don\'t rewrite or re-create the artifact.'
      );
      return parts.join('\n\n');
    }

    async function runUpdate(board, list, changes) {
      if (job) return say('A board is already being built. Wait for it, or dismiss it first.', 'err');
      let st = chatCheck && chatCheck.id === board.id ? chatCheck.state : null;
      if (!st) {
        say('Checking the board\'s chat…', 'wait');
        const c = chatCheck && chatCheck.id === board.id ? chatCheck : checkLastBoardChat();
        st = await Promise.race([c.p, sleep(3000).then(() => 'unknown')]);
        say('');
      }
      if (st === 'gone') return boardGone(board);
      // always compare against your list as it is right now, not a cached copy
      say('Getting your latest list…', 'wait');
      try { list = await getList(board.user || getUsername(), board.type || 'ANIME', true).p; } catch (e) {
        return say(e.message || 'Couldn\'t load your list.', 'err');
      }
      say('');
      changes = board.snap ? computeChanges(board, list) : null;
      const note = updateNote.trim();
      if (changes && !changes.length && !note) {
        if (panelEl) render();
        return say('Nothing changed yet. Add feedback to update it anyway.', 'err');
      }
      const type = board.type || 'ANIME';
      const A = type !== 'MANGA';
      const user = board.user || getUsername();
      const mode = board.mode || 'recent';
      let text;
      try {
        text = buildUpdatePrompt(board, list, changes, note, A);
      } catch (e) {
        console.error('[Kaleidoscope]', e);
        return say('Couldn\'t build the update. Check the console (F12).', 'err');
      }
      GM_setClipboard(text, 'text');
      const id = Date.now().toString(36);
      const convId = ((board.conv || '').match(/\/chat\/([0-9a-f-]{36})/) || [])[1] || '';
      const tab = newTabId();
      GM_setValue(HANDOFF_KEY, {
        tab, text, ts: Date.now(), started: Date.now(), autoSend: true, capture: true, update: true, convId,
        baseHtml: board.html, job: id, mode, label: board.label, user, type, snap: makeSnap(list), timeKey: mode + ':update',
      });
      try {
        claudeTab = GM_openInTab(tagged(convId ? 'https://claude.ai/chat/' + convId : 'https://claude.ai/new', tab), { active: false, insert: true, setParent: true });
      } catch (e) { claudeTab = null; }
      if (!claudeTab) { GM_deleteValue(HANDOFF_KEY); return say('Claude couldn\'t be opened, so nothing was sent. Try again.', 'err'); }
      job = { id, mode, label: board.label, start: Date.now(), est: estimate(mode + ':update'), update: true };
      GM_setValue(JOB_KEY, job);
      updateNote = '';
      close();
      showJob();
    }

    // ---------------- Recommend tab ----------------
    function buildRec(body) {
      section(body, 'List');
      segRow(body, [['ANIME', 'Anime'], ['MANGA', 'Manga']], () => cfg.type, v => {
        cfg.type = v; save(); lastStatus = null; render(); preload();
      });

      section(body, 'Mood');
      const mood = el('input', 'kld-text');
      mood.type = 'text';
      mood.placeholder = 'Optional: "short", "no isekai", "dark and gritty"';
      mood.value = moodText;
      mood.addEventListener('input', () => { moodText = mood.value; });
      body.append(mood);

      section(body, 'Get recommendations');
      const wrap = el('div', 'kld-modes');
      for (const m of MODES) {
        const disabled = m.animeOnly && cfg.type !== 'ANIME';
        const b = el('button', 'kld-mode');
        b.type = 'button';
        b.style.setProperty('--c', m.color);
        b.append(el('span', 'kld-dot'), labelBlock(m.title, disabled ? 'Anime only' : m.hint), el('span', 'kld-go', disabled ? '' : '➜'));
        if (disabled) b.disabled = true;
        b.addEventListener('click', () => runMode(m, b));
        wrap.append(b);
      }
      body.append(wrap);

      section(body, 'Send to');
      segRow(body, [['claude', 'Claude'], ['clipboard', 'Clipboard only'], ['file', '⤓', 'Save the prompt as a .txt file', true]],
        () => cfg.dest, v => { cfg.dest = v; save(); render(); });
      statusLine(body);

      const boards = GM_getValue(BOARDS_KEY, []);
      const lastB = boards[boards.length - 1];
      if (lastB) {
        section(body, 'Last board');
        const card = el('div', 'kld-lastcard');
        const row = el('div', 'kld-last');
        row.append(labelBlock(lastB.label + (lastB.updated ? ' · updated' : ''), ago(lastB.ts) + (lastB.chatGone ? ' · chat deleted' : '')));
        const b = el('div', 'kld-btns');
        b.style.margin = '0';
        btn(b, 'Open', () => window.open(BOARD_URL(lastB.id), '_blank'), true);
        if (lastB.conv && !lastB.chatGone) btn(b, 'Follow-up', () => followUp(lastB));
        btn(b, 'Save', () => saveBoardFile(lastB)).title = 'Download this board as an HTML file to keep';
        row.append(b);
        card.append(row);
        if (lastB.chatGone) {
          const gone = el('div', 'kld-upd');
          gone.append(el('span', 'kld-hint', 'This board\'s chat was deleted, so it can\'t be updated. Make a new board for fresh picks.'));
          card.append(gone);
        } else card.append(buildUpdate(lastB));
        body.append(card);
      }
    }

    async function runMode(mode, button, confirmed) {
      if (busy) return;
      const user = getUsername();
      if (!user) return say('Couldn\'t find a username. Open a profile or log in first.', 'err');
      const type = cfg.type;

      // Already have a board of this type whose chat still exists? Offer to update it instead.
      if (!confirmed && cfg.dest === 'claude') {
        const last = GM_getValue(BOARDS_KEY, []).slice(-1)[0];
        if (last && !last.chatGone && (last.type || 'ANIME') === type) {
          let c = chatCheck && chatCheck.id === last.id ? chatCheck : checkLastBoardChat();
          let st = c.state;
          if (!st) {
            say('Checking your last board…', 'wait');
            st = await Promise.race([c.p, sleep(3000).then(() => 'unknown')]);
            say('');
          }
          if (st === 'gone') markBoardGone(last.id);
          else return confirmNewBoard(last, () => runMode(mode, button, true));
        }
      }

      // Fast path: everything already loaded, so we're still inside the click and can open a tab.
      const lc = getList(user, type);
      const ac = mode.id === 'airing' ? getAiring() : null;
      let list = lc.data;
      let airing = ac ? ac.data : null;

      if (!list || (ac && !airing)) {
        busy = true;
        button.classList.add('busy');
        say('Loading ' + user + '\'s list…', 'wait');
        try {
          list = await lc.p;
          if (ac) { say('Loading what\'s airing…', 'wait'); airing = await ac.p; }
        } catch (e) {
          console.error('[Kaleidoscope]', e);
          return say(e.message || 'Something went wrong. Check the console (F12).', 'err');
        } finally {
          busy = false;
          button.classList.remove('busy');
        }
        updateSub();
      }

      let text;
      try { text = buildPrompt(mode.id, user, type, list, airing); } catch (e) {
        console.error('[Kaleidoscope]', e);
        return say('Couldn\'t build the prompt. Check the console (F12).', 'err');
      }
      GM_setClipboard(text, 'text');

      if (cfg.dest === 'clipboard') return say('Copied: ' + mode.title + ' prompt with ' + list.length + ' ' + noun() + '.');
      if (cfg.dest === 'file') {
        const d = new Date();
        const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const name = ('Kaleidoscope prompt - ' + mode.title + (type === 'MANGA' ? ' (manga)' : '') + ' - ' + day + '.txt').replace(/[\\/:*?"<>|]/g, '');
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.append(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
        return say('Saved ' + name + ' (also copied to your clipboard).');
      }

      if (cfg.claudeMode === 'board') {
        if (job) return say('A board is already being built. Wait for it, or dismiss it first.', 'err');
        const id = Date.now().toString(36), tab = newTabId();
        GM_setValue(HANDOFF_KEY, {
          tab, text, ts: Date.now(), started: Date.now(), autoSend: true, capture: true, job: id, mode: mode.id, label: mode.title,
          user, type, snap: makeSnap(list), timeKey: mode.id,
        });
        try { claudeTab = GM_openInTab(tagged('https://claude.ai/new', tab), { active: false, insert: true, setParent: true }); } catch (e) { claudeTab = null; }
        if (!claudeTab) { GM_deleteValue(HANDOFF_KEY); return say('Claude couldn\'t be opened. The prompt is on your clipboard, so paste it into a new chat.', 'err'); }
        job = { id, mode: mode.id, label: mode.title, start: Date.now(), est: estimate(mode.id) };
        GM_setValue(JOB_KEY, job);
        close();
        showJob();
        return;
      }

      const tab = newTabId();
      GM_setValue(HANDOFF_KEY, { tab, text, ts: Date.now(), autoSend: cfg.claudeMode === 'send', label: mode.title });
      let w = null;
      try { w = window.open(tagged('https://claude.ai/new', tab), '_blank'); } catch (e) { /* blocked */ }
      if (!w) {
        try { w = !!GM_openInTab(tagged('https://claude.ai/new', tab), { active: true }); } catch (e) { /* ignore */ }
      }
      if (!w) GM_deleteValue(HANDOFF_KEY); // nothing opened: no other claude.ai tab may take it
      say(w
        ? 'Opened Claude with your ' + mode.title.toLowerCase() + ' prompt. It\'s on your clipboard too.'
        : 'Claude was blocked from opening. The prompt is on your clipboard, so paste it into a new chat.', w ? '' : 'err');
    }

    // ---------------- Background board jobs ----------------
    const JOB_KEY = 'kaleidoscope.job';
    let job = GM_getValue(JOB_KEY, null);
    if (job && Date.now() - job.start > 20 * 60 * 1000) { job = null; GM_deleteValue(JOB_KEY); }
    let claudeTab = null;
    let jobEl = null;
    let jobTimer = null;

    // Learns from your own runs: average of the last few boards for this mode (or any mode), else ~3 min.
    // Updates are timed separately from new boards (key "mode:update").
    function estimate(key) {
      const t = GM_getValue(TIMES_KEY, {});
      const isUpd = /:update$/.test(key);
      const own = t[key] || [];
      const pool = own.length ? own : [].concat(...Object.keys(t).filter(k => /:update$/.test(k) === isUpd).map(k => t[k]));
      return pool.length ? pool.reduce((a, b) => a + b, 0) / pool.length : (isUpd ? 75000 : 180000);
    }
    const fmtT = ms => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const ago = ts => {
      const m = Math.round((Date.now() - ts) / 60000);
      return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago';
    };

    function jobShell() {
      if (jobEl) return jobEl;
      jobEl = el('div');
      jobEl.id = 'kaleidoscope-job';
      root.append(jobEl);
      applyLook();
      return jobEl;
    }
    function hideJob() {
      clearInterval(jobTimer);
      if (jobEl) jobEl.remove();
      jobEl = null;
    }
    function setBusy(on) {
      navBtn.classList.toggle('busy', on);
      toggleBtn.classList.toggle('busy', on);
    }

    function showJob() {
      if (!job) return;
      const box = jobShell();
      box.textContent = '';
      box.className = '';
      const head = el('div', 'kld-jh');
      const t = el('div', 'kld-jt', job.update ? 'Updating your board' : 'Building your board');
      const x = el('button', 'kld-jx', '×');
      x.type = 'button';
      x.title = 'Dismiss (Claude keeps going in its tab)';
      x.addEventListener('click', () => { job = null; GM_deleteValue(JOB_KEY); setBusy(false); hideJob(); });
      head.append(t, x);
      const sub = el('div', 'kld-js', job.label + (job.update ? ' · update' : ''));
      const track = el('div', 'kld-jtrack');
      const fill = el('div', 'kld-jfill');
      track.append(fill);
      const eta = el('div', 'kld-jeta');
      box.append(head, sub, track, eta);
      if (job.signin) {
        const note = el('div', 'kld-jnote', 'You\'re signed out of Claude. Sign in and Kaleidoscope picks up from there.');
        const b = el('div', 'kld-btns');
        btn(b, 'Sign in', () => window.open('https://claude.ai/login', '_blank'), true);
        box.append(note, b);
      }
      setBusy(true);
      const tick = () => {
        if (!job) return;
        const spent = Date.now() - job.start;
        fill.style.width = Math.min(95, (spent / job.est) * 100).toFixed(1) + '%';
        eta.textContent = spent < job.est
          ? '~' + fmtT(job.est - spent) + ' left · ' + fmtT(spent) + ' so far'
          : spent < job.est * 1.6 ? 'Almost done… · ' + fmtT(spent) + ' so far' : 'Taking longer than usual… · ' + fmtT(spent);
        if (spent > Math.max(job.est * 4, 15 * 60 * 1000)) {
          finishJob({ ok: false, error: 'Lost track of it. Check your recent chats in Claude.', conv: 'https://claude.ai/recents' });
        }
      };
      tick();
      clearInterval(jobTimer);
      jobTimer = setInterval(tick, 1000);
    }

    function finishJob(res) {
      const done = job;
      job = null;
      GM_deleteValue(JOB_KEY);
      setBusy(false);
      clearInterval(jobTimer);
      console.log('[Kaleidoscope] result for ' + (done && done.id) + ': ok=' + res.ok + ', close Claude tab=' + (res.closeTab !== false) +
        ', have its handle=' + !!(claudeTab && claudeTab.close));
      if (res.chatGone) {
        if (claudeTab) { try { claudeTab.close(); } catch (e) { /* already closed */ } }
        claudeTab = null;
        const gb = GM_getValue(BOARDS_KEY, []).slice(-1)[0];
        if (gb) markBoardGone(gb.id);
        const box = jobShell();
        box.textContent = '';
        box.className = 'err';
        box.append(el('div', 'kld-jt', GONE_TITLE), el('div', 'kld-js', 'Its Claude chat is gone, so nothing was sent. You can still open and save the board, or make a new one.'));
        const row = el('div', 'kld-btns');
        btn(row, 'OK', hideJob, true);
        box.append(row);
        if (panelEl) render();
        return;
      }
      if (claudeTab && res.ok && res.closeTab !== false) {
        try { claudeTab.close(); } catch (e) { console.log('[Kaleidoscope] closing the Claude tab failed: ' + (e && e.message)); }
      }
      claudeTab = null;
      const box = jobShell();
      box.textContent = '';
      box.className = res.ok ? 'ok' : 'err';
      const head = el('div', 'kld-jh');
      const x = el('button', 'kld-jx', '×');
      x.type = 'button';
      x.addEventListener('click', hideJob);
      head.append(el('div', 'kld-jt', res.ok ? (res.updated ? 'Your board is updated' : 'Your board is ready')
        : res.limit ? 'Claude usage limit reached' : 'Board didn\'t come back'), x);
      box.append(head, el('div', 'kld-js', res.ok
        ? (res.fellBack ? 'The old chat was gone, so this is a new board · ' : (done ? done.label + ' · ' : '')) +
          'took ' + fmtT(res.ms || 0) + ', opened in a new tab'
        : res.error || 'Something went wrong.'));
      const btns = el('div', 'kld-btns');
      if (res.ok && done) btn(btns, 'Open board', () => window.open(BOARD_URL(done.id), '_blank'), true);
      if (res.conv) btn(btns, res.ok ? 'Ask a follow-up' : res.limit ? 'Open Claude' : 'Open the chat', () => window.open(res.conv, '_blank'), !res.ok);
      box.append(btns);
      if (res.ok) jobTimer = setTimeout(hideJob, 20000);
      if (panelEl) render();
    }

    if (typeof GM_addValueChangeListener === 'function') {
      GM_addValueChangeListener(RESULT_KEY, (name, oldV, v) => {
        if (!v || !job || v.job !== job.id) return;
        if (v.signin) { job.signin = true; GM_setValue(JOB_KEY, job); return showJob(); }
        finishJob(v);
      });
    }

    // ---------------- Sequels tab ----------------
    function buildSequels(body) {
      const user = getUsername();
      const key = (user || '').toLowerCase() + ':' + cfg.type;
      body.append(el('div', 'kld-info',
        'Finds sequels to ' + noun() + ' you\'ve completed that you haven\'t started yet. Uses AniList data directly, no AI.'));

      const btns = el('div', 'kld-btns');
      const go = btn(btns, sequelResult && sequelResult.key === key ? 'Check again' : 'Find missing sequels', async () => {
        if (!user) return say('Couldn\'t find a username. Open a profile or log in first.', 'err');
        go.disabled = true;
        say('Checking ' + user + '\'s completed ' + noun() + '…', 'wait');
        try {
          const list = await getList(user, cfg.type, sequelResult && sequelResult.key === key).p;
          const items = await findSequels(list, cfg.type);
          sequelResult = { key, items };
          const onPlan = items.filter(x => x.planned).length;
          say(items.length ? 'Found ' + items.length + ' missing sequel' + (items.length === 1 ? '' : 's') +
            (onPlan ? ' (' + onPlan + ' already planned).' : '.') : 'You\'re all caught up.');
        } catch (e) {
          console.error('[Kaleidoscope]', e);
          sequelResult = null;
          say(e.message || 'Something went wrong. Check the console (F12).', 'err');
        }
        render();
      }, true);

      const all = sequelResult && sequelResult.key === key ? sequelResult.items : null;
      // optionally hide sequels already on your Planning list (you know about those)
      const res = all && cfg.hidePlanned ? all.filter(x => !x.planned) : all;
      const hidden = all ? all.length - res.length : 0;
      if (res && res.length) {
        btn(btns, 'Copy list', () => {
          GM_setClipboard(res.map(s => s.title + ' (after ' + s.after + ') - https://anilist.co/' + noun() + '/' + s.id).join('\n'), 'text');
          say('Copied ' + res.length + ' titles.');
        });
      }
      body.append(btns);
      toggleRow(body, 'Hide planned sequels', 'Only show sequels that aren\'t on your list yet', () => cfg.hidePlanned, v => {
        cfg.hidePlanned = v; save(); render();
      });
      statusLine(body);

      if (!res) return;
      const BADGE = {
        RELEASING: ['Airing', '#3DB4F2'],
        FINISHED: ['Finished', '#4CAF50'],
        NOT_YET_RELEASED: ['Upcoming', '#F79A63'],
        HIATUS: ['Hiatus', '#728AA1'],
      };
      section(body, 'Missing sequels (' + res.length + ')');
      if (hidden) {
        const h = el('div', 'kld-hint', hidden + ' planned sequel' + (hidden === 1 ? ' is' : 's are') + ' hidden.');
        h.style.margin = '-2px 0 8px';
        body.append(h);
      }
      if (!res.length && hidden) body.append(el('div', 'kld-info', 'Every missing sequel is already on your Planning list.'));
      for (const s of res) {
        const a = el('a', 'kld-item');
        a.href = 'https://anilist.co/' + noun() + '/' + s.id;
        a.target = '_blank';
        a.rel = 'noopener';
        if (s.cover) { const img = el('img'); img.src = s.cover; img.loading = 'lazy'; img.alt = ''; a.append(img); }
        else a.append(el('span', 'kld-ph'));
        const txt = el('div');
        txt.style.minWidth = '0';
        txt.append(el('div', 'kld-it', s.title),
          el('div', 'kld-is', 'After ' + s.after + (s.year ? ' · ' + s.year : '') + (s.format ? ' · ' + s.format.replace(/_/g, ' ') : '')));
        a.append(txt);
        const [label, color] = s.planned ? ['On Planning', '#9256F3'] : (BADGE[s.status] || [s.status, '#728AA1']);
        const badge = el('span', 'kld-badge', label);
        badge.style.background = color;
        a.append(badge);
        body.append(a);
      }
    }

    // ---------------- Settings tab ----------------
    function buildSettings(body) {
      section(body, 'Button');
      segRow(body, [['top', 'Top bar'], ['bottom', 'Bottom corner']], () => cfg.btnPos, v => {
        cfg.btnPos = v; save(); ensureButtons(); placePanel(); render();
      });
      body.append(el('span', 'kld-hint', 'Top bar puts ✦ between search and your avatar. If AniList\'s bar can\'t be found, the corner button shows instead.'));

      section(body, 'Claude');
      segRow(body, [['paste', 'Paste only'], ['send', 'Paste + send'], ['board', 'Board only']], () => cfg.claudeMode, v => {
        cfg.claudeMode = v; save(); render();
      });
      const CM = {
        paste: 'Opens Claude with the prompt pasted in. You press send.',
        send: 'Opens Claude, pastes the prompt and sends it for you.',
        board: 'Claude works in a background tab. When the board is done, that tab closes and the board opens on its own, ' +
          'with a button to ask follow-ups in the same chat. The time estimate learns from your past boards.',
      };
      const cmh = el('span', 'kld-hint', CM[cfg.claudeMode] || '');
      cmh.style.marginTop = '6px';
      body.append(cmh);

      section(body, 'Standing preferences');
      body.append(el('span', 'kld-hint', 'Stacked on top of the core prompt in every mode, before your mood. Leave empty to let your list speak for itself.'));
      const ta = el('textarea', 'kld-text');
      ta.value = cfg.prefs;
      ta.addEventListener('input', () => { cfg.prefs = ta.value; save(); });
      body.append(ta);
      const b = el('div', 'kld-btns');
      btn(b, 'Reset to default', () => { cfg.prefs = DEFAULT_PREFS; save(); render(); });
      btn(b, 'Reload list', () => {
        cache.lists.clear(); cache.airing = null; sequelResult = null;
        preload();
        say('Reloading your list…', 'wait');
        const user = getUsername();
        if (user) getList(user, cfg.type).p.then(d => say('Reloaded ' + d.length + ' ' + noun() + '.'), () => { /* shown by preload */ });
      });
      body.append(b);
      statusLine(body);

      section(body, 'Appearance');
      toggleRow(body, 'Match my device', 'Light or dark follows your device until you flip the switch up top',
        () => cfg.appearance === 'auto', v => { cfg.appearance = v ? 'auto' : (isDark() ? 'dark' : 'light'); save(); applyLook(); render(); }).querySelector('input').setAttribute('data-gw-match', '');

      body.append(el('div', 'kld-note',
        'Works on any profile: open someone\'s page and Kaleidoscope uses their list. The prompt is always copied to your clipboard ' +
        'too, so Ctrl+V works if Claude doesn\'t paste it in.'));
    }

    function render() {
      if (!panelEl) return;
      const keepScroll = bodyEl.scrollTop;
      bodyEl.textContent = '';
      statusEl = null;
      for (const b of panelEl.querySelectorAll('.kld-tab')) b.classList.toggle('on', b.dataset.tab === cfg.tab);
      if (cfg.tab === 'seq') buildSequels(bodyEl);
      else if (cfg.tab === 'set') buildSettings(bodyEl);
      else buildRec(bodyEl);
      bodyEl.scrollTop = keepScroll;
      updateSub();
    }

    function open() {
      if (panelEl) return;
      panelEl = el('div');
      panelEl.id = 'kaleidoscope-panel';

      const head = el('div', 'kld-head');
      const t = el('div');
      const title = el('div', 'kld-title', 'Kaleido');
      title.append(el('b', null, 'scope'));
      subEl = el('div', 'kld-sub');
      t.append(title, el('div', 'kld-tagline', 'AI recommendations from your list'));
      const x = el('button', 'kld-x'); x.append(gwCloseIcon());
      x.type = 'button';
      x.title = 'Close';
      x.addEventListener('click', close);
      const brand = el('div', 'kld-brand');
      brand.append(iconTile(), t);
      head.append(brand, lookSwitch(), x);
      const ctx = el('div', 'kld-ctx');
      ctx.append(subEl);

      const tabs = el('div', 'kld-tabs');
      for (const [id, name] of [['rec', 'Recommend'], ['seq', 'Sequels'], ['set', 'Settings']]) {
        const b = el('button', 'kld-tab', name);
        b.type = 'button';
        b.dataset.tab = id;
        b.addEventListener('click', () => {
          cfg.tab = id; save();
          lastStatus = null;
          bodyEl.scrollTop = 0;
          render();
        });
        tabs.append(b);
      }

      bodyEl = el('div', 'kld-body');
      const foot = el('div', 'kld-footline', 'Open from \u2726 or the Tampermonkey menu \u00b7 v' + VERSION + ' \u00b7 every tab updates live');
      panelEl.append(head, ctx, tabs, bodyEl, foot);
      for (const type of ['keydown', 'keypress', 'keyup']) {
        panelEl.addEventListener(type, e => {
          if (type === 'keydown' && e.key === 'Escape') close();
          e.stopPropagation();
        });
      }
      root.append(panelEl);
      applyLook();
      placePanel();
      checkLastBoardChat(); // ready for the new-board popup, Follow-up and Update
      lastStatus = null;
      toggleBtn.classList.add('open');
      navBtn.classList.add('open');
      try {
        render();
        preload();
      } catch (e) {
        console.error('[Kaleidoscope]', e);
        bodyEl.textContent = '';
        bodyEl.append(el('div', 'kld-info', 'Something broke while drawing the menu: ' + (e && e.message) + '. Details are in the console (F12).'));
      }
      const pr = panelEl.getBoundingClientRect();
      const cs = getComputedStyle(panelEl);
      console.log('[Kaleidoscope] panel opened at x=' + Math.round(pr.left) + ' y=' + Math.round(pr.top) +
        ' size=' + Math.round(pr.width) + 'x' + Math.round(pr.height) + ' | debug ' + JSON.stringify({
          vh: window.innerHeight, maxH: cs.maxHeight, h: cs.height, display: cs.display, font: cs.fontSize,
          kids: [...panelEl.children].map(c => (c.className || c.tagName) + ' ' + Math.round(c.getBoundingClientRect().height) + 'px ' + getComputedStyle(c).display),
        }));
    }

    // Top right, like every Glassware panel, whichever button opened it.
    function placePanel() {
      if (!panelEl) return;
      const s = panelEl.style;
      s.top = '16px'; s.bottom = 'auto'; s.right = '16px';
      s.maxHeight = 'calc(100vh - 32px)';
    }
    window.addEventListener('resize', placePanel);

    function close() {
      if (!panelEl) return;
      panelEl.remove();
      panelEl = bodyEl = subEl = statusEl = null;
      toggleBtn.classList.remove('open');
      navBtn.classList.remove('open');
    }
    const toggle = () => (panelEl ? close() : open());

    // click outside closes it (clicks inside the shadow root show up as the host element)
    document.addEventListener('mousedown', e => {
      if (!panelEl) return;
      const path = e.composedPath();
      if (!path.includes(host) && !path.includes(navHost)) close();
    }, true);

    const toggleBtn = el('button', null, '✦');
    toggleBtn.id = 'kaleidoscope-toggle';
    toggleBtn.type = 'button';
    toggleBtn.title = 'Kaleidoscope';
    toggleBtn.setAttribute('aria-label', 'Kaleidoscope');
    root.append(toggleBtn);

    // Caught at the window, before AniList's own handlers can see (or swallow) the click.
    window.addEventListener('click', e => {
      const path = e.composedPath();
      if (!path.includes(navBtn) && !path.includes(toggleBtn)) return;
      e.preventDefault();
      e.stopPropagation();
      console.log('[Kaleidoscope] button clicked: ' + (panelEl ? 'closing' : 'opening'));
      toggle();
    }, true);

    // Put our button right after the search icon in AniList's top bar, between search and your avatar.
    // Checked every so often because AniList redraws the bar.
    function findNavSpot() {
      const nav = document.querySelector('#nav') || document.querySelector('.nav');
      if (!nav) return null;
      return nav.querySelector('.wrap > .search') || nav.querySelector('.search');
    }
    function ensureButtons() {
      let inBar = false;
      if (cfg.btnPos === 'top') {
        if (navHost.isConnected && navHost.previousElementSibling && findNavSpot() === navHost.previousElementSibling) inBar = true;
        else {
          const spot = findNavSpot();
          if (spot) { spot.after(navHost); inBar = true; }
        }
      }
      if (!inBar && navHost.isConnected) navHost.remove();
      toggleBtn.style.display = inBar ? 'none' : '';
      if (!host.isConnected) (document.body || document.documentElement).append(host);
    }
    ensureButtons();
    setInterval(ensureButtons, 1500);
    if (job) showJob();
    console.log('[Kaleidoscope] ' + ((typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '') + ' loaded. Button in top bar: ' + navHost.isConnected);

    if (typeof GM_registerMenuCommand === 'function') {
      try { GM_registerMenuCommand('Open Kaleidoscope', open); } catch (e) { /* ignore */ }
    }
  }
})();
