'use strict';

/* The 1988 source is the frozen docs/SNEEKIE.BAS. Fetch it at runtime (the
   service worker caches it, so offline still works) instead of carrying a
   base64 copy of it in this file. */

/* GW-BASIC tokenizer (tokenizeBasicLine) is shared — see js/site.js */

/* ---------- render ---------- */
const listing = document.getElementById('listing');
function renderListing(src){
  const lines = src.replace(/\n$/, '').split('\n').slice(10);
  const frag = document.createDocumentFragment();
  lines.forEach((line, idx) => {
    const row = document.createElement('div'); row.className = 'line';
    const code = document.createElement('span'); code.className = 'code';
    for(const [cls, text] of tokenizeBasicLine(line)){
      if(cls === 'ws'){ code.appendChild(document.createTextNode(text)); }
      else { const sp = document.createElement('span'); sp.className = cls; sp.textContent = text; code.appendChild(sp); }
    }
    if(!code.childNodes.length) code.appendChild(document.createTextNode('​')); // keep blank rows tall
    row.append(code);
    frag.appendChild(row);
  });
  listing.appendChild(frag);
}
fetch('../SNEEKIE.BAS')
  .then(r => { if(!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
  .then(renderListing)
  .catch(err => { listing.textContent = 'Could not load SNEEKIE.BAS — ' + err.message; });


/* ---------- themes (shared with the game via localStorage) ---------- */
const THEMES = {
  hercules:{ bg:'#020503', phos:'#7dff7d', glow:'rgba(125,255,125,.13)',
    gut:'#44864f', ln:'#46c95a', kw:'#d6ffd6', fn:'#7ff09a', str:'#5ad06f', num:'#a9f4b6', com:'#3c8f49', id:'#86ff86', op:'#54bf69', pn:'#4a9a5a' },
  amber:{ bg:'#070401', phos:'#ffc438', glow:'rgba(255,196,56,.12)',
    gut:'#8a6a2a', ln:'#ffb732', kw:'#ffe7a0', fn:'#ffc861', str:'#f0a838', num:'#ffd873', com:'#9a6a18', id:'#ffcb52', op:'#cf9a2c', pn:'#a07d34' },
  white:{ bg:'#050607', phos:'#e8eef0', glow:'rgba(232,238,240,.10)',
    gut:'#3a4146', ln:'#aeb7bb', kw:'#ffffff', fn:'#cdd6da', str:'#aab4b8', num:'#d7dee2', com:'#6b7479', id:'#e8eef0', op:'#9aa3a8', pn:'#525a5e' },
  cga:{ bg:'#000000', phos:'#55ffff', glow:'rgba(85,255,255,.12)',
    gut:'#0a6a6a', ln:'#55ffff', kw:'#55ff55', fn:'#55ffff', str:'#ffff55', num:'#ff55ff', com:'#aaaaaa', id:'#ffffff', op:'#ff5555', pn:'#888888' },
};
function applyTheme(name){
  const t = THEMES[name] || THEMES.hercules;
  const r = document.body.style;
  for(const k in t) r.setProperty('--' + k, t[k]);
  document.querySelectorAll('#themes button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.theme === name)));
  lsSet('sneekie.theme', name);                                                   // same key the game uses
}
document.querySelectorAll('#themes button').forEach(b =>
  b.addEventListener('click', () => applyTheme(b.dataset.theme)));

applyTheme(THEMES[lsGet('sneekie.theme')] ? lsGet('sneekie.theme') : 'hercules');
