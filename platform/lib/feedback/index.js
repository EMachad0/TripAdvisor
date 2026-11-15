// Feedback reader (JSONL, v1) + taste summary for the curator. See docs/FEEDBACK-FORMAT.md.
import fs from 'node:fs';
import path from 'node:path';
import { check, t } from '../schema/dsl.js';
import { CATEGORY_IDS, COUNTRY_IDS } from '../schema/enums.js';
import { ROUTE_STOPS_SPEC, currentRoute, latestRoutes, formatRoute } from '../route.js';

const ts = t.string({ desc: 'ISO 8601 timestamp', example: '2026-11-20T14:03:00Z', pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, patternHint: 'ISO 8601 like 2026-11-20T14:03:00Z' });
export const FEEDBACK_SPECS = {
  swipes: t.object({
    v: t.enum([1]), ts, session: t.string({ max: 80, example: 's-2026-11-20-a' }),
    round: t.enum(['area', 'place']),
    id: t.slug({ desc: 'Place or area id', example: 'yu-garden' }),
    verdict: t.enum(['must', 'maybe', 'skip']),
    country: t.opt(t.enum(COUNTRY_IDS)),
    ms: t.opt(t.int({ min: 0, desc: 'Time spent on the card' })),
  }),
  duels: t.object({
    v: t.enum([1]), ts, session: t.opt(t.string({ max: 80 })),
    winner: t.slug(), loser: t.slug(),
    country: t.opt(t.enum(COUNTRY_IDS)),
    elo: t.opt(t.object({ winner: t.number(), loser: t.number() })),
  }),
  questions: t.object({
    v: t.enum([1]), ts, session: t.opt(t.string({ max: 80 })),
    id: t.slug({ desc: 'Place id the question was about' }),
    question: t.string({ max: 2000 }),
    answer_summary: t.opt(t.string({ max: 2000 })),
  }),
  // The traveler's own note on a card. One editable note per (round, id): the latest line wins; "" clears it.
  notes: t.object({
    v: t.enum([1]), ts, session: t.opt(t.string({ max: 80 })),
    round: t.enum(['area', 'place']),
    id: t.slug({ desc: 'Place or area id', example: 'harbin' }),
    text: t.string({ max: 2000, allowEmpty: true, desc: 'The note; an empty string clears it', example: 'Must, but only if I go in January.' }),
    country: t.opt(t.enum(COUNTRY_IDS)),
  }),
  // The traveler's route inside one country leg (the Route tab): the whole ordered list of stops, every save.
  // The latest line per country wins; the seed is `route:` in config/trip.yaml. See platform/lib/route.js.
  route: t.object({
    v: t.enum([1]), ts, session: t.opt(t.string({ max: 80 })),
    country: t.enum(COUNTRY_IDS),
    stops: ROUTE_STOPS_SPEC,
  }),
};
export const FEEDBACK_KINDS = Object.keys(FEEDBACK_SPECS);

/** Read one JSONL file. Returns { events, warnings }. Bad lines are skipped with a warning. */
export function readJsonl(file, kind, { since } = {}) {
  const events = [], warnings = [];
  if (!fs.existsSync(file)) return { events, warnings };
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    let obj;
    try { obj = JSON.parse(line); } catch (e) { warnings.push(`${path.basename(file)}:${i + 1} not valid JSON (${e.message.split('\n')[0]}) — skipped`); return; }
    if (obj && typeof obj === 'object' && obj.v !== undefined && obj.v !== 1) { warnings.push(`${path.basename(file)}:${i + 1} unsupported version v=${obj.v} — skipped`); return; }
    const issues = check(FEEDBACK_SPECS[kind], obj).filter((x) => x.level === 'error');
    if (issues.length) { warnings.push(`${path.basename(file)}:${i + 1} ${issues.map((x) => `${x.path}: ${x.message}`).join('; ')} — skipped`); return; }
    if (since && obj.ts < since) return;
    events.push(obj);
  });
  return { events, warnings };
}

/** Read all feedback files in dir. */
export function readFeedback(dir, opts = {}) {
  const out = { swipes: [], duels: [], questions: [], notes: [], warnings: [] };
  for (const k of FEEDBACK_KINDS) {
    const { events, warnings } = readJsonl(path.join(dir, `${k}.jsonl`), k, opts);
    out[k] = events; out.warnings.push(...warnings);
  }
  return out;
}

/** Sort events oldest first; equal timestamps keep file order. */
const byTs = (xs = []) => xs.map((e, i) => [e, i]).sort((a, b) => String(a[0].ts).localeCompare(String(b[0].ts)) || a[1] - b[1]).map((x) => x[0]);

/**
 * The current note per card: Map "round:id" → the latest note event (latest wins, like swipes).
 * Cleared notes (text "") are dropped unless { keepCleared: true }.
 */
export function latestNotes(notes = [], { keepCleared = false } = {}) {
  const m = new Map();
  for (const n of byTs(notes)) m.set(`${n.round}:${n.id}`, n);
  if (!keepCleared) for (const [k, n] of m) if (!String(n.text).trim()) m.delete(k);
  return m;
}

/** Current notes with the card name and the traveler's latest verdict, newest first. */
export function currentNotes(fb, { places = [], areas = [] } = {}) {
  const names = new Map([...places.map((p) => [`place:${p.id}`, p.name]), ...areas.map((a) => [`area:${a.id}`, a.name])]);
  const verdict = new Map();
  for (const s of byTs(fb.swipes || [])) verdict.set(`${s.round}:${s.id}`, s.verdict);
  return [...latestNotes(fb.notes || []).entries()].map(([k, n]) => ({ round: n.round, id: n.id, name: names.get(k) || n.id, exists: names.has(k), verdict: verdict.get(k) || null, text: String(n.text).trim(), ts: n.ts }))
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
}

const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();
const noteLine = (n, c = { dim: (s) => s, bold: (s) => s }) => `  ${c.bold(n.name)} ${c.dim(`(${n.round === 'area' ? 'area ' : ''}${n.id}, ${n.verdict || 'not swiped'})`)}${n.exists === false ? c.dim(' (no such card any more)') : ''}\n    “${oneLine(n.text)}”`;

const VERDICT_SCORE = { must: 2, maybe: 0.5, skip: -1 };
const STOP = new Set('the a an is are to of in on for and or it this that what how do does can i my me with at be there any you from by as which when where should would like about'.split(' '));

/**
 * Taste summary. places/areas: loaded data (for categories, tags, costs).
 * cfg: trip config (for budgets). Returns a plain object; formatTaste() prints it.
 */
export function tasteSummary(fb, { places = [], areas = [], cfg } = {}) {
  const byId = new Map([...places.map((p) => [p.id, { ...p, _type: 'place' }]), ...areas.map((a) => [a.id, { ...a, _type: 'area' }])]);
  // latest verdict per (round,id) wins
  const latest = new Map();
  for (const s of [...fb.swipes].sort((a, b) => a.ts.localeCompare(b.ts))) latest.set(`${s.round}:${s.id}`, s);
  const swipes = [...latest.values()];
  const counts = { must: 0, maybe: 0, skip: 0 };
  for (const s of swipes) counts[s.verdict]++;

  const cat = {}, tag = {};
  const bump = (m, k, v) => { (m[k] ||= { score: 0, n: 0, must: 0, skip: 0 }); m[k].score += v; m[k].n++; };
  const score = new Map();
  const missing = new Set();
  for (const s of swipes) {
    const item = byId.get(s.id);
    if (!item) { missing.add(s.id); continue; }
    const v = VERDICT_SCORE[s.verdict];
    score.set(s.id, (score.get(s.id) || 0) + v * 10);
    const cats = item._type === 'place' ? [item.category] : (item.best_for || []);
    for (const c of cats) { bump(cat, c, v); if (s.verdict === 'must') cat[c].must++; if (s.verdict === 'skip') cat[c].skip++; }
    for (const tg of item.tags || []) bump(tag, tg, v);
  }
  // duels: simple Elo
  const elo = new Map();
  const wins = new Map();
  for (const d of [...fb.duels].sort((a, b) => a.ts.localeCompare(b.ts))) {
    for (const id of [d.winner, d.loser]) if (!byId.has(id)) missing.add(id);
    const rw = elo.get(d.winner) ?? 1500, rl = elo.get(d.loser) ?? 1500;
    const ew = 1 / (1 + 10 ** ((rl - rw) / 400));
    elo.set(d.winner, rw + 32 * (1 - ew)); elo.set(d.loser, rl - 32 * (1 - ew));
    wins.set(d.winner, (wins.get(d.winner) || 0) + 1);
    const w = byId.get(d.winner), l = byId.get(d.loser);
    if (w?.category) bump(cat, w.category, 0.5);
    if (l?.category) bump(cat, l.category, -0.25);
  }
  for (const [id, r] of elo) score.set(id, (score.get(id) || 0) + (r - 1500) / 4);

  const ranked = [...score.entries()].filter(([id]) => byId.has(id) && byId.get(id)._type === 'place').sort((a, b) => b[1] - a[1]);
  const fmt = ([id, s]) => ({ id, name: byId.get(id)?.name, category: byId.get(id)?.category, score: Math.round(s), elo: elo.has(id) ? Math.round(elo.get(id)) : undefined, brl: byId.get(id)?.cost?.brl });
  const affinity = (m) => Object.entries(m).map(([k, v]) => ({ key: k, score: Math.round((v.score / v.n) * 100) / 100, n: v.n, must: v.must, skip: v.skip })).sort((a, b) => b.score - a.score);

  // budget sensitivity: avg R$ share of daily budget for must vs skip
  const share = (verdict) => {
    const xs = swipes.filter((s) => s.verdict === verdict && s.round === 'place').map((s) => byId.get(s.id)).filter((p) => p?.cost?.brl !== undefined);
    if (!xs.length) return null;
    const vals = xs.map((p) => { const b = cfg?.countries?.find((c) => c.id === p.country)?.budget_brl_per_day; return b ? p.cost.brl / b : null; }).filter((x) => x !== null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) : null;
  };
  const mustShare = share('must'), skipShare = share('skip');
  const budgetHints = [];
  if (mustShare !== null && skipShare !== null) {
    if (skipShare > mustShare * 1.5 && skipShare > 30) budgetHints.push(`Skips cost more (avg ${skipShare}% of daily budget) than musts (${mustShare}%): looks price-sensitive — favour cheap/free options.`);
    else if (mustShare > skipShare * 1.5 && mustShare > 30) budgetHints.push(`Musts are pricier (avg ${mustShare}% of daily budget) than skips (${skipShare}%): willing to pay for the right thing.`);
    else budgetHints.push(`No clear price sensitivity (musts avg ${mustShare}%, skips ${skipShare}% of daily budget).`);
  }

  // questions: themes by keyword
  const words = {};
  const THEMES = { booking: /book|reserv|ticket|passport|queue/i, cost: /cost|price|cheap|expensive|r\$|budget|pay|cash|alipay|wechat/i, timing: /open|hour|close|when|time|crowd|busy|night|morning/i, food: /eat|food|vegetarian|vegan|spicy|menu|drink|beer|dish/i, access: /get there|metro|subway|taxi|bus|walk|far|transport/i, weather: /cold|snow|rain|weather|warm|winter|temperature/i, safety: /safe|scam|solo|danger/i, nightlife: /bar|club|party|nightlife|music|dj/i };
  const themes = {};
  for (const q of fb.questions) {
    if (!byId.has(q.id)) missing.add(q.id);
    for (const [k, re] of Object.entries(THEMES)) if (re.test(q.question)) themes[k] = (themes[k] || 0) + 1;
    for (const w of q.question.toLowerCase().match(/[a-zÀ-ɏ]{4,}/g) || []) if (!STOP.has(w)) words[w] = (words[w] || 0) + 1;
  }
  const perCountry = {};
  for (const s of swipes) {
    const c = s.country || byId.get(s.id)?.country; if (!c) continue;
    (perCountry[c] ||= { must: 0, maybe: 0, skip: 0 })[s.verdict]++;
  }
  const notes = currentNotes(fb, { places, areas });
  for (const n of notes) if (!n.exists) missing.add(n.id);
  return {
    totals: { swipes: fb.swipes.length, uniqueSwipes: swipes.length, duels: fb.duels.length, questions: fb.questions.length, notes: notes.length, ...counts },
    perCountry,
    categories: affinity(cat),
    tags: affinity(tag).filter((x) => x.n >= 2),
    top: ranked.slice(0, 8).map(fmt),
    bottom: ranked.slice(-5).reverse().filter(([, s]) => s < 0).map(fmt),
    budgetHints,
    questionThemes: Object.entries(themes).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ theme: k, n })),
    questionWords: Object.entries(words).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w, n]) => ({ word: w, n })),
    recentQuestions: fb.questions.slice(-5).map((q) => ({ id: q.id, question: q.question })),
    notes,
    // The route the traveler is building in the game (or the config seed): which cities, in which order, how many nights.
    route: cfg?.countries ? currentRoute({ cfg, areas, events: fb.route || [] }) : [],
    routeWarnings: cfg?.warnings || [],
    missingIds: [...missing].sort(),
    warnings: fb.warnings,
  };
}

export function formatTaste(s) {
  const L = [];
  L.push('# Traveler taste summary');
  L.push(`Swipes: ${s.totals.uniqueSwipes} unique (${s.totals.must} must · ${s.totals.maybe} maybe · ${s.totals.skip} skip) · Duels: ${s.totals.duels} · Questions: ${s.totals.questions}${s.totals.notes ? ` · Notes: ${s.totals.notes}` : ''}`);
  if (Object.keys(s.perCountry).length) L.push('Per country: ' + Object.entries(s.perCountry).map(([c, v]) => `${c} ${v.must}/${v.maybe}/${v.skip}`).join(' · ') + '  (must/maybe/skip)');
  L.push('\n## Category affinity (−1 skip … +2 must)');
  if (!s.categories.length) L.push('  (no data yet)');
  for (const c of s.categories) L.push(`  ${c.score >= 0.8 ? '▲' : c.score < 0 ? '▼' : '•'} ${c.key.padEnd(10)} ${String(c.score).padStart(5)}  (${c.n} signals, ${c.must} must, ${c.skip} skip)`);
  const liked = s.categories.filter((c) => c.score >= 0.8).map((c) => c.key);
  const disliked = s.categories.filter((c) => c.score < 0).map((c) => c.key);
  if (s.tags.length) { L.push('\n## Tag affinity (≥2 signals)'); for (const t of s.tags.slice(0, 12)) L.push(`  ${t.key.padEnd(18)} ${t.score}`); }
  if (s.top.length) { L.push('\n## Top places'); s.top.forEach((p, i) => L.push(`  ${i + 1}. ${p.name} (${p.id}, ${p.category}${p.elo ? `, elo ${p.elo}` : ''}${p.brl !== undefined ? `, R$${p.brl}` : ''})`)); }
  if (s.bottom.length) { L.push('\n## Least liked'); s.bottom.forEach((p) => L.push(`  - ${p.name} (${p.id}, ${p.category})`)); }
  if (s.budgetHints.length) { L.push('\n## Budget'); s.budgetHints.forEach((h) => L.push('  ' + h)); }
  if (s.questionThemes.length) { L.push('\n## Question themes'); L.push('  ' + s.questionThemes.map((q) => `${q.theme} ×${q.n}`).join(' · ')); }
  if (s.recentQuestions.length) { L.push('  Recent:'); s.recentQuestions.forEach((q) => L.push(`   - [${q.id}] ${q.question}`)); }
  if (s.notes?.length) { L.push(`\n## The traveler's notes (their own words; the reasoning behind a verdict)`); s.notes.forEach((n) => L.push(noteLine(n))); }
  if (s.route?.length) {
    L.push(`\n## Route (the order of cities the traveler is planning in the game's Route tab; cities not listed are not placed yet)`);
    L.push(formatRoute(s.route));
    for (const w of s.routeWarnings || []) L.push(`  ! ${w}`);
  }
  if (s.missingIds.length) L.push(`\n## Ids in feedback that do not exist\n  ${s.missingIds.join(', ')}  ← renamed or deleted? Consider adding them.`);
  L.push('\n## Suggestions for the curator');
  if (liked.length) L.push(`  - Add more ${liked.join(', ')} options, especially in countries with few of them.`);
  if (disliked.length) L.push(`  - Fewer ${disliked.join(', ')} picks unless they are exceptional.`);
  if (s.questionThemes[0]) L.push(`  - The traveler keeps asking about ${s.questionThemes[0].theme}: make that info prominent on pages.`);
  if (s.notes?.length) L.push(`  - Read the ${s.notes.length === 1 ? 'note' : `${s.notes.length} notes`} above: ${s.notes.length === 1 ? 'it says' : 'they say'} why, which a verdict alone does not.`);
  if (!liked.length && !disliked.length) L.push('  - Not enough signal yet; keep the mix balanced.');
  if (s.warnings.length) { L.push(`\n## Skipped feedback lines (${s.warnings.length})`); s.warnings.slice(0, 10).forEach((w) => L.push('  ! ' + w)); }
  return L.join('\n');
}

// ───────────────────────── what's new (cursor) ─────────────────────────
// The cursor lives in places/_feedback-seen.json ({ ts }): the curator's territory. It is NOT part of the
// feedback format; the game never reads or writes it.
import { dataRoots } from '../paths.js';

export const seenFile = (opts = {}) => path.join(dataRoots(opts).places, '_feedback-seen.json');
/** The cursor: ISO timestamp of the last event the curator has processed, or null. */
export function readSeen(opts = {}) {
  return readSeenState(opts).ts;
}
/** The whole cursor file: { ts: global cursor | null, places: { <place or area id>: ts } } (per-page cursors from --mark-seen --place). */
export function readSeenState(opts = {}) {
  try {
    const j = JSON.parse(fs.readFileSync(seenFile(opts), 'utf8'));
    const places = j?.places && typeof j.places === 'object' ? Object.fromEntries(Object.entries(j.places).filter(([, v]) => typeof v === 'string')) : {};
    return { ts: typeof j?.ts === 'string' ? j.ts : null, places, marked: j?.marked };
  } catch { return { ts: null, places: {} }; }
}
const allEvents = (fb) => [...(fb.swipes || []), ...(fb.duels || []), ...(fb.questions || []), ...(fb.notes || []), ...(fb.route || [])];
export const latestTs = (fb) => allEvents(fb).map((e) => String(e.ts)).sort().at(-1) || null;
/**
 * Move the cursor to `ts` (default: the newest event in the logs). Returns { file, ts } (ts null = nothing to mark).
 * opts.place: move only that page's cursor (default: its newest event), so one place's questions can be marked
 * done while other places' feedback stays new. A later global mark past it makes the per-page entry redundant.
 */
export function markSeen(fb, opts = {}) {
  const file = seenFile(opts);
  const st = readSeenState(opts);
  let out;
  if (opts.place) {
    const ts = opts.ts || allEvents(fb).filter((e) => e.id === opts.place || e.winner === opts.place || e.loser === opts.place).map((e) => String(e.ts)).sort().at(-1) || null;
    if (!ts) return { file, ts: null, place: opts.place };
    st.places[opts.place] = ts;
    out = { file, ts, place: opts.place };
  } else {
    const ts = opts.ts || latestTs(fb);
    if (!ts) return { file, ts: null };
    st.ts = ts;
    for (const [id, t] of Object.entries(st.places)) if (t <= ts) delete st.places[id];
    out = { file, ts };
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ts: st.ts, ...(Object.keys(st.places).length ? { places: st.places } : {}), marked: new Date().toISOString() }, null, 2) + '\n');
  return out;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : (w.endsWith('s') ? 'es' : 's')}`;
/** "3 musts in nightlife, all tagged club" for groups of 2+ new verdicts in one category. */
function signals(items, word) {
  const by = {};
  for (const p of items) if (p.category) (by[p.category] ||= []).push(p);
  return Object.entries(by).filter(([, ps]) => ps.length >= 2).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([cat, ps]) => {
    const shared = (ps[0].tags || []).filter((t) => ps.every((p) => (p.tags || []).includes(t)));
    return `${plural(ps.length, word)} in ${cat}${shared.length ? `, all tagged ${shared[0]}` : ''}`;
  });
}

const CITY_Q = /\b(how (do|can|should|to)( i| we)? (get|travel|go)( from [^?]*?)? to|how (far|long)( is it| does it take)?[^?]*\b(to|from)\b|get(ting)? (to|there) from|(train|flight|bus|ferry)s? (to|from)|from [a-z' -]+ to [a-z' -]+\?)/i;
/**
 * Is this a question about reaching the CITY rather than about the place? It then belongs on the area card.
 * Returns { city, area: id | null } or null. A question that names the place's own city (or just "there") counts.
 */
export function cityLevel(q, place, areas = []) {
  if (!place?.city || !CITY_Q.test(String(q.question || ''))) return null;
  const text = String(q.question).toLowerCase();
  const city = place.city;
  const names = [city.replace(/-/g, ' '), ...areas.filter((a) => a.country === place.country).flatMap((a) => [String(a.name || '').toLowerCase(), a.id.replace(/-/g, ' ')])].filter(Boolean);
  const placeWords = String(place.name || '').toLowerCase();
  if (!names.some((n) => text.includes(n)) || (placeWords && text.includes(placeWords))) return null;
  const area = areas.find((a) => a.country === place.country && (a.id === city || (a.cities || []).includes(city)));
  return { city, area: area?.id || null };
}

/**
 * Events after the cursor, grouped for action.
 * opts: { since?: ISO ts (default: the cursor), places, areas, fixtures/root }
 * Returns { since, latest, counts: { swipes, duels, questions }, questions: [{ id, name, exists, items: [{ ts, question, answer_summary }] }],
 *           musts, skips: [{ id, name, category, tags, ts }], areaMusts: [{ id, name, ts }], signals: [text] }
 */
export function newFeedback(fb, opts = {}) {
  const since = opts.since === undefined ? readSeen(opts) : opts.since;
  const perPlace = opts.since === undefined ? readSeenState(opts).places : {};
  const fresh = (e) => (!since || String(e.ts) > since) && (!perPlace[e.id] || String(e.ts) > perPlace[e.id]);
  const byId = new Map([...(opts.places || []).map((p) => [`place:${p.id}`, p]), ...(opts.areas || []).map((a) => [`area:${a.id}`, a])]);
  const qs = new Map();
  for (const q of (fb.questions || []).filter(fresh).sort((a, b) => String(a.ts).localeCompare(String(b.ts)))) {
    if (!qs.has(q.id)) qs.set(q.id, { id: q.id, name: byId.get(`place:${q.id}`)?.name || byId.get(`area:${q.id}`)?.name || q.id, exists: byId.has(`place:${q.id}`) || byId.has(`area:${q.id}`), items: [] });
    const cl = cityLevel(q, byId.get(`place:${q.id}`), opts.areas || []);
    qs.get(q.id).items.push({ ts: q.ts, question: q.question, answer_summary: q.answer_summary, ...(cl ? { city_level: cl } : {}) });
  }
  // the latest verdict per card wins; only cards whose latest verdict is new count
  const latest = new Map();
  for (const s of [...(fb.swipes || [])].sort((a, b) => String(a.ts).localeCompare(String(b.ts)))) latest.set(`${s.round}:${s.id}`, s);
  const news = [...latest.values()].filter(fresh);
  const item = (s) => { const x = byId.get(`${s.round}:${s.id}`); return { id: s.id, name: x?.name || s.id, category: x?.category, tags: x?.tags || [], ts: s.ts }; };
  const musts = news.filter((s) => s.round === 'place' && s.verdict === 'must').map(item);
  const skips = news.filter((s) => s.round === 'place' && s.verdict === 'skip').map(item);
  const areaMusts = news.filter((s) => s.round === 'area' && s.verdict === 'must').map(item).map(({ id, name, ts }) => ({ id, name, ts }));
  // notes: cards whose latest note line is new (a cleared note shows as cleared: the reasoning was withdrawn)
  const verdictOf = new Map([...latest.entries()].map(([k, s]) => [k, s.verdict]));
  const notes = [...latestNotes(fb.notes || [], { keepCleared: true }).entries()].filter(([, n]) => fresh(n))
    .map(([k, n]) => ({ round: n.round, id: n.id, name: byId.get(k)?.name || n.id, exists: byId.has(k), verdict: verdictOf.get(k) || null, text: String(n.text).trim(), ts: n.ts }));
  // route: countries whose latest route line is new, shown as they stand now
  const routeEvents = fb.route || [];
  const changed = [...latestRoutes(routeEvents).values()].filter((e) => !since || String(e.ts) > since).map((e) => e.country);
  const route = changed.length ? (opts.cfg?.countries ? currentRoute({ cfg: opts.cfg, areas: opts.areas || [], events: routeEvents }) : []).filter((r) => changed.includes(r.id)) : [];
  const routeCount = routeEvents.filter((e) => !since || String(e.ts) > since).length;
  return {
    since, latest: latestTs(fb),
    counts: { swipes: (fb.swipes || []).filter(fresh).length, duels: (fb.duels || []).filter(fresh).length, questions: (fb.questions || []).filter(fresh).length, notes: (fb.notes || []).filter(fresh).length, ...(routeCount ? { route: routeCount } : {}) },
    questions: [...qs.values()], musts, skips, areaMusts, notes, signals: [...signals(musts, 'must'), ...signals(skips, 'skip')],
    ...(changed.length ? { routeChanged: changed, route } : {}),
  };
}

export function formatNewFeedback(n, c = { dim: (s) => s, bold: (s) => s, yellow: (s) => s }) {
  const total = n.counts.swipes + n.counts.duels + n.counts.questions + (n.counts.notes || 0) + (n.counts.route || 0);
  const L = [c.bold('# New feedback') + c.dim(`  (${n.since ? `since ${n.since}` : 'nothing marked as seen yet: everything is new'})`)];
  if (!total) { L.push('  Nothing new.'); return L.join('\n'); }
  L.push(`  ${plural(n.counts.swipes, 'swipe')} · ${plural(n.counts.duels, 'duel')} · ${plural(n.counts.questions, 'question')}${n.counts.notes ? ` · ${plural(n.counts.notes, 'note')}` : ''}${n.counts.route ? ` · ${plural(n.counts.route, 'route edit')}` : ''}`);
  if (n.routeChanged?.length) {
    L.push('', c.bold('## Route changed') + c.dim('  (the traveler re-planned these legs in the Route tab; research the cities they placed first)'));
    L.push(n.route?.length ? formatRoute(n.route, c) : `  ${n.routeChanged.join(', ')}`);
  }
  if (n.questions.length) {
    L.push('', c.bold('## Questions to answer on the page') + c.dim('  (fix the field it is about; add a `faq` block item when the answer is not obvious from the page)'));
    for (const q of n.questions) {
      L.push(`  ${c.bold(q.id)}${q.exists ? '' : c.yellow(' (no such page any more)')}${c.dim(`  · done with this page only? ./atr feedback --mark-seen --place ${q.id}`)}`);
      for (const it of q.items) {
        L.push(`    ? ${it.question}`);
        if (it.answer_summary) L.push(c.dim(`      the game answered: ${it.answer_summary}`) + c.dim('  (if the page says otherwise, add a faq item with correction: true)'));
        if (it.city_level) L.push(c.yellow(`      city-level question: answer it on the area card${it.city_level.area ? ` \`${it.city_level.area}\` (getting_there / getting_around)` : `; no area card covers ${it.city_level.city} yet, so add one (./atr new area --name "${it.city_level.city.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')}" …)`}`));
      }
    }
  }
  if (n.notes?.length) {
    L.push('', c.bold("## The traveler's notes") + c.dim('  (their own words: why they made a call; use them to pick what to add or fix)'));
    for (const x of n.notes) L.push(x.text ? noteLine(x, c) : `  ${c.bold(x.name)} ${c.dim(`(${x.round === 'area' ? 'area ' : ''}${x.id})`)}  ${c.dim('note removed')}`);
  }
  const row = (title, list) => { if (list.length) L.push('', c.bold(title), ...list.map((p) => `  ${p.id}${p.category ? c.dim(`  ${p.category}${p.tags?.length ? ` · ${p.tags.join(', ')}` : ''}`) : ''}`)); };
  row('## Places swiped MUST', n.musts);
  row('## Places swiped SKIP', n.skips);
  row('## Areas swiped MUST', n.areaMusts);
  if (n.signals.length) L.push('', c.bold('## Signals'), ...n.signals.map((s) => '  ' + s));
  L.push('', c.dim(`When you have processed these: ./atr feedback --mark-seen${n.latest ? ` --upto ${n.latest}` : ''}`));
  return L.join('\n');
}

/** Everything the traveler did with one place or area: { id, verdicts, duels: { won, lost }, questions }. */
export function placeFeedback(fb, id) {
  return {
    id,
    verdicts: (fb.swipes || []).filter((s) => s.id === id).sort((a, b) => String(a.ts).localeCompare(String(b.ts))).map((s) => ({ ts: s.ts, round: s.round, verdict: s.verdict })),
    duels: { won: (fb.duels || []).filter((d) => d.winner === id).map((d) => ({ ts: d.ts, against: d.loser })), lost: (fb.duels || []).filter((d) => d.loser === id).map((d) => ({ ts: d.ts, against: d.winner })) },
    questions: (fb.questions || []).filter((q) => q.id === id).sort((a, b) => String(a.ts).localeCompare(String(b.ts))).map((q) => ({ ts: q.ts, question: q.question, answer_summary: q.answer_summary })),
    notes: byTs((fb.notes || []).filter((n) => n.id === id)).map((n) => ({ ts: n.ts, round: n.round, text: n.text })),
  };
}

export function formatPlaceFeedback(f, c = { dim: (s) => s, bold: (s) => s }) {
  const L = [c.bold(`# Feedback for ${f.id}`)];
  if (!f.verdicts.length && !f.questions.length && !f.duels.won.length && !f.duels.lost.length && !f.notes?.length) { L.push('  Nothing yet: the traveler has not swiped, duelled or asked about it.'); return L.join('\n'); }
  if (f.verdicts.length) L.push('', c.bold('## Verdicts') + c.dim('  (the latest one counts)'), ...f.verdicts.map((v) => `  ${String(v.ts).slice(0, 16).replace('T', ' ')}  ${v.verdict}${v.round === 'area' ? c.dim(' (area round)') : ''}`));
  if (f.duels.won.length || f.duels.lost.length) L.push('', c.bold('## Duels'), `  won ${f.duels.won.length}${f.duels.won.length ? ` (against ${[...new Set(f.duels.won.map((d) => d.against))].join(', ')})` : ''} · lost ${f.duels.lost.length}${f.duels.lost.length ? ` (to ${[...new Set(f.duels.lost.map((d) => d.against))].join(', ')})` : ''}`);
  const cur = [...latestNotes((f.notes || []).map((n) => ({ ...n, id: f.id })), { keepCleared: true }).values()];
  if (cur.length) L.push('', c.bold('## Note') + c.dim(`  (the traveler's own words; ${plural(f.notes.length, 'edit')})`), ...cur.map((n) => `  ${String(n.ts).slice(0, 16).replace('T', ' ')}  ${n.text.trim() ? `“${oneLine(n.text)}”` : c.dim('(cleared)')}${n.round === 'area' ? c.dim(' (area round)') : ''}`));
  if (f.questions.length) { L.push('', c.bold('## Questions')); for (const q of f.questions) { L.push(`  ${String(q.ts).slice(0, 10)}  ? ${q.question}`); if (q.answer_summary) L.push(c.dim(`              the game answered: ${q.answer_summary}`)); } }
  return L.join('\n');
}
