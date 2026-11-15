// Board maths: ranking, cutoff lines, balance meter, budget check, book-ahead list,
// holiday dates. Pure (Node + browser). Never produces a day-by-day schedule.
//
// A "game place" is a plain object the server sends to the client:
// { id, name, country, city, category, tags, verdict, rating, games, brl, budgeted,
//   booking: { level: 'required'|'recommended'|'none', lead_days, badge, links } }

// { id, days: [{from, to}], holidays: [holiday ids] } are also sent, for dated places and holiday options.

// Lunar New Year's Day moves every year (21 Jan – 20 Feb). One line per year; this is the only place the date lives.
export const LUNAR_NEW_YEAR = { 2027: '2027-02-06' };

// A holiday is a fixed month-day (`md`) or a list of full dates (`dates`, for one that moves).
// `before` / `after`: days around the date that still count (the eve, the public-holiday days after).
// pick 'one' (default): rival options across cities for one night, so duel them and lock one.
// pick 'many': the city is fixed and the options fall on different days, so they don't compete:
//   no lock, no duel; each option keeps its own Must / Maybe / Skip call.
export const HOLIDAYS = {
  christmas: { id: 'christmas', tag: 'christmas', md: '12-25', title: 'Where for Christmas?', short: 'Christmas', emoji: '🎄' },
  nye: { id: 'nye', tag: 'nye', md: '12-31', title: "Where for New Year's Eve?", short: "New Year's Eve", emoji: '🎆' },
  lny: { id: 'lny', tag: 'lunar-new-year-option', dates: Object.values(LUNAR_NEW_YEAR), before: 1, after: 2, pick: 'many', title: 'What to do for Lunar New Year?', short: 'Lunar New Year', emoji: '🧧' },
};
export const picksMany = (holidayId) => HOLIDAYS[holidayId]?.pick === 'many';

const VERDICT_ORDER = { must: 0, maybe: 1 };

/** Add n days to YYYY-MM-DD (UTC). */
export function addDays(date, n) {
  const d = new Date(String(date).slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const ymd = (d) => String(d ?? '').slice(0, 10);

/** The country the traveler is in on a date (from <= date < to), or null. */
export function countryOn(date, countries = []) {
  return countries.find((c) => ymd(c.from) <= date && date < ymd(c.to))?.id ?? null;
}

/** Concrete date of a holiday inside the trip window (e.g. '2026-12-25'), or null. */
export function holidayDate(holidayId, countries = []) {
  const h = HOLIDAYS[holidayId];
  if (!h || !countries.length) return null;
  const start = countries.map((c) => ymd(c.from)).sort()[0];
  const end = countries.map((c) => ymd(c.to)).sort().at(-1);
  const candidates = h.dates || [...new Set([start.slice(0, 4), end.slice(0, 4)])].map((y) => `${y}-${h.md}`);
  return candidates.find((d) => d >= start && d <= end) ?? null;
}

/** The days a holiday covers inside the trip window: { from, to } (one day unless it has `before` / `after`), or null. */
export function holidayRange(holidayId, countries = []) {
  const date = holidayDate(holidayId, countries);
  if (!date) return null;
  const h = HOLIDAYS[holidayId];
  return { from: addDays(date, -(h.before || 0)), to: addDays(date, h.after || 0) };
}

/** The first day a dated place (place.days: [{from, to}]) is on within a range, or null (not dated, or never in it). */
export function holidayDay(place, range) {
  if (!range) return null;
  for (const r of place?.days || []) {
    const lo = r.from > range.from ? r.from : range.from, hi = r.to < range.to ? r.to : range.to;
    if (lo <= hi) return lo;
  }
  return null;
}

/** Days per country: local what-if override, else trip config. */
export function daysFor(country, overrides = {}) {
  const o = overrides?.[country.id];
  return Number.isFinite(o) && o >= 0 ? o : (country.days ?? 0);
}

/**
 * Ranked candidates for one country: Must/Maybe only. Locked holiday picks first
 * (they're decided), then rating, then Must before Maybe, then name.
 */
export function rankCountry(places, countryId, locks = {}) {
  const locked = new Set(Object.values(locks || {}).filter(Boolean));
  return places
    .filter((p) => p.country === countryId && (p.verdict === 'must' || p.verdict === 'maybe' || locked.has(p.id)))
    .sort((a, b) => (locked.has(b.id) - locked.has(a.id))
      || (b.rating ?? 1500) - (a.rating ?? 1500)
      || (VERDICT_ORDER[a.verdict] ?? 2) - (VERDICT_ORDER[b.verdict] ?? 2)
      || String(a.name).localeCompare(String(b.name)));
}

/** Split a ranked list at the cutoff (one attraction per day). */
export function cutoff(ranked, days) {
  const n = Math.max(0, Math.floor(days || 0));
  return { above: ranked.slice(0, n), below: ranked.slice(n), open: Math.max(0, n - ranked.length) };
}

/**
 * Category mix of above-the-line picks.
 * opts: { interests: [category ids the traveler wants], dominantShare = 0.4, minForDominant = 4, minForMissing = 5, labels }
 */
export function balance(picks, opts = {}) {
  const { interests = [], dominantShare = 0.4, minForDominant = 4, minForMissing = 5, labels = {} } = opts;
  const counts = {};
  for (const p of picks) if (p.category) counts[p.category] = (counts[p.category] || 0) + 1;
  const total = picks.length;
  const shares = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, total ? v / total : 0]));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const dominant = top && total >= minForDominant && top[1] / total > dominantShare ? { category: top[0], share: top[1] / total } : null;
  const missing = total >= minForMissing ? interests.filter((c) => !counts[c]) : [];
  const L = (c) => labels[c] || c;
  const nudges = [];
  if (dominant) nudges.push({ kind: 'dominant', category: dominant.category, text: `Heavy on ${L(dominant.category)}: ${Math.round(dominant.share * 100)}% of your picks. Duel a few others up?` });
  for (const c of missing) nudges.push({ kind: 'missing', category: c, text: `No ${L(c)} above the line yet.` });
  return { counts, shares, total, dominant, missing, nudges };
}

/**
 * Attraction spend vs the "everything else" budget for the days in a country.
 * Only places where countsAgainstBudget() is true count (food is budgeted separately).
 * status: ok (< 60% of the budget, leaves room for transport/nightlife), tight (60–100%), over (> 100%).
 */
export function budget(picks, days, perDay) {
  const counted = picks.filter((p) => p.budgeted !== false);
  const spend = counted.reduce((s, p) => s + (Number(p.brl) || 0), 0);
  const cap = (days || 0) * (perDay || 0);
  const share = cap > 0 ? spend / cap : (spend > 0 ? Infinity : 0);
  const status = share > 1 ? 'over' : share >= 0.6 ? 'tight' : 'ok';
  return { spend: Math.round(spend * 100) / 100, cap, share, status, perDayAvg: days ? spend / days : 0, perDay: perDay || 0, excluded: picks.length - counted.length };
}

/**
 * Book-ahead list for the picks, sorted by deadline.
 * Deadline = visit date − lead_days, where the visit date is the holiday date for a locked
 * holiday pick, its own day for an option of a many-pick holiday (Lunar New Year), else the first
 * day in that country (the latest safe date if you went on day one).
 */
export function bookAhead(picks, countries = [], locks = {}) {
  const lockDate = {};
  for (const [h, id] of Object.entries(locks || {})) if (id) lockDate[id] = { date: holidayDate(h, countries), holiday: h };
  // An option of a many-pick holiday happens on its own day of the holiday, not on the first day in the country.
  for (const p of picks) for (const h of p.holidays || []) {
    const day = picksMany(h) ? holidayDay(p, holidayRange(h, countries)) : null;
    if (day && !lockDate[p.id]) lockDate[p.id] = { date: day, holiday: h };
  }
  const from = Object.fromEntries(countries.map((c) => [c.id, ymd(c.from)]));
  const seen = new Set();
  return picks
    .filter((p) => p.booking && p.booking.level !== 'none' && !seen.has(p.id) && seen.add(p.id))
    .map((p) => {
      const visit = lockDate[p.id]?.date || from[p.country] || null;
      const lead = p.booking.lead_days ?? 0;
      return { id: p.id, name: p.name, country: p.country, city: p.city, level: p.booking.level, lead_days: lead, badge: p.booking.badge, links: p.booking.links || [], holiday: lockDate[p.id]?.holiday || null, visit, deadline: visit ? addDays(visit, -lead) : null };
    })
    .sort((a, b) => String(a.deadline ?? '9999').localeCompare(String(b.deadline ?? '9999'))
      || (a.level === b.level ? 0 : a.level === 'required' ? -1 : 1)
      || b.lead_days - a.lead_days);
}

/**
 * The whole board.
 * input: { places, countries: [{id, name, flag, days, budget_brl_per_day, from, to}], days: overrides,
 *          locks: {christmas, nye}, interests, dominantShare, labels }
 */
export function buildBoard({ places = [], countries = [], days = {}, locks = {}, interests = [], dominantShare = 0.4, labels = {} }) {
  const rows = countries.map((c) => {
    const d = daysFor(c, days);
    const ranked = rankCountry(places, c.id, locks);
    const { above, below, open } = cutoff(ranked, d);
    return {
      id: c.id, name: c.name, flag: c.flag, from: c.from, to: c.to,
      days: d, configDays: c.days ?? 0, changed: d !== (c.days ?? 0), perDay: c.budget_brl_per_day,
      ranked, above, below, open,
      budget: budget(above, d, c.budget_brl_per_day),
      balance: balance(above, { interests: [], dominantShare, labels }),
    };
  });
  const picks = rows.flatMap((r) => r.above);
  const lockedPicks = Object.values(locks || {}).map((id) => places.find((p) => p.id === id)).filter(Boolean);
  return {
    countries: rows,
    picks,
    totalDays: rows.reduce((s, r) => s + r.days, 0),
    configTotal: countries.reduce((s, c) => s + (c.days ?? 0), 0),
    balance: balance(picks, { interests, dominantShare, labels }),
    bookAhead: bookAhead([...lockedPicks, ...picks], countries, locks),
  };
}

/**
 * Holiday options: places tagged with the holiday's tag. Nothing is dropped for its dates.
 * With `countries`, the options of a many-pick holiday come in day order (those with no day in the holiday last).
 */
export function holidayOptions(places, holidayId, countries) {
  const tag = HOLIDAYS[holidayId]?.tag;
  const opts = places.filter((p) => (p.tags || []).includes(tag));
  if (!countries || !picksMany(holidayId)) return opts;
  const range = holidayRange(holidayId, countries);
  const day = (p) => holidayDay(p, range) || '9999';
  return opts.sort((a, b) => day(a).localeCompare(day(b)) || String(a.name).localeCompare(String(b.name)));
}
