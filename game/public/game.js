// Asia Trip Ranker — game client (vanilla ES modules, no build step).
import { computeRatings, update, confidence } from '/lib/elo.js';
import { pickPair } from '/lib/pairing.js';
import { buildBoard, HOLIDAYS, holidayOptions, holidayDate, holidayRange, holidayDay, picksMany, countryOn, daysFor } from '/lib/board.js';
import { TZ_OFFSET } from '/lib/trip.js';
import { watchTimes, initTrip, loadTrip, tripSignature, tripSheetOpen, openTasks, viewToday, viewItinerary, viewCalendar, viewPlaces, viewMoney, viewTodo, viewBag } from '/game/trip.js';
// The route map maths load only when the Route tab opens (an older server without /lib/routemap.js keeps the rest working).
let RM = null;
const routeLib = async () => (RM ||= await import('/lib/routemap.js'));

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
const brl = (n) => (typeof n !== 'number' ? '' : n === 0 ? 'Free' : 'R$ ' + Math.round(n).toLocaleString('pt-BR'));
const fmtDate = (d, o = { day: 'numeric', month: 'short' }) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });

const S = {
  data: null, byId: new Map(), ratings: new Map(), route: 'today', arg: undefined,
  undo: [], deckFilter: { place: 'all', area: 'all' }, duelFilter: 'mix', pair: null, duelBusy: false,
  holidayDuel: {}, shownAt: 0, lastIds: null, undone: new Set(),
  callsFilter: { round: 'all', verdict: 'all', country: 'all', noted: false }, deckNote: null,
};

const ROUTE_ICON = '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 17.5c4-1 2.5-5 6-6.5s2.5-2.5 2.5-3.5" stroke-dasharray="2.2 2.4"/>';
// Two levels: six sections in the bar, and the pages of a section in a row under it.
// A page id is its hash (#/calendar); "today" is the empty hash and "game" is the ranking overview.
const SECTIONS = [
  { id: 'today', label: 'Today', icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>', pages: [{ id: 'today', label: 'Today' }] },
  { id: 'trip', label: 'Trip', icon: ROUTE_ICON, pages: [{ id: 'itinerary', label: 'Itinerary' }, { id: 'calendar', label: 'Calendar' }, { id: 'route', label: 'Map' }] },
  { id: 'places', label: 'Places', icon: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>', pages: [{ id: 'places', label: 'Places' }] },
  { id: 'decide', label: 'Decide', icon: '<rect x="6" y="3" width="12" height="17" rx="2.5" transform="rotate(8 12 12)"/><path d="M3 9l-1 3 1 3M21 9l1 3-1 3"/>', pages: [{ id: 'game', label: 'Overview' }, { id: 'areas', label: 'Areas' }, { id: 'swipe', label: 'Swipe' }, { id: 'duels', label: 'Duels' }, { id: 'board', label: 'Board' }, { id: 'holidays', label: 'Holidays' }, { id: 'calls', label: 'My calls' }] },
  { id: 'money', label: 'Money', icon: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4"/>', pages: [{ id: 'money', label: 'Money' }] },
  { id: 'prep', label: 'Prep', icon: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>', pages: [{ id: 'todo', label: 'To do' }, { id: 'bag', label: 'Bag' }] },
];
const PAGES = SECTIONS.flatMap((s) => s.pages.map((p) => p.id));
const sectionOf = (page) => SECTIONS.find((s) => s.pages.some((p) => p.id === page));
const hrefOf = (page) => `#/${page === 'today' ? '' : page}`;
/** The pages that draw the trip planner (trip/*.json), not the ranking game. */
const TRIP_PAGES = new Set(['today', 'itinerary', 'calendar', 'places', 'money', 'todo', 'bag']);
const PEN = '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>';
const icon = (d, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

// ---------------------------------------------------------------- data
async function api(url, body) {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

async function load({ silent } = {}) {
  const prev = S.lastIds;
  const [d] = await Promise.all([api('/api/state'), loadTrip()]);
  S.data = d;
  S.byId = new Map(d.places.map((p) => [p.id, p]));
  // Undone cards stay unswiped locally until swiped again (the log is append-only).
  for (const key of S.undone) { const [round, id] = key.split(':'); const it = round === 'area' ? d.areas.find((a) => a.id === id) : S.byId.get(id); if (it) it.verdict = null; }
  recompute();
  const ids = new Set([...d.places.map((p) => p.id), ...d.areas.map((a) => 'area:' + a.id)]);
  if (prev && silent) {
    const added = [...ids].filter((x) => !prev.has(x)).length;
    if (added) toast(`✨ ${added} new card${added === 1 ? '' : 's'} from the curator`);
  }
  S.lastIds = ids;
}

const LOCKABLE = Object.keys(HOLIDAYS).filter((h) => !picksMany(h)); // holidays with one locked pick
function verdicts() { return Object.fromEntries(S.data.places.filter((p) => p.verdict).map((p) => [p.id, p.verdict])); }
function recompute() {
  S.ratings = computeRatings(verdicts(), S.data.duels);
  for (const p of S.data.places) { const r = S.ratings.get(p.id); p.rating = r?.rating ?? null; p.games = r?.games ?? 0; }
}
const countryById = (id) => S.data.countries.find((c) => c.id === id);
const flag = (id) => countryById(id)?.flag || '';
const cname = (id) => countryById(id)?.name || id;
const catOf = (id) => S.data.categories[id] || { label: id, icon: '' };

// ---------------------------------------------------------------- shell
function renderTabs() {
  const n = counts();
  const pageBadge = { areas: n.areasLeft, swipe: n.placesLeft, holidays: n.holidayOpen, todo: openTasks() };
  const secBadge = { decide: n.areasLeft + n.placesLeft + n.holidayOpen, prep: pageBadge.todo };
  const cur = sectionOf(S.route);
  const num = (x) => (x ? `<b class="g-tab__n">${x > 99 ? '99+' : x}</b>` : '');
  $('#tabs').innerHTML = SECTIONS.map((t) => `<a href="${hrefOf(t.pages[0].id)}" class="g-tab${cur === t ? ' is-on' : ''}" data-tab="${t.id}"${cur === t ? ' aria-current="page"' : ''}>${icon(t.icon)}<span>${t.label}</span>${num(secBadge[t.id])}</a>`).join('');
  const sub = $('#subtabs');
  const show = cur.pages.length > 1;
  sub.hidden = !show;
  document.body.classList.toggle('has-sub', show);
  sub.innerHTML = show ? `<div class="g-sub__in">${cur.pages.map((p) => `<a href="${hrefOf(p.id)}" class="g-subtab${S.route === p.id ? ' is-on' : ''}"${S.route === p.id ? ' aria-current="page"' : ''}>${p.label}${num(pageBadge[p.id])}</a>`).join('')}</div>` : '';
  if (show) $('.g-subtab.is-on', sub)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function counts() {
  const d = S.data;
  const places = d.places, areas = d.areas;
  const swiped = places.filter((p) => p.verdict).length;
  const pool = places.filter((p) => p.verdict === 'must' || p.verdict === 'maybe');
  const locks = d.local.locks || {};
  return {
    places: places.length, placesLeft: places.length - swiped, swiped,
    areas: areas.length, areasLeft: areas.filter((a) => !a.verdict).length,
    must: places.filter((p) => p.verdict === 'must').length, maybe: places.filter((p) => p.verdict === 'maybe').length,
    pool: pool.length, duels: d.duels.length, conf: confidence(pool.map((p) => p.id), S.ratings),
    newCount: places.filter((p) => p.isNew).length + areas.filter((a) => a.isNew).length,
    // still to decide: a pick-one holiday with options and no lock; a pick-many holiday with an option not called yet
    holidayOpen: Object.keys(HOLIDAYS).filter((h) => (picksMany(h) ? holidayOptions(places, h).some((p) => !p.verdict) : !locks[h] && holidayOptions(places, h).length)).length,
    locked: LOCKABLE.filter((h) => locks[h] && S.byId.has(locks[h])).length,
  };
}

function route() {
  const [h, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const page = h === 'home' ? 'game' : h || 'today'; // #/home is the old address of the ranking overview
  if (S.route === 'route' && page !== 'route') flushRouteSaves();
  S.route = PAGES.includes(page) ? page : 'today';
  S.arg = rest.length ? rest.join('/') : undefined;
  render(true);
}

async function render(animate) {
  if (!S.data) return;
  S.deckNote = null;
  renderTabs();
  const view = $('#view');
  const fn = { today: (v) => viewToday(v, S.arg), itinerary: viewItinerary, calendar: (v) => viewCalendar(v, S.arg), places: (v) => viewPlaces(v, S.arg), money: viewMoney, todo: viewTodo, bag: viewBag,
    game: viewHome, areas: () => viewDeck('area'), swipe: () => viewDeck('place'), duels: viewDuels, board: viewBoard, holidays: viewHolidays, calls: viewCalls, route: viewRoute }[S.route];
  view.dataset.route = S.route;
  if (animate && !reduced) { view.classList.remove('g-enter'); void view.offsetWidth; view.classList.add('g-enter'); }
  fn(view);
  if (animate) window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------- home
function viewHome(v) {
  const n = counts();
  const cs = S.data.countries;
  const days = cs.reduce((s, c) => s + (c.days || 0), 0);
  const range = cs.length ? `${fmtDate(cs[0].from)} → ${fmtDate(cs.at(-1).to)}` : '';
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const steps = [
    { id: 'areas', n: 1, title: 'Areas round', text: 'Which regions and cities deserve days?', done: n.areas - n.areasLeft, total: n.areas, unit: 'swiped', cta: n.areas ? (n.areasLeft ? 'Swipe areas' : 'Review') : 'Coming soon', empty: !n.areas },
    { id: 'swipe', n: 2, title: 'Swipe round', text: 'Must, Maybe or Skip every attraction.', done: n.swiped, total: n.places, unit: 'swiped', cta: n.placesLeft ? 'Keep swiping' : 'All swiped', empty: !n.places },
    { id: 'duels', n: 3, title: 'Duels', text: 'This or that? Quick calls build the ranking.', done: Math.round(n.conf * 100), total: 100, unit: '% confident', cta: n.pool >= 2 ? 'Duel' : 'Needs 2 picks', empty: n.pool < 2, extra: `${n.duels} duel${n.duels === 1 ? '' : 's'}` },
    { id: 'board', n: 4, title: 'Board', text: 'Ranked per country, cut at one pick per day.', done: Math.min(n.must + n.maybe, days), total: days, unit: 'days filled', cta: 'Open board' },
    { id: 'holidays', n: 5, title: 'Holidays', text: 'Lock where you spend Christmas and New Year’s Eve, and choose what to do over Lunar New Year.', done: n.locked, total: LOCKABLE.length, unit: 'locked', cta: n.locked === LOCKABLE.length && !n.holidayOpen ? 'Locked in' : 'Pick', festive: true },
  ];
  v.innerHTML = `<section class="g-home wrap">
  <header class="g-hero">
    <p class="eyebrow">Decide · ${cs.length} countries · ${days} days</p>
    <h1>Rank the trip,<br><em>one swipe at a time.</em></h1>
    <p class="g-hero__sub">${esc(range)} · ${cs.map((c) => `${c.flag} ${esc(c.name)}`).join(' · ')}</p>
    ${n.newCount ? `<a class="g-newpill" href="#/swipe">✨ ${n.newCount} new card${n.newCount === 1 ? '' : 's'} from the curator</a>` : ''}
  </header>
  <div class="g-stats">
    ${[['Must', n.must, 'must'], ['Maybe', n.maybe, 'maybe'], ['Duels', n.duels, 'duel'], ['Questions', S.data.questions, 'q']].map(([l, x, k]) => `<div class="g-stat g-stat--${k}"><b>${x}</b><span>${l}</span></div>`).join('')}
  </div>
  <div class="g-homelinks">
    <a class="g-callslink" href="#/calls">${icon(PEN, 18)}<span><b>My calls</b> ${n.swiped + n.areas - n.areasLeft} swiped · ${notedCount()} note${notedCount() === 1 ? '' : 's'}</span><span aria-hidden="true">→</span></a>
    ${routeHomeLink()}
  </div>
  <ol class="g-steps">
    ${steps.map((s) => `<li class="g-step${s.empty ? ' is-empty' : ''}${s.festive ? ' g-step--festive' : ''}">
      <a href="#/${s.id}">
        <span class="g-step__n">${s.n}</span>
        <span class="g-step__body"><b>${s.title}</b><span>${s.text}</span>
          <span class="g-meter"><i style="--p:${pct(s.done, s.total)}%"></i></span>
          <small>${s.total ? `${s.done}${s.unit.startsWith('%') ? '' : ` / ${s.total}`} ${s.unit}` : 'nothing yet'}${s.extra ? ` · ${s.extra}` : ''}</small>
        </span>
        <span class="g-step__cta">${s.cta}<span aria-hidden="true">→</span></span>
      </a></li>`).join('')}
  </ol>
  <p class="g-foot">The game ranks; it never writes a day-by-day schedule. Swipes, duels, notes and questions go to <code>feedback/</code> for the curator.${S.data.fixtures ? ' <b>Test data.</b>' : ''}</p>
</section>`;
}

// ---------------------------------------------------------------- decks (areas + places)
const VERDICTS = {
  skip: { label: 'Skip', key: '←', cls: 'skip', icon: '<path d="M6 6l12 12M18 6 6 18"/>' },
  maybe: { label: 'Maybe', key: '↑', cls: 'maybe', icon: '<path d="M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V14M12 17.5v.5"/>' },
  must: { label: 'Must', key: '→', cls: 'must', icon: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>' },
};

function deckItems(round) {
  const d = S.data;
  const order = d.countries.map((c) => c.id);
  const ci = (c) => (order.indexOf(c) + 1 || 99);
  const f = S.deckFilter[round];
  if (round === 'area') {
    return d.areas.filter((a) => !a.verdict && (f === 'all' || a.country === f)).sort((a, b) => b.isNew - a.isNew || ci(a.country) - ci(b.country) || a.name.localeCompare(b.name));
  }
  // Funnel: places in cities of skipped areas go last.
  const skipped = new Set(d.areas.filter((a) => a.verdict === 'skip').flatMap((a) => a.cities.map((c) => `${a.country}/${c}`)));
  const kept = new Set(d.areas.filter((a) => a.verdict === 'must' || a.verdict === 'maybe').flatMap((a) => a.cities.map((c) => `${a.country}/${c}`)));
  const rank = (p) => (skipped.has(`${p.country}/${p.city}`) ? 2 : kept.has(`${p.country}/${p.city}`) ? 0 : 1);
  return d.places.filter((p) => !p.verdict && (f === 'all' || p.country === f))
    .sort((a, b) => b.isNew - a.isNew || rank(a) - rank(b) || ci(a.country) - ci(b.country) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
}

function viewDeck(round) {
  const v = $('#view');
  const d = S.data;
  const all = round === 'area' ? d.areas : d.places;
  const items = deckItems(round);
  const title = round === 'area' ? 'Areas round' : 'Swipe round';
  const done = all.filter((x) => x.verdict).length;
  const byC = {};
  for (const x of all) if (!x.verdict) byC[x.country] = (byC[x.country] || 0) + 1;
  const f = S.deckFilter[round];
  if (!all.length) {
    v.innerHTML = round === 'area' ? emptyState('🗺️', 'No area cards yet', 'The curator is still researching regions and cities (Harbin? Chongqing? Kyoto?). They’ll appear here as swipeable cards. Meanwhile, the attraction deck is ready.', '#/swipe', 'Go to the swipe round') : emptyState('🧭', 'No places yet', 'The curator hasn’t added attractions yet. Check back in a bit; this page refreshes itself.', '#/game', 'Back to the overview');
    return;
  }
  v.innerHTML = `<section class="g-deckview wrap">
  <header class="g-head">
    <div><p class="eyebrow">${round === 'area' ? 'Step 1 · regions & cities' : 'Step 2 · attractions'}</p><h1 class="g-h1">${title}</h1></div>
    <div class="g-progress" title="${done} of ${all.length} swiped"><span class="g-progress__txt"><b>${done}</b> / ${all.length}</span><span class="g-meter"><i style="--p:${Math.round((done / all.length) * 100)}%"></i></span></div>
  </header>
  <div class="g-filters" role="tablist">${[['all', 'All', Object.values(byC).reduce((a, b) => a + b, 0)], ...d.countries.filter((c) => byC[c.id]).map((c) => [c.id, `${c.flag} ${c.name}`, byC[c.id]])].map(([id, l, n]) => `<button class="g-filter${f === id ? ' is-on' : ''}" data-filter="${id}">${esc(l)} <span>${n}</span></button>`).join('')}</div>
  <div class="g-deck-wrap">
    <div class="g-deck" id="deck" data-round="${round}">${items.length ? items.slice(0, 3).reverse().map((x, i, arr) => deckCard(x, round, arr.length - 1 - i)).join('') : deckDone(round)}</div>
    ${items.length ? `<div class="g-controls">
      ${['skip', 'maybe', 'must'].map((k) => `<button class="g-vbtn g-vbtn--${k}" data-verdict="${k}" aria-label="${VERDICTS[k].label} (${VERDICTS[k].key})">${icon(VERDICTS[k].icon, 26)}<span>${VERDICTS[k].label}</span></button>`).join('')}
    </div>
    <div class="g-subcontrols">
      <button class="g-notebtn" data-act="note" aria-expanded="false" aria-keyshortcuts="N">${icon(PEN, 16)}<span>Note</span><kbd>N</kbd></button>
      <button class="g-link" data-act="undo"${S.undo.filter((u) => u.round === round).length ? '' : ' disabled'}>${icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', 16)} Undo <kbd>Z</kbd></button>
      <button class="g-link" data-act="open">Details <kbd>Space</kbd></button>
      <button class="g-link" data-act="ask">Ask ✦</button>
      <span class="g-left">${items.length} left</span>
    </div>
    <p class="g-hint">Drag the card, or use <kbd>←</kbd> Skip · <kbd>↑</kbd> Maybe · <kbd>→</kbd> Must</p>` : ''}
  </div>
</section>`;
  $$('.g-filter', v).forEach((b) => b.onclick = () => { S.deckFilter[round] = b.dataset.filter; viewDeck(round); });
  $$('[data-verdict]', v).forEach((b) => b.onclick = () => swipeTop(b.dataset.verdict));
  $('[data-act="undo"]', v)?.addEventListener('click', () => undo(round));
  $('[data-act="open"]', v)?.addEventListener('click', () => { const t = topCard(); if (t) openTop(t); });
  $('[data-act="ask"]', v)?.addEventListener('click', () => { const t = topCard(); if (t) openTop(t, { ask: true }); });
  $('[data-act="note"]', v)?.addEventListener('click', () => toggleDeckNote());
  $$('[data-go]', v).forEach((b) => b.onclick = () => { location.hash = b.dataset.go; });
  bindTopCard();
  syncNoteBtn();
  S.shownAt = performance.now();
}

function deckCard(x, round, depth) {
  return `<div class="g-card" data-id="${esc(x.id)}" data-depth="${depth}" style="--depth:${depth}">
    ${withNoteChip(x.card, x.note)}
    <span class="g-stamp g-stamp--must">Must</span><span class="g-stamp g-stamp--skip">Skip</span><span class="g-stamp g-stamp--maybe">Maybe</span>
  </div>`;
}

function deckDone(round) {
  const n = counts();
  const next = round === 'area' ? ['#/swipe', 'On to the attractions'] : n.pool >= 2 ? ['#/duels', 'Start the duels'] : ['#/board', 'See the board'];
  const f = S.deckFilter[round];
  return `<div class="g-done">
    <div class="g-done__emoji">🎉</div>
    <h2>${f !== 'all' ? `${esc(cname(f))} cleared!` : 'Deck cleared!'}</h2>
    <p>${round === 'area' ? `${S.data.areas.filter((a) => a.verdict === 'must').length} must-go areas.` : `${n.must} Musts · ${n.maybe} Maybes so far.`} New cards from the curator land here automatically.</p>
    <button class="g-btn" data-go="${next[0]}">${next[1]} →</button>
    ${f !== 'all' ? `<button class="g-link" data-filter-reset>Show all countries</button>` : ''}
  </div>`;
}

const topCard = () => $('#deck .g-card[data-depth="0"]');
/** The note marker on a card: a small chip in the card's meta row (places) or chip list (areas). */
const NOTE_CHIP = `<span class="g-notechip" title="You wrote a note">${icon(PEN, 13)}Note</span>`;
function withNoteChip(card, note) {
  if (!note) return card;
  if (card.includes('class="atr-card__meta"')) return card.replace(/(<div class="atr-card__meta">[\s\S]*?)(<\/div>)/, `$1${NOTE_CHIP}$2`);
  return card.replace(/(<ul class="chips">[\s\S]*?)(<\/ul>)/, `$1<li class="g-notechip-li">${NOTE_CHIP}</li>$2`);
}
const openTop = (card, o) => ($('#deck').dataset.round === 'area' ? openArea : openPlace)(card.dataset.id, o);

function bindTopCard() {
  const card = topCard();
  if (!card) { $('[data-filter-reset]')?.addEventListener('click', () => { const r = $('#deck').dataset.round; S.deckFilter[r] = 'all'; viewDeck(r); }); return; }
  let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false, moved = false, t0 = 0, pid = null;
  card.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragging = true; moved = false; sx = e.clientX; sy = e.clientY; dx = dy = 0; t0 = performance.now(); pid = e.pointerId;
    card.setPointerCapture(pid); card.classList.add('is-drag');
  });
  card.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.05}deg)`;
    const k = dir(dx, dy);
    card.dataset.lean = k || '';
    card.style.setProperty('--lean', Math.min(1, Math.max(Math.abs(dx), -dy) / 110));
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false; card.classList.remove('is-drag');
    try { card.releasePointerCapture(pid); } catch {}
    const dt = performance.now() - t0;
    const vx = dx / Math.max(dt, 1);
    if (!moved) { card.style.transform = ''; openTop(card); return; }
    const k = Math.abs(dx) > 110 || (Math.abs(vx) > 0.6 && Math.abs(dx) > 40) ? (dx > 0 ? 'must' : 'skip') : dy < -110 ? 'maybe' : null;
    if (k) swipeTop(k, { dx, dy });
    else { card.style.transition = 'transform .35s cubic-bezier(.2,1.4,.4,1)'; card.style.transform = ''; card.dataset.lean = ''; setTimeout(() => { card.style.transition = ''; }, 360); }
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
  card.addEventListener('click', (e) => e.preventDefault());
}
const dir = (dx, dy) => (-dy > Math.abs(dx) && -dy > 30 ? 'maybe' : dx > 30 ? 'must' : dx < -30 ? 'skip' : null);

let swiping = false;
async function swipeTop(verdict, from = {}) {
  const card = topCard();
  if (!card || swiping) return;
  swiping = true;
  closeDeckNote();
  const round = $('#deck').dataset.round;
  const id = card.dataset.id;
  const ms = Math.round(performance.now() - S.shownAt);
  const W = window.innerWidth;
  const to = verdict === 'must' ? `translate(${W}px, ${(from.dy || 0) + 40}px) rotate(28deg)` : verdict === 'skip' ? `translate(${-W}px, ${(from.dy || 0) + 40}px) rotate(-28deg)` : `translate(${from.dx || 0}px, ${-window.innerHeight}px) rotate(${(from.dx || 0) * 0.05}deg)`;
  card.dataset.lean = verdict; card.style.setProperty('--lean', 1);
  card.style.transition = reduced ? 'none' : 'transform .42s cubic-bezier(.3,.6,.4,1), opacity .42s';
  requestAnimationFrame(() => { card.style.transform = to; card.style.opacity = '0'; });
  haptic(verdict === 'skip' ? 8 : 14);
  // optimistic update
  const item = round === 'area' ? S.data.areas.find((a) => a.id === id) : S.byId.get(id);
  const prev = item.verdict;
  item.verdict = verdict; item.isNew = false;
  S.undone.delete(`${round}:${id}`);
  S.undo.push({ round, id, prev });
  api('/api/swipe', { round, id, verdict, ms }).catch((e) => { toast(`Couldn’t save: ${e.message}`, 'err'); item.verdict = prev; viewDeck(round); });
  if (round === 'place') recompute();
  await wait(300);
  swiping = false;
  advanceDeck(round);
}

function advanceDeck(round) {
  const deck = $('#deck');
  if (!deck) return;
  const items = deckItems(round);
  // Remove the flown card, shift the rest up, append a new back card.
  $$('.g-card', deck).filter((c) => !items.slice(0, 3).some((x) => x.id === c.dataset.id)).forEach((c) => c.remove());
  items.slice(0, 3).forEach((x, i) => {
    let el = $$('.g-card', deck).find((c) => c.dataset.id === x.id);
    if (!el) { deck.insertAdjacentHTML('afterbegin', deckCard(x, round, i)); el = deck.firstElementChild; el.classList.add('is-in'); }
    el.dataset.depth = i; el.style.setProperty('--depth', i);
  });
  if (!items.length) { viewDeck(round); renderTabs(); return; }
  // refresh header counts without re-rendering the deck
  const all = round === 'area' ? S.data.areas : S.data.places;
  const done = all.filter((x) => x.verdict).length;
  const pg = $('.g-progress');
  if (pg) { pg.querySelector('b').textContent = done; pg.querySelector('i').style.setProperty('--p', `${Math.round((done / all.length) * 100)}%`); }
  const left = $('.g-left'); if (left) left.textContent = `${items.length} left`;
  const u = $('[data-act="undo"]'); if (u) u.disabled = !S.undo.some((x) => x.round === round);
  syncNoteBtn();
  renderTabs();
  bindTopCard();
  S.shownAt = performance.now();
}

function undo(round) {
  const i = S.undo.map((u) => u.round).lastIndexOf(round);
  if (i < 0) return;
  const [u] = S.undo.splice(i, 1);
  const item = round === 'area' ? S.data.areas.find((a) => a.id === u.id) : S.byId.get(u.id);
  // The log is append-only: the card simply comes back; your next swipe on it overrides the old one.
  item.verdict = null;
  S.undone.add(`${round}:${u.id}`);
  if (round === 'place') recompute();
  viewDeck(round);
  renderTabs();
  toast('Card is back. Swipe it again to change your call.');
}

// ---------------------------------------------------------------- duels
function duelPool() {
  return S.data.places.filter((p) => p.verdict === 'must' || p.verdict === 'maybe');
}

function nextPair() {
  const pool = duelPool();
  const country = S.duelFilter !== 'mix' ? S.duelFilter : undefined;
  const pair = pickPair(pool, S.ratings, S.data.duels, { country });
  S.pair = pair ? pair.map((p) => p.id) : null;
}

function viewDuels(v) {
  const pool = duelPool();
  const byC = {};
  for (const p of pool) byC[p.country] = (byC[p.country] || 0) + 1;
  if (S.duelFilter !== 'mix' && (byC[S.duelFilter] || 0) < 2) S.duelFilter = 'mix';
  if (!S.pair || !S.pair.every((id) => pool.some((p) => p.id === id)) || (S.duelFilter !== 'mix' && S.byId.get(S.pair[0]).country !== S.duelFilter)) nextPair();
  const conf = Math.round(confidence(pool.map((p) => p.id), S.ratings) * 100);
  if (pool.length < 2) {
    v.innerHTML = emptyState('⚔️', 'Duels need contenders', `Mark at least two places Must or Maybe in the swipe round, then come back for quick this-or-that calls. You have ${pool.length}.`, '#/swipe', 'Go swipe');
    return;
  }
  const [a, b] = S.pair.map((id) => S.byId.get(id));
  const country = a.country === b.country ? a.country : null;
  v.innerHTML = `<section class="g-duelview wrap">
  <header class="g-head">
    <div><p class="eyebrow">Step 3 · this or that</p><h1 class="g-h1">Duels</h1></div>
    <div class="g-progress" title="Ranking confidence: how many duels each pick has had"><span class="g-progress__txt"><b>${conf}%</b> confident · ${S.data.duels.length} duels</span><span class="g-meter g-meter--conf"><i style="--p:${conf}%"></i></span></div>
  </header>
  <div class="g-filters">${[['mix', 'Mostly same country'], ...S.data.countries.filter((c) => (byC[c.id] || 0) >= 2).map((c) => [c.id, `${c.flag} ${c.name}`])].map(([id, l]) => `<button class="g-filter${S.duelFilter === id ? ' is-on' : ''}" data-df="${id}">${esc(l)}</button>`).join('')}</div>
  <div class="g-duel-grid">
    <div class="g-arena" id="arena">
      <p class="g-arena__q">${country ? `${flag(country)} Which is more worth a day in ${esc(cname(country))}?` : 'Which would you rather do?'}</p>
      <div class="g-duel">
        ${duelSide(a, 'left')}
        <div class="g-vs" aria-hidden="true"><span>VS</span></div>
        ${duelSide(b, 'right')}
      </div>
      <div class="g-subcontrols g-subcontrols--duel"><button class="g-link" data-act="skip">Can’t decide <kbd>↓</kbd></button><span class="g-hint g-hint--inline"><kbd>←</kbd> left · <kbd>→</kbd> right</span></div>
    </div>
    <aside class="g-live" id="live">${liveRanking(country || a.country)}</aside>
  </div>
</section>`;
  $$('[data-df]', v).forEach((x) => x.onclick = () => { S.duelFilter = x.dataset.df; S.pair = null; viewDuels(v); });
  $$('.g-side', v).forEach((s) => s.addEventListener('click', (e) => { if (e.target.closest('[data-open]')) return; pickDuel(s.dataset.side); }));
  $$('[data-open]', v).forEach((x) => x.onclick = (e) => { e.stopPropagation(); openPlace(x.dataset.open); });
  $('[data-act="skip"]', v).onclick = () => skipDuel();
}

function duelSide(p, side) {
  const card = p.note ? p.card.replace(/(<p class="atr-card__why">[\s\S]*?<\/p>)/, `$1${noteSnip(p.note, 'g-side__note')}`) : p.card;
  return `<div class="g-side" data-side="${side}" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="Pick ${esc(p.name)}">
    ${card}
    <button class="g-side__open" data-open="${esc(p.id)}" aria-label="Details for ${esc(p.name)}">${icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', 18)}<span>Details</span></button>
    <span class="g-side__pick">${side === 'left' ? '← ' : ''}Pick${side === 'right' ? ' →' : ''}</span>
    <span class="g-delta"></span>
  </div>`;
}

function liveRanking(country) {
  const ranked = duelPool().filter((p) => p.country === country).sort((x, y) => y.rating - x.rating).slice(0, 6);
  return `<h3>${flag(country)} Live ranking</h3><ol class="g-live__list">${ranked.map((p, i) => `<li data-id="${esc(p.id)}" data-cat="${esc(p.category)}"><span class="g-live__n">${i + 1}</span><span class="g-live__name">${esc(p.short || p.name)}</span><span class="g-live__r">${Math.round(p.rating)}</span></li>`).join('')}</ol><a class="g-link" href="#/board">Full board →</a>`;
}

async function pickDuel(side) {
  if (S.duelBusy || !S.pair) return;
  S.duelBusy = true;
  const [l, r] = S.pair;
  const winner = side === 'left' ? l : r, loser = side === 'left' ? r : l;
  const wr = S.byId.get(winner).rating, lr = S.byId.get(loser).rating;
  const { delta } = update(wr, lr);
  const wEl = $(`.g-side[data-side="${side}"]`), lEl = $(`.g-side[data-side="${side === 'left' ? 'right' : 'left'}"]`);
  wEl?.classList.add('is-win'); lEl?.classList.add('is-lose');
  if (wEl) wEl.querySelector('.g-delta').textContent = `+${Math.round(delta)}`;
  if (lEl) lEl.querySelector('.g-delta').textContent = `−${Math.round(delta)}`;
  haptic(12);
  S.data.duels.push({ winner, loser });
  recompute();
  const before = $$('#live li').map((li) => [li.dataset.id, li.getBoundingClientRect().top]);
  const live = $('#live');
  if (live) { live.innerHTML = liveRanking(S.byId.get(winner).country); flipList(live, before); }
  api('/api/duel', { winner, loser }).catch((e) => toast(`Couldn’t save the duel: ${e.message}`, 'err'));
  await wait(620);
  S.duelBusy = false;
  nextPair();
  if (S.route === 'duels') { viewDuels($('#view')); $('#arena .g-duel')?.classList.add('is-in'); }
}

function skipDuel() {
  if (S.duelBusy || !S.pair) return;
  // "Can't decide": nothing is logged; the pair counts as met locally so it isn't offered again right away.
  S.skipHist = [...(S.skipHist || []), { winner: S.pair[0], loser: S.pair[1] }];
  const country = S.duelFilter !== 'mix' ? S.duelFilter : undefined;
  const pair = pickPair(duelPool(), S.ratings, [...S.data.duels, ...S.skipHist], { country });
  S.pair = pair ? pair.map((p) => p.id) : null;
  viewDuels($('#view'));
  $('#arena .g-duel')?.classList.add('is-in');
}

function flipList(root, before) {
  if (reduced) return;
  const map = new Map(before);
  $$('li', root).forEach((li) => {
    const old = map.get(li.dataset.id);
    const now = li.getBoundingClientRect().top;
    if (old === undefined) { li.animate([{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 300 }); return; }
    if (Math.abs(old - now) > 1) li.animate([{ transform: `translateY(${old - now}px)`, background: 'var(--accent-soft)' }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
}

// ---------------------------------------------------------------- board
function board() {
  const d = S.data;
  return buildBoard({ places: d.places, countries: d.countries, days: d.local.days, locks: d.local.locks, interests: d.interests, dominantShare: d.dominantShare, labels: Object.fromEntries(Object.entries(d.categories).map(([k, v]) => [k, v.label])) });
}

function viewBoard(v) {
  const b = board();
  const d = S.data;
  const locks = d.local.locks || {};
  const delta = b.totalDays - b.configTotal;
  v.innerHTML = `<section class="g-boardview wrap">
  <header class="g-head">
    <div><p class="eyebrow">Step 4 · the ranking</p><h1 class="g-h1">Board</h1></div>
    <div class="g-daysum ${delta ? 'is-off' : ''}"><b>${b.totalDays}</b> / ${b.configTotal} days${delta ? ` <span>${delta > 0 ? '+' : ''}${delta} vs trip plan</span> <button class="g-link" data-act="resetdays">Reset</button>` : ''}</div>
  </header>
  <p class="g-lede">One pick per day: the dashed line in each country sits at its number of days. Change the days to see what makes the cut. This is a what-if; the trip config isn’t touched.</p>
  <div class="g-board">
    <div class="g-board__main">${b.countries.map((c) => countryBlock(c, locks)).join('')}</div>
    <aside class="g-board__side">
      ${balancePanel(b.balance)}
      ${holidayLocksPanel(locks)}
      ${bookPanel(b.bookAhead)}
    </aside>
  </div>
</section>`;
  bindBoard(v);
}

function countryBlock(c, locks) {
  const lockedIds = new Map(Object.entries(locks).filter(([, id]) => id).map(([h, id]) => [id, h]));
  const rows = [];
  c.ranked.forEach((p, i) => {
    if (i === c.days) rows.push(cutLine(c));
    rows.push(boardRow(p, i, i >= c.days, lockedIds.get(p.id)));
  });
  if (c.ranked.length <= c.days) rows.push(cutLine(c, c.open));
  const bud = c.budget;
  const pct = Math.min(100, Math.round(bud.share * 100 || 0));
  const bal = c.balance;
  return `<section class="g-country" id="c-${c.id}" data-country="${c.id}">
  <header class="g-country__head">
    <div class="g-country__title"><h2>${c.flag} ${esc(c.name)}</h2><span>${fmtDate(c.from)} – ${fmtDate(c.to)}</span></div>
    <div class="g-stepper" role="group" aria-label="Days in ${esc(c.name)}">
      <button data-days="${c.id}" data-step="-1" aria-label="One day less"${c.days <= 0 ? ' disabled' : ''}>−</button>
      <output><b>${c.days}</b> day${c.days === 1 ? '' : 's'}${c.changed ? `<small>plan ${c.configDays}</small>` : ''}</output>
      <button data-days="${c.id}" data-step="1" aria-label="One day more">+</button>
    </div>
  </header>
  <div class="g-country__meters">
    <div class="g-budget g-budget--${bud.status}" title="Attraction costs of above-the-line picks vs R$${c.perDay}/day × ${c.days} days. Food is budgeted separately.">
      <div class="g-budget__row"><span>Budget</span><b>${brl(bud.spend)} <small>of ${brl(bud.cap)}</small></b></div>
      <span class="g-meter"><i style="--p:${pct}%"></i></span>
      <small>${bud.status === 'over' ? 'Over the “everything else” budget' : bud.status === 'tight' ? 'Tight: little left for transport and nights out' : 'Room left for transport and nightlife'} · ${brl(c.perDay)}/day${bud.excluded ? ` · ${bud.excluded} food pick${bud.excluded === 1 ? '' : 's'} not counted` : ''}</small>
    </div>
    <div class="g-mix" title="Category mix above the line">${mixBar(bal)}${bal.dominant ? `<small class="g-nudge">Heavy on ${esc(catOf(bal.dominant.category).label)}</small>` : `<small>${bal.total} pick${bal.total === 1 ? '' : 's'} above the line</small>`}</div>
  </div>
  <ol class="g-rank" data-list="${c.id}">${rows.join('') || ''}</ol>
</section>`;
}

function cutLine(c, open = 0) {
  return `<li class="g-cut" data-key="cut"><span>✂ ${c.days} day${c.days === 1 ? '' : 's'} · one pick per day</span>${open ? `<em>${open} open day${open === 1 ? '' : 's'}: swipe more or ask the curator</em>` : ''}</li>`;
}

function boardRow(p, i, below, holiday) {
  const thumb = p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">` : `<span>${esc(catOf(p.category).icon)}</span>`;
  const h = holiday ? HOLIDAYS[holiday] : null;
  return `<li class="g-row${below ? ' is-below' : ''}" data-key="${esc(p.id)}" data-id="${esc(p.id)}" data-cat="${esc(p.category)}">
    <span class="g-row__n">${i + 1}</span>
    <span class="g-row__thumb">${thumb}</span>
    <span class="g-row__main"><b>${esc(p.name)}</b><small>${esc(p.cityName)} · ${esc(catOf(p.category).label)}${p.isNew ? ' · <em class="g-newtag">New</em>' : ''}</small>${p.note ? noteSnip(p.note, 'g-row__note') : ''}</span>
    <span class="g-row__tags">${h ? `<span class="g-tag g-tag--lock" title="Locked for ${esc(h.short)}">${h.emoji} 🔒</span>` : ''}${p.drone ? '<span class="g-tag g-tag--drone" title="Drone show">🛸</span>' : ''}${p.booking.level !== 'none' ? `<span class="g-tag g-tag--book${p.booking.level === 'recommended' ? ' is-rec' : ''}" title="${esc(p.booking.badge || '')}">📅</span>` : ''}<span class="g-pill g-pill--${p.verdict || 'none'}">${esc(p.verdict ? VERDICTS[p.verdict].label : 'Locked')}</span></span>
    <span class="g-row__cost">${esc(brl(p.brl))}${p.budgeted ? '' : '<small>meal</small>'}</span>
  </li>`;
}

function mixBar(bal) {
  const cats = Object.entries(bal.counts).sort((a, b) => b[1] - a[1]);
  if (!bal.total) return '<span class="g-mixbar g-mixbar--empty"></span>';
  return `<span class="g-mixbar">${cats.map(([c, n]) => `<i data-cat="${esc(c)}" style="flex:${n}" title="${esc(catOf(c).label)}: ${n}"></i>`).join('')}</span>`;
}

function balancePanel(bal) {
  const cats = Object.entries(bal.counts).sort((a, b) => b[1] - a[1]);
  return `<section class="g-panel"><h3>Balance</h3>
  ${mixBar(bal)}
  <ul class="g-legend">${cats.map(([c, n]) => `<li data-cat="${esc(c)}"><i></i>${esc(catOf(c).icon)} ${esc(catOf(c).label)} <b>${Math.round((n / bal.total) * 100)}%</b></li>`).join('') || '<li class="g-muted">Nothing above the line yet.</li>'}</ul>
  ${bal.nudges.length ? `<ul class="g-nudges">${bal.nudges.slice(0, 4).map((n) => `<li class="g-nudge--${n.kind}">${n.kind === 'dominant' ? '⚖️' : '🔍'} ${esc(n.text)}</li>`).join('')}</ul>` : bal.total >= 5 ? '<p class="g-ok">✓ Nicely balanced.</p>' : ''}
</section>`;
}

function holidayLocksPanel(locks) {
  return `<section class="g-panel g-panel--festive"><h3>Holidays</h3><ul class="g-locks">${Object.values(HOLIDAYS).map((h) => {
    if (picksMany(h.id)) {
      const opts = holidayOptions(S.data.places, h.id);
      const must = opts.filter((o) => o.verdict === 'must').length;
      return `<li>${h.emoji} <span>${esc(h.short)}</span><a class="g-link" href="#/holidays">${opts.length ? `${must} of ${opts.length} Must →` : 'Pick →'}</a></li>`;
    }
    const p = S.byId.get(locks[h.id]);
    return `<li>${h.emoji} <span>${esc(h.short)}</span>${p ? `<button class="g-lockchip" data-open="${esc(p.id)}">🔒 ${esc(p.short || p.name)}</button>` : '<a class="g-link" href="#/holidays">Pick →</a>'}</li>`;
  }).join('')}</ul></section>`;
}

function bookPanel(list) {
  return `<section class="g-panel"><h3>Book ahead</h3>${list.length ? `<p class="g-muted">Latest safe booking date if you went on your first day there (or on the holiday for holiday picks).</p><ol class="g-book">${list.map((x) => `<li class="${x.level === 'required' ? 'is-req' : 'is-rec'}">
    <button class="g-book__name" data-open="${esc(x.id)}">${flag(x.country)} ${esc(x.name)}</button>
    <span class="g-book__when"><b>${x.deadline ? fmtDate(x.deadline) : '–'}</b><small>${x.level === 'required' ? 'Must book' : 'Recommended'} · ${x.lead_days} day${x.lead_days === 1 ? '' : 's'} ahead${x.holiday ? ` · ${HOLIDAYS[x.holiday].emoji}` : ''}</small></span>
    ${x.links[0] ? `<a class="g-book__link" href="${esc(x.links[0].url)}" target="_blank" rel="noopener">${esc(x.links[0].label)} ↗</a>` : ''}
  </li>`).join('')}</ol>` : '<p class="g-muted">Nothing above the line needs booking yet.</p>'}</section>`;
}

function bindBoard(v) {
  $$('[data-days]', v).forEach((btn) => btn.onclick = () => changeDays(btn.dataset.days, Number(btn.dataset.step)));
  $('[data-act="resetdays"]', v)?.addEventListener('click', async () => { S.data.local.days = {}; viewBoard(v); api('/api/local', { resetDays: true }).catch((e) => toast(e.message, 'err')); });
  $$('.g-row', v).forEach((r) => r.onclick = () => openPlace(r.dataset.id));
  $$('[data-open]', v).forEach((x) => x.onclick = () => openPlace(x.dataset.open));
}

let daysTimer;
function changeDays(country, step) {
  const c = countryById(country);
  const cur = daysFor(c, S.data.local.days);
  const next = Math.max(0, Math.min(90, cur + step));
  if (next === cur) return;
  const list = $(`[data-list="${country}"]`);
  const before = $$('li', list).map((li) => [li.dataset.key, li.getBoundingClientRect().top]);
  if (next === c.days) delete S.data.local.days[country]; else S.data.local.days[country] = next;
  const b = board();
  const cb = b.countries.find((x) => x.id === country);
  const sec = $(`#c-${country}`);
  const tmp = document.createElement('div');
  tmp.innerHTML = countryBlock(cb, S.data.local.locks || {});
  sec.replaceWith(tmp.firstElementChild);
  const nsec = $(`#c-${country}`);
  const nlist = $(`[data-list="${country}"]`);
  // FLIP: rows slide and the cut line glides to its new place.
  if (!reduced) {
    const map = new Map(before);
    $$('li', nlist).forEach((li) => {
      const old = map.get(li.dataset.key);
      if (old === undefined) return;
      const dy = old - li.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
    nsec.querySelector('.g-stepper output b')?.animate([{ transform: `translateY(${step > 0 ? 8 : -8}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220 });
  }
  // side panels + day total
  const side = $('.g-board__side');
  if (side) side.innerHTML = balancePanel(b.balance) + holidayLocksPanel(S.data.local.locks || {}) + bookPanel(b.bookAhead);
  const sum = $('.g-daysum');
  const delta = b.totalDays - b.configTotal;
  if (sum) { sum.className = `g-daysum ${delta ? 'is-off' : ''}`; sum.innerHTML = `<b>${b.totalDays}</b> / ${b.configTotal} days${delta ? ` <span>${delta > 0 ? '+' : ''}${delta} vs trip plan</span> <button class="g-link" data-act="resetdays">Reset</button>` : ''}`; }
  bindBoard($('#view'));
  clearTimeout(daysTimer);
  daysTimer = setTimeout(() => api('/api/local', { days: { [country]: S.data.local.days[country] ?? null } }).catch((e) => toast(e.message, 'err')), 350);
}

// ---------------------------------------------------------------- holidays
function viewHolidays(v) {
  const d = S.data;
  const locks = d.local.locks || {};
  v.innerHTML = `<section class="g-holview">
  <header class="g-holhero"><div class="wrap">
    <p class="eyebrow">Step 5 · the big nights</p>
    <h1>Holiday picks</h1>
    <p>Christmas and New Year’s Eve are one night each: compare the options, duel them if you can’t decide, then lock one in. Lunar New Year in Hong Kong runs for days, so there you can say yes to as many as you like.</p>
    <div class="g-snow" aria-hidden="true">${Array.from({ length: 28 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${6 + (i % 7)}s;--s:${0.5 + ((i * 13) % 10) / 10}"></i>`).join('')}</div>
  </div></header>
  <div class="wrap">${Object.values(HOLIDAYS).map((h) => holidaySection(h, locks[h.id])).join('')}</div>
</section>`;
  bindHolidays(v);
}

function holidaySection(h, lockedId) {
  const d = S.data;
  const date = holidayDate(h.id, d.countries);
  const where = date ? countryOn(date, d.countries) : null;
  if (picksMany(h.id)) return holidaySectionMany(h, date, where);
  const opts = holidayOptions(d.places, h.id).sort((a, b) => (b.id === lockedId) - (a.id === lockedId) || (b.rating ?? 1500) - (a.rating ?? 1500));
  const locked = S.byId.get(lockedId);
  const duel = S.holidayDuel[h.id];
  return `<section class="g-hol" id="hol-${h.id}" data-h="${h.id}">
  <header class="g-hol__head">
    <div><h2><span class="g-hol__emoji">${h.emoji}</span> ${esc(h.title)}</h2>
    <p>${date ? `${fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}${where ? ` · you’ll be in ${flag(where)} ${esc(cname(where))}` : ''}` : 'Not in the trip window'}${opts.length ? ` · ${opts.length} option${opts.length === 1 ? '' : 's'}` : ''}</p></div>
    ${opts.length >= 2 && !duel ? `<button class="g-btn g-btn--ghost" data-hduel="${h.id}">⚔️ Duel them</button>` : ''}
  </header>
  ${locked ? `<div class="g-locked"><span class="g-locked__seal">🔒</span><div><small>Locked in for ${esc(h.short)}</small><b>${esc(locked.name)}</b><span>${flag(locked.country)} ${esc(locked.cityName)} · ${esc(brl(locked.brl))}</span></div><button class="g-link" data-unlock="${h.id}">Unlock</button></div>` : ''}
  ${duel ? holidayDuel(h, duel) : ''}
  ${opts.length ? `<div class="g-hol__opts">${opts.map((p, i) => holidayCard(p, h, where, lockedId, i)).join('')}</div>` : `<div class="g-hol__empty"><span>${h.emoji}</span><p><b>No ${esc(h.short)} options yet.</b> The curator tags places with <code>${h.tag}</code>; they’ll show up here side by side.</p></div>`}
</section>`;
}

// A holiday where the options don't compete (Lunar New Year: one city, things on different days).
// No lock and no duel: the cards come in day order and each keeps its own Must / Maybe / Skip call.
const WDM = { weekday: 'short', day: 'numeric', month: 'short' };
function holidaySectionMany(h, date, where) {
  const d = S.data;
  const range = holidayRange(h.id, d.countries);
  const opts = holidayOptions(d.places, h.id, d.countries);
  const days = opts.map((p) => holidayDay(p, range));
  const apart = opts.length > 1 && days.every(Boolean) && new Set(days).size === opts.length;
  const span = range ? (range.from === range.to ? fmtDate(range.from, WDM) : `${fmtDate(range.from, WDM)} – ${fmtDate(range.to, WDM)}`) : 'Not in the trip window';
  return `<section class="g-hol g-hol--many" id="hol-${h.id}" data-h="${h.id}">
  <header class="g-hol__head">
    <div><h2><span class="g-hol__emoji">${h.emoji}</span> ${esc(h.title)}</h2>
    <p>${span}${date ? ` · ${esc(h.short)} is ${fmtDate(date, WDM)}` : ''}${where ? ` · you’ll be in ${flag(where)} ${esc(cname(where))}` : ''}</p></div>
  </header>
  ${opts.length ? `<p class="g-hol__many">${apart ? `These don’t compete: each is on a different day, so you can do all ${opts.length}.` : 'These don’t compete: they are spread over the holiday, so you can do more than one.'} Call each one Must, Maybe or Skip. <span class="g-hol__tally">${manyTally(opts)}</span></p>
  <div class="g-hol__opts">${opts.map((p, i) => holidayCard(p, h, where, null, i, { many: true, day: days[i] })).join('')}</div>` : `<div class="g-hol__empty"><span>${h.emoji}</span><p><b>No ${esc(h.short)} options yet.</b> The curator tags places with <code>${h.tag}</code>; they’ll show up here in day order.</p></div>`}
</section>`;
}
const manyTally = (opts) => {
  const n = (v) => opts.filter((p) => p.verdict === v).length;
  const left = opts.filter((p) => !p.verdict).length;
  return [n('must') && `${n('must')} Must`, n('maybe') && `${n('maybe')} Maybe`, n('skip') && `${n('skip')} Skip`, left && `${left} not called yet`].filter(Boolean).join(' · ');
};

function holidayCard(p, h, where, lockedId, i, { many = false, day = null } = {}) {
  const f = p.facts || {};
  const isLocked = p.id === lockedId;
  if (many && day) where = countryOn(day, S.data.countries) || where;
  const media = p.thumb ? `<img src="${esc(p.thumb.replace(/-\d+\.webp$/, '-1280.webp'))}" onerror="this.onerror=null;this.src='${esc(p.thumb)}'" alt="" loading="lazy">` : `<span class="g-hc__type">${esc(p.name_local || p.name)}</span>`;
  const book = p.booking.level === 'required' ? `<span class="g-fact__v g-warn">Must book · ${p.booking.lead_days ?? '?'} days ahead</span>` : p.booking.level === 'recommended' ? `<span class="g-fact__v">Recommended · ${p.booking.lead_days ?? '?'} day${p.booking.lead_days === 1 ? '' : 's'} ahead</span>` : '<span class="g-fact__v">No booking needed</span>';
  const fact = (ic, label, val) => (val ? `<li><span class="g-fact__i">${ic}</span><span class="g-fact__l">${label}</span>${val.startsWith('<') ? val : `<span class="g-fact__v">${esc(val)}</span>`}</li>` : '');
  return `<article class="g-hc${isLocked ? ' is-locked' : ''}" data-cat="${esc(p.category)}" data-id="${esc(p.id)}"${many ? ` data-round="place" data-v="${p.verdict || 'none'}"` : ''} style="--i:${i}">
  <div class="g-hc__media${p.thumb ? '' : ' g-hc__media--type'}">${media}
    <div class="g-hc__badges">${many && day ? `<span class="g-hc__badge g-hc__badge--day">${esc(fmtDate(day, WDM))}</span>` : ''}${!many && i === 0 && (p.games || 0) > 0 && !isLocked ? '<span class="g-hc__badge g-hc__badge--top">👑 Top pick</span>' : ''}${p.drone ? '<span class="g-hc__badge g-hc__badge--drone">🛸 Drone show</span>' : ''}${isLocked ? '<span class="g-hc__badge g-hc__badge--lock">🔒 Locked</span>' : ''}</div>
    <div class="g-hc__title"><h3>${esc(p.name)}</h3><p>${flag(p.country)} ${esc(p.cityName)}${p.area ? ` · ${esc(p.area)}` : ''}</p></div>
  </div>
  <ul class="g-hc__facts">
    ${many ? fact('🗓️', 'When', p.whenLabel) : ''}
    ${fact('💰', 'Cost', `<span class="g-fact__v"><b>${esc(brl(p.brl))}</b></span>`)}
    ${fact('📅', 'Booking', book)}
    ${fact(f.coldLevel === 'brutal' ? '🥶' : '🌡️', 'Cold', f.cold)}
    ${fact('👥', 'Crowds', f.crowd)}
    ${fact('❄️', 'Winter', f.winter && f.winter !== f.crowd ? f.winter : null)}
  </ul>
  ${where && p.country !== where ? `<p class="g-hc__warn">Heads up: you’re in ${flag(where)} ${esc(cname(where))} ${many && day ? 'that day' : `on ${esc(h.short)}`}, not ${esc(cname(p.country))}.</p>` : ''}
  ${many ? `<div class="g-hc__actions g-hc__actions--calls">
    <button class="g-btn g-btn--ghost" data-open="${esc(p.id)}">Details</button>
    <div class="g-seg g-seg--call" role="group" aria-label="Your call on ${esc(p.name)}">${['skip', 'maybe', 'must'].map((k) => `<button data-cv="${k}" class="g-seg__b g-seg__b--${k}${p.verdict === k ? ' is-on' : ''}" aria-pressed="${p.verdict === k}">${VERDICTS[k].label}</button>`).join('')}</div>
  </div>
</article>` : `<div class="g-hc__actions">
    <button class="g-btn g-btn--ghost" data-open="${esc(p.id)}">Details</button>
    ${isLocked ? `<button class="g-btn g-btn--locked" data-unlock="${h.id}">✓ Locked</button>` : `<button class="g-btn" data-lock="${h.id}" data-id="${esc(p.id)}">🔒 Lock it</button>`}
  </div>
</article>`}`;
}

function holidayDuel(h, pair) {
  const [a, b] = pair.map((id) => S.byId.get(id));
  if (!a || !b) return '';
  const mini = (p, side) => `<button class="g-hduel__side" data-hpick="${h.id}" data-side="${side}" data-cat="${esc(p.category)}">
    <span class="g-hduel__media">${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : `<span>${esc(p.name_local || p.name)}</span>`}</span>
    <b>${esc(p.name)}</b><small>${flag(p.country)} ${esc(p.cityName)} · ${esc(brl(p.brl))}${p.drone ? ' · 🛸' : ''}</small><span class="g-delta"></span></button>`;
  return `<div class="g-hduel"><p>${h.emoji} Which one for ${esc(h.short)}?</p><div class="g-hduel__pair">${mini(a, 'left')}<span class="g-vs g-vs--sm"><span>VS</span></span>${mini(b, 'right')}</div><button class="g-link" data-hdone="${h.id}">Done duelling</button></div>`;
}

function nextHolidayPair(hid) {
  const opts = holidayOptions(S.data.places, hid);
  const pair = pickPair(opts.map((p) => ({ id: p.id, country: p.country })), S.ratings, S.data.duels, { sameCountryBias: 0 });
  S.holidayDuel[hid] = pair ? pair.map((p) => p.id) : null;
}

function bindHolidays(v) {
  $$('[data-open]', v).forEach((x) => x.onclick = () => openPlace(x.dataset.open));
  $$('[data-lock]', v).forEach((x) => x.onclick = () => setLock(x.dataset.lock, x.dataset.id, x));
  $$('[data-unlock]', v).forEach((x) => x.onclick = () => setLock(x.dataset.unlock, null));
  // pick-many holidays: the card's own Must / Maybe / Skip (same call as in the deck and My calls)
  $$('.g-hc [data-cv]', v).forEach((x) => x.onclick = async () => {
    const card = x.closest('.g-hc'), sec = x.closest('.g-hol');
    await setCall(card, x.dataset.cv);
    const tally = $('.g-hol__tally', sec);
    if (tally) tally.textContent = manyTally(holidayOptions(S.data.places, sec.dataset.h));
  });
  $$('[data-hduel]', v).forEach((x) => x.onclick = () => { nextHolidayPair(x.dataset.hduel); rerenderHoliday(x.dataset.hduel); });
  $$('[data-hdone]', v).forEach((x) => x.onclick = () => { S.holidayDuel[x.dataset.hdone] = null; rerenderHoliday(x.dataset.hdone); });
  $$('[data-hpick]', v).forEach((x) => x.onclick = async () => {
    const hid = x.dataset.hpick;
    const [l, r] = S.holidayDuel[hid];
    const winner = x.dataset.side === 'left' ? l : r, loser = x.dataset.side === 'left' ? r : l;
    const { delta } = update(S.byId.get(winner).rating, S.byId.get(loser).rating);
    x.classList.add('is-win'); x.querySelector('.g-delta').textContent = `+${Math.round(delta)}`;
    x.parentElement.querySelector(`[data-side="${x.dataset.side === 'left' ? 'right' : 'left'}"]`)?.classList.add('is-lose');
    S.data.duels.push({ winner, loser }); recompute();
    api('/api/duel', { winner, loser }).catch((e) => toast(e.message, 'err'));
    await wait(550);
    nextHolidayPair(hid); rerenderHoliday(hid);
  });
}

function rerenderHoliday(hid) {
  const sec = $(`#hol-${hid}`);
  if (!sec) return;
  const before = new Map($$('.g-hc', sec).map((c) => [c.dataset.id, c.getBoundingClientRect()]));
  const tmp = document.createElement('div');
  tmp.innerHTML = holidaySection(HOLIDAYS[hid], S.data.local.locks?.[hid]);
  sec.replaceWith(tmp.firstElementChild);
  const ns = $(`#hol-${hid}`);
  if (!reduced) $$('.g-hc', ns).forEach((c) => { const o = before.get(c.dataset.id); if (!o) return; const n = c.getBoundingClientRect(); const dx = o.left - n.left, dy = o.top - n.top; if (Math.abs(dx) + Math.abs(dy) > 2) c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' }); });
  bindHolidays(ns);
}

async function setLock(hid, id, el) {
  const locks = (S.data.local.locks ||= {});
  const prevLocks = { ...locks };
  if (id) locks[hid] = id; else delete locks[hid];
  try { await api('/api/local', { locks: { [hid]: id } }); } catch (e) {
    S.data.local.locks = prevLocks; toast(`Couldn’t save the lock: ${e.message}`, 'err');
    if (S.route === 'holidays') rerenderHoliday(hid);
    return;
  }
  if (id) { const r = el?.getBoundingClientRect(); confetti(r ? r.left + r.width / 2 : innerWidth / 2, r ? r.top : innerHeight / 2); toast(`${HOLIDAYS[hid].emoji} Locked: ${S.byId.get(id)?.name}`); }
  renderTabs();
  if (S.route === 'holidays') rerenderHoliday(hid);
}

// ---------------------------------------------------------------- place sheet
function openPlace(id, { ask } = {}) {
  const p = S.byId.get(id);
  if (!p) return;
  closeDeckNote();
  const sheet = $('#sheet');
  sheet.innerHTML = `<div class="g-sheet__backdrop" data-close></div>
  <div class="g-sheet__panel" role="dialog" aria-modal="true" aria-label="${esc(p.name)}" data-cat="${esc(p.category)}"${TZ_OFFSET[p.country] === undefined ? '' : ` data-tz="${TZ_OFFSET[p.country]}"`}>
    <div class="g-sheet__bar">
      <button class="g-sheet__close" data-close aria-label="Close (Esc)">${icon('<path d="M6 6l12 12M18 6 6 18"/>')}</button>
      <b class="g-sheet__title">${esc(p.name)}</b>
      <div class="g-seg" role="group" aria-label="Your call">${['skip', 'maybe', 'must'].map((k) => `<button data-sv="${k}" class="g-seg__b g-seg__b--${k}${p.verdict === k ? ' is-on' : ''}">${VERDICTS[k].label}</button>`).join('')}</div>
      <button class="g-sheet__ask" data-ask>Ask ✦</button>
    </div>
    <div class="g-sheet__note">${noteEditor('place', id, { variant: 'sheet' })}</div>
    <iframe class="g-sheet__frame" src="/place/${encodeURIComponent(id)}?embed=1${ask ? '#ask' : ''}" title="${esc(p.name)}"></iframe>
  </div>`;
  sheet.hidden = false;
  document.body.classList.add('has-sheet');
  requestAnimationFrame(() => sheet.classList.add('is-open'));
  $$('[data-close]', sheet).forEach((x) => x.onclick = closeSheet);
  bindNotes(sheet);
  $('[data-ask]', sheet).onclick = () => { const f = $('.g-sheet__frame', sheet); f.contentWindow?.postMessage({ atr: 'ask' }, location.origin); };
  $$('[data-sv]', sheet).forEach((b) => b.onclick = async () => {
    const verdict = b.dataset.sv;
    $$('[data-sv]', sheet).forEach((x) => x.classList.toggle('is-on', x === b));
    p.verdict = verdict; p.isNew = false; S.undone.delete(`place:${id}`); recompute();
    try { await api('/api/swipe', { round: 'place', id, verdict }); toast(`${VERDICTS[verdict].label}: ${p.short || p.name}`); } catch (e) { toast(e.message, 'err'); }
    S.sheetDirty = true;
  });
  S.sheetFocus = document.activeElement;
  $('.g-sheet__close', sheet).focus();
}

// Same sheet as a place: the curator's full area page, with your call and Ask in the bar.
function openArea(id, { ask } = {}) {
  const a = S.data.areas.find((x) => x.id === id);
  if (!a) return;
  closeDeckNote();
  const sheet = $('#sheet');
  sheet.innerHTML = `<div class="g-sheet__backdrop" data-close></div>
  <div class="g-sheet__panel" role="dialog" aria-modal="true" aria-label="${esc(a.name)}"${TZ_OFFSET[a.country] === undefined ? '' : ` data-tz="${TZ_OFFSET[a.country]}"`}>
    <div class="g-sheet__bar">
      <button class="g-sheet__close" data-close aria-label="Close (Esc)">${icon('<path d="M6 6l12 12M18 6 6 18"/>')}</button>
      <b class="g-sheet__title">${esc(a.name)}</b>
      <div class="g-seg" role="group" aria-label="Your call">${['skip', 'maybe', 'must'].map((k) => `<button data-sv="${k}" class="g-seg__b g-seg__b--${k}${a.verdict === k ? ' is-on' : ''}">${VERDICTS[k].label}</button>`).join('')}</div>
      <button class="g-sheet__ask" data-ask>Ask ✦</button>
    </div>
    <div class="g-sheet__note">${noteEditor('area', id, { variant: 'sheet' })}</div>
    <iframe class="g-sheet__frame" src="/area/${encodeURIComponent(id)}?embed=1${ask ? '#ask' : ''}" title="${esc(a.name)}"></iframe>
  </div>`;
  sheet.hidden = false;
  document.body.classList.add('has-sheet');
  requestAnimationFrame(() => sheet.classList.add('is-open'));
  $$('[data-close]', sheet).forEach((x) => x.onclick = closeSheet);
  bindNotes(sheet);
  $('[data-ask]', sheet).onclick = () => { $('.g-sheet__frame', sheet).contentWindow?.postMessage({ atr: 'ask' }, location.origin); };
  $$('[data-sv]', sheet).forEach((b) => b.onclick = async () => {
    const verdict = b.dataset.sv;
    $$('[data-sv]', sheet).forEach((x) => x.classList.toggle('is-on', x === b));
    const prev = a.verdict;
    a.verdict = verdict; a.isNew = false; S.undone.delete(`area:${id}`);
    S.sheetDirty = true;
    try { await api('/api/swipe', { round: 'area', id, verdict }); S.undo.push({ round: 'area', id, prev }); toast(`${VERDICTS[verdict].label}: ${a.name}`); closeSheet(); renderTabs(); } catch (e) { a.verdict = prev; toast(e.message, 'err'); }
  });
  S.sheetFocus = document.activeElement;
  $('.g-sheet__close', sheet).focus();
}

function closeSheet() {
  const sheet = $('#sheet');
  if (sheet.hidden) return;
  flushNotes(sheet);
  sheet.classList.remove('is-open');
  document.body.classList.remove('has-sheet');
  setTimeout(() => { sheet.hidden = true; sheet.innerHTML = ''; }, reduced ? 0 : 280);
  if (S.sheetDirty) { S.sheetDirty = false; render(false); }
  S.sheetFocus?.focus?.();
}

window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  if (e.data?.atr === 'close') closeSheet();
  if (e.data?.atr === 'asked') S.data.questions++;
  if (e.data?.atr === 'open' && e.data.id) openPlace(e.data.id);
});

// ---------------------------------------------------------------- notes
// One shared editor (sheet, deck, My calls). Autosaves on blur and after a pause in typing; the log
// (feedback/notes.jsonl) is append-only and the latest line per card wins, so every save is one line.
const NOTE_PAUSE_MS = 1200;
const itemOf = (round, id) => (round === 'area' ? S.data.areas.find((a) => a.id === id) : S.byId.get(id));
const noteKey = (round, id) => `${round}:${id}`;
const notedCount = () => S.data.places.filter((p) => p.note).length + S.data.areas.filter((a) => a.note).length;
const noteTimers = new Map(); // textarea → timer
const noteChains = new Map(); // key → promise (saves per card run in order)
let noteSaving = 0;
const noteBusy = () => noteSaving > 0 || noteTimers.size > 0 || !!document.activeElement?.closest?.('.g-note');

function noteSnip(text, cls) {
  const one = String(text).replace(/\s+/g, ' ').trim();
  return `<span class="g-snip ${cls}" title="${esc(one)}">${icon(PEN, 13)}<span>${esc(one)}</span></span>`;
}

function noteEditor(round, id, { variant = 'sheet', placeholder } = {}) {
  const it = itemOf(round, id);
  const text = it?.note || '';
  const ph = placeholder || 'Add a note: why this call?';
  return `<div class="g-note g-note--${variant}${text ? ' has-note' : ''}" data-note="${round}" data-note-id="${esc(id)}">
    <span class="g-note__ic" aria-hidden="true">${icon(PEN, 16)}</span>
    <textarea class="g-note__ta" rows="1" maxlength="2000" spellcheck="true" aria-label="Your note on ${esc(it?.name || id)}" placeholder="${esc(ph)}">${esc(text)}</textarea>
    <span class="g-note__state" aria-live="polite"></span>
  </div>`;
}

function growNote(ta) {
  if (ta.closest('.g-decknote')) return;
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight + 2}px`;
}

function bindNotes(root) {
  $$('.g-note', root).forEach((box) => {
    const ta = $('textarea', box);
    if (!ta || ta.dataset.bound) return;
    ta.dataset.bound = '1';
    requestAnimationFrame(() => growNote(ta));
    ta.addEventListener('input', () => {
      growNote(ta);
      noteState(box, '');
      clearTimeout(noteTimers.get(ta));
      noteTimers.set(ta, setTimeout(() => { noteTimers.delete(ta); saveNoteFrom(box); }, NOTE_PAUSE_MS));
    });
    ta.addEventListener('blur', () => { if (noteTimers.has(ta)) { clearTimeout(noteTimers.get(ta)); noteTimers.delete(ta); } saveNoteFrom(box); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault(); e.stopPropagation();
        ta.blur();
        if (box.closest('.g-decknote')) closeDeckNote();
      }
    });
    // On a phone, keep the field in view above the on-screen keyboard.
    ta.addEventListener('focus', () => { if (matchMedia('(max-width: 720px)').matches) setTimeout(() => ta.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }), 280); });
  });
}

function noteState(box, kind) {
  const el = $('.g-note__state', box);
  if (!el) return;
  clearTimeout(el._t);
  el.dataset.kind = kind;
  el.textContent = kind === 'saving' ? 'Saving…' : kind === 'saved' ? 'Saved' : kind === 'error' ? 'Not saved' : '';
  if (kind === 'saved') el._t = setTimeout(() => { el.dataset.kind = ''; el.textContent = ''; }, 1800);
}

/** Save now (cancels a pending pause timer). Reads the text synchronously so closing the sheet right after is safe. */
function saveNoteFrom(box) {
  const ta = $('textarea', box);
  if (!ta) return Promise.resolve();
  if (noteTimers.has(ta)) { clearTimeout(noteTimers.get(ta)); noteTimers.delete(ta); }
  return saveNote(box.dataset.note, box.dataset.noteId, ta.value, box);
}

function saveNote(round, id, raw, box) {
  const text = String(raw).trim();
  const key = noteKey(round, id);
  const prev = noteChains.get(key) || Promise.resolve();
  const run = prev.then(async () => {
    const it = itemOf(round, id);
    if (!it || (it.note || '') === text) return;
    noteSaving++;
    if (box?.isConnected) noteState(box, 'saving');
    try {
      const r = await api('/api/note', { round, id, text });
      const cur = itemOf(round, id);
      if (cur) cur.note = r.note || null;
      if (box?.isConnected) noteState(box, 'saved');
      syncNote(round, id, box);
      if (!$('#sheet').hidden) S.sheetDirty = true;
    } catch (e) {
      if (box?.isConnected) noteState(box, 'error');
      toast(`Couldn’t save your note: ${e.message}`, 'err');
    } finally { noteSaving--; }
  });
  noteChains.set(key, run);
  return run;
}

function flushNotes(root = document) {
  return Promise.all($$('.g-note', root).filter((b) => { const ta = $('textarea', b); return ta && (noteTimers.has(ta) || ta.value.trim() !== (itemOf(b.dataset.note, b.dataset.noteId)?.note || '')); }).map(saveNoteFrom));
}

/** After a save: update every other editor and marker for this card that's on screen. */
function syncNote(round, id, from) {
  const it = itemOf(round, id);
  const text = it?.note || '';
  $$(`.g-note[data-note="${round}"]`).filter((b) => b.dataset.noteId === id).forEach((b) => {
    b.classList.toggle('has-note', !!text);
    const ta = $('textarea', b);
    if (b !== from && ta && document.activeElement !== ta) { ta.value = text; growNote(ta); }
  });
  const deck = $('#deck');
  if (deck && deck.dataset.round === round) {
    const card = $$('.g-card', deck).find((c) => c.dataset.id === id);
    if (card) {
      $$('.g-notechip, .g-notechip-li', card).forEach((x) => x.remove());
      if (text) {
        const meta = $('.atr-card__meta', card), chips = $('.area-card__body .chips', card);
        if (meta) meta.insertAdjacentHTML('beforeend', NOTE_CHIP);
        else if (chips) chips.insertAdjacentHTML('beforeend', `<li class="g-notechip-li">${NOTE_CHIP}</li>`);
      }
    }
    syncNoteBtn();
  }
  const call = $$('.g-call').find((c) => c.dataset.round === round && c.dataset.id === id);
  if (call) call.classList.toggle('has-note', !!text);
  const cnt = $('.g-calls__count');
  if (cnt) cnt.innerHTML = callsCountHtml();
}

// Deck: a small note panel over the bottom of the top card ("Note" button or N).
function syncNoteBtn() {
  const b = $('[data-act="note"]');
  const t = topCard();
  if (!b) return;
  const it = t ? itemOf($('#deck').dataset.round, t.dataset.id) : null;
  b.classList.toggle('has-note', !!it?.note);
  b.classList.toggle('is-on', !!S.deckNote);
  b.setAttribute('aria-expanded', S.deckNote ? 'true' : 'false');
  b.setAttribute('aria-label', it?.note ? 'Edit your note (N)' : 'Add a note (N)');
}

function toggleDeckNote(forceOpen) {
  if (S.deckNote && !forceOpen) return closeDeckNote();
  const t = topCard();
  const deck = $('#deck');
  if (!t || !deck) return;
  if (S.deckNote) { $('.g-decknote textarea')?.focus(); return; }
  const round = deck.dataset.round, id = t.dataset.id;
  const it = itemOf(round, id);
  S.deckNote = { round, id };
  // The panel takes the place of the card's text area (below the photo on a phone, beside it on desktop).
  t.classList.add('is-noting');
  t.insertAdjacentHTML('beforeend', `<div class="g-decknote" role="group" aria-label="Note on ${esc(it?.name || id)}">
    <div class="g-decknote__head"><span>Your note on <b>${esc(it?.short || it?.name || id)}</b></span><button class="g-decknote__done" data-act="note-done">Done</button></div>
    ${noteEditor(round, id, { variant: 'deck', placeholder: `Why this call? e.g. ${round === 'area' ? '“Must, but only if I go in January”' : '“Only if it’s not raining”'}. Saves as you type; the curator reads it too.` })}
  </div>`);
  const panel = $('.g-decknote', t);
  // Typing and tapping in the panel must never start a drag or open the card.
  for (const ev of ['pointerdown', 'click']) panel.addEventListener(ev, (e) => e.stopPropagation());
  placeDeckNote();
  bindNotes(panel);
  $('[data-act="note-done"]', panel).onclick = () => closeDeckNote();
  syncNoteBtn();
  const ta = $('textarea', panel);
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

/** Size the panel to the card's text area, with the card's own corner radius on the outer corners. */
function placeDeckNote() {
  const card = $('.g-card.is-noting');
  const panel = card && $('.g-decknote', card);
  const body = card && $('.atr-card__body, .area-card__body', card);
  const art = card && $('.atr-card, .area-card', card);
  if (!panel || !body || !art) return;
  const c = card.getBoundingClientRect(), b = body.getBoundingClientRect();
  const side = b.left - c.left > 8; // desktop: text beside the photo
  const r = getComputedStyle(art).borderBottomRightRadius;
  Object.assign(panel.style, { top: `${b.top - c.top}px`, left: `${b.left - c.left}px`, width: `${b.width}px`, height: `${b.height}px`, borderRadius: side ? `0 ${r} ${r} 0` : `0 0 ${r} ${r}` });
  panel.dataset.side = side ? '1' : '';
}
window.addEventListener('resize', () => { if (S.deckNote) placeDeckNote(); });

function closeDeckNote() {
  const panel = $('.g-decknote');
  S.deckNote = null;
  if (panel) {
    flushNotes(panel);
    const card = panel.closest('.g-card');
    panel.classList.add('is-out');
    setTimeout(() => { panel.remove(); card?.classList.remove('is-noting'); }, reduced ? 0 : 160);
  }
  syncNoteBtn();
}

// ---------------------------------------------------------------- my calls
// Every card you swiped (and any card with a note), with the call and the note editable inline.
function callItems() {
  const d = S.data;
  const order = d.countries.map((c) => c.id);
  const ci = (c) => (order.indexOf(c) + 1 || 99);
  const vr = { must: 0, maybe: 1, skip: 2 };
  const rows = [
    ...d.areas.filter((a) => a.verdict || a.note).map((a) => ({ round: 'area', it: a })),
    ...d.places.filter((p) => p.verdict || p.note).map((p) => ({ round: 'place', it: p })),
  ];
  return rows.sort((a, b) => (a.round === b.round ? 0 : a.round === 'area' ? -1 : 1) || ci(a.it.country) - ci(b.it.country) || (vr[a.it.verdict] ?? 3) - (vr[b.it.verdict] ?? 3) || a.it.name.localeCompare(b.it.name));
}

function callsCountHtml() {
  const all = callItems();
  const n = notedCount();
  return `<b>${all.filter((x) => x.it.verdict).length}</b> calls · <b>${n}</b> note${n === 1 ? '' : 's'}`;
}

function viewCalls(v) {
  const all = callItems();
  const F = S.callsFilter;
  if (!all.length) {
    v.innerHTML = emptyState('✍️', 'No calls yet', 'Swipe a few cards first. Every Must, Maybe and Skip shows up here, and you can add the reason behind each one: tap Note on any card.', S.data.areas.some((a) => !a.verdict) ? '#/areas' : '#/swipe', 'Start swiping');
    return;
  }
  const countries = S.data.countries.filter((c) => all.some((x) => x.it.country === c.id));
  if (F.country !== 'all' && !countries.some((c) => c.id === F.country)) F.country = 'all';
  const shown = all.filter((x) => (F.round === 'all' || x.round === F.round) && (F.verdict === 'all' || x.it.verdict === F.verdict) && (F.country === 'all' || x.it.country === F.country) && (!F.noted || x.it.note));
  const cnt = (pred) => all.filter(pred).length;
  const chip = (key, val, label, n, extra = '') => `<button class="g-filter${F[key] === val ? ' is-on' : ''}${extra}" data-cf="${key}" data-val="${val}" aria-pressed="${F[key] === val}">${label}${n !== undefined ? ` <span>${n}</span>` : ''}</button>`;
  const groups = ['area', 'place'].map((round) => [round, shown.filter((x) => x.round === round)]).filter(([, xs]) => xs.length);
  const byCountry = (xs) => { const out = []; for (const x of xs) { let g = out.find((o) => o.c === x.it.country); if (!g) out.push(g = { c: x.it.country, xs: [] }); g.xs.push(x); } return out; };
  const groupBody = (round, xs) => {
    const parts = byCountry(xs);
    if (round === 'area' && parts.length < 2) return `<div class="g-calls">${xs.map((x) => callRow(x.round, x.it)).join('')}</div>`;
    return parts.map((g) => `<h3 class="g-calls__sub">${flag(g.c)} ${esc(cname(g.c))} <span>${g.xs.length}</span></h3><div class="g-calls">${g.xs.map((x) => callRow(x.round, x.it)).join('')}</div>`).join('');
  };
  v.innerHTML = `<section class="g-callsview wrap">
  <header class="g-head">
    <div><p class="eyebrow">Your verdicts and the reasons</p><h1 class="g-h1">My calls</h1></div>
    <p class="g-calls__count">${callsCountHtml()}</p>
  </header>
  <p class="g-lede">Change a call or write down why you made it. Notes save as you type and go to the curator with your swipes.</p>
  <div class="g-filters g-filters--calls">
    ${chip('round', 'all', 'All', all.length)}${chip('round', 'area', 'Areas', cnt((x) => x.round === 'area'))}${chip('round', 'place', 'Places', cnt((x) => x.round === 'place'))}
    <span class="g-filters__sep" aria-hidden="true"></span>
    ${['must', 'maybe', 'skip'].map((k) => chip('verdict', k, VERDICTS[k].label, cnt((x) => x.it.verdict === k), ` g-filter--${k}`)).join('')}
    <span class="g-filters__sep" aria-hidden="true"></span>
    <button class="g-filter g-filter--note${F.noted ? ' is-on' : ''}" data-cf="noted" aria-pressed="${F.noted}">${icon(PEN, 14)} With notes <span>${notedCount()}</span></button>
  </div>
  ${countries.length > 1 ? `<div class="g-filters g-filters--calls">${chip('country', 'all', 'All countries')}${countries.map((c) => chip('country', c.id, `${c.flag} ${esc(c.name)}`, cnt((x) => x.it.country === c.id))).join('')}</div>` : ''}
  ${groups.length ? groups.map(([round, xs]) => `<section class="g-calls__group">
    <h2 class="g-calls__h">${round === 'area' ? 'Areas' : 'Places'} <span>${xs.length}</span></h2>
    ${groupBody(round, xs)}
  </section>`).join('') : `<div class="g-calls__none"><p>${F.noted && !notedCount() ? '<b>No notes yet.</b> Tap <b>Note</b> on any card, or write one right here under any call.' : '<b>Nothing matches these filters.</b>'}</p><button class="g-link" data-act="calls-reset">Show everything</button></div>`}
</section>`;
  $$('[data-cf]', v).forEach((b) => b.onclick = () => {
    const k = b.dataset.cf;
    if (k === 'noted') F.noted = !F.noted;
    else F[k] = F[k] === b.dataset.val && k !== 'round' && b.dataset.val !== 'all' ? 'all' : b.dataset.val;
    flushNotes(v); viewCalls(v);
  });
  $('[data-act="calls-reset"]', v)?.addEventListener('click', () => { S.callsFilter = { round: 'all', verdict: 'all', country: 'all', noted: false }; viewCalls(v); });
  $$('[data-copen]', v).forEach((b) => b.onclick = () => { const r = b.closest('.g-call'); (r.dataset.round === 'area' ? openArea : openPlace)(r.dataset.id); });
  $$('.g-call [data-cv]', v).forEach((b) => b.onclick = () => setCall(b.closest('.g-call'), b.dataset.cv));
  $$('.g-call', v).forEach(bindCallNote);
  bindNotes(v);
}

const ADD_NOTE = `<button class="g-call__add" data-addnote>${icon('<path d="M12 5v14M5 12h14"/>', 15)}Add a note</button>`;
/** An empty note is a small "+ Add a note" button; it opens the editor and folds back if left empty. */
function bindCallNote(row) {
  const add = $('[data-addnote]', row);
  if (add) add.onclick = () => {
    add.outerHTML = noteEditor(row.dataset.round, row.dataset.id, { variant: 'row', placeholder: 'Why this call?' });
    bindNotes(row);
    bindCallNote(row);
    $('.g-note textarea', row)?.focus();
  };
  const box = $('.g-note', row);
  if (box && !box.dataset.fold) {
    box.dataset.fold = '1';
    box.addEventListener('focusout', async () => {
      await new Promise((r) => setTimeout(r, 0));
      await noteChains.get(noteKey(row.dataset.round, row.dataset.id));
      const ta = $('textarea', box);
      if (!box.isConnected || document.activeElement === ta || ta.value.trim() || itemOf(row.dataset.round, row.dataset.id)?.note) return;
      box.outerHTML = ADD_NOTE;
      bindCallNote(row);
    });
  }
}

function callRow(round, it) {
  const media = round === 'place' && it.thumb ? `<img src="${esc(it.thumb)}" alt="" loading="lazy">` : `<span>${round === 'area' ? flag(it.country) || '🗺️' : esc(catOf(it.category).icon)}</span>`;
  const meta = round === 'area' ? `${flag(it.country)} ${esc(cname(it.country))} · area` : `${flag(it.country)} ${esc(it.cityName)} · ${esc(catOf(it.category).label)}`;
  return `<article class="g-call${it.note ? ' has-note' : ''}" data-round="${round}" data-id="${esc(it.id)}" data-v="${it.verdict || 'none'}"${round === 'place' ? ` data-cat="${esc(it.category)}"` : ''}>
    <div class="g-call__head">
      <button class="g-call__open" data-copen aria-label="Open ${esc(it.name)}">
        <span class="g-call__thumb">${media}</span>
        <span class="g-call__name"><b>${esc(it.name)}</b><small>${meta}</small></span>
      </button>
      <div class="g-seg g-seg--call" role="group" aria-label="Your call on ${esc(it.name)}">${['skip', 'maybe', 'must'].map((k) => `<button data-cv="${k}" class="g-seg__b g-seg__b--${k}${it.verdict === k ? ' is-on' : ''}" aria-pressed="${it.verdict === k}">${VERDICTS[k].label}</button>`).join('')}</div>
    </div>
    ${it.note ? noteEditor(round, it.id, { variant: 'row', placeholder: 'Why this call?' }) : ADD_NOTE}
  </article>`;
}

async function setCall(row, verdict) {
  const round = row.dataset.round, id = row.dataset.id;
  const it = itemOf(round, id);
  if (!it || it.verdict === verdict) return;
  const prev = it.verdict;
  const mark = (v) => { row.dataset.v = v || 'none'; $$('[data-cv]', row).forEach((x) => { x.classList.toggle('is-on', x.dataset.cv === v); x.setAttribute('aria-pressed', x.dataset.cv === v); }); };
  mark(verdict);
  it.verdict = verdict; it.isNew = false; S.undone.delete(`${round}:${id}`);
  if (round === 'place') recompute();
  try {
    await api('/api/swipe', { round, id, verdict });
    toast(`${VERDICTS[verdict].label}: ${it.short || it.name}`);
  } catch (e) {
    it.verdict = prev; mark(prev); if (round === 'place') recompute();
    toast(`Couldn’t save: ${e.message}`, 'err');
  }
  renderTabs();
  const cnt = $('.g-calls__count');
  if (cnt) cnt.innerHTML = callsCountHtml();
}

// ---------------------------------------------------------------- route
// A map of the whole trip (cached OSM tiles stitched by the server + an SVG overlay) and, per country, the ordered
// list of stops the traveler builds. Edits save to feedback/route.jsonl (the whole list per country; latest wins).
const RT = { data: null, view: 'all', sel: null, skipped: false, vb: null, anim: 0, timers: new Map(), seq: new Map(), ro: null,
  edit: false }; // the map opens read-only; the reorder, remove, add and nights controls show only after "Edit route"
const ROUTE_SAVE_MS = 600;
const VERDICT_LABEL = { must: 'Must', maybe: 'Maybe', skip: 'Skip' };
const plural = (n, w, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const fmtWeek = (d) => fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' });

function routeHomeLink() {
  const r = S.data.route;
  if (!r) return '';
  return `<a class="g-callslink g-routelink" href="#/route">${icon(ROUTE_ICON, 18)}<span><b>Route map</b> ${plural(r.stops, 'stop')} in order${r.unplaced ? ` · ${r.unplaced} must ${r.unplaced === 1 ? 'city' : 'cities'} not placed` : ''}</span><span aria-hidden="true">→</span></a>`;
}

async function loadRoute() {
  const d = await api('/api/route');
  if (RT.data) {
    // keep local edits that are still waiting to be saved
    for (const c of d.countries) if (RT.timers.has(c.id)) { const mine = RT.data.countries.find((x) => x.id === c.id); if (mine) c.stops = mine.stops; }
  }
  RT.data = d;
}

/** Legs with dates per stop, a trip-wide stop number and the cities to show on the map. */
function routeLegs() {
  let n = 0;
  return RT.data.countries.map((c) => {
    const plan = RM.legPlan({ from: c.from, nights: c.nights, stops: c.stops });
    const stops = plan.stops.map((s, i) => ({ ...s, i, n: ++n, key: `${c.id}/${s.area}`, located: typeof s.lat === 'number' && typeof s.lng === 'number' }));
    const inRoute = new Set(stops.map((s) => s.area));
    const others = c.cities.filter((x) => !inRoute.has(x.area)).map((x) => ({ ...x, key: `${c.id}/${x.area}` }));
    return { c, plan, stops, others };
  });
}

async function viewRoute(v) {
  if (!RT.data) v.innerHTML = '<div class="g-loading"><span></span><span></span><span></span></div>';
  try { await routeLib(); await loadRoute(); } catch (e) {
    if (!RT.data || !RM) { v.innerHTML = emptyState('🗺️', 'The route map isn’t ready', `The game server needs a restart to serve the Route tab (${e.message}).`, '#/game', 'Back to the overview'); return; }
  }
  if (S.route !== 'route') return;
  if (RT.view !== 'all' && !RT.data.countries.some((c) => c.id === RT.view)) RT.view = 'all';
  const legs = routeLegs();
  const all = RT.data.countries;
  const placed = legs.reduce((n, l) => n + l.stops.length, 0);
  const unplaced = legs.reduce((n, l) => n + l.others.filter((x) => x.verdict === 'must').length, 0);
  const lh = RT.data.longHaul;
  v.innerHTML = `<section class="g-routeview wrap">
  <header class="g-head">
    <div><p class="eyebrow">${all.length ? `${fmtDate(all[0].from)} → ${fmtDate(all.at(-1).to)} · ${all.length} legs` : 'The trip'}</p><h1 class="g-h1">Route</h1></div>
    <div class="g-route__end"><p class="g-route__sum" id="rsum">${routeSumHtml(placed, unplaced)}</p>
      <button class="g-btn ${RT.edit ? '' : 'g-btn--ghost '}g-route__edit" data-editroute aria-pressed="${RT.edit}">${RT.edit ? 'Done editing' : `${icon(PEN, 16)}Edit route`}</button></div>
  </header>
  <nav class="g-filters g-legs" id="rlegs" aria-label="Zoom the map">${legChips()}</nav>
  <div class="g-route">
    <div class="g-route__mapcol">
      <div class="g-map is-loading" id="rmap" data-view="${RT.view}">
        <svg class="g-map__base" preserveAspectRatio="none" aria-hidden="true"></svg>
        <svg class="g-map__ov" role="img" aria-label="Map of the route"></svg>
        <span class="g-map__wait" aria-hidden="true">Drawing the map…</span>
        <button class="g-map__back" data-zoom="all"${RT.view === 'all' ? ' hidden' : ''}>${icon('<path d="M15 6l-6 6 6 6"/>', 16)}Whole trip</button>
        <span class="g-map__osm">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors</span>
        <div class="g-pop" id="rpop" hidden></div>
      </div>
      <ul class="g-map__legend">
        <li><svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true"><path d="M2 5h24" class="rt-land"/></svg>Overland</li>
        <li><svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true"><path d="M2 5h24" class="rt-hop"/></svg>Flight between countries</li>
        <li><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" class="rt-pin--must"/></svg>Must, not placed yet</li>
        <li><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="4" class="rt-pin--maybe"/></svg>Maybe</li>
        <li><label class="g-map__skip"><input type="checkbox" id="rskip"${RT.skipped ? ' checked' : ''}> Show skipped</label></li>
      </ul>
      ${lh ? `<p class="g-map__fine">Flights: in from ${esc(lh.in.from)} (lands ${esc(fmtWeek(lh.in.date))}) and home to ${esc(lh.out.to)} around ${esc(fmtWeek(lh.out.date))}${lh.out.booked ? '' : ' (not booked)'}. Flights between countries fall on the leg boundary dates. Lines join stops in the order you set; nothing else is assumed.</p>` : ''}
      ${RT.data.warnings?.length ? `<p class="g-map__fine g-warn">${RT.data.warnings.map(esc).join('<br>')}</p>` : ''}
    </div>
    <div class="g-plan${RT.edit ? ' is-edit' : ''}" id="rplan">${RT.edit ? '<p class="g-plan__hint">Editing: changes save as you make them. Reset puts a country back to the agreed plan.</p>' : ''}${legs.map(legCard).join('')}</div>
  </div>
</section>`;
  bindRoute(v);
  initMap();
}

function routeSumHtml(placed, unplaced) {
  return `<b>${placed}</b> ${placed === 1 ? 'stop' : 'stops'} in order${unplaced ? ` · <b>${unplaced}</b> must ${unplaced === 1 ? 'city' : 'cities'} not placed` : ''}`;
}

function legChips() {
  return `<button class="g-filter${RT.view === 'all' ? ' is-on' : ''}" data-zoom="all" aria-pressed="${RT.view === 'all'}">Whole trip</button>${RT.data.countries.map((c) => `<button class="g-filter g-legchip${RT.view === c.id ? ' is-on' : ''}" data-zoom="${c.id}" aria-pressed="${RT.view === c.id}"><b>${c.n} ${c.flag} ${esc(c.name)}</b><small>${esc(fmtDate(c.from))} – ${esc(fmtDate(c.to))} · ${c.nights}n</small></button>`).join('')}`;
}

// ------------- plan panel
function legCard(l) {
  const { c, plan, stops, others } = l;
  const musts = others.filter((x) => x.verdict === 'must'), maybes = others.filter((x) => x.verdict === 'maybe');
  const meter = plan.status === 'over'
    ? `<b>${plan.planned}</b> nights planned: <b class="g-over">${plan.planned - c.nights} more</b> than the ${c.nights} in ${esc(c.name)}`
    : plan.status === 'ok' ? `✓ All <b>${c.nights}</b> nights placed`
    : plan.status === 'empty' ? `No nights set yet · <b>${c.nights}</b> to place`
    : `<b>${plan.planned}</b> of ${c.nights} nights placed · <b>${plan.left}</b> left`;
  const segs = stops.filter((s) => s.nights).map((s, i) => `<i style="flex:${s.nights}" class="g-seg${i % 2}" title="${esc(s.name)}: ${plural(s.nights, 'night')}"></i>`).join('') + (plan.left > 0 ? `<i style="flex:${plan.left}" class="g-seg-left"></i>` : '');
  const seeded = c.seed && JSON.stringify(c.seed) !== JSON.stringify(c.stops.map((s) => ({ area: s.area, nights: s.nights ?? null })));
  const chip = (x) => `<button class="g-addc g-addc--${x.verdict}" data-add="${esc(x.area)}" aria-label="Add ${esc(x.name)} to the ${esc(c.name)} route">${icon('<path d="M12 5v14M5 12h14"/>', 14)}${esc(x.name)}</button>`;
  return `<section class="g-leg${RT.view === c.id ? ' is-on' : ''}" id="leg-${c.id}" data-leg="${c.id}">
  <header class="g-leg__head">
    <button class="g-leg__title" data-zoom="${c.id}" aria-label="Show ${esc(c.name)} on the map"><span class="g-leg__n">${c.n}</span><span class="g-leg__name"><b>${c.flag} ${esc(c.name)}</b><small>${esc(fmtWeek(c.from))} – ${esc(fmtWeek(c.to))} · ${c.nights} nights</small></span></button>
    ${RT.edit && seeded && c.source === 'game' ? `<button class="g-link g-leg__reset" data-reset="${c.id}" title="Go back to the route in config/trip.yaml">Reset</button>` : ''}
  </header>
  <div class="g-nights g-nights--${plan.status}"><span class="g-nights__bar">${segs || '<i class="g-seg-left" style="flex:1"></i>'}</span><p>${meter}</p></div>
  ${stops.length ? `<ol class="g-stops">${stops.map((s) => stopRow(c, s, stops.length)).join('')}</ol>` : `<p class="g-muted g-stops__none">No stops yet. Add the first city below.</p>`}
  ${!RT.edit ? (musts.length ? `<p class="g-muted g-add__none">${plural(musts.length, 'Must city', 'Must cities')} not placed: ${musts.map((x) => esc(x.name)).join(', ')}.</p>` : '') : musts.length || maybes.length ? `<div class="g-add">
    ${musts.length ? `<p class="g-add__h">Must, not placed yet</p><div class="g-add__row">${musts.map(chip).join('')}</div>` : ''}
    ${maybes.length ? `<p class="g-add__h">Maybe</p><div class="g-add__row">${maybes.map(chip).join('')}</div>` : ''}
  </div>` : `<p class="g-muted g-add__none">${c.cities.length > stops.length ? `Every Must and Maybe city here is placed. Others are in the <a href="#/areas">Areas round</a>.` : 'No other cities for this country yet.'}</p>`}
</section>`;
}

function stopRow(c, s, total) {
  const when = s.start && s.end ? `${fmtDate(s.start)} → ${fmtDate(s.end)}` : s.start ? `from ${fmtDate(s.start)}` : 'dates open until the stops above have nights';
  const v = s.verdict && s.verdict !== 'must' ? ` · <em class="g-v g-v--${s.verdict}">${VERDICT_LABEL[s.verdict]}</em>` : '';
  const btn = (attr, label, path, dis) => `<button ${attr} aria-label="${label}"${dis ? ' disabled' : ''}>${icon(path, 18)}</button>`;
  return `<li class="g-stop" data-leg="${c.id}" data-i="${s.i}">
    <span class="g-stop__n">${s.n}</span>
    <button class="g-stop__name" data-city="${esc(s.key)}"><b>${esc(s.name)}</b><small>${when}${v}${s.located ? '' : ' · <em class="g-warn">no coordinates, not on the map</em>'}</small></button>
    ${!RT.edit ? `<span class="g-stop__nights">${s.nights ? plural(s.nights, 'night') : 'nights open'}</span>` : `<div class="g-stop__move">
      ${btn('data-move="-1"', `Move ${esc(s.name)} earlier`, '<path d="M12 19V5M6 11l6-6 6 6"/>', s.i === 0)}
      ${btn('data-move="1"', `Move ${esc(s.name)} later`, '<path d="M12 5v14M6 13l6 6 6-6"/>', s.i === total - 1)}
      ${btn('data-remove', `Remove ${esc(s.name)} from the route`, '<path d="M6 6l12 12M18 6 6 18"/>')}
    </div>
    <div class="g-nstep" role="group" aria-label="Nights in ${esc(s.name)}">
      <button data-nights="-1" aria-label="One night less in ${esc(s.name)}"${!s.nights ? ' disabled' : ''}>−</button>
      <input type="number" inputmode="numeric" min="1" max="90" value="${s.nights || ''}" placeholder="–" aria-label="Nights in ${esc(s.name)}">
      <button data-nights="1" aria-label="One night more in ${esc(s.name)}">+</button>
      <span class="g-nstep__u">${s.nights === 1 ? 'night' : 'nights'}</span>
    </div>`}
  </li>`;
}

function bindRoute(v) {
  const sec = $('.g-routeview', v);
  sec.addEventListener('click', onRouteClick);
  sec.addEventListener('change', onRouteChange);
  sec.addEventListener('input', onRouteInput);
}

function onRouteClick(e) {
  const t = e.target.closest('button, a, [data-city], [data-zoom]');
  if (!t || t.closest('.g-map__ov')) return; // the map overlay has its own handler
  if (t.dataset.zoom) { closePop(); zoomTo(t.dataset.zoom); return; }
  if (t.dataset.editroute !== undefined) { RT.edit = !RT.edit; flushRouteSaves(); render(false); return; }
  if (t.matches('.g-pop__x')) { closePop(); return; }
  if (t.dataset.openarea) { openArea(t.dataset.openarea); return; }
  if (t.dataset.popadd) { addStop(...t.dataset.popadd.split('/')); return; }
  if (t.dataset.popremove) { const [cid, area] = t.dataset.popremove.split('/'); const c = legOf(cid); removeStop(cid, c.stops.findIndex((s) => s.area === area)); return; }
  if (t.dataset.city && t.closest('.g-plan')) { const [cid] = t.dataset.city.split('/'); selectCity(t.dataset.city, { zoom: RT.view !== cid, scroll: true }); return; }
  if (t.dataset.add !== undefined) { addStop(t.closest('[data-leg]').dataset.leg, t.dataset.add); return; }
  if (t.dataset.reset) { resetLeg(t.dataset.reset); return; }
  const row = t.closest('.g-stop');
  if (!row) return;
  const cid = row.dataset.leg, i = Number(row.dataset.i);
  if (t.dataset.move) moveStop(cid, i, Number(t.dataset.move));
  else if (t.dataset.remove !== undefined) removeStop(cid, i);
  else if (t.dataset.nights) setNights(cid, i, (legOf(cid).stops[i].nights || 0) + Number(t.dataset.nights));
}

function onRouteChange(e) {
  if (e.target.id === 'rskip') { RT.skipped = e.target.checked; drawOverlay(); return; }
  const row = e.target.closest('.g-stop');
  if (row && e.target.matches('.g-nstep input')) setNights(row.dataset.leg, Number(row.dataset.i), e.target.value === '' ? null : Number(e.target.value), { keepInput: false });
}
function onRouteInput(e) {
  const row = e.target.closest('.g-stop');
  if (!row || !e.target.matches('.g-nstep input') || e.target.value === '') return;
  const n = Number(e.target.value);
  if (Number.isInteger(n) && n >= 1 && n <= 90) setNights(row.dataset.leg, Number(row.dataset.i), n, { keepInput: true });
}

const legOf = (cid) => RT.data.countries.find((c) => c.id === cid);

function setNights(cid, i, n, { keepInput = false } = {}) {
  const c = legOf(cid);
  const s = c?.stops[i];
  if (!s) return;
  const v = n === null || n < 1 ? null : Math.min(90, Math.round(n));
  if ((s.nights ?? null) === v) { if (!keepInput) rerenderLeg(cid); return; }
  s.nights = v;
  routeEdited(cid, { keepInput });
}
function moveStop(cid, i, d) {
  const st = legOf(cid).stops, j = i + d;
  if (j < 0 || j >= st.length) return;
  [st[i], st[j]] = [st[j], st[i]];
  routeEdited(cid, { focus: `.g-stop[data-i="${j}"] [data-move="${d}"]`, fallback: `.g-stop[data-i="${j}"] [data-move="${-d}"]` });
}
function removeStop(cid, i) {
  const c = legOf(cid);
  if (i < 0 || !c.stops[i]) return;
  const [gone] = c.stops.splice(i, 1);
  if (RT.sel === `${cid}/${gone.area}`) refreshPop();
  routeEdited(cid, { focus: `.g-stop[data-i="${Math.min(i, c.stops.length - 1)}"] [data-remove]`, fallback: `[data-leg="${cid}"] .g-addc` });
  toast(`${gone.name} is off the route`);
}
function addStop(cid, area) {
  const c = legOf(cid);
  const x = c?.cities.find((y) => y.area === area);
  if (!x || c.stops.some((s) => s.area === area)) return;
  c.stops.push({ area: x.area, name: x.name, lat: x.lat, lng: x.lng, nights: null, hasPage: x.hasPage, located: true, verdict: x.verdict, places: x.places });
  routeEdited(cid, { focus: `.g-stop[data-i="${c.stops.length - 1}"] .g-nstep input` });
  if (RT.sel === `${cid}/${area}`) refreshPop();
}
async function resetLeg(cid) {
  clearTimeout(RT.timers.get(cid)); RT.timers.delete(cid);
  try {
    const r = await api('/api/route', { country: cid, reset: true });
    const i = RT.data.countries.findIndex((c) => c.id === cid);
    RT.data.countries[i] = r.country;
    rerenderLeg(cid); drawOverlay(); updateRouteSum();
    toast(`${r.country.name}: back to the plan`);
  } catch (e) { toast(`Couldn’t reset: ${e.message}`, 'err'); }
}

/** After any edit: redraw the leg card, the map and the totals now; save after a short pause. */
function routeEdited(cid, { focus, fallback, keepInput } = {}) {
  const c = legOf(cid);
  c.source = 'game';
  if (keepInput) refreshLegMeta(cid); else rerenderLeg(cid, { focus, fallback });
  drawOverlay();
  updateRouteSum();
  if (RT.sel?.startsWith(`${cid}/`)) refreshPop();
  clearTimeout(RT.timers.get(cid));
  RT.timers.set(cid, setTimeout(() => saveLeg(cid), ROUTE_SAVE_MS));
}

async function saveLeg(cid, { keepalive = false } = {}) {
  RT.timers.delete(cid);
  const c = legOf(cid);
  if (!c) return;
  const seq = (RT.seq.get(cid) || 0) + 1;
  RT.seq.set(cid, seq);
  const stops = c.stops.map((s) => (s.nights ? { area: s.area, nights: s.nights } : { area: s.area }));
  try {
    const r = await fetch('/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: cid, stops }), keepalive });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    if (RT.seq.get(cid) === seq && !RT.timers.has(cid) && j.country) { c.ts = j.country.ts; c.source = j.country.source; }
    if (S.data.route) { const legs = routeLegs(); S.data.route.stops = legs.reduce((n, l) => n + l.stops.length, 0); S.data.route.unplaced = legs.reduce((n, l) => n + l.others.filter((x) => x.verdict === 'must').length, 0); }
  } catch (e) { toast(`Couldn’t save the ${c.name} route: ${e.message}`, 'err'); }
}
function flushRouteSaves() {
  for (const cid of [...RT.timers.keys()]) { clearTimeout(RT.timers.get(cid)); saveLeg(cid, { keepalive: true }); }
}
window.addEventListener('pagehide', flushRouteSaves);

function rerenderLeg(cid, { focus, fallback } = {}) {
  const el = $(`#leg-${cid}`);
  const l = routeLegs().find((x) => x.c.id === cid);
  if (!el || !l) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = legCard(l);
  el.replaceWith(tmp.firstElementChild);
  const f = (focus && $(`#leg-${cid} ${focus}`)) || (fallback && $(`#leg-${cid} ${fallback}`));
  if (f && !f.disabled) f.focus({ preventScroll: true });
  else if (focus || fallback) $(`#leg-${cid} .g-leg__title`)?.focus({ preventScroll: true });
}
/** While typing nights: update the meter and the dates without replacing the input being typed in. */
function refreshLegMeta(cid) {
  const el = $(`#leg-${cid}`);
  const l = routeLegs().find((x) => x.c.id === cid);
  if (!el || !l) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = legCard(l);
  const fresh = tmp.firstElementChild;
  $('.g-nights', el).replaceWith($('.g-nights', fresh));
  $$('.g-stop', el).forEach((row, i) => { const nr = $$('.g-stop', fresh)[i]; if (!nr) return; $('.g-stop__name small', row).innerHTML = $('.g-stop__name small', nr).innerHTML; $('.g-nstep__u', row).textContent = $('.g-nstep__u', nr).textContent; $('[data-nights="-1"]', row).disabled = $('[data-nights="-1"]', nr).disabled; });
}
function updateRouteSum() {
  const legs = routeLegs();
  const el = $('#rsum');
  if (el) el.innerHTML = routeSumHtml(legs.reduce((n, l) => n + l.stops.length, 0), legs.reduce((n, l) => n + l.others.filter((x) => x.verdict === 'must').length, 0));
}

// ------------- map
function mapSize() { const el = $('#rmap'); return el ? { W: el.clientWidth, H: el.clientHeight } : { W: 0, H: 0 }; }

/** The part of the world to show: the whole trip, or one country's stops and its Must/Maybe cities. */
function viewRect(view) {
  const legs = routeLegs();
  const pick = view === 'all' ? legs : legs.filter((l) => l.c.id === view);
  const pts = pick.flatMap((l) => [...l.stops.filter((s) => s.located), ...l.others.filter((x) => x.verdict === 'must' || x.verdict === 'maybe' || (RT.skipped && view !== 'all'))]);
  if (!pts.length) pts.push(...pick.flatMap((l) => l.c.cities));
  const world = 2 ** RM.WORLD_Z * RM.TILE;
  const b = RM.boundsOf(pts, { min: (view === 'all' ? 8 : 0.9) / 360 * world });
  if (!b) return null;
  if (view === 'all') b.h *= 1.1; // room at the bottom for the long-haul stub and its label
  return b;
}
function targetView(view) {
  const { W, H } = mapSize();
  const r = viewRect(view);
  return r && W && H ? RM.fitView(r, W, H, { pad: view === 'all' ? 0.07 : 0.16 }) : null;
}

function initMap() {
  const map = $('#rmap');
  if (!map) return;
  RT.vb = targetView(RT.view);
  drawBase();
  drawOverlay();
  RT.ro?.disconnect();
  let last = mapSize();
  RT.ro = new ResizeObserver(() => { const s = mapSize(); if (!$('#rmap')) { RT.ro.disconnect(); return; } if (Math.abs(s.W - last.W) + Math.abs(s.H - last.H) < 2) return; last = s; RT.vb = targetView(RT.view); drawBase(); drawOverlay(); });
  RT.ro.observe(map);
  const ov = $('.g-map__ov', map);
  ov.addEventListener('click', onMapClick);
  ov.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-city]')) { e.preventDefault(); selectCity(e.target.closest('[data-city]').dataset.city); } });
  // labels are measured with canvas text metrics: measure again once the web fonts are in
  document.fonts?.ready.then(() => { if ($('#rmap')) drawOverlay(); });
}

function drawBase() {
  const svg = $('#rmap .g-map__base');
  if (!svg || !RT.vb) return;
  const vb = RT.vb;
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const frames = RT.data.frames || {};
  const want = ['overview', ...(RT.view !== 'all' ? [RT.view] : [])].filter((k) => frames[k]);
  const have = $$('image', svg).map((i) => i.dataset.key);
  if (want.join() === have.join()) return;
  // keep loaded images; add the country's sharper image over the overview
  $$('image', svg).filter((i) => !want.includes(i.dataset.key)).forEach((i) => i.remove());
  for (const k of want) {
    if ($(`image[data-key="${k}"]`, svg)) continue;
    const f = frames[k];
    const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    img.setAttribute('href', f.url); img.setAttribute('x', f.rect.x); img.setAttribute('y', f.rect.y); img.setAttribute('width', f.rect.w); img.setAttribute('height', f.rect.h);
    img.setAttribute('preserveAspectRatio', 'none'); img.dataset.key = k; img.classList.add('g-map__img');
    img.addEventListener('load', () => { img.classList.add('is-in'); if (k === 'overview') $('#rmap')?.classList.remove('is-loading'); });
    img.addEventListener('error', () => { img.remove(); if (k === 'overview') { const m = $('#rmap'); m?.classList.remove('is-loading'); m?.classList.add('is-bare'); } });
    svg.append(img);
  }
}

function zoomTo(view) {
  if (!RT.data) return;
  if (view !== 'all' && !legOf(view)) view = 'all';
  RT.view = view;
  const map = $('#rmap');
  if (!map) return;
  map.dataset.view = view;
  $('.g-map__back', map).hidden = view === 'all';
  $('#rlegs').innerHTML = legChips();
  $$('.g-leg').forEach((el) => el.classList.toggle('is-on', el.dataset.leg === view));
  const to = targetView(view), from = RT.vb;
  drawBase();
  if (!to) return;
  if (reduced || !from) { RT.vb = to; drawBase(); drawOverlay(); return; }
  cancelAnimationFrame(RT.anim);
  const t0 = performance.now(), dur = 520;
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    RT.vb = RM.lerpView(from, to, t);
    const svg = $('#rmap .g-map__base');
    if (!svg) return;
    svg.setAttribute('viewBox', `${RT.vb.x} ${RT.vb.y} ${RT.vb.w} ${RT.vb.h}`);
    drawOverlay({ labels: t >= 1 });
    if (t < 1) RT.anim = requestAnimationFrame(step);
    else if (RT.sel) refreshPop();
  };
  RT.anim = requestAnimationFrame(step);
  const chips = $('#rlegs'), chip = $(`[data-zoom="${view}"]`, chips);
  if (chip) chips.scrollTo({ left: chip.offsetLeft - (chips.clientWidth - chip.offsetWidth) / 2, behavior: reduced ? 'auto' : 'smooth' });
  // desktop: the map stays put (sticky) and the plan scrolls to that country's card
  if (view !== 'all' && matchMedia('(min-width: 981px)').matches) $(`#leg-${view}`)?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
}

let measureCtx;
function textW(s, font) {
  measureCtx ||= document.createElement('canvas').getContext('2d');
  measureCtx.font = font;
  return measureCtx.measureText(s).width;
}
const SANS = getComputedStyle(document.documentElement).getPropertyValue('--sans').trim() || 'system-ui, sans-serif';

/** Draw the route over the base map, in screen pixels (so pins and labels keep their size at any zoom). */
function drawOverlay({ labels = true } = {}) {
  const svg = $('#rmap .g-map__ov');
  if (!svg || !RT.vb || !RM) return;
  const { W, H } = mapSize();
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const vb = RT.vb, k = W / vb.w;
  const raw = (o) => { const p = RM.project(o.lat, o.lng); return { x: (p.x - vb.x) * k, y: (p.y - vb.y) * k }; };
  const inView = (p, m = 30) => p.x > -m && p.x < W + m && p.y > -m && p.y < H + m;
  const legs = routeLegs();
  const zoomed = RT.view !== 'all';
  const phone = W < 520;
  const rStop = zoomed ? 11 : phone ? 8.5 : 10;
  const show = (x) => x.verdict === 'must' || x.verdict === 'maybe' || RT.skipped;
  const radius = (x) => (x.stop ? rStop : x.verdict === 'must' ? (zoomed ? 7.5 : 6.5) : x.verdict === 'maybe' ? (zoomed ? 5.5 : 4.5) : 3.5);
  // Cities closer than their pins (Kyoto and Osaka on the whole-trip view) are nudged apart so every pin shows;
  // lines and labels use the nudged spots.
  const nodes = [...legs.flatMap((l) => l.others.filter(show)), ...legs.flatMap((l) => l.stops.filter((s) => s.located).map((s) => ({ ...s, stop: true })))].map((x) => ({ key: x.key, r: radius(x), p: raw(x) }));
  RM.relaxPins(nodes, { gap: 3 });
  const pos = new Map(nodes.map((n) => [n.key, n.p]));
  const P = (o) => pos.get(o.key) || raw(o);
  const L = [], pins = [], labelItems = [], obstacles = [];
  const fmt = (n) => Math.round(n * 10) / 10;

  // 1. long-haul flights: only a short stub at the stop that fades out. The real flight path isn't known, so the
  //    stub marks "to / from São Paulo" without claiming a direction.
  const lh = RT.data.longHaul;
  const fixedLabels = [], stubBoxes = [];
  // what a stub should steer clear of: every pin, and points along the lines between consecutive stops
  const clutter = nodes.map((n) => ({ key: n.key, x: n.p.x, y: n.p.y, r: n.r }));
  {
    const seq = legs.flatMap((l) => l.stops.filter((s) => s.located)).map(P);
    for (let i = 0; i + 1 < seq.length; i++) for (let t = 1; t < 10; t++) clutter.push({ x: seq[i].x + (seq[i + 1].x - seq[i].x) * (t / 10), y: seq[i].y + (seq[i + 1].y - seq[i].y) * (t / 10), r: 4 });
  }
  const firstStop = legs[0]?.stops.find((s) => s.located), lastLeg = legs.at(-1), lastStop = lastLeg ? [...lastLeg.stops].reverse().find((s) => s.located) : null;
  const longHaul = (stop, dir, lines) => {
    const p = P(stop);
    if (!inView(p, 0)) return;
    const len = phone ? 56 : 76;
    const w = Math.max(...lines.map((t, i) => textW(t, i ? `500 11px ${SANS}` : `600 12px ${SANS}`))) + 22;
    const h = 34;
    // Point the stub at the emptiest side of the stop: away from other pins and from the route's own lines.
    const boxFor = (v) => { const e = { x: p.x + v.x * (rStop + len), y: p.y + v.y * (rStop + len) }; return { x: e.x + v.x * (w / 2 + 3) - w / 2, y: e.y + v.y * (h / 2 + 3) - h / 2, w, h }; };
    let u = null, best = -Infinity;
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * 2 * Math.PI, v = { x: Math.cos(ang), y: Math.sin(ang) };
      const bx = boxFor(v);
      if (bx.x < 8 || bx.y < 8 || bx.x + w > W - 8 || bx.y + h > H - 26) continue;
      const probes = [0.5, 1].map((t) => ({ x: p.x + v.x * (rStop + len * t), y: p.y + v.y * (rStop + len * t) }));
      for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.2, 0.8]) probes.push({ x: bx.x + w * fx, y: bx.y + h * fy });
      let score = Infinity;
      for (const q of probes) for (const c of clutter) if (c.key !== stop.key) score = Math.min(score, Math.hypot(q.x - c.x, q.y - c.y) - (c.r || 0));
      for (const o of fixedLabels) score = Math.min(score, Math.hypot(bx.x + w / 2 - (o.box.x + o.box.w / 2), bx.y + h / 2 - (o.box.y + o.box.h / 2)) - (w + o.box.w) / 2);
      score += v.y * 6; // a slight lean downwards, towards the open sea on most of these maps
      if (score > best) { best = score; u = v; }
    }
    u ||= { x: dir === 'in' ? 0.42 : -0.42, y: 0.908 };
    const near = { x: p.x + u.x * (rStop + 3), y: p.y + u.y * (rStop + 3) }, far = { x: p.x + u.x * (rStop + len), y: p.y + u.y * (rStop + len) };
    const d = `M${fmt(near.x)} ${fmt(near.y)}L${fmt(far.x)} ${fmt(far.y)}`;
    const grad = (id, cls) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${fmt(near.x)}" y1="${fmt(near.y)}" x2="${fmt(far.x)}" y2="${fmt(far.y)}"><stop offset="0" class="${cls}"/><stop offset="0.4" class="${cls}" stop-opacity="0.85"/><stop offset="1" class="${cls}" stop-opacity="0"/></linearGradient>`;
    L.push(`<defs>${grad(`lhc-${dir}`, 'rt-fade-case')}${grad(`lhl-${dir}`, 'rt-fade-long')}</defs><path d="${d}" class="rt-case rt-case--long" style="stroke:url(#lhc-${dir})"/><path d="${d}" class="rt-long" style="stroke:url(#lhl-${dir})"/>`);
    const ang = (Math.atan2(u.y, u.x) * 180) / Math.PI;
    // arriving: the head points into the stop; leaving: it sits a little way out, pointing away
    if (dir === 'in') L.push(arrowHead(near, ang + 180, 0, 'rt-long-head'));
    else L.push(arrowHead({ x: near.x + u.x * len * 0.42, y: near.y + u.y * len * 0.42 }, ang, 0, 'rt-long-head rt-long-head--out'));
    // the label sits just past the faded end; the stub itself is kept clear of city labels too
    const bx = boxFor(u);
    fixedLabels.push({ id: `lh-${dir}`, box: { x: Math.max(8, Math.min(W - w - 8, bx.x)), y: Math.max(8, Math.min(H - h - 8, bx.y)), w, h }, lines, dir });
    stubBoxes.push({ id: `lhs-${dir}`, x: Math.min(near.x, far.x) - 4, y: Math.min(near.y, far.y) - 4, w: Math.abs(far.x - near.x) + 8, h: Math.abs(far.y - near.y) + 8 });
  };
  // on a country's map, only that country's own long-haul flight
  if (lh && firstStop && (!zoomed || RT.view === lh.in.country)) longHaul(firstStop, 'in', [`✈︎ From ${lh.in.from}`, `lands ${fmtWeek(lh.in.date)}`]);
  if (lh && lastStop && (!zoomed || RT.view === lh.out.country)) longHaul(lastStop, 'out', [`✈︎ Home to ${lh.out.to}`, `~${fmtWeek(lh.out.date)}${lh.out.booked ? '' : ' · not booked'}`]);
  if (fixedLabels.length === 2) {
    const [a, b] = fixedLabels;
    const hit = a.box.x < b.box.x + b.box.w + 6 && b.box.x < a.box.x + a.box.w + 6 && a.box.y < b.box.y + b.box.h + 6 && b.box.y < a.box.y + a.box.h + 6;
    if (hit) { // pull them apart sideways: home-bound to the left, arriving to the right
      const mid = (a.box.x + a.box.w / 2 + b.box.x + b.box.w / 2) / 2;
      b.box.x = Math.max(8, mid - b.box.w - 4); a.box.x = Math.min(W - a.box.w - 8, mid + 4);
    }
  }

  // 2. flights between countries (dashed arcs) and 3. overland legs (solid)
  const hops = [];
  for (let i = 0; i + 1 < legs.length; i++) {
    const a = [...legs[i].stops].reverse().find((s) => s.located), b = legs[i + 1].stops.find((s) => s.located);
    if (!a || !b) continue;
    const pa = P(a), pb = P(b);
    const ar = RM.arc(pa, pb, 0.16);
    hops.push({ ar, date: legs[i + 1].c.from, id: `hop-${i}` });
    L.push(`<path d="${ar.d}" class="rt-case rt-case--hop"/><path d="${ar.d}" class="rt-hop"/>${arrowHead(ar.mid, ar.angle, 0, 'rt-hop-head')}`);
  }
  for (const l of legs) {
    const st = l.stops.filter((s) => s.located);
    if (st.length < 2) continue;
    const d = st.map((s, i) => { const p = P(s); return `${i ? 'L' : 'M'}${fmt(p.x)} ${fmt(p.y)}`; }).join('');
    L.push(`<path d="${d}" class="rt-case"/><path d="${d}" class="rt-land"/>`);
  }

  // 4. pins: other cities first (skipped, maybe, must not placed), stops on top
  const others = legs.flatMap((l) => l.others.map((x) => ({ ...x, leg: l.c })));
  for (const x of others.filter(show).sort((a, b) => rank(a) - rank(b))) {
    const p = P(x);
    if (!inView(p)) continue;
    const kind = x.verdict === 'must' ? 'must' : x.verdict === 'maybe' ? 'maybe' : 'skip';
    const r = radius(x);
    const sel = RT.sel === x.key;
    pins.push(`<g class="rt-city rt-city--${kind}${sel ? ' is-sel' : ''}" data-city="${esc(x.key)}" tabindex="0" role="button" aria-label="${esc(x.name)}: ${kind === 'must' ? 'Must, not placed yet' : kind === 'maybe' ? 'Maybe' : x.verdict === 'skip' ? 'Skip' : 'not swiped'}">${sel ? `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${r + 7}" class="rt-halo"/>` : ''}<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${r}" class="rt-pin--${kind}"/><circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="22" class="rt-hit"/></g>`);
    obstacles.push({ id: x.key, x: p.x - r - 1, y: p.y - r - 1, w: 2 * r + 2, h: 2 * r + 2 });
    if (kind === 'skip' && !zoomed) continue;
    const font = kind === 'must' ? `600 12px ${SANS}` : `500 ${kind === 'maybe' ? 11.5 : 11}px ${SANS}`;
    const sub = kind === 'must' && !(phone && !zoomed) ? 'not placed' : '';
    const w = textW(x.name, font) + (sub ? textW(sub, `italic 500 10.5px ${SANS}`) + 6 : 0) + (kind === 'must' ? 16 : 4);
    labelItems.push({ id: x.key, x: p.x, y: p.y, w, h: kind === 'must' ? 22 : 16, r: r + 3, priority: kind === 'must' ? 3 : kind === 'maybe' ? 5 : 7, kind, name: x.name, sub, font });
  }
  // Stops of one leg whose pins sit close together share one label in travel order ("Tokyo · Kyoto · Osaka").
  const grouped = new Map();
  for (const l of legs) {
    const st = l.stops.filter((s) => s.located && inView(P(s)));
    let run = [];
    const flush = () => { if (run.length > 1) run.forEach((s) => grouped.set(s.key, run)); run = []; };
    for (const s of st) {
      const near = run.length && run.some((o) => Math.hypot(P(o).x - P(s).x, P(o).y - P(s).y) < Math.max(34, rStop * 3.4));
      if (run.length && !near) flush();
      run.push(s);
    }
    flush();
  }
  const stopLabels = [];
  for (const l of legs) for (const s of l.stops) {
    if (!s.located) continue;
    const p = P(s);
    if (!inView(p)) continue;
    const sel = RT.sel === s.key;
    pins.push(`<g class="rt-city rt-city--stop${sel ? ' is-sel' : ''}" data-city="${esc(s.key)}" tabindex="0" role="button" aria-label="Stop ${s.n}: ${esc(s.name)}${s.nights ? `, ${plural(s.nights, 'night')}` : ''}">${sel ? `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${rStop + 7}" class="rt-halo"/>` : ''}<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${rStop}" class="rt-pin--stop"/><text x="${fmt(p.x)}" y="${fmt(p.y)}" class="rt-pin__n" style="font-size:${rStop > 9 ? 11 : 9.5}px">${s.n}</text><circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="22" class="rt-hit"/></g>`);
    obstacles.push({ id: s.key, x: p.x - rStop - 1, y: p.y - rStop - 1, w: 2 * rStop + 2, h: 2 * rStop + 2 });
    const font = `600 12.5px ${SANS}`;
    const sub = s.nights ? `${s.nights}n` : '';
    stopLabels.push({ id: s.key, x: p.x, y: p.y, w: textW(s.name, font) + (sub ? textW(sub, `500 11px ${SANS}`) + 5 : 0) + 17, h: 22, r: rStop + 3, priority: 1, must: true, kind: 'stop', name: s.name, sub, font });
  }
  /** Stop labels with the given clusters merged into one label each. */
  const withGroups = (merge) => {
    const out = [], done = new Set();
    for (const it of stopLabels) {
      const group = grouped.get(it.id);
      if (!group || !merge.has(group[0].key)) { out.push(it); continue; }
      if (done.has(group[0].key)) continue;
      done.add(group[0].key);
      const ps = group.map(P);
      const cx = ps.reduce((n, q) => n + q.x, 0) / ps.length, cy = ps.reduce((n, q) => n + q.y, 0) / ps.length;
      const spread = Math.max(...ps.map((q) => Math.hypot(q.x - cx, q.y - cy)));
      const name = group.map((g) => g.name).join(' · ');
      out.push({ id: group.map((g) => g.key).join('|'), city: group[0].key, x: cx, y: cy, w: textW(name, it.font) + 17, h: 22, r: spread + rStop + 3, priority: 1, must: true, kind: 'stop', name, sub: '', font: it.font });
    }
    return out;
  };

  // 5. labels (skipped while the zoom animates)
  let labelSvg = '';
  if (labels) {
    for (const f of fixedLabels) obstacles.push({ id: f.id, ...f.box });
    obstacles.push(...stubBoxes);
    obstacles.push({ id: 'osm', x: W - 190, y: H - 22, w: 190, h: 22 }, { id: 'back', x: 0, y: 0, w: zoomed ? 130 : 0, h: zoomed ? 52 : 0 });
    // leg badges on the whole-trip map (wide maps only: on a phone the chip row above the map carries the legs)
    if (!zoomed && !phone) for (const l of legs) {
      const st = l.stops.filter((s) => s.located);
      if (!st.length) continue;
      const pts = st.map(P);
      const cx = pts.reduce((n, p) => n + p.x, 0) / pts.length, cy = pts.reduce((n, p) => n + p.y, 0) / pts.length;
      const text = `${l.c.n} ${l.c.name}`, sub = `${l.c.nights}n`;
      labelItems.push({ id: `leg-${l.c.id}`, x: cx, y: cy, w: textW(text, `700 11px ${SANS}`) + textW(sub, `500 10.5px ${SANS}`) + 20, h: 20, r: rStop + 26, priority: 4, kind: 'leg', name: text, sub, leg: l.c.id, prefer: 'S' });
    }
    for (const h of hops) {
      const p = h.ar.mid;
      if (!inView(p, -10)) continue;
      const text = `✈︎ ${fmtDate(h.date)}`;
      labelItems.push({ id: h.id, x: p.x, y: p.y, w: textW(text, `600 10.5px ${SANS}`) + 12, h: 18, r: 6, priority: 6, kind: 'hop', name: text });
    }
    // First each stop gets its own label; a cluster whose labels collide (Kyoto and Osaka on the whole-trip map)
    // is laid out again with one shared label.
    const opts = { obstacles, bounds: { x: 0, y: 0, w: W, h: H }, margin: 4 };
    let items = [...withGroups(new Set()), ...labelItems];
    let placed = RM.layoutLabels(items, opts);
    const merge = new Set(stopLabels.filter((it) => grouped.has(it.id) && (placed.get(it.id)?.overlap || placed.get(it.id)?.leader)).map((it) => grouped.get(it.id)[0].key));
    if (merge.size) { items = [...withGroups(merge), ...labelItems]; placed = RM.layoutLabels(items, opts); }
    for (const it of items) {
      const pl = placed.get(it.id);
      if (!pl || pl.hidden) continue;
      labelSvg += labelSvgFor(it, pl);
    }
    for (const f of fixedLabels) {
      const b = f.box;
      labelSvg += `<g class="rt-lab rt-lab--long"><rect x="${fmt(b.x)}" y="${fmt(b.y)}" width="${fmt(b.w)}" height="${b.h}" rx="10"/><text x="${fmt(b.x + 11)}" y="${fmt(b.y + 14)}">${esc(f.lines[0])}</text><text x="${fmt(b.x + 11)}" y="${fmt(b.y + 27)}" class="rt-lab__sub">${esc(f.lines[1])}</text></g>`;
    }
  }
  svg.innerHTML = `<g class="rt-lines">${L.join('')}</g><g class="rt-pins">${pins.join('')}</g><g class="rt-labels">${labelSvg}</g>`;
  svg.setAttribute('aria-label', `Map of the route: ${legs.map((l) => `${l.c.name}${l.stops.length ? ` (${l.stops.map((s) => s.name).join(', ')})` : ''}`).join(', then ')}`);
}
const rank = (x) => (x.verdict === 'must' ? 3 : x.verdict === 'maybe' ? 2 : 1);

function arrowHead(p, angle, back, cls) {
  const a = (angle * Math.PI) / 180;
  const tip = { x: p.x - Math.cos(a) * back, y: p.y - Math.sin(a) * back };
  const s = 7;
  const l = { x: tip.x - Math.cos(a - 0.5) * s, y: tip.y - Math.sin(a - 0.5) * s }, r = { x: tip.x - Math.cos(a + 0.5) * s, y: tip.y - Math.sin(a + 0.5) * s };
  const f = (n) => Math.round(n * 10) / 10;
  return `<path d="M${f(l.x)} ${f(l.y)}L${f(tip.x)} ${f(tip.y)}L${f(r.x)} ${f(r.y)}" class="${cls}"/>`;
}

function labelSvgFor(it, pl) {
  const b = pl.box, f = (n) => Math.round(n * 10) / 10;
  let lead = '';
  if (pl.leader || it.city) { // a shared label always points at its cluster
    const cx = Math.max(b.x, Math.min(it.x, b.x + b.w)), cy = Math.max(b.y, Math.min(it.y, b.y + b.h));
    lead = `<path d="M${f(it.x)} ${f(it.y)}L${f(cx)} ${f(cy)}" class="rt-leader"/>`;
  }
  // a shared label ("Tokyo · Kyoto · Osaka") zooms to its country, where each city gets its own label
  const data = it.kind === 'leg' ? ` data-zoom="${it.leg}"` : it.kind === 'hop' ? '' : it.city ? (RT.view === 'all' ? ` data-zoom="${esc(it.city.split('/')[0])}"` : ` data-city="${esc(it.city)}"`) : ` data-city="${esc(it.id)}"`;
  if (it.kind === 'maybe' || it.kind === 'skip') {
    return `<g class="rt-lab rt-lab--${it.kind}"${data}>${lead}<text x="${f(b.x + 2)}" y="${f(b.y + b.h - 4)}">${esc(it.name)}</text></g>`;
  }
  const subX = b.x + (it.kind === 'leg' ? 10 : it.kind === 'hop' ? 6 : 8) + textW(it.name, it.font || `700 11px ${SANS}`) + (it.sub ? 5 : 0);
  return `<g class="rt-lab rt-lab--${it.kind}${RT.sel === it.id ? ' is-sel' : ''}"${data}>${lead}<rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${b.h}" rx="${b.h / 2}"/><text x="${f(b.x + (it.kind === 'leg' ? 10 : it.kind === 'hop' ? 6 : 8))}" y="${f(b.y + b.h / 2 + 4.2)}">${esc(it.name)}${it.sub ? `<tspan x="${f(subX)}" class="rt-lab__sub">${esc(it.sub)}</tspan>` : ''}</text></g>`;
}

function onMapClick(e) {
  const city = e.target.closest('[data-city]');
  if (city) { selectCity(city.dataset.city); return; }
  const leg = e.target.closest('[data-zoom]');
  if (leg) { closePop(); zoomTo(leg.dataset.zoom); return; }
  if (RT.sel) { closePop(); return; }
  // tapping a country: the country of the nearest city (within reach) that isn't the one already shown
  const svg = e.currentTarget, rect = svg.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const { W } = mapSize(), vb = RT.vb, k = W / vb.w;
  let best = null, bestD = Infinity;
  for (const l of routeLegs()) for (const c of [...l.stops.filter((s) => s.located), ...l.c.cities]) {
    const p = RM.project(c.lat, c.lng);
    const d = Math.hypot((p.x - vb.x) * k - x, (p.y - vb.y) * k - y);
    if (d < bestD) { bestD = d; best = l.c.id; }
  }
  if (best && bestD < (RT.view === 'all' ? 90 : 60) && best !== RT.view) zoomTo(best);
}

function selectCity(key, { zoom = false, scroll = false } = {}) {
  RT.sel = key;
  const [cid] = key.split('/');
  if (zoom && RT.view !== cid) zoomTo(cid);
  else drawOverlay();
  refreshPop();
  if (scroll) $('#rmap')?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
}
function closePop() { if (!RT.sel) return; RT.sel = null; const p = $('#rpop'); if (p) { p.hidden = true; p.innerHTML = ''; } drawOverlay(); }

function refreshPop() {
  const pop = $('#rpop');
  if (!pop || !RT.sel) return;
  const [cid, area] = RT.sel.split('/');
  const l = routeLegs().find((x) => x.c.id === cid);
  const stop = l?.stops.find((s) => s.area === area);
  const x = stop || l?.others.find((o) => o.area === area);
  if (!x) { closePop(); return; }
  const v = x.verdict;
  const status = stop ? `Stop ${stop.i + 1} of ${l.stops.length} in ${esc(l.c.name)}` : v === 'must' ? 'Must · not placed yet' : v === 'maybe' ? 'Maybe · not placed' : v === 'skip' ? 'Skipped · not placed' : 'Not swiped yet';
  const when = stop ? (stop.start && stop.end ? `${esc(fmtWeek(stop.start))} → ${esc(fmtWeek(stop.end))} · ${plural(stop.nights, 'night')}` : stop.start ? `From ${esc(fmtWeek(stop.start))} · nights not set` : 'Dates open: set nights for the stops before it') : `${esc(l.c.name)} leg: ${esc(fmtDate(l.c.from))} – ${esc(fmtDate(l.c.to))}`;
  const pl = x.places || { must: 0, maybe: 0, total: 0 };
  pop.innerHTML = `<button class="g-pop__x" aria-label="Close">${icon('<path d="M6 6l12 12M18 6 6 18"/>', 18)}</button>
    <p class="g-pop__eyebrow">${l.c.flag} ${status}</p>
    <h3 class="g-pop__name">${esc(x.name)}${v ? ` <span class="g-pill g-pill--${v === 'skip' ? 'none' : v}">${VERDICT_LABEL[v]}</span>` : ''}</h3>
    <p class="g-pop__when">${when}</p>
    <p class="g-pop__places">${pl.total ? `<b>${pl.must}</b> must · <b>${pl.maybe}</b> maybe <span>of ${plural(pl.total, 'place')} here</span>` : '<span>No places researched here yet</span>'}</p>
    <div class="g-pop__act">
      ${x.hasPage ? `<button class="g-btn g-btn--ghost" data-openarea="${esc(area)}">Area page →</button>` : '<span class="g-muted">No area page yet</span>'}
      ${!RT.edit ? '' : stop ? `<button class="g-btn g-btn--ghost g-pop__rm" data-popremove="${esc(RT.sel)}">Remove from route</button>` : `<button class="g-btn" data-popadd="${esc(RT.sel)}">Add to ${esc(l.c.name)} route</button>`}
    </div>`;
  pop.hidden = false;
  // keep the selected pin visible: the card goes to the top of the map when the pin is in the lower half
  if (typeof x.lat === 'number' && RT.vb) { const { H } = mapSize(); const y = (RM.project(x.lat, x.lng).y - RT.vb.y) * (mapSize().W / RT.vb.w); pop.classList.toggle('is-top', y > H * 0.5); }
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', x.name);
}

// ---------------------------------------------------------------- bits
function emptyState(emoji, title, text, href, cta) {
  return `<section class="wrap"><div class="g-empty"><div class="g-empty__art" aria-hidden="true"><span>${emoji}</span></div><h1>${esc(title)}</h1><p>${esc(text)}</p>${href ? `<a class="g-btn" href="${href}">${esc(cta)} →</a>` : ''}</div></section>`;
}

function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = `g-toast ${kind ? 'g-toast--' + kind : ''}`;
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 300); }, 2600);
}

function haptic(ms) { try { navigator.vibrate?.(ms); } catch {} }

function confetti(x, y) {
  if (reduced) return;
  const colors = ['#ffd66b', '#f08c6e', '#7fd3a0', '#8db4ff', '#b79cff', '#f59ac3'];
  for (let i = 0; i < 36; i++) {
    const s = document.createElement('i');
    s.className = 'g-confetti';
    s.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % colors.length]}`;
    document.body.append(s);
    const a = (Math.PI * 2 * i) / 36 + Math.random() * 0.3, v = 120 + Math.random() * 160;
    s.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * v}px, ${Math.sin(a) * v - 80}px) rotate(${Math.random() * 720}deg)`, opacity: 1, offset: 0.7 }, { transform: `translate(${Math.cos(a) * v * 1.1}px, ${Math.sin(a) * v + 120}px) rotate(${Math.random() * 900}deg)`, opacity: 0 }], { duration: 1100 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => s.remove();
  }
}

// ---------------------------------------------------------------- keyboard
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!$('#sheet').hidden) { if (e.key === 'Escape') closeSheet(); return; }
  if (S.route === 'route' && e.key === 'Escape' && RT.sel) { e.preventDefault(); closePop(); return; }
  if (S.route === 'swipe' || S.route === 'areas') {
    const k = { ArrowRight: 'must', ArrowLeft: 'skip', ArrowUp: 'maybe' }[e.key];
    if (k && topCard()) { e.preventDefault(); pressBtn(`[data-verdict="${k}"]`); swipeTop(k); }
    else if ((e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') && S.undo.length) { e.preventDefault(); undo(S.route === 'areas' ? 'area' : 'place'); }
    else if ((e.key === ' ' || e.key === 'Enter') && topCard() && !e.target.closest('button, a')) { e.preventDefault(); openTop(topCard()); }
    else if ((e.key === 'n' || e.key === 'N') && topCard()) { e.preventDefault(); toggleDeckNote(true); }
    else if (e.key === 'Escape' && S.deckNote) { e.preventDefault(); closeDeckNote(); }
  } else if (S.route === 'duels' && S.pair) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === '1') { e.preventDefault(); pickDuel('left'); }
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === '2') { e.preventDefault(); pickDuel('right'); }
    else if (e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); skipDuel(); }
  }
});
function pressBtn(sel) { const b = $(sel); if (!b) return; b.classList.add('is-press'); setTimeout(() => b.classList.remove('is-press'), 160); }

// Theme: keep the place page iframe in sync with the toggle.
document.addEventListener('click', (e) => {
  if (!e.target.closest('.theme-toggle')) return;
  setTimeout(() => { const t = document.documentElement.getAttribute('data-theme'); $('.g-sheet__frame')?.contentWindow?.postMessage({ atr: 'theme', theme: t }, location.origin); }, 0);
});

// Refresh in the background so new curator content shows up (marked "New").
async function refresh() {
  if (document.hidden || !$('#sheet').hidden || tripSheetOpen() || swiping || S.duelBusy || noteBusy() || $('.t-answer.is-live')) return;
  const tripBefore = tripSignature();
  const before = JSON.stringify([S.data.places.map((p) => p.id), S.data.areas.map((a) => a.id)]);
  try { await load({ silent: true }); } catch { return; }
  const after = JSON.stringify([S.data.places.map((p) => p.id), S.data.areas.map((a) => a.id)]);
  if (tripBefore !== tripSignature() && TRIP_PAGES.has(S.route) && !document.activeElement?.closest?.('.t-page input, .t-page textarea, .t-page select')) { render(false); return; }
  if (before !== after) { if (S.route === 'game' || S.route === 'board' || S.route === 'holidays' || S.route === 'calls') render(false); else renderTabs(); }
}
setInterval(refresh, 30000);
window.addEventListener('focus', refresh);

initTrip({ S, api, toast, icon, openPlace, cname, flag, catOf, rerender: () => render(false) });
watchTimes(); // the timezone beside every time, everywhere
window.addEventListener('hashchange', route);
load().then(route).catch((e) => { $('#view').innerHTML = emptyState('⚠️', 'The trip site isn’t answering', e.message, '/', 'Retry'); });
