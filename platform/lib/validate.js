// Validation: schema checks + cross-checks, with fix-it messages.
import fs from 'node:fs';
import path from 'node:path';
import { check, joinPath, specAt, describe, exampleOf } from './schema/dsl.js';
import { placeSpec, areaSpec, creditsSpec } from './schema/specs.js';
import { BLOCK_TYPES, AREA_BLOCK_TYPES } from './schema/blocks.js';
import { COUNTRIES } from './schema/enums.js';
import { readYaml } from './yamlio.js';
import { findPlaceFiles, findAreaFiles, loadCredits, mediaFiles } from './load.js';
import { dataRoots, localDate } from './paths.js';
import { gallerySlots } from './render/layout.js';
import { fmtBRL } from './render/util.js';
import { bookingLevel, bookingLinks, isTel, knownPlatform } from './booking.js';
import { isStay } from './kinds.js';
import { readTaste, mustDoKeys, mustDoIssue } from './taste.js';
import { eventDates, eventDays, tripOverlapInfo, looksDated, rangeLabel, singleDay, whenKind, weeklyDays } from './when.js';
import { loadTripConfig } from './config.js';

const AUTO_FACT_LABELS = ['when', 'dates', 'cost', 'meal cost', 'cheapest bed', 'per night', 'price per night', 'price', 'time needed', 'time', 'duration', 'best time', 'book ahead', 'booking', 'reservations', 'getting there', 'transit', 'metro', 'hours', 'opening hours'];

const BBOX = { // [minLat, maxLat, minLng, maxLng]
  china: [18, 54, 73, 135], korea: [33, 39, 124, 132], japan: [24, 46, 122, 146],
  'hong-kong': [22.1, 22.6, 113.8, 114.5], thailand: [5.5, 20.5, 97.3, 105.7],
  singapore: [1.15, 1.48, 103.6, 104.1],
};

const today = (now) => (now ? String(now).slice(0, 10) : localDate());
// Dates up to 1 day ahead are tolerated (time zones).
const isFuture = (d, now) => d > new Date(Date.parse(now + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

function issue(level, pathArr, message, expected, example, hint) {
  return { level, path: joinPath(pathArr), pathArr, message, expected, example, hint };
}

/** `when` cross-checks shared by places and areas: range order, and overlap with the days in that country. */
function whenIssues(data, ctx, issues) {
  const w = data.when;
  if (!w || typeof w !== 'object') return;
  (Array.isArray(w.dates) ? w.dates : []).forEach((r, i) => {
    if (r && typeof r === 'object' && r.from && (r.to === undefined || r.to === null)) issues.push(issue('info', ['when', 'dates', i], `no \`to\`: shown as open-ended ("From ${String(r.from).slice(0, 10)}"), for an opening date whose end is not announced`, 'to: equal to from for a one-day event', undefined, 'a one-day event needs `to` equal to `from`'));
    if (typeof r?.from === 'string' && typeof r?.to === 'string' && r.from > r.to) issues.push(issue('error', ['when', 'dates', i], `from ${r.from} is after to ${r.to}`, 'from ≤ to (a one-day event has from = to)', { from: r.to, to: r.from }));
  });
  if (weeklyDays(data).length && eventDates(data).length && !eventDays(data).length) issues.push(issue('error', ['when', 'weekly'], `no ${weeklyDays(data).join('/')} falls inside the date ranges`, 'ranges that contain at least one of those weekdays', undefined));
  if (!ctx.trip) return;
  const o = tripOverlapInfo(data, ctx.trip);
  if (!o.window || o.state === 'full' || o.state === 'always') return;
  const win = rangeLabel(o.window), ev = eventDays(data).slice(0, 6).map(rangeLabel).join(', ');
  if (whenKind(data) === 'best') { // the place is there all the time: only the angle of the page is off the route
    issues.push(issue('info', ['when', 'dates'], o.state === 'none' ? `its best dates (${ev}) are outside the days in ${COUNTRIES[data.country]?.name || data.country} (${win}); the page shows "Best dates not on your route"` : `only part of its best dates falls inside the days in ${COUNTRIES[data.country]?.name || data.country} (${win}): usable ${o.usable.map(rangeLabel).join(', ')}`, undefined, undefined, 'say on the page what the place is like on the days the traveler is there'));
    return;
  }
  const year = `${o.window.from.slice(0, 4)}${o.window.to.slice(0, 4) !== o.window.from.slice(0, 4) ? `–${o.window.to.slice(2, 4)}` : ''}`;
  if (o.state === 'none') issues.push(issue('warning', ['when', 'dates'], `the traveler is in ${COUNTRIES[data.country]?.name || data.country} on ${win} ${year}, but this happens on ${ev}: they cannot go without changing the route`, 'dates inside the days in that country (check the year: the trip is Dec 2026 – Jan 2027)', undefined, 'keep it only if the page says clearly that the route would have to change; otherwise drop it'));
  else issues.push(issue('info', ['when', 'dates'], `only part of ${ev} falls inside the days in ${COUNTRIES[data.country]?.name || data.country} (${win}): usable ${o.usable.map(rangeLabel).join(', ')}`, undefined, undefined, 'say on the page which days work for this trip'));
}

/** Hero title and name line hints (info only): long words, and local + romanized names that wrap. */
function nameHints(data, issues) {
  const longWord = typeof data.name === 'string' ? data.name.split(/\s+/).find((w) => w.length > 12) : null;
  if (longWord) issues.push(issue('info', ['name'], `"${longWord}" is ${longWord.length} letters in one word; the phone hero shrinks the title to fit it, so the whole name looks small`, 'words of ≤ 12 letters in `name` (keep the long form in name_romanized)', undefined, 'e.g. name "Gyeongbok Palace" with name_romanized "Gyeongbokgung"'));
  const cjk = (s) => (String(s || '').match(/[　-鿿가-힯฀-๿]/g) || []).length;
  if (typeof data.name_local === 'string' && cjk(data.name_local) > 16) issues.push(issue('info', ['name_local'], `name_local has ${cjk(data.name_local)} local-script characters; above ~16 it wraps onto a second line in the phone hero`, 'the short local name a sign or a taxi driver uses (≤ 16 characters)', undefined, 'the full official name can go in location.address_local or the prose'));
  if (typeof data.name_romanized === 'string' && data.name_romanized.length > 36) issues.push(issue('info', ['name_romanized'], `name_romanized is ${data.name_romanized.length} characters; above ~36 it wraps in the phone hero`, 'one short romanized name (≤ 36 characters)', undefined, 'drop the generic part ("… Scenic Area", "… Street")'));
}

/** Placeholder text left from the scaffold. */
export function todoIssues(data, pathArr = [], out = []) {
  if (typeof data === 'string') {
    if (/\bTODO\b/.test(data)) out.push(issue('error', pathArr, `placeholder "${data.length > 50 ? data.slice(0, 47) + '...' : data}" not filled in`, 'real researched content (or delete the line if the field is optional)', undefined, 'every TODO from the scaffold must be replaced'));
  } else if (Array.isArray(data)) data.forEach((v, i) => todoIssues(v, [...pathArr, i], out));
  else if (data && typeof data === 'object') for (const [k, v] of Object.entries(data)) todoIssues(v, [...pathArr, k], out);
  return out;
}

function splitValue(v) {
  const m = v.match(/^(.{3,28}?)[.,;—(:]\s*(.+)$/);
  if (m) return { value: m[1].trim(), detail: m[2].replace(/\)$/, '').trim().slice(0, 80) };
  const cut = v.slice(0, 29).lastIndexOf(' ');
  return { value: v.slice(0, cut > 8 ? cut : 28).trim(), detail: v.slice(cut > 8 ? cut : 28).trim().slice(0, 80) };
}
const isPortrait = (c) => c?.width && c?.height && c.height > c.width * 1.05;
/** Width actually served: the largest processed variant (falls back to credit widths). */
function served(c, files) {
  const v = mediaVariants(c.file, files || []);
  return v.length ? v.at(-1) : (c.widths?.length ? Math.max(...c.widths) : c.width);
}

/** Media names a place references (hero, gallery, cover). */
export function referencedMedia(data) {
  const s = new Set();
  if (data?.cover) s.add(data.cover);
  if (typeof data?.image === 'string') s.add(data.image); // area cards
  for (const b of Array.isArray(data?.blocks) ? data.blocks : []) {
    if (b?.type === 'hero' && b.image) s.add(b.image);
    if (b?.type === 'gallery') for (const im of b.images || []) if (im?.file) s.add(im.file);
  }
  return s;
}

export function mediaVariants(name, files) {
  const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)\\.webp$`);
  return files.map((f) => f.match(re)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);
}

// Add TODO issues, dropping schema errors on the same path (the TODO message is clearer).
function dedupeTodo(issues, todos, spec, data) {
  for (const t of todos) {
    const sub = specAt(spec, t.pathArr, data);
    if (sub) { t.expected = `${describe(sub)}${sub.desc ? ` — ${sub.desc}` : ''}${sub.optional ? ' (optional: delete the line if unknown)' : ''}`; t.example = exampleOf(sub); }
  }
  const paths = new Set(todos.map((t) => t.path));
  for (let i = issues.length - 1; i >= 0; i--) if (paths.has(issues[i].path)) issues.splice(i, 1);
  issues.push(...todos);
}

function checkMoney(issues, pathArr, local, brl, rate, label) {
  if (typeof local !== 'number' || typeof brl !== 'number' || typeof rate !== 'number' || local === 0) return;
  const expected = local * rate;
  if (Math.abs(brl - expected) > Math.max(0.05 * expected, 0.5)) {
    issues.push(issue('warning', pathArr, `${label} R$ ${brl} does not match local ${local} × fx.rate ${rate} = R$ ${expected.toFixed(2)} (more than 5% off)`,
      'R$ amount = local amount × fx.rate', Math.round(expected * 100) / 100, 'fix the R$ value or the fx rate'));
  }
}

function checkImageRef(issues, pathArr, name, credits, files, where) {
  if (!name) return;
  const credit = credits.find((c) => c.file === name);
  const variants = mediaVariants(name, files);
  if (!credit) {
    issues.push(issue('error', pathArr, `image "${name}" has no entry in ${where}/credits.yaml`,
      'an image fetched with `./atr media fetch` (records credits automatically) or added with `./atr media add`',
      credits[0]?.file || 'main-hall-at-dusk', `run \`./atr media list <place>\` to see available images${credits.length ? ` (available: ${credits.map((c) => c.file).join(', ')})` : ''}`));
  } else if (!variants.length) {
    issues.push(issue('error', pathArr, `image "${name}" is in credits.yaml but no ${name}-<width>.webp file exists in ${where}/`,
      'processed WebP files next to credits.yaml', `${name}-1280.webp`, 're-run `./atr media fetch` for this image'));
  }
}

/**
 * Pure place validation (no fs): schema + cross-checks.
 * ctx: { credits, mediaFiles, knownIds:Set, folder:{country,city,slug}, now, fixtureMode,
 *        mustDoKeys?: string[] | null (keys of config/taste.yaml; null = no taste file; undefined = don't check),
 *        mustDoTypes?: { key: 'place' | 'area' | 'stay' }, trip?: trip config (for `when` vs the days in the country) }
 */
export function validatePlace(data, ctx = {}) {
  const issues = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    issues.push(issue('error', [], 'file is empty or not a YAML mapping', 'a YAML object starting with `id:`', 'id: yu-garden'));
    return issues;
  }
  check(placeSpec, data, [], issues);
  dedupeTodo(issues, todoIssues(data), placeSpec, data);
  const now = today(ctx.now);
  const credits = Array.isArray(ctx.credits) ? ctx.credits : [];
  const files = ctx.mediaFiles || [];

  // Folder consistency
  const f = ctx.folder;
  if (f) {
    if (data.id && f.slug && data.id !== f.slug) issues.push(issue('error', ['id'], `id "${data.id}" does not match its folder name "${f.slug}"`, 'id equal to the folder name', f.slug, 'rename the folder or change the id'));
    if (data.city && f.city && data.city !== f.city) issues.push(issue('error', ['city'], `city "${data.city}" does not match the folder "${f.city}"`, 'places/<country>/<city>/<id>/place.yaml', f.city));
    if (data.country && f.country && data.country !== f.country) issues.push(issue('error', ['country'], `country "${data.country}" does not match the folder "${f.country}"`, 'places/<country>/<city>/<id>/place.yaml', f.country));
  }
  if (data.fixture && !ctx.fixtureMode) issues.push(issue('error', ['fixture'], '`fixture: true` is only for platform test fixtures; this place would be hidden from the real site', 'remove the `fixture` line', undefined));

  // Must-do claim + stay consistency
  if (ctx.mustDoKeys !== undefined) { const m = mustDoIssue(data.must_do, ctx.mustDoKeys); if (m) issues.push(m); }
  const stay = isStay(data);
  if (stay && data.fame) issues.push(issue('info', ['fame'], 'stays need no `fame` and never show a fame chip', 'delete the line (fame is for attractions: has the traveler heard of the sight?)', undefined));
  const mdType = ctx.mustDoTypes?.[data.must_do];
  if (mdType === 'area') issues.push(issue('warning', ['must_do'], `"${data.must_do}" is a must-do for an area card; a place does not cover it`, 'must_do on the area card (areas/<country>/<id>.yaml), or remove it here', undefined));
  if (mdType === 'stay' && !stay) issues.push(issue('warning', ['must_do'], `"${data.must_do}" is a must-do for a stay card; this place is not a stay`, 'must_do on a place with category stay + kind Stay', undefined));
  whenIssues(data, ctx, issues);
  // Long text in the hero: it wraps, but short reads better (info only)
  if (typeof data.area === 'string' && data.area.length > 28) issues.push(issue('info', ['area'], `area is ${data.area.length} characters; the hero chip wraps to two lines on a phone above ~28`, 'a short neighbourhood name (≤ 28 characters)', undefined, 'shorten it; details belong in location.address or the map note'));
  if (typeof data.name === 'string' && data.name.length > 40) issues.push(issue('info', ['name'], `name is ${data.name.length} characters; the title takes four or more lines on a phone above ~40`, 'a shorter name, or the long one plus `short_name`', undefined, 'shorten, or set `short_name` (used in headings and small cards)'));
  nameHints(data, issues);
  if (data.must_do_note && !data.must_do) issues.push(issue('warning', ['must_do_note'], 'must_do_note without must_do: nothing shows it', 'must_do: <key> on the same page, or delete the note', undefined));
  const dated = looksDated(data);
  if (dated && !stay) issues.push(issue('info', ['when'], `this looks date-bound (${dated}) but has no \`when\``, 'a `when` block with the real dates, so the game can show "31 Dec only" and check them against the trip', { dates: [{ from: '2026-12-31', to: '2026-12-31' }] }, 'not date-bound after all? ignore this'));
  if (data.category === 'stay' && data.kind && data.kind !== 'Stay') issues.push(issue('error', ['kind'], `category is stay but kind is "${data.kind}"`, 'kind: Stay for a place to sleep (or another category if this is an attraction)', 'Stay'));
  if (data.kind === 'Stay' && data.category && data.category !== 'stay') issues.push(issue('error', ['category'], `kind is Stay but category is "${data.category}"`, 'category: stay for a place to sleep (or another kind if this is an attraction)', 'stay'));

  // Money
  const rate = data.fx?.rate;
  const country = COUNTRIES[data.country];
  if (data.cost) {
    checkMoney(issues, ['cost', 'brl'], data.cost.local, data.cost.brl, rate, 'cost');
    if (country && data.cost.currency && data.cost.currency !== country.currency && data.cost.currency !== 'BRL') {
      issues.push(issue('warning', ['cost', 'currency'], `currency ${data.cost.currency} is unusual for ${country.name} (expected ${country.currency})`, `the local currency of ${country.name}`, country.currency));
    }
  }
  if (data.fx?.date) {
    if (isFuture(data.fx.date, now)) issues.push(issue('error', ['fx', 'date'], `fx date ${data.fx.date} is in the future`, 'the date the rate was published', now));
    else if (daysBetween(data.fx.date, now) > 60) issues.push(issue('warning', ['fx', 'date'], `fx rate is ${daysBetween(data.fx.date, now)} days old`, 'a rate from the last 60 days', now, 'run `./atr fx <CUR>` and update fx + R$ amounts'));
  }

  // Book-ahead
  const ba = data.book_ahead;
  const level = bookingLevel(ba);
  if (level !== 'none') {
    const req = `book_ahead.required is ${level === 'required' ? 'true' : '"recommended"'}`;
    if (ba.method === undefined) issues.push(issue('error', ['book_ahead', 'method'], `${req} but \`method\` is missing`, 'how to book', 'passport-registered'));
    if (ba.lead_days === undefined && !ba.deadline) issues.push(issue('error', ['book_ahead', 'lead_days'], `${req} but \`lead_days\` is missing — the game sorts the book-ahead list by it`, 'days before the visit to book (or a fixed `deadline` date)', level === 'required' ? 7 : 1));
    if (ba.method && !['walk-in'].includes(ba.method) && !bookingLinks(ba).length) issues.push(issue('warning', ['book_ahead', 'links'], 'booking is required but there is no `link` or `links`', 'booking channels, best first', [{ label: 'Trip.com (foreigner-friendly)', url: 'https://www.trip.com/things-to-do/detail/12345/' }, { label: 'Official site', url: 'https://www.example.gov.cn/tickets' }]));
    if (ba.link && ba.links?.length) issues.push(issue('warning', ['book_ahead', 'link'], 'both `link` and `links` are set; only `links` is shown', 'just `links` (put the main channel first)', undefined));
    if (level === 'required' && ba.method === 'walk-in') issues.push(issue('warning', ['book_ahead', 'method'], 'required: true with method walk-in is contradictory', 'required: false for walk-ins, or the real booking method', 'website'));
  }
  if (typeof ba?.deadline === 'string' && ba.deadline < now) issues.push(issue('warning', ['book_ahead', 'deadline'], `the booking deadline ${ba.deadline} has passed`, 'a deadline still ahead, or remove it (and say on the page that the window closed)', undefined, 'check whether a new window or a later sale opened'));
  (Array.isArray(ba?.links) ? ba.links : []).forEach((l, i) => {
    if (isTel(l?.url) && ba.method !== 'phone') issues.push(issue('warning', ['book_ahead', 'links', i, 'url'], `a tel: link but method is ${ba.method ? `"${ba.method}"` : 'not set'}`, 'method: phone when a phone number is the way to book', 'phone'));
  });
  if (ba?.method === 'website' && knownPlatform(ba)) issues.push(issue('info', ['book_ahead', 'method'], `method website is shown as "Official website", but the first booking link is ${knownPlatform(ba)}`, 'method: platform for a booking site (labelled "Book on <site>")', 'platform'));
  if (ba?.rules_changed?.date && isFuture(ba.rules_changed.date, now)) issues.push(issue('warning', ['book_ahead', 'rules_changed', 'date'], `rules_changed date ${ba.rules_changed.date} is in the future`, 'the date the change took effect (announced future changes: say so in the note)', now));
  if (ba?.link && /^https?:\/\/(www\.)?[^/]+\/?$/.test(ba.link)) issues.push(issue('warning', ['book_ahead', 'link'], `link ${ba.link} is a homepage, not the booking page`, 'the exact booking/product page (use `links` for several channels)', 'https://www.trip.com/things-to-do/detail/12345/'));
  if (ba?.passport && data.country === 'china' && ba.method && ba.method !== 'passport-registered') {
    issues.push(issue('warning', ['book_ahead', 'method'], 'passport: true in China usually means real-name booking', 'method passport-registered', 'passport-registered'));
  }
  if (level === 'required' && !(data.blocks || []).some((b) => b?.type === 'book_ahead')) {
    issues.push(issue('warning', ['blocks'], 'booking is required but the page has no book_ahead timeline block', 'a `type: book_ahead` block', { type: 'book_ahead', steps: [{ days_before: ba.lead_days ?? 7, text: 'Book on the official site.' }] }));
  }

  // Hours
  if (data.hours && !data.hours.winter) issues.push(issue('warning', ['hours', 'winter'], 'no Dec–Jan notes (winter hours, Christmas/New Year closures, festivals)', 'what changes in Dec–Jan, or "No seasonal changes found (checked <source>)"', 'Winter hours 09:00–16:00 from Nov 1; open Jan 1.'));

  // Sources
  (Array.isArray(data.sources) ? data.sources : []).forEach((s, i) => {
    if (s?.checked && typeof s.checked === 'string' && isFuture(s.checked, now)) issues.push(issue('error', ['sources', i, 'checked'], `checked date ${s.checked} is in the future`, 'the date you actually read the page (today or earlier)', now));
  });
  const urls = (data.sources || []).map((s) => s?.url).filter(Boolean);
  const dup = urls.filter((u, i) => urls.indexOf(u) !== i);
  if (dup.length) issues.push(issue('warning', ['sources'], `duplicate source URL(s): ${[...new Set(dup)].join(', ')}`, 'at least 2 different sources', undefined));
  if (data.last_updated && isFuture(data.last_updated, now)) issues.push(issue('error', ['last_updated'], `last_updated ${data.last_updated} is in the future`, 'today or earlier', now));

  // Location
  const loc = data.location;
  const box = BBOX[data.country];
  if (loc && box && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
    if (loc.lat < box[0] || loc.lat > box[1] || loc.lng < box[2] || loc.lng > box[3]) {
      issues.push(issue('error', ['location'], `lat/lng ${loc.lat}, ${loc.lng} is outside ${country?.name}${loc.lat > 60 || loc.lng < 60 ? ' (lat and lng swapped?)' : ''}`, `coordinates inside ${country?.name}`, { lat: (box[0] + box[1]) / 2, lng: (box[2] + box[3]) / 2 }));
    }
  }
  if (loc && !loc.address_local && !['hong-kong', 'singapore'].includes(data.country)) issues.push(issue('warning', ['location', 'address_local'], 'no local-script address; taxi drivers often cannot read romanised addresses', 'the address in local script', '上海市黄浦区安仁街218号'));

  // Blocks
  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  const types = blocks.map((b) => b?.type);
  if (blocks.length && types[0] !== 'hero') issues.push(issue('warning', ['blocks', 0], 'the first block is not a hero; pages look best opening with a big photo', 'a hero block first', { type: 'hero', image: 'main-photo', hook: 'One evocative line.' }));
  if (types.filter((t) => t === 'hero').length > 1) issues.push(issue('error', ['blocks'], 'more than one hero block', 'exactly one hero', undefined));
  for (const want of ['highlights', 'map']) {
    if (blocks.length && !types.includes(want)) issues.push(issue('warning', ['blocks'], `no ${want} block — polished pages have one`, `a \`type: ${want}\` block (see \`./atr blocks ${want}\`)`, undefined));
  }
  const where = ctx.mediaWhere || 'media';
  if (data.cover) checkImageRef(issues, ['cover'], data.cover, credits, files, where);
  blocks.forEach((b, i) => {
    if (!b || typeof b !== 'object') return;
    if (b.type === 'hero') {
      checkImageRef(issues, ['blocks', i, 'image'], b.image, credits, files, where);
      const c = credits.find((x) => x.file === b.image);
      if (c) {
        const w = served(c, files);
        if (isPortrait(c)) issues.push(issue('warning', ['blocks', i, 'image'], `hero "${b.image}" is portrait (${c.width}×${c.height}); the hero is a wide landscape crop and will cut most of it`, 'a landscape photo (wider than tall), or set `focus:` to keep the key part', 'focus: top'));
        else if (w && w < 1600) issues.push(issue('warning', ['blocks', i, 'image'], `hero "${b.image}" is only ${w} px wide; it is shown full-screen and will look soft`, 'a photo ≥ 1600 px wide (≥ 2000 ideal)', undefined, 'search for a larger version, or move this photo to the gallery'));
      }
    }
    if (b.type === 'quick_facts' && !stay) {
      if (b.time_needed === undefined || b.time_needed === null) issues.push(issue('error', ['blocks', i, 'time_needed'], 'missing required field `time_needed`', 'how long a visit takes (text, at most 40 characters)', '2–3 h'));
      if (b.best_time === undefined || b.best_time === null) issues.push(issue('error', ['blocks', i, 'best_time'], 'missing required field `best_time`', 'best time of day / week (text, at most 60 characters)', 'Weekday, right at opening'));
    }
    if (b.type === 'stay') {
      const beds = Array.isArray(b.beds) ? b.beds : [];
      beds.forEach((bed, j) => checkMoney(issues, ['blocks', i, 'beds', j, 'brl'], bed?.local, bed?.brl, rate, 'bed price'));
      const nums = beds.map((x) => x?.local).filter((x) => typeof x === 'number');
      if (nums.length && nums[0] > Math.min(...nums)) issues.push(issue('warning', ['blocks', i, 'beds'], `beds are not cheapest first (beds[0] is ${nums[0]}, the cheapest is ${Math.min(...nums)})`, 'bed types sorted by price, cheapest first', undefined));
      if (nums.length && typeof data.cost?.local === 'number' && Math.abs(nums[0] - data.cost.local) > 0.005) issues.push(issue('warning', ['blocks', i, 'beds', 0, 'local'], `beds[0] costs ${nums[0]} but cost.local is ${data.cost.local}; \`cost\` is one night in the cheapest bed`, 'cost.local equal to beds[0].local (and cost.brl to beds[0].brl)', data.cost.local));
      const r = b.rating;
      if (r && typeof r.score === 'number' && typeof r.out_of === 'number' && r.score > r.out_of) issues.push(issue('error', ['blocks', i, 'rating', 'score'], `score ${r.score} is higher than out_of ${r.out_of}`, 'score ≤ out_of', { score: 9.1, out_of: 10 }));
      if (r?.checked && typeof r.checked === 'string' && isFuture(r.checked, now)) issues.push(issue('error', ['blocks', i, 'rating', 'checked'], `checked date ${r.checked} is in the future`, 'the date you read the score (today or earlier)', now));
      if (!stay) issues.push(issue('warning', ['blocks', i, 'type'], 'a stay block on a place that is not a stay', 'category: stay + kind: Stay for places to sleep; remove the block otherwise', undefined));
      if (!(b.social || []).length && b.style === 'hostel') issues.push(issue('warning', ['blocks', i, 'social'], 'hostel without `social` items; the traveler picks hostels to meet people', 'what makes it easy to meet people (bar, common room, events), or say honestly that it is quiet', ['Rooftop bar until 02:00', 'Free walking tour every morning']));
    }
    if (b.type === 'quick_facts') (b.extra || []).forEach((e, j) => {
      if (e?.label && AUTO_FACT_LABELS.includes(String(e.label).trim().toLowerCase())) issues.push(issue('warning', ['blocks', i, 'extra', j, 'label'], `"${e.label}" duplicates an automatic quick fact (cost, time needed, best time, booking, getting there and hours are filled in for you)`, 'a fact the page does not already show', { label: 'Good in rain', value: 'Yes' }));
      if (typeof e?.value === 'string' && e.value.length > 28) issues.push(issue('warning', ['blocks', i, 'extra', j, 'value'], `value is ${e.value.length} characters; long values wrap into several lines`, 'a short value (≤ 28 chars) plus an optional `detail` line', splitValue(e.value)));
    });
    if (b.type === 'gallery' && Array.isArray(b.images)) {
      const portraits = b.images.map((im) => isPortrait(credits.find((x) => x.file === im?.file)));
      const slots = gallerySlots(b.images.length, { feature: b.feature !== false, portraits });
      b.images.forEach((im, j) => {
        checkImageRef(issues, ['blocks', i, 'images', j, 'file'], im?.file, credits, files, where);
        const c = credits.find((x) => x.file === im?.file);
        if (!c) return;
        const s = slots[j], w = served(c, files);
        if (w && w < s.minWidth) issues.push(issue('warning', ['blocks', i, 'images', j, 'file'], `"${im.file}" is ${w} px wide but this slot is ${s.wide ? 'full-width (feature)' : `1 of ${s.d} per row`} and needs ≥ ${s.minWidth} px; it will look soft`, `a larger photo here${s.wide ? ', move this one later in the list, or set `feature: false`' : ''}`, undefined));
        if (isPortrait(c) && !s.tall && !im.focus) issues.push(issue('warning', ['blocks', i, 'images', j, 'file'], `"${im.file}" is portrait (${c.width}×${c.height}) in a ${s.wide ? 'wide' : 'landscape'} tile (${s.aspect.replace(/ /g, '')}); most of it will be cropped`, `a landscape photo; or pair it with another portrait in the same row (they get tall tiles); or set \`focus: top|center|bottom\` to accept the crop (silences this warning)${s.wide ? '; or move it out of the first slot / `feature: false`' : ''}`, { file: im.file, focus: 'top' }));
      });
    }
    if (b.type === 'cost_breakdown') (b.items || []).forEach((it, j) => checkMoney(issues, ['blocks', i, 'items', j, 'brl'], it?.local, it?.brl, rate, 'item'));
    // The cost block's total (non-optional items) should equal the headline cost shown on the card and in quick facts.
    if (b.type === 'cost_breakdown' && !stay && Array.isArray(b.items) && typeof data.cost?.local === 'number') {
      const req = b.items.filter((it) => it && !it.optional);
      const r2 = (n) => Math.round(n * 100) / 100;
      const totL = r2(req.reduce((n, it) => n + (typeof it.local === 'number' ? it.local : 0), 0));
      const totB = r2(req.reduce((n, it) => n + (typeof it.brl === 'number' ? it.brl : 0), 0));
      if (req.length && Math.abs(totL - data.cost.local) > 0.005) issues.push(issue('warning', ['blocks', i, 'items'], `the cost block adds up to ${totL} ${data.cost.currency || ''} but cost.local is ${data.cost.local}: the card and the cost block show different prices`.replace('  ', ' '), 'the non-optional items adding up to cost.local', undefined, `if the items are right, change cost.local to ${totL} (and cost.brl to match); if cost is right, fix an item or mark the extras \`optional: true\``));
      else if (req.length && typeof data.cost.brl === 'number' && Math.abs(totB - data.cost.brl) > 0.005 && fmtBRL(totB) !== fmtBRL(data.cost.brl)) { // only when the page really shows two different numbers
        const last = req.at(-1), j = b.items.indexOf(last);
        const want = r2(last.brl + (data.cost.brl - totB));
        issues.push(issue('warning', ['blocks', i, 'items', j, 'brl'], `the cost block total shows ${fmtBRL(totB)} (its items rounded one by one) but quick facts show ${fmtBRL(data.cost.brl)} (cost.brl ${data.cost.brl}): two different totals for the same ${data.cost.local} ${data.cost.currency || ''}`.trimEnd(), 'item R$ amounts that add up to cost.brl', want, `change this item's brl from ${last.brl} to ${want} so the total matches cost.brl (cost.brl = cost.local × fx.rate is the number to keep)`));
      }
    }
    if (b.type === 'menu') (b.items || []).forEach((it, j) => {
      checkMoney(issues, ['blocks', i, 'items', j, 'price_brl'], it?.price_local, it?.price_brl, rate, 'menu price');
      if ((it?.price_local === undefined) !== (it?.price_brl === undefined)) issues.push(issue('warning', ['blocks', i, 'items', j], 'menu item has only one of price_local / price_brl', 'both prices, or neither', { price_local: 28, price_brl: 21.3 }));
    });
    if (b.type === 'weather' && typeof b.temp_low_c === 'number' && typeof b.temp_high_c === 'number' && b.temp_low_c > b.temp_high_c) {
      issues.push(issue('error', ['blocks', i, 'temp_low_c'], `temp_low_c ${b.temp_low_c} is higher than temp_high_c ${b.temp_high_c}`, 'low ≤ high', b.temp_high_c));
    }
    if (b.type === 'pairs_well') (b.items || []).forEach((it, j) => {
      if (!it?.id) return;
      if (it.id === data.id) issues.push(issue('warning', ['blocks', i, 'items', j, 'id'], 'a place cannot pair with itself', 'another place id', undefined));
      else if (ctx.knownIds && !ctx.knownIds.has(it.id)) issues.push(issue('warning', ['blocks', i, 'items', j, 'id'], `no place with id "${it.id}" exists (yet); it renders as plain text`, 'the id of an existing place', undefined, 'create that place or fix the id'));
    });
  });
  // Hero repeated in the gallery; media files nobody references
  const heroImg = blocks.find((b) => b?.type === 'hero')?.image;
  blocks.forEach((b, i) => {
    if (b?.type === 'gallery' && heroImg) (b.images || []).forEach((im, j) => {
      if (im?.file === heroImg) issues.push(issue('warning', ['blocks', i, 'images', j, 'file'], `"${heroImg}" is already the hero photo; it appears twice on the page`, 'a different photo (or remove this gallery item)', undefined));
    });
  });
  const used = referencedMedia(data);
  const unused = credits.map((c) => c?.file).filter((f) => f && !used.has(f));
  if (unused.length) issues.push(issue('warning', ['blocks'], `unused photo${unused.length > 1 ? 's' : ''} in media/: ${unused.join(', ')} — fetched but not shown on the page (not in hero, gallery or cover)`, 'use them in a hero/gallery/cover, or delete them', undefined, `\`./atr media prune ${data.id || '<place>'} --yes\` removes unused media; \`./atr media remove <place> <name>\` removes one`));
  // Booking wording vs booking level (info only)
  const text = JSON.stringify([data.why, ...blocks.filter((b) => ['hero', 'prose', 'highlights', 'tips'].includes(b?.type))]).toLowerCase();
  const strong = /\b(must (be )?book|booking (is )?required|reservations? (is |are )?required|book(ing)? in advance is required|advance booking required)\b/.test(text);
  const soft = /\b(best booked|booking recommended|recommended to book|safer to book|book ahead if you can)\b/.test(text);
  if (strong && level !== 'required') issues.push(issue('info', ['book_ahead', 'required'], `the page text says booking is required, but book_ahead.required is ${level === 'recommended' ? '"recommended"' : 'false'}`, 'text and booking level that agree', undefined));
  if (level === 'none' && soft) issues.push(issue('info', ['book_ahead', 'required'], 'the page text recommends booking, but book_ahead.required is false', 'required: recommended (with lead_days + method), or softer text', undefined));
  if (stay && blocks.length && !types.includes('stay')) issues.push(issue('warning', ['blocks'], 'stay place without a `stay` block (beds and prices per night, rating, what makes it social)', 'a `type: stay` block (see `./atr blocks stay`)', undefined));
  if (!stay && !data.time_needed && !blocks.some((b) => b?.type === 'quick_facts')) issues.push(issue('warning', ['time_needed'], 'no time needed given (top-level or quick_facts block)', 'how long a visit takes', '2–3 h'));
  return issues;
}

/** Pure area validation. ctx: { credits, mediaFiles, folder:{country,slug}, now, fixtureMode } */
export function validateArea(data, ctx = {}) {
  const issues = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    issues.push(issue('error', [], 'file is empty or not a YAML mapping', 'a YAML object starting with `id:`', 'id: harbin'));
    return issues;
  }
  check(areaSpec, data, [], issues);
  dedupeTodo(issues, todoIssues(data), areaSpec, data);
  if (ctx.mustDoKeys !== undefined) { const m = mustDoIssue(data.must_do, ctx.mustDoKeys); if (m) issues.push(m); }
  if (ctx.mustDoTypes?.[data.must_do] === 'stay') issues.push(issue('warning', ['must_do'], `"${data.must_do}" is a must-do for a stay card; an area does not cover it`, 'must_do on a place with category stay + kind Stay', undefined));
  whenIssues(data, ctx, issues);
  if (typeof data.region === 'string' && data.region.length > 28) issues.push(issue('info', ['region'], `region is ${data.region.length} characters; the hero chip wraps to two lines on a phone above ~28`, 'a short region (≤ 28 characters)', 'Heilongjiang, NE China', 'shorten it; the rest fits in `why` or a prose block'));
  if (typeof data.name === 'string' && data.name.length > 40) issues.push(issue('info', ['name'], `name is ${data.name.length} characters; long for a card title`, 'a shorter name', undefined));
  if (data.must_do_note && !data.must_do) issues.push(issue('warning', ['must_do_note'], 'must_do_note without must_do: nothing shows it', 'must_do: <key> on the same card, or delete the note', undefined));
  const now = today(ctx.now);
  const f = ctx.folder;
  if (f?.slug && data.id && data.id !== f.slug) issues.push(issue('error', ['id'], `id "${data.id}" does not match the file name "${f.slug}.yaml"`, 'id equal to the file name', f.slug));
  if (f?.country && data.country && data.country !== f.country) issues.push(issue('error', ['country'], `country "${data.country}" does not match the folder "${f.country}"`, 'areas/<country>/<id>.yaml', f.country));
  if (data.fixture && !ctx.fixtureMode) issues.push(issue('error', ['fixture'], '`fixture: true` is only for platform test fixtures', 'remove the `fixture` line', undefined));
  const d = data.days_suggested;
  if (d && typeof d.min === 'number' && typeof d.max === 'number' && d.min > d.max) issues.push(issue('error', ['days_suggested'], `min ${d.min} is greater than max ${d.max}`, 'min ≤ max', { min: d.max, max: d.min }));
  (data.sources || []).forEach((s, i) => {
    if (s?.checked && typeof s.checked === 'string' && isFuture(s.checked, now)) issues.push(issue('error', ['sources', i, 'checked'], `checked date ${s.checked} is in the future`, 'today or earlier', now));
  });
  if (data.image) checkImageRef(issues, ['image'], data.image, ctx.credits || [], ctx.mediaFiles || [], ctx.mediaWhere || 'media');
  // Coordinates: needed for the country overview map and the page's own map
  const box = BBOX[data.country];
  if (typeof data.lat !== 'number' || typeof data.lng !== 'number') issues.push(issue('warning', ['lat'], 'no lat/lng: this area is missing from the country overview map and its page has no map', "the city centre (or the region's main base) in WGS84, e.g. from Wikipedia/GeoHack", { lat: 45.7567, lng: 126.6424 }));
  else if (box && (data.lat < box[0] || data.lat > box[1] || data.lng < box[2] || data.lng > box[3])) issues.push(issue('error', ['lat'], `lat/lng ${data.lat}, ${data.lng} is outside ${COUNTRIES[data.country]?.name}${data.lat > 60 || data.lng < 60 ? ' (lat and lng swapped?)' : ''}`, `coordinates inside ${COUNTRIES[data.country]?.name}`, { lat: (box[0] + box[1]) / 2, lng: (box[2] + box[3]) / 2 }));
  // Area page blocks
  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  for (const i of issues) {
    const m = i.pathArr?.length === 3 && i.pathArr[0] === 'blocks' && i.pathArr[2] === 'type' && /^unknown type/.test(i.message) ? blocks[i.pathArr[1]]?.type : null;
    if (m && BLOCK_TYPES.includes(m)) { i.message = `block \`${m}\` is only for place pages; an area page cannot use it`; i.expected = `one of the area blocks: ${AREA_BLOCK_TYPES.join(', ')}`; i.example = undefined; i.hint = m === 'map' ? 'the area page gets its map automatically from lat/lng' : m === 'quick_facts' ? 'the facts strip is automatic (days_suggested, cost_level, best_for, getting_there, getting_around)' : 'put this on the page of a place in the area, and delete it here'; }
  }
  if (blocks.filter((b) => b?.type === 'hero').length > 1) issues.push(issue('error', ['blocks'], 'more than one hero block', 'at most one hero', undefined));
  const credits = ctx.credits || [], files = ctx.mediaFiles || [], where = ctx.mediaWhere || 'media';
  blocks.forEach((b, i) => {
    if (b?.type === 'hero' && b.image) checkImageRef(issues, ['blocks', i, 'image'], b.image, credits, files, where);
    if (b?.type === 'gallery') (b.images || []).forEach((im, j) => checkImageRef(issues, ['blocks', i, 'images', j, 'file'], im?.file, credits, files, where));
    if (b?.type === 'weather' && typeof b.temp_low_c === 'number' && typeof b.temp_high_c === 'number' && b.temp_low_c > b.temp_high_c) issues.push(issue('error', ['blocks', i, 'temp_low_c'], `temp_low_c ${b.temp_low_c} is higher than temp_high_c ${b.temp_high_c}`, 'low ≤ high', b.temp_high_c));
  });
  return issues;
}

/**
 * credits.yaml checks. Places own their media folder. Areas of one country share one, so an area only gets the
 * errors of entries it uses (card image, hero, gallery) or that were fetched for it (`area: <id>`); an entry no
 * area uses or owns is reported on the first area file of the country, so it still shows up once.
 * area: { file, data } when checking for an area file.
 */
function checkCredits(mediaDir, issues, area) {
  const f = path.join(mediaDir, 'credits.yaml');
  if (!fs.existsSync(f)) return;
  const { data, parseErrors, lineOf } = readYaml(f);
  if (parseErrors.length) { issues.push(...parseErrors.map((e) => ({ ...e, path: 'media/credits.yaml' }))); return; }
  const list = Array.isArray(data) ? data : [];
  let mine = () => true;
  if (area) {
    const others = areaFilesIn(path.dirname(mediaDir)).filter((x) => x.file !== area.file);
    const usedBy = (c, d) => !!c?.file && referencedMedia(d).has(c.file);
    const first = [area.file, ...others.map((x) => x.file)].sort()[0] === area.file;
    mine = (i) => {
      const c = list[i];
      if ((c?.area && c.area === area.data?.id) || usedBy(c, area.data)) return true;
      if (c?.area && others.some((o) => o.data?.id === c.area)) return false;
      if (others.some((o) => usedBy(c, o.data))) return false;
      return first; // nobody uses or owns it
    };
  }
  const sub = check(creditsSpec, data || [], []);
  for (const s of sub) {
    const idx = typeof s.pathArr?.[0] === 'number' ? s.pathArr[0] : null;
    if (idx !== null && !mine(idx)) continue;
    const name = idx !== null && list[idx]?.file ? ` ("${list[idx].file}")` : '';
    issues.push({ ...s, path: `media/credits.yaml ${s.path}${name}`, line: undefined, file: f, fileLine: lineOf(s.pathArr) });
  }
}

function areaFilesIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x) && !x.startsWith('_') && !x.startsWith('.')).map((x) => {
    const file = path.join(dir, x);
    try { return { file, data: readYaml(file).data }; } catch { return { file, data: null }; }
  });
}

function withLines(issues, lineOf) {
  for (const i of issues) if (i.line === undefined && i.pathArr) i.line = lineOf(i.pathArr);
  return issues;
}

export function validatePlaceFile(file, ctx = {}) {
  const { data, parseErrors, lineOf } = readYaml(file);
  if (parseErrors.length) return { file, kind: 'place', data: null, issues: parseErrors };
  const dir = path.dirname(file);
  const mediaDir = path.join(dir, 'media');
  const parts = dir.split(path.sep);
  const folder = { slug: parts.at(-1), city: parts.at(-2), country: parts.at(-3) };
  const issues = withLines(validatePlace(data, { ...ctx, folder, credits: loadCredits(mediaDir), mediaFiles: mediaFiles(mediaDir) }), lineOf);
  checkCredits(mediaDir, issues);
  return { file, kind: 'place', data, issues };
}

export function validateAreaFile(file, ctx = {}) {
  const { data, parseErrors, lineOf } = readYaml(file);
  if (parseErrors.length) return { file, kind: 'area', data: null, issues: parseErrors };
  const dir = path.dirname(file);
  const mediaDir = path.join(dir, 'media');
  const folder = { slug: path.basename(file).replace(/\.ya?ml$/, ''), country: path.basename(dir) };
  const issues = withLines(validateArea(data, { ...ctx, folder, credits: loadCredits(mediaDir), mediaFiles: mediaFiles(mediaDir), mediaWhere: `areas/${folder.country}/media` }), lineOf);
  checkCredits(mediaDir, issues, { file, data });
  return { file, kind: 'area', data, issues };
}

const STOP = new Set(['the', 'of', 'and', 'at', 'in', 'on', 'a', 'an', 'de', 'la']);
const tokens = (p) => new Set(String(p.name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w) && w !== String(p.city || '').replace(/-/g, ' ')));
function metres(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/**
 * Pairs of places that look like the same thing: same name_local, or within ~80 m with similar names.
 * Not duplicates: a stay and an attraction; a dated event and anything on other dates (or with no dates).
 * Returns [{ a, b, reason }].
 */
export function findDuplicates(places, { maxMetres = 80, minOverlap = 0.5 } = {}) {
  const out = [];
  for (let i = 0; i < places.length; i++) for (let j = i + 1; j < places.length; j++) {
    const a = places[i], b = places[j];
    if (a.country !== b.country || isStay(a) !== isStay(b)) continue;
    const da = eventDates(a), db = eventDates(b);
    if (da.length || db.length) { if (!(da.length && db.length && da.some((x) => db.some((y) => x.from <= y.to && y.from <= x.to)))) continue; }
    const la = String(a.name_local || '').trim(), lb = String(b.name_local || '').trim();
    if (la && la === lb) { out.push({ a, b, reason: `both have name_local ${la}` }); continue; }
    const A = a.location, B = b.location;
    if (![A?.lat, A?.lng, B?.lat, B?.lng].every((n) => typeof n === 'number')) continue;
    const d = metres(A, B);
    if (d > maxMetres) continue;
    const ta = tokens(a), tb = tokens(b);
    const inter = [...ta].filter((w) => tb.has(w)).length;
    const overlap = inter / Math.max(1, Math.min(ta.size, tb.size));
    if (inter && overlap >= minOverlap) out.push({ a, b, reason: `${Math.round(d)} m apart with similar names` });
  }
  return out;
}

/** Validate everything (or a subset of files). Returns { results, errors, warnings }. */
export function validateAll(opts = {}) {
  const roots = dataRoots(opts);
  const placeFiles = opts.files ? opts.files.filter((f) => f.endsWith('place.yaml')) : findPlaceFiles(opts);
  const areaFiles = opts.files ? opts.files.filter((f) => !f.endsWith('place.yaml')) : findAreaFiles(opts);
  // known ids come from all places, even when validating a subset
  const knownIds = new Set();
  const idFiles = {};
  for (const f of findPlaceFiles(opts)) {
    const id = path.basename(path.dirname(f));
    knownIds.add(id);
    (idFiles[id] ||= []).push(f);
  }
  // Stated taste: must_do keys for the cross-check; a malformed taste file is reported when validating everything.
  const rt = opts.taste === undefined ? readTaste(opts) : { exists: !!opts.taste, taste: opts.taste, issues: [] };
  const ctx = {
    knownIds, now: opts.now, fixtureMode: roots.fixtures, mustDoKeys: rt.taste ? mustDoKeys(rt.taste) : rt.exists ? undefined : null,
    mustDoTypes: Object.fromEntries((rt.taste?.must_do || []).filter((m) => m.type).map((m) => [m.key, m.type])),
    trip: opts.config === undefined ? loadTripConfig(opts) : opts.config,
  };
  const results = [...placeFiles.map((f) => validatePlaceFile(f, ctx)), ...areaFiles.map((f) => validateAreaFile(f, ctx))];
  if (!opts.files && rt.issues.length) results.push({ file: rt.file, kind: 'taste', data: rt.taste, issues: rt.issues });
  for (const r of results) {
    if (r.kind !== 'place') continue;
    const id = path.basename(path.dirname(r.file));
    if (idFiles[id]?.length > 1) r.issues.push(issue('error', ['id'], `id "${id}" is used by ${idFiles[id].length} places: ${idFiles[id].map((x) => path.relative(roots.places, x)).join(', ')}`, 'a unique id (add the city or area to it)', `${id}-2`));
  }
  // Duplicates: two places that look like the same thing (always judged over every place).
  const byFile = new Map(results.map((r) => [r.file, r]));
  const all = findPlaceFiles(opts).map((f) => byFile.get(f)?.data ? { ...byFile.get(f).data, _file: f } : (() => { try { return { ...readYaml(f).data, _file: f }; } catch { return null; } })()).filter((p) => p && p.id && (roots.fixtures || !p.fixture));
  for (const d of findDuplicates(all)) for (const [me, other] of [[d.a, d.b], [d.b, d.a]]) {
    const r = byFile.get(me._file);
    if (r) r.issues.push({ ...issue('warning', ['name'], `looks like the same place as "${other.name}" (${path.relative(roots.places, other._file)}): ${d.reason}`, 'one page per place', undefined, 'merge the two pages, or make the difference clear in both names (a dated event at the same spot needs `when`)'), line: 1 });
  }
  const errors = results.reduce((n, r) => n + r.issues.filter((i) => i.level === 'error').length, 0);
  const warnings = results.reduce((n, r) => n + r.issues.filter((i) => i.level === 'warning').length, 0);
  return { results, errors, warnings };
}
