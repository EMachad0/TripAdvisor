// Trip planner maths shared by the server, the browser and the tests (pure: no Node or DOM imports).
// The data lives in trip/<collection>.json (game/lib/tripstore.js). Dates are local wall-clock strings:
// "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM", local to the airport or city they describe.

export const COLLECTIONS = ['tasks', 'legs', 'bag', 'budget', 'fixed', 'spend', 'settings', 'days', 'visited'];

/** Rough R$ per unit of each currency, for the booking check and the spending log (the bank app shows the real one). */
export const RATES = { BRL: 1, USD: 5.15, CNY: 0.72, THB: 0.155, SGD: 4.4, KRW: 0.0037, JPY: 0.034, HKD: 0.66 };

/** The traveler works 09:00–18:00 São Paulo time; this is that shift in each country's clock. */
export const SHIFT = { china: '20:00–05:00', 'hong-kong': '20:00–05:00', singapore: '20:00–05:00', thailand: '19:00–04:00', korea: '21:00–06:00', japan: '21:00–06:00' };

// ---------- dates ----------
export const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (s) => (s ? String(s).slice(0, 10) : '');
export const timeOf = (s) => (String(s || '').match(/T(\d{2}:\d{2})/)?.[1] || '');
const utc = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
export const addDays = (k, n) => new Date(utc(k) + n * 864e5).toISOString().slice(0, 10);
export const diffDays = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
export const weekday = (k) => new Date(utc(k)).getUTCDay();
export const localKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localStamp = (d = new Date()) => `${localKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// ---------- timezones ----------
// Every time on the site is a wall-clock time local to where it happens, so each one is shown with its UTC offset.
// None of these places changes its clocks during the trip (no daylight saving), so one fixed offset each is enough.
/** Hours from UTC, by country id. */
export const TZ_OFFSET = { brazil: -3, turkey: 3, china: 8, 'hong-kong': 8, singapore: 8, thailand: 7, korea: 9, japan: 9 };
/** Hours from UTC, by airport (or city) code. A flight leg can override with tzStart / tzEnd. */
export const AIRPORT_TZ = {
  JOI: -3, SAO: -3, GRU: -3, CGH: -3, VCP: -3, CWB: -3, NVT: -3, FLN: -3, GIG: -3, IST: 3, SAW: 3, ADD: 3, DOH: 3, DXB: 4,
  PVG: 8, SHA: 8, PEK: 8, PKX: 8, XIY: 8, DYG: 8, CTU: 8, TFU: 8, CKG: 8, TXN: 8, HRB: 8, CAN: 8, SZX: 8, HKG: 8, MFM: 8, SIN: 8,
  CNX: 7, BKK: 7, DMK: 7, HKT: 7, ICN: 9, GMP: 9, PUS: 9, CJU: 9, HND: 9, NRT: 9, KIX: 9, ITM: 9, NGO: 9, CTS: 9, FUK: 9,
};
const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
/** "UTC+8", "UTC−3", "UTC+5:30"; '' when the offset is unknown. */
export function tzLabel(off) {
  if (num(off) === null) return '';
  const o = Number(off), a = Math.abs(o), h = Math.floor(a), m = Math.round((a - h) * 60);
  return `UTC${o < 0 ? '−' : '+'}${h}${m ? `:${pad(m)}` : ''}`;
}
/** The instant (ms) of a wall-clock stamp "YYYY-MM-DDTHH:MM" at `off` hours from UTC; NaN when it has no time or offset. */
export const instantOf = (stamp, off) => (timeOf(stamp) && num(off) !== null ? Date.parse(`${String(stamp).slice(0, 16)}:00Z`) - Number(off) * 36e5 : NaN);

/** The offset of the place you are in on `day`: that day's stay, else the last stay before it, else home (Brazil). */
export function offsetOn(legs = [], day) {
  const here = hereOn(legs, day) || legsSorted(legs).filter((l) => l.type === 'stay' && dayKey(l.start) && dayKey(l.start) <= day).pop();
  return here ? (num(here.tz) ?? TZ_OFFSET[here.country] ?? null) : TZ_OFFSET.brazil;
}

/**
 * The offsets a leg's times are in: { start, end } (null when unknown). Flights use their two airports; stays their
 * country; a transfer or note uses a flight of the same day (the airport it lands at, else the one it leaves from),
 * else the stay of that day. "tz" on a leg (or tzStart / tzEnd on a flight) overrides.
 */
export function legOffsets(l, legs = []) {
  if (!l) return { start: null, end: null };
  if (l.type === 'flight') return { start: num(l.tzStart) ?? AIRPORT_TZ[String(l.from || '').toUpperCase()] ?? null, end: num(l.tzEnd) ?? AIRPORT_TZ[String(l.to || '').toUpperCase()] ?? null };
  const own = num(l.tz) ?? (l.type === 'stay' ? TZ_OFFSET[l.country] : undefined) ?? null;
  if (own !== null) return { start: own, end: own };
  const day = dayKey(l.start);
  if (!day) return { start: null, end: null };
  const sorted = legsSorted(legs), i = sorted.findIndex((x) => x === l || (x.id && x.id === l.id));
  const flights = sorted.map((f, j) => ({ f, j })).filter(({ f }) => f.type === 'flight' && f !== l);
  const landed = flights.filter(({ f, j }) => j < i && dayKey(f.end || f.start) === day).pop();
  const leaving = flights.find(({ f, j }) => j > i && dayKey(f.start) === day);
  const off = landed ? legOffsets(landed.f).end : leaving ? legOffsets(leaving.f).start : offsetOn(legs, day);
  return { start: off ?? null, end: off ?? null };
}

const TIME = '(?:(?:[01]?\\d|2[0-3]):[0-5]\\d(?:\\s?[ap]m\\b)?|\\b(?:1[0-2]|0?[1-9])\\s?[ap]m\\b)';
const TIME_RUN = new RegExp(`(?<![\\d:.,])${TIME}(?:\\s?(?:[–—-]|to|and|or|,|, and|, or)\\s?${TIME})*(?!\\d|:\\d)`, 'gi');
/**
 * Where a timezone label belongs in a piece of free text: the index just after each time, or run of times
 * ("20:00–05:00", "20:00, 21:00 and 22:00"), that does not already have one.
 */
export function tzSpots(text) {
  const s = String(text ?? ''), out = [];
  for (const m of s.matchAll(TIME_RUN)) {
    const end = m.index + m[0].length;
    if (!/^\s*\(?(?:UTC|GMT)\b/i.test(s.slice(end))) out.push(end);
  }
  return out;
}
/** Free text with `label` written after every time that has none. */
export function tzText(text, label) {
  let s = String(text ?? '');
  if (!label) return s;
  for (const at of tzSpots(s).reverse()) s = `${s.slice(0, at)} ${label}${s.slice(at)}`;
  return s;
}

// ---------- legs ----------
export const legsSorted = (legs = []) => [...legs].sort((a, b) => String(a.start || '9999').localeCompare(String(b.start || '9999')) || (a.order ?? 0) - (b.order ?? 0));

/** First and last day of the trip, or null when nothing is dated. */
export function tripSpan(legs = []) {
  const dated = legs.filter((l) => dayKey(l.start));
  if (!dated.length) return null;
  const first = dated.map((l) => dayKey(l.start)).sort()[0];
  const last = dated.map((l) => dayKey(l.end || l.start)).sort().at(-1);
  return { first, last, days: diffDays(first, last) + 1 };
}

/** The stay you sleep in on the night of `day` (a same-day stay, like a layover, counts on its day). */
export function stayOn(legs = [], day) {
  return legsSorted(legs).filter((l) => {
    if (l.type !== 'stay' || !dayKey(l.start)) return false;
    const a = dayKey(l.start), b = dayKey(l.end || l.start);
    return a <= day && (day < b || (a === b && day === a));
  }).pop() || null;
}

/** Where you are on `day`: the night's stay, or the stay you check out of that day. */
export function hereOn(legs = [], day) {
  return stayOn(legs, day) || legsSorted(legs).filter((l) => l.type === 'stay' && dayKey(l.start) && dayKey(l.start) <= day && dayKey(l.end || l.start) === day).pop() || null;
}

/** Everything that touches `day`: stays covering it, flights leaving or landing, transfers and notes starting. */
export function eventsOn(legs = [], day) {
  return legsSorted(legs).filter((l) => {
    const a = dayKey(l.start), b = dayKey(l.end || l.start);
    if (!a) return false;
    if (l.type === 'stay') return a <= day && day <= b;
    if (l.type === 'flight') return a === day || b === day;
    return a === day;
  });
}

/** City ids a stay covers ("city" or "cities": a stay can be one block of two towns). */
export const stayCities = (stay) => (!stay ? [] : Array.isArray(stay.cities) && stay.cities.length ? stay.cities : stay.city ? [stay.city] : []);
/** Short name of a stay for calendar cells: "Shanghai" from "Shanghai · Dayin hostel". */
export const stayName = (stay) => String(stay?.title || '').split(' · ')[0].trim() || 'Stay';

/** The next flight that hasn't left yet. A flight with no time counts until its day is over. */
export function nextFlight(legs = [], now = localStamp()) {
  return legsSorted(legs).find((l) => l.type === 'flight' && dayKey(l.start) && (timeOf(l.start) ? String(l.start) > now : dayKey(l.start) >= dayKey(now))) || null;
}

/** "in 15 days", "tomorrow", "today" for a day relative to today. */
export function inDays(today, day) {
  const n = diffDays(today, day);
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 1 ? `in ${n} days` : n === -1 ? 'yesterday' : `${-n} days ago`;
}

// ---------- dated places (events) ----------
const rangesOf = (p) => (Array.isArray(p.days) ? p.days.filter((r) => r && r.from) : []).map((r) => ({ from: dayKey(r.from), to: dayKey(r.to || r.from) }));
const verdictRank = (p) => (p.verdict === 'must' ? 0 : p.verdict === 'maybe' ? 1 : 2);
/** A dated place is an "event" when its window is short; a whole season is not something you can miss in a day. */
export const EVENT_MAX_DAYS = 14;

/** How far a place may be from the city you sleep in and still count as a day trip. */
export const NEAR_KM = 90;
const km = (a, b) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
/** Rough centre of each city: the average position of its cards. */
export function cityCenters(places = []) {
  const acc = new Map();
  for (const p of places) if (p.loc && p.city) { const a = acc.get(p.city) || { lat: 0, lng: 0, n: 0 }; a.lat += p.loc.lat; a.lng += p.loc.lng; a.n++; acc.set(p.city, a); }
  return new Map([...acc].map(([c, a]) => [c, { lat: a.lat / a.n, lng: a.lng / a.n }]));
}
/** "here" (in a city you sleep in), "near" (within NEAR_KM of one: a day trip) or "far". */
export function reachOf(p, cities = [], centers = new Map()) {
  if (cities.includes(p.city)) return 'here';
  if (p.loc && cities.some((c) => centers.has(c) && km(centers.get(c), p.loc) <= NEAR_KM)) return 'near';
  return 'far';
}
const reachRank = { here: 0, near: 1, far: 2 };

/**
 * Dated places on `day` in the country you are in. `reach` says how close each one is to your cities. kind: "only" (one-day event), "last" (its last day),
 * "on" (running, `left` days after today). Skipped places are left out.
 */
export function onDay(places = [], day, { country = null, cities = [] } = {}) {
  const out = [], centers = cityCenters(places);
  for (const p of places) {
    if (p.verdict === 'skip' || (country && p.country !== country)) continue;
    const r = rangesOf(p).find((x) => x.from <= day && day <= x.to);
    if (!r) continue;
    const kind = r.from === r.to ? 'only' : r.to === day ? 'last' : 'on';
    out.push({ place: p, kind, from: r.from, to: r.to, left: diffDays(day, r.to), reach: reachOf(p, cities, centers), season: diffDays(r.from, r.to) + 1 > EVENT_MAX_DAYS });
  }
  const k = { only: 0, last: 1, on: 2 };
  return out.sort((a, b) => reachRank[a.reach] - reachRank[b.reach] || k[a.kind] - k[b.kind] || a.left - b.left || verdictRank(a.place) - verdictRank(b.place));
}

/**
 * Dated places you could still go to: each one's first day that falls inside a stay it can be reached from
 * (`reach`: "here" = the stay's own city, "near" = a day trip). Seasons longer than EVENT_MAX_DAYS are left out.
 */
export function upcomingEvents(places = [], legs = [], today, { limit = 8, includeToday = false } = {}) {
  const stays = legsSorted(legs).filter((l) => l.type === 'stay' && l.country && dayKey(l.start));
  const floor = includeToday ? today : addDays(today, 1);
  const out = [], centers = cityCenters(places);
  for (const p of places) {
    if (p.verdict === 'skip') continue;
    let best = null;
    for (const r of rangesOf(p)) {
      if (diffDays(r.from, r.to) + 1 > EVENT_MAX_DAYS) continue;
      for (const s of stays) {
        if (s.country !== p.country) continue;
        const lo = [r.from, dayKey(s.start), floor].sort().at(-1), hi = [r.to, dayKey(s.end || s.start)].sort()[0];
        if (lo > hi) continue;
        const reach = reachOf(p, stayCities(s), centers);
        if (reach === 'far') continue;
        const c = { place: p, date: lo, to: hi, reach, stay: s, open: s.status === 'tbd' };
        if (!best || reachRank[c.reach] < reachRank[best.reach] || (c.reach === best.reach && c.date < best.date)) best = c;
      }
    }
    if (best) out.push(best);
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || reachRank[a.reach] - reachRank[b.reach] || verdictRank(a.place) - verdictRank(b.place));
  return limit ? out.slice(0, limit) : out;
}

// ---------- today ----------
/** Everything the Today view shows for one day. `now` is a local stamp "YYYY-MM-DDTHH:MM". */
export function todayModel({ legs = [], places = [], tasks = [], days = [], visited = [], today = localKey(), now = localStamp() } = {}) {
  const sorted = legsSorted(legs);
  const span = tripSpan(sorted);
  const phase = !span ? 'none' : today < span.first ? 'before' : today > span.last ? 'after' : 'during';
  const stay = phase === 'during' ? hereOn(sorted, today) : null;
  const tonight = phase === 'during' ? stayOn(sorted, today) : null;
  const country = stay?.country || null, cities = stayCities(stay);
  const nextStay = sorted.find((l) => l.type === 'stay' && dayKey(l.start) > today && l !== stay) || null;
  const been = new Set(visited.map((v) => v.id));
  // only what can be reached from where you sleep; a stay with no city on file keeps the whole country
  const happening = country ? onDay(places, today, { country, cities }).filter((h) => !cities.length || h.reach !== 'far') : [];
  const onlyToday = happening.filter((h) => h.kind !== 'on');
  const endingSoon = happening.filter((h) => h.kind === 'on' && h.left <= 7 && !h.season);
  const listed = new Set([...onlyToday, ...endingSoon].map((h) => h.place.id));
  const musts = places.filter((p) => p.verdict === 'must' && cities.includes(p.city) && !been.has(p.id) && !listed.has(p.id))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const st = (t) => t.status || (t.done ? 'done' : 'todo');
  const open = tasks.filter((t) => st(t) !== 'done').sort((a, b) => Number(st(b) === 'doing') - Number(st(a) === 'doing') || (a.order ?? 0) - (b.order ?? 0));
  return {
    today, phase, span,
    dayNumber: phase === 'during' ? diffDays(span.first, today) + 1 : null,
    toDeparture: phase === 'before' ? diffDays(today, span.first) : null,
    stay, tonight, nextStay, country, cities,
    flight: nextFlight(sorted, now),
    moves: sorted.filter((l) => l.type !== 'stay' && (dayKey(l.start) === today || (l.type === 'flight' && dayKey(l.end) === today))),
    day: days.find((d) => d.id === today) || null,
    shift: country ? SHIFT[country] || null : null,
    onlyToday, endingSoon,
    upcoming: upcomingEvents(places.filter((p) => !listed.has(p.id)), sorted, today, { limit: 6 }),
    musts,
    tasks: open, tasksTotal: tasks.length,
  };
}

// ---------- search ----------
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Text a place is searched by. */
export const haystack = (p, catLabel = '') => fold([p.name, p.short, p.name_local, p.cityName, p.city, p.area, catLabel, p.category, p.kind, (p.tags || []).join(' '), p.why, p.note].filter(Boolean).join(' · '));

/**
 * Filter places: every word of `q` must appear somewhere; `cities` (ids), `country`, `category`,
 * `show`: "picks" (Must + Maybe), "must", "been", "todo" (picks not visited) or "all".
 * Order: Must, Maybe, not called, Skip; then by ranking.
 */
export function searchPlaces(places = [], { q = '', cities = null, country = null, category = null, show = 'all', visited = [], categories = {} } = {}) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  const been = new Set(visited.map((v) => v.id));
  const order = (p) => (p.verdict === 'must' ? 0 : p.verdict === 'maybe' ? 1 : p.verdict === 'skip' ? 3 : 2);
  return places.filter((p) => {
    if (cities && !cities.includes(p.city)) return false;
    if (country && p.country !== country) return false;
    if (category && p.category !== category) return false;
    if (show === 'picks' && p.verdict !== 'must' && p.verdict !== 'maybe') return false;
    if (show === 'must' && p.verdict !== 'must') return false;
    if (show === 'been' && !been.has(p.id)) return false;
    if (show === 'todo' && (been.has(p.id) || (p.verdict !== 'must' && p.verdict !== 'maybe'))) return false;
    if (!words.length) return true;
    const h = haystack(p, categories[p.category]?.label);
    return words.every((w) => h.includes(w));
  }).sort((a, b) => order(a) - order(b) || (b.rating ?? 0) - (a.rating ?? 0) || String(a.name).localeCompare(String(b.name)));
}

// ---------- calendar ----------
/** Runs of work / vacation days for the strip above the calendar: [{ kind, from, to, n }]. */
export function periods(days = []) {
  const runs = [];
  let cur = null;
  for (const x of [...days].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.id) && ['work', 'vacation', 'off'].includes(d.status)).sort((a, b) => a.id.localeCompare(b.id))) {
    if (x.status === 'off') continue;
    if (!cur || cur.kind !== x.status) { cur = { kind: x.status, from: x.id, to: x.id, n: 0 }; runs.push(cur); }
    cur.to = x.id; cur.n++;
  }
  return runs;
}

// ---------- money ----------
export const dailyOf = (b) => (Number(b.bed) || 0) + (Number(b.food) || 0) + (Number(b.other) || 0);
export function moneyTotals({ budget = [], fixed = [], spend = [], settings = [] } = {}) {
  const cap = Number(settings.find((s) => s.id === 'main')?.cap) || 0;
  const fixedT = fixed.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const groundT = budget.reduce((a, b) => a + dailyOf(b) * (Number(b.days) || 0), 0);
  const spentT = spend.reduce((a, x) => a + (Number(x.amountBRL) || 0), 0);
  return { cap, fixedT, groundT, spentT, planT: fixedT + groundT, spare: cap - fixedT - groundT, days: budget.reduce((a, b) => a + (Number(b.days) || 0), 0) };
}

/** Booking check: is `price` in `cur` within the country's bed / food / other budget? */
export function priceCheck(b, kind, price, cur = 'BRL') {
  const brl = Number(price) * (RATES[cur] || 1), lim = Number(b?.[kind]) || 0;
  if (!b || !(brl > 0)) return { level: 'idle' };
  if (!lim) return { level: 'idle', brl };
  const r = brl / lim;
  return { level: r <= 1 ? 'ok' : r <= 1.25 ? 'warn' : 'over', brl, limit: lim, diff: Math.abs(brl - lim) };
}
