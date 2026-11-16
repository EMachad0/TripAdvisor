// Embed glue for a place or area page served by the app (no build step; a port of game/public/place.js with the
// timezone helpers of game/lib/trip.js inlined): timezone labels on the answer cards, #answer-<id> opens its card,
// and when the page sits in the app's sheet (?embed=1, <html data-embed="1">) the theme follows the app and Escape
// or the brand link close the sheet. postMessage protocol (plan section 8): {atr:'close'} to the parent,
// {atr:'theme', theme} from it; only same-origin messages count.

// ---------- game/lib/trip.js: tzLabel, tzSpots ----------
const pad = (n) => String(n).padStart(2, '0');
const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
/** "UTC+8", "UTC−3", "UTC+5:30"; '' when the offset is unknown. */
function tzLabel(off) {
  if (num(off) === null) return '';
  const o = Number(off), a = Math.abs(o), h = Math.floor(a), m = Math.round((a - h) * 60);
  return `UTC${o < 0 ? '−' : '+'}${h}${m ? `:${pad(m)}` : ''}`;
}
const TIME = '(?:(?:[01]?\\d|2[0-3]):[0-5]\\d(?:\\s?[ap]m\\b)?|\\b(?:1[0-2]|0?[1-9])\\s?[ap]m\\b)';
const TIME_RUN = new RegExp(`(?<![\\d:.,])${TIME}(?:\\s?(?:[–—-]|to|and|or|,|, and|, or)\\s?${TIME})*(?!\\d|:\\d)`, 'gi');
/** The index just after each time, or run of times, that has no timezone yet. */
function tzSpots(text) {
  const s = String(text ?? ''), out = [];
  for (const m of s.matchAll(TIME_RUN)) {
    const end = m.index + m[0].length;
    if (!/^\s*\(?(?:UTC|GMT)\b/i.test(s.slice(end))) out.push(end);
  }
  return out;
}

// ---------- game/public/trip.js: watchTimes ----------
/** Writes the timezone (from the nearest data-tz) beside every time in the text under root, now and later. */
function watchTimes(root) {
  const SKIP = new Set(['TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'SCRIPT', 'STYLE', 'TITLE']);
  const mark = (node) => {
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || !el.isConnected) return;
    const walker = document.createTreeWalker(node.nodeType === 1 ? node : el, NodeFilter.SHOW_TEXT);
    const todo = [];
    for (let t = walker.nextNode(); t; t = walker.nextNode()) if (/\d/.test(t.nodeValue)) todo.push(t);
    for (const t of todo) {
      const host = t.parentElement;
      if (!host || SKIP.has(host.tagName) || host.closest('.tz, [contenteditable], textarea')) continue;
      const off = host.closest('[data-tz]')?.dataset.tz;
      const label = off === undefined || off === '' ? '' : tzLabel(off);
      if (!label) continue;
      const text = t.nodeValue;
      const spots = tzSpots(text).filter((at) => !(at === text.length && t.nextSibling?.nodeType === 1 && t.nextSibling.classList.contains('tz')));
      for (const at of spots.reverse()) {
        const tail = t.splitText(at);
        const tag = document.createElement('span');
        tag.className = 'tz'; tag.textContent = label;
        host.insertBefore(tag, tail);
        host.insertBefore(document.createTextNode(' '), tag);
      }
    }
  };
  const obs = new MutationObserver((recs) => {
    obs.disconnect();
    for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1 || n.nodeType === 3) mark(n);
    obs.observe(root, { childList: true, subtree: true });
  });
  mark(root);
  obs.observe(root, { childList: true, subtree: true });
}

// ---------- game/public/place.js ----------
const root = document.documentElement;
const embed = root.dataset.embed === '1';
const qa = document.getElementById('answers');

// Answer cards carry their country's UTC offset (data-tz); write it beside every time in them.
if (qa) watchTimes(qa);
// A link to one answer (#answer-<id>) opens its full text.
const target = location.hash.startsWith('#answer-') ? document.getElementById(location.hash.slice(1)) : null;
if (target) { const d = target.querySelector('details'); if (d) d.open = true; target.classList.add('is-target'); }

window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  if (e.data?.atr === 'theme') { if (e.data.theme) root.setAttribute('data-theme', e.data.theme); else root.removeAttribute('data-theme'); }
});
if (embed) {
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') parent.postMessage({ atr: 'close' }, location.origin); });
  document.querySelector('.topbar .brand')?.addEventListener('click', (e) => { e.preventDefault(); parent.postMessage({ atr: 'close' }, location.origin); });
}
