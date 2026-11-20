// Script icons: dark glass tiles with a tinted body, a lit rim and glass-tube glyphs.
// Renders assets/icons/<script>.png at 512px (scale them down to 256 afterwards).
//   node tools/icons.js            (every icon)
//   node tools/icons.js <script>   (one; tools/new_script.py uses this)
const { chromium } = require('playwright');
const path = require('path');

const T = { x: 7, y: 7, s: 86, r: 21 };   // tile inside a 100x100 canvas (room for the outer glow)
const tilePath = `M${T.x + T.r} ${T.y}H${T.x + T.s - T.r}Q${T.x + T.s} ${T.y} ${T.x + T.s} ${T.y + T.r}V${T.y + T.s - T.r}Q${T.x + T.s} ${T.y + T.s} ${T.x + T.s - T.r} ${T.y + T.s}H${T.x + T.r}Q${T.x} ${T.y + T.s} ${T.x} ${T.y + T.s - T.r}V${T.y + T.r}Q${T.x} ${T.y} ${T.x + T.r} ${T.y}Z`;

// A glass tube: soft colored glow, translucent body, bright core.
function tube(d, { glow, w = 4.2, core = 1.5, fill = 0 }) {
  const W = w * 1.25;
  return `
  ${fill ? `<path d="${d}" fill="#fff" fill-opacity="${fill}" stroke="none"/>` : ''}
  <path d="${d}" fill="none" stroke="${glow}" stroke-width="${W + 2.6}" stroke-opacity=".42" stroke-linecap="round" stroke-linejoin="round" filter="url(#bloom)"/>
  <path d="${d}" fill="none" stroke="#fff" stroke-opacity=".98" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="url(#tubeBody)" stroke-width="${W - 1.7}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="${Math.max(.6, core * .55)}" stroke-linecap="round" stroke-linejoin="round" transform="translate(-.35 -.45)"/>`;
}

function icon({ a, b, deep, rimA, rimB, glow, glyph }, part = 'all') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 100">
<defs>
  <linearGradient id="tint" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
  <radialGradient id="depth" cx="55" cy="62" r="48" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${deep}" stop-opacity=".78"/><stop offset="1" stop-color="${deep}" stop-opacity="0"/></radialGradient>
  <linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${rimA}"/><stop offset=".3" stop-color="#fff" stop-opacity=".5"/>
    <stop offset=".55" stop-color="${rimA}" stop-opacity=".25"/><stop offset="1" stop-color="${rimB}"/></linearGradient>
  <linearGradient id="tubeBody" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${rimA}" stop-opacity=".95"/><stop offset=".55" stop-color="${glow}" stop-opacity=".7"/><stop offset="1" stop-color="${rimB}" stop-opacity=".85"/></linearGradient>
  <filter id="edgeGlow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3.2"/></filter>
  <filter id="outer" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.6"/></filter>
  <filter id="bloom" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.6"/></filter>
  <clipPath id="clip"><path d="${tilePath}"/></clipPath>
</defs>
${part === 'glyph' ? '' : `<path d="${tilePath}" fill="none" stroke="${glow}" stroke-width="2.4" stroke-opacity=".55" filter="url(#outer)"/>
<g clip-path="url(#clip)">
  <rect width="100" height="100" fill="#0b0b16"/>
  <rect width="100" height="100" fill="url(#tint)" opacity=".66"/>
  <rect width="100" height="100" fill="url(#depth)"/>
  <path d="${tilePath}" fill="none" stroke="${glow}" stroke-width="7" stroke-opacity=".55" filter="url(#edgeGlow)"/>
  <rect width="100" height="100" fill="url(#top)"/>
  <path d="M10 76 L76 10 L88 10 L10 88 Z" fill="#fff" fill-opacity=".045"/>
  <path d="M28 96 L96 28 L96 36 L36 96 Z" fill="#fff" fill-opacity=".03"/>
</g>
<path d="${tilePath}" fill="none" stroke="url(#rim)" stroke-width="1.5"/>
<path d="${tilePath}" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width=".6" transform="translate(50 50) scale(.965) translate(-50 -50)"/>`}
${part === 'tile' ? '' : glyph}
</svg>`;
}

// ---------- glyphs (centered in the tile, ~40 units across) ----------
// ---------- the family style (Molten for Discord's): warm glass bodies and lava that's part of the shape ----------
// a body tube in its own gradient (ids are per icon, one icon per document)
const hot = (d, g, stops, opts = {}) => `<defs><linearGradient id="hot" x1="25" y1="28" x2="74" y2="74" gradientUnits="userSpaceOnUse">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient></defs>`
  + tube(d, Object.assign({ glow: g, w: 4, core: 1.5, fill: .07 }, opts)).replace('url(#tubeBody)', 'url(#hot)');
const drop = (x, y, r, c, glow) => `<circle cx="${x}" cy="${y}" r="${(r * 1.7).toFixed(2)}" fill="${glow || c}" fill-opacity=".5" filter="url(#bloom)"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
const blob = (d, c, glow, op = 1) => `<path d="${d}" fill="${glow}" fill-opacity=".5" filter="url(#bloom)"/><path d="${d}" fill="${c}" fill-opacity="${op}"/>`;

// Molten Tools: the play button softening in the heat: its lower edge sags into one run, the bottom corner slumps
// into a heavy drip, three flames trail behind
const MT = 'M44.6 31.8 L67.4 45.8 C70.4 47.6 70.4 49.6 67.6 51.2 C64 53.4 61.6 55 59.6 56.6 C58.2 57.8 57.8 59.2 58 61.2 C58.3 64 54.8 64.6 54.6 61.8 C54.4 60.4 54 59.6 52.6 60 C49.6 61.4 47.6 63.4 46.8 66 C46.2 68.4 46.6 70.8 46.8 73 C47.1 77 41.8 77.6 41.6 73.6 C41.4 70.6 40.8 68 40.6 64 L40.6 35.4 C40.6 31.6 42.4 30.6 44.6 31.8 Z';
const glyph_molten_tools = g => `<g transform="translate(-2 -2.5)">${hot(MT, '#ff4d6d', [[0, '#fff2b8'], [.45, '#ffb347'], [1, '#ff3d6a']])}
</g>`;

// Molten for Reddit: the bubble's bottom edge sags into a small run, and the tail has melted into a heavy drop,
// hanging on by a thin neck; three beads for a reply being typed
const MR = 'M35 31 H65 Q71 31 71 37 V53.4 Q71 59.4 65 59.4 L44.6 60.3 C42.4 61.4 41.8 63.4 42 66.4 C42.3 70.0 41 72.6 38.6 73.6 C35.4 75.0 32.6 72.9 33.6 70.1 C34.6 67.6 37 65.7 37.4 63.1 C37.6 61.5 36.6 60.3 35 60.2 Q29 59.4 29 53.4 V37 Q29 31 35 31 Z';
const glyph_molten_for_reddit = g => `<g transform="translate(0 -3)">${hot(MR, '#ff7a40', [[0, '#fff0e0'], [.5, '#ffb48f'], [1, '#ff5a1f']])}${[41, 50, 59].map(x => drop(x, 45, 2.7, '#fff0e0', '#ffb347')).join('')}</g>`;

// Hourglass: lava for sand, falling through the neck and piling up; the heat softens the base, which sags into a run
const HGL = 'M36.5 34 C36.5 43 46.5 46 46.5 50 C46.5 54 36.5 57 36.5 66 M63.5 34 C63.5 43 53.5 46 53.5 50 C53.5 54 63.5 57 63.5 66';
const glyph_hourglass = g => `<g>
  <path d="M36.5 34 C36.5 43 46.5 46 46.5 50 C46.5 54 36.5 57 36.5 66 L63.5 66 C63.5 57 53.5 54 53.5 50 C53.5 46 63.5 43 63.5 34 Z" fill="#fff" fill-opacity=".07"/>
  <defs><linearGradient id="lava" x1="0" y1="36" x2="0" y2="66" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe08a"/><stop offset=".55" stop-color="#ff9f43"/><stop offset="1" stop-color="#ff5e7e"/></linearGradient></defs>
  ${blob('M41.2 39.4 C44 39 46 40.4 50 39.6 C54 40.4 56 39 58.8 39.4 C57.6 43.6 52 45.6 50 48.4 C48 45.6 42.4 43.6 41.2 39.4 Z', 'url(#lava)', '#ff9f43')}
  ${drop(50, 51.6, 1.15, '#ffb347', '#ff9f43')}${drop(50, 54.8, .85, '#ff9f43', '#ff7a3d')}
  ${blob('M40.6 63.6 C41.4 60.2 44 58.6 46.6 59.6 C47.8 57.4 52 57 53.6 59.2 C56 58.4 58.6 60.2 59.4 63.6 Z', 'url(#lava)', '#ff7a3d')}
  ${tube(HGL, { glow: g, w: 3.6, core: 1.3 })}
  ${tube('M32 31 H68 M32 69 H68', { glow: g, w: 4.6, core: 1.7 })}</g>`;

// Looking-Glass: a video with its play button behind the lens; the ring softens at the bottom into a run, and the
// handle's end droops and drips
const glyph_looking_glass = g => `<g>
  <defs><radialGradient id="lens" cx="40" cy="40" r="18" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></radialGradient>
    <clipPath id="lensClip"><circle cx="45" cy="45" r="13.2"/></clipPath>
    <linearGradient id="vid" x1="34" y1="36" x2="56" y2="56" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff7ab6"/><stop offset="1" stop-color="#7a5cff"/></linearGradient></defs>
  <circle cx="45" cy="45" r="15" fill="url(#lens)"/>
  <g clip-path="url(#lensClip)">
    <rect x="31" y="35.5" width="28" height="19" rx="4.5" fill="url(#vid)" fill-opacity=".55"/>
    <path d="M41.6 39.6 Q41.6 37.8 43.2 38.7 L51 43.6 Q52.6 44.6 51 45.6 L43.2 50.5 Q41.6 51.4 41.6 49.6 Z" fill="#fff" fill-opacity=".95"/>
  </g>
  <path d="M35.6 40.6 A10 10 0 0 1 41.6 34.2" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="2" stroke-linecap="round"/>
  ${tube('M45 30 A15 15 0 1 1 44.99 30 Z', { glow: g, w: 4.2, core: 1.5 })}
  ${tube('M56.2 56.2 L69 69', { glow: g, w: 5.6, core: 2 })}</g>`;

// Prism: white light meets the glass and stops at its face, crosses it faintly, and leaves the far face as a spectrum;
// the heat sags the base into a run and slumps one bottom corner
const SPEC = ['#ff4d5e', '#ff9f43', '#ffe066', '#5ee38a', '#4dabff', '#9b6bff'];
const glyph_prism = g => {
  const ex = [59.4, 47.4], rays = SPEC.map((c, i) => {
    const d = `M${ex[0] + i * .3} ${ex[1] + i * .55} L81 ${36.5 + i * 5.2}`;
    return `<path d="${d}" stroke="${c}" stroke-width="3.8" stroke-opacity=".45" stroke-linecap="round" filter="url(#bloom)"/><path d="${d}" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`;
  }).join('');
  const beam = 'M17 58.6 L37.9 52';
  const body = 'M50 31 L70 65.6 H30 Z';
  return `<defs><linearGradient id="inside" x1="38" y1="52" x2="60" y2="48" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity=".2"/></linearGradient></defs>
  <g>${rays}
  <path d="M37.9 51.4 L59.4 47.2 L60.4 50.6 L37.9 52.6 Z" fill="url(#inside)"/>
  <path d="${beam}" stroke="#fff" stroke-width="5.2" stroke-opacity=".5" stroke-linecap="round" filter="url(#bloom)"/><path d="${beam}" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
  ${tube(body, { glow: g, w: 4, core: 1.5, fill: .09 })}</g>`;
};

// Kaleidoscope: the gem with softly colored facets and plain spokes; its bottom point softens and runs
const glyph_kaleidoscope = g => {
  const r = 23, pts = [...Array(6)].map((_, i) => { const t = Math.PI / 3 * i - Math.PI / 2; return [50 + r * Math.cos(t), 50 + r * Math.sin(t)]; });
  const F = p => p.map(v => v.toFixed(2)).join(' ');
  const tints = ['#ff7eb6', '#ffc94d', '#4fe0b0', '#5cb6ff', '#b48cff', '#ff9f6b'];
  const facets = pts.map((p, i) => `<path d="M50 50 L${F(p)} L${F(pts[(i + 1) % 6])} Z" fill="${tints[i]}" fill-opacity=".45"/>`).join('');
  const spokes = pts.map(p => `M50 50 L${F(p)}`).join(' ');
  const hex = 'M' + pts.map(F).join(' L') + ' Z';
  const tip = 'M50 73 C50 74.4 50 75.6 50 76.6';
  return `<g>${facets}${tube(spokes, { glow: g, w: 1.8, core: .8 })}${tube(hex, { glow: g, w: 3.4, core: 1.3 })}</g>`;
};

// a lava blob leaning forward: flame-like flicks sweep back off its left side, lava drips in two humps
// underneath, two drops trail behind in clear space; drawn in the other Moltens' colors (Molten for
// Reddit's orange into Molten Tools' red) so it reads as part of the family on Discord's purple
const MFD_BLOB = 'M55 30 C65.5 30 73 38 73 48.5 C73 56.5 68.8 62.6 63.6 65.2 C62.6 66.2 62.4 67.8 62.8 70 C63.4 73 59.2 73.8 59 71 C58.8 69.2 58 67.6 56.4 67.2 C55.4 67.6 54.8 68.6 54.8 70.2 C54.8 72.6 51.6 72.6 51.4 70.4 C51.3 69 51 67.8 50.2 67 C47 67 41.5 63.5 38.5 58.5 C34.5 59.6 29.5 59 25.5 55.5 C30 55.4 33.6 53.8 35.6 51.4 C31.6 50 27.6 46.8 25.4 42.4 C29.4 43.6 33 43.4 35.8 42 C34 38.6 31.4 35.6 29.6 31.4 C33.6 33.2 37.2 34.2 40.4 34.2 C44 31.4 49 30 55 30 Z';
const glyph_molten_for_discord = (g) => {
  const eye = x => `<circle cx="${x}" cy="47.5" r="4.6" fill="${g}" fill-opacity=".45" filter="url(#bloom)"/><ellipse cx="${x}" cy="47.5" rx="2.9" ry="3.6" fill="#fff"/>`;
  const drop = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r * 1.6}" fill="${g}" fill-opacity=".5" filter="url(#bloom)"/><circle cx="${x}" cy="${y}" r="${r}" fill="#ffb48f"/>`;
  const body = tube(MFD_BLOB, { glow: g, w: 4, core: 1.5, fill: .06 }).replace('url(#tubeBody)', 'url(#hotTube)');
  return `<defs><linearGradient id="hotTube" x1="25" y1="30" x2="72" y2="72" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffb48f"/><stop offset=".5" stop-color="#ff4500"/><stop offset="1" stop-color="#ff0033"/></linearGradient></defs>
  <g transform="translate(1.5 -2) rotate(-10 50 50)">${body}${eye(53)}${eye(63.5)}${drop(18, 34, 1.9)}${drop(15, 43.5, 1.3)}</g>`;
};

const HG = { a: '#8f63ff', b: '#4a1fa8', deep: '#14082e', rimA: '#d2c2ff', rimB: '#f09bff', glow: '#a985ff', glyph: glyph_hourglass('#a985ff') };
const ICONS = {
  'hourglass':         icon({ a: '#8f63ff', b: '#4a1fa8', deep: '#14082e', rimA: '#d2c2ff', rimB: '#f09bff', glow: '#a985ff', glyph: glyph_hourglass('#a985ff') }),
  'kaleidoscope':      icon({ a: '#2f7dff', b: '#1a3a9c', deep: '#06112e', rimA: '#a9d1ff', rimB: '#7fd6ff', glow: '#5aa2ff', glyph: glyph_kaleidoscope('#5aa2ff') }),
  'looking-glass':     icon({ a: '#3a8bff', b: '#1d3f9e', deep: '#07122f', rimA: '#b4d6ff', rimB: '#a3b8ff', glow: '#5c9dff', glyph: glyph_looking_glass('#5c9dff') }),
  'molten-for-reddit': icon({ a: '#ff4500', b: '#c23500', deep: '#3a0f00', rimA: '#ffb48f', rimB: '#ff7a40', glow: '#ff4500', glyph: glyph_molten_for_reddit('#ff4500') }),   // Reddit's orange-red, #FF4500
  'molten-tools':      icon({ a: '#ff0033', b: '#c20027', deep: '#3a0010', rimA: '#ff9db0', rimB: '#ff4d6d', glow: '#ff0033', glyph: glyph_molten_tools('#ff0033') }),   // YouTube's red, #FF0033
  'prism':             icon({ a: '#8b5cf6', b: '#2b48b8', deep: '#0c0a2a', rimA: '#d6c6ff', rimB: '#9ec2ff', glow: '#9a7dff', glyph: glyph_prism('#9a7dff') }),
  "molten-for-discord": icon({ a: '#5865f2', b: '#a3249e', deep: '#120a2e', rimA: '#c9ceff', rimB: '#ff8ae6', glow: '#7d88ff', glyph: glyph_molten_for_discord('#ff4500') }),
};
ICONS['molten-for-reddit-mobile'] = ICONS['molten-for-reddit'];
ICONS['kaleidoscope-mobile'] = ICONS['kaleidoscope'];
// Hourglass's block screen flips the glyph on its own layer, so it also gets the two halves.
ICONS['parts/hourglass-tile'] = icon(HG, 'tile');
ICONS['parts/hourglass-glyph'] = icon(HG, 'glyph');

(async () => {
  const out = path.join(__dirname, '..', 'assets', 'icons');
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  const only = process.argv.slice(2);   // node tools/icons.js <name> draws just that one
  for (const [k, svg] of Object.entries(ICONS)) {
    if (only.length && !only.includes(k)) continue;
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await p.locator('svg').first().screenshot({ path: path.join(out, `${k}.png`), omitBackground: true });
  }
  await b.close();
})();
