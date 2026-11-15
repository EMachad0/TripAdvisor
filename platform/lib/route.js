// The route: the traveler's order of stops inside each country leg.
// Seed: `route:` per country in config/trip.yaml (owned by the orchestrator; optional).
// Edits: feedback/route.jsonl, written by the game (append-only; the latest line per country wins).
// See docs/FEEDBACK-FORMAT.md ("feedback/route.jsonl"). The game never writes the config.
import { check, t, joinPath } from './schema/dsl.js';
import { COUNTRIES } from './schema/enums.js';

export const MAX_STOPS = 30;
export const MAX_NIGHTS = 90;

/** One stop. `area` is an area id (areas/<country>/<id>.yaml); name/lat/lng are for a stop with no area file (e.g. Hong Kong). */
export const ROUTE_STOP_SPEC = t.object({
  area: t.slug({ desc: 'Area id (the area file name), or an id of your choice for a stop with no area file', example: 'shanghai' }),
  nights: t.opt(t.int({ min: 1, max: MAX_NIGHTS, desc: 'Nights at this stop; leave out while undecided' })),
  name: t.opt(t.string({ max: 80, desc: 'Display name; needed when there is no area file', example: 'Hong Kong' })),
  lat: t.opt(t.number({ min: -90, max: 90, desc: 'WGS84 latitude; needed when there is no area file', example: 22.2793 })),
  lng: t.opt(t.number({ min: -180, max: 180, desc: 'WGS84 longitude; needed when there is no area file', example: 114.1628 })),
});
export const ROUTE_STOPS_SPEC = t.array(ROUTE_STOP_SPEC, { max: MAX_STOPS });

const iso = (d) => String(d ?? '').slice(0, 10);
const dayNum = (d) => Date.parse(`${iso(d)}T00:00:00Z`) / 86400000;
/** Nights between two YYYY-MM-DD dates (Dec 6 → Jan 2 = 27). */
export const nightsBetween = (from, to) => { const n = Math.round(dayNum(to) - dayNum(from)); return Number.isFinite(n) && n > 0 ? n : 0; };
const titleCase = (s) => String(s).split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

/**
 * Validate and normalise `route:` on every country of a trip config, in place.
 * A missing `route:` is fine (it becomes []). Bad stops are dropped with a warning; a stop may be written as just its area id
 * (`- shanghai`). Duplicate areas keep the first. Returns the warnings ("config/trip.yaml countries[0] (china).route[1].nights: …").
 */
export function normalizeConfigRoutes(cfg, { file = 'config/trip.yaml' } = {}) {
  const warnings = [];
  (cfg?.countries || []).forEach((c, i) => {
    if (!c || typeof c !== 'object') return;
    const where = `${file} countries[${i}]${c.id ? ` (${c.id})` : ''}.route`;
    if (c.route === undefined || c.route === null) { c.route = []; return; }
    if (!Array.isArray(c.route)) { warnings.push(`${where}: expected a list of stops like "- { area: shanghai, nights: 4 }"; ignored`); c.route = []; return; }
    const out = [], seen = new Set();
    c.route.forEach((raw, j) => {
      const s = typeof raw === 'string' ? { area: raw } : raw;
      const issues = check(ROUTE_STOP_SPEC, s, []).filter((x) => x.level === 'error');
      if ((s?.lat === undefined) !== (s?.lng === undefined)) issues.push({ path: s?.lat === undefined ? 'lat' : 'lng', message: 'lat and lng go together' });
      if (issues.length) { warnings.push(`${where}[${j}]: ${issues.map((x) => `${x.path === '(root)' ? '' : `${x.path}: `}${x.message}`).join('; ')}; stop ignored`); return; }
      if (seen.has(s.area)) { warnings.push(`${where}[${j}]: ${s.area} is already on this route; the repeat is ignored`); return; }
      if (out.length >= MAX_STOPS) { warnings.push(`${where}: more than ${MAX_STOPS} stops; the rest are ignored`); return; }
      seen.add(s.area);
      out.push(clean(s));
    });
    c.route = out;
  });
  return warnings;
}

/** Keep only the stop fields, in a fixed order. */
export function clean(s) {
  const o = { area: s.area };
  if (Number.isInteger(s.nights)) o.nights = s.nights;
  if (typeof s.name === 'string' && s.name.trim()) o.name = s.name.trim();
  if (typeof s.lat === 'number' && typeof s.lng === 'number') { o.lat = s.lat; o.lng = s.lng; }
  return o;
}

/** Validate a stops list (the game's POST body). Returns error strings (empty = valid). */
export function stopsErrors(stops) {
  const errs = check(ROUTE_STOPS_SPEC, stops, []).filter((x) => x.level === 'error').map((x) => `stops${x.path === '(root)' ? '' : x.path.startsWith('[') ? x.path : `.${x.path}`}: ${x.message}`);
  if (Array.isArray(stops)) {
    const seen = new Set();
    stops.forEach((s, i) => { if (s?.area && seen.has(s.area)) errs.push(`stops${joinPath([i])}: ${s.area} is on the route twice`); if (s?.area) seen.add(s.area); });
  }
  return errs;
}

/** Latest route event per country: Map country → event (latest ts wins; equal ts keep file order). */
export function latestRoutes(events = []) {
  const m = new Map();
  const sorted = events.map((e, i) => [e, i]).sort((a, b) => String(a[0].ts).localeCompare(String(b[0].ts)) || a[1] - b[1]).map((x) => x[0]);
  for (const e of sorted) m.set(e.country, e);
  return m;
}

/**
 * The current route per country leg, in trip order.
 * cfg: trip config (normalised by loadTripConfig); areas: loaded area files; events: feedback route events.
 * Returns [{ id, name, flag, n, from, to, nights, source: 'game'|'config'|'none', ts, stops: [{ area, name, lat, lng, nights, hasPage, located }],
 *            planned, unset, status: 'empty'|'under'|'ok'|'over' }].
 */
export function currentRoute({ cfg, areas = [], events = [] } = {}) {
  const latest = latestRoutes(events);
  const areaOf = new Map(areas.map((a) => [`${a.country}/${a.id}`, a]));
  return (cfg?.countries || []).filter((c) => c && c.id).map((c, i) => {
    const ev = latest.get(c.id);
    const seed = Array.isArray(c.route) ? c.route : [];
    const raw = ev ? ev.stops : seed;
    // A config-only stop (no area file) keeps its name and coordinates even when the game saved it without them.
    const seedOf = new Map(seed.map((s) => [s.area, s]));
    const stops = raw.map((s) => {
      const a = areaOf.get(`${c.id}/${s.area}`);
      const sd = seedOf.get(s.area) || {};
      const lat = typeof a?.lat === 'number' ? a.lat : s.lat ?? sd.lat;
      const lng = typeof a?.lng === 'number' ? a.lng : s.lng ?? sd.lng;
      return { area: s.area, name: a?.name || s.name || sd.name || titleCase(s.area), lat: lat ?? null, lng: lng ?? null, nights: Number.isInteger(s.nights) ? s.nights : null, hasPage: !!a, located: typeof lat === 'number' && typeof lng === 'number' };
    });
    const nights = nightsBetween(c.from, c.to);
    const planned = stops.reduce((n, s) => n + (s.nights || 0), 0);
    return {
      id: c.id, name: COUNTRIES[c.id]?.name || titleCase(c.id), flag: COUNTRIES[c.id]?.flag || '', n: i + 1,
      from: iso(c.from), to: iso(c.to), nights,
      source: ev ? 'game' : seed.length ? 'config' : 'none', ts: ev?.ts || null,
      stops, planned, unset: stops.filter((s) => !s.nights).length,
      status: !planned ? 'empty' : planned > nights ? 'over' : planned < nights ? 'under' : 'ok',
    };
  });
}

const fmtDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Plain-text route for `./atr feedback`: one line per country. */
export function formatRoute(route, c = { dim: (s) => s, bold: (s) => s, yellow: (s) => s }) {
  const L = [];
  for (const r of route) {
    const slug = (n) => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const stops = r.stops.length ? r.stops.map((s) => `${s.name}${s.area !== slug(s.name) ? c.dim(` (${s.area})`) : ''} ${s.nights ? `${s.nights}n` : c.dim('?n')}`).join(' → ') : c.dim('no stops yet');
    const bal = r.status === 'over' ? c.yellow(`${r.planned - r.nights} night${r.planned - r.nights === 1 ? '' : 's'} over`) : r.status === 'ok' ? 'all nights placed' : r.planned ? `${r.planned} of ${r.nights} nights placed` : 'no nights set yet';
    L.push(`  ${c.bold(`${r.n}. ${r.name}`)} ${c.dim(`${fmtDay(r.from)} – ${fmtDay(r.to)}, ${r.nights} nights`)}: ${stops}`);
    L.push(c.dim(`     ${bal}${r.unset && r.stops.length ? ` · ${r.unset} stop${r.unset === 1 ? '' : 's'} without nights` : ''} · ${r.source === 'game' ? `edited in the game ${String(r.ts).slice(0, 16).replace('T', ' ')}` : r.source === 'config' ? 'from config/trip.yaml (not edited in the game yet)' : 'nothing planned'}`));
  }
  return L.join('\n');
}
