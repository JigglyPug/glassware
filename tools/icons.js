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
const hourglass = (g) => `
  <path d="M36.5 34 C36.5 43 46.5 46 46.5 50 C46.5 54 36.5 57 36.5 66 L63.5 66 C63.5 57 53.5 54 53.5 50 C53.5 46 63.5 43 63.5 34 Z" fill="#fff" fill-opacity=".07"/>
  <path d="M41 38.5 L59 38.5 C57.5 43.5 51.5 45.5 50 48 C48.5 45.5 42.5 43.5 41 38.5 Z" fill="#fff" fill-opacity=".3"/>
  <path d="M41 63.5 C43 58.5 47 57.5 50 57.5 C53 57.5 57 58.5 59 63.5 Z" fill="#fff" fill-opacity=".34"/>
  ${tube('M36.5 34 C36.5 43 46.5 46 46.5 50 C46.5 54 36.5 57 36.5 66 M63.5 34 C63.5 43 53.5 46 53.5 50 C53.5 54 63.5 57 63.5 66', { glow: g, w: 3.6, core: 1.3 })}
  ${tube('M32 31 H68 M32 69 H68', { glow: g, w: 4.6, core: 1.7 })}`;

function gem(g) {
  const r = 23, pts = [...Array(6)].map((_, i) => { const t = Math.PI / 3 * i - Math.PI / 2; return [50 + r * Math.cos(t), 50 + r * Math.sin(t)]; });
  const P = p => p.map(v => v.toFixed(2)).join(' ');
  const shade = [['#ffffff', .5], ['#bfe6ff', .3], ['#5f8fff', .16], ['#c9a8ff', .24], ['#4f7cff', .12], ['#e6f6ff', .4]];
  const facets = pts.map((p, i) => `<path d="M50 50 L${P(p)} L${P(pts[(i + 1) % 6])} Z" fill="${shade[i][0]}" fill-opacity="${shade[i][1]}"/>`).join('');
  const hex = 'M' + pts.map(P).join(' L') + ' Z';
  const spokes = pts.map(p => `M50 50 L${P(p)}`).join(' ');
  return facets + tube(spokes, { glow: g, w: 1.8, core: .8 }) + tube(hex, { glow: g, w: 3.4, core: 1.3 });
}

const magnifier = (g) => `
  <defs><radialGradient id="lens" cx="40" cy="40" r="18" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity=".04"/></radialGradient></defs>
  <circle cx="45" cy="45" r="15" fill="url(#lens)"/>
  <path d="M36 41 A10 10 0 0 1 42 34.6" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="2" stroke-linecap="round"/>
  ${tube('M45 30 A15 15 0 1 1 44.99 30 Z', { glow: g, w: 4.2, core: 1.5 })}
  ${tube('M56.2 56.2 L69 69', { glow: g, w: 5.6, core: 2 })}`;

const bubble = (g) => tube('M33 31 H67 Q73 31 73 37 V55 Q73 61 67 61 H45 L36 69 V61 H33 Q27 61 27 55 V37 Q27 31 33 31 Z', { glow: g, w: 4, core: 1.5, fill: .07 });

const play = (g) => tube('M41 33.5 Q41 30 44 31.8 L67 46.3 Q70 48.2 67 50.1 L44 64.6 Q41 66.4 41 62.9 Z', { glow: g, w: 4, core: 1.5, fill: .07 });

const prism = (g) => `
  ${tube('M50 31 L70 66 H30 Z', { glow: g, w: 4, core: 1.5, fill: .07 })}
  ${tube('M24 59 L46 52.5', { glow: g, w: 2.6, core: 1.1 })}
  ${tube('M54 50 L77 43', { glow: g, w: 2.6, core: 1.1 })}`;

const HG = { a: '#8f63ff', b: '#4a1fa8', deep: '#14082e', rimA: '#d2c2ff', rimB: '#f09bff', glow: '#a985ff', glyph: hourglass('#c3a8ff') };
const ICONS = {
  'hourglass':         icon({ a: '#8f63ff', b: '#4a1fa8', deep: '#14082e', rimA: '#d2c2ff', rimB: '#f09bff', glow: '#a985ff', glyph: hourglass('#c3a8ff') }),
  'kaleidoscope':      icon({ a: '#2f7dff', b: '#1a3a9c', deep: '#06112e', rimA: '#a9d1ff', rimB: '#7fd6ff', glow: '#5aa2ff', glyph: gem('#8ec8ff') }),
  'looking-glass':     icon({ a: '#3a8bff', b: '#1d3f9e', deep: '#07122f', rimA: '#b4d6ff', rimB: '#a3b8ff', glow: '#5c9dff', glyph: magnifier('#9ec7ff') }),
  'molten-for-reddit': icon({ a: '#ff9a3d', b: '#a3249e', deep: '#2a0a1a', rimA: '#ffd08a', rimB: '#ff8ae6', glow: '#ff8a4a', glyph: bubble('#ffc27a') }),
  'molten-tools':      icon({ a: '#ff7a2e', b: '#7a2cd6', deep: '#2a0a1a', rimA: '#ffc37a', rimB: '#c9a2ff', glow: '#ff6a4a', glyph: play('#ffb07a') }),
  'prism':             icon({ a: '#8b5cf6', b: '#2b48b8', deep: '#0c0a2a', rimA: '#d6c6ff', rimB: '#9ec2ff', glow: '#9a7dff', glyph: prism('#c7b5ff') }),
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
