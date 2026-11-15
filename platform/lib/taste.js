// Stated taste (config/taste.yaml): what the traveler SAID they want.
// What they DO in the game lives in feedback/ (lib/feedback).
import fs from 'node:fs';
import { t, check, nearest, joinPath } from './schema/dsl.js';
import { ATTRACTION_CATEGORY_IDS, CATEGORY_IDS, COUNTRY_IDS, COUNTRIES, CATEGORIES } from './schema/enums.js';
import { readYaml } from './yamlio.js';
import { dataRoots } from './paths.js';
import { isStay } from './kinds.js';

const weight = (o = {}) => t.int({ min: 0, max: 3, desc: '0 = not interested … 3 = loves it.', example: 2, ...o });

export const tasteSpec = t.object({
  updated: t.opt(t.date({ example: '2026-11-10' })),
  goal: t.opt(t.enum(['discovery', 'balanced'], { desc: 'discovery = cover the icons, but a good share of every country should be places the traveler has not heard of.', example: 'discovery' })),
  interests: t.opt(t.object(Object.fromEntries(CATEGORY_IDS.map((k) => [k, t.opt(weight({ desc: `Interest in ${CATEGORIES[k].label} (${CATEGORIES[k].desc}), 0–3.` }))])), { desc: 'Interest per place category, 0–3. Drives the category targets in `atr gaps` / `atr next`.' })),
  tags: t.opt(t.array(t.object({
    tag: t.slug({ desc: 'A place tag.', example: 'museum' }),
    weight: weight(),
    note: t.opt(t.string({ max: 300, example: 'Only a must-go museum is worth a card.' })),
  }), { desc: 'Finer signals by tag; overrides the category weight for places with that tag.' })),
  stay: t.opt(t.object({
    wanted: t.boolean({ desc: 'Are stay cards (category `stay`) wanted?', example: true }),
    per_city: t.opt(t.int({ min: 0, max: 6, desc: 'Stay cards wanted per city that has attractions.', example: 2 })),
    note: t.opt(t.string({ max: 400 })),
  })),
  nightlife: t.opt(t.string({ max: 400 })),
  budget: t.opt(t.string({ max: 400 })),
  must_do: t.opt(t.array(t.object({
    key: t.slug({ desc: 'What a place or area claims with `must_do: <key>`.', example: 'great-wall' }),
    said: t.string({ max: 200, desc: "The traveler's exact words.", example: 'great wall of china' }),
    hint: t.opt(t.string({ max: 400, desc: "The orchestrator's guess at what is meant. Verify it.", example: 'Pick the section that suits a solo winter traveler.' })),
    country: t.opt(t.enum(COUNTRY_IDS, { example: 'china' })),
    city: t.opt(t.slug({ example: 'beijing' })),
    type: t.opt(t.enum(['place', 'area', 'stay'], { desc: 'What covers it: a place page (default), an area card, or a stay card (category stay).', example: 'place' })),
    want: t.opt(t.int({ min: 1, max: 10, desc: 'How many places/areas must claim the key before it counts as covered (default 1).', example: 3 })),
  }), { desc: 'Things the traveler asked for by name.' })),
}, { desc: 'Stated taste: config/taste.yaml.' });

/**
 * Read + check the taste file. Returns { file, exists, taste, issues }.
 * `taste` is null when the file is missing, unparsable or has schema errors.
 */
export function readTaste(opts = {}) {
  const file = dataRoots(opts).taste;
  if (!fs.existsSync(file)) return { file, exists: false, taste: null, issues: [] };
  const { data, parseErrors, lineOf } = readYaml(file);
  if (parseErrors.length) return { file, exists: true, taste: null, issues: parseErrors };
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { file, exists: true, taste: null, issues: [{ level: 'error', path: '(root)', pathArr: [], message: 'file is empty or not a YAML mapping', expected: 'a YAML object with goal, interests, tags, stay, must_do', example: 'goal: discovery' }] };
  }
  const issues = check(tasteSpec, data, []);
  const seen = new Map();
  (Array.isArray(data.must_do) ? data.must_do : []).forEach((m, i) => {
    if (!m?.key) return;
    if (seen.has(m.key)) issues.push({ level: 'error', path: joinPath(['must_do', i, 'key']), pathArr: ['must_do', i, 'key'], message: `must_do key "${m.key}" is used twice (also at must_do[${seen.get(m.key)}])`, expected: 'a unique key per must-do item', example: `${m.key}-2` });
    else seen.set(m.key, i);
  });
  for (const i of issues) if (i.pathArr) i.line = lineOf(i.pathArr);
  const bad = issues.some((i) => i.level === 'error');
  return { file, exists: true, taste: bad ? null : data, issues };
}

/** The stated taste, or null when there is none (missing file) or it is malformed (see `./atr taste`). */
export function loadTaste(opts = {}) {
  return readTaste(opts).taste;
}

export const mustDoKeys = (taste) => (taste?.must_do || []).map((m) => m.key);

/** Issue for a `must_do` value that is not a key in the taste file (or null). keys: string[] | null (no taste file). */
export function mustDoIssue(value, keys) {
  if (value === undefined || value === null || typeof value !== 'string') return null;
  const base = { path: 'must_do', pathArr: ['must_do'] };
  if (!keys) return { ...base, level: 'warning', message: `must_do "${value}" cannot be checked: there is no config/taste.yaml`, expected: 'a key from the must_do list in config/taste.yaml (run `./atr taste`)' };
  if (keys.includes(value)) return null;
  const near = nearest(value, keys);
  return { ...base, level: 'error', message: `"${value}" is not on the traveler's must-do list${near ? `. Did you mean "${near}"?` : ''}`, expected: `one of the must_do keys in config/taste.yaml: ${keys.join(', ') || '(none)'}`, example: near || keys[0], hint: 'run `./atr taste` to see the list with the traveler\'s words; delete the line if this place is not on it' };
}

/**
 * Must-do list with status.
 * Returns [{ key, said, hint, country, city, want, claims: [{id, type}], have, covered }]
 */
export function mustDoStatus(taste, places = [], areas = []) {
  return (taste?.must_do || []).map((m) => {
    // With an explicit `type` only that kind of page covers the item; without one any claim does.
    const claims = [
      ...places.filter((p) => p.must_do === m.key && (!m.type || (m.type === 'stay' ? isStay(p) : m.type === 'place'))).map((p) => ({ id: p.id, type: isStay(p) ? 'stay' : 'place', ...(p.must_do_note ? { note: p.must_do_note } : {}) })),
      ...areas.filter((a) => a.must_do === m.key && (!m.type || m.type === 'area')).map((a) => ({ id: a.id, type: 'area', ...(a.must_do_note ? { note: a.must_do_note } : {}) })),
    ];
    const want = m.want ?? 1;
    return { key: m.key, said: m.said, hint: m.hint, country: m.country, city: m.city, type: m.type || 'place', want, claims, have: claims.length, covered: claims.length >= want };
  });
}

/** Interest weights for attraction categories ({cat: 0–3}); null when the taste has none. */
export function interestWeights(taste) {
  if (!taste?.interests) return null;
  return Object.fromEntries(ATTRACTION_CATEGORY_IDS.map((k) => [k, taste.interests[k] ?? 0]));
}

/** Target share per attraction category = weight / sum of weights. */
export function categoryTargets(taste) {
  const w = interestWeights(taste);
  if (!w) return null;
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  if (!sum) return null;
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / sum]));
}

/** Tag entries of the taste that match a place's tags. */
export function tagSignals(place, taste) {
  const tags = new Set(place?.tags || []);
  return (taste?.tags || []).filter((x) => tags.has(x.tag));
}

/** Stated interest in one place, 0–3: a matching tag weight overrides the category weight (lowest tag wins). */
export function statedWeight(place, taste) {
  if (!taste || isStay(place)) return null;
  const sig = tagSignals(place, taste);
  if (sig.length) return Math.min(...sig.map((s) => s.weight));
  return taste.interests?.[place.category] ?? null;
}

/**
 * Where stated interest and observed affinity (feedback) clearly disagree.
 * summary: tasteSummary() output. Returns [{ category, stated, observed, n, message }].
 */
export function tasteDisagreements(taste, summary, { minSignals = 3 } = {}) {
  const out = [];
  for (const c of summary?.categories || []) {
    const stated = taste?.interests?.[c.key];
    if (stated === undefined || c.n < minSignals) continue;
    const label = CATEGORIES[c.key]?.label || c.key;
    if (stated >= 3 && c.score < 0) out.push({ category: c.key, stated, observed: c.score, n: c.n, message: `${label}: said ${stated}/3 but skips it in the game (affinity ${c.score} over ${c.n} signals). Check whether the picks are weak before adding more.` });
    else if (stated <= 1 && c.score >= 1) out.push({ category: c.key, stated, observed: c.score, n: c.n, message: `${label}: said ${stated}/3 but keeps liking it in the game (affinity ${c.score} over ${c.n} signals). Worth a few more.` });
  }
  return out;
}

const bar = (w) => '█'.repeat(w) + '░'.repeat(3 - w);
const where = (m) => [m.city ? m.city.split('-').map((x) => x[0].toUpperCase() + x.slice(1)).join(' ') : '', m.country ? (COUNTRIES[m.country]?.name || m.country) : 'any country'].filter(Boolean).join(', ');

/**
 * Text for `./atr taste`. data: { taste, mustDo, summary?, disagreements? }
 */
export function formatStatedTaste({ taste, mustDo, summary, disagreements = [] }, c = { red: (s) => s, green: (s) => s, yellow: (s) => s, dim: (s) => s, bold: (s) => s }) {
  const L = [c.bold('# What the traveler said') + c.dim(`  (config/taste.yaml${taste.updated ? `, ${String(taste.updated).slice(0, 10)}` : ''})`)];
  if (taste.goal) L.push(`Goal: ${c.bold(taste.goal)}${taste.goal === 'discovery' ? ' — cover the icons, but a good share of every country should be places they have not heard of (fame: hidden).' : ''}`);
  if (taste.interests) {
    L.push('', c.bold('## Interests') + c.dim('  (0 = not interested … 3 = loves it; a soft signal)'));
    const rows = Object.entries(taste.interests).sort((a, b) => b[1] - a[1] || CATEGORY_IDS.indexOf(a[0]) - CATEGORY_IDS.indexOf(b[0]));
    for (const [k, w] of rows) L.push(`  ${k.padEnd(10)} ${bar(w)} ${w}  ${c.dim(CATEGORIES[k]?.desc || '')}`);
  }
  if (taste.tags?.length) {
    L.push('', c.bold('## Tags') + c.dim('  (override the category for places with that tag)'));
    for (const x of [...taste.tags].sort((a, b) => b.weight - a.weight)) L.push(`  ${x.tag.padEnd(14)} ${bar(x.weight)} ${x.weight}${x.note ? `  ${c.dim(x.note)}` : ''}`);
  }
  const notes = [
    taste.stay ? `Stay: ${taste.stay.wanted ? `stay cards wanted${taste.stay.per_city ? `, ${taste.stay.per_city} per city` : ''}` : 'no stay cards'}${taste.stay.note ? `. ${taste.stay.note}` : ''}` : '',
    taste.nightlife ? `Nightlife: ${taste.nightlife}` : '',
    taste.budget ? `Budget: ${taste.budget}` : '',
  ].filter(Boolean);
  if (notes.length) L.push('', c.bold('## Notes'), ...notes.map((n) => '  ' + n));
  if (mustDo.length) {
    const open = mustDo.filter((m) => !m.covered).length;
    L.push('', c.bold(`## Must-do list`) + c.dim(`  (${mustDo.length - open} covered, ${open} open; claim one with \`must_do: <key>\` on a place or area)`));
    for (const m of mustDo) {
      const ids = m.claims.map((x) => (x.type === 'area' ? `area ${x.id}` : x.id)).join(', ');
      const count = m.want > 1 ? ` ${m.have}/${m.want}` : '';
      const status = m.covered ? c.green(`✔ covered${count} by ${ids}`) : c.red(`✗ open${count}`) + (ids ? c.dim(` (so far: ${ids})`) : '');
      L.push(`  ${c.bold(m.key.padEnd(20))} ${status}`);
      L.push(`      said: "${m.said}" · ${where(m)}${m.type === 'area' ? ' · wants an area card' : m.type === 'stay' ? ' · wants a stay card' : ''}`);
      for (const x of m.claims.filter((y) => y.note)) L.push(`      note (${x.id}): ${x.note}`);
      if (m.hint) L.push(c.dim(`      hint: ${m.hint}`));
    }
  }
  L.push('', c.bold('# What the game logged so far'));
  const t = summary?.totals;
  if (!t || !(t.uniqueSwipes || t.duels || t.questions)) L.push('  Nothing yet: the traveler has not played. Go by the stated taste above.');
  else {
    L.push(`  Swipes: ${t.uniqueSwipes} (${t.must} must · ${t.maybe} maybe · ${t.skip} skip) · Duels: ${t.duels} · Questions: ${t.questions}`);
    const liked = summary.categories.filter((x) => x.score >= 0.8).map((x) => `${x.key} (${x.score})`);
    const disliked = summary.categories.filter((x) => x.score < 0).map((x) => `${x.key} (${x.score})`);
    if (liked.length) L.push(`  Liked: ${liked.slice(0, 4).join(', ')}`);
    if (disliked.length) L.push(`  Disliked: ${disliked.slice(0, 4).join(', ')}`);
    for (const d of disagreements) L.push(c.yellow(`  ▲ ${d.message}`));
  }
  L.push(c.dim('  Details: ./atr feedback'));
  return L.join('\n');
}
