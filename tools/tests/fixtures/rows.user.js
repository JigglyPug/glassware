// ==UserScript==
// @name         audit rows fixture
// @namespace    glassware-tests
// @version      1
// @match        *://*/*
// @grant        none
// ==/UserScript==
// A panel for tools/tests/audit.py's self-test: rows that don't fill their width (a day picker that hugs the left,
// two columns of stats whose right column hugs its left edge) and the same rows done right. ?good shows only the
// right ones; the bad ones must be flagged, the good ones must not.
const go = () => {
    const good = location.search.includes('good');
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;top:16px;right:16px;width:340px;box-sizing:border-box;padding:18px;background:#222;color:#fff;font:14px sans-serif;border-radius:22px';
    const days = n => Array.from({ length: n }, (_, i) => `<button style="height:44px;border:0;border-radius:12px;width:${good ? 'auto' : '30px'}">${'MTWTFSS'[i]}</button>`).join('');
    const stats = ['4 visits', '5m', '1h', '2:16 AM'].map((t, i) => `<div style="display:flex;flex-direction:column;${good && i % 2 ? 'align-items:flex-end;text-align:right' : ''}"><b>${t}</b><span>label</span></div>`).join('');
    p.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px"><div class="days" style="display:grid;grid-template-columns:repeat(7,${good ? 'minmax(0,1fr)' : '30px'});gap:6px;${good ? 'flex:1 1 100%' : ''}">${days(7)}</div><div style="flex:1 1 100%">Thursday</div></div>
        <div class="stats" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">${stats}</div>`;
    document.body.append(p);
};
if (document.body) go(); else document.addEventListener("DOMContentLoaded", go);
