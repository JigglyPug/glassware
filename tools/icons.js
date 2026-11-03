// Render one PNG icon per script (256px, downsized later) from inline SVG.
const { chromium } = require('playwright');
const glyph = (paths, sw = 1.9) => `<g fill="none" stroke="#fff" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${paths.map(d => `<path d="${d}"/>`).join('')}</g>`;
const PRISM = ['M12 3.5 21 19.5H3Z', 'M2 13.2 11 12.2', 'M13.5 11.6 22 8.5', 'M13.6 12.3 22 12.6'];
const GLASS = ['M6 2.5h12', 'M6 21.5h12', 'M7.5 2.5v3c0 2.4 1.9 3.9 4.5 6.5-2.6 2.6-4.5 4.1-4.5 6.5v3', 'M16.5 2.5v3c0 2.4-1.9 3.9-4.5 6.5 2.6 2.6 4.5 4.1 4.5 6.5v3', 'M9.5 19h5'];
const MIRROR = ['M12 2.5c3.3 0 6 3 6 6.8s-2.7 6.7-6 6.7-6-3-6-6.7 2.7-6.8 6-6.8Z', 'M12 16v5.5', 'M9.5 21.5h5', 'M9.3 7.2c.5-1.2 1.5-2 2.7-2.2'];
const PLAY = ['M9.5 7.8v8.4l7-4.2Z'];
const BUBBLE = ['M5 6.5h14a1.8 1.8 0 0 1 1.8 1.8v6.6a1.8 1.8 0 0 1-1.8 1.8h-7.2L8 19.8v-3.1H5a1.8 1.8 0 0 1-1.8-1.8V8.3A1.8 1.8 0 0 1 5 6.5Z'];
// six-fold rosette: hexagram + center
const ROSETTE = ['M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4Z', 'M12 2.8v18.4', 'M4 7.4l16 9.2', 'M20 7.4 4 16.6'];
function tile(id, bg, inner, extra = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 24 24">
<defs>${bg.defs}<clipPath id="r"><rect x="1" y="1" width="22" height="22" rx="5.6"/></clipPath>
<linearGradient id="hi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<g clip-path="url(#r)">${bg.fill}<rect x="1" y="1" width="22" height="22" fill="url(#hi)"/>${extra}</g>
<rect x="1.25" y="1.25" width="21.5" height="21.5" rx="5.4" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width=".5"/>
<g transform="translate(12 12) scale(.62) translate(-12 -12)">${inner}</g></svg>`;
}
const lin = (a, b) => ({ defs: `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`, fill: `<rect width="24" height="24" fill="url(#g)"/>` });
const lava = { defs: `<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>`,
  fill: `<rect width="24" height="24" fill="#1a0f0c"/><g filter="url(#b)"><circle cx="6" cy="6" r="7" fill="#ff6a1f"/><circle cx="19" cy="9" r="6" fill="#ff2d6f"/><circle cx="10" cy="20" r="7" fill="#ffb23d"/><circle cx="20" cy="21" r="5" fill="#7a2cff"/></g>` };
const ICONS = {
  'prism': tile('prism', lin('#6d9bf5', '#2f5fc4'), glyph(PRISM, 1.8)),
  'hourglass': tile('hourglass', lin('#8a8af5', '#4b4bc4'), glyph(GLASS, 1.9)),
  'looking-glass': tile('looking-glass', lin('#6d9bf5', '#2f5fc4'), glyph(MIRROR, 1.9)),
  'molten-tools': tile('molten-tools', lava, `<g fill="#fff">${PLAY.map(d => `<path d="${d}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>`).join('')}</g>`),
  'molten-for-reddit': tile('molten-for-reddit', lava, glyph(BUBBLE, 1.9)),
  'kaleidoscope': tile('kaleidoscope', lin('#5cc8ff', '#2a6fdb'), (() => {
    const c = [12, 12], r = 9.2, pts = [...Array(6)].map((_, i) => { const a = (Math.PI / 3) * i - Math.PI / 2; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; });
    const wedges = pts.map((p, i) => { const q = pts[(i + 1) % 6]; return `<path d="M12 12L${p[0].toFixed(2)} ${p[1].toFixed(2)}L${q[0].toFixed(2)} ${q[1].toFixed(2)}Z" fill="#fff" fill-opacity="${i % 2 ? 0.12 : 0.72}"/>`; }).join('');
    return wedges + glyph(ROSETTE, 1.3) + '<circle cx="12" cy="12" r="1.5" fill="#fff"/>';
  })()),
};
ICONS['molten-for-reddit-mobile'] = ICONS['molten-for-reddit'];
ICONS['kaleidoscope-mobile'] = ICONS['kaleidoscope'];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 256, height: 256 } });
  for (const [k, svg] of Object.entries(ICONS)) {
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await p.locator('svg').first().screenshot({ path: require('path').join(__dirname, '..', 'assets', 'icons', `${k}.png`), omitBackground: true });
  }
  await b.close();
})();
