// `atr geo`: find WGS84 coordinates for a place name on OpenStreetMap (Nominatim) and Wikidata.
import fs from 'node:fs';
import path from 'node:path';
import { dataRoots } from './paths.js';
import { readCooldown, writeCooldown, retryAfterMs } from './net.js';

// Nominatim's usage policy asks for a User-Agent that identifies the application; this one names the tool
// generically and carries nothing about the project or its user.
const UA = { 'User-Agent': 'place-research-cli/1.0 (occasional geocoding lookups)', 'Accept-Language': 'en' };
const CC = { china: 'cn', korea: 'kr', japan: 'jp', 'hong-kong': 'hk', thailand: 'th', singapore: 'sg' };
export const BBOX = { // [minLat, maxLat, minLng, maxLng]
  china: [18, 54, 73, 135], korea: [33, 39, 124, 132], japan: [24, 46, 122, 146],
  'hong-kong': [22.1, 22.6, 113.8, 114.5], thailand: [5.5, 20.5, 97.3, 105.7],
  singapore: [1.15, 1.48, 103.6, 104.1],
};
const inBox = (c, lat, lng) => { const b = BBOX[c]; return !b || (lat >= b[0] && lat <= b[1] && lng >= b[2] && lng <= b[3]); };
const round = (n) => Math.round(Number(n) * 1e5) / 1e5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const osmLink = (lat, lng, zoom = 17) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;

const cacheFile = (opts) => opts.cacheFile || path.join(dataRoots(opts).cache, 'geo.json');
const readCache = (opts) => { try { return JSON.parse(fs.readFileSync(cacheFile(opts), 'utf8')); } catch { return {}; } };
function writeCache(opts, c) { fs.mkdirSync(path.dirname(cacheFile(opts)), { recursive: true }); fs.writeFileSync(cacheFile(opts), JSON.stringify(c, null, 1)); }

// At most one Nominatim request per second, across CLI invocations too.
async function throttle(opts) {
  if (opts.fetch) return; // injected fetch (tests): no pacing
  const f = path.join(dataRoots(opts).cache, 'nominatim-last-request');
  let last = 0;
  try { last = Number(fs.readFileSync(f, 'utf8')) || 0; } catch { /* first call */ }
  const wait = last + 1100 - Date.now();
  if (wait > 0) await sleep(Math.min(wait, 1100));
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, String(Date.now())); } catch { /* ignore */ }
}

async function nominatim(query, { country, fetch: f = fetch, limit = 5, ...opts }) {
  await throttle({ ...opts, fetch: opts.fetchInjected });
  const p = new URLSearchParams({ q: query, format: 'jsonv2', limit: String(limit), addressdetails: '1' });
  if (CC[country]) p.set('countrycodes', CC[country]);
  const res = await f(`https://nominatim.openstreetmap.org/search?${p}`, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`OpenStreetMap search answered HTTP ${res.status}`);
  return (await res.json()).map((r) => ({
    source: 'osm', name: r.name || String(r.display_name || '').split(',')[0], type: [r.category || r.class, r.type].filter(Boolean).join(' / '),
    address: r.display_name, lat: round(r.lat), lng: round(r.lon), link: osmLink(round(r.lat), round(r.lon)),
  }));
}

/** Thrown when a service rate-limits us: reported as a note, not an error, and other results still count. */
class RateLimited extends Error {}
// Wikidata answers 429 after a few lookups when several curators search at once: a shared cooldown skips it
// (OpenStreetMap results still come back) instead of hitting it again on every call.
const wdCooldownFile = (opts) => path.join(path.dirname(cacheFile(opts)), 'wikidata-cooldown.json');
const hhmm = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
async function wdGet(url, f, opts) {
  const cf = wdCooldownFile(opts);
  const st = readCooldown(cf);
  if ((st.notBefore || 0) > Date.now()) throw new RateLimited(`Wikidata skipped: it is rate-limiting this machine until ${hhmm(st.notBefore)} (OpenStreetMap results only)`);
  for (let i = 0; ; i++) {
    const res = await f(url, { headers: UA, signal: AbortSignal.timeout(15000) });
    if (res.status !== 429) { if (st.strikes) writeCooldown(cf, { notBefore: 0, strikes: 0 }); return res; }
    const ra = retryAfterMs(res.headers?.get?.('retry-after'));
    if (i === 0 && ra != null && ra <= 5000) { await sleep(ra || 1000); continue; }
    const strikes = (readCooldown(cf).strikes || 0) + 1;
    const wait = Math.max(ra ?? 0, Math.min(15 * 60_000, 60_000 * 2 ** (strikes - 1)));
    writeCooldown(cf, { notBefore: Date.now() + wait, strikes });
    throw new RateLimited(`Wikidata answered HTTP 429 (rate limit); skipping it until ${hhmm(Date.now() + wait)} (OpenStreetMap results still shown)`);
  }
}

// Japanese street addresses (番地 level): the GSI (Geospatial Information Authority of Japan) address search.
const JP_ADDRESS = /[都道府県市区町村]\S*\d|丁目|番地|[0-9０-９]+[-－ー][0-9０-９]+/;
export const looksLikeJapaneseAddress = (q, country) => /[一-鿿぀-ヿ]/.test(q) && (country === 'japan' || /[都道府県]/.test(q)) && JP_ADDRESS.test(q);
async function gsi(query, { fetch: f = fetch, limit = 5 }) {
  const res = await f(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query)}`, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`GSI address search answered HTTP ${res.status}`);
  return ((await res.json()) || []).slice(0, limit).map((r) => {
    const [lng, lat] = r.geometry?.coordinates || [];
    return { source: 'gsi', name: r.properties?.title || query, type: 'Japanese address (GSI, block level)', address: r.properties?.title || query, lat: round(lat), lng: round(lng), link: osmLink(round(lat), round(lng)) };
  }).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
}

async function wikidata(query, { country, fetch: f = fetch, limit = 5, ...opts }) {
  const lang = /[぀-ヿ]/.test(query) ? 'ja' : /[가-힯]/.test(query) ? 'ko' : /[฀-๿]/.test(query) ? 'th' : /[一-鿿]/.test(query) ? 'zh' : 'en';
  const s = new URLSearchParams({ action: 'wbsearchentities', search: query, language: lang, uselang: 'en', format: 'json', limit: String(limit + 3), origin: '*' });
  const res = await wdGet(`https://www.wikidata.org/w/api.php?${s}`, f, opts);
  if (!res.ok) throw new Error(`Wikidata answered HTTP ${res.status}`);
  const hits = (await res.json()).search || [];
  if (!hits.length) return [];
  const e = new URLSearchParams({ action: 'wbgetentities', ids: hits.map((h) => h.id).join('|'), props: 'claims|labels|descriptions', languages: 'en', format: 'json', origin: '*' });
  const res2 = await wdGet(`https://www.wikidata.org/w/api.php?${e}`, f, opts);
  if (!res2.ok) throw new Error(`Wikidata answered HTTP ${res2.status}`);
  const ents = (await res2.json()).entities || {};
  const out = [];
  for (const h of hits) {
    const v = ents[h.id]?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    if (!v || !inBox(country, v.latitude, v.longitude)) continue;
    out.push({ source: 'wikidata', name: ents[h.id]?.labels?.en?.value || h.label || h.id, type: ents[h.id]?.descriptions?.en?.value || h.description || 'Wikidata item', address: `https://www.wikidata.org/wiki/${h.id}`, lat: round(v.latitude), lng: round(v.longitude), link: osmLink(round(v.latitude), round(v.longitude)) });
  }
  return out;
}

/**
 * Search for coordinates. opts: { country, limit = 5, fetch, cacheFile, fresh, offline }
 * Returns { query, country, offline?, cached?, candidates: [{ source, name, type, address, lat, lng, link }], errors: [text] }.
 * Candidates are WGS84. OpenStreetMap results first, then Wikidata ones that are not within ~150 m of an OSM result.
 */
export async function geoSearch(query, opts = {}) {
  const offline = opts.offline ?? (process.env.ATR_OFFLINE === '1');
  const key = `${opts.country || ''}|${query}`;
  const cache = readCache(opts);
  if (!opts.fresh && cache[key]) return { ...cache[key], cached: true };
  if (offline) return { query, country: opts.country, offline: true, candidates: [], errors: [] };
  const limit = opts.limit ?? 5;
  const errors = [], notes = [];
  const run = async (fn, what) => { try { return await fn(query, { ...opts, fetchInjected: opts.fetch, limit }); } catch (e) { if (e instanceof RateLimited) notes.push(e.message); else errors.push(`${what}: ${e.cause?.code || e.message}`); return []; } };
  const jp = looksLikeJapaneseAddress(query, opts.country) ? await run(gsi, 'GSI address search') : [];
  const osm = await run(nominatim, 'OpenStreetMap');
  const wd = await run(wikidata, 'Wikidata');
  const near = (a, b) => Math.abs(a.lat - b.lat) < 0.0015 && Math.abs(a.lng - b.lng) < 0.0015;
  const merged = [];
  for (const x of [...jp, ...osm, ...wd]) if (!merged.some((m) => m.source !== x.source && near(m, x))) merged.push(x);
  const candidates = merged.slice(0, limit);
  const result = { query, country: opts.country, candidates, errors, ...(notes.length ? { notes } : {}) };
  if (!errors.length && !notes.length) { cache[key] = result; writeCache(opts, cache); }
  return result;
}

export function formatGeo(r, c = { dim: (s) => s, bold: (s) => s, yellow: (s) => s }) {
  if (r.offline) return `${c.yellow('▲')} ATR_OFFLINE=1: can't search for coordinates offline.`;
  const L = [];
  if (!r.candidates.length) L.push(`0 results for "${r.query}"${r.country ? ` in ${r.country}` : ''}. Try the local-script name, the name of the building, mall or street it is in, or a nearby station; then set location.approximate: true.`);
  r.candidates.forEach((x, i) => L.push(`${c.bold(String(i + 1) + '.')} ${c.bold(x.name)} ${c.dim(`(${x.source === 'osm' ? 'OpenStreetMap' : x.source === 'gsi' ? 'GSI Japan' : 'Wikidata'}: ${x.type})`)}\n   lat: ${x.lat}\n   lng: ${x.lng}\n   ${c.dim(x.address)}\n   ${x.link}`));
  for (const e of r.errors) L.push(c.yellow(`▲ ${e}`));
  for (const n of r.notes || []) L.push(c.dim(`ℹ ${n}`));
  if (r.candidates.length) L.push(c.dim('WGS84 coordinates. Open the link to check the pin; if it is only the block or the complex, set location.approximate: true.'));
  return L.join('\n');
}
