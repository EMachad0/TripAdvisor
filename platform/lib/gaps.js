// Gap report: what the curator should work on next. Taste-aware when config/taste.yaml exists.
import { loadPlaces, loadAreas } from './load.js';
import { loadTripConfig } from './config.js';
import { localDate } from './paths.js';
import { ATTRACTION_CATEGORY_IDS, COUNTRIES, FAME_IDS } from './schema/enums.js';
import { mediaVariants } from './validate.js';
import { mediaFiles } from './load.js';
import { bookingLevel, bookingLinks } from './booking.js';
import { isStay, countsAgainstBudget } from './kinds.js';
import { loadTaste, mustDoStatus, categoryTargets, interestWeights, tagSignals } from './taste.js';
import { tripOverlapInfo, sameDayGroups, eventDays, rangeLabel, dayLabel, whenKind } from './when.js';
import { readLinkCache, cachedLinkProblems } from './links.js';
import { loadReviews, reviewStatus } from './review.js';

const daysAgo = (d, now) => Math.round((Date.parse(now) - Date.parse(d)) / 86400000);

/** Thresholds: defaults here, overridden by `gaps:` in config/trip.yaml. */
export const GAP_DEFAULTS = {
  stale_source_days: 45,
  options_per_day: 2,            // candidate attractions wanted per trip day
  dominant_category_share: 0.4,  // only used when there is no stated taste
  budget_outlier_share: 1,
  balance_min_places: 6,         // attractions a country needs before category/discovery shares are judged
  under_target_ratio: 0.5,       // a category is "far under" below this × its expected count
  over_target_ratio: 2,          // … and "far over" above this × its target share (and ≥ 3 places)
  hidden_share_min: 0.3,         // goal discovery: at least this share of a country's attractions is fame: hidden
  areas_wanted_default: 3,       // area cards for countries without fixed cities, China and Japan (trip.yaml `areas_wanted` wins)
};

/** How many area cards a country wants. */
export function areasWanted(c, th = GAP_DEFAULTS) {
  if (typeof c.areas_wanted === 'number') return c.areas_wanted;
  return !c.cities?.length || c.id === 'china' || c.id === 'japan' ? th.areas_wanted_default : 0;
}

/**
 * Category balance of one country against the interest targets.
 * Returns { n, targets, missingTop: [[cats w3], [cats w2]], under: [{cat, count, expected, weight}], over: [{cat, count, share, target}] }
 */
export function categoryBalance(attractions, taste, th = GAP_DEFAULTS) {
  const targets = categoryTargets(taste);
  const weights = interestWeights(taste);
  const n = attractions.length;
  const count = Object.fromEntries(ATTRACTION_CATEGORY_IDS.map((k) => [k, attractions.filter((p) => p.category === k).length]));
  if (!targets) return { n, count, targets: null, missingTop: [], under: [], over: [] };
  const byWeight = (a, b) => weights[b] - weights[a] || ATTRACTION_CATEGORY_IDS.indexOf(a) - ATTRACTION_CATEGORY_IDS.indexOf(b);
  const missingTop = [3, 2].map((w) => ATTRACTION_CATEGORY_IDS.filter((k) => weights[k] === w && !count[k]));
  const under = [], over = [];
  if (n >= th.balance_min_places) {
    for (const k of [...ATTRACTION_CATEGORY_IDS].sort(byWeight)) {
      const expected = targets[k] * n;
      if (expected >= 0.75 && count[k] < expected * th.under_target_ratio) under.push({ cat: k, count: count[k], expected: Math.round(expected * 10) / 10, weight: weights[k] });
      if (count[k] >= 3 && count[k] / n > targets[k] * th.over_target_ratio) over.push({ cat: k, count: count[k], share: count[k] / n, target: targets[k] });
    }
  }
  return { n, count, targets, missingTop, under, over };
}

/** Returns { items: [{severity, kind, id?, country?, city?, key?, message}], stats, now, mustDo, thresholds } */
export function gapReport(opts = {}) {
  const now = opts.now ? String(opts.now).slice(0, 10) : localDate();
  const cfg = opts.config ?? loadTripConfig(opts) ?? { countries: [], gaps: {} };
  const th = { ...GAP_DEFAULTS, ...(cfg.gaps || {}) };
  const taste = opts.taste === undefined ? loadTaste(opts) : opts.taste;
  const places = opts.places ?? loadPlaces(opts);
  const areas = opts.areas ?? loadAreas(opts);
  const items = [];
  const add = (severity, kind, message, extra = {}) => items.push({ severity, kind, message, ...extra });

  // Must-do list
  const mustDo = mustDoStatus(taste, places, areas);
  for (const m of mustDo) {
    if (m.covered) continue;
    const have = m.want > 1 ? ` (${m.have}/${m.want} claimed)` : '';
    add('high', 'must-do', `traveler asked for "${m.said}"${have}: no ${m.type === 'area' ? 'area card' : m.type === 'stay' ? 'stay card' : 'place or area'} claims \`must_do: ${m.key}\` yet${m.hint ? ` — hint: ${m.hint}` : ''}`, { country: m.country, city: m.city, key: m.key });
  }

  const linkCache = opts.linkCache ?? readLinkCache(opts);   // filled by `./atr links`; never fetched here
  const reviews = opts.reviews ?? loadReviews(opts);
  const unreviewed = {};
  for (const p of places) {
    const id = p.id;
    const stay = isStay(p);
    // Dated events vs the days in that country
    const ov = tripOverlapInfo(p, cfg);
    if (ov.state === 'none' && whenKind(p) !== 'best') add('medium', 'event', `happens on ${eventDays(p).slice(0, 6).map(rangeLabel).join(', ')}, but the traveler is in ${COUNTRIES[p.country]?.name || p.country} on ${rangeLabel(ov.window)}: drop it, or say clearly on the page that the route would have to change`, { id, country: p.country });
    // Links (from the last `./atr links` run)
    for (const l of cachedLinkProblems(p, linkCache)) add(l.status === 'dead' ? 'high' : 'medium', 'links', `${l.what} ${l.status}: ${l.url} (${l.detail}; checked ${String(l.checked).slice(0, 10)})`, { id, country: p.country });
    // Independent review
    const rs = reviewStatus(p, reviews);
    if (rs.state === 'fix') for (const i of rs.issues.filter((x) => x.severity !== 'nit')) add(i.severity === 'blocker' ? 'high' : 'medium', 'review', `${i.field}: ${i.problem}${i.fix ? ` → ${i.fix}` : ''}`, { id, country: p.country, field: i.field });
    else if (rs.state === 'none' || rs.state === 'stale') ((unreviewed[p.country] ||= { none: [], stale: [] })[rs.state]).push(id);
    const blocks = Array.isArray(p.blocks) ? p.blocks : [];
    const types = blocks.map((b) => b?.type);
    const files = mediaFiles(p._meta?.mediaDir || '');
    const imgs = new Set([p.cover, ...blocks.filter((b) => b?.type === 'hero').map((b) => b.image), ...blocks.filter((b) => b?.type === 'gallery').flatMap((b) => (b.images || []).map((i) => i.file))].filter(Boolean));
    const realImgs = [...imgs].filter((n) => mediaVariants(n, files).length);
    if (!realImgs.length) add('medium', 'no-image', 'no photos: the page uses the typographic hero (fine when no free photo exists — say so in the guide-approved way, see CURATOR-GUIDE "No free photo")', { id, country: p.country });
    for (const t of ['highlights', 'map', 'tips']) if (!types.includes(t)) add('medium', 'weak-page', `no ${t} block`, { id, country: p.country });
    if (stay && !types.includes('stay')) add('medium', 'weak-page', 'stay place without a stay block (beds per night, rating, what makes it social)', { id, country: p.country });
    if (!stay && (p.category === 'food' || p.category === 'nightlife')) if (!types.includes('menu')) add('low', 'weak-page', 'food/nightlife place without a menu block', { id, country: p.country });
    if (!stay && !types.includes('weather')) add('low', 'weak-page', 'no weather (winter reality) block', { id, country: p.country });
    if (!stay && !p.fame) add('low', 'missing-field', `no fame (${FAME_IDS.join(' | ')}): the traveler wants discovery, so say how well known this is`, { id, country: p.country });
    if (!p.name_local && !['hong-kong', 'singapore'].includes(p.country)) add('low', 'missing-field', 'no name_local (local-script name)', { id, country: p.country });
    if (!p.location?.address_local && !['hong-kong', 'singapore'].includes(p.country)) add('medium', 'missing-field', 'no location.address_local (taxi address)', { id, country: p.country });
    if (!p.hours?.winter) add('medium', 'missing-field', 'no hours.winter (Dec–Jan notes)', { id, country: p.country });
    if (p.confidence === 'low') add('medium', 'low-confidence', `low confidence${p.confidence_note ? `: ${p.confidence_note}` : ''}`, { id, country: p.country });
    const srcs = Array.isArray(p.sources) ? p.sources : [];
    if (srcs.length < 2) add('high', 'sources', `only ${srcs.length} source(s); need ≥ 2`, { id, country: p.country });
    for (const s of srcs) if (s?.checked && daysAgo(s.checked, now) > th.stale_source_days) add('medium', 'stale-source', `source checked ${daysAgo(s.checked, now)} days ago (> ${th.stale_source_days}): ${s.url}`, { id, country: p.country });
    const level = bookingLevel(p);
    if (level !== 'none' && p.book_ahead.lead_days === undefined) add('high', 'book-ahead', `booking ${level} but no lead_days`, { id, country: p.country });
    if (level !== 'none' && p.book_ahead.method !== 'walk-in' && !bookingLinks(p).length) add('medium', 'book-ahead', `booking ${level} but no link/links`, { id, country: p.country });
    const budget = cfg.countries?.find((c) => c.id === p.country)?.budget_brl_per_day;
    if (budget && countsAgainstBudget(p) && typeof p.cost?.brl === 'number' && p.cost.brl > budget * th.budget_outlier_share) add('medium', 'budget', `costs R$${p.cost.brl} — ${Math.round((p.cost.brl / budget) * 100)}% of the R$${budget}/day budget (splurge? say so on the page)`, { id, country: p.country });
    if (p.fx?.date && daysAgo(p.fx.date, now) > 60) add('low', 'stale-fx', `fx rate from ${p.fx.date}`, { id, country: p.country });
    // Stated taste: tags the traveler scored 0
    if (!stay && !p.must_do) for (const s of tagSignals(p, taste).filter((x) => x.weight === 0)) add('medium', 'taste', `traveler scored ${s.tag} 0: say on the page why it's a must, or drop it${s.note ? ` (${s.note})` : ''}`, { id, country: p.country });
  }

  const stats = {};
  const perCity = taste?.stay?.wanted ? (taste.stay.per_city ?? 1) : 0;
  for (const c of cfg.countries || []) {
    const all = places.filter((p) => p.country === c.id);
    const ps = all.filter((p) => !isStay(p));
    const stays = all.filter(isStay);
    const want = Math.ceil(c.days * th.options_per_day);
    const bal = categoryBalance(ps, taste, th);
    const fame = Object.fromEntries([...FAME_IDS, 'unset'].map((k) => [k, ps.filter((p) => (p.fame || 'unset') === k).length]));
    const as = areas.filter((a) => a.country === c.id);
    const wantAreas = areasWanted(c, th);
    // `places` = attractions (what competes for trip days); stays are counted separately.
    stats[c.id] = { places: ps.length, attractions: ps.length, stays: stays.length, days: c.days, want, categories: bal.count, fame, areas: as.length, areasWanted: wantAreas, cities: [...new Set(all.map((p) => p.city))] };
    if (ps.length < want) add(ps.length === 0 ? 'high' : 'medium', 'too-few', `${ps.length} place(s) for ${c.days} days (want ≥ ${want} = ${th.options_per_day}/day to rank)`, { country: c.id });

    if (bal.targets) {
      if (ps.length >= th.balance_min_places) {
        if (bal.under.length) add('medium', 'balance', `far under the interest target: ${bal.under.map((u) => `${u.cat} (${u.count}, want ~${Math.max(1, Math.round(u.expected))}; interest ${u.weight}/3)`).join(', ')}`, { country: c.id, categories: bal.under.map((u) => u.cat) });
        if (bal.over.length) add('medium', 'balance', `far over the interest target: ${bal.over.map((o) => `${o.cat} is ${Math.round(o.share * 100)}% of places (target ${Math.round(o.target * 100)}%)`).join(', ')}`, { country: c.id });
      } else if (ps.length) {
        const [w3, w2] = bal.missingTop;
        if (w3.length || w2.length) add('medium', 'balance', `top interests still missing: ${[w3.length ? `${w3.join(', ')} (3/3)` : '', w2.length ? `${w2.join(', ')} (2/3)` : ''].filter(Boolean).join(' · ')}`, { country: c.id, categories: [...w3, ...w2] });
      }
    } else { // no stated taste: flat rules
      if (ps.length >= 4) for (const [k, n] of Object.entries(bal.count)) if (n / ps.length > th.dominant_category_share) add('medium', 'balance', `${k} is ${Math.round((n / ps.length) * 100)}% of places (> ${th.dominant_category_share * 100}%)`, { country: c.id });
      const missingCats = ['culture', 'food', 'nightlife', 'nature', 'odd-local', 'views'].filter((k) => !bal.count[k]);
      if (ps.length && missingCats.length) add('medium', 'balance', `no ${missingCats.join(', ')} places yet`, { country: c.id });
    }

    // Discovery: fame mix
    if (taste?.goal === 'discovery' && ps.length >= th.balance_min_places) {
      const share = fame.hidden / ps.length;
      const unset = fame.unset ? `; ${fame.unset} have no fame set` : '';
      if (share < th.hidden_share_min) add('medium', 'discovery', `only ${fame.hidden} of ${ps.length} places are fame: hidden (${Math.round(share * 100)}%, want ≥ ${Math.round(th.hidden_share_min * 100)}%${unset}): add places the traveler has not heard of`, { country: c.id });
      if (!fame.iconic) add('medium', 'discovery', `no fame: iconic place${unset}: cover the icons too`, { country: c.id });
    }

    const fixed = c.cities || [];
    for (const city of fixed) if (!ps.some((p) => p.city === city)) add('high', 'city-empty', `fixed city "${city}" has no places`, { country: c.id, city });
    // Stays: per city that has attractions or is fixed (`stays: false` in the config = no bed there, e.g. a layover day)
    if (perCity && c.stays !== false) for (const city of [...new Set([...fixed, ...ps.map((p) => p.city)])]) {
      const n = stays.filter((p) => p.city === city).length;
      if (n < perCity) add('medium', 'stay', `${n}/${perCity} stay card(s) in ${city} (social hostels, capsule hotels)`, { country: c.id, city });
    }
    // Cities with places but no area card: the traveler cannot weigh the city itself
    const covered = new Set(as.flatMap((a) => [a.id, ...(a.cities || [])]));
    for (const city of [...new Set(all.map((p) => p.city))].sort()) {
      const n = all.filter((p) => p.city === city).length;
      if (n >= 2 && !covered.has(city)) add('medium', 'area-missing', `${city} has ${n} places but no area card covers it: add one (./atr new area) with getting there, days and winter`, { country: c.id, city });
    }
    if (as.length < wantAreas) add('medium', 'areas', `${as.length}/${wantAreas} area card(s); the areas round needs them to choose cities`, { country: c.id });
  }
  // Areas: a card without a page, or without coordinates
  for (const a of areas) {
    const rs = reviewStatus(a, reviews);
    if (rs.state === 'fix') for (const i of rs.issues.filter((x) => x.severity !== 'nit')) add(i.severity === 'blocker' ? 'high' : 'medium', 'review', `${i.field}: ${i.problem}${i.fix ? ` → ${i.fix}` : ''}`, { id: a.id, country: a.country, field: i.field, area: true });
    else if (rs.state === 'none' || rs.state === 'stale') ((unreviewed[a.country] ||= { none: [], stale: [] })[rs.state]).push(`area ${a.id}`);
    if (!Array.isArray(a.blocks) || !a.blocks.length) add('low', 'area-page', 'card only: add a page (`blocks:` with highlights, prose, gallery, tips) so the traveler can judge the city', { id: a.id, country: a.country, area: true });
    if (typeof a.lat !== 'number' || typeof a.lng !== 'number') add('low', 'area-page', 'no lat/lng: missing from the country overview map', { id: a.id, country: a.country, area: true });
  }
  for (const [country, u] of Object.entries(unreviewed)) add('low', 'review', `${[u.none.length ? `${u.none.length} never reviewed (${u.none.join(', ')})` : '', u.stale.length ? `${u.stale.length} changed since their review (${u.stale.join(', ')})` : ''].filter(Boolean).join('; ')}: run ./atr review --changed`, { country });
  const sameDay = sameDayGroups(places);
  for (const g of sameDay) add('low', 'same-day', `${g.ids.length} places are only possible on ${dayLabel(g.date)}: ${g.ids.join(', ')} (the traveler can pick one)`, { country: g.places.every((p) => p.country === g.places[0].country) ? g.places[0].country : undefined, date: g.date });
  for (const p of places) if (cfg.countries?.length && !cfg.countries.some((c) => c.id === p.country)) add('low', 'off-route', `country ${p.country} is not on the route in config/trip.yaml`, { id: p.id, country: p.country });
  const order = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => order[a.severity] - order[b.severity] || String(a.country).localeCompare(String(b.country)));
  return { items, stats, now, mustDo, sameDay: sameDay.map(({ date, ids }) => ({ date, ids })), thresholds: th, hasTaste: !!taste };
}

export function formatGaps({ items, stats, mustDo = [] }, c = { red: (s) => s, yellow: (s) => s, dim: (s) => s, bold: (s) => s }) {
  const L = ['# Coverage' + c.dim('  (attractions compete for trip days; stays are counted apart)')];
  for (const [id, s] of Object.entries(stats)) {
    if (!s) continue;
    const mix = Object.entries(s.categories).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ') || '—';
    const fame = s.fame && s.places ? `fame: ${Object.entries(s.fame).filter(([k, n]) => n || k !== 'unset').map(([k, n]) => `${k} ${n}`).join(' · ')}` : '';
    L.push(`  ${(COUNTRIES[id]?.name || id).padEnd(12)} ${String(s.places).padStart(3)}/${s.want} attractions for ${s.days} days · ${s.stays ?? 0} stay(s)${s.areasWanted ? ` · ${s.areas}/${s.areasWanted} areas` : ''}`);
    L.push(c.dim(`  ${''.padEnd(12)}     ${mix}${fame ? `   |   ${fame}` : ''}`));
  }
  if (mustDo.length) L.push(`  Must-do list: ${mustDo.filter((m) => m.covered).length}/${mustDo.length} covered ${c.dim('(./atr taste)')}`);
  L.push('', `# Gaps (${items.length})`);
  const groups = {};
  for (const i of items) (groups[i.id ? `${i.area ? 'area' : 'place'} ${i.id}` : i.country ? `country ${i.country}` : 'trip (any country)'] ||= []).push(i);
  for (const [k, list] of Object.entries(groups)) {
    L.push(c.bold(`  ${k}`));
    for (const i of list) L.push(`    ${i.severity === 'high' ? c.red('HIGH  ') : i.severity === 'medium' ? c.yellow('MEDIUM') : c.dim('low   ')} ${c.dim(i.kind.padEnd(14))} ${i.message}`);
  }
  if (!items.length) L.push('  none — nice.');
  L.push('', c.dim('What to do first: ./atr next'));
  return L.join('\n');
}
