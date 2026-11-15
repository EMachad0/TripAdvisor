// `atr next`: turn gaps + stated taste into a ranked list of concrete one-line curator tasks.
// Every task is usable as-is with `./atr run "<task>"`.
import path from 'node:path';
import { loadPlaces, loadAreas } from './load.js';
import { loadTripConfig } from './config.js';
import { dataRoots } from './paths.js';
import { COUNTRIES, ATTRACTION_CATEGORY_IDS } from './schema/enums.js';
import { gapReport, categoryBalance } from './gaps.js';
import { loadTaste, interestWeights } from './taste.js';
import { validateAll } from './validate.js';
import { readFeedback, newFeedback, readSeen } from './feedback/index.js';
import { isStay } from './kinds.js';

const title = (slug) => String(slug ?? '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const cname = (id) => COUNTRIES[id]?.name || title(id);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const inCity = (city, country) => (title(city) === cname(country) ? cname(country) : `${title(city)}, ${cname(country)}`);
const noDot = (s) => String(s || '').trim().replace(/[.。]+$/, '');

/** Batch sizes: small enough for one headless session. */
export const BATCH = { places: 3, areas: 3, mustDoPlaces: 3, repairs: 3, repairTasks: 3 };

const REPAIR_KINDS = new Set(['weak-page', 'missing-field', 'low-confidence', 'stale-source', 'sources', 'book-ahead', 'taste', 'stale-fx', 'links', 'event']);
const short = (msg) => { const s = String(msg).split(/ — |: | \(/)[0]; return s.length > 60 ? s.slice(0, 57) + '…' : s; };

/** Pick `k` categories to add next: largest gap to the interest targets, re-counted after every pick. */
export function pickCategories(attractions, taste, k = BATCH.places) {
  const bal = categoryBalance(attractions, taste);
  const weights = interestWeights(taste);
  const count = { ...bal.count };
  const picks = [];
  for (let i = 0; i < k; i++) {
    const n = attractions.length + k;
    const cands = ATTRACTION_CATEGORY_IDS.filter((c) => (weights ? weights[c] > 0 : true));
    if (!cands.length) break;
    const gap = (c) => (bal.targets ? bal.targets[c] * n - count[c] : -count[c]);
    cands.sort((a, b) => gap(b) - gap(a) || (weights ? weights[b] - weights[a] : 0) || ATTRACTION_CATEGORY_IDS.indexOf(a) - ATTRACTION_CATEGORY_IDS.indexOf(b));
    picks.push(cands[0]); count[cands[0]]++;
  }
  const grouped = [];
  for (const c of picks) { const g = grouped.find((x) => x.cat === c); if (g) g.n++; else grouped.push({ cat: c, n: 1 }); }
  return grouped;
}

/**
 * Ranked tasks. opts: { count=5, country, fixtures, root, now } plus test injections
 * { config, taste, places, areas, validation, feedback }.
 * Returns { tasks: [{ rank, kind, country?, task, why }], total }
 */
export function nextTasks(opts = {}) {
  const cfg = opts.config ?? loadTripConfig(opts) ?? { countries: [] };
  const taste = opts.taste === undefined ? loadTaste(opts) : opts.taste;
  const places = opts.places ?? loadPlaces(opts);
  const areas = opts.areas ?? loadAreas(opts);
  const report = gapReport({ ...opts, config: cfg, taste, places, areas });
  const validation = opts.validation ?? validateAll({ fixtures: opts.fixtures, root: opts.root, now: opts.now, taste: opts.taste });
  const fb = opts.feedback ?? readFeedback(dataRoots(opts).feedback);
  const countries = cfg.countries || [];
  const route = (id) => { const i = countries.findIndex((c) => c.id === id); return i < 0 ? 999 : i; };
  const th = report.thresholds;
  const discovery = taste?.goal === 'discovery';
  const weights = interestWeights(taste);
  const attractions = (cid) => places.filter((p) => p.country === cid && !isStay(p));

  // 1. Open must-do items, earliest country on the route first.
  const mustDo = report.mustDo.filter((m) => !m.covered)
    .sort((a, b) => route(a.country) - route(b.country))
    .map((m) => {
      const n = Math.min(m.want - m.have, BATCH.mustDoPlaces);
      const where = m.city ? inCity(m.city, m.country) : m.country ? cname(m.country) : 'whichever country on the route suits it best';
      const hint = m.hint ? ` (hint: ${noDot(m.hint)})` : '';
      const why0 = `The traveler asked for this by name and nothing claims it yet${m.want > 1 ? ` (${m.have}/${m.want})` : ''}`;
      if (m.type === 'area') {
        const card = areas.find((a) => a.country === m.country && !a.must_do && m.city && (a.id === m.city || (a.cities || []).includes(m.city)));
        return { kind: 'must-do', country: m.country, key: m.key, task: card ? `The traveler's must-do "${m.said}"${hint} is an area: check that the area card ${card.id} really covers it, then claim it there with must_do: ${m.key}.` : `Research the traveler's must-do "${m.said}"${hint} and add an area card for it in ${where} (./atr new area). Claim it on the area card with must_do: ${m.key}.`, why: `${why0}; it needs an area card.` };
      }
      if (m.type === 'stay') return { kind: 'must-do', country: m.country, key: m.key, task: `Research the traveler's must-do "${m.said}"${hint} and add ${n === 1 ? 'the best stay card' : `${n} stay cards`} for it in ${where} (category stay, kind Stay: price per night, review score with source and date). Claim ${n === 1 ? 'it' : 'each'} with must_do: ${m.key}.`, why: `${why0}; it needs a stay card.` };
      const task = n === 1
        ? `Research the traveler's must-do "${m.said}"${hint} and add the best place page for it in ${where}. Claim it with must_do: ${m.key}.`
        : `Research the traveler's must-do "${m.said}"${hint} and add ${n} place pages for it in ${where}. Claim each with must_do: ${m.key}.`;
      // Pages that may already be the thing: an area card for that city, places in that city.
      const near = m.city ? [...areas.filter((a) => a.country === m.country && !a.must_do && (a.id === m.city || (a.cities || []).includes(m.city))).map((a) => `area ${a.id}`), ...places.filter((p) => p.country === m.country && p.city === m.city && !p.must_do && !isStay(p)).map((p) => p.id)].slice(0, 4) : [];
      if (near.length) return { kind: 'must-do', country: m.country, key: m.key, task: `${task} If an existing page already is it (${near.join(', ')}), claim it there instead of adding a new one.`, why: `The traveler asked for this by name and nothing claims it yet${m.want > 1 ? ` (${m.have}/${m.want})` : ''}; ${title(m.city)} already has pages.` };
      return { kind: 'must-do', country: m.country, key: m.key, task, why: `The traveler asked for this by name and nothing claims it yet${m.want > 1 ? ` (${m.have}/${m.want})` : ''}.` };
    });

  // 2. Area cards still wanted.
  const areaTasks = [];
  for (const c of countries) {
    const s = report.stats[c.id];
    if (!s || s.areas >= s.areasWanted) continue;
    const have = areas.filter((a) => a.country === c.id);
    const covered = new Set(have.flatMap((a) => [a.id, ...(a.cities || [])]));
    const n = Math.min(BATCH.areas, s.areasWanted - s.areas);
    const named = [...new Set((taste?.must_do || []).filter((m) => m.country === c.id && m.city && !covered.has(m.city)).map((m) => title(m.city)))];
    const include = named.slice(0, n);
    areaTasks.push({
      kind: 'areas', country: c.id,
      task: `Add ${plural(n, 'area card')} for ${cname(c.id)} (it has ${s.areas} of the ${s.areasWanted} wanted${have.length ? `: ${have.map((a) => a.name).join(', ')}` : ''}). Pick cities or regions that differ from each other and work in winter${include.length ? `; include ${list(include)}` : ''}${discovery ? '; mix the famous stops with ones the traveler has probably not heard of' : ''}.`,
      why: `The traveler chooses cities from area cards, and ${cname(c.id)} has ${s.areas}/${s.areasWanted}${named.length ? `. Must-do cities without a card: ${named.join(', ')}` : ''}.`,
    });
  }

  // Must-dos first, with an areas task after every second one so city choice is not blocked behind a long list.
  const head = [];
  const md = [...mustDo], at = [...areaTasks];
  while (md.length || at.length) {
    head.push(...md.splice(0, 2));
    if (at.length) head.push(at.shift());
  }

  // Cities that have places but no area card (after the must-do items): up to three cities per task, per country.
  const missingAreas = [];
  for (const c of countries) {
    const cities = report.items.filter((i) => i.kind === 'area-missing' && i.country === c.id).map((i) => i.city);
    for (let i = 0; i < cities.length; i += BATCH.areas) {
      const batch = cities.slice(i, i + BATCH.areas);
      missingAreas.push({ kind: 'areas', country: c.id, task: `Add ${batch.length === 1 ? 'an area card' : `${batch.length} area cards`} for ${list(batch.map(title))} (${cname(c.id)}): ${batch.length === 1 ? 'it already has' : 'each already has'} researched places but no card. Give getting there, getting around, suggested days, the winter note, lat/lng, and a page (blocks) where you can.`, why: `The traveler weighs cities on area cards; ${list(batch.map((x) => `${title(x)} has ${places.filter((p) => p.country === c.id && p.city === x).length} places`))} and no card. City-level questions (how to get there) also belong on it.` });
    }
  }

  // 3. Fixed cities with no places; countries with zero places.
  const topCats = weights ? ATTRACTION_CATEGORY_IDS.filter((k) => weights[k] === 3) : [];
  const starter = `${topCats.length ? ` Start with the top interests (${topCats.join(', ')}).` : ''}${discovery ? ' Make at least one of them a place most foreign visitors never hear of (fame: hidden).' : ''}`;
  const empty = [];
  for (const c of countries) {
    const ps = attractions(c.id);
    const emptyCities = (c.cities || []).filter((city) => !ps.some((p) => p.city === city));
    for (const city of emptyCities) empty.push({ kind: 'city-empty', country: c.id, task: `Add ${BATCH.places} places in ${inCity(city, c.id)}, a fixed stop with no places yet.${starter}`, why: `${title(city)} is fixed on the route (${c.days} days in ${cname(c.id)}) and has nothing to rank.` });
    const s = report.stats[c.id];
    if (!ps.length && !emptyCities.length && !(s.areas < s.areasWanted)) empty.push({ kind: 'places', country: c.id, task: `Add ${BATCH.places} places for ${cname(c.id)}, which has none yet.${starter}`, why: `${c.days} days in ${cname(c.id)} and nothing to rank.` });
  }

  // 4. Stay cards for cities that have attractions (or are fixed).
  const stays = report.items.filter((i) => i.kind === 'stay')
    .map((i) => ({ ...i, n: attractions(i.country).filter((p) => p.city === i.city).length, fixed: (countries.find((c) => c.id === i.country)?.cities || []).includes(i.city) }))
    .sort((a, b) => route(a.country) - route(b.country) || b.fixed - a.fixed || b.n - a.n || String(a.city).localeCompare(String(b.city)))
    .map((i) => {
      const per = taste.stay.per_city ?? 1;
      const have = places.filter((p) => isStay(p) && p.country === i.country && p.city === i.city).length;
      const n = Math.min(per - have, BATCH.places);
      return { kind: 'stay', country: i.country, task: `Add ${plural(n, 'stay card')} for ${inCity(i.city, i.country)} (category stay, kind Stay): social hostels where a solo traveler meets people to go out with${i.country === 'japan' ? ', or a capsule hotel' : ''}. Give the price per night, the review score with its source and date, and what makes it social.`, why: `${title(i.city)} ${i.fixed ? 'is a fixed stop, ' : ''}has ${plural(i.n, 'attraction')} and ${have}/${per} stay cards.` };
    });

  // 5. Category deficits, weighted by interest; biggest shortfall first.
  const deficits = [];
  for (const c of countries) {
    const ps = attractions(c.id);
    const s = report.stats[c.id];
    if (!ps.length || ps.length >= s.want) continue;
    const picks = pickCategories(ps, taste);
    const bal = categoryBalance(ps, taste, th);
    const hiddenShare = s.fame.hidden / ps.length;
    const wantHidden = discovery ? (hiddenShare < th.hidden_share_min ? Math.min(2, BATCH.places) : 1) : 0;
    const cities = [...new Set([...(c.cities || []), ...ps.map((p) => p.city), ...areas.filter((a) => a.country === c.id).flatMap((a) => a.cities || [])])].slice(0, 6).map(title);
    const mix = picks.map((p) => `${p.n} ${p.cat}`).join(', ');
    const under = bal.under.length ? `far under target: ${bal.under.map((u) => `${u.cat} (${u.count}, interest ${u.weight}/3)`).join(', ')}` : bal.missingTop.flat().length ? `top interests still missing: ${bal.missingTop.flat().join(', ')}` : 'interest-weighted mix';
    deficits.push({
      kind: 'places', country: c.id, shortfall: s.want - ps.length,
      task: `Add ${BATCH.places} places in ${cname(c.id)}${cities.length ? ` (${cities.join(', ')})` : ''}: ${mix}.${wantHidden ? ` Make at least ${wantHidden === 1 ? 'one' : 'two'} of them places most foreign visitors never hear of (fame: hidden).` : ''}`,
      why: `${ps.length}/${s.want} attractions for ${c.days} days; ${under}${discovery ? `; ${s.fame.hidden} of ${ps.length} are hidden` : ''}.`,
    });
  }
  deficits.sort((a, b) => b.shortfall - a.shortfall || route(a.country) - route(b.country));

  // 6. Page repairs, grouped per place, three places per task.
  const perPage = new Map();
  const page = (id, country, type = 'place') => { if (!perPage.has(id)) perPage.set(id, { id, country, type, errors: 0, score: 0, reasons: [] }); return perPage.get(id); };
  for (const r of validation.results || []) {
    if (r.kind !== 'place' && r.kind !== 'area') continue;
    const errs = r.issues.filter((i) => i.level === 'error');
    if (!errs.length) continue;
    const id = r.kind === 'place' ? path.basename(path.dirname(r.file)) : path.basename(r.file).replace(/\.ya?ml$/, '');
    const pg = page(id, r.data?.country, r.kind);
    pg.errors += errs.length; pg.score += errs.length * 100;
    pg.reasons.unshift(plural(errs.length, 'validation error'));
  }
  const sev = { high: 10, medium: 3, low: 1 };
  for (const i of report.items) {
    if (!i.id || !REPAIR_KINDS.has(i.kind)) continue;
    const pg = page(i.id, i.country);
    pg.score += sev[i.severity];
    pg.reasons.push(short(i.message));
  }
  const pages = [...perPage.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  // Pages with validation errors go to the very top: every runner session validates everything,
  // so a broken page makes each later run "not clean". The rest stays at step 6.
  const broken = pages.filter((p) => p.errors), weak = pages.filter((p) => !p.errors);
  const repairs = [], urgent = [];
  for (const [src, dest] of [[broken, urgent], [weak, repairs]]) for (let i = 0; i < src.length && dest.length < BATCH.repairTasks; i += BATCH.repairs) {
    const batch = src.slice(i, i + BATCH.repairs);
    const errs = batch.reduce((n, p) => n + p.errors, 0);
    const issues = batch.reduce((n, p) => n + p.reasons.length, 0);
    const same = batch.every((p) => p.country === batch[0].country) ? batch[0].country : undefined;
    dest.push({
      kind: 'repair', country: same,
      task: `Repair ${batch.length === 1 ? 'this page' : `these ${batch.length} pages`}: ${batch.map((p) => `${p.type === 'area' ? 'area ' : ''}${p.id} (${[...new Set(p.reasons)].slice(0, 4).join('; ')}${new Set(p.reasons).size > 4 ? `; +${new Set(p.reasons).size - 4} more` : ''})`).join('; ')}. Run ./atr validate <id> and ./atr gaps for the details, fix what you can verify, and re-check the page.`,
      why: errs ? `${plural(errs, 'validation error')} on ${plural(batch.length, 'page')}: until they are fixed, \`./atr validate --all\` fails for every session.` : `${plural(batch.length, 'page')} with ${plural(issues, 'open issue')}.`,
    });
  }

  // Review findings: one task per place, right after validation errors.
  const findings = new Map();
  for (const i of report.items) if (i.kind === 'review' && i.id) findings.set(i.id, [...(findings.get(i.id) || []), i]);
  const reviewTasks = [...findings.entries()].map(([id, list]) => ({ id, list, score: list.reduce((n, i) => n + sev[i.severity], 0) })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).map(({ id, list }) => {
    const blockers = list.filter((i) => i.severity === 'high').length;
    return { kind: 'review', country: list[0].country, task: `Fix review findings on ${id}: ${list.slice(0, 3).map((i) => (i.message.length > 110 ? i.message.slice(0, 107).trimEnd() + '…' : i.message).replace(/ → .*$/, '')).join('; ')}${list.length > 3 ? `; +${list.length - 3} more` : ''}. The full findings with evidence are in reviews/${id}.yaml; fix each one, or say in confidence_note why the reviewer is wrong.`, why: `An independent reviewer found ${plural(list.length, 'open issue')} on this page${blockers ? `, ${plural(blockers, 'blocker')} among them` : ''}.` };
  });

  // 7. Feedback after the curator's cursor (places/_feedback-seen.json; `./atr feedback --mark-seen` moves it).
  const feedback = [];
  const nf = newFeedback(fb, { since: opts.seen === undefined ? readSeen(opts) : opts.seen, places, areas });
  const fresh = nf.counts.swipes + nf.counts.duels + nf.counts.questions + (nf.counts.notes || 0);
  if (fresh) {
    const asked = nf.questions.map((q) => `${q.id} (${q.items.length})`);
    const bits = [
      asked.length ? `answer the traveler's questions on ${list(asked.slice(0, 5))}${asked.length > 5 ? ` and ${asked.length - 5} more` : ''} (fix the field each one is about and add a faq block where the answer is not obvious)` : '',
      nf.signals.length ? `act on the new signals (${nf.signals.slice(0, 3).join('; ')}): add up to 3 places like the musts, and none like the skips` : nf.musts.length ? `add up to 3 places like the new musts (${nf.musts.slice(0, 3).map((p) => p.id).join(', ')})` : '',
      nf.areaMusts.length ? `start on the areas the traveler chose (${nf.areaMusts.map((a) => a.id).join(', ')})` : '',
      nf.notes?.some((x) => x.text) ? `read the traveler's notes on ${list(nf.notes.filter((x) => x.text).slice(0, 5).map((x) => x.id))} (their reasons; act on them)` : '',
    ].filter(Boolean);
    feedback.push({ kind: 'feedback', task: `Process the new game feedback (./atr feedback --new): ${bits.length ? bits.join('; ') : 'read it and adjust what the traveler disliked'}. Then run ./atr feedback --mark-seen --upto ${nf.latest}.`, why: `${plural(fresh, 'feedback event')} ${nf.since ? `since ${nf.since.slice(0, 10)}` : 'never processed'}: ${plural(nf.counts.questions, 'question')}, ${nf.musts.length} new must, ${nf.skips.length} new skip, ${plural(nf.areaMusts.length, 'area must', 'area musts')}${nf.notes?.length ? `, ${plural(nf.notes.length, 'note')}` : ''}.` });
  }

  let all = [...urgent, ...reviewTasks, ...head, ...missingAreas, ...empty, ...stays, ...deficits.map(({ shortfall, ...t }) => t), ...repairs, ...feedback];
  if (opts.country) all = all.filter((t) => !t.country || t.country === opts.country);
  const count = opts.count ?? 5;
  const tasks = all.slice(0, count).map(({ key, ...t }, i) => ({ rank: i + 1, ...t }));
  return { tasks, total: all.length };
}

export function formatNext({ tasks, total }, c = { dim: (s) => s, bold: (s) => s, cyan: (s) => s }) {
  if (!tasks.length) return 'Nothing to do: no gaps, no open must-do items, no new feedback.';
  const L = [c.bold('# What to do next') + c.dim(`  (${tasks.length} of ${total}; run one with ./atr run "<task>", or the top N with ./atr run --auto N)`), ''];
  for (const t of tasks) {
    L.push(`${c.bold(String(t.rank).padStart(2) + '.')} ${c.cyan(`[${t.kind}${t.country ? ` · ${t.country}` : ''}]`)} ${t.task}`);
    L.push(c.dim(`    why: ${t.why}`), '');
  }
  return L.join('\n').trimEnd();
}
