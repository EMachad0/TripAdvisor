// Round 7: area pages, country overview map, feedback cursor, faq block, cost-total check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { ROOT, FIXTURES } from '../lib/paths.js';
import * as api from '../lib/index.js';
import { validatePlace, validateArea, validateAll } from '../lib/validate.js';
import { renderAreaPage, renderAreaCard, renderAreasPage, renderPlacePage, areaPlaces, areaMustDo } from '../lib/render/index.js';
import { overviewLayout, numberedAreas, unproject } from '../lib/overview.js';
import { project } from '../lib/staticmap.js';
import { readFeedback, newFeedback, formatNewFeedback, placeFeedback, markSeen, readSeen, seenFile } from '../lib/feedback/index.js';
import { nextTasks } from '../lib/next.js';
import { gapReport } from '../lib/gaps.js';
import { areaTemplate } from '../lib/scaffold.js';
import { toJsonSchema } from '../lib/schema/dsl.js';
import { areaSpec } from '../lib/schema/specs.js';
import { fixturePlace, fixtureCredits, fixtureMedia, tmpDir } from './helpers.js';

const atr = (args, env = {}) => spawnSync(path.join(ROOT, 'atr'), args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ATR_OFFLINE: '1', ...env } });
const errors = (issues) => issues.filter((i) => i.level === 'error');
const harbin = () => parse(fs.readFileSync(path.join(FIXTURES, 'areas/china/harbin.yaml'), 'utf8'));
const areaCredits = () => parse(fs.readFileSync(path.join(FIXTURES, 'areas/china/media/credits.yaml'), 'utf8'));
const areaCtx = (extra = {}) => ({ fixtureMode: true, now: '2026-11-10', credits: areaCredits(), mediaFiles: fs.readdirSync(path.join(FIXTURES, 'areas/china/media')), mediaWhere: 'areas/china/media', ...extra });
const yuCtx = () => ({ credits: fixtureCredits(), mediaFiles: fixtureMedia(), fixtureMode: true, now: '2026-11-10', knownIds: new Set(['yu-garden', 'nanxiang-mantou-dian', 'the-bund']) });
const FB = path.join(FIXTURES, 'feedback');

// ───────────────────────── area schema ─────────────────────────
test('area: blocks, lat/lng, fame and getting_around are optional; the fixture area with a page is valid', () => {
  assert.deepEqual(errors(validateArea(harbin(), areaCtx())), []);
  const bare = harbin();
  for (const k of ['blocks', 'lat', 'lng', 'fame', 'getting_around']) delete bare[k];
  const issues = validateArea(bare, areaCtx());
  assert.deepEqual(errors(issues), [], 'old area files stay valid');
  const w = issues.find((i) => i.path === 'lat');
  assert.equal(w.level, 'warning');
  assert.match(w.message, /no lat\/lng: this area is missing from the country overview map/);
  assert.deepEqual(w.example, { lat: 45.7567, lng: 126.6424 });
  const swapped = { ...harbin(), lat: 12.6, lng: 45.7 };
  assert.match(errors(validateArea(swapped, areaCtx())).find((i) => i.path === 'lat').message, /outside China \(lat and lng swapped\?\)/);
  const js = toJsonSchema(areaSpec);
  for (const k of ['blocks', 'lat', 'lng', 'fame', 'getting_around']) { assert.ok(js.properties[k], k); assert.ok(!js.required.includes(k), k); }
  const exported = JSON.parse(fs.readFileSync(path.join(ROOT, 'platform/schema/area.schema.json'), 'utf8'));
  assert.ok(exported.properties.blocks && exported.properties.lat, 'run ./atr schema --export');
});

test('area: place-only blocks are rejected with a fix-it message; image refs are checked', () => {
  const a = harbin();
  a.blocks.push({ type: 'menu', items: [{ name: 'x' }] }, { type: 'map' }, { type: 'quickfacts' }, { type: 'gallery', images: [{ file: 'no-such-photo' }] });
  const e = errors(validateArea(a, areaCtx()));
  const n = a.blocks.length;
  const menu = e.find((i) => i.path === `blocks[${n - 4}].type`);
  assert.match(menu.message, /block `menu` is only for place pages; an area page cannot use it/);
  assert.match(menu.expected, /one of the area blocks: hero, highlights, prose, gallery, quote, tips, weather, faq, sources/);
  assert.match(e.find((i) => i.path === `blocks[${n - 3}].type`).hint, /gets its map automatically from lat\/lng/);
  assert.match(e.find((i) => i.path === `blocks[${n - 2}].type`).message, /unknown type "quickfacts"/);
  assert.match(e.find((i) => i.path === `blocks[${n - 1}].images[0].file`).message, /image "no-such-photo" has no entry in areas\/china\/media\/credits\.yaml/);
  // an area hero needs no hook
  const b = harbin();
  b.blocks[0] = { type: 'hero' };
  assert.deepEqual(errors(validateArea(b, areaCtx())), []);
});

// ───────────────────────── area page ─────────────────────────
const PLACES = () => api.loadPlaces({ fixtures: true });
const MUST = [
  { key: 'ice-festival', said: 'the ice festival', country: 'china', want: 1, have: 1, covered: true, claims: [{ id: 'harbin', type: 'area' }] },
  { key: 'tiger-park', said: 'siberian tigers', country: 'china', city: 'harbin', want: 2, have: 0, covered: false, claims: [] },
  { key: 'classical-garden', said: 'a real chinese garden', country: 'china', city: 'shanghai', want: 1, have: 1, covered: true, claims: [{ id: 'yu-garden', type: 'place' }] },
];

test('area page: hero, facts strip, curator blocks, winter panel, must-dos, researched places, map, sources', () => {
  const html = renderAreaPage(harbin(), { credits: areaCredits(), mustDo: MUST, places: PLACES(), staticMap: { url: 'map.webp', width: 1200, height: 720 }, number: 1 });
  const order = [...html.matchAll(/data-block="([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['hero', 'facts', 'highlights', 'prose', 'tips', 'faq', 'winter', 'must_do', 'places', 'map', 'sources']);
  assert.match(html, /<h1 class="hero__title"><span class="hero__num"[^>]*>1<\/span>Harbin<\/h1>/);
  assert.match(html, /A city that builds a second city out of ice/);
  assert.match(html, /chip--must/);
  assert.match(html, /2–3 days suggested/);
  assert.match(html, /Getting around<\/p><p class="fact__value[^"]*">Metro Lines 1–3/);
  assert.match(html, /Best for<\/b><ul class="chips"><li class="chip" data-cat="nature">/);
  assert.match(html, /Dec–Jan in Harbin/);
  assert.match(html, /“the ice festival”<\/p><p class="onlist__status">Covered by this area/);
  assert.match(html, /“siberian tigers”<\/p><p class="onlist__status">Not researched yet \(0 of 2\)/);
  assert.doesNotMatch(html, /a real chinese garden/, 'must-dos of other cities stay out');
  assert.match(html, /Nothing researched in Harbin yet/);
  assert.match(html, /map__frame--static[\s\S]*map\.webp[\s\S]*© OpenStreetMap contributors/);
  assert.match(html, /<footer data-block="sources" class="sources"/);
  assert.match(html, /Photo: <a[^>]*>Rincewind42/, 'photo credits for the hero image');
  assert.match(html, /href="\.\.\/\.\.\/areas\.html"/);
  assert.match(html, /<title>Harbin — China · Asia Trip Ranker<\/title>/);
  assert.match(renderAreaPage(harbin(), { credits: areaCredits(), fragment: true }), /^<body data-cat="nature"><main class="page page--area">/);
});

test('area page: works without blocks, lists the places of its cities (attractions, then stays), escapes content', () => {
  const sh = parse(fs.readFileSync(path.join(FIXTURES, 'areas/china/shanghai.yaml'), 'utf8'));
  const html = renderAreaPage(sh, { credits: areaCredits(), places: PLACES(), mustDo: MUST, placeUrl: (p) => `/place/${p.id}`, placeMediaUrl: (p, n, w) => `/m/${p.id}/${n}-${w}.webp` });
  assert.deepEqual([...html.matchAll(/data-block="([a-z_]+)"/g)].map((m) => m[1]), ['hero', 'facts', 'winter', 'must_do', 'places', 'map', 'sources']);
  assert.deepEqual([...html.matchAll(/class="atr-card[^"]*" data-cat="[^"]*" data-id="([^"]+)"/g)].map((m) => m[1]), ['bund-nye-countdown', 'nanxiang-mantou-dian', 'yu-garden', 'bund-rooftop-hostel']);
  assert.match(html, /3 places and 1 stay in Shanghai/);
  assert.match(html, /href="\/place\/yu-garden"/);
  assert.match(html, /\/m\/yu-garden\/tingtao-pond-1280\.webp/);
  assert.match(html, /Covered by <a href="\/place\/yu-garden">Yu Garden<\/a>/);
  assert.match(html, /map__ph/, 'no static map passed: a placeholder that links to OSM');
  assert.deepEqual(areaPlaces({ id: 'x', country: 'china', cities: ['harbin'] }, PLACES()), []);
  assert.deepEqual(areaMustDo(sh, MUST).map((m) => m.key), ['classical-garden']);
  const evil = { ...harbin(), name: 'Evil <img src=x onerror=alert(1)>', why: '"><script>bad()</script> long enough why text', getting_around: '<b>x</b>' };
  const out = renderAreaPage(evil, { credits: areaCredits() });
  assert.doesNotMatch(out, /<img src=x|<script>bad|<b>x<\/b>/);
  // no coordinates: no map section at all
  const noGeo = { ...sh, lat: undefined, lng: undefined };
  assert.doesNotMatch(renderAreaPage(noGeo, { credits: areaCredits() }), /data-block="map"/);
});

test('area card: optional href and number; the areas page links cards to pages and shows the country map', () => {
  const a = harbin();
  const plain = renderAreaCard(a, { credits: areaCredits() });
  assert.doesNotMatch(plain, /area-card__link|area-card__num|area-card__more/);
  const linked = renderAreaCard(a, { credits: areaCredits(), href: 'areas/harbin/', number: 2 });
  assert.match(linked, /<a class="area-card__link" href="areas\/harbin\/">Harbin/);
  assert.match(linked, /area-card__num[^>]*>2</);
  assert.match(linked, /id="area-harbin"/);
  const areas = api.loadAreas({ fixtures: true });
  const pins = numberedAreas(areas).map((p, i) => ({ id: p.id, name: p.name, n: p.n, x: 10 + i * 20, y: 30 }));
  const page = renderAreasPage(areas, { areaUrl: (x) => `areas/${x.id}/`, countryMaps: { china: { url: 'areas/china/overview.webp', width: 1200, height: 720, pins } } });
  assert.match(page, /class="omap" data-block="country_map"/);
  assert.equal((page.match(/class="omap__pin"/g) || []).length, 4);
  assert.match(page, /<a class="omap__pin" href="#area-harbin" style="left:10\.00%;top:30\.00%" title="Harbin"><b>1<\/b>/);
  assert.deepEqual([...page.matchAll(/<article class="area-card[^"]*" id="area-([a-z]+)"/g)].map((m) => m[1]), ['harbin', 'xian', 'shanghai', 'dali'], 'cards follow the pin numbers');
  assert.doesNotMatch(renderAreasPage(areas, {}), /omap/);
});

test('overview map: numbering north → south, zoom from the bounding box, pins inside the frame', () => {
  const pts = numberedAreas(api.loadAreas({ fixtures: true }));
  assert.deepEqual(pts.map((p) => [p.n, p.id]), [[1, 'harbin'], [2, 'xian'], [3, 'shanghai'], [4, 'dali']]);
  const lay = overviewLayout(pts);
  assert.ok(lay.zoom >= 2 && lay.zoom <= 5, `country-scale zoom, got ${lay.zoom}`);
  for (const p of lay.pins) assert.ok(p.x > 10 && p.x < 90 && p.y > 10 && p.y < 90, `${p.id} ${p.x},${p.y}`);
  const [h, d] = [lay.pins.find((p) => p.id === 'harbin'), lay.pins.find((p) => p.id === 'dali')];
  assert.ok(h.y < d.y && h.x > d.x, 'Harbin is north-east of Dali');
  const two = overviewLayout([{ id: 'a', lat: 35.01, lng: 135.77 }, { id: 'b', lat: 34.69, lng: 135.5 }]);
  assert.equal(two.zoom, 9, 'close cities are capped at maxZoom');
  const c = project(31.23, 121.47, 6), back = unproject(c.x, c.y, 6);
  assert.ok(Math.abs(back.lat - 31.23) < 1e-6 && Math.abs(back.lng - 121.47) < 1e-6);
  assert.deepEqual(numberedAreas([{ id: 'x' }, { id: 'y', lat: 1, lng: 2 }]).map((p) => p.id), ['y']);
});

test('build: one page per area and the country overview map (cached tiles, offline)', () => {
  const b = JSON.parse(atr(['build', '--fixtures', '--json']).stdout);
  assert.deepEqual(b.areaPages.map((p) => p.id).sort(), ['dali', 'harbin', 'shanghai', 'xian']);
  for (const id of ['harbin', 'dali']) assert.ok(fs.existsSync(path.join(b.dir, 'areas', id, 'index.html')), id);
  const page = fs.readFileSync(path.join(b.dir, 'areas/harbin/index.html'), 'utf8');
  assert.match(page, /\.\.\/china\/media\/snow-sculpture-1280\.webp/);
  assert.match(page, /“the ice festival”/, 'must-do status comes from the fixture taste');
  const areasHtml = fs.readFileSync(path.join(b.dir, 'areas.html'), 'utf8');
  assert.match(areasHtml, /href="areas\/harbin\/"/);
  if (fs.existsSync(path.join(b.dir, 'areas/china/overview.webp'))) assert.match(areasHtml, /omap__pin/); // tiles cached
  const sh = fs.readFileSync(path.join(b.dir, 'areas/shanghai/index.html'), 'utf8');
  assert.match(sh, /href="\.\.\/\.\.\/places\/yu-garden\/"/);
});

test('cli/scaffold/gaps: new area template, shot accepts area ids, card-only areas are a low gap', () => {
  const t = areaTemplate({ country: 'japan', name: 'Kanazawa', today: '2026-11-10' });
  for (const re of [/^fame: TODO/m, /^lat: TODO/m, /^lng: TODO/m, /^getting_around: TODO/m, /^# blocks:/m, /^#   - type: hero/m, /Allowed blocks: hero, highlights/]) assert.match(t, re);
  assert.match(atr(['shot', 'no-such-thing', '--fixtures', '--no-build']).stderr, /no place or area "no-such-thing"/);
  assert.match(atr(['shot', '--help']).stdout, /area-id/);
  const r = gapReport({ fixtures: true, now: '2026-11-10', linkCache: {} });
  const ap = r.items.filter((i) => i.kind === 'area-page');
  assert.deepEqual(ap.map((i) => [i.id, i.severity]).sort(), [['dali', 'low'], ['shanghai', 'low'], ['xian', 'low']]);
  assert.match(ap[0].message, /card only: add a page/);
  assert.match(atr(['gaps', '--fixtures']).stdout, /area dali\n\s+low\s+area-page/);
});

// ───────────────────────── faq block ─────────────────────────
test('faq block: "You asked" renders as a Q&A list on places and areas; Markdown in answers, HTML escaped', () => {
  const p = fixturePlace();
  p.blocks.push({ type: 'faq', items: [{ q: 'Do I need my <passport>?', a: 'Yes, **always**. See [the notice](https://example.org/n).', asked: '2026-11-21' }, { q: 'Cash?', a: 'Alipay or cash.' }] });
  assert.deepEqual(errors(validatePlace(p, yuCtx())), []);
  const html = renderPlacePage(p, { credits: fixtureCredits() });
  assert.match(html, /data-block="faq"/);
  assert.match(html, /You asked/);
  assert.match(html, /<dt><span class="faq__q"[^>]*>Q<\/span><span>Do I need my &lt;passport&gt;\?<\/span><small>asked 21 Nov<\/small><\/dt><dd class="rich"><p>Yes, <strong>always<\/strong>\. See <a href="https:\/\/example\.org\/n"/);
  p.blocks.at(-1).items = [];
  assert.match(errors(validatePlace(p, yuCtx())).find((i) => /items$/.test(i.path)).message, /needs at least 1/);
  assert.match(atr(['blocks', 'faq']).stdout, /You asked/);
});

// ───────────────────────── cost total ─────────────────────────
test('validate: the cost block total must match cost.local and the R$ the page shows; the message says which number to change', () => {
  const base = () => { const p = fixturePlace(); p.cost = { local: 4, currency: 'CNY', brl: 3.31 }; p.blocks.find((b) => b.type === 'cost_breakdown').items = [{ label: 'Train there', local: 2, brl: 1.65 }, { label: 'Train back', local: 2, brl: 1.65 }, { label: 'Photo', local: 20, brl: 16.53, optional: true }]; return p; };
  const i = validatePlace(base(), yuCtx()).find((x) => /cost block total/.test(x.message));
  assert.equal(i.level, 'warning');
  assert.match(i.path, /^blocks\[\d+\]\.items\[1\]\.brl$/);
  assert.match(i.message, /the cost block total shows R\$ 3,30 \(its items rounded one by one\) but quick facts show R\$ 3,31 \(cost\.brl 3\.31\)/);
  assert.match(i.hint, /change this item's brl from 1\.65 to 1\.66 so the total matches cost\.brl/);
  assert.equal(i.example, 1.66);
  const fixed = base();
  fixed.blocks.find((b) => b.type === 'cost_breakdown').items[1].brl = 1.66;
  assert.ok(!validatePlace(fixed, yuCtx()).some((x) => /cost block/.test(x.message)));
  // a cent that does not show (amounts ≥ R$ 20 are shown without decimals) is not worth a warning
  const big = base();
  big.cost = { local: 29, currency: 'CNY', brl: 23.97 };
  big.blocks.find((b) => b.type === 'cost_breakdown').items = [{ label: 'Ticket', local: 25, brl: 20.67 }, { label: 'Metro', local: 4, brl: 3.31 }];
  assert.ok(!validatePlace(big, yuCtx()).some((x) => /cost block/.test(x.message)));
  // different local totals: the card and the cost block disagree
  const off = base();
  off.blocks.find((b) => b.type === 'cost_breakdown').items.push({ label: 'Locker', local: 6, brl: 4.96 });
  const w = validatePlace(off, yuCtx()).find((x) => /cost block adds up/.test(x.message));
  assert.match(w.message, /adds up to 10 CNY but cost\.local is 4/);
  assert.match(w.hint, /change cost\.local to 10 \(and cost\.brl to match\); if cost is right, fix an item or mark the extras `optional: true`/);
  assert.ok(!validateAll({ fixtures: true, now: '2026-11-10' }).results.some((r) => r.issues.some((x) => /cost block/.test(x.message))), 'fixtures are consistent');
});

// ───────────────────────── feedback cursor ─────────────────────────
const PL = [{ id: 'yu-garden', name: 'Yu Garden', category: 'culture', tags: ['garden'] }, { id: 'nanxiang-mantou-dian', name: 'Nanxiang', category: 'food', tags: ['dumplings'] }];
const AR = [{ id: 'harbin', name: 'Harbin' }];

test('feedback --new: events after the cursor, grouped for action', () => {
  const fb = readFeedback(FB);
  const all = newFeedback(fb, { since: null, places: PL, areas: AR });
  assert.deepEqual(all.counts, { swipes: 5, duels: 3, questions: 3, notes: 0 });
  assert.deepEqual(all.questions.map((q) => [q.id, q.items.length, q.exists]), [['yu-garden', 1, true], ['nanxiang-mantou-dian', 2, true]]);
  assert.equal(all.questions[1].items[1].question, 'What is the best time to avoid the queue?');
  assert.deepEqual(all.musts.map((p) => p.id), ['yu-garden', 'nanxiang-mantou-dian'], 'the latest verdict per card counts (maybe → must)');
  assert.deepEqual(all.skips.map((p) => p.id), ['old-deleted-place']);
  assert.deepEqual(all.areaMusts, [{ id: 'harbin', name: 'Harbin', ts: '2026-11-20T14:00:00Z' }]);
  assert.equal(all.latest, '2026-11-21T11:10:00Z');
  const later = newFeedback(fb, { since: '2026-11-21T10:30:00Z', places: PL, areas: AR });
  assert.deepEqual(later.counts, { swipes: 0, duels: 0, questions: 3, notes: 0 });
  assert.deepEqual([later.musts.length, later.skips.length, later.areaMusts.length], [0, 0, 0]);
  assert.deepEqual(newFeedback(fb, { since: '2026-11-21T11:10:00Z' }).counts, { swipes: 0, duels: 0, questions: 0, notes: 0 });
  const text = formatNewFeedback(all);
  assert.match(text, /nothing marked as seen yet/);
  assert.match(text, /## Questions to answer on the page/);
  assert.match(text, /\? Is there a cheaper takeaway window and can I pay cash\?/);
  assert.match(text, /\.\/atr feedback --mark-seen --upto 2026-11-21T11:10:00Z/);
  assert.match(formatNewFeedback(newFeedback(fb, { since: '2026-11-22T00:00:00Z' })), /Nothing new\./);
});

test('feedback: signals name the strongest new pattern ("3 musts in nightlife, all tagged club")', () => {
  const places = ['a', 'b', 'c'].map((id) => ({ id, name: id, category: 'nightlife', tags: ['club', id] })).concat([{ id: 'm1', name: 'm1', category: 'culture', tags: ['museum'] }, { id: 'm2', name: 'm2', category: 'culture', tags: ['museum', 'old'] }, { id: 'solo', name: 'solo', category: 'food' }]);
  const sw = (id, verdict, ts) => ({ v: 1, ts, session: 's', round: 'place', id, verdict });
  const fb = { swipes: [sw('a', 'must', '2026-11-22T10:00:00Z'), sw('b', 'must', '2026-11-22T10:01:00Z'), sw('c', 'must', '2026-11-22T10:02:00Z'), sw('m1', 'skip', '2026-11-22T10:03:00Z'), sw('m2', 'skip', '2026-11-22T10:04:00Z'), sw('solo', 'must', '2026-11-22T10:05:00Z')], duels: [], questions: [{ v: 1, ts: '2026-11-22T11:00:00Z', id: 'a', question: 'Is there a dress code?' }] };
  const n = newFeedback(fb, { since: '2026-11-21T00:00:00Z', places });
  assert.deepEqual(n.signals, ['3 musts in nightlife, all tagged club', '2 skips in culture, all tagged museum']);
  const tasks = nextTasks({ config: { countries: [] }, taste: null, places, areas: [], now: '2026-11-22', validation: { results: [] }, feedback: fb, seen: '2026-11-21T00:00:00Z', linkCache: {}, reviews: new Map() }).tasks;
  const t = tasks.find((x) => x.kind === 'feedback');
  assert.match(t.task, /^Process the new game feedback \(\.\/atr feedback --new\): answer the traveler's questions on a \(1\) \(fix the field each one is about and add a faq block where the answer is not obvious\); act on the new signals \(3 musts in nightlife, all tagged club; 2 skips in culture, all tagged museum\): add up to 3 places like the musts, and none like the skips\. Then run \.\/atr feedback --mark-seen --upto 2026-11-22T11:00:00Z\.$/);
  assert.match(t.why, /^7 feedback events since 2026-11-21: 1 question, 4 new must, 2 new skip, 0 area musts\.$/);
});

test('feedback --mark-seen writes places/_feedback-seen.json; --new and next follow the cursor; --place shows one place', () => {
  const root = tmpDir();
  fs.cpSync(FB, path.join(root, 'feedback'), { recursive: true });
  fs.mkdirSync(path.join(root, 'places'), { recursive: true });
  const env = { ATR_DATA_ROOT: root };
  const first = JSON.parse(atr(['feedback', '--new', '--json'], env).stdout);
  assert.deepEqual([first.since, first.counts.questions], [null, 3]);
  const mark = atr(['feedback', '--mark-seen', '--upto', '2026-11-21T10:30:00Z'], env);
  assert.equal(mark.status, 0, mark.stderr);
  assert.match(mark.stdout, /feedback up to 2026-11-21T10:30:00Z marked as seen/);
  const seen = JSON.parse(fs.readFileSync(path.join(root, 'places/_feedback-seen.json'), 'utf8'));
  assert.equal(seen.ts, '2026-11-21T10:30:00Z');
  assert.equal(readSeen({ root }), '2026-11-21T10:30:00Z');
  assert.equal(seenFile({ root }), path.join(root, 'places/_feedback-seen.json'));
  const second = atr(['feedback', '--new'], env).stdout;
  assert.match(second, /since 2026-11-21T10:30:00Z/);
  assert.match(second, /0 swipes · 0 duels · 3 questions/);
  assert.doesNotMatch(second, /Places swiped MUST/);
  atr(['feedback', '--mark-seen'], env);
  assert.equal(readSeen({ root }), '2026-11-21T11:10:00Z', 'default: the newest event');
  assert.match(atr(['feedback', '--new'], env).stdout, /Nothing new\./);
  assert.ok(!JSON.parse(atr(['next', '--json', '--count', '60'], env).stdout).tasks.some((t) => t.kind === 'feedback'));
  assert.match(atr(['feedback', '--mark-seen', '--upto', 'yesterday'], env).stderr, /ISO timestamp/);
  // the cursor is not content: validate and the loaders ignore it
  assert.equal(api.loadPlaces({ root }).length, 0);
  assert.deepEqual(markSeen({ swipes: [], duels: [], questions: [] }, { root: tmpDir() }).ts, null);
  // --place
  const one = atr(['feedback', '--place', 'yu-garden', '--fixtures']).stdout;
  assert.match(one, /# Feedback for yu-garden/);
  assert.match(one, /2026-11-20 14:05 {2}maybe\n {2}2026-11-21 09:00 {2}must/);
  assert.match(one, /won 1 \(against nanxiang-mantou-dian\) · lost 2/);
  assert.match(one, /\? Do I need to book with my passport or can I just walk in\?/);
  assert.match(atr(['feedback', '--place', 'nobody', '--fixtures']).stdout, /Nothing yet/);
  const f = placeFeedback(readFeedback(FB), 'nanxiang-mantou-dian');
  assert.deepEqual([f.verdicts.length, f.duels.won.length, f.duels.lost.length, f.questions.length], [1, 2, 1, 2]);
});

test('public API: round 7 exports', () => {
  for (const k of ['renderAreaPage', 'renderCountryMap', 'areaPlaces', 'areaMustDo', 'countryOverviewMap', 'overviewLayout', 'AREA_BLOCK_TYPES']) assert.ok(api[k], k);
  assert.ok(api.BLOCK_TYPES.includes('faq'));
});
