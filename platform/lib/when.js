// Dated events: `when` on a place or area, and how its dates meet the trip dates.
import { isStay } from './kinds.js';
import { COUNTRIES } from './schema/enums.js';

const DAY = 86400000;
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? '').slice(0, 10));
const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const ts = (s) => Date.parse(s + 'T00:00:00Z');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAY_NAMES = { sun: 'Sundays', mon: 'Mondays', tue: 'Tuesdays', wed: 'Wednesdays', thu: 'Thursdays', fri: 'Fridays', sat: 'Saturdays' };
export const WHEN_KINDS = {
  only: 'it happens only on these dates',
  season: 'it is open during this period (a seasonal opening or a festival that runs for weeks)',
  best: 'the place is there all the time, but this page is about these dates',
};
/** "31 Dec" */
export const dayLabel = (s) => { const [, m, d] = iso(s).split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
/** "31 Dec" · "24–26 Dec" · "17 Dec – 21 Feb" */
export function rangeLabel(r) {
  if (r.open) return `from ${dayLabel(r.from)}`;
  if (r.from === r.to) return dayLabel(r.from);
  return r.from.slice(0, 7) === r.to.slice(0, 7) ? `${Number(r.from.slice(8))}–${dayLabel(r.to)}` : `${dayLabel(r.from)} – ${dayLabel(r.to)}`;
}
/** "24 Dec, 31 Dec +1 more" */
const listLabel = (rs, max = 2) => rs.slice(0, max).map(rangeLabel).join(', ') + (rs.length > max ? ` +${rs.length - max} more` : '');

/** 'only' | 'season' | 'best' (default 'only'). */
export const whenKind = (item) => (WHEN_KINDS[item?.when?.kind] ? item.when.kind : 'only');
/** Weekdays of `when.weekly` as lowercase three-letter names, in week order (Mon first). [] when not weekly. */
export function weeklyDays(item) {
  const w = item?.when?.weekly;
  const list = (Array.isArray(w) ? w : w ? [w] : []).map((x) => String(x).toLowerCase().slice(0, 3)).filter((x) => WEEKDAYS.includes(x));
  return [...new Set(list)].sort((a, b) => ((WEEKDAYS.indexOf(a) + 6) % 7) - ((WEEKDAYS.indexOf(b) + 6) % 7));
}

// A range with no `to` (only the opening date is announced) runs open-ended: a year, for every date computation.
const OPEN_DAYS = 365;
const plusDays = (s, n) => new Date(ts(s) + n * DAY).toISOString().slice(0, 10);

/**
 * The date ranges as written, sorted: [{ from, to, open? }] (ISO strings). Empty when the item is not date-bound.
 * open: true = no end date announced (to is set a year ahead so overlaps work; labels say "from 18 Dec").
 */
export function eventDates(item) {
  const ds = Array.isArray(item?.when?.dates) ? item.when.dates : [];
  return ds.map((r) => (r?.to === undefined || r?.to === null) && ok(iso(r?.from)) ? { from: iso(r.from), to: plusDays(iso(r.from), OPEN_DAYS), open: true } : { from: iso(r?.from), to: iso(r?.to ?? r?.from) }).filter((r) => ok(r.from) && ok(r.to) && r.from <= r.to).sort((a, b) => a.from.localeCompare(b.from));
}

/** Merge a sorted list of ISO days into ranges of consecutive days. */
function mergeDays(days) {
  const out = [];
  for (const d of days) {
    const last = out.at(-1);
    if (last && ts(d) - ts(last.to) === DAY) last.to = d; else out.push({ from: d, to: d });
  }
  return out;
}

/**
 * The days it really happens: `dates`, narrowed to the `weekly` weekdays when set
 * (a range of Saturdays becomes one single-day range per Saturday). Sorted ranges.
 */
export function eventDays(item) {
  const ds = eventDates(item);
  const wk = weeklyDays(item);
  if (!wk.length) return ds;
  const days = [];
  for (const r of ds) for (let t = ts(r.from), n = 0; t <= ts(r.to) && n < 800; t += DAY, n++) if (wk.includes(WEEKDAYS[new Date(t).getUTCDay()])) days.push(new Date(t).toISOString().slice(0, 10));
  return mergeDays([...new Set(days)].sort());
}

/**
 * Chip / quick-fact text. `when.label` wins; otherwise it follows `when.kind`:
 * only → "31 Dec only", "24–26 Dec", "Saturdays, 6 Dec – 2 Jan" · season → "From 20 Dec to 28 Feb"
 * ("From about …" when not confirmed) · best → "Best on 24–25 Dec". Null without dates.
 */
export function whenLabel(item) {
  const ds = eventDates(item);
  if (!ds.length) return null;
  if (item.when.label) return String(item.when.label);
  const kind = whenKind(item);
  const wk = weeklyDays(item);
  const days = wk.length ? `${wk.map((d) => WEEKDAY_NAMES[d]).join(' and ')}, ` : '';
  if (kind === 'season') {
    const from = ds[0].from, to = ds.at(-1).to;
    return `${days}${item.when.confirmed === false ? 'from about' : 'from'} ${dayLabel(from)}${ds.at(-1).open ? '' : to !== from ? ` to ${dayLabel(to)}` : ''}`.replace(/^./, (c) => c.toUpperCase());
  }
  if (kind === 'best') return `Best on ${days ? days.toLowerCase() : ''}${listLabel(ds)}`;
  if (wk.length) return `${days}${listLabel(ds)}`;
  if (ds.length === 1) return ds[0].open ? `From ${dayLabel(ds[0].from)}` : ds[0].from === ds[0].to ? `${dayLabel(ds[0].from)} only` : rangeLabel(ds[0]);
  return listLabel(ds);
}

/** What the chip means, for a title attribute. */
export function whenTitle(item) {
  if (item?.when?.confirmed === false) return 'Dates not confirmed yet';
  if (eventDates(item).some((r) => r.open)) return 'Opening date announced; end date not announced yet';
  return { only: 'Only on these dates', season: 'Open during this period', best: 'Open all the time; best on these dates' }[whenKind(item)];
}

/** The single date of a one-day event of kind `only`, else null. */
export function singleDay(item) {
  if (whenKind(item) !== 'only') return null;
  const ds = eventDays(item);
  return ds.length === 1 && ds[0].from === ds[0].to ? ds[0].from : null;
}

/**
 * The days the traveler is in the item's country: { from, to }, or null.
 * `trip` is the trip config (config/trip.yaml: { countries: [{ id, from, to }] }) or already a window { from, to }.
 */
export function tripWindow(item, trip) {
  const c = trip?.countries ? trip.countries.find((x) => x.id === item?.country) : trip;
  const from = iso(c?.from), to = iso(c?.to);
  return c && ok(from) && ok(to) ? { from, to } : null;
}

/**
 * The months the traveler is in the item's country, for "typical weather" and seasonal-hours labels:
 * "Feb" (Hong Kong, 4–9 Feb), "Jan–Feb" (Japan), "Dec–Jan" (China). Without trip dates: the trip's "Dec–Jan".
 */
export function tripMonths(item, trip) {
  const w = tripWindow(item, trip);
  if (!w) return 'Dec–Jan';
  const a = MONTHS[Number(w.from.slice(5, 7)) - 1], b = MONTHS[Number(w.to.slice(5, 7)) - 1];
  return w.from.slice(0, 7) === w.to.slice(0, 7) ? a : `${a}–${b}`;
}

/**
 * How the event days meet the trip. Returns { state, window, usable: [{from,to}] }.
 * state: 'always' (no `when`: open any day) | 'full' (every event day is a trip day) |
 *        'partial' (some are) | 'none' (the traveler is never there on those days).
 * Without trip dates for the country a dated place counts as 'full'.
 */
export function tripOverlapInfo(item, trip) {
  const ds = eventDays(item);
  const window = tripWindow(item, trip);
  if (!eventDates(item).length) return { state: 'always', window, usable: [] };
  if (!window) return { state: 'full', window: null, usable: ds };
  const usable = ds.map((r) => ({ from: r.from > window.from ? r.from : window.from, to: r.to < window.to ? r.to : window.to })).filter((r) => r.from <= r.to);
  const days = (rs) => rs.reduce((n, r) => n + (ts(r.to) - ts(r.from)) / DAY + 1, 0);
  return { state: !usable.length ? 'none' : days(usable) === days(ds) ? 'full' : 'partial', window, usable };
}

/** 'always' | 'full' | 'partial' | 'none' (see tripOverlapInfo). */
export const tripOverlap = (item, trip) => tripOverlapInfo(item, trip).state;

/**
 * What to tell the traveler about a dated page and their route, or null when there is nothing to say
 * (not dated, every date is on the route, or no trip dates known).
 * Returns { state: 'none' | 'partial', chip, text }:
 *   none    → chip "Not on your route", text "Not on your route: you're in Hong Kong 19–22 Jan"
 *   partial → chip "On your route: 17 Dec – 2 Jan", text the same
 * For kind `best` the place itself is still visitable, so the wording is about the dates only.
 */
export function routeNote(item, trip) {
  const o = tripOverlapInfo(item, trip);
  if (!o.window || (o.state !== 'none' && o.state !== 'partial')) return null;
  const where = COUNTRIES[item.country]?.name || 'that country';
  const there = `you're in ${where} ${rangeLabel(o.window)}`;
  const best = whenKind(item) === 'best';
  if (o.state === 'none') return best ? { state: 'none', chip: 'Best dates not on your route', text: `Its best dates are not on your route: ${there}` } : { state: 'none', chip: 'Not on your route', text: `Not on your route: ${there}` };
  const usable = listLabel(o.usable, 4);
  return { state: 'partial', chip: `On your route: ${usable}`, text: `On your route: ${usable} (${there})` };
}

/**
 * Single-day events of kind `only` that share a date: the traveler can only pick one of each group.
 * Returns [{ date, ids, places }] for dates with 2+ places, by date. Stays are ignored.
 */
export function sameDayGroups(places) {
  const by = new Map();
  for (const p of places || []) {
    const d = isStay(p) ? null : singleDay(p);
    if (d) by.set(d, [...(by.get(d) || []), p]);
  }
  return [...by.entries()].filter(([, ps]) => ps.length > 1).sort((a, b) => a[0].localeCompare(b[0])).map(([date, ps]) => ({ date, ids: ps.map((p) => p.id), places: ps }));
}

const DATEY = /(^|[^a-z])(nye|new[- ]?years?|christmas|xmas|festival|countdown|fireworks)([^a-z]|$)/i;
const STARTS_WITH_DATE = /^\s*((\d{1,2}(st|nd|rd|th)?\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(\s+\d{1,2})?\b|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\b)/i;
/** Why a place looks date-bound although it has no `when` (or null). */
export function looksDated(p) {
  if (eventDates(p).length) return null;
  const hit = [p?.name, p?.id, ...(p?.tags || [])].map((s) => String(s || '').match(DATEY)?.[2]).find(Boolean);
  if (hit) return `its name or tags mention "${hit.toLowerCase()}"`;
  const bt = [p?.best_time, ...(Array.isArray(p?.blocks) ? p.blocks.filter((b) => b?.type === 'quick_facts').map((b) => b.best_time) : [])].find((s) => STARTS_WITH_DATE.test(String(s || '')));
  return bt ? `best_time starts with a date ("${String(bt).slice(0, 30)}")` : null;
}
