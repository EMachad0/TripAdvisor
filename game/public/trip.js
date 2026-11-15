// Trip planner views: Today, Itinerary, Calendar, Places (find a card), Money, To do, Bag.
// The data is trip/*.json on the server (GET/POST /api/trip); the maths is shared in /lib/trip.js.
import {
  RATES, SHIFT, dayKey, timeOf, addDays, diffDays, weekday, localKey, localStamp, legsSorted, tripSpan, stayOn, hereOn, eventsOn,
  stayCities, stayName, inDays, onDay, upcomingEvents, todayModel, searchPlaces, periods, dailyOf, moneyTotals, priceCheck, EVENT_MAX_DAYS,
  TZ_OFFSET, tzLabel, instantOf, offsetOn, legOffsets, tzSpots,
} from '/lib/trip.js';

let G = null; // helpers handed over by game.js: { S, api, toast, icon, openPlace, cname, flag, catOf, rerender }
export function initTrip(ctx) { G = ctx; }

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;

export const T = {
  trip: null, loadedAt: 0,
  day: null,                                   // a day picked on Today ("look at another day"); null = the real today
  places: { q: '', city: null, show: 'all', cat: null, touched: false },
  chk: { country: '', kind: 'bed', price: '', cur: '' },
  unpack: false,
};

// ---------------------------------------------------------------- data
export async function loadTrip() {
  const r = await G.api('/api/trip');
  T.trip = r.trip;
  T.loadedAt = Date.now();
  return T.trip;
}
export const tripSignature = () => JSON.stringify(T.trip);
const col = (name) => T.trip?.[name] || [];
const today = () => T.day || localKey();
const nowStamp = () => (T.day ? `${T.day}T09:00` : localStamp());
/** Budget rows with the days of each country from the trip config (one source for the dates). */
const budgetRows = () => [...col('budget')].sort(byOrder).map((b) => ({ ...b, days: G.S.data.countries.find((c) => c.id === b.country)?.days ?? Number(b.days) ?? 0, name: countryName(b.country) }));
const countryName = (id) => (id === 'brazil' ? 'Brazil' : id ? G.cname(id) : '');
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title || a.item || '').localeCompare(String(b.title || b.item || ''));
const visitedSet = () => new Set(col('visited').map((v) => v.id));
const placesWithNames = () => G.S.data.places;

async function save(colName, op, id, data) {
  try {
    const r = await G.api('/api/trip', { col: colName, op, id, data });
    const xs = T.trip[colName];
    const i = xs.findIndex((x) => x.id === (r.doc?.id ?? id));
    if (op === 'delete') { if (i >= 0) xs.splice(i, 1); }
    else if (i >= 0) xs[i] = r.doc; else xs.push(r.doc);
    return r.doc;
  } catch (e) { G.toast(`Could not save: ${e.message}`, 'err'); throw e; }
}

// ---------------------------------------------------------------- formatting
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtDay = (s) => { const k = dayKey(s); return k ? `${WD[weekday(k)]} ${+k.slice(8, 10)} ${MON[+k.slice(5, 7) - 1]}` : ''; };
const fmtShort = (s) => { const k = dayKey(s); return k ? `${+k.slice(8, 10)} ${MON[+k.slice(5, 7) - 1]}` : ''; };
const fmtR = (n) => 'R$ ' + Math.round(Number(n) || 0).toLocaleString('pt-BR');
/** The small timezone label that sits beside a time. */
const tzTag = (off) => (tzLabel(off) ? ` <span class="tz">${tzLabel(off)}</span>` : '');
/** data-tz="8" marks a block whose loose times ("after 15:00", notes) are local to that offset; "" means "do not guess". */
const tzAttr = (off) => ` data-tz="${off ?? ''}"`;
const legOff = (l) => legOffsets(l, col('legs'));
const countryOff = (c) => TZ_OFFSET[c] ?? null;

/**
 * Writes the timezone beside every time on the page. Blocks say which zone their times are in with data-tz;
 * this pass finds the times in their text (notes, plans, check-in hours, card text) and adds the label.
 */
export function watchTimes(root = document.body) {
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

const plural = (n, w, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const safeUrl = (u) => { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : 'https://' + u; };
const shortUrl = (u) => String(u).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').slice(0, 48);
const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (m) => `<a href="${m}" target="_blank" rel="noopener">${shortUrl(m)}</a>`);
const gmaps = (q) => `https://www.google.com/maps/search/?api=1&query=${enc(q)}`;
const amaps = (q) => `https://maps.apple.com/?q=${enc(q)}`;
const uberTo = (d, o) => `https://m.uber.com/ul/?action=setPickup&${o ? `pickup%5Bformatted_address%5D=${enc(o)}` : 'pickup=my_location'}&dropoff%5Bformatted_address%5D=${enc(d)}`;

const I = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plane: '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  work: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19.5h20"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  star: '<path d="M12 3l2.7 5.9 6.3.7-4.7 4.3 1.3 6.3L12 17l-5.6 3.2 1.3-6.3L3 9.6l6.3-.7z"/>',
  dots: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const ico = (d, s = 18) => G.icon(d, s);
const planeSvg = (s = 16) => `<svg class="t-plane" viewBox="0 0 24 24" width="${s}" height="${s}" fill="currentColor" aria-hidden="true">${I.plane}</svg>`;

const editBtn = (c, id) => `<button class="t-edit" data-act="edit" data-col="${c}" data-id="${esc(id)}" aria-label="Edit">${ico(I.dots, 20)}</button>`;
const empty = (title, text) => `<div class="t-empty"><b>${esc(title)}</b>${esc(text)}</div>`;
const head = (eyebrow, title, sub, action = '') => `<header class="g-head t-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h1 class="t-h1">${title}</h1>${sub ? `<p class="t-lede">${sub}</p>` : ''}</div>${action ? `<div class="t-head__act">${action}</div>` : ''}</header>`;

// ---------------------------------------------------------------- leg cards (shared by Today, Itinerary, Calendar)
const STATUS = { booked: 'Booked', planned: 'To book', tbd: 'Not fixed', onday: 'On the day', later: 'Book later' };
const legStatus = (l) => { const s = l.status || 'planned'; return l.type === 'transport' && s === 'planned' && /uber|taxi|99|walk|metro|subway/i.test(l.mode || '') ? 'onday' : s; };
const statusChip = (s) => `<span class="t-chip t-chip--${esc(s)}">${esc(STATUS[s] || s)}</span>`;
const cityCards = (cities) => { const xs = placesWithNames().filter((p) => cities.includes(p.city)); return { n: xs.length, must: xs.filter((p) => p.verdict === 'must').length }; };

function placeBlock(addr, label = 'Address') {
  if (!addr) return '';
  return `<div class="t-addr"><span class="t-addr__pin">${ico(I.pin, 20)}</span><div class="t-addr__txt"><span class="t-lbl">${esc(label)}</span>${esc(addr)}</div>
    <div class="t-go"><a class="t-gbtn" href="${esc(gmaps(addr))}" target="_blank" rel="noopener">Google Maps</a><a class="t-gbtn" href="${esc(amaps(addr))}" target="_blank" rel="noopener">Apple Maps</a><a class="t-gbtn t-gbtn--dark" href="${esc(uberTo(addr))}" target="_blank" rel="noopener">Uber here</a><button class="t-gbtn" data-act="copy" data-text="${esc(addr)}">Copy address</button></div></div>`;
}
function parsePlan(s) {
  return String(s || '').split('\n').map((x) => x.trim()).filter(Boolean).map((x) => {
    const key = x.startsWith('!'); if (key) x = x.slice(1).trim();
    const m = x.match(/^((?:[A-Z][a-z]{2}\s)?\d{1,2}:\d{2})\s*[-–—·]?\s*(.*)$/);
    return { key, t: m ? m[1] : '', text: m ? m[2] : x };
  });
}
function moveSummary(l) {
  const leave = timeOf(l.start);
  const route = [l.fromName, l.toName].filter(Boolean).join(' → ');
  return `<div class="t-move">${leave ? `<div class="t-leave"><span class="t-lbl">Leave by</span><b>${leave}</b></div>` : ''}<div class="t-move__route">${esc(route)}${(l.mode || l.duration) ? `<small>${esc([l.mode, l.duration].filter(Boolean).join(' · '))}</small>` : ''}</div></div>`;
}

/** One itinerary card. opts.countdown adds "in 15 days" to a flight; opts.now marks the stay you are in. */
function legCard(l, opts = {}) {
  const cls = `t-card t-leg${l.status === 'tbd' ? ' is-tbd' : ''}${opts.now ? ' is-now' : ''}`;
  const top = (meta, extra = '') => `<div class="t-card__top"><div class="t-card__meta">${meta}</div><div class="t-card__chips">${extra}${statusChip(legStatus(l))}${opts.noEdit ? '' : editBtn('legs', l.id)}</div></div>`;
  const ref = l.ref ? `<span>Booking ref <b>${esc(l.ref)}</b> <button class="t-copy" data-act="copy" data-text="${esc(l.ref)}">Copy</button></span>` : '';
  const link = l.link ? `<div class="t-go"><a class="t-gbtn" href="${esc(safeUrl(l.link))}" target="_blank" rel="noopener">Open booking ↗</a></div>` : '';
  const off = legOff(l);
  if (l.type === 'flight') {
    const a = dayKey(l.start), b = dayKey(l.end);
    const plus = a && b && diffDays(a, b) > 0 ? ` <sup>+${diffDays(a, b)}</sup>` : '';
    return `<article class="${cls}" data-leg="${esc(l.id)}"${tzAttr(null)}>
      ${top(esc([l.carrier, l.flight, l.cabin].filter(Boolean).join(' · ')) || 'Flight', opts.countdown ? `<span class="t-chip t-chip--count">${esc(opts.countdown)}</span>` : '')}
      <div class="t-pass">
        <div class="t-pass__end"><b>${esc(l.from || '???')}</b><span class="t-pass__tm">${timeOf(l.start) ? timeOf(l.start) + tzTag(off.start) : '--:--'}</span><small>${esc(l.fromName || '')}</small></div>
        <div class="t-pass__mid"><span>${esc(l.duration || '')}</span><i>${planeSvg(18)}</i><span>${esc(fmtDay(l.start))}</span></div>
        <div class="t-pass__end t-pass__end--r"><b>${esc(l.to || '???')}</b><span class="t-pass__tm">${timeOf(l.end) ? timeOf(l.end) + plus + tzTag(off.end) : '--:--'}</span><small>${esc(l.toName || '')}</small></div>
      </div>
      ${ref || (plus && l.end) ? `<div class="t-stub">${ref}${plus ? `<span>Arrives ${esc(fmtDay(l.end))}</span>` : ''}</div>` : ''}
      ${l.note ? `<p class="t-note">${linkify(l.note)}</p>` : ''}${link}
    </article>`;
  }
  if (l.type === 'transport') {
    const steps = parsePlan(l.plan);
    return `<article class="${cls}" data-leg="${esc(l.id)}"${tzAttr(off.start)}>
      ${top(`${esc(l.mode || 'Transfer')}${dayKey(l.start) ? ` · ${esc(fmtDay(l.start))}` : ''}`)}
      <h3>${esc(l.title || 'Transfer')}</h3>
      ${moveSummary(l)}
      ${(steps.length || l.note) ? `<button class="t-drill" data-act="detail" data-id="${esc(l.id)}"><span>See the plan${steps.length ? ` · ${plural(steps.length, 'step')}` : ''}</span>${ico(I.arrow, 18)}</button>` : ''}${link}
    </article>`;
  }
  const a = dayKey(l.start), b = dayKey(l.end);
  if (l.type === 'stay') {
    const n = a && b ? diffDays(a, b) : 0;
    const cities = stayCities(l);
    const cc = l.country && l.country !== 'brazil' && cities.length ? cityCards(cities) : null;
    return `<article class="${cls}" data-leg="${esc(l.id)}"${tzAttr(off.start)}>
      ${top(`${l.country ? `${G.flag(l.country) ? G.flag(l.country) + ' ' : ''}${esc(countryName(l.country))} · ` : ''}Stay${l.host ? ` · hosted by ${esc(l.host)}` : ''}`, opts.now ? '<span class="t-chip t-chip--now">You are here</span>' : '')}
      <h3>${esc(l.title || 'Untitled')}</h3>
      ${a ? `<div class="t-voucher">
        <div><span class="t-lbl">${l.checkIn ? 'Check-in' : 'Arrive'}</span><b>${esc(fmtDay(l.start))}</b>${l.checkIn ? `<small>after ${esc(l.checkIn)}</small>` : ''}</div>
        <div class="t-voucher__n">${n ? plural(n, 'night') : 'no bed'}</div>
        <div class="t-voucher__r"><span class="t-lbl">${l.checkOut ? 'Checkout' : 'Leave'}</span><b>${esc(fmtDay(l.end || l.start))}</b>${l.checkOut ? `<small>by ${esc(l.checkOut)}</small>` : ''}</div>
      </div>` : ''}
      ${placeBlock(l.address)}
      ${l.ref ? `<div class="t-stub">${ref}</div>` : ''}
      ${l.note ? `<p class="t-note">${linkify(l.note)}</p>` : ''}${link}
      ${cc && cc.n ? `<a class="t-cardlink" href="#/places/${esc(cities.join('+'))}"><span><b>${plural(cc.n, 'card')}</b> here${cc.must ? ` · ${cc.must} Must` : ''}</span>${ico(I.arrow, 18)}</a>` : ''}
    </article>`;
  }
  return `<article class="${cls}" data-leg="${esc(l.id)}"${tzAttr(off.start)}>
    ${top(`Note${a ? ` · ${esc(fmtDay(l.start))}${timeOf(l.start) ? ` · ${timeOf(l.start)}` : ''}` : ''}`)}
    <h3>${esc(l.title || 'Untitled')}</h3>${placeBlock(l.address)}${l.note ? `<p class="t-note">${linkify(l.note)}</p>` : ''}${link}
  </article>`;
}

// ---------------------------------------------------------------- place rows (Today, Places, Calendar day)
function placeRow(p, { when = '', showCity = true, tick = true } = {}) {
  const been = visitedSet().has(p.id);
  const cat = G.catOf(p.category);
  const thumb = p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">` : `<span>${esc(cat.icon)}</span>`;
  const map = p.loc ? `https://www.google.com/maps/search/?api=1&query=${p.loc.lat},${p.loc.lng}` : gmaps(`${p.name} ${p.cityName}`);
  return `<li class="t-place${been ? ' is-been' : ''}${p.verdict === 'skip' ? ' is-skip' : ''}" data-cat="${esc(p.category)}"${tzAttr(countryOff(p.country))}>
    ${tick ? `<button class="t-check" data-s="${been ? 'done' : 'todo'}" data-act="been" data-id="${esc(p.id)}" aria-label="${been ? 'Not been yet' : 'Been there'}: ${esc(p.name)}">${ico(I.check, 15)}</button>` : ''}
    <button class="t-place__open" data-act="place" data-id="${esc(p.id)}">
      <span class="t-place__thumb">${thumb}</span>
      <span class="t-place__main"><b>${esc(p.name)}</b>
        <small>${[showCity ? esc(p.cityName) : '', esc(cat.label), p.area ? esc(p.area) : ''].filter(Boolean).join(' · ')}</small>
        ${when ? `<span class="t-place__when">${when}</span>` : p.whenLabel ? `<span class="t-place__when t-place__when--soft">${esc(p.whenLabel)}</span>` : ''}
        ${p.note ? `<span class="t-place__note">${esc(p.note)}</span>` : ''}
      </span>
    </button>
    <span class="t-place__end">${p.verdict ? `<span class="g-pill g-pill--${p.verdict}">${esc(p.verdict)}</span>` : ''}<a class="t-maplink" href="${esc(map)}" target="_blank" rel="noopener" aria-label="Open ${esc(p.name)} in Maps">${ico(I.pin, 18)}</a></span>
  </li>`;
}

// ---------------------------------------------------------------- today
const TZ = { brazil: 'America/Sao_Paulo', china: 'Asia/Shanghai', 'hong-kong': 'Asia/Hong_Kong', singapore: 'Asia/Singapore', thailand: 'Asia/Bangkok', korea: 'Asia/Seoul', japan: 'Asia/Tokyo' };
const clock = (tz) => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short' }).format(new Date()); } catch { return '–'; } };

function dayStatusHtml(d, country, off = null) {
  if (!d) return '';
  const rows = [];
  if (d.status === 'work') rows.push(`<span class="t-chip t-chip--work">${ico(I.work, 14)} Work</span><span>${country && SHIFT[country] ? `Night shift ${SHIFT[country]}${tzTag(countryOff(country))} here, starting this evening. That is 09:00–18:00${tzTag(-3)} in São Paulo.` : `09:00–18:00${tzTag(-3)} in São Paulo`}</span>`);
  if (d.status === 'vacation') rows.push(`<span class="t-chip t-chip--vac">${ico(I.sun, 14)} Vacation</span>`);
  if (d.status === 'off') rows.push('<span class="t-chip t-chip--off">Day off</span>');
  if (d.holiday) rows.push(`<span class="t-hol">${ico(I.star, 15)} ${esc(d.holiday)} <small>holiday in Brazil</small></span>`);
  return `<div class="t-dinfo"${tzAttr(countryOff(country) ?? off)}>${rows.map((r) => `<div class="t-drow">${r}</div>`).join('')}${d.note ? `<p class="t-note">${linkify(d.note)}</p>` : ''}</div>`;
}

const kindLabel = (h) => (h.kind === 'only' ? 'Only today' : h.kind === 'last' ? 'Last day' : `Until ${fmtShort(h.to)} · ${plural(h.left, 'more day')}`);
const elsewhere = (h) => (h.reach === 'here' ? '' : ` · in ${esc(h.place.cityName)}${h.reach === 'near' ? ', a day trip' : ''}`);

export function viewToday(v, arg) {
  // #/today/2027-01-30 opens that day (a link you can keep); the date box does the same without the link
  if (/^\d{4}-\d{2}-\d{2}$/.test(arg || '') && T.dayArg !== arg) { T.dayArg = arg; T.day = arg === localKey() ? null : arg; }
  const m = todayModel({ legs: col('legs'), places: placesWithNames(), tasks: col('tasks'), days: col('days'), visited: col('visited'), today: today(), now: nowStamp() });
  const real = localKey();
  const k = m.today;
  const title = m.phase === 'before' ? (m.toDeparture === 0 ? 'You leave today' : `${plural(m.toDeparture, 'day')} to departure`)
    : m.phase === 'during' ? `Day ${m.dayNumber} of ${m.span.days}${m.stay ? ` · <em>${esc(stayName(m.stay))}</em>` : ''}`
    : m.phase === 'after' ? 'Back home' : 'No trip dates yet';
  const sub = m.phase === 'before' ? `The trip runs ${fmtDay(m.span.first)} → ${fmtDay(m.span.last)}, ${m.span.days} days.`
    : m.phase === 'during' && m.stay ? (() => { const left = diffDays(k, dayKey(m.stay.end || m.stay.start)); return `${esc(countryName(m.country))}. ${left > 0 ? `${plural(left, 'more night')} here, until ${fmtDay(m.stay.end)}.` : left === 0 && dayKey(m.stay.start) !== k ? 'You leave today.' : 'Just for today.'}${m.nextStay ? ` Next: ${esc(stayName(m.nextStay))}.` : ''}`; })()
    : m.phase === 'during' ? 'Between stays today.' : '';
  const zones = [...new Set([m.country, 'brazil'].filter(Boolean))];
  const clocks = (m.phase === 'before' ? ['brazil', 'china'] : zones).map((c) => `<span>${esc(c === 'brazil' ? 'São Paulo' : countryName(c))} <b>${clock(TZ[c])}</b>${tzTag(countryOff(c))}</span>`).join('');

  const cards = [], side = [];
  // where you are / what today is
  if (m.stay) cards.push(`<section class="t-block"><h2>Where you are</h2>${dayStatusHtml(m.day, m.country, offsetOn(col('legs'), k))}${legCard(m.stay, { now: true })}</section>`);
  else if (m.day) cards.push(`<section class="t-block"><h2>${k === real ? 'Today' : esc(fmtDay(k))}</h2>${dayStatusHtml(m.day, m.country, offsetOn(col('legs'), k))}</section>`);

  // moves today + next flight
  const moves = m.moves.filter((l) => l !== m.flight);
  const fl = m.flight;
  const flightBlock = fl ? `<section class="t-block"><h2>Next flight</h2>${legCard(fl, { countdown: countdown(fl, k) })}</section>` : `<section class="t-block"><h2>Next flight</h2>${empty('No flight ahead', 'Every flight in the itinerary has left.')}</section>`;
  if (moves.length) cards.push(`<section class="t-block"><h2>${k === real ? 'Today' : 'That day'}: moves</h2><div class="t-stack">${moves.map((l) => legCard(l)).join('')}</div></section>`);
  cards.push(flightBlock);

  // only today
  if (m.phase === 'during') {
    const rows = [...m.onlyToday, ...m.endingSoon];
    side.push(`<section class="t-block"><h2>Only today, or ending soon</h2>${rows.length
      ? `<ul class="t-places">${rows.map((h) => placeRow(h.place, { when: `<b class="t-only t-only--${h.kind}">${kindLabel(h)}</b>${elsewhere(h)}` })).join('')}</ul>`
      : `<p class="t-quiet">Nothing with a date falls on ${k === real ? 'today' : esc(fmtDay(k))} in ${esc(countryName(m.country) || 'this stop')}.</p>`}</section>`);
  }

  // coming up
  if (m.upcoming.length) side.push(`<section class="t-block"><h2>Next events you could go to</h2>
    <ul class="t-places">${m.upcoming.map((u) => placeRow(u.place, { tick: false, when: `<b class="t-only">${esc(fmtDay(u.date))}${u.to !== u.date ? ` – ${esc(fmtShort(u.to))}` : ''}</b> · ${esc(inDays(k, u.date))}${u.reach === 'here' ? '' : ` · a day trip from ${esc(stayName(u.stay))}`}${u.open ? ' · stop not fixed' : ''}` })).join('')}</ul>
    <p class="t-quiet">Dated cards in a city you sleep in, or a day trip from it, on the days you are there. Skipped cards and whole-season dates are left out. <a href="#/calendar">Calendar →</a></p></section>`);

  // musts here
  if (m.phase === 'during' && m.cities.length) {
    const cc = cityCards(m.cities);
    side.push(`<section class="t-block"><h2>Still to do in ${esc(stayName(m.stay))}</h2>${m.musts.length
      ? `<ul class="t-places">${m.musts.slice(0, 6).map((p) => placeRow(p, { showCity: m.cities.length > 1 })).join('')}</ul>`
      : `<p class="t-quiet">${cc.must ? 'Every Must here is ticked.' : 'No Must cards in this city.'}</p>`}
      <a class="t-cardlink" href="#/places/${esc(m.cities.join('+'))}"><span><b>All ${plural(cc.n, 'card')}</b> in ${esc(stayName(m.stay))}${m.musts.length > 6 ? ` · ${m.musts.length - 6} more Must` : ''}</span>${ico(I.arrow, 18)}</a></section>`);
  }

  // to do
  if (m.tasksTotal) cards.push(`<section class="t-block"><h2>To do <small>${m.tasks.length} open of ${m.tasksTotal}</small></h2>${m.tasks.length
    ? `<div class="t-list">${m.tasks.slice(0, 5).map((x) => taskRow(x, { compact: true })).join('')}</div>${m.tasks.length > 5 ? `<a class="t-cardlink" href="#/todo"><span><b>${m.tasks.length - 5} more</b> to do</span>${ico(I.arrow, 18)}</a>` : ''}`
    : '<p class="t-quiet">Everything is ticked.</p>'}</section>`);

  // ask
  side.push(`<section class="t-block t-ask" id="tripask"><h2>Ask about the trip</h2>
    <p class="t-quiet">Claude reads the itinerary, your calls and the place cards, then answers here. It needs this computer to be running the site.</p>
    <form class="t-ask__form" autocomplete="off"><textarea name="q" rows="2" maxlength="2000" placeholder="e.g. Where was that ramen shop in Osaka?" required></textarea><button type="submit" class="g-btn">Ask</button></form>
    <div class="t-ask__chips">${['When is my next flight?', 'What can only be done today?', 'What is the next event I could go to?', 'What are my Must cards here?'].map((s) => `<button type="button" class="t-fchip" data-ask="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <div class="t-ask__out" aria-live="polite"></div></section>`);

  v.innerHTML = `<section class="wrap t-page t-today">
    ${head(`${fmtDay(k)} ${k.slice(0, 4)}${k !== real ? ' · not today' : ''}`, title, sub, `<label class="t-daypick"><span>${k !== real ? 'Looking at' : 'Look at another day'}</span><input type="date" id="t-day" value="${esc(k)}"></label>${k !== real ? '<button class="g-btn g-btn--ghost t-btn" data-act="today-reset">Back to today</button>' : ''}`)}
    <p class="t-clocks">${clocks}</p>
    <div class="t-grid"><div class="t-col">${cards.join('')}</div><div class="t-col">${side.join('')}</div></div>
  </section>`;
  $('#t-day', v).addEventListener('change', (e) => { T.day = e.target.value && e.target.value !== localKey() ? e.target.value : null; G.rerender(); });
  bindAsk(v);
}

function countdown(fl, k) {
  const d = dayKey(fl.start);
  const n = diffDays(k, d);
  if (n > 1) return `in ${n} days`;
  if (n === 1) return 'tomorrow';
  const t = timeOf(fl.start);
  if (!t || T.day) return 'today';
  const at = instantOf(fl.start, legOff(fl).start); // the real instant, so it is right whatever zone this device is in
  const mins = Number.isFinite(at) ? Math.round((at - Date.now()) / 6e4) : (+t.slice(0, 2)) * 60 + (+t.slice(3)) - (new Date().getHours() * 60 + new Date().getMinutes());
  return mins > 0 ? `in ${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min` : 'today';
}

function bindAsk(v) {
  const form = $('.t-ask__form', v), out = $('.t-ask__out', v), ta = $('textarea', form);
  let busy = false;
  const ask = async (question) => {
    question = String(question || '').trim();
    if (!question || busy) return;
    busy = true; form.classList.add('is-busy');
    const card = document.createElement('div');
    card.className = 't-answer is-live';
    card.innerHTML = `<p class="t-answer__q">${esc(question)}</p><p class="t-answer__status">Thinking…</p><div class="t-answer__body"></div>`;
    out.prepend(card);
    const status = $('.t-answer__status', card), body = $('.t-answer__body', card);
    let text = '';
    try {
      const res = await fetch('/api/trip-ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, today: today() }) });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `HTTP ${res.status}`); }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '', finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          let ev; try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === 'status') status.textContent = ev.text;
          else if (ev.type === 'reset') { text = ''; body.textContent = ''; }
          else if (ev.type === 'delta') { text += ev.text; body.textContent = text.replace(/\n?\s*\**TL;?DR[\s\S]*$/i, ''); status.textContent = 'Writing…'; }
          else if (ev.type === 'done') { finished = true; body.innerHTML = `<div class="rich">${ev.html}</div>${ev.tldr ? `<p class="t-answer__tldr"><b>In short</b> ${esc(ev.tldr)}</p>` : ''}`; status.remove(); }
          else if (ev.type === 'error') { finished = true; throw new Error(ev.message); }
        }
      }
      if (!finished) throw new Error('the answer stopped early');
    } catch (e) {
      status?.remove();
      body.innerHTML = `${text ? `<p>${esc(text)}</p>` : ''}<p class="t-answer__warn">Couldn’t get an answer: ${esc(e.message)}.</p>`;
    } finally { card.classList.remove('is-live'); busy = false; form.classList.remove('is-busy'); }
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); const q = ta.value; ta.value = ''; ask(q); });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  $$('[data-ask]', v).forEach((b) => b.addEventListener('click', () => ask(b.dataset.ask)));
}

// ---------------------------------------------------------------- itinerary
export function viewItinerary(v) {
  const legs = legsSorted(col('legs'));
  const k = localKey();
  const span = tripSpan(legs);
  const booked = legs.filter((l) => l.type === 'flight' && l.status === 'booked').length, flights = legs.filter((l) => l.type === 'flight').length;
  const toBook = legs.filter((l) => l.type === 'stay' && (l.status === 'planned' || l.status === 'tbd') && dayKey(l.start) !== dayKey(l.end)).length;
  let h = head(span ? `${fmtDay(span.first)} → ${fmtDay(span.last)} · ${span.days} days` : 'Itinerary', 'Itinerary',
    `Flights, stays and moves in date order. Times are local to each airport or city.${flights ? ` ${booked} of ${plural(flights, 'flight')} booked${toBook ? `, ${plural(toBook, 'stay')} still to book` : ''}.` : ''}`,
    '<button class="g-btn t-btn" data-act="add" data-col="legs">Add stop</button>');
  if (!legs.length) { v.innerHTML = `<section class="wrap t-page">${h}${empty('No stops yet', 'Add a flight or a stay to start the timeline.')}</section>`; return; }
  // jump chips: the first leg of each country
  const seen = new Set(), jumps = [];
  for (const l of legs) if (l.type === 'stay' && l.country && !seen.has(l.country)) { seen.add(l.country); jumps.push(`<a class="t-fchip" href="#/itinerary" data-act="jump" data-id="${esc(l.id)}">${G.flag(l.country) ? G.flag(l.country) + ' ' : ''}${esc(countryName(l.country))} <span>${esc(fmtShort(l.start))}</span></a>`); }
  h += `<div class="t-jumps">${jumps.join('')}</div><div class="t-tl">`;
  let todayDrawn = false, prev = null;
  for (const l of legs) {
    const d = dayKey(l.start);
    if (!todayDrawn && d && d > k) { if (span && span.first <= k) h += '<div class="t-today-line"><span>Today</span><i></i></div>'; todayDrawn = true; }
    if (prev && prev.type === 'flight' && l.type === 'flight' && prev.to && prev.to === l.from && timeOf(prev.end) && timeOf(l.start)) {
      const gap = Math.round((Date.parse(l.start + ':00Z') - Date.parse(prev.end + ':00Z')) / 6e4);
      if (gap > 0 && gap < 48 * 60) h += `<div class="t-row"><div></div><div class="t-layover">Layover ${Math.floor(gap / 60)}h ${String(gap % 60).padStart(2, '0')}m in ${esc(prev.toName || prev.to)}</div></div>`;
    }
    const isNow = l.type === 'stay' && d && d <= k && k <= dayKey(l.end || l.start) && hereOn(legs, k) === l;
    const same = prev && dayKey(prev.start) === d;
    h += `<div class="t-row"><div class="t-when">${d && !same ? `<b>${+d.slice(8, 10)}</b><span>${MON[+d.slice(5, 7) - 1]} · ${WD[weekday(d)]}</span>` : !d ? '<span>No date</span>' : ''}</div><div class="t-lane">${legCard(l, { now: isNow })}</div></div>`;
    prev = l;
  }
  v.innerHTML = `<section class="wrap t-page t-narrow">${h}</div></section>`;
  // during the trip, open at today instead of at the first flight
  if (span && span.first < k && k <= span.last) requestAnimationFrame(() => ($('.t-leg.is-now', v) || $('.t-today-line', v))?.scrollIntoView({ block: 'start' }));
}

// ---------------------------------------------------------------- calendar
function calModel() {
  const legs = legsSorted(col('legs')).filter((l) => dayKey(l.start));
  const span = tripSpan(legs);
  const keys = [];
  for (const l of legs) if (l.type === 'stay') { const c = l.country || stayName(l); if (!keys.includes(c)) keys.push(c); }
  const colorOf = (s) => `var(--k${(keys.indexOf(s.country || stayName(s)) % 7) + 1})`;
  return { legs, span, keys, colorOf };
}
const dayDoc = (k) => col('days').find((x) => x.id === k) || null;
const datedOn = (k, stay) => (stay?.country && stay.country !== 'brazil' ? onDay(placesWithNames(), k, { country: stay.country, cities: stayCities(stay) }).filter((h) => !h.season) : []);
/** The calendar dot counts only what you could reach that day. */
const reachable = (xs) => xs.filter((h) => h.reach !== 'far');

export function viewCalendar(v, arg) {
  const M = calModel();
  let h = head('Where you sleep each night', 'Calendar', 'Flights, work and vacation days, Brazilian holidays and dated cards. Tap a day to see its plans and notes.');
  if (!M.span) { v.innerHTML = `<section class="wrap t-page">${h}${empty('Nothing dated yet', 'Add stops with dates in the Itinerary to fill the calendar.')}</section>`; return; }
  const tk = localKey();
  h += `<div class="t-legend">${M.keys.map((c, i) => `<span><i style="--k:var(--k${(i % 7) + 1})"></i>${esc(countryName(c) || c)}</span>`).join('')}<span><i class="is-hatch"></i>Stop not fixed</span><span>${planeSvg(13)} Flight</span><span>${ico(I.work, 13)} Work</span><span>${ico(I.sun, 13)} Vacation</span><span class="t-hol">${ico(I.star, 13)} Holiday in Brazil</span><span><b class="t-edot"></b>Note or dated card</span></div>`;
  const runs = periods(col('days'));
  if (runs.length) h += `<div class="t-periods">${runs.map((r) => `<div class="t-period">${ico(r.kind === 'work' ? I.work : I.sun, 15)}<b>${r.kind === 'work' ? 'Work' : 'Vacation'}</b><span>${esc(fmtShort(r.from))}${r.from !== r.to ? ` – ${esc(fmtShort(r.to))}` : ''} · ${plural(r.n, 'weekday')}</span></div>`).join('')}</div>`;
  h += '<div class="t-months">';
  let y = +M.span.first.slice(0, 4), mo = +M.span.first.slice(5, 7);
  const endY = +M.span.last.slice(0, 4), endM = +M.span.last.slice(5, 7);
  while (y < endY || (y === endY && mo <= endM)) {
    const first = `${y}-${String(mo).padStart(2, '0')}-01`;
    const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    h += `<div class="t-month"><h3>${MONL[mo - 1]} <span>${y}</span></h3><div class="t-cal">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w) => `<div class="t-wd" aria-hidden="true">${w}</div>`).join('')}${'<div></div>'.repeat(weekday(first))}`;
    for (let day = 1; day <= dim; day++) {
      const k = `${first.slice(0, 8)}${String(day).padStart(2, '0')}`;
      const s = stayOn(M.legs, k) || (k >= M.span.first && k <= M.span.last ? hereOn(M.legs, k) : null);
      const ev = eventsOn(M.legs, k);
      const fl = ev.some((l) => l.type === 'flight'), tr = ev.some((l) => l.type === 'transport');
      const sp = stayOn(M.legs, addDays(k, -1));
      const label = s && (sp !== s || weekday(k) === 0 || day === 1);
      const di = dayDoc(k);
      const dated = s ? reachable(datedOn(k, s)).length : 0;
      const inTrip = k >= M.span.first && k <= M.span.last;
      const cls = ['t-day', !inTrip && !di ? 'is-out' : '', s ? 'has' : '', s && s.status === 'tbd' ? 'is-tbd' : '', k === tk ? 'is-today' : '', di?.holiday ? 'is-hol' : ''].filter(Boolean).join(' ');
      const aria = [fmtDay(k), s ? stayName(s) : '', di?.status === 'work' ? 'work' : di?.status === 'vacation' ? 'vacation' : '', di?.holiday || '', fl ? 'flight' : '', dated ? plural(dated, 'dated card') : ''].filter(Boolean).join(', ');
      h += `<button class="${cls}" data-act="day" data-date="${k}"${s ? ` style="--k:${M.colorOf(s)}"` : ''} aria-label="${esc(aria)}"><span class="t-day__top"><b>${day}</b>${di?.status === 'work' ? ico(I.work, 11) : di?.status === 'vacation' ? ico(I.sun, 11) : ''}${di?.holiday ? `<span class="t-hol">${ico(I.star, 11)}</span>` : ''}</span><span class="t-day__ic">${fl ? planeSvg(11) : ''}${tr ? '<i class="t-tdot"></i>' : ''}${di?.note || dated ? '<i class="t-edot"></i>' : ''}</span>${label ? `<span class="t-day__pl">${esc(stayName(s))}</span>` : ''}</button>`;
    }
    h += '</div></div>';
    mo++; if (mo > 12) { mo = 1; y++; }
  }
  v.innerHTML = `<section class="wrap t-page">${h}</div></section>`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(arg || '')) openDay(arg);
}

function openDay(k) {
  const M = calModel();
  const ev = eventsOn(M.legs, k), s = stayOn(M.legs, k) || hereOn(M.legs, k);
  const inTrip = M.span && k >= M.span.first && k <= M.span.last;
  const di = dayDoc(k);
  const dated = s ? datedOn(k, s) : [];
  const cities = stayCities(s);
    openSheet(`<div class="t-dp__head"><h3>${esc(fmtDay(k))} ${k.slice(0, 4)}</h3><span>${inTrip ? `Day ${diffDays(M.span.first, k) + 1} of ${M.span.days}` : 'Outside the trip'}${s ? ` · ${esc(stayName(s))}` : ''}</span></div>
    ${dayStatusHtml(di, s?.country, offsetOn(M.legs, k))}
    ${ev.length ? `<div class="t-stack">${ev.map((l) => legCard(l, { noEdit: true })).join('')}</div>` : di ? '' : empty('Nothing planned', 'Add a stop for this day in the Itinerary.')}
    ${dated.length ? `<h4 class="t-dp__h">Dated cards on this day</h4><ul class="t-places">${dated.map((h) => placeRow(h.place, { tick: false, when: `<b class="t-only t-only--${h.kind}">${h.kind === 'only' ? 'This day only' : h.kind === 'last' ? 'Last day' : `Until ${fmtShort(h.to)}`}</b>${h.reach === 'here' ? '' : ` · in ${esc(h.place.cityName)}${h.reach === 'near' ? ', a day trip' : ', far from here'}`}` })).join('')}</ul>` : ''}
    <div class="t-actions"><button type="button" class="g-btn g-btn--ghost t-btn" data-act="edit" data-col="days" data-id="${esc(k)}">${di ? 'Edit day' : 'Add a note'}</button><button type="button" class="g-btn g-btn--ghost t-btn" data-act="see-day" data-date="${esc(k)}">Open as Today</button><span class="t-sp"></span><button type="button" class="g-btn t-btn" data-act="close">Close</button></div>`);
}

function openDetail(id) {
  const l = col('legs').find((r) => r.id === id); if (!l) return;
  const steps = parsePlan(l.plan);
  const o = l.fromPlace || '', d = l.toPlace || '';
  let h = `<div${tzAttr(legOff(l).start)}><p class="eyebrow">${esc(l.mode || 'Transfer')}${l.start ? ` · ${esc(fmtDay(l.start))}` : ''}</p><h3>${esc(l.title || 'Transfer')}</h3>${moveSummary(l)}`;
  if (steps.length) h += `<ol class="t-steps">${steps.map((s) => `<li class="${s.key ? 'is-key' : ''}"><span class="t-steps__tm">${esc(s.t)}</span><i></i><span>${linkify(s.text)}</span></li>`).join('')}</ol>`;
  if (l.note) h += `<div class="t-tips"><span class="t-lbl">Good to know</span>${linkify(l.note)}</div>`;
  for (const [a, lab] of [[o, 'Pickup'], [d, 'Drop-off']]) if (a) h += `<div class="t-addrline"><span><span class="t-lbl">${lab}</span>${esc(a)}</span><button type="button" class="t-copy" data-act="copy" data-text="${esc(a)}">Copy</button></div>`;
  const go = [];
  if (o && d) go.push(`<a class="t-gbtn" href="https://www.google.com/maps/dir/?api=1&origin=${enc(o)}&destination=${enc(d)}&travelmode=driving" target="_blank" rel="noopener">Route &amp; traffic</a>`);
  if (d && /uber/i.test(l.mode || '')) go.push(`<a class="t-gbtn t-gbtn--dark" href="${esc(uberTo(d, o))}" target="_blank" rel="noopener">Open in Uber</a>`);
  if (go.length) h += `<div class="t-go">${go.join('')}</div>`;
  h += `<div class="t-actions"><span class="t-sp"></span><button type="button" class="g-btn g-btn--ghost t-btn" data-act="edit" data-col="legs" data-id="${esc(id)}">Edit</button><button type="button" class="g-btn t-btn" data-act="close">Close</button></div>`;
  h += '</div>';
  openSheet(h);
}

// ---------------------------------------------------------------- places (find a card)
/** Cities in route order (from the stays), then any other city that has cards. */
function cityIndex() {
  const out = [], seen = new Set();
  const count = (id) => placesWithNames().filter((p) => p.city === id).length;
  const name = (id) => placesWithNames().find((p) => p.city === id)?.cityName || id;
  for (const l of legsSorted(col('legs'))) if (l.type === 'stay' && l.country !== 'brazil') for (const c of stayCities(l)) if (!seen.has(c) && count(c)) { seen.add(c); out.push({ id: c, name: name(c), n: count(c), country: l.country, route: true }); }
  const rest = [...new Set(placesWithNames().map((p) => p.city))].filter((c) => !seen.has(c)).map((c) => ({ id: c, name: name(c), n: count(c), country: placesWithNames().find((p) => p.city === c).country, route: false }));
  const order = G.S.data.countries.map((c) => c.id);
  rest.sort((a, b) => order.indexOf(a.country) - order.indexOf(b.country) || b.n - a.n);
  return [...out, ...rest];
}

export function viewPlaces(v, arg) {
  const F = T.places;
  const cities = cityIndex();
  if (arg !== undefined && arg !== F.arg) { F.arg = arg; F.city = arg ? decodeURIComponent(arg).split('+').filter((c) => cities.some((x) => x.id === c)) : null; if (F.city && !F.city.length) F.city = null; F.touched = true; }
  if (!F.touched) { // first visit: start in the city you are in
    const here = stayCities(hereOn(col('legs'), localKey())).filter((c) => cities.some((x) => x.id === c));
    if (here.length) F.city = here;
    F.touched = true;
  }
  const cats = Object.entries(G.S.data.categories).filter(([id]) => placesWithNames().some((p) => p.category === id));
  v.innerHTML = `<section class="wrap t-page">
    ${head(`${placesWithNames().length} cards · ${cities.filter((c) => c.route).length} cities on the route`, 'Places', 'Find any card: by name, city, kind of place or a word from its text. Tick the box once you have been.')}
    <div class="t-search">${ico(I.search, 20)}<input id="t-q" type="search" placeholder="ramen, Osaka, drone show, onsen…" value="${esc(F.q)}" autocomplete="off" aria-label="Search the cards"></div>
    <div class="t-filterrow"><label class="t-sel"><span>City</span><select id="t-city"><option value="">Everywhere</option>
      <optgroup label="On the route">${cities.filter((c) => c.route).map((c) => `<option value="${esc(c.id)}"${F.city?.length === 1 && F.city[0] === c.id ? ' selected' : ''}>${esc(c.name)} (${c.n})</option>`).join('')}</optgroup>
      <optgroup label="Elsewhere">${cities.filter((c) => !c.route).map((c) => `<option value="${esc(c.id)}"${F.city?.length === 1 && F.city[0] === c.id ? ' selected' : ''}>${esc(c.name)} (${c.n})</option>`).join('')}</optgroup>
      ${F.city?.length > 1 ? `<option value="${esc(F.city.join('+'))}" selected>${esc(F.city.map((c) => cities.find((x) => x.id === c)?.name || c).join(' + '))}</option>` : ''}</select></label>
      <label class="t-sel"><span>Kind</span><select id="t-cat"><option value="">Any kind</option>${cats.map(([id, c]) => `<option value="${esc(id)}"${F.cat === id ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>
      <div class="t-seg" role="group" aria-label="Which cards">${[['all', 'All'], ['picks', 'Must + Maybe'], ['todo', 'Not been'], ['been', 'Been']].map(([id, l]) => `<button class="t-seg__b${F.show === id ? ' is-on' : ''}" data-show="${id}" aria-pressed="${F.show === id}">${l}</button>`).join('')}</div>
    </div>
    <div id="t-results"></div>
  </section>`;
  const results = () => {
    const xs = searchPlaces(placesWithNames(), { q: F.q, cities: F.city, category: F.cat, show: F.show, visited: col('visited'), categories: G.S.data.categories });
    const groups = new Map();
    for (const p of xs) { const k = `${p.country}/${p.city}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
    const order = cities.map((c) => c.id);
    const keys = [...groups.keys()].sort((a, b) => order.indexOf(a.split('/')[1]) - order.indexOf(b.split('/')[1]));
    const been = visitedSet();
    $('#t-results', v).innerHTML = xs.length ? `<p class="t-count">${plural(xs.length, 'card')}${F.q ? ` for “${esc(F.q)}”` : ''}</p>${keys.map((k) => { const list = groups.get(k); return `<div class="t-group"><span>${G.flag(list[0].country)} ${esc(list[0].cityName)}</span><span>${list.filter((p) => been.has(p.id)).length}/${list.length} been</span></div><ul class="t-places t-places--box">${list.map((p) => placeRow(p, { showCity: false })).join('')}</ul>`; }).join('')}`
      : empty('No card matches', F.city || F.cat || F.show !== 'all' ? 'Try “Everywhere”, any kind, or All.' : 'Try another word.');
  };
  results();
  T.refreshPlaces = results;
  let timer;
  $('#t-q', v).addEventListener('input', (e) => { F.q = e.target.value; clearTimeout(timer); timer = setTimeout(results, 120); });
  $('#t-city', v).addEventListener('change', (e) => { F.city = e.target.value ? e.target.value.split('+') : null; results(); });
  $('#t-cat', v).addEventListener('change', (e) => { F.cat = e.target.value || null; results(); });
  $$('[data-show]', v).forEach((b) => b.addEventListener('click', () => { F.show = b.dataset.show; $$('[data-show]', v).forEach((x) => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', x === b); }); results(); }));
}

// ---------------------------------------------------------------- money
const CAT = { bed: 'Bed', food: 'Food', other: 'Other' };
function verdictHtml() {
  const b = budgetRows().find((x) => x.country === T.chk.country);
  const price = parseFloat(String(T.chk.price).replace(',', '.'));
  const r = priceCheck(b, T.chk.kind, price, T.chk.cur);
  const what = { bed: 'bed budget per night', food: 'food budget per day', other: 'budget per day for everything else' }[T.chk.kind];
  const conv = r.brl && T.chk.cur !== 'BRL' ? `${price.toLocaleString('pt-BR')} ${T.chk.cur} ≈ ${fmtR(r.brl)}. ` : '';
  if (r.level === 'idle') return `<div class="t-verdict t-verdict--idle" id="t-verdict">${r.brl ? `${esc(conv)}No ${what} set for ${esc(b.name)}.` : 'Type a price to compare it with your daily budget.'}</div>`;
  const msg = r.level === 'ok' ? `${fmtR(r.diff)} under your ${fmtR(r.limit)} ${what} in ${b.name}.` : `${fmtR(r.diff)} over your ${fmtR(r.limit)} ${what} in ${b.name}.${r.level === 'warn' ? ' Fine if you save elsewhere.' : ' Look for something cheaper, or plan to make it up.'}`;
  return `<div class="t-verdict t-verdict--${r.level}" id="t-verdict">${esc(conv + msg)}</div>`;
}
function currentBudget() {
  const s = hereOn(col('legs'), localKey()) || legsSorted(col('legs')).find((l) => l.type === 'stay' && dayKey(l.start) > localKey() && l.country !== 'brazil');
  return budgetRows().find((b) => b.country === s?.country) || null;
}

export function viewMoney(v) {
  const budget = budgetRows(), fixed = [...col('fixed')].sort(byOrder);
  const spend = [...col('spend')].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.order || 0) - (a.order || 0));
  const set = col('settings').find((x) => x.id === 'main') || {};
  const m = moneyTotals({ budget, fixed, spend, settings: col('settings') });
  let h = head(`${fmtR(m.planT)} planned · cap ${fmtR(m.cap)}`, 'Money', 'What to spend per day in each country and how to pay there. Check a price before you book, and log what you spend.', '<button class="g-btn t-btn" data-act="add" data-col="spend">Log expense</button>');
  if (!budget.length && !fixed.length && !m.cap) { v.innerHTML = `<section class="wrap t-page">${h}${empty('No budget yet', 'Set a cap and the daily budgets to start.')}</section>`; return; }
  const scale = Math.max(m.cap, m.planT) || 1;
  h += `<div class="t-card t-msum"><div class="t-card__top"><div><div class="t-big">${fmtR(m.planT)}</div><div class="t-of">planned of your ${fmtR(m.cap)} cap</div></div><div class="t-card__chips">${m.cap ? `<span class="t-chip t-chip--${m.spare >= 0 ? 'booked' : 'planned'}">${m.spare >= 0 ? fmtR(m.spare) + ' to spare' : fmtR(-m.spare) + ' over'}</span>` : ''}${editBtn('settings', 'main')}</div></div>
    <div class="t-stackbar" aria-hidden="true"><i style="width:${m.fixedT / scale * 100}%;background:var(--ink-3)"></i><i style="width:${m.groundT / scale * 100}%;background:var(--ok)"></i></div>
    <div class="t-mleg"><span><i style="background:var(--ink-3)"></i>Flights and fixed <b>${fmtR(m.fixedT)}</b></span><span><i style="background:var(--ok)"></i>Days on the ground <b>${fmtR(m.groundT)}</b></span><span><i style="background:var(--line)"></i>Spare <b>${fmtR(Math.max(0, m.spare))}</b></span><span>Logged so far <b>${fmtR(m.spentT)}</b></span></div></div>`;
  if (budget.length) {
    if (!budget.some((b) => b.country === T.chk.country)) { const c = currentBudget() || budget[0]; T.chk.country = c.country; T.chk.cur = c.currency || 'BRL'; }
    h += `<section class="t-msec"><div class="t-card" id="t-chk"><h3>Booking check</h3><p class="t-quiet">Is this hostel or meal within budget? Rates are approximate; the bank app shows the real one when you convert.</p>
      <div class="t-fields">
        <div class="t-field"><label for="chk-country">Country</label><select id="chk-country">${budget.map((b) => `<option value="${esc(b.country)}"${b.country === T.chk.country ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
        <div class="t-field"><label for="chk-kind">What</label><select id="chk-kind">${[['bed', 'Bed, per night'], ['food', 'Food, per day'], ['other', 'Other, per day']].map(([k, l]) => `<option value="${k}"${T.chk.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="t-field"><label for="chk-price">Price</label><input id="chk-price" type="number" min="0" step="any" inputmode="decimal" value="${esc(T.chk.price)}" placeholder="e.g. 120"></div>
        <div class="t-field"><label for="chk-cur">Currency</label><select id="chk-cur">${Object.keys(RATES).map((c) => `<option${c === T.chk.cur ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
      </div>${verdictHtml()}</div></section>`;
    h += `<section class="t-msec"><h2>Per day, by country <small>${fmtR(m.groundT)} over ${m.days} days</small></h2><div class="t-mgrid">${budget.map((b) => {
      const d = dailyOf(b) || 1, planned = dailyOf(b) * b.days;
      const spent = spend.filter((x) => x.country === b.country).reduce((a, x) => a + (Number(x.amountBRL) || 0), 0);
      return `<div class="t-card"><div class="t-card__top"><h3>${G.flag(b.country)} ${esc(b.name)}</h3>${editBtn('budget', b.id)}</div>
        <p class="t-perday"><b>${fmtR(dailyOf(b))}</b> / day · ${plural(b.days, 'day')} · ${fmtR(planned)}</p>
        <div class="t-split" aria-hidden="true">${['bed', 'food', 'other'].map((k) => `<i class="t-c-${k}" style="width:${(Number(b[k]) || 0) / d * 100}%"></i>`).join('')}</div>
        <div class="t-splitleg">${['bed', 'food', 'other'].map((k) => `<span><i class="t-c-${k}"></i>${CAT[k]} <b>${fmtR(b[k])}</b></span>`).join('')}</div>
        ${spent ? `<p class="t-perday">Spent ${fmtR(spent)} of ${fmtR(planned)}</p><div class="t-mini"><i class="${spent > planned ? 'is-over' : ''}" style="width:${Math.min(100, planned ? spent / planned * 100 : 100)}%"></i></div>` : ''}
        ${b.pay ? `<details class="t-pay"><summary>How to pay in ${esc(b.name)}</summary><div>${linkify(b.pay)}</div></details>` : ''}</div>`;
    }).join('')}</div></section>`;
  }
  if (set.tips) h += `<section class="t-msec"><div class="t-tips"><span class="t-lbl">How money works on this trip</span>${linkify(set.tips)}</div></section>`;
  h += `<section class="t-msec"><h2>Flights and fixed costs <small>${fmtR(m.fixedT)}</small></h2>${fixed.length ? `<div class="t-list">${fixed.map((x) => { const st = { paid: ['booked', 'Paid'], topay: ['planned', 'To pay'], estimate: ['tbd', 'Estimate'] }[x.status] || ['tbd', 'Estimate'];
    return `<div class="t-li t-li--cost"><span class="t-chip t-chip--${st[0]}">${st[1]}</span><div class="t-li__body"><div class="t-li__t">${esc(x.title)}</div>${x.note ? `<div class="t-li__n">${linkify(x.note)}</div>` : ''}</div><span class="t-amt">${fmtR(x.amount)}</span>${editBtn('fixed', x.id)}</div>`; }).join('')}</div>` : empty('No fixed costs', 'Add flights, insurance or the eSIM here.')}
    <p><button class="g-btn g-btn--ghost t-btn" data-act="add" data-col="fixed">Add cost</button></p></section>`;
  const byCat = (k) => spend.filter((x) => x.category === k).reduce((a, x) => a + (Number(x.amountBRL) || 0), 0);
  h += `<section class="t-msec"><h2>Spending log <small>${spend.length ? ['bed', 'food', 'other'].map((k) => `${CAT[k]} ${fmtR(byCat(k))}`).join(' · ') : ''}</small></h2>`;
  if (!spend.length) h += empty('Nothing logged yet', 'Tap Log expense when you pay for a bed, a meal or a ticket. Amounts in local money are converted to reais.');
  else {
    let last = null;
    for (const x of spend) {
      if (x.date !== last) { if (last !== null) h += '</div>'; h += `<div class="t-group"><span>${esc(x.date ? fmtDay(x.date) : 'No date')}</span><span>${fmtR(spend.filter((y) => y.date === x.date).reduce((a, y) => a + (Number(y.amountBRL) || 0), 0))}</span></div><div class="t-list">`; last = x.date; }
      h += `<div class="t-li t-li--cost"><span class="t-cat t-c-${esc(x.category || 'other')}">${esc(CAT[x.category] || 'Other')}</span><div class="t-li__body"><div class="t-li__t">${esc(x.note || CAT[x.category] || 'Expense')}</div>${x.country ? `<div class="t-li__n">${esc(countryName(x.country))}</div>` : ''}</div><span class="t-amt">${fmtR(x.amountBRL)}${x.currency && x.currency !== 'BRL' ? `<small>${esc(Number(x.amount).toLocaleString('pt-BR'))} ${esc(x.currency)}</small>` : ''}</span>${editBtn('spend', x.id)}</div>`;
    }
    h += '</div>';
  }
  v.innerHTML = `<section class="wrap t-page">${h}</section>`;
  $$('#t-chk select, #t-chk input', v).forEach((el) => el.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'chk-country') { T.chk.country = e.target.value; const b = budgetRows().find((x) => x.country === T.chk.country); if (b?.currency) { T.chk.cur = b.currency; $('#chk-cur', v).value = T.chk.cur; } }
    if (id === 'chk-kind') T.chk.kind = e.target.value;
    if (id === 'chk-price') T.chk.price = e.target.value;
    if (id === 'chk-cur') T.chk.cur = e.target.value;
    $('#t-verdict', v).outerHTML = verdictHtml();
  }));
}

// ---------------------------------------------------------------- to do + bag
const statusOf = (x) => x.status || (x.done ? 'done' : 'todo');
function taskRow(x, { compact = false } = {}) {
  const st = statusOf(x);
  return `<div class="t-li${st === 'done' ? ' is-done' : ''}">
    <button class="t-check" data-s="${st}" data-act="toggle" data-col="tasks" data-id="${esc(x.id)}" aria-label="${st === 'done' ? 'Mark not done' : 'Mark done'}: ${esc(x.title)}">${ico(I.check, 15)}</button>
    <div class="t-li__body"><div class="t-li__t">${esc(x.title)}${st === 'doing' ? '<span class="t-chip t-chip--planned">In progress</span>' : ''}${x.suggested ? '<span class="t-chip t-chip--sug">Suggested</span>' : ''}</div>${x.note ? `<div class="t-li__n${compact ? ' is-clamp' : ''}">${linkify(x.note)}</div>` : ''}</div>
    ${editBtn('tasks', x.id)}</div>`;
}
export const openTasks = () => col('tasks').filter((x) => statusOf(x) !== 'done').length;

export function viewTodo(v) {
  const items = [...col('tasks')].sort(byOrder);
  const done = items.filter((x) => statusOf(x) === 'done').length;
  const span = tripSpan(col('legs'));
  const before = span && localKey() < span.first;
  let h = head(items.length ? `${items.length - done} open · ${done} done` : 'To do', 'To do',
    before ? `Everything to sort out before the ${fmtShort(span.first)} departure. Tap the box to tick it off; tap ⋯ to edit or mark something as in progress.` : 'Things to sort out. Tap the box to tick it off; tap ⋯ to edit or mark something as in progress.',
    '<button class="g-btn t-btn" data-act="add" data-col="tasks">Add task</button>');
  if (!items.length) { v.innerHTML = `<section class="wrap t-page t-narrow">${h}${empty('No tasks yet', 'Add the first thing you need to do.')}</section>`; return; }
  const open = items.filter((x) => statusOf(x) !== 'done'), closed = items.filter((x) => statusOf(x) === 'done');
  h += `<div class="t-progress" aria-label="${done} of ${items.length} done"><i style="width:${done / items.length * 100}%"></i></div>
    ${open.length ? `<div class="t-list">${open.map((x) => taskRow(x)).join('')}</div>` : '<p class="t-quiet">Everything is ticked.</p>'}
    ${closed.length ? `<div class="t-group"><span>Done</span><span>${closed.length}</span></div><div class="t-list">${closed.map((x) => taskRow(x)).join('')}</div>` : ''}`;
  v.innerHTML = `<section class="wrap t-page t-narrow">${h}</section>`;
}

export function viewBag(v) {
  const items = [...col('bag')].sort(byOrder);
  const packed = items.filter((x) => x.packed).length;
  let h = head(items.length ? `${packed} of ${items.length} packed` : 'Bag', 'Bag', 'One 40 L bag and a daily backpack for two winter months. Untick everything before each move to repack.',
    `${packed ? (T.unpack ? '<button class="g-btn g-btn--ghost t-btn t-btn--danger" data-act="unpack">Confirm: untick all</button><button class="g-btn g-btn--ghost t-btn" data-act="unpack-cancel">Cancel</button>' : '<button class="g-btn g-btn--ghost t-btn" data-act="unpack-arm">Untick all</button>') : ''}<button class="g-btn t-btn" data-act="add" data-col="bag">Add item</button>`);
  if (!items.length) { v.innerHTML = `<section class="wrap t-page t-narrow">${h}${empty('Bag is empty', 'Add the first thing to pack.')}</section>`; return; }
  h += `<div class="t-progress" aria-label="${packed} of ${items.length} packed"><i style="width:${packed / items.length * 100}%"></i></div>`;
  for (const c of [...new Set(items.map((x) => x.category || 'Other'))]) {
    const list = items.filter((x) => (x.category || 'Other') === c);
    h += `<div class="t-group"><span>${esc(c)}</span><span>${list.filter((x) => x.packed).length}/${list.length}</span></div><div class="t-list">${list.map((x) => `<div class="t-li${x.packed ? ' is-done' : ''}">
      <button class="t-check" data-s="${x.packed ? 'done' : 'todo'}" data-act="toggle" data-col="bag" data-id="${esc(x.id)}" aria-label="Packed: ${esc(x.item)}">${ico(I.check, 15)}</button>
      <div class="t-li__body"><div class="t-li__t">${esc(x.item)}${x.qty && x.qty != 1 ? ` <span class="t-qty">×${esc(x.qty)}</span>` : ''}</div>${x.note ? `<div class="t-li__n">${linkify(x.note)}</div>` : ''}</div>${editBtn('bag', x.id)}</div>`).join('')}</div>`;
  }
  v.innerHTML = `<section class="wrap t-page t-narrow">${h}</section>`;
}

// ---------------------------------------------------------------- sheet (day, plan, edit forms)
const sheetEl = () => $('#tsheet');
function openSheet(html) {
  const d = sheetEl();
  d.innerHTML = `<form class="t-sheet__in" method="dialog" novalidate tabindex="-1">${html}</form>`;
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  $('.t-sheet__in', d).focus(); // not the first link: a focus ring on a random button reads as a selection
}
function closeSheet() { const d = sheetEl(); if (d.open) d.close(); d.innerHTML = ''; editing = null; }
export const tripSheetOpen = () => !!sheetEl()?.open;

const CURSEL = 'select:' + Object.keys(RATES).map((c) => `${c}=${c}`).join(',');
const countrySel = () => 'select:=Not set,brazil=Brazil,' + G.S.data.countries.map((c) => `${c.id}=${c.name}`).join(',');
const SCHEMA = () => ({
  tasks: { name: 'task', fields: [['title', 'Task', 'text', 'full'], ['note', 'Notes', 'textarea', 'full'], ['status', 'Status', 'select:todo=To do,doing=In progress,done=Done']] },
  legs: { name: 'stop', fields: [['type', 'Kind', 'select:flight=Flight,stay=Stay,transport=Train / bus / transfer,note=Note'], ['status', 'Status', 'select:booked=Booked,planned=To book,later=Book later (near the date),onday=On the day (no booking),tbd=Not fixed yet'],
    ['title', 'Title (city or stay name)', 'text', 'full'],
    ['startDate', 'Start date', 'date'], ['startTime', 'Start time, local there (leave time for transfers)', 'time'], ['endDate', 'End date', 'date'], ['endTime', 'End time, local there (arrival airport for flights)', 'time'],
    ['country', 'Country', countrySel(), '', 's'], ['city', 'City id, as on the cards (e.g. osaka)', 'text', '', 's'],
    ['host', 'Host', 'text', '', 's'], ['address', 'Address', 'text', 'full', 's'], ['checkIn', 'Check-in from (local time)', 'time', '', 's'], ['checkOut', 'Checkout by (local time)', 'time', '', 's'],
    ['mode', 'Mode (Uber, taxi, train…)', 'text', '', 't'],
    ['from', 'From (airport code)', 'text', '', 'f'], ['to', 'To (airport code)', 'text', '', 'f'], ['fromName', 'From (short name)', 'text', '', 'ft'], ['toName', 'To (short name)', 'text', '', 'ft'],
    ['fromPlace', 'Pickup address', 'text', 'full', 't'], ['toPlace', 'Drop-off address', 'text', 'full', 't'],
    ['plan', 'Plan: one step per line, e.g. "12:30 Request Uber". Start a line with ! to highlight it', 'textarea', 'full', 't'],
    ['carrier', 'Airline', 'text', '', 'f'], ['flight', 'Flight number', 'text', '', 'f'], ['cabin', 'Cabin', 'text', '', 'f'], ['duration', 'Duration', 'text', '', 'ft'],
    ['ref', 'Booking reference', 'text', 'full'], ['link', 'Booking or ticket link', 'text', 'full'], ['note', 'Notes', 'textarea', 'full']] },
  bag: { name: 'item', fields: [['item', 'Item', 'text', 'full'], ['category', 'Category', 'text'], ['qty', 'Quantity', 'number'], ['note', 'Notes', 'textarea', 'full']] },
  budget: { name: 'country budget', fields: [['country', 'Country', countrySel()], ['currency', 'Currency', CURSEL], ['bed', 'Bed per night (R$)', 'number'], ['food', 'Food per day (R$)', 'number'], ['other', 'Other per day (R$)', 'number'], ['pay', 'How to pay', 'textarea', 'full']] },
  fixed: { name: 'cost', fields: [['title', 'Cost', 'text', 'full'], ['amount', 'Amount (R$)', 'number'], ['status', 'Status', 'select:topay=To pay,paid=Paid,estimate=Estimate'], ['note', 'Notes', 'textarea', 'full']] },
  spend: { name: 'expense', fields: [['note', 'What', 'text', 'full'], ['amount', 'Amount', 'number'], ['currency', 'Currency', CURSEL], ['category', 'Type', 'select:bed=Bed,food=Food,other=Other'], ['country', 'Country', countrySel()], ['date', 'Date', 'date']] },
  settings: { name: 'budget', fields: [['cap', 'Trip budget cap (R$)', 'number'], ['tips', 'How money works', 'textarea', 'full']] },
  days: { name: 'day', fields: [['status', 'Work or vacation', 'select:=Not set,work=Work,vacation=Vacation,off=Day off (weekend, holiday)'], ['holiday', 'Holiday in Brazil', 'text'], ['note', 'Events and notes', 'textarea', 'full']] },
});
let editing = null, delArmed = false;

function openEdit(colName, id) {
  const sc = SCHEMA()[colName];
  const x = id ? { ...(col(colName).find((r) => r.id === id) || {}) } : {};
  if (colName === 'legs') {
    x.startDate = dayKey(x.start); x.startTime = timeOf(x.start); x.endDate = dayKey(x.end); x.endTime = timeOf(x.end);
    if (!id) { x.type = 'stay'; x.status = 'planned'; }
    if (Array.isArray(x.cities) && x.cities.length) x.city = x.cities.join(', ');
  }
  if (colName === 'tasks') x.status = statusOf(x);
  if (colName === 'spend' && !id) { const c = currentBudget(); x.date = localKey(); x.category = 'food'; x.country = c?.country || ''; x.currency = c?.currency || 'BRL'; }
  editing = { col: colName, id }; delArmed = false;
  const exists = id && col(colName).some((r) => r.id === id);
  const cats = colName === 'bag' ? [...new Set(col('bag').map((b) => b.category).filter(Boolean))] : [];
  let h = `<h3>${colName === 'days' ? esc(fmtDay(id)) : `${exists ? 'Edit' : 'Add'} ${sc.name}`}</h3><div class="t-fields">`;
  for (const [k, label, type, span, show] of sc.fields) {
    const val = x[k] ?? '', fid = `f-${colName}-${k}`;
    let inp;
    if (type.startsWith('select:')) inp = `<select id="${fid}" name="${k}">${type.slice(7).split(',').map((o) => { const [value, lab] = o.split('='); return `<option value="${esc(value)}"${String(val) === value ? ' selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
    else if (type === 'textarea') inp = `<textarea id="${fid}" name="${k}" rows="4">${esc(val)}</textarea>`;
    else inp = `<input id="${fid}" name="${k}" type="${type}" value="${esc(val)}"${k === 'category' && cats.length ? ' list="t-dl"' : ''}${type === 'number' ? ' min="0" step="any" inputmode="decimal"' : ''}>`;
    h += `<div class="t-field${span ? ' is-full' : ''}"${show ? ` data-show="${show}"` : ''}><label for="${fid}">${esc(label)}</label>${inp}</div>`;
  }
  h += `</div>${cats.length ? `<datalist id="t-dl">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>` : ''}
    <div class="t-actions">${exists && colName !== 'settings' ? '<button type="button" class="g-btn g-btn--ghost t-btn t-btn--danger" data-act="del">Delete</button><span class="t-confirm" id="t-delmsg"></span>' : ''}<span class="t-sp"></span><button type="button" class="g-btn g-btn--ghost t-btn" data-act="close">Cancel</button><button type="submit" class="g-btn t-btn" data-act="save">Save</button></div>`;
  openSheet(h);
  if (colName === 'legs') applyShow();
  if (!id) $('input, textarea', sheetEl())?.focus();
}
function applyShow() {
  const d = sheetEl(), t = $('[name=type]', d)?.value;
  const k = { flight: 'f', stay: 's', transport: 't' }[t] || '-';
  $$('[data-show]', d).forEach((el) => { el.hidden = !el.dataset.show.includes(k); });
}

async function submitEdit() {
  if (!editing) return;
  const { col: c, id } = editing;
  const sc = SCHEMA()[c];
  const fd = Object.fromEntries(new FormData($('form', sheetEl())).entries());
  const data = {};
  for (const [k, v] of Object.entries(fd)) data[k] = typeof v === 'string' ? v.trim() : v;
  for (const [k, , type] of sc.fields) if (type === 'number' && k in data) data[k] = data[k] === '' ? 0 : Number(data[k]);
  const main = { bag: 'item', budget: 'country', spend: 'amount', settings: 'cap', days: null }[c] ?? (c === 'days' ? null : 'title');
  if (c === 'legs' && data.type === 'flight') { data.from = (data.from || '').toUpperCase(); data.to = (data.to || '').toUpperCase(); if (!data.title) data.title = `${data.from} → ${data.to}`; }
  if (main && !data[main]) { G.toast(c === 'spend' ? 'Enter the amount first.' : 'Give it a name first.', 'err'); return; }
  if (c === 'spend') data.amountBRL = Math.round(data.amount * (RATES[data.currency] || 1) * 100) / 100;
  if (c === 'legs') {
    data.start = data.startDate ? data.startDate + (data.startTime ? 'T' + data.startTime : '') : '';
    data.end = data.endDate ? data.endDate + (data.endTime ? 'T' + data.endTime : '') : '';
    for (const k of ['startDate', 'startTime', 'endDate', 'endTime']) delete data[k];
    const cs = String(data.city || '').split(/[,+]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    data.city = cs[0] || ''; data.cities = cs.length > 1 ? cs : null;
  }
  if (c === 'bag') data.qty = data.qty ? Number(data.qty) : 1;
  if (c === 'tasks') data.done = data.status === 'done';
  const exists = id && col(c).some((r) => r.id === id);
  closeSheet();
  try {
    if (exists) await save(c, 'update', id, data);
    else {
      if (c !== 'days' && c !== 'settings') data.order = Math.max(0, ...col(c).map((x) => x.order || 0)) + 1;
      if (c === 'bag') data.packed = false;
      if (data.cities === null) delete data.cities;
      await save(c, 'set', id || undefined, data);
    }
    G.toast(exists ? 'Saved' : 'Added');
  } catch { /* toast shown by save() */ }
  G.rerender();
}

// ---------------------------------------------------------------- clicks
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || !T.trip || !b.closest('.t-page, #tsheet')) return;
  const { act, id } = b.dataset;
  const c = b.dataset.col;
  if (act === 'copy') { e.preventDefault(); const t = b.dataset.text; try { await navigator.clipboard.writeText(t); G.toast('Copied ' + t); } catch { G.toast(t); } return; }
  if (act === 'close') { closeSheet(); return; }
  if (act === 'save') { e.preventDefault(); submitEdit(); return; }
  if (act === 'detail') { openDetail(id); return; }
  if (act === 'day') { openDay(b.dataset.date); return; }
  if (act === 'see-day') { closeSheet(); T.day = b.dataset.date === localKey() ? null : b.dataset.date; location.hash = '#/'; G.rerender(); return; }
  if (act === 'today-reset') { T.day = null; G.rerender(); return; }
  if (act === 'place') { if (tripSheetOpen()) closeSheet(); G.openPlace(id); return; }
  if (act === 'jump') { e.preventDefault(); $(`[data-leg="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (act === 'add') { openEdit(c); return; }
  if (act === 'edit') { openEdit(c, id); return; }
  if (act === 'unpack-arm') { T.unpack = true; G.rerender(); return; }
  if (act === 'unpack-cancel') { T.unpack = false; G.rerender(); return; }
  if (act === 'unpack') { T.unpack = false; for (const x of col('bag').filter((y) => y.packed)) await save('bag', 'update', x.id, { packed: false }).catch(() => {}); G.toast('All items unticked'); G.rerender(); return; }
  if (act === 'del') {
    if (!delArmed) { delArmed = true; $('#t-delmsg').textContent = 'Tap Delete again to remove it.'; return; }
    const { col: ec, id: eid } = editing; closeSheet();
    await save(ec, 'delete', eid).catch(() => {}); G.toast('Deleted'); G.rerender(); return;
  }
  if (act === 'toggle') {
    const x = col(c).find((r) => r.id === id); if (!x) return;
    if (c === 'tasks') { const d = statusOf(x) === 'done'; await save(c, 'update', id, { status: d ? 'todo' : 'done', done: !d }).catch(() => {}); }
    else if (c === 'bag') await save(c, 'update', id, { packed: !x.packed }).catch(() => {});
    G.rerender(); return;
  }
  if (act === 'been') {
    const was = visitedSet().has(id);
    await (was ? save('visited', 'delete', id) : save('visited', 'set', id, { at: localKey() })).catch(() => {});
    if (G.S.route === 'places' && T.refreshPlaces) T.refreshPlaces(); else G.rerender();
    return;
  }
});
document.addEventListener('change', (e) => { if (e.target.name === 'type' && e.target.closest('#tsheet')) applyShow(); });
document.addEventListener('submit', (e) => { if (e.target.closest('#tsheet')) { e.preventDefault(); if (editing) submitEdit(); } });
// a click on the backdrop closes the sheet
document.addEventListener('click', (e) => { if (e.target === sheetEl()) closeSheet(); });
document.addEventListener('close', (e) => { if (e.target === sheetEl()) { editing = null; } }, true);
