// `atr sun`: sunrise, sunset and twilight computed locally (NOAA solar position equations, after Meeus), no network.
// Accurate to about a minute for the latitudes of this trip; refraction is the standard 34' and the Sun's radius 16'.
import { BBOX } from './geo.js';

export const TZ = { china: 'Asia/Shanghai', korea: 'Asia/Seoul', japan: 'Asia/Tokyo', 'hong-kong': 'Asia/Hong_Kong', thailand: 'Asia/Bangkok', singapore: 'Asia/Singapore' };

const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;

/** Solar declination (deg) and equation of time (min) at Julian century jc. */
function solar(jc) {
  const L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const C = Math.sin(rad(M)) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * jc) + Math.sin(rad(3 * M)) * 0.000289;
  const omega = 125.04 - 1934.136 * jc;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const eqTime = 4 * deg(y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) - 0.5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
  return { decl, eqTime };
}
const jcAt = (ms) => (ms / 86400000 + 2440587.5 - 2451545) / 36525;

/**
 * The instant (ms) the Sun's centre reaches `zenith` degrees on the local date `date` (YYYY-MM-DD), rising
 * (dir -1) or setting (dir +1), or null when it never does (polar day/night). Minutes are counted from 00:00 UTC of
 * that calendar date, so east-Asian sunrises fall at negative minutes (the previous UTC day), as they should.
 */
function eventUtc(date, lat, lng, zenith, dir) {
  const day0 = Date.parse(`${date}T00:00:00Z`);
  let t = day0 + (720 - 4 * lng) * 60000; // first guess: local solar noon
  for (let i = 0; i < 3; i++) {
    const { decl, eqTime } = solar(jcAt(t));
    const cosH = Math.cos(rad(zenith)) / (Math.cos(rad(lat)) * Math.cos(rad(decl))) - Math.tan(rad(lat)) * Math.tan(rad(decl));
    if (cosH < -1 || cosH > 1) return null;
    const H = deg(Math.acos(cosH));
    t = day0 + (720 - 4 * lng - eqTime + dir * 4 * H) * 60000;
  }
  return t;
}
function noonUtc(date, lng) {
  const day0 = Date.parse(`${date}T00:00:00Z`);
  let t = day0 + (720 - 4 * lng) * 60000;
  for (let i = 0; i < 2; i++) t = day0 + (720 - 4 * lng - solar(jcAt(t)).eqTime) * 60000;
  return t;
}

/** All times as ms UTC (or null). */
export function sunTimes(date, lat, lng) {
  return {
    dawn_astronomical: eventUtc(date, lat, lng, 108, -1),
    dawn_civil: eventUtc(date, lat, lng, 96, -1),
    sunrise: eventUtc(date, lat, lng, 90.833, -1),
    noon: noonUtc(date, lng),
    sunset: eventUtc(date, lat, lng, 90.833, 1),
    dusk_civil: eventUtc(date, lat, lng, 96, 1),
    dusk_nautical: eventUtc(date, lat, lng, 102, 1),
    dusk_astronomical: eventUtc(date, lat, lng, 108, 1),
  };
}

const roundMin = (ms) => (ms == null ? null : Math.round(ms / 60000) * 60000);
/** "17:52" in the zone, rounded to the nearest minute. */
export function hhmm(ms, tz) {
  if (ms == null) return null;
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(roundMin(ms)));
}

/** Country id for coordinates (Hong Kong before China), or null. */
export function countryAt(lat, lng) {
  for (const c of ['hong-kong', 'singapore', 'korea', 'japan', 'thailand', 'china']) { const b = BBOX[c]; if (lat >= b[0] && lat <= b[1] && lng >= b[2] && lng <= b[3]) return c; }
  return null;
}

/** Report for one place/date. where: { lat, lng, name?, country?, tz? } */
export function sunReport(where, date) {
  const tz = where.tz || TZ[where.country] || TZ[countryAt(where.lat, where.lng)] || 'UTC';
  const raw = sunTimes(date, where.lat, where.lng);
  const times = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v == null ? null : hhmm(roundMin(v), tz)]));
  const dayMin = raw.sunrise != null && raw.sunset != null ? Math.round((raw.sunset - raw.sunrise) / 60000) : null;
  return { name: where.name || `${where.lat}, ${where.lng}`, lat: where.lat, lng: where.lng, date, tz, times, day_length: dayMin == null ? null : `${Math.floor(dayMin / 60)} h ${String(dayMin % 60).padStart(2, '0')} min`, iso: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v == null ? null : new Date(roundMin(v)).toISOString()])) };
}

export function formatSun(r, c = { bold: (s) => s, dim: (s) => s }) {
  const t = r.times;
  const row = (label, v, note = '') => `  ${label.padEnd(14)} ${v ?? '—'}${note ? c.dim(`  ${note}`) : ''}`;
  return [
    `${c.bold(r.name)} ${c.dim(`— ${r.date} (${new Date(`${r.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}), times in ${r.tz}, at ${r.lat}, ${r.lng}`)}`,
    row('first light', t.dawn_civil, 'civil dawn: light enough to walk without a torch'),
    row('sunrise', t.sunrise),
    row('solar noon', t.noon),
    row('sunset', t.sunset),
    row('dusk', t.dusk_civil, 'civil dusk: last useful daylight; the sky stays blue a while'),
    row('dark', t.dusk_nautical, 'nautical dusk: night photos, city lights against a deep-blue sky'),
    r.day_length ? row('daylight', r.day_length) : '',
    c.dim('Computed here (NOAA solar equations, sea-level horizon, within about a minute); mountains or tall buildings hide the sun earlier.'),
  ].filter(Boolean).join('\n');
}
