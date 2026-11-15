// Game glue for a place or area page served by the game: timezone labels on the answer cards, and the embed tweaks
// when the page sits in the game's sheet (theme sync, Esc and the brand link close the sheet).
import { watchTimes } from '/game/trip.js';

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
