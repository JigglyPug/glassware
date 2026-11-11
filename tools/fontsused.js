// Which font files a panel's text was really drawn with (shot.js --drive tools/fontsused.js): for each
// font, how many glyphs and a few of the texts. Two machines whose screenshots differ show it here.
module.exports = async (page) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const doc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const out = {};
  const walk = async n => {
    if (n.nodeType === 3 && n.nodeValue.trim()) {
      try {
        const r = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: n.nodeId });
        for (const f of r.fonts) { const k = f.familyName + ' | ' + f.postScriptName; const o = out[k] = out[k] || { glyphs: 0, texts: [] }; o.glyphs += f.glyphCount; if (o.texts.length < 4 || r.fonts.length > 1) o.texts.push(n.nodeValue.trim().slice(0, 24)); }
      } catch (e) {}
    }
    for (const c of (n.children || [])) await walk(c);
    for (const c of (n.shadowRoots || [])) await walk(c);
    if (n.contentDocument) await walk(n.contentDocument);
  };
  await walk(doc.root);
  for (const k in out) out[k].texts = out[k].texts.slice(0, 8);
  return out;
};
