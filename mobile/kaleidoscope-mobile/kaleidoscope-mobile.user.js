// ==UserScript==
// @name         Kaleidoscope Mobile
// @namespace    jigglypug.anime.kaleidoscope-mobile
// @version      1.3.3
// @description  Phone-friendly Kaleidoscope prompt builder for AniList. Pick a mode (recent, top rated, wildcard, airing now, backlog), then Copy, Save or Share the prompt. Update builds a "what changed since last time" prompt from your list. Also finds sequels you haven't watched. Open it from the Tampermonkey menu or the small ✦ button.
// @match        https://anilist.co/*
// @noframes
// @run-at       document-end
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @author       JigglyPug
// @license      MIT
// @icon         https://raw.githubusercontent.com/JigglyPug/glassware/main/assets/icons/kaleidoscope-mobile.png?v=2
// @homepageURL  https://jigglypug.github.io/glassware/mobile/kaleidoscope-mobile/
// @supportURL   https://github.com/JigglyPug/glassware/issues
// @updateURL    https://raw.githubusercontent.com/JigglyPug/glassware/main/mobile/kaleidoscope-mobile/kaleidoscope-mobile.user.js
// @downloadURL  https://raw.githubusercontent.com/JigglyPug/glassware/main/mobile/kaleidoscope-mobile/kaleidoscope-mobile.user.js
// ==/UserScript==

/* Kaleidoscope Mobile: desktop Kaleidoscope's prompt builder, for phones. It never talks to Claude.
     - Recommend tab: pick a mode, then Copy / Update / Save / Share. Same modes as desktop; you paste the prompt into Claude yourself.
     - Changes since last prompt: every Copy, Save or Share snapshots your list. Update gets your list fresh
       from AniList and builds an update prompt from what changed, to paste into the same Claude chat.
     - Sequels tab: finds sequels to shows you finished that aren't on your list (no AI needed).
   It has its own name, namespace and storage, so it never touches desktop Kaleidoscope or its boards.
*/

(function () {
  'use strict';

  const SETTINGS_KEY = 'kaleidoscopem.settings';
  const SNAPS_KEY = 'kaleidoscopem.snaps';

  const onReady = fn => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };
  onReady(main);

  function main() {
    const ACCENT = '#3DB4F2';
    const DEFAULT_PREFS = '';
    const DEFAULTS = { type: 'ANIME', mode: 'recent', prefs: DEFAULT_PREFS, tab: 'rec', btnPos: 'left', hidePlanned: true, lastUser: '', appearance: 'auto' };
    const saved = GM_getValue(SETTINGS_KEY, {});
    const cfg = Object.assign({}, DEFAULTS, saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {});
    const save = () => GM_setValue(SETTINGS_KEY, cfg);

    // AniList genre-bar colors, one per mode
    const MODES = [
      { id: 'recent', color: '#3DB4F2', title: 'More like my recent', hint: 'Keeps your current streak going' },
      { id: 'top', color: '#5CC22F', title: 'More like my top rated', hint: 'Built on what your favorites have in common' },
      { id: 'wild', color: '#9256F3', title: 'Wildcard', hint: 'Outside your usual genres, still your taste' },
      { id: 'airing', color: '#F779A4', title: 'What\'s airing now', hint: 'Picks from this season\'s real lineup', animeOnly: true },
      { id: 'backlog', color: '#E85D75', title: 'Clear my backlog', hint: 'What to start next from Planning and Paused' },
    ];

    // A saved value this version doesn't know (garbled, or written by a later version) falls back to
    // its default, so the panel never opens blank. Valid saved values are kept exactly as they are.
    {
      const ONE_OF = { type: ['ANIME', 'MANGA'], mode: MODES.map(m => m.id), tab: ['rec', 'seq', 'set'], btnPos: ['left', 'right', 'off'], appearance: ['auto', 'light', 'dark'] };
      for (const [k, ok] of Object.entries(ONE_OF)) if (!ok.includes(cfg[k])) cfg[k] = DEFAULTS[k];
      if (typeof cfg.hidePlanned !== 'boolean') cfg.hidePlanned = DEFAULTS.hidePlanned;
      for (const k of ['prefs', 'lastUser']) if (typeof cfg[k] !== 'string') cfg[k] = DEFAULTS[k];
    }

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

    // Cache so the prompt is ready the moment you tap (the share sheet only opens right after a tap,
    // so the list is loaded when the panel opens, not when you pick a mode).
    const cache = { lists: new Map(), airing: null };
    function getList(user, type, force) {
      const k = user.toLowerCase() + ':' + type;
      const c = cache.lists.get(k);
      if (c && !force && Date.now() - c.ts < 5 * 60 * 1000) return c;
      const entry = { ts: Date.now(), data: null, err: null };
      entry.p = fetchList(user, type).then(d => (entry.data = d), e => { entry.err = e; if (cache.lists.get(k) === entry) cache.lists.delete(k); throw e; });
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
      // your own profile link in AniList's menu (desktop bar or phone menu)
      const a = document.querySelector('.nav a[href^="/user/"], #nav a[href^="/user/"], .mobile-nav a[href^="/user/"], .nav-mobile a[href^="/user/"]');
      const mm = a && a.getAttribute('href').match(/^\/user\/([^/]+)/);
      if (mm) {
        const u = decodeURIComponent(mm[1]);
        if (u !== cfg.lastUser) { cfg.lastUser = u; save(); }
        return u;
      }
      // AniList's phone layout doesn't always have that link on the page, so use the last one seen
      // (or the one set in Settings). Never a random user link from the feed.
      return cfg.lastUser || null;
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

    // ---------------- Changes since your last prompt ----------------
    const SNAP_STATUS = { CURRENT: 'W', COMPLETED: 'C', REPEATING: 'R', PAUSED: 'P', DROPPED: 'D', PLANNING: 'L' };
    // A small copy of the list as it was at your last Copy, Save or Share, to see what changed since.
    function makeSnap(list) {
      const e = {};
      for (const x of list) e[x.id] = [SNAP_STATUS[x.status] || x.status, x.score || 0, x.progress || 0, x.title];
      return { at: Date.now(), e };
    }

    const snapKey = (user, type) => user.toLowerCase() + ':' + type;
    function getSnap(user, type) {
      const all = GM_getValue(SNAPS_KEY, {}) || {};
      return all[snapKey(user, type)] || null;
    }
    // Copy, Save and Share each mark a new starting point (Anime and Manga are kept apart).
    function setSnap(user, type, list, label, how) {
      const all = GM_getValue(SNAPS_KEY, {}) || {};
      all[snapKey(user, type)] = Object.assign(makeSnap(list), { label, how });
      GM_setValue(SNAPS_KEY, all);
    }

    function computeChanges(snap, type, list) {
      const A = type !== 'MANGA';
      const unit = A ? 'eps' : 'ch';
      const W = { W: A ? 'watching' : 'reading', C: 'completed', R: A ? 'rewatching' : 'rereading', P: 'paused', D: 'dropped', L: 'planning' };
      const old = snap.e;
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
        if (sign) out.push({ sign, title: x.title, id: x.id, detail });
      }
      for (const id of Object.keys(old)) {
        if (!now[id]) out.push({ sign: '−', title: old[id][3], id: +id, detail: 'removed from my list' });
      }
      return out;
    }

    function buildUpdatePrompt(list, changes, note, A) {
      const unit = A ? 'eps' : 'ch';
      const parts = ['UPDATE THE BOARD YOU MADE ABOVE (don\'t rebuild it)'];
      if (changes) {
        parts.push(changes.length
          ? 'Since you made it, here\'s what changed on my AniList. Everything not listed is the same as before.\n<changes>\n' +
            changes.map(c => c.sign + ' ' + c.title + ' (id ' + c.id + '): ' + c.detail).join('\n') + '\n</changes>'
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
        're-check predicted ratings, and update any stat tiles, charts, takeaways and the header date these changes affect. Leave everything else exactly as it is, including the design.\n\n' +
        'Update the board artifact you made above with these changes. Keep the design and leave everything else exactly as it is.'
      );
      return parts.join('\n\n');
    }

    // ---------------- Panel (Kaleidoscope layout, as a bottom sheet for phones) ----------------
    // Everything lives inside a shadow root so AniList's own CSS and scripts can't touch it.
    const HOVER = s => '@media (hover:hover){' + s + '}';
    const PANEL_CSS = (
      ':host{all:initial}' +
      '#kaleidoscope-toggle{position:fixed;left:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:2147483000;width:38px;height:38px;' +
      'padding:0;border:1px solid rgba(61,180,242,.28);border-radius:50%;background:#151F2E;color:#EDF1F5;cursor:pointer;display:inline-flex;' +
      'align-items:center;justify-content:center;font:17px/1 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.45);' +
      '-webkit-tap-highlight-color:transparent;transition:color .15s,background .15s}' +
      '#kaleidoscope-toggle.right{left:auto;right:16px}' +
      '#kaleidoscope-toggle.open,#kaleidoscope-toggle:active{color:' + ACCENT + ';background:#0B1622}' +

      '#kaleidoscope-backdrop{position:fixed;inset:0;z-index:2147483646;background:rgba(11,22,34,.6);animation:kld-fade .18s ease}' +
      '@keyframes kld-fade{from{opacity:0}}' +
      '@keyframes kld-up{from{transform:translateY(40px);opacity:0}}' +

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
      '#kaleidoscope-panel[data-theme=light] .kld-tab.on,#kaleidoscope-panel[data-theme=light] .kld-reload:hover,#kaleidoscope-panel[data-theme=light] .kld-more:hover,#kaleidoscope-panel[data-theme=light] .kld-item:hover .kld-it,#kaleidoscope-panel[data-theme=light] .kld-title b,#kaleidoscope-panel[data-theme=light] .kld-tag{color:var(--k-ink)}' +
      // glassware:frame start: shared controls, stamped by tools/frame.py; edit them there
      '#kaleidoscope-panel .kld-mode-sw{position:relative!important;flex:none!important;display:flex!important;align-items:center!important;justify-content:space-between!important;width:50px!important;height:28px!important;margin:0 0 0 auto!important;padding:0 7px!important;border:0!important;border-radius:14px!important;background:var(--k-well)!important;color:var(--k-muted)!important;cursor:pointer!important;box-sizing:border-box!important;min-width:0!important;min-height:0!important;max-height:none!important;line-height:1!important;text-transform:none!important;letter-spacing:normal!important}' +
      '#kaleidoscope-panel .kld-mode-sw svg{position:relative!important;z-index:1!important;flex:none!important;display:block!important;width:13px!important;height:13px!important;transition:color .18s!important}' +
      '#kaleidoscope-panel .kld-mode-sw .kld-knob{position:absolute!important;top:3px!important;left:3px!important;width:22px!important;height:22px!important;border-radius:50%!important;background:var(--k-knob)!important;box-shadow:0 1px 3px rgba(0,0,0,.25)!important;transition:transform .2s cubic-bezier(.3,.7,.3,1)!important}' +
      '#kaleidoscope-panel[data-theme=dark] .kld-mode-sw .kld-knob{transform:translateX(22px)!important}' +
      '#kaleidoscope-panel .kld-mode-sw .kld-sun,#kaleidoscope-panel[data-theme=dark] .kld-mode-sw .kld-moon{color:var(--k-strong)!important}' +
      '#kaleidoscope-panel[data-theme=dark] .kld-mode-sw .kld-sun{color:var(--k-muted)!important}' +
      '#kaleidoscope-panel .kld-x{flex:none!important;display:grid!important;place-items:center!important;width:36px!important;height:36px!important;margin:0 0 0 8px!important;padding:0!important;border:0!important;border-radius:50%!important;background:var(--k-well)!important;color:var(--k-muted)!important;cursor:pointer!important;box-sizing:border-box!important;min-width:0!important;min-height:0!important;max-height:none!important;line-height:1!important;text-transform:none!important;letter-spacing:normal!important}' +
      '#kaleidoscope-panel .kld-x:hover{background:var(--k-well-hi)!important;color:var(--k-strong)!important}' +
      '#kaleidoscope-panel input.kld-switch{flex:none!important;position:relative!important;width:46px!important;height:28px!important;margin:0!important;padding:0!important;border:0!important;border-radius:14px!important;background:var(--k-sw-off)!important;cursor:pointer!important;transition:background .18s!important;box-sizing:border-box!important;min-width:0!important;min-height:0!important;max-height:none!important;line-height:1!important;text-transform:none!important;letter-spacing:normal!important;appearance:none!important;-webkit-appearance:none!important}' +
      '#kaleidoscope-panel input.kld-switch::after{content:""!important;position:absolute!important;top:2px!important;left:2px!important;width:24px!important;height:24px!important;border-radius:50%!important;background:#fff!important;box-shadow:0 1px 3px rgba(0,0,0,.25)!important;transition:transform .18s cubic-bezier(.3,.7,.3,1)!important}' +
      '#kaleidoscope-panel input.kld-switch:checked{background:' + ACCENT + '!important;box-shadow:0 0 12px -2px color-mix(in srgb,' + ACCENT + ' 70%,transparent)!important}' +
      '#kaleidoscope-panel input.kld-switch:checked::after{transform:translateX(18px)!important}' +
      '#kaleidoscope-panel .kld-mode-sw:focus-visible,#kaleidoscope-panel .kld-x:focus-visible,#kaleidoscope-panel input.kld-switch:focus-visible{outline:2px solid ' + ACCENT + '!important;outline-offset:2px!important}' +
      // glassware:frame end
      '#kaleidoscope-panel{position:fixed;left:0;right:0;bottom:0;margin:0 auto;width:100%;box-sizing:border-box;max-width:560px;max-height:88vh;max-height:88dvh;' +
      'display:flex;flex-direction:column;z-index:2147483647;background:radial-gradient(120% 40% at 0% 0%,rgba(61,180,242,.16),transparent 64%),var(--k-glass);-webkit-backdrop-filter:blur(28px) saturate(170%);backdrop-filter:blur(28px) saturate(170%);color:var(--k-text);' +
      'border:1px solid var(--k-edge);border-bottom:0;border-radius:18px 18px 0 0;box-shadow:0 0 0 .5px rgba(61,180,242,.35),0 -10px 40px var(--k-drop),inset 0 1px 0 var(--k-hl);' +
      'font:14px/1.45 Overpass,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:left;animation:kld-up .22s ease;' +
      '-webkit-tap-highlight-color:transparent}' +
      '#kaleidoscope-panel *{box-sizing:border-box;font-family:inherit !important;letter-spacing:normal}' +
      '#kaleidoscope-panel label{color:inherit!important;text-shadow:inherit!important}' +   // sites style <label>
      '#kaleidoscope-panel .kld-grab{width:38px;height:4px;border-radius:2px;background:var(--k-sw-off);margin:8px auto 0;flex:none}' +
      '#kaleidoscope-panel .kld-head{display:flex;align-items:flex-start;justify-content:space-between;padding:8px 14px 10px 18px;flex:none}' +
      '#kaleidoscope-panel .kld-title{font-weight:800;font-size:19px;color:var(--k-title);line-height:1.2;display:flex;align-items:center;gap:7px}' +
      '#kaleidoscope-panel .kld-title b{color:' + ACCENT + ';font-weight:800}' +
      '#kaleidoscope-panel .kld-tag{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:' + ACCENT + ';' +
      'background:rgba(61,180,242,.14);border-radius:6px;padding:3px 6px 2px}' +
      '#kaleidoscope-panel .kld-tagline{font-size:12px;color:var(--k-ink);margin:1px 0 2px}' +
      '#kaleidoscope-panel .kld-sub{color:var(--k-dim);font-size:12px}' +
      '#kaleidoscope-panel .kld-sub b{color:var(--k-text);font-weight:600}' +
      '#kaleidoscope-panel .kld-reload{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin:-6px 0 -6px 2px;' +
      'padding:0;border:0;border-radius:50%;background:transparent;color:var(--k-dim);font-size:15px;line-height:1;cursor:pointer;vertical-align:middle}' +
      '#kaleidoscope-panel .kld-reload:active{color:' + ACCENT + ';background:rgba(61,180,242,.12)}' +
      '#kaleidoscope-panel .kld-reload.spin{color:' + ACCENT + ';animation:kld-spin .8s linear infinite}' +
      '#kaleidoscope-panel .kld-tabs{display:flex;gap:4px;margin:0 12px 4px;padding:4px;background:var(--k-well);border-radius:12px;flex:none}' +
      '#kaleidoscope-panel .kld-tab{flex:1;padding:10px 4px;border:0;border-radius:9px;background:transparent;color:var(--k-muted);' +
      'cursor:pointer;font-size:13.5px;font-weight:600}' +
      '#kaleidoscope-panel .kld-tab.on{background:rgba(61,180,242,.16);color:' + ACCENT + '}' +
      '#kaleidoscope-panel .kld-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;' +
      'padding:2px 16px 16px;scrollbar-width:thin;scrollbar-color:var(--k-sw-off) transparent}' +
      '#kaleidoscope-panel .kld-sec{margin:18px 0 7px;display:flex;align-items:center;gap:7px;color:var(--k-ink);font:700 10.5px/1.2 ui-monospace,"SF Mono","Cascadia Mono",Menlo,monospace !important;letter-spacing:.16em;text-transform:uppercase}' +
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
      '#kaleidoscope-panel .kld-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0}' +
      '#kaleidoscope-panel label.kld-row{cursor:pointer}' +
      '#kaleidoscope-panel .kld-label{flex:1;min-width:0;color:var(--k-strong)}' +
      '#kaleidoscope-panel .kld-hint{display:block;color:var(--k-dim);font-size:12px;margin-top:1px}' +
      '#kaleidoscope-panel .kld-seg{display:flex;gap:4px;padding:4px;background:var(--k-well);border-radius:12px}' +
      '#kaleidoscope-panel .kld-segbtn{flex:1;padding:10px 4px;border:0;border-radius:9px;background:transparent;color:var(--k-muted);' +
      'cursor:pointer;font-size:13.5px;font-weight:600}' +
      '#kaleidoscope-panel .kld-segbtn.on{background:' + ACCENT + ';color:#0B1622}' +
      '#kaleidoscope-panel input.kld-text,#kaleidoscope-panel textarea.kld-text{width:100%;background:var(--k-well);color:var(--k-strong);' +
      'border:1px solid var(--k-line);border-radius:10px;padding:10px 12px;font-size:15px;outline:none;margin:0}' +
      '#kaleidoscope-panel textarea.kld-text{min-height:84px;resize:vertical;line-height:1.45;margin-top:6px}' +
      '#kaleidoscope-panel .kld-text:focus{border-color:' + ACCENT + '}' +
      '#kaleidoscope-panel .kld-text::placeholder{color:var(--k-dimmer)}' +
      '#kaleidoscope-panel .kld-modes{display:flex;flex-direction:column;gap:7px}' +
      '#kaleidoscope-panel .kld-mode{display:flex;align-items:center;gap:12px;width:100%;min-height:52px;padding:10px 14px;border:0;border-radius:12px;' +
      'background:var(--k-well);color:var(--k-strong);cursor:pointer;text-align:left;transition:background .12s,transform .08s,box-shadow .12s}' +
      '#kaleidoscope-panel .kld-mode:active{transform:scale(.985)}' +
      '#kaleidoscope-panel .kld-mode.sel{background:var(--k-well-hi);box-shadow:inset 0 0 0 1.5px var(--c)}' +
      '#kaleidoscope-panel .kld-mode .kld-dot{width:10px;height:10px;border-radius:50%;flex:none;background:var(--c);box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 20%,transparent)}' +
      '#kaleidoscope-panel .kld-mode .kld-label{font-weight:600;font-size:14px}' +
      '#kaleidoscope-panel .kld-mode .kld-go{color:var(--c);font-size:16px;font-weight:800;flex:none;width:18px;text-align:center}' +
      '@keyframes kld-spin{to{transform:rotate(360deg)}}' +
      '#kaleidoscope-panel .kld-mode[disabled]{opacity:.35;cursor:not-allowed}' +
      '#kaleidoscope-panel .kld-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}' +
      '#kaleidoscope-panel .kld-btn{min-height:40px;padding:9px 14px;border:0;border-radius:10px;background:var(--k-btn);color:var(--k-strong);cursor:pointer;font-size:13.5px}' +
      '#kaleidoscope-panel .kld-btn:active{background:var(--k-btn-hi)}' +
      '#kaleidoscope-panel .kld-btn.primary{background:' + ACCENT + ';color:#0B1622;font-weight:650}' +
      '#kaleidoscope-panel .kld-btn.primary:active{background:#5CC2F5}' +
      '#kaleidoscope-panel .kld-btn[disabled]{opacity:.5;cursor:wait}' +
      '#kaleidoscope-panel .kld-status{min-height:18px;font-size:12.5px;color:var(--k-good);margin-top:8px}' +
      '#kaleidoscope-panel .kld-status.err{color:var(--k-bad)}' +
      '#kaleidoscope-panel .kld-status.wait{color:var(--k-muted)}' +
      '#kaleidoscope-panel .kld-info{background:var(--k-well);border-radius:10px;padding:10px 12px;margin:8px 0 4px;font-size:12.5px;color:var(--k-muted)}' +
      '#kaleidoscope-panel .kld-info b{color:var(--k-strong);font-weight:650}' +
      '#kaleidoscope-panel .kld-note{color:var(--k-dimmer);font-size:12px;margin-top:14px}' +
      '#kaleidoscope-panel .kld-item{display:flex;align-items:center;gap:11px;padding:7px;margin-bottom:7px;background:var(--k-well);' +
      'border-radius:11px;text-decoration:none;color:inherit}' +
      '#kaleidoscope-panel .kld-item:active{background:var(--k-well-hi)}' +
      '#kaleidoscope-panel .kld-item img,#kaleidoscope-panel .kld-item .kld-ph{width:38px;height:54px;object-fit:cover;border-radius:6px;flex:none;background:var(--k-well-hi)}' +
      '#kaleidoscope-panel .kld-item .kld-it{color:var(--k-strong);font-size:13.5px;font-weight:600;line-height:1.3}' +
      '#kaleidoscope-panel .kld-item .kld-is{color:var(--k-dim);font-size:12px;margin-top:2px}' +
      '#kaleidoscope-panel .kld-badge{margin-left:auto;flex:none;font-size:11px;font-weight:700;padding:4px 8px;border-radius:6px;color:#fff;white-space:nowrap}' +
      '#kaleidoscope-panel .kld-lastcard{background:var(--k-well);border-radius:12px;padding:11px 12px 12px 13px}' +
      '#kaleidoscope-panel .kld-lastcard .kld-label{font-weight:600;font-size:13.5px}' +
      '#kaleidoscope-panel .kld-upd{border-top:1px solid var(--k-line);margin-top:10px;padding-top:10px}' +
      '#kaleidoscope-panel .kld-upd textarea.kld-text{background:var(--k-solid);margin-top:10px;min-height:60px}' +
      '#kaleidoscope-panel .kld-chg{font-size:13px;line-height:1.7;max-height:300px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--k-sw-off) transparent}' +
      '#kaleidoscope-panel .kld-sign{display:inline-block;width:16px;font-weight:700}' +
      '#kaleidoscope-panel .kld-ct{color:var(--k-strong)}' +
      '#kaleidoscope-panel .kld-cd{color:var(--k-dim)}' +
      '#kaleidoscope-panel .kld-more{display:inline-block;margin-top:4px;padding:6px 10px 6px 0;border:0;background:none;color:var(--k-dim);' +
      'font-size:13px;cursor:pointer;border-radius:6px}' +
      '#kaleidoscope-panel .kld-more:active{color:' + ACCENT + '}' +

      // Footer: what's ready, then Copy / Update / Save / Share
      '#kaleidoscope-panel .kld-foot{flex:none;border-top:1px solid var(--k-line);background:var(--k-solid);' +
      'padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px))}' +
      '#kaleidoscope-panel .kld-ready{font-size:12.5px;color:var(--k-muted);margin:0 2px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#kaleidoscope-panel .kld-ready b{color:var(--k-strong);font-weight:650}' +
      '#kaleidoscope-panel .kld-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}' +
      '#kaleidoscope-panel .kld-act{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:56px;padding:6px 2px;' +
      'border:0;border-radius:12px;background:var(--k-well);color:var(--k-strong);cursor:pointer;font-size:12.5px;font-weight:650;transition:transform .08s,background .12s}' +
      '#kaleidoscope-panel .kld-act svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
      '#kaleidoscope-panel .kld-act:active{transform:scale(.96);background:var(--k-well-hi)}' +
      '#kaleidoscope-panel .kld-act.primary{background:' + ACCENT + ';color:#0B1622}' +
      '#kaleidoscope-panel .kld-act.primary:active{background:#5CC2F5}' +
      '#kaleidoscope-panel .kld-act.busy svg{animation:kld-spin .8s linear infinite}' +
      '#kaleidoscope-panel .kld-act[disabled]{opacity:.35;cursor:not-allowed;transform:none}' +
      '#kaleidoscope-panel .kld-foot .kld-status{margin:8px 2px 0;min-height:0}' +
      '#kaleidoscope-panel .kld-foot .kld-status:empty{display:none}' +

      HOVER(
        '#kaleidoscope-toggle:hover{color:' + ACCENT + '}' +
        '#kaleidoscope-panel .kld-tab:hover,#kaleidoscope-panel .kld-segbtn:hover{color:var(--k-strong)}' +
        '#kaleidoscope-panel .kld-segbtn.on:hover{color:#fff}' +
        '#kaleidoscope-panel .kld-mode:not([disabled]):hover{background:var(--k-well-hi)}' +
        '#kaleidoscope-panel .kld-btn:hover{background:var(--k-btn-hi)}' +
        '#kaleidoscope-panel .kld-btn.primary:hover,#kaleidoscope-panel .kld-act.primary:hover{background:#5CC2F5}' +
        '#kaleidoscope-panel .kld-act:not(.primary):not([disabled]):hover{background:var(--k-well-hi)}' +
        '#kaleidoscope-panel .kld-item:hover{background:var(--k-well-hi)}' +
        '#kaleidoscope-panel .kld-more:hover,#kaleidoscope-panel .kld-reload:hover{color:' + ACCENT + '}'
      )
    );

    const host = document.createElement('kaleidoscope-mobile');
    host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483647;display:block';
    const root = host.attachShadow({ mode: 'open' });
    const panelStyle = document.createElement('style');
    panelStyle.textContent = PANEL_CSS;
    root.append(panelStyle);
    (document.body || document.documentElement).append(host);
    // AniList redraws the page as you move around; put the button back if it ever gets dropped.
    new MutationObserver(() => { if (!host.isConnected) (document.body || document.documentElement).append(host); })
      .observe(document.body || document.documentElement, { childList: true });

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
    let jobEl = null;   // desktop shows a board-job card; the phone version has none
    const isDark = () => cfg.appearance === 'dark' || (cfg.appearance !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    function applyLook() {
      for (const n of [panelEl, jobEl]) if (n) n.setAttribute('data-theme', isDark() ? 'dark' : 'light');
      const m = panelEl && panelEl.querySelector('.kld-mode-sw');
      if (m) m.setAttribute('aria-checked', String(isDark()));
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

    const ago = ts => {
      const m = Math.round((Date.now() - ts) / 60000);
      return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago';
    };

    let panelEl = null;
    let bodyEl = null;
    let footEl = null;
    let backdropEl = null;
    let subEl = null;
    let statusEl = null;
    let busy = false;
    let moodText = '';
    let sequelResult = null; // { key, items } | { key, err }
    let lastStatus = null;
    let ready = null; // null = the selected mode's prompt; { kind: 'update', ... } = an update prompt
    let updateNote = '';
    let changesOpen = false; // "+ N more changes" expanded?
    let renderPending = false;
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

    const ICON_SRC = 'data:image/webp;base64,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'; // app icon (assets/icons), embedded by tools/panel_icons.py
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
      if (!user) { subEl.append('Open your profile once, or set your username in Settings'); return; }
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

    // Start loading as soon as the panel opens, so Copy and Share work right away
    // (the share sheet only opens straight after a tap).
    function preload() {
      const user = getUsername();
      updateSub();
      if (!user) return;
      const c = getList(user, cfg.type);
      if (!c.data) c.p.then(() => { updateSub(); softRender(); }, e => { updateSub(); say(e.message, 'err'); });
      else if (Date.now() - c.ts > 60 * 1000) {
        // show the cached list right away, then quietly refresh it so "Changes since last prompt" is current
        getList(user, cfg.type, true).p.then(() => softRender(), () => { /* keep the cached one */ });
      }
      if (cfg.type === 'ANIME') getAiring().p.catch(() => { /* reported if you pick that mode */ });
    }

    // Redraw after something loads in the background, but never while you're typing
    // (a redraw would close the keyboard). It catches up on the next tap.
    function softRender() {
      if (!panelEl) return;
      const a = root.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) { renderPending = true; updateSub(); return; }
      render();
    }

    // ---------------- Recommend tab ----------------
    const currentMode = () => {
      const m = MODES.find(x => x.id === cfg.mode);
      return m && !(m.animeOnly && cfg.type !== 'ANIME') ? m : null;
    };

    function buildRec(body) {
      section(body, 'List');
      segRow(body, [['ANIME', 'Anime'], ['MANGA', 'Manga']], () => cfg.type, v => {
        cfg.type = v; save(); ready = null; lastStatus = null; render(); preload();
      });

      section(body, 'Mood');
      const mood = el('input', 'kld-text');
      mood.type = 'text';
      mood.placeholder = 'Optional: "short", "no isekai", "dark and gritty"';
      mood.value = moodText;
      mood.addEventListener('input', () => { moodText = mood.value; });
      body.append(mood);

      section(body, 'Pick a mode');
      const wrap = el('div', 'kld-modes');
      for (const m of MODES) {
        const disabled = m.animeOnly && cfg.type !== 'ANIME';
        const sel = !ready && !disabled && cfg.mode === m.id;
        const b = el('button', 'kld-mode' + (sel ? ' sel' : ''));
        b.type = 'button';
        b.style.setProperty('--c', m.color);
        b.append(el('span', 'kld-dot'), labelBlock(m.title, disabled ? 'Anime only' : m.hint), el('span', 'kld-go', sel ? '✓' : ''));
        if (disabled) b.disabled = true;
        b.addEventListener('click', () => {
          cfg.mode = m.id; save();
          ready = null;
          lastStatus = null;
          if (m.id === 'airing') getAiring().p.catch(() => { /* reported when you copy */ });
          render();
        });
        wrap.append(b);
      }
      body.append(wrap);

      buildChanges(body);
    }

    function buildChanges(body) {
      section(body, 'Changes since last prompt');
      const card = el('div', 'kld-lastcard');
      body.append(card);
      const user = getUsername();
      if (!user) { card.append(el('span', 'kld-hint', 'Open your profile once, or set your username in Settings, to track changes.')); return; }
      const snap = getSnap(user, cfg.type);
      if (!snap) {
        card.append(el('span', 'kld-hint', 'Nothing to compare yet. Copy, Save or Share a prompt and changes are tracked from then.'));
        return;
      }
      card.append(labelBlock(snap.label || 'Last prompt', (snap.how || 'copied') + ' ' + ago(snap.at)));
      const box = el('div', 'kld-upd');
      card.append(box);
      const lc = getList(user, cfg.type);
      if (!lc.data) {
        box.append(el('span', 'kld-hint', 'Checking your list for changes…'));
        lc.p.then(() => { if (cfg.tab === 'rec') softRender(); }, () => { /* error shown elsewhere */ });
      } else {
        const changes = computeChanges(snap, cfg.type, lc.data);
        if (!changes.length) box.append(el('span', 'kld-hint', 'No changes since then.'));
        else {
          const ul = el('div', 'kld-chg');
          const COLORS = { '+': '#68D639', '−': '#E85D75', '↑': ACCENT };
          const shown = changesOpen ? changes : changes.slice(0, 5);
          for (const c of shown) {
            const line = el('div');
            const sign = el('span', 'kld-sign', c.sign);
            sign.style.color = COLORS[c.sign];
            line.append(sign, el('span', 'kld-ct', c.title), el('span', 'kld-cd', ' · ' + c.detail));
            ul.append(line);
          }
          if (changes.length > 5) {
            // collapsed by default; tap to show every change, tap again to collapse
            const more = changes.length - 5;
            const t = el('button', 'kld-more', changesOpen ? 'Show less ▴' : '+ ' + more + ' more change' + (more === 1 ? '' : 's') + ' ▾');
            t.type = 'button';
            t.setAttribute('aria-expanded', String(changesOpen));
            t.addEventListener('click', () => { changesOpen = !changesOpen; render(); });
            ul.append(t);
          }
          box.append(ul);
        }
      }
      const ta = el('textarea', 'kld-text');
      ta.placeholder = 'Optional feedback: "loved Caiman, more like him"';
      ta.value = updateNote;
      ta.addEventListener('input', () => { updateNote = ta.value; });
      box.append(ta);
      const h = el('span', 'kld-hint', 'Tap Update to turn these into an update prompt, then paste it into the same Claude chat as your last prompt.');
      h.style.marginTop = '8px';
      box.append(h);
    }

    // ---------------- Footer: Copy / Update / Save / Share ----------------
    const ICONS = {
      copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
      update: '<path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4v7h-7"/>',
      save: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
      share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
    };
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

    function buildFoot() {
      footEl.textContent = '';
      footEl.style.display = cfg.tab === 'rec' ? '' : 'none';
      if (cfg.tab !== 'rec') return;
      const r = el('div', 'kld-ready');
      const mode = currentMode();
      if (ready && ready.kind === 'update') {
        r.append('Ready: ', el('b', null, 'Update'), ' · ' + (ready.changes.length ? plural(ready.changes.length, 'change') : 'feedback only'));
      } else if (mode) {
        r.append('Ready: ', el('b', null, mode.title));
      } else r.append('Pick a mode above');
      const row = el('div', 'kld-actions');
      const canSend = !!(ready || mode);
      for (const [id, text] of [['copy', 'Copy'], ['update', 'Update'], ['save', 'Save'], ['share', 'Share']]) {
        const b = el('button', 'kld-act' + (id === 'copy' ? ' primary' : ''));
        b.type = 'button';
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[id] + '</svg>';
        b.append(el('span', null, text));
        if (id !== 'update' && !canSend) b.disabled = true;
        b.addEventListener('click', () => (id === 'update' ? runUpdate(b) : act(id, b)));
        row.append(b);
      }
      footEl.append(r, row);
      statusLine(footEl);
    }

    // The prompt that's ready right now: the selected mode's, or the update you built with Update.
    async function promptText() {
      if (ready && ready.kind === 'update') {
        const note = ready.note !== null ? ready.note : updateNote.trim();
        return {
          text: buildUpdatePrompt(ready.list, ready.changes, note, ready.type !== 'MANGA'),
          user: ready.user, type: ready.type, list: ready.list, label: ready.label, note, update: true,
          what: 'update prompt (' + (ready.changes.length ? plural(ready.changes.length, 'change') : 'feedback only') + ')',
        };
      }
      const mode = currentMode();
      if (!mode) throw new Error('Pick a mode first.');
      const user = getUsername();
      if (!user) throw new Error('Couldn\'t find a username. Open your profile once, or set it in Settings.');
      const type = cfg.type;
      const lc = getList(user, type);
      const ac = mode.id === 'airing' ? getAiring() : null;
      let list = lc.data;
      let airing = ac ? ac.data : null;
      if (!list || (ac && !airing)) {
        say('Loading ' + user + '\'s list…', 'wait');
        list = await lc.p;
        if (ac) { say('Loading what\'s airing…', 'wait'); airing = await ac.p; }
        updateSub();
      }
      return {
        text: buildPrompt(mode.id, user, type, list, airing), user, type, list, label: mode.title,
        what: mode.title + ' prompt with ' + list.length + ' ' + noun(),
      };
    }

    function fileName(p) {
      const d = new Date();
      const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return ('Kaleidoscope prompt - ' + p.label + (p.update ? ' update' : '') + (p.type === 'MANGA' ? ' (manga)' : '') + ' - ' + day + '.txt').replace(/[\\/:*?"<>|]/g, '');
    }

    // Is everything the selected mode needs already loaded? (Starts loading it if not.)
    function loadedNow() {
      if (ready) return true;
      const mode = currentMode();
      const user = getUsername();
      if (!mode || !user) return true; // promptText() explains what's missing
      const lc = getList(user, cfg.type);
      const ac = mode.id === 'airing' ? getAiring() : null;
      if (lc.data && (!ac || ac.data)) return true;
      Promise.all([lc.p, ac && ac.p]).then(() => { updateSub(); say('List loaded. Tap Share again.'); }, e => say(e.message, 'err'));
      return false;
    }

    async function act(how, button) {
      if (busy) return;
      // Android only opens the share sheet right after a tap, so don't make Share wait on AniList.
      if (how === 'share' && !loadedNow()) return say('Still loading your list. Tap Share again in a moment.', 'wait');
      busy = true;
      button.classList.add('busy');
      try {
        await runAction(how);
      } finally {
        busy = false;
        button.classList.remove('busy');
      }
    }

    async function runAction(how) {
      let p;
      try { p = await promptText(); } catch (e) {
        console.error('[Kaleidoscope Mobile]', e);
        return say(e.message || 'Couldn\'t build the prompt.', 'err');
      }
      GM_setClipboard(p.text, 'text'); // Copy, Save and Share all leave it on your clipboard

      let msg;
      let kind = '';
      if (how === 'copy') msg = 'Copied: ' + p.what + '.';
      else if (how === 'save') {
        const name = fileName(p);
        const url = URL.createObjectURL(new Blob([p.text], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.append(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
        msg = 'Saved ' + name + ' (also copied to your clipboard).';
      } else {
        [msg, kind] = await share(p);
      }

      // This is the new starting point for "Changes since last prompt".
      setSnap(p.user, p.type, p.list, p.label, how === 'copy' ? 'copied' : how === 'save' ? 'saved' : 'shared');
      if (p.update && ready && ready.note === null) { ready.note = p.note; updateNote = ''; }
      lastStatus = { msg, kind };
      render();
    }

    // Android's share sheet, so the prompt can go straight to the Claude app.
    async function share(p) {
      if (!navigator.share) return ['Sharing isn\'t available in this browser, so it\'s on your clipboard instead.', 'err'];
      try {
        await navigator.share({ title: 'Kaleidoscope prompt - ' + p.label, text: p.text });
        return ['Shared: ' + p.what + '. It\'s on your clipboard too.'];
      } catch (e) {
        if (e && e.name === 'AbortError') return ['Share closed. The prompt is still on your clipboard.'];
        console.error('[Kaleidoscope Mobile] share failed', e);
        return ['Couldn\'t open the share sheet, so it\'s on your clipboard instead.', 'err'];
      }
    }

    // Update: get your list fresh, then build an update prompt from what changed since your last Copy, Save or Share.
    async function runUpdate(button) {
      if (busy) return;
      const user = getUsername();
      if (!user) return say('Couldn\'t find a username. Open your profile once, or set it in Settings.', 'err');
      const type = cfg.type;
      busy = true;
      button.classList.add('busy');
      say('Getting your latest list…', 'wait');
      let list;
      try {
        list = await getList(user, type, true).p;
        if (type === 'ANIME' && cfg.mode === 'airing') { cache.airing = null; await getAiring().p; }
      } catch (e) {
        console.error('[Kaleidoscope Mobile]', e);
        return say(e.message || 'Couldn\'t load your list.', 'err');
      } finally {
        busy = false;
        button.classList.remove('busy');
      }
      sequelResult = null;
      const n = list.length + ' ' + noun();
      const snap = getSnap(user, type);
      if (!snap) {
        ready = null;
        lastStatus = { msg: 'Refreshed: ' + n + '. Nothing to compare with yet, so changes are tracked from your next Copy, Save or Share.' };
        return render();
      }
      const changes = computeChanges(snap, type, list);
      if (!changes.length && !updateNote.trim()) {
        ready = null;
        lastStatus = { msg: 'Refreshed: ' + n + '. Nothing changed since your last prompt. Add feedback to make an update anyway.' };
        return render();
      }
      ready = { kind: 'update', user, type, list, changes, label: snap.label || 'Recommendations', note: null };
      lastStatus = { msg: 'Update ready' + (changes.length ? ': ' + plural(changes.length, 'change') : ' with your feedback') + '. Copy, Save or Share it.' };
      render();
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
          say(e.message || 'Something went wrong. Try again in a moment.', 'err');
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
      segRow(body, [['left', 'Bottom left'], ['right', 'Bottom right'], ['off', 'Hidden']], () => cfg.btnPos, v => {
        cfg.btnPos = v; save(); placeButton(); render();
      });
      body.append(el('span', 'kld-hint', 'The small ✦ button. You can always open Kaleidoscope Mobile from the Tampermonkey menu too.'));

      section(body, 'Your AniList username');
      const u = el('input', 'kld-text');
      u.type = 'text';
      u.placeholder = 'Filled in when Kaleidoscope spots it';
      u.autocapitalize = 'off';
      u.spellcheck = false;
      u.value = cfg.lastUser || '';
      u.addEventListener('change', () => { cfg.lastUser = u.value.trim().replace(/^@/, ''); save(); updateSub(); });
      body.append(u);
      const uh = el('span', 'kld-hint', 'Used when the page doesn\'t show whose list to load. On someone\'s profile, their list is used instead.');
      uh.style.marginTop = '6px';
      body.append(uh);

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
        () => cfg.appearance === 'auto', v => { cfg.appearance = v ? 'auto' : (isDark() ? 'dark' : 'light'); save(); applyLook(); render(); });

      body.append(el('div', 'kld-note',
        'Works on any profile: open someone\'s page and Kaleidoscope uses their list. Copy, Save and Share all put the prompt on your clipboard. ' +
        'This is separate from desktop Kaleidoscope: its own settings, its own change tracking, and no connection to Claude.'));
    }

    function render() {
      if (!panelEl) return;
      renderPending = false;
      const keepScroll = bodyEl.scrollTop;
      bodyEl.textContent = '';
      statusEl = null;
      for (const b of panelEl.querySelectorAll('.kld-tab')) b.classList.toggle('on', b.dataset.tab === cfg.tab);
      if (cfg.tab === 'seq') buildSequels(bodyEl);
      else if (cfg.tab === 'set') buildSettings(bodyEl);
      else buildRec(bodyEl);
      buildFoot();
      bodyEl.scrollTop = keepScroll;
      updateSub();
    }

    let oldOverflow = '';
    function open() {
      if (panelEl) return;
      backdropEl = el('div');
      backdropEl.id = 'kaleidoscope-backdrop';
      backdropEl.addEventListener('click', close);

      panelEl = el('div');
      panelEl.id = 'kaleidoscope-panel';
      panelEl.setAttribute('role', 'dialog');
      panelEl.setAttribute('aria-label', 'Kaleidoscope Mobile');

      const head = el('div', 'kld-head');
      const t = el('div');
      const title = el('div', 'kld-title');
      const word = el('span', null, 'Kaleido');
      word.append(el('b', null, 'scope'));
      title.append(word, el('span', 'kld-tag', 'Mobile'));
      subEl = el('div', 'kld-sub');
      t.append(title, el('div', 'kld-tagline', 'AI recommendation prompts from your list'));
      const x = el('button', 'kld-x'); x.append(gwCloseIcon());
      x.type = 'button';
      x.title = 'Close';
      x.setAttribute('aria-label', 'Close');
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
      footEl = el('div', 'kld-foot');
      const footLine = el('div', 'kld-footline', 'Open from \u2726 or the Tampermonkey menu \u00b7 v' + VERSION);
      panelEl.append(el('div', 'kld-grab'), head, ctx, tabs, bodyEl, footEl, footLine);
      // keep AniList's keyboard shortcuts from firing while you type in the menu; Esc closes it
      for (const type of ['keydown', 'keypress', 'keyup']) panelEl.addEventListener(type, e => {
        if (type === 'keydown' && e.key === 'Escape') close();
        e.stopPropagation();
      });
      root.append(backdropEl, panelEl);
      applyLook();
      oldOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden'; // the page behind doesn't scroll while the menu is open
      lastStatus = null;
      toggleBtn.classList.add('open');
      try {
        render();
        preload();
      } catch (e) {
        console.error('[Kaleidoscope Mobile]', e);
        bodyEl.textContent = '';
        bodyEl.append(el('div', 'kld-info', 'Something broke while drawing the menu: ' + (e && e.message) + '. Try reloading the page.'));
      }
    }

    function close() {
      if (!panelEl) return;
      panelEl.remove();
      if (backdropEl) backdropEl.remove();
      panelEl = bodyEl = footEl = backdropEl = subEl = statusEl = null;
      document.documentElement.style.overflow = oldOverflow;
      toggleBtn.classList.remove('open');
    }

    const toggleBtn = el('button', null, '✦');
    toggleBtn.id = 'kaleidoscope-toggle';
    toggleBtn.type = 'button';
    toggleBtn.title = 'Kaleidoscope Mobile';
    toggleBtn.setAttribute('aria-label', 'Kaleidoscope Mobile');
    toggleBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (panelEl) close(); else open();
    });
    root.append(toggleBtn);
    // Bottom left by default: AniList's own phone menu button sits bottom right.
    function placeButton() {
      toggleBtn.classList.toggle('right', cfg.btnPos === 'right');
      toggleBtn.style.display = cfg.btnPos === 'off' ? 'none' : '';
    }
    placeButton();

    if (typeof GM_registerMenuCommand === 'function') {
      try { GM_registerMenuCommand('Open Kaleidoscope Mobile', open); } catch (e) { /* ignore */ }
    }
    console.log('[Kaleidoscope Mobile] ' + ((typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '') + ' loaded.');
  }
})();
