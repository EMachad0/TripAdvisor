// Round 5: stated taste, must_do / fame, stay cards, taste-aware gaps, `atr next`, runner attribution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { ROOT, FIXTURES } from '../lib/paths.js';
import * as api from '../lib/index.js';
import { validatePlace, validateArea, validateAll } from '../lib/validate.js';
import { readTaste, loadTaste, mustDoStatus, tasteDisagreements, formatStatedTaste, statedWeight } from '../lib/taste.js';
import { gapReport, formatGaps } from '../lib/gaps.js';
import { nextTasks, formatNext, pickCategories } from '../lib/next.js';
import { renderPlacePage, renderPlaceCard, renderAreaCard } from '../lib/render/index.js';
import { placeTemplate } from '../lib/scaffold.js';
import { toJsonSchema } from '../lib/schema/dsl.js';
import { placeSpec, areaSpec } from '../lib/schema/specs.js';
import { ALLOWED_TOOLS, DISALLOWED_TOOLS, sessionWrites, attributeChanges, commandTouches, contentChanges, describeContent, runAuto } from '../lib/runner.js';
import { fixturePlace, fixtureCredits, fixtureMedia, tmpDir } from './helpers.js';

const atr = (args, env = {}) => spawnSync(path.join(ROOT, 'atr'), args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ATR_OFFLINE: '1', ...env } });
const errors = (issues) => issues.filter((i) => i.level === 'error');
const warnings = (issues) => issues.filter((i) => i.level === 'warning');
const HOSTEL = path.join(FIXTURES, 'places/china/shanghai/bund-rooftop-hostel');
const hostel = () => parse(fs.readFileSync(path.join(HOSTEL, 'place.yaml'), 'utf8'));
const hostelCtx = () => ({ credits: [], mediaFiles: [], fixtureMode: true, now: '2026-11-10', mustDoKeys: ['social-hostel', 'great-wall'] });
const yuCtx = (extra = {}) => ({ credits: fixtureCredits(), mediaFiles: fixtureMedia(), fixtureMode: true, now: '2026-11-10', knownIds: new Set(['yu-garden', 'nanxiang-mantou-dian']), ...extra });

const TASTE = {
  goal: 'discovery',
  interests: { culture: 2, food: 3, nightlife: 2, nature: 2, 'odd-local': 2, views: 3, shopping: 1, shows: 2, 'day-trip': 1 },
  tags: [{ tag: 'museum', weight: 0, note: 'Only a must-go museum.' }, { tag: 'esports', weight: 3 }],
  stay: { wanted: true, per_city: 2, note: 'Social hostels.' },
  must_do: [
    { key: 'great-wall', said: 'great wall of china', hint: 'Pick the section that suits a solo winter traveler.', country: 'china', city: 'beijing' },
    { key: 'china-clubs', said: 'china famous clubs', hint: 'The famous clubs.', country: 'china', want: 3 },
    { key: 'shibuya', said: 'shibuya', hint: 'Shibuya crossing.', country: 'japan', city: 'tokyo' },
    { key: 'gaming-cafe', said: 'interesting gaming cafe if any' },
    { key: 't1', said: 'some t1 related stuff', country: 'korea', city: 'seoul' },
  ],
};
const CONFIG = {
  countries: [
    { id: 'china', days: 27, budget_brl_per_day: 170, cities: ['shanghai'], areas_wanted: 8 },
    { id: 'korea', days: 8, budget_brl_per_day: 140, cities: ['seoul'] },
    { id: 'japan', days: 9, budget_brl_per_day: 170, cities: [] },
  ],
  gaps: {},
};
let seq = 0;
/** A complete-enough place for the gap report (no per-page gaps unless asked for). */
const mk = (o = {}) => ({
  id: `p${++seq}`, name: 'P', name_local: '地', country: 'china', city: 'shanghai', category: 'culture', kind: 'See', fame: 'popular',
  cost: { local: 10, currency: 'CNY', brl: 8 }, book_ahead: { required: false }, hours: { summary: 'x', winter: 'x' }, location: { address_local: '地' },
  sources: [{ url: 'https://a.example/1', checked: '2026-11-09' }, { url: 'https://b.example/2', checked: '2026-11-09' }], confidence: 'high', last_updated: '2026-11-09',
  blocks: [{ type: 'hero' }, { type: 'highlights' }, { type: 'map' }, { type: 'tips' }, { type: 'weather' }, { type: 'menu' }], ...o,
});
const mkStay = (o = {}) => mk({ category: 'stay', kind: 'Stay', fame: undefined, blocks: [{ type: 'hero' }, { type: 'stay' }, { type: 'highlights' }, { type: 'map' }, { type: 'tips' }], ...o });
const gaps = (places, extra = {}) => gapReport({ config: CONFIG, taste: TASTE, places, areas: [], now: '2026-11-10', ...extra });
const NO_FB = { swipes: [], duels: [], questions: [], warnings: [] };
const next = (places, extra = {}) => nextTasks({ config: CONFIG, taste: TASTE, places, areas: [], now: '2026-11-10', validation: { results: [] }, feedback: NO_FB, seen: null, linkCache: {}, reviews: new Map(), count: 50, ...extra });

// ───────────────────────── taste file ─────────────────────────
test('taste: the fixture taste loads; a missing file means no stated taste', () => {
  const t = loadTaste({ fixtures: true });
  assert.equal(t.goal, 'discovery');
  assert.equal(t.interests.food, 3);
  assert.ok(t.must_do.some((m) => m.key === 'classical-garden'));
  const none = readTaste({ tasteFile: path.join(tmpDir(), 'nope.yaml') });
  assert.deepEqual([none.exists, none.taste, none.issues.length], [false, null, 0]);
  // everything still works without it
  const r = gapReport({ config: CONFIG, taste: null, places: [mk()], areas: [], now: '2026-11-10' });
  assert.ok(r.items.some((i) => i.kind === 'balance' && /no food/.test(i.message)), 'flat balance rule without taste');
  assert.equal(r.mustDo.length, 0);
});

test('taste: the real config/taste.yaml is valid', () => {
  const rt = readTaste({ fixtures: false });
  if (!rt.exists) return;
  assert.deepEqual(errors(rt.issues).map((i) => `${i.path}: ${i.message}`), []);
});

test('taste: a malformed file gives fix-it errors with did-you-mean, and validate --all shows them', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'taste.yaml');
  fs.writeFileSync(file, 'goal: discovry\nintrests: { food: 3 }\ninterests: { food: 5 }\nmust_do:\n  - { key: a, said: x }\n  - { key: a, said: y }\n');
  const rt = readTaste({ tasteFile: file });
  assert.equal(rt.taste, null);
  const by = Object.fromEntries(rt.issues.map((i) => [i.path, i]));
  assert.match(by.goal.message, /Did you mean "discovery"/);
  assert.match(by.intrests.message, /Did you mean `interests`/);
  assert.match(by['interests.food'].message, /above the maximum 3/);
  assert.match(by['must_do[1].key'].message, /used twice/);
  assert.ok(by.goal.line >= 1, 'line numbers');
  const cli = atr(['taste'], { ATR_TASTE_FILE: file });
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /malformed/);
  assert.match(cli.stdout, /Did you mean "discovery"/);
  const v = atr(['validate', '--all', '--fixtures'], { ATR_TASTE_FILE: file });
  assert.equal(v.status, 1);
  assert.match(v.stdout, /taste\.yaml/);
});

test('taste: must-do status counts claims and honours want', () => {
  const st = mustDoStatus(TASTE, [mk({ id: 'club-a', must_do: 'china-clubs' }), mk({ id: 'wall', must_do: 'great-wall' })], [{ id: 'tokyo', must_do: 'shibuya' }]);
  const by = Object.fromEntries(st.map((m) => [m.key, m]));
  assert.deepEqual([by['great-wall'].covered, by['great-wall'].claims[0].id], [true, 'wall']);
  assert.deepEqual([by['china-clubs'].covered, by['china-clubs'].have, by['china-clubs'].want], [false, 1, 3]);
  assert.deepEqual(by.shibuya.claims, [{ id: 'tokyo', type: 'area' }]);
  assert.equal(by.t1.covered, false);
  const text = formatStatedTaste({ taste: TASTE, mustDo: st, summary: { totals: {}, categories: [] } });
  assert.match(text, /great-wall\s+✔ covered by wall/);
  assert.match(text, /china-clubs\s+✗ open 1\/3/);
  assert.match(text, /said: "great wall of china" · Beijing, China/);
  assert.match(text, /food\s+███ 3/);
  assert.match(text, /Nothing yet/);
});

test('taste: stated vs observed disagreement is one line per category, only with enough signals', () => {
  const summary = { totals: { uniqueSwipes: 9, must: 1, maybe: 0, skip: 8, duels: 0, questions: 0 }, categories: [{ key: 'food', score: -0.6, n: 5 }, { key: 'shopping', score: 1.6, n: 4 }, { key: 'views', score: -1, n: 1 }] };
  const d = tasteDisagreements(TASTE, summary);
  assert.deepEqual(d.map((x) => x.category), ['food', 'shopping']);
  assert.match(formatStatedTaste({ taste: TASTE, mustDo: [], summary, disagreements: d }), /▲ Food: said 3\/3 but skips it/);
  assert.equal(statedWeight(mk({ category: 'culture', tags: ['museum'] }), TASTE), 0);
  assert.equal(statedWeight(mk({ category: 'shows', tags: ['esports'] }), TASTE), 3);
});

test('cli: atr taste prints the must-do list with status (text and JSON)', () => {
  const r = atr(['taste', '--fixtures']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /What the traveler said/);
  assert.match(r.stdout, /classical-garden\s+✔ covered by yu-garden/);
  assert.match(r.stdout, /ice-festival\s+✔ covered by area harbin/);
  assert.match(r.stdout, /china-clubs\s+✗ open 0\/2/);
  assert.match(r.stdout, /What the game logged so far/);
  assert.match(r.stdout, /\.\/atr feedback/);
  const j = JSON.parse(atr(['taste', '--fixtures', '--json']).stdout);
  assert.equal(j.mustDo.find((m) => m.key === 'capsule-hotel').covered, false);
  assert.equal(j.taste.goal, 'discovery');
});

// ───────────────────────── must_do / fame ─────────────────────────
test('must_do: unknown key is an error with did-you-mean and the list of keys', () => {
  const p = fixturePlace();
  p.must_do = 'great-wal';
  const i = errors(validatePlace(p, yuCtx({ mustDoKeys: ['great-wall', 'shibuya'] }))).find((x) => x.path === 'must_do');
  assert.match(i.message, /Did you mean "great-wall"/);
  assert.match(i.expected, /great-wall, shibuya/);
  assert.equal(i.example, 'great-wall');
  p.must_do = 'shibuya';
  assert.deepEqual(errors(validatePlace(p, yuCtx({ mustDoKeys: ['great-wall', 'shibuya'] }))), []);
  // no taste file: cannot check → warning, not error
  const w = validatePlace(p, yuCtx({ mustDoKeys: null })).find((x) => x.path === 'must_do');
  assert.equal(w.level, 'warning');
  // areas too
  const a = parse(fs.readFileSync(path.join(FIXTURES, 'areas/china/harbin.yaml'), 'utf8'));
  a.must_do = 'ice-fest';
  const ai = validateArea(a, { fixtureMode: true, now: '2026-11-10', mustDoKeys: ['ice-festival'], credits: [{ file: 'snow-sculpture' }], mediaFiles: ['snow-sculpture-640.webp'] }).find((x) => x.path === 'must_do');
  assert.match(ai.message, /Did you mean "ice-festival"/);
});

test('fame: optional enum with did-you-mean; both fields are in the JSON Schema and field docs', () => {
  const p = fixturePlace();
  delete p.fame;
  assert.deepEqual(errors(validatePlace(p, yuCtx())), [], 'places without fame stay valid');
  p.fame = 'hiden';
  assert.match(errors(validatePlace(p, yuCtx())).find((x) => x.path === 'fame').message, /Did you mean "hidden"/);
  const js = toJsonSchema(placeSpec);
  assert.deepEqual(js.properties.fame.enum, ['iconic', 'popular', 'hidden']);
  assert.ok(js.properties.must_do && toJsonSchema(areaSpec).properties.must_do);
  assert.ok(!js.required.includes('fame') && !js.required.includes('must_do'));
  assert.ok(js.properties.category.enum.includes('stay'));
  const exported = JSON.parse(fs.readFileSync(path.join(ROOT, 'platform/schema/place.schema.json'), 'utf8'));
  assert.ok(exported.properties.fame && exported.properties.must_do, 'run ./atr schema --export');
  assert.ok(exported.properties.blocks.items.oneOf.some((b) => b.title === 'stay'), 'stay block exported');
  const docs = atr(['blocks', '--fields', 'place']).stdout;
  assert.match(docs, /fame\?/);
  assert.match(docs, /must_do\?/);
});

test('chips: "On your list", "Hidden gem", "Icon" on card, hero and area card; popular shows none', () => {
  const p = fixturePlace();
  const card = renderPlaceCard(p, { credits: fixtureCredits() });
  assert.match(card, /chip--must[^>]*>.*On your list/);
  assert.match(card, /chip--iconic[^>]*>.*Icon</);
  const page = renderPlacePage(p, { credits: fixtureCredits() });
  assert.match(page, /<li class="chip chip--flag chip--must"/);
  assert.match(page, /<li class="chip chip--flag chip--iconic"/);
  assert.match(renderPlaceCard({ ...p, fame: 'hidden', must_do: undefined }, { credits: fixtureCredits() }), /Hidden gem/);
  const plain = renderPlaceCard({ ...p, fame: 'popular', must_do: undefined }, { credits: fixtureCredits() });
  assert.doesNotMatch(plain, /chip--flag/);
  assert.doesNotMatch(plain, /atr-card__flags/);
  const area = parse(fs.readFileSync(path.join(FIXTURES, 'areas/china/harbin.yaml'), 'utf8'));
  assert.match(renderAreaCard(area), /area-card__flags.*On your list/);
  assert.doesNotMatch(renderAreaCard({ ...area, must_do: undefined }), /area-card__flags/);
});

// ───────────────────────── stay ─────────────────────────
test('stay: category stay ⇔ kind Stay (error with fix-it when only one is set)', () => {
  const p = hostel();
  assert.deepEqual(errors(validatePlace(p, hostelCtx())), []);
  p.kind = 'Do';
  const a = errors(validatePlace(p, hostelCtx())).find((x) => x.path === 'kind');
  assert.match(a.message, /category is stay but kind is "Do"/);
  assert.equal(a.example, 'Stay');
  const q = hostel();
  q.category = 'nightlife';
  const b = errors(validatePlace(q, hostelCtx())).find((x) => x.path === 'category');
  assert.match(b.message, /kind is Stay but category is "nightlife"/);
  assert.equal(b.example, 'stay');
});

test('stay: bed prices are checked against fx; warnings for a missing block and beds[0] ≠ cost', () => {
  const p = hostel();
  const stayI = p.blocks.findIndex((b) => b.type === 'stay');
  p.blocks[stayI].beds[1].brl = 20;
  const w = warnings(validatePlace(p, hostelCtx()));
  assert.ok(w.some((x) => x.path === `blocks[${stayI}].beds[1].brl` && /does not match local 85 × fx.rate/.test(x.message)));
  const q = hostel();
  q.cost.local = 70; q.cost.brl = 57.87;
  assert.ok(warnings(validatePlace(q, hostelCtx())).some((x) => /beds\[0\] costs 60 but cost.local is 70/.test(x.message)));
  const r = hostel();
  r.blocks[stayI].beds.reverse();
  assert.ok(warnings(validatePlace(r, hostelCtx())).some((x) => /not cheapest first/.test(x.message)));
  const s = hostel();
  s.blocks.splice(stayI, 1);
  assert.ok(warnings(validatePlace(s, hostelCtx())).some((x) => /stay place without a `stay` block/.test(x.message)));
  const t = hostel();
  t.blocks[stayI].rating.score = 11;
  assert.ok(errors(validatePlace(t, hostelCtx())).some((x) => /higher than out_of/.test(x.message)));
  t.blocks[stayI].style = 'hostle';
  assert.match(errors(validatePlace(t, hostelCtx())).find((x) => x.path === `blocks[${stayI}].style`).message, /Did you mean "hostel"/);
  // stays need no time_needed / best_time; attractions still do
  assert.ok(!validatePlace(hostel(), hostelCtx()).some((x) => /time_needed/.test(x.path)));
  const yu = fixturePlace();
  delete yu.blocks.find((b) => b.type === 'quick_facts').time_needed;
  assert.ok(errors(validatePlace(yu, yuCtx())).some((x) => /time_needed/.test(x.path) && /missing required field/.test(x.message)));
});

test('stay: card, quick facts and cost block say "/ night"; no budget share, no meal comparison', () => {
  const p = hostel();
  const credits = hostelCtx().credits;
  const card = renderPlaceCard(p, { credits });
  assert.match(card, /atr-card--stay/);
  assert.match(card, /data-cat="stay"/);
  assert.match(card, /R\$ 50 <small class="per">\/ night<\/small>/);
  assert.match(card, /On your list/);
  const page = renderPlacePage(p, { credits, budgetPerDay: 170, cheapMealBrl: 21 });
  assert.match(page, /Cheapest bed/);
  assert.match(page, /¥60 \/ night · beds are budgeted separately/);
  assert.match(page, /What a night costs/);
  assert.match(page, /Total \/ night/);
  assert.doesNotMatch(page, /% of daily budget/);
  assert.doesNotMatch(page, /of your R\$/);
  assert.doesNotMatch(page, /cheap local meal/);
  // the panel
  assert.match(page, /data-block="stay"/);
  assert.match(page, /class="stay__score"><b>9\.1<\/b><span>\/ 10<\/span>/);
  assert.match(page, /Hostelworld · 2,300 reviews/);
  assert.match(page, /8-bed mixed dorm/);
  assert.match(page, /Meeting people/);
  assert.match(page, /<strong>Rooftop bar<\/strong>/);
  assert.match(page, /Good to know/);
});

test('stay: isStay, countsAgainstBudget, bookAheadList and the category are exported for the game', () => {
  const p = hostel();
  assert.equal(api.isStay(p), true);
  assert.equal(api.isStay(fixturePlace()), false);
  assert.equal(api.isAttraction(fixturePlace()), true);
  assert.equal(api.countsAgainstBudget(p), false);
  assert.equal(api.countsAgainstBudget({ ...p, counts_against_budget: true }), true);
  assert.equal(api.countsAgainstBudget(fixturePlace()), true);
  assert.equal(api.CATEGORIES.stay.label, 'Stay');
  assert.ok(!api.ATTRACTION_CATEGORY_IDS.includes('stay'));
  const list = api.bookAheadList([p, fixturePlace()]);
  assert.deepEqual(list.map((x) => [x.id, x.stay, x.level]), [['yu-garden', false, 'required'], ['bund-rooftop-hostel', true, 'recommended']]);
  for (const k of ['loadTaste', 'isStay', 'nextTasks', 'mustDoStatus', 'FAME_IDS', 'flagChips', 'focusPos']) assert.ok(api[k], k);
});

test('scaffold: --category stay gives a Stay template; other categories ask for fame', () => {
  const s = placeTemplate({ country: 'japan', city: 'tokyo', name: 'Nine Pods', category: 'stay', today: '2026-11-10' });
  assert.match(s, /^category: stay/m);
  assert.match(s, /^kind: Stay/m);
  assert.match(s, /^  - type: stay/m);
  assert.match(s, /ONE NIGHT in the cheapest bed/);
  assert.doesNotMatch(s, /type: menu/);
  assert.doesNotMatch(s, /^time_needed:/m);
  assert.doesNotMatch(s, /^fame: TODO/m);
  const n = placeTemplate({ country: 'japan', city: 'tokyo', name: 'Some Shrine', category: 'culture', today: '2026-11-10' });
  assert.match(n, /^fame: TODO\s+# iconic \| popular \| hidden/m);
  assert.match(n, /^# must_do: TODO/m);
  assert.doesNotMatch(n, /^  - type: stay/m);
  assert.match(n, /type: menu/);
  // a filled-in fame is required in practice: the TODO is a validation error
  const issues = validatePlace(parse(n), {});
  assert.ok(errors(issues).some((i) => i.path === 'fame' && /placeholder/.test(i.message)));
});

// ───────────────────────── focus ─────────────────────────
test('focus: keywords and "x% y%" focal points; bad values get a fix-it message', () => {
  const ok = (v) => { const p = fixturePlace(); p.blocks[0].focus = v; return errors(validatePlace(p, yuCtx())).filter((x) => /focus/.test(x.path)); };
  for (const v of ['center', 'top', 'left', '20% 60%', '0% 100%', '33.5% 5%']) assert.deepEqual(ok(v), [], v);
  const typo = ok('lefft')[0];
  assert.match(typo.message, /Did you mean "left"/);
  assert.match(typo.expected, /"x% y%"/);
  assert.equal(ok('120% 10%').length, 1);
  assert.equal(ok('20 60').length, 1);
  assert.equal(api.focusPos('20% 60%'), '20% 60%');
  assert.equal(api.focusPos('top'), 'center 20%');
  assert.equal(api.focusPos('nonsense'), 'center');
  const p = fixturePlace();
  p.blocks[0].focus = '20% 60%';
  p.blocks.find((b) => b.type === 'gallery').images[0].focus = '10% 90%';
  const html = renderPlacePage(p, { credits: fixtureCredits() });
  assert.match(html, /class="hero" style="--focus:20% 60%"/);
  assert.match(html, /--focus:10% 90%/);
});

// ───────────────────────── gaps ─────────────────────────
test('gaps: every open must-do key is a HIGH gap with the traveler\'s words', () => {
  const r = gaps([mk({ must_do: 'great-wall' }), mk({ must_do: 'china-clubs' })]);
  const md = r.items.filter((i) => i.kind === 'must-do');
  assert.deepEqual(md.map((i) => i.key).sort(), ['china-clubs', 'gaming-cafe', 'shibuya', 't1']);
  assert.ok(md.every((i) => i.severity === 'high'));
  assert.match(md.find((i) => i.key === 'china-clubs').message, /"china famous clubs" \(1\/3 claimed\)/);
  assert.equal(md.find((i) => i.key === 'gaming-cafe').country, undefined);
  assert.match(formatGaps(r), /trip \(any country\)/);
  assert.match(formatGaps(r), /Must-do list: 1\/5 covered/);
});

test('gaps: stays are not attractions; each city with attractions (or fixed) wants stay cards', () => {
  const places = [mk({ city: 'shanghai' }), mk({ city: 'chongqing' }), mkStay({ city: 'shanghai' }), mkStay({ city: 'shanghai' }), mkStay({ city: 'chongqing' })];
  const r = gaps(places);
  assert.deepEqual([r.stats.china.places, r.stats.china.attractions, r.stats.china.stays], [2, 2, 3]);
  assert.equal(r.stats.china.categories.stay, undefined);
  const stay = r.items.filter((i) => i.kind === 'stay');
  assert.deepEqual(stay.map((i) => [i.country, i.city, i.severity]), [['china', 'chongqing', 'medium'], ['korea', 'seoul', 'medium']]);
  assert.match(stay[0].message, /1\/2 stay card/);
  assert.match(r.items.find((i) => i.kind === 'too-few' && i.country === 'china').message, /^2 place/);
  assert.match(formatGaps(r), /2\/54 attractions for 27 days · 3 stay\(s\) · 0\/8 areas/);
  // a stay place gets no fame / weather / menu gaps
  assert.deepEqual(r.items.filter((i) => i.id === places[2].id).map((i) => i.kind), ['no-image']);
  // stays off when the taste does not want them
  assert.equal(gaps(places, { taste: { ...TASTE, stay: { wanted: false } } }).items.filter((i) => i.kind === 'stay').length, 0);
});

test('gaps: before 6 attractions only the missing top interests are listed (3s, then 2s)', () => {
  const r = gaps([mk({ category: 'food' }), mk({ category: 'culture' })]);
  const b = r.items.filter((i) => i.kind === 'balance' && i.country === 'china');
  assert.equal(b.length, 1);
  assert.equal(b[0].message, 'top interests still missing: views (3/3) · nightlife, nature, odd-local, shows (2/3)');
  assert.ok(!r.items.some((i) => i.kind === 'discovery'), 'no discovery judgement yet');
  assert.ok(!r.items.some((i) => i.kind === 'balance' && i.country === 'japan'), 'nothing for empty countries');
});

test('gaps: with ≥ 6 attractions, categories far under and far over the interest target are flagged', () => {
  const places = [...Array(5)].map(() => mk({ category: 'culture' })).concat([...Array(4)].map(() => mk({ category: 'shopping' })));
  const r = gaps(places);
  const b = r.items.filter((i) => i.kind === 'balance' && i.country === 'china');
  const under = b.find((i) => /far under/.test(i.message));
  const over = b.find((i) => /far over/.test(i.message));
  assert.deepEqual(under.categories, ['food', 'views', 'nightlife', 'nature', 'odd-local', 'shows'], 'most wanted first');
  assert.match(under.message, /food \(0, want ~2; interest 3\/3\)/);
  assert.match(over.message, /culture is 56% of places \(target 11%\)/);
  assert.match(over.message, /shopping is 44%/);
  // thresholds come from trip.yaml `gaps:`
  const lax = gaps(places, { config: { ...CONFIG, gaps: { balance_min_places: 20 } } });
  assert.ok(!lax.items.some((i) => /far (under|over)/.test(i.message)));
});

test('gaps: a tag the traveler scored 0 needs a reason on the page unless it claims a must-do', () => {
  const r = gaps([mk({ id: 'a-museum', tags: ['museum'] }), mk({ id: 'wall-museum', tags: ['museum'], must_do: 'great-wall' })]);
  const t = r.items.filter((i) => i.kind === 'taste');
  assert.deepEqual(t.map((i) => [i.id, i.severity]), [['a-museum', 'medium']]);
  assert.match(t[0].message, /traveler scored museum 0: say on the page why it's a must, or drop it/);
});

test('gaps: discovery — fame mix in coverage; too few hidden and no iconic are flagged from 6 attractions', () => {
  const places = [mk({ fame: 'popular' }), mk({ fame: 'popular' }), mk({ fame: 'popular' }), mk({ fame: 'hidden' }), mk({ fame: undefined }), mk({ fame: undefined })];
  const r = gaps(places);
  assert.deepEqual(r.stats.china.fame, { iconic: 0, popular: 3, hidden: 1, unset: 2 });
  assert.match(formatGaps(r), /fame: iconic 0 · popular 3 · hidden 1 · unset 2/);
  const d = r.items.filter((i) => i.kind === 'discovery').map((i) => i.message);
  assert.equal(d.length, 2);
  assert.match(d[0], /only 1 of 6 places are fame: hidden \(17%, want ≥ 30%; 2 have no fame set\)/);
  assert.match(d[1], /no fame: iconic place/);
  assert.equal(r.items.filter((i) => i.kind === 'missing-field' && /no fame/.test(i.message) && i.severity === 'low').length, 2);
  const good = gaps([mk({ fame: 'iconic' }), mk({ fame: 'popular' }), mk({ fame: 'popular' }), mk({ fame: 'hidden' }), mk({ fame: 'hidden' }), mk({ fame: 'popular' })]);
  assert.equal(good.items.filter((i) => i.kind === 'discovery').length, 0);
  assert.equal(gaps(places, { taste: { ...TASTE, goal: 'balanced' } }).items.filter((i) => i.kind === 'discovery').length, 0);
});

test('gaps: area cards wanted come from trip.yaml areas_wanted (default 3 for China, Japan and countries without fixed cities)', () => {
  const r = gaps([], { areas: [{ id: 'chongqing', country: 'china', name: 'Chongqing' }] });
  assert.deepEqual([r.stats.china.areasWanted, r.stats.korea.areasWanted, r.stats.japan.areasWanted], [8, 0, 3]);
  const a = r.items.filter((i) => i.kind === 'areas');
  assert.deepEqual(a.map((i) => i.country).sort(), ['china', 'japan']);
  assert.match(a.find((i) => i.country === 'china').message, /^1\/8 area card/);
  assert.equal(api.areasWanted({ id: 'thailand', cities: [] }), 3);
  assert.equal(api.areasWanted({ id: 'japan', cities: ['tokyo'] }), 3);
  assert.equal(api.areasWanted({ id: 'korea', cities: ['seoul'], areas_wanted: 2 }), 2);
});

test('cli: gaps --fixtures shows attractions and stays apart; --country keeps trip-wide must-dos', () => {
  const r = atr(['gaps', '--fixtures']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /China\s+3\/54 attractions for 27 days · 1 stay\(s\)/);
  assert.match(r.stdout, /fame: iconic 2 · popular 0 · hidden 1/);
  assert.match(r.stdout, /must-do\s+traveler asked for "china famous clubs" \(0\/2 claimed\)/);
  const j = JSON.parse(atr(['gaps', '--fixtures', '--json', '--country', 'japan']).stdout);
  assert.deepEqual(Object.keys(j.stats), ['japan']);
  assert.deepEqual(j.items.filter((i) => i.kind === 'must-do').map((i) => i.key).sort(), ['capsule-hotel', 'gaming-cafe']);
  assert.match(atr(['gaps', '--country', 'chna']).stderr, /did you mean china/);
});

// ───────────────────────── next ─────────────────────────
test('next: must-dos first (route order) with an areas task after every second one; text carries words, hint and key', () => {
  const { tasks, total } = next([mk({ city: 'shanghai' })]);
  assert.equal(tasks.length, total);
  assert.deepEqual(tasks.slice(0, 7).map((t) => `${t.kind}:${t.country || '-'}`), ['must-do:china', 'must-do:china', 'areas:china', 'must-do:korea', 'must-do:japan', 'areas:japan', 'must-do:-']);
  assert.equal(tasks[0].task, 'Research the traveler\'s must-do "great wall of china" (hint: Pick the section that suits a solo winter traveler) and add the best place page for it in Beijing, China. Claim it with must_do: great-wall.');
  assert.match(tasks[1].task, /add 3 place pages for it in China\. Claim each with must_do: china-clubs\./);
  assert.match(tasks[2].task, /^Add 3 area cards for China \(it has 0 of the 8 wanted\)\..*; include Beijing;/);
  assert.match(tasks[6].task, /whichever country on the route suits it best/);
  assert.deepEqual(tasks.map((t) => t.rank), tasks.map((_, i) => i + 1));
  for (const t of tasks) { assert.ok(t.task.length > 20 && !/\n/.test(t.task), 'one line'); assert.ok(t.why); assert.deepEqual(Object.keys(t).filter((k) => !['rank', 'kind', 'country', 'task', 'why'].includes(k)), []); }
  // an existing page in the must-do's city may already be the thing
  const withArea = next([mk({ id: 'meiji', country: 'japan', city: 'tokyo' })], { areas: [{ id: 'tokyo', country: 'japan', name: 'Tokyo', cities: ['tokyo'] }] }).tasks.find((t) => /shibuya/.test(t.task));
  assert.match(withArea.task, /Claim it with must_do: shibuya\. If an existing page already is it \(area tokyo, meiji\), claim it there instead of adding a new one\.$/);
  // deterministic
  assert.deepEqual(next([mk({ id: 'same', city: 'shanghai' })]).tasks.map((t) => t.task), next([mk({ id: 'same', city: 'shanghai' })]).tasks.map((t) => t.task));
});

test('next: then empty fixed cities, stay cards, category deficits by interest, repairs, feedback', () => {
  const places = [mk({ id: 'weak', city: 'shanghai', category: 'culture', fame: undefined, blocks: [{ type: 'hero' }] }), mk({ city: 'chongqing', category: 'culture' })];
  const validation = { results: [{ kind: 'place', file: '/x/places/china/shanghai/weak/place.yaml', data: { country: 'china' }, issues: [{ level: 'error', path: 'why', message: 'x' }, { level: 'warning', path: 'y', message: 'y' }] }] };
  const feedback = { swipes: [{ ts: '2026-11-12T10:00:00Z' }, { ts: '2026-11-01T10:00:00Z' }], duels: [], questions: [{ ts: '2026-11-12T11:00:00Z' }], warnings: [] };
  const { tasks } = next(places, { validation, feedback, seen: '2026-11-05T00:00:00Z' });
  const kinds = tasks.map((t) => t.kind);
  const first = (k) => kinds.indexOf(k);
  assert.equal(first('repair'), 0, 'pages with validation errors come first: they break validate --all for every session');
  assert.ok(first('must-do') < first('city-empty') && first('city-empty') < first('stay') && first('stay') < first('places') && first('places') < first('feedback'), kinds.join(','));
  const empty = tasks.find((t) => t.kind === 'city-empty');
  assert.equal(empty.country, 'korea');
  assert.match(empty.task, /^Add 3 places in Seoul, South Korea, a fixed stop with no places yet\. Start with the top interests \(food, views\)\. Make at least one of them a place most foreign visitors never hear of \(fame: hidden\)\.$/);
  const stay = tasks.filter((t) => t.kind === 'stay');
  assert.match(stay[0].task, /^Add 2 stay cards for Shanghai, China \(category stay, kind Stay\): social hostels/);
  assert.ok(stay.some((t) => /Chongqing/.test(t.task)));
  const deficit = tasks.find((t) => t.kind === 'places' && t.country === 'china');
  assert.match(deficit.task, /^Add 3 places in China \(Shanghai, Chongqing\): 1 food, 1 views, 1 nightlife\. Make at least two of them places most foreign visitors never hear of \(fame: hidden\)\.$/);
  assert.match(deficit.why, /2\/54 attractions for 27 days; top interests still missing: food, views/);
  const repair = tasks[0];
  assert.match(repair.task, /^Repair this page: weak \(1 validation error; no highlights block; no map block; no tips block; \+\d more\)/);
  assert.match(repair.why, /^1 validation error on 1 page/);
  const noErrors = next(places, { feedback, seen: '2026-11-05T00:00:00Z' }).tasks;
  assert.equal(noErrors[0].kind, 'must-do');
  const nk = noErrors.map((t) => t.kind);
  assert.ok(nk.lastIndexOf('places') < nk.indexOf('repair') && nk.indexOf('repair') < nk.indexOf('feedback'), 'pages without errors are repaired after new content, before feedback');
  assert.match(noErrors.find((t) => t.kind === 'repair').why, /^1 page with \d open issues\.$/);
  assert.match(tasks.at(-1).why, /^2 feedback events since 2026-11-05: 1 question/);
  assert.match(tasks.at(-1).task, /--mark-seen --upto 2026-11-12T11:00:00Z\.$/);
  // feedback before the cursor is not "new"; without a cursor everything is
  assert.ok(!next(places, { feedback, seen: '2026-11-12T11:00:00Z' }).tasks.some((t) => t.kind === 'feedback'));
  assert.match(next(places, { feedback, seen: null }).tasks.at(-1).why, /^3 feedback events never processed/);
  // --country keeps that country and the trip-wide must-do
  const jp = next(places, { country: 'japan' }).tasks;
  assert.ok(jp.every((t) => !t.country || t.country === 'japan'));
  assert.ok(jp.some((t) => /gaming cafe/.test(t.task)));
  assert.equal(next(places, { count: 2 }).tasks.length, 2);
});

test('next: pickCategories follows the interest targets and re-counts after each pick', () => {
  assert.deepEqual(pickCategories([], TASTE), [{ cat: 'food', n: 1 }, { cat: 'views', n: 1 }, { cat: 'culture', n: 1 }]);
  assert.deepEqual(pickCategories([mk({ category: 'food' }), mk({ category: 'views' })], TASTE, 2), [{ cat: 'culture', n: 1 }, { cat: 'nightlife', n: 1 }]);
  assert.ok(!pickCategories([], { interests: { food: 3, culture: 0 } }, 3).some((p) => p.cat !== 'food'), 'weight-0 categories are never asked for');
});

test('cli: atr next prints a numbered list with the why underneath; --json has rank, kind, task, why', () => {
  const r = atr(['next', '--fixtures', '--count', '3']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^ 1\. \[must-do · china\] Research the traveler's must-do "china famous clubs"/m);
  assert.match(r.stdout, /^    why: /m);
  assert.equal((r.stdout.match(/^ ?\d+\. \[/gm) || []).length, 3);
  const j = JSON.parse(atr(['next', '--fixtures', '--json', '--count', '4']).stdout);
  assert.equal(j.tasks.length, 4);
  assert.ok(j.total >= 4);
  assert.deepEqual(Object.keys(j.tasks[0]).sort(), ['country', 'kind', 'rank', 'task', 'why']);
  assert.match(atr(['next', '--count', '0']).stderr, /whole number/);
  assert.match(formatNext({ tasks: [], total: 0 }), /Nothing to do/);
});

// ───────────────────────── runner ─────────────────────────
test('runner: the allow-list matches what sessions use; protected paths stay denied', () => {
  for (const t of ['Read', 'Write', 'Edit', 'Bash', 'WebSearch', 'WebFetch', 'Agent', 'ToolSearch']) assert.ok(ALLOWED_TOOLS.includes(t), t);
  for (const p of ['platform', 'docs', 'config', 'feedback', 'apps', 'packages', 'tooling', 'deploy', 'scripts']) for (const t of ['Edit', 'Write']) assert.ok(DISALLOWED_TOOLS.includes(`${t}(./${p}/**)`), `${t} ${p}`);
  for (const f of ['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'package.json']) assert.ok(DISALLOWED_TOOLS.includes(`Write(./${f})`), f);
  assert.ok(!DISALLOWED_TOOLS.some((d) => /places|areas/.test(d)));
});

test('runner: only files the session itself wrote are violations; the rest is "changed elsewhere"', () => {
  const ev = (content, parent) => ({ type: 'assistant', parent_tool_use_id: parent, message: { content } });
  const writes = sessionWrites([
    ev([{ type: 'tool_use', name: 'Write', input: { file_path: path.join(ROOT, 'places/china/x/place.yaml') } }]),
    ev([{ type: 'tool_use', name: 'Edit', input: { file_path: path.join(ROOT, 'docs/CURATOR-GUIDE.md') } }]),
    ev([{ type: 'tool_use', name: 'Write', input: { file_path: 'platform/lib/evil.js' } }], 'toolu_subagent'),
    ev([{ type: 'tool_use', name: 'Bash', input: { command: 'cd config && sed -i "" s/a/b/ trip.yaml; ./atr validate --all; cat game/server.js | head' } }]),
    ev([{ type: 'text', text: 'config/taste.yaml' }]),
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'game/lib/board.js' }] } },
  ]);
  const changed = ['config/taste.yaml', 'config/trip.yaml', 'docs/CURATOR-GUIDE.md', 'platform/lib/evil.js', 'game/lib/board.js', 'game/lib/elo.js', 'game/server.js', 'atr', 'package.json'];
  const { violations, elsewhere } = attributeChanges(changed, writes);
  assert.deepEqual(violations, ['config/trip.yaml', 'docs/CURATOR-GUIDE.md', 'platform/lib/evil.js'], 'reading game/server.js with cat is not writing it');
  assert.deepEqual(elsewhere, ['config/taste.yaml', 'game/lib/board.js', 'game/lib/elo.js', 'game/server.js', 'atr', 'package.json']);
  assert.equal(commandTouches('./atr gaps', 'atr'), false);
  assert.equal(commandTouches('echo x > atr', 'atr'), true);
  assert.equal(commandTouches(`echo x >> ${path.join(ROOT, 'config/trip.yaml')}`, 'config/trip.yaml'), true);
  assert.deepEqual(attributeChanges(['docs/a.md (deleted)'], { files: new Set(), commands: ['rm -rf docs'] }).violations, ['docs/a.md (deleted)']);
});

test('runner: content changes are reported as place / area ids', () => {
  const before = new Map([['places/china/shanghai/old/place.yaml', '1:1'], ['places/china/shanghai/gone/place.yaml', '1:1'], ['areas/china/harbin.yaml', '1:1'], ['places/_friction.md', '1:1']]);
  const after = new Map([['places/china/shanghai/old/place.yaml', '2:2'], ['places/china/shanghai/new/place.yaml', '1:1'], ['places/china/shanghai/new/media/a-640.webp', '1:1'], ['places/china/shanghai/old/media/b-640.webp', '1:1'], ['areas/china/harbin.yaml', '1:1'], ['areas/china/chongqing.yaml', '1:1'], ['areas/china/media/credits.yaml', '1:1'], ['places/_friction.md', '2:2']]);
  const c = contentChanges(before, after);
  assert.deepEqual(c, { places: { created: ['new'], changed: ['old'], deleted: ['gone'] }, areas: { created: ['chongqing'], changed: [], deleted: [] } });
  assert.equal(describeContent(c), '+1 place (new) · ~1 place (old) · −1 place (gone) · +1 area (chongqing)');
  assert.equal(describeContent(contentChanges(before, before)), 'nothing');
});

test('runner: summary.json records content ids, violations vs changed_elsewhere, and the post-validate seam can send the session back', async () => {
  const root = tmpDir();
  fs.mkdirSync(path.join(root, 'areas/china'), { recursive: true });
  const fake = path.join(root, 'fake-claude.mjs');
  const area = path.join(root, 'areas/china/testville.yaml');
  fs.writeFileSync(fake, `#!/usr/bin/env node
import fs from 'node:fs';
const resume = process.argv.includes('--resume');
fs.appendFileSync(${JSON.stringify(path.join(root, 'calls.log'))}, (resume ? 'resume' : 'first') + '\\n');
fs.writeFileSync(${JSON.stringify(area)}, 'id: testville\\ncountry: china\\nname: Testville\\nregion: Test region\\nscope: city\\nwhy: A perfectly valid test area card used by the runner test.\\nbest_for: [nature]\\ndays_suggested: { min: 1, max: 2 }\\ncost_level: low\\nwinter_note: Cold' + (resume ? ' again' : '') + '.\\nsources:\\n  - { url: https://example.com/a, title: A, checked: 2026-11-01 }\\n  - { url: https://example.com/b, title: B, checked: 2026-11-01 }\\nconfidence: low\\nlast_updated: 2026-11-01\\nimage: none\\n');
console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-1' }));
console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: ${JSON.stringify(area)} } }, { type: 'tool_use', name: 'Agent', input: {} }] } }));
console.log(JSON.stringify({ type: 'result', session_id: 'sess-1', result: 'done', total_cost_usd: 0.25, num_turns: 2 }));
`);
  fs.chmodSync(fake, 0o755);
  process.env.ATR_DATA_ROOT = root;
  process.env.ATR_CLAUDE_BIN = fake;
  try {
    const { runCurator } = await import('../lib/runner.js');
    const seen = [];
    // `image: none` keeps validate failing, so use a step-only check: maxRounds 2, validation errors feed round 2.
    const r = await runCurator({ task: 'test', maxRounds: 2, log: () => {}, postValidate: [async (ctx) => { seen.push(ctx.round); return { name: 'review', ok: false, report: 'never reached while validate fails' }; }] });
    assert.deepEqual(r.content.areas.created, ['testville']);
    assert.deepEqual(r.violations, [], 'writing under areas/ is not a violation');
    assert.ok(Array.isArray(r.changed_elsewhere));
    assert.equal(r.cost, 0.25, 'total_cost_usd of the resumed session is cumulative: 0.25 then 0.25 means the second round was free');
    assert.equal(typeof r.minutes, 'number');
    assert.deepEqual(seen, [], 'post-validate steps only run on a clean validate');
    const saved = JSON.parse(fs.readFileSync(path.join(r.dir, 'summary.json'), 'utf8'));
    assert.deepEqual(saved.content.areas.created, ['testville']);
    assert.ok('changed_elsewhere' in saved && 'violations' in saved);
    fs.rmSync(r.dir, { recursive: true, force: true });
  } finally { delete process.env.ATR_DATA_ROOT; delete process.env.ATR_CLAUDE_BIN; }
});

test('runner: post-validate steps run once validate is clean; a failing step is fed back like an error', async () => {
  const root = tmpDir();
  fs.mkdirSync(path.join(root, 'places'), { recursive: true });
  const fake = path.join(root, 'fake-claude.mjs');
  fs.writeFileSync(fake, `#!/usr/bin/env node
console.log(JSON.stringify({ type: 'result', session_id: 'sess-2', result: process.argv.includes('--resume') ? 'fixed the link' : 'done', total_cost_usd: 0.1, num_turns: 1 }));
`);
  fs.chmodSync(fake, 0o755);
  process.env.ATR_DATA_ROOT = root;
  process.env.ATR_CLAUDE_BIN = fake;
  try {
    const { runCurator } = await import('../lib/runner.js');
    const r = await runCurator({ task: 'test', maxRounds: 3, log: () => {}, postValidate: [async ({ round }) => ({ name: 'links', ok: round > 1, report: round > 1 ? '' : 'dead link: https://example.com/404' })] });
    assert.equal(r.clean, true);
    assert.equal(r.rounds.length, 2);
    assert.deepEqual(r.rounds.map((x) => x.post), [[{ name: 'links', ok: false }], [{ name: 'links', ok: true }]]);
    assert.match(fs.readFileSync(path.join(r.dir, 'round-2.prompt.md'), 'utf8'), /## links\ndead link: https:\/\/example\.com\/404/);
    fs.rmSync(r.dir, { recursive: true, force: true });
  } finally { delete process.env.ATR_DATA_ROOT; delete process.env.ATR_CLAUDE_BIN; }
});

test('runner: --auto takes the top task, recomputes between runs and never repeats a task', async () => {
  let done = 0;
  const queue = () => ({ tasks: [{ rank: 1, kind: 'must-do', country: 'china', task: 'A', why: 'a' }, { rank: 2, kind: 'areas', country: 'china', task: 'B', why: 'b' }, { rank: 3, kind: 'stay', country: 'china', task: 'C', why: 'c' }].slice(done >= 2 ? 1 : 0) });
  const ran = [];
  const run = async (o) => { ran.push(o.task); if (o.task !== 'A') done++; done++; return { clean: o.task !== 'B', rounds: [{}], content: { places: { created: ['x'], changed: [], deleted: [] }, areas: { created: [], changed: [], deleted: [] } }, violations: [], changed_elsewhere: [], cost: 1, minutes: 2, dir: '/tmp/x' }; };
  const a = await runAuto({ count: 3, next: queue, run, log: () => {} });
  assert.deepEqual(ran, ['A', 'B', 'C'], 'A stays on the list after its run (not solved) but is not retried');
  assert.deepEqual(a.runs.map((r) => [r.kind, r.clean]), [['must-do', true], ['areas', false], ['stay', true]]);
  const few = await runAuto({ count: 5, next: () => ({ tasks: [{ rank: 1, kind: 'repair', task: 'only', why: 'w' }] }), run, log: () => {} });
  assert.equal(few.runs.length, 1, 'stops when nothing new is left');
  const lines = [];
  const dry = await runAuto({ count: 2, dryRun: true, next: queue, run, log: (s) => lines.push(s) });
  assert.equal(dry.dryRun, true);
  assert.deepEqual(dry.tasks.map((t) => t.task), ['B', 'C']);
  assert.match(lines.join('\n'), /claude -p/);
});

test('cli: run --auto --dry-run prints the tasks and commands; fx puts the converted amount on the first line', () => {
  const r = atr(['run', '--auto', '2', '--dry-run', '--fixtures']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /would run 2 task\(s\)/);
  assert.match(r.stdout, /^1\. \[must-do · china\] Research the traveler's must-do/m);
  assert.equal((r.stdout.match(/claude -p/g) || []).length, 2);
  assert.match(r.stdout, /Agent,ToolSearch/);
  assert.match(atr(['run', '--auto', 'x']).stderr, /optional count/);
  const fx = atr(['fx', 'BRL', '--amount', '40']);
  assert.equal(fx.status, 0, fx.stderr);
  assert.equal(fx.stdout.split('\n')[0], '40 BRL = R$ 40');
  assert.match(fx.stdout.split('\n')[1], /^1 BRL = R\$ 1/);
  assert.match(atr(['fx', 'BRL']).stdout.split('\n')[0], /^1 BRL = R\$ 1/);
});

test('fixtures: every round-5 fixture validates, and validate --all reports no taste problems', () => {
  const r = validateAll({ fixtures: true, now: '2026-11-10' });
  assert.deepEqual(r.results.flatMap((x) => errors(x.issues).map((i) => `${x.file} ${i.path}: ${i.message}`)), []);
  assert.ok(!r.results.some((x) => x.kind === 'taste'));
  assert.ok(r.results.some((x) => /bund-rooftop-hostel/.test(x.file)));
});
