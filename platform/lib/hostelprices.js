// Hostelworld prices per night from the public availability feed that Hostelworld's own pages call
// (prod.apigee.hostelworld.com/legacy-hwapi-service/2.2/properties/<id>/availability/). One request per night.
import { httpsGet, sleep } from './net.js';

const API = 'https://prod.apigee.hostelworld.com/legacy-hwapi-service/2.2/properties';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};
export const MAX_NIGHTS = 31;

/** Hostelworld property id from an id or any hostelworld URL form (pwa/hosteldetails.php/…/<id>, hostels/p/<id>/…). */
export function hostelId(ref) {
  const s = String(ref ?? '').trim();
  if (/^\d{3,}$/.test(s)) return s;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!/(^|\.)hostelworld\.com$/.test(u.hostname)) return null;
  const segs = u.pathname.split('/').filter(Boolean);
  const p = segs.indexOf('p');
  if (p >= 0 && /^\d+$/.test(segs[p + 1] || '')) return segs[p + 1];
  if (/^properties$/.test(segs[segs.length - 2] || '') || segs.includes('properties')) { const i = segs.indexOf('properties'); if (/^\d+$/.test(segs[i + 1] || '')) return segs[i + 1]; }
  const nums = segs.filter((x) => /^\d{3,}$/.test(x));
  return nums.length ? nums[nums.length - 1] : (u.searchParams.get('id') || u.searchParams.get('propertyId') || null);
}

const isoDay = (d) => d.toISOString().slice(0, 10);
export const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekday = (iso) => WD[new Date(`${iso}T00:00:00Z`).getUTCDay()];

/** Check-in dates from `from` up to the night before `to` (Hostelworld's from/to: `to` is the check-out day). */
export function nightsBetween(from, to) {
  const out = [];
  for (let d = from; d < to && out.length <= MAX_NIGHTS; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The dated page a reviewer can open: the pwa form renders prices for the dates (the /hostels/p/ form ignores them). */
export function pageUrl({ id, name, city }, from, to, currency) {
  const slug = (s, dflt) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || dflt;
  return `https://www.hostelworld.com/pwa/hosteldetails.php/${slug(name, 'Hostel')}/${slug(city, 'City')}/${id}?from=${from}&to=${to}&guests=1${currency ? `&currency=${currency}` : ''}`;
}
export const feedUrl = (id, date, currency) => `${API}/${id}/availability/?guests=1&num-nights=1&date-start=${date}${currency ? `&currency=${currency}` : ''}&application=web`;

const num = (p) => (p && p.value != null && Number.isFinite(Number(p.value)) ? Number(p.value) : null);

/** Cheapest offer of one kind ('dorms' | 'privates') in an availability answer, or null when none is on sale. */
export function cheapest(rooms = [], kind) {
  let best = null, bestFlex = null;
  for (const r of rooms) {
    const plans = Object.fromEntries((r.ratePlans || []).map((p) => [p.id, p]));
    for (const a of r.averagePricePerNight || r.lowestPricePerNight && [r.lowestPricePerNight] || []) {
      const price = num(a.price);
      if (price == null) continue;
      const plan = plans[a.ratePlan];
      const refundable = plan?.paymentProcedure?.id !== 'nonRefundable';
      const o = { price, currency: a.price.currency, room: String(r.name || '').replace(/\s+/g, ' ').trim(), sleeps: Number(r.capacity) || null, plan: plan?.paymentProcedure?.label || null, refundable, left: kind === 'dorms' ? r.totalBedsAvailable ?? null : r.totalRoomsAvailable ?? null };
      if (!best || price < best.price) best = o;
      if (refundable && (!bestFlex || price < bestFlex.price)) bestFlex = o;
    }
  }
  if (!best) return null;
  return { ...best, ...(bestFlex && bestFlex !== best && !best.refundable ? { refundable_price: bestFlex.price, refundable_plan: bestFlex.plan } : {}) };
}

/** One night from the parsed feed answer. */
export function parseNight(date, j) {
  const dorm = cheapest(j?.rooms?.dorms, 'dorms');
  const priv = cheapest(j?.rooms?.privates, 'privates');
  return {
    date,
    dorm, private: priv,
    on_sale: Boolean(dorm || priv),
    free_cancellation_until: j?.freeCancellationAvailable ? j.freeCancellationAvailableUntil || null : null,
    stay_rules: Array.isArray(j?.stayRuleViolations) && j.stayRuleViolations.length ? j.stayRuleViolations : undefined,
  };
}

/**
 * Empty nights: "sold out" when beds are on sale on a later date (the property sells that far ahead), "not on sale
 * yet" when beds exist only on earlier dates (past the property's booking horizon), else "no beds on any date checked".
 * withBeds: dates known to have beds (the range plus probes).
 */
export function classifyEmpty(nights, withBeds) {
  const sorted = [...withBeds].sort();
  for (const n of nights) {
    if (n.on_sale) { n.status = 'on sale'; continue; }
    const later = sorted.find((d) => d > n.date), earlier = [...sorted].reverse().find((d) => d < n.date);
    if (later) { n.status = 'sold out'; n.status_note = `beds are on sale on ${later}, so this night is sold out (or closed)`; }
    else if (earlier) { n.status = 'not on sale yet'; n.status_note = `beds on sale on ${earlier}, none on this night or the later dates checked: the hostel has not opened these dates yet, or is full on all of them`; }
    else { n.status = 'no beds'; n.status_note = 'no beds on sale on any date checked: not on sale yet, closed, or delisted'; }
  }
  return nights;
}

async function getJson(url, get) {
  let last;
  for (let i = 0; i < 2; i++) {
    let r;
    try { r = await get(url, { headers: HEADERS, timeoutMs: 20000 }); } catch (e) { last = `network error: ${e.message}`; await sleep(800); continue; }
    if (r.status === 404) {
      let msg = '';
      try { msg = JSON.parse(String(r.body)).description?.map((d) => d.message).join('; '); } catch { /* html */ }
      const e = new Error(`Hostelworld has no active property with this id${msg ? ` (${msg})` : ''}`); e.notFound = true; throw e;
    }
    if (r.status >= 200 && r.status < 300) { try { return JSON.parse(String(r.body)); } catch { last = 'the answer was not JSON'; } }
    else last = `HTTP ${r.status}`;
    await sleep(800);
  }
  const e = new Error(`Hostelworld's availability feed could not be read (${last})`); e.feed = true; throw e;
}

/**
 * Prices per night. opts: { from, to, currency, get (injectable, default httpsGet), fx (cur → { rate, date, source }),
 * gapMs = 250, probe = true }. Returns { id, name, city, currency, fx, nights: [...], page, feed, probes }.
 */
export async function hostelPrices(ref, opts = {}) {
  const id = hostelId(ref);
  if (!id) throw new Error(`"${ref}" is not a Hostelworld id or hostelworld.com URL with an id`);
  const get = opts.get || httpsGet;
  const gap = opts.gapMs ?? 250;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const from = opts.from, to = opts.to || (DAY.test(from || '') && !Number.isNaN(Date.parse(from)) ? addDays(from, 1) : null);
  if (!DAY.test(from || '') || !DAY.test(to || '') || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) throw new Error('--from and --to take dates as YYYY-MM-DD (--to is the check-out day)');
  if (to <= from) throw new Error('--to is the check-out day and must come after --from');
  const dates = nightsBetween(from, to);
  if (dates.length > MAX_NIGHTS) throw new Error(`at most ${MAX_NIGHTS} nights per call`);

  let info = {};
  try { info = await getJson(`${API}/${id}/?application=web`, get); } catch (e) { if (e.notFound) throw e; info = {}; }
  // Name and city for the page URL: the feed's, else whatever the URL given carried.
  let name = info.name, city = info.city?.name;
  if (!name) try { const segs = new URL(ref).pathname.split('/'); const i = segs.indexOf('hosteldetails.php'); if (i >= 0) { name = segs[i + 1]; city = segs[i + 2]; } } catch { /* an id */ }
  const currency = (opts.currency || info.currency || '').toUpperCase() || null;

  const nights = [];
  for (const d of dates) {
    try { nights.push(parseNight(d, await getJson(feedUrl(id, d, currency), get))); }
    catch (e) { if (e.notFound) throw e; nights.push({ date: d, error: e.message }); }
    if (gap) await sleep(gap);
  }
  // Probes tell "sold out" from "not on sale yet" for empty nights.
  const withBeds = new Set(nights.filter((n) => n.on_sale).map((n) => n.date));
  const probes = [];
  const empty = nights.filter((n) => !n.error && !n.on_sale);
  if (empty.length && opts.probe !== false) {
    const lastEmpty = empty[empty.length - 1].date;
    const today = opts.today || isoDay(new Date());
    const tries = [7, 30, 90].map((k) => addDays(lastEmpty, k));
    if (!withBeds.size) { const near = addDays(today, 14); if (near < from) tries.push(near); }
    for (const d of tries) {
      try { const n = parseNight(d, await getJson(feedUrl(id, d, currency), get)); probes.push({ date: d, on_sale: n.on_sale }); if (n.on_sale) withBeds.add(d); } catch { /* a probe is optional */ }
      if (gap) await sleep(gap);
      if (d > lastEmpty && withBeds.has(d)) break;
    }
  }
  classifyEmpty(nights.filter((n) => !n.error), withBeds);

  let fx = null;
  if (currency && opts.fx !== false) try { fx = await (opts.fx || (async (c) => (await import('./fx.js')).getRate(c)))(currency); } catch (e) { fx = { error: e.message }; }
  const brl = (v) => (fx?.rate && v != null ? Math.round(v * fx.rate * 100) / 100 : null);
  for (const n of nights) for (const k of ['dorm', 'private']) if (n[k]) { n[k].brl = brl(n[k].price); if (n[k].refundable_price != null) n[k].refundable_brl = brl(n[k].refundable_price); }
  for (const n of nights) n.page = pageUrl({ id, name, city }, n.date, addDays(n.date, 1), currency);

  return { id, name: info.name || name || null, city: city || null, country: info.city?.country || null, currency, fx, from, to, nights, probes, page: pageUrl({ id, name, city }, from, to, currency), feed: feedUrl(id, from, currency) };
}

const money = (v, cur) => `${cur || ''} ${Number(v).toLocaleString('en-US', { maximumFractionDigits: v >= 1000 ? 0 : 2 })}`.trim();
const reais = (v) => (v == null ? '' : ` (R$ ${v.toFixed(2).replace('.', ',')})`);

/** Plain-text report. c: colour helpers (ui.js). */
export function formatHostelPrices(r, c = { bold: (s) => s, dim: (s) => s, yellow: (s) => s, red: (s) => s, green: (s) => s }) {
  const L = [];
  L.push(c.bold(`${r.name || `Hostelworld ${r.id}`}${r.city ? `, ${r.city}` : ''}`) + c.dim(` — Hostelworld ${r.id} · 1 guest · ${r.nights.length} night(s), check-in ${r.from}, check-out ${r.to}`));
  if (r.fx?.rate) L.push(c.dim(`prices in ${r.currency}; R$ at 1 ${r.currency} = R$ ${r.fx.rate} (${r.fx.date}, ${r.fx.source})`));
  else if (r.fx?.error) L.push(c.yellow(`▲ no exchange rate (${r.fx.error}): R$ not shown; ./atr fx ${r.currency} later`));
  const kind = (o, label, unit) => {
    if (!o) return `  ${label.padEnd(9)} ${c.dim('none on sale')}`;
    const alt = o.refundable_price != null ? c.dim(` (${money(o.refundable_price, o.currency)}${reais(o.refundable_brl)} ${o.refundable_plan ? o.refundable_plan.toLowerCase() : 'refundable'})`) : '';
    return `  ${label.padEnd(9)} ${c.bold(money(o.price, o.currency))}${reais(o.brl)}${unit}${o.sleeps && label === 'private' ? `, sleeps ${o.sleeps}` : ''} · ${o.room}${o.plan ? ` · ${o.plan.toLowerCase()}` : ''}${alt}`;
  };
  for (const n of r.nights) {
    L.push('');
    if (n.error) { L.push(`${c.bold(`${weekday(n.date)} ${n.date}`)}  ${c.red(`✖ ${n.error}`)}`); L.push(`  render the page instead: ./atr render "${n.page}" --wait 5`); continue; }
    const st = n.status === 'on sale' ? '' : `  ${c.yellow(n.status === 'sold out' ? 'SOLD OUT' : n.status === 'not on sale yet' ? 'NOT ON SALE YET' : 'NO BEDS ON SALE')}${c.dim(` (${n.status_note})`)}`;
    L.push(`${c.bold(`${weekday(n.date)} ${n.date}`)}${st}`);
    if (n.on_sale) {
      L.push(kind(n.dorm, 'dorm bed', ' per bed'));
      L.push(kind(n.private, 'private', ' per room'));
      if (n.free_cancellation_until) L.push(c.dim(`  free cancellation until ${n.free_cancellation_until.replace('T', ' ').replace(/:\d\d([+-]\d\d:\d\d)$/, ' ($1)')}`));
    }
    if (n.stay_rules) L.push(c.yellow(`  ▲ stay rules: ${JSON.stringify(n.stay_rules)}`));
    L.push(c.dim(`  page: ${n.page}`));
  }
  const ok = r.nights.filter((n) => n.dorm);
  if (r.nights.length > 1 && ok.length) {
    const lo = ok.reduce((a, b) => (b.dorm.price < a.dorm.price ? b : a)), hi = ok.reduce((a, b) => (b.dorm.price > a.dorm.price ? b : a));
    L.push('', `dorm bed: ${money(lo.dorm.price, lo.dorm.currency)}${reais(lo.dorm.brl)} (${lo.date}) to ${money(hi.dorm.price, hi.dorm.currency)}${reais(hi.dorm.brl)} (${hi.date}) a night`);
  }
  L.push('', c.dim('source for a page (opens in a browser; ./atr links accepts both):'), `  ${r.page}`, c.dim(`  feed: ${r.feed}`));
  L.push(c.dim('Prices are the cheapest per night for 1 guest, taxes as Hostelworld shows them; check the page before you book.'));
  return L.join('\n');
}
