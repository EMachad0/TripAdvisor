// Round 6: dated events (`when`), link checker, duplicates, independent review, runner gates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { ROOT, FIXTURES } from '../lib/paths.js';
import * as api from '../lib/index.js';
import { validatePlace, validateArea, validateAll, findDuplicates } from '../lib/validate.js';
import { eventDates, whenLabel, tripOverlap, tripOverlapInfo, sameDayGroups, looksDated } from '../lib/when.js';
import { collectLinks, checkUrl, checkLinks, linkReport, cachedLinkProblems } from '../lib/links.js';
import { loadReviews, reviewStatus, parseReviewOutput, extractJson, reviewArgs, REVIEW_TOOLS, REVIEW_DENIED, reviewPlace, reviewTargets, reviewFeedback, contentHash, verdictOf } from '../lib/review.js';
import { gapReport } from '../lib/gaps.js';
import { nextTasks } from '../lib/next.js';
import { mustDoStatus, readTaste } from '../lib/taste.js';
import { renderPlacePage, renderPlaceCard, renderAreaCard } from '../lib/render/index.js';
import { placeTemplate } from '../lib/scaffold.js';
import { ownContent } from '../lib/runner.js';
import { fixturePlace, fixtureCredits, fixtureMedia, tmpDir } from './helpers.js';

const atr = (args, env = {}) => spawnSync(path.join(ROOT, 'atr'), args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ATR_OFFLINE: '1', ...env } });
const errors = (issues) => issues.filter((i) => i.level === 'error');
const TRIP = { countries: [
  { id: 'china', from: '2026-12-06', to: '2027-01-02', days: 27, budget_brl_per_day: 170, cities: ['shanghai'] },
  { id: 'hong-kong', from: '2027-01-19', to: '2027-01-22', days: 3, budget_brl_per_day: 120, cities: ['hong-kong'] },
] };
const yuCtx = (extra = {}) => ({ credits: fixtureCredits(), mediaFiles: fixtureMedia(), fixtureMode: true, now: '2026-11-10', knownIds: new Set(['yu-garden', 'nanxiang-mantou-dian']), trip: TRIP, ...extra });
const withWhen = (dates, extra = {}) => ({ ...fixturePlace(), when: { dates, ...extra } });
const day = (d) => [{ from: d, to: d }];
let seq = 0;
const mk = (o = {}) => ({
  id: `q${++seq}`, name: `Place ${seq}`, name_local: `地${seq}`, country: 'china', city: 'shanghai', category: 'culture', kind: 'See', fame: 'popular',
  cost: { local: 10, currency: 'CNY', brl: 8 }, book_ahead: { required: false }, hours: { summary: 'x', winter: 'x' }, location: { address_local: '地', lat: 31.2 + seq / 100, lng: 121.4 },
  sources: [{ url: `https://a.example/${seq}`, checked: '2026-11-09' }, { url: `https://b.example/${seq}`, checked: '2026-11-09' }], confidence: 'high', last_updated: '2026-11-09',
  blocks: [{ type: 'hero' }, { type: 'highlights' }, { type: 'map' }, { type: 'tips' }, { type: 'weather' }], ...o,
});
const gaps = (places, extra = {}) => gapReport({ config: TRIP, taste: null, places, areas: [], now: '2026-11-10', linkCache: {}, reviews: new Map(), ...extra });

// ───────────────────────── when ─────────────────────────
test('when: labels are derived from the dates; a custom label wins', () => {
  assert.equal(whenLabel(withWhen(day('2026-12-31'))), '31 Dec only');
  assert.equal(whenLabel(withWhen([{ from: '2026-12-17', to: '2027-02-21' }])), '17 Dec – 21 Feb');
  assert.equal(whenLabel(withWhen([{ from: '2026-12-24', to: '2026-12-26' }])), '24–26 Dec');
  assert.equal(whenLabel(withWhen([...day('2026-12-31'), ...day('2026-12-24'), ...day('2027-01-01')])), '24 Dec, 31 Dec +1 more');
  assert.equal(whenLabel(withWhen(day('2026-12-31'), { label: "New Year's Eve only" })), "New Year's Eve only");
  assert.equal(whenLabel(fixturePlace()), null);
  assert.deepEqual(eventDates(withWhen([...day('2026-12-31'), ...day('2026-12-24')])).map((r) => r.from), ['2026-12-24', '2026-12-31']);
  assert.deepEqual(eventDates({ when: { dates: [{ from: 'soon', to: 'later' }] } }), []);
});

test('when: tripOverlap is always | full | partial | none against the days in that country', () => {
  assert.equal(tripOverlap(fixturePlace(), TRIP), 'always');
  assert.equal(tripOverlap(withWhen(day('2026-12-31')), TRIP), 'full');
  assert.equal(tripOverlap(withWhen(day('2027-01-02')), TRIP), 'full', 'the last day in the country counts');
  assert.equal(tripOverlap(withWhen([{ from: '2026-12-17', to: '2027-02-21' }]), TRIP), 'partial');
  assert.deepEqual(tripOverlapInfo(withWhen([{ from: '2026-12-17', to: '2027-02-21' }]), TRIP).usable, [{ from: '2026-12-17', to: '2027-01-02' }]);
  assert.equal(tripOverlap(withWhen(day('2025-12-31')), TRIP), 'none', 'wrong year');
  assert.equal(tripOverlap({ ...withWhen(day('2026-12-31')), country: 'hong-kong' }, TRIP), 'none', 'NYE fireworks while the traveler is there on Jan 19–22');
  assert.equal(tripOverlap({ ...withWhen(day('2026-12-31')), country: 'japan' }, TRIP), 'full', 'no trip dates for the country: assume fine');
});

test('when: no overlap is a warning with the fix-it text; partial overlap an info; bad ranges an error', () => {
  const hk = { ...withWhen(day('2026-12-31')), country: 'hong-kong' };
  const w = validatePlace(hk, yuCtx()).find((i) => i.path === 'when.dates');
  assert.equal(w.level, 'warning');
  assert.match(w.message, /the traveler is in Hong Kong on 19–22 Jan 2027, but this happens on 31 Dec/);
  assert.match(w.hint, /keep it only if the page says clearly that the route would have to change; otherwise drop it/);
  const partial = validatePlace(withWhen([{ from: '2026-12-17', to: '2027-02-21' }]), yuCtx()).find((i) => i.path === 'when.dates');
  assert.equal(partial.level, 'info');
  assert.match(partial.message, /usable 17 Dec – 2 Jan/);
  assert.ok(!validatePlace(withWhen(day('2026-12-31')), yuCtx()).some((i) => /^when/.test(i.path)));
  const bad = errors(validatePlace(withWhen([{ from: '2027-01-02', to: '2026-12-31' }]), yuCtx()));
  assert.match(bad.find((i) => i.path === 'when.dates[0]').message, /from 2027-01-02 is after to 2026-12-31/);
  assert.match(errors(validatePlace(withWhen([{ from: 'Dec 31', to: '2026-12-31' }]), yuCtx())).find((i) => i.path === 'when.dates[0].from').message, /not a valid date/);
  // areas too
  const area = { ...parse(fs.readFileSync(path.join(FIXTURES, 'areas/china/harbin.yaml'), 'utf8')), when: { dates: day('2027-02-10') } };
  const aw = validateArea(area, { fixtureMode: true, now: '2026-11-10', trip: TRIP, credits: [{ file: 'snow-sculpture' }], mediaFiles: ['snow-sculpture-640.webp'] }).find((i) => i.path === 'when.dates');
  assert.equal(aw.level, 'warning');
});

test('when: a place that looks date-bound without `when` gets an info hint, never a warning', () => {
  assert.match(looksDated({ name: 'Jiefangbei NYE Countdown', tags: [] }), /nye/);
  assert.match(looksDated({ name: 'Harbin', tags: ['christmas'] }), /christmas/);
  assert.match(looksDated({ name: 'X', best_time: 'Dec 31; at the waterfront by 20:00' }), /best_time starts with a date/);
  assert.equal(looksDated({ name: 'Yu Garden', tags: ['garden'], best_time: 'Weekday, right at opening' }), null);
  assert.equal(looksDated({ name: 'NYE', when: { dates: day('2026-12-31') } }), null);
  const p = { ...fixturePlace(), tags: ['fireworks'] };
  const i = validatePlace(p, yuCtx()).find((x) => x.path === 'when');
  assert.equal(i.level, 'info');
  assert.match(i.message, /looks date-bound/);
});

test('when: chip on card, hero and area card; quick fact with "dates not confirmed yet"; exported helpers', () => {
  const p = withWhen(day('2026-12-31'), { confirmed: false });
  const card = renderPlaceCard(p, { credits: fixtureCredits() });
  assert.match(card, /chip--when[^>]*>.*31 Dec only/);
  assert.match(card, /chip__q/);
  const page = renderPlacePage(p, { credits: fixtureCredits() });
  assert.match(page, /<li class="chip chip--flag chip--when chip--when-only"/);
  assert.match(page, /fact--when[\s\S]*?When<\/p><p class="fact__value">31 Dec only<\/p><p class="fact__sub">dates not confirmed yet<\/p>/);
  const labelled = renderPlacePage(withWhen(day('2026-12-31'), { label: "New Year's Eve only" }), { credits: fixtureCredits() });
  assert.match(labelled, /New Year&#39;s Eve only<\/p><p class="fact__sub">31 Dec<\/p>/);
  assert.doesNotMatch(renderPlaceCard(fixturePlace(), { credits: fixtureCredits() }), /chip--when/);
  const area = { ...parse(fs.readFileSync(path.join(FIXTURES, 'areas/china/harbin.yaml'), 'utf8')), when: { dates: [{ from: '2026-12-17', to: '2027-02-21' }] } };
  assert.match(renderAreaCard(area), /chip--when[^>]*>.*17 Dec – 21 Feb/);
  for (const k of ['eventDates', 'tripOverlap', 'sameDayGroups', 'whenLabel', 'loadReviews', 'reviewStatus', 'linkReport', 'findDuplicates']) assert.ok(api[k], k);
  assert.match(placeTemplate({ country: 'china', city: 'x', name: 'Y', today: '2026-11-10' }), /^# when:\s+# ONLY for date-bound places/m);
  const exported = JSON.parse(fs.readFileSync(path.join(ROOT, 'platform/schema/place.schema.json'), 'utf8'));
  assert.ok(exported.properties.when?.properties?.dates, 'run ./atr schema --export');
});

test('when: sameDayGroups and gaps (one low item per date; no overlap is MEDIUM)', () => {
  const a = mk({ id: 'nye-bund', when: { dates: day('2026-12-31') } }), b = mk({ id: 'nye-club', when: { dates: day('2026-12-31') } }), c = mk({ id: 'xmas', when: { dates: day('2026-12-24') } });
  const multi = mk({ id: 'festival', when: { dates: [{ from: '2026-12-20', to: '2026-12-31' }] } });
  const stay = mk({ id: 'nye-hostel', category: 'stay', kind: 'Stay', when: { dates: day('2026-12-31') } });
  const hk = mk({ id: 'hk-fireworks', country: 'hong-kong', city: 'hong-kong', when: { dates: day('2026-12-31') } });
  const g = sameDayGroups([a, b, c, multi, stay, hk]);
  assert.deepEqual(g.map((x) => [x.date, x.ids]), [['2026-12-31', ['nye-bund', 'nye-club', 'hk-fireworks']]]);
  const r = gaps([a, b, c, multi, stay, hk]);
  const same = r.items.filter((i) => i.kind === 'same-day');
  assert.equal(same.length, 1);
  assert.equal(same[0].severity, 'low');
  assert.match(same[0].message, /^3 places are only possible on 31 Dec: nye-bund, nye-club, hk-fireworks/);
  const ev = r.items.filter((i) => i.kind === 'event');
  assert.deepEqual(ev.map((i) => [i.id, i.severity]), [['hk-fireworks', 'medium']]);
  assert.match(ev[0].message, /happens on 31 Dec, but the traveler is in Hong Kong on 19–22 Jan/);
  assert.deepEqual(r.sameDay, [{ date: '2026-12-31', ids: ['nye-bund', 'nye-club', 'hk-fireworks'] }]);
});

// ───────────────────────── must_do type ─────────────────────────
test('must_do type: area items need an area card, stay items a stay card; wording follows', () => {
  const taste = { must_do: [{ key: 'cyber', said: 'cyberpunk city', country: 'china', city: 'chongqing', type: 'area' }, { key: 'pod', said: 'pod sleep capsule', country: 'japan', type: 'stay' }, { key: 'wall', said: 'great wall', country: 'china' }] };
  const place = mk({ id: 'liziba', city: 'chongqing', must_do: 'cyber' });
  const st = mustDoStatus(taste, [place, mk({ id: 'pod-a', country: 'japan', must_do: 'pod' }), mk({ id: 'wall-a', must_do: 'wall' })], []);
  assert.deepEqual(st.map((m) => [m.key, m.type, m.covered]), [['cyber', 'area', false], ['pod', 'stay', false], ['wall', 'place', true]]);
  const ok = mustDoStatus(taste, [mk({ id: 'pod-b', country: 'japan', category: 'stay', kind: 'Stay', must_do: 'pod' })], [{ id: 'chongqing', country: 'china', must_do: 'cyber' }]);
  assert.deepEqual(ok.map((m) => m.covered), [true, true, false]);
  assert.deepEqual(ok[1].claims, [{ id: 'pod-b', type: 'stay' }]);
  const r = gapReport({ config: TRIP, taste, places: [], areas: [], now: '2026-11-10', linkCache: {}, reviews: new Map() });
  assert.match(r.items.find((i) => i.key === 'cyber').message, /no area card claims/);
  assert.match(r.items.find((i) => i.key === 'pod').message, /no stay card claims/);
  const areas = [{ id: 'chongqing', country: 'china', name: 'Chongqing', cities: ['chongqing'] }];
  const tasks = nextTasks({ config: TRIP, taste, places: [], areas, now: '2026-11-10', validation: { results: [] }, feedback: { swipes: [], duels: [], questions: [] }, count: 50, linkCache: {}, reviews: new Map() }).tasks;
  assert.match(tasks.find((t) => /cyberpunk/.test(t.task)).task, /is an area: check that the area card chongqing really covers it, then claim it there with must_do: cyber\./);
  assert.match(tasks.find((t) => /pod sleep/.test(t.task)).task, /add the best stay card for it in Japan \(category stay, kind Stay/);
  assert.match(nextTasks({ config: TRIP, taste, places: [], areas: [], now: '2026-11-10', validation: { results: [] }, feedback: { swipes: [], duels: [], questions: [] }, count: 50, linkCache: {}, reviews: new Map() }).tasks.find((t) => /cyberpunk/.test(t.task)).task, /add an area card for it in Chongqing, China \(\.\/atr new area\)/);
  // a place claiming an area item is told so
  const w = validatePlace({ ...fixturePlace(), must_do: 'cyber' }, yuCtx({ mustDoKeys: ['cyber'], mustDoTypes: { cyber: 'area' } })).find((i) => i.path === 'must_do');
  assert.equal(w.level, 'warning');
  assert.match(w.message, /must-do for an area card/);
  // the spec accepts `type` and rejects typos
  const f = path.join(tmpDir(), 'taste.yaml');
  fs.writeFileSync(f, 'must_do:\n  - { key: a, said: x, type: area }\n  - { key: b, said: y, type: sty }\n');
  assert.match(readTaste({ tasteFile: f }).issues.find((i) => i.path === 'must_do[1].type').message, /Did you mean "stay"/);
});

// ───────────────────────── links ─────────────────────────
function server() {
  const srv = http.createServer((req, res) => {
    const u = req.url;
    if (u === '/ok') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html><title>Fine page</title></html>'); }
    if (u === '/gone') { res.writeHead(404); return res.end('nope'); }
    if (u === '/gone410') { res.writeHead(410); return res.end(); }
    if (u === '/forbidden') { res.writeHead(403); return res.end(); }
    if (u === '/busy') { res.writeHead(503); return res.end(); }
    if (u === '/moved') { res.writeHead(302, { Location: '/' }); return res.end(); }
    if (u === '/renamed') { res.writeHead(301, { Location: '/ok' }); return res.end(); }
    if (u === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<title>Home</title>'); }
    if (u === '/wall') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html><head><title>Just a moment...</title></head></html>'); }
    if (u === '/slow') return; // never answers
    res.writeHead(404); res.end();
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}` })));
}

test('links: every URL of a place is collected once, with its YAML path', () => {
  const links = collectLinks({
    sources: [{ url: 'https://a.example/1' }, { url: 'https://a.example/2' }],
    book_ahead: { link: 'https://b.example/book', links: [{ url: 'https://c.example/x' }, { url: 'https://a.example/1' }], notes: 'See [the notice](https://d.example/notice).' },
    blocks: [{ type: 'prose', text: 'Read [this](https://e.example/story) and [that](https://a.example/2).' }, { type: 'tips', items: ['[map](https://f.example/map)'] }],
  });
  assert.deepEqual(links.map((l) => [l.url, l.pathArr.join('.'), l.what]), [
    ['https://a.example/1', 'sources.0.url', 'source'], ['https://a.example/2', 'sources.1.url', 'source'],
    ['https://b.example/book', 'book_ahead.link', 'booking link'], ['https://c.example/x', 'book_ahead.links.0.url', 'booking link'],
    ['https://d.example/notice', 'book_ahead.notes', 'link in text'], ['https://e.example/story', 'blocks.0.text', 'link in text'], ['https://f.example/map', 'blocks.1.items.0', 'link in text'],
  ]);
});

test('links: ok, dead, moved, blocked and timeout are told apart (local server, no network)', async () => {
  const { srv, base } = await server();
  try {
    const st = async (p, o) => (await checkUrl(base + p, o)).status;
    assert.equal(await st('/ok'), 'ok');
    assert.equal(await st('/renamed'), 'ok', 'a redirect to another real page is fine');
    assert.equal(await st('/gone'), 'dead');
    assert.equal(await st('/gone410'), 'dead');
    assert.equal(await st('/forbidden'), 'blocked');
    assert.equal(await st('/busy'), 'blocked');
    assert.equal(await st('/wall'), 'blocked', 'bot-check page');
    const moved = await checkUrl(base + '/moved');
    assert.equal(moved.status, 'moved');
    assert.match(moved.detail, /home page/);
    assert.equal(await st('/slow', { timeoutMs: 150 }), 'timeout');
    const closed = await server();
    await new Promise((r) => closed.srv.close(r));
    assert.equal((await checkUrl(closed.base + '/x')).status, 'dead', 'connection refused');
    assert.equal((await checkUrl('https://www.trip.com/travel-guide/attraction/x', { fetch: () => { throw new Error('must not fetch'); } })).status, 'blocked');
    assert.equal((await checkUrl('https://x.klook.com/y', { fetch: () => { throw new Error('must not fetch'); } })).status, 'blocked');
    const dns = await checkUrl('https://x.example/', { fetch: async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }); } });
    assert.deepEqual([dns.status, dns.detail], ['dead', 'the domain does not exist (DNS)']);
    assert.equal((await checkUrl('https://x.example/', { fetch: async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'CERT_HAS_EXPIRED' } }); } })).status, 'dead');
  } finally { srv.close(); srv.closeAllConnections?.(); }
});

test('links: report has file, YAML line, URL and what to do; results are cached for 24 h; gaps reads the cache', async () => {
  const { srv, base } = await server();
  const dir = tmpDir();
  const file = path.join(dir, 'place.yaml');
  fs.writeFileSync(file, `id: x\nsources:\n  - url: ${base}/ok\n  - url: ${base}/gone\nbook_ahead:\n  links:\n    - url: ${base}/moved\n    - url: https://www.trip.com/things-to-do/detail/1/\n`);
  const cacheFile = path.join(dir, 'links.json');
  let hits = 0;
  const counting = (...a) => { hits++; return fetch(...a); };
  try {
    const r = await linkReport([{ file, id: 'x', kind: 'place' }], { offline: false, cacheFile, fetch: counting });
    assert.deepEqual(r.counts, { ok: 1, dead: 1, moved: 1, blocked: 1, timeout: 0 });
    assert.deepEqual([r.errors, r.warnings], [1, 1]);
    const by = Object.fromEntries(r.results[0].issues.map((i) => [i.status, i]));
    assert.deepEqual([by.dead.level, by.dead.path, by.dead.line], ['error', 'sources[1].url', 4]);
    assert.match(by.dead.message, new RegExp(`source dead: ${base}/gone — HTTP 404`));
    assert.match(by.dead.hint, /find the page's new URL or replace the source; never keep a source you can't open/);
    assert.deepEqual([by.moved.level, by.moved.line], ['warning', 7]);
    assert.equal(by.blocked.level, 'info');
    assert.match(by.blocked.hint, /say how you found it in `confidence_note`/);
    assert.equal(hits, 3, 'the bot-walled host is not fetched');
    await linkReport([{ file, id: 'x', kind: 'place' }], { offline: false, cacheFile, fetch: counting });
    assert.equal(hits, 3, 'second run comes from the cache');
    await linkReport([{ file, id: 'x', kind: 'place' }], { offline: false, cacheFile, fetch: counting, fresh: true });
    assert.equal(hits, 6, '--fresh bypasses it');
    const later = await checkLinks([`${base}/ok`], { cacheFile, fetch: counting, now: Date.now() + 25 * 3600 * 1000 });
    assert.equal(later[`${base}/ok`].cached, false, 'entries expire after 24 h');
    // gaps: cache only, no network
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    const p = mk({ id: 'x', sources: [{ url: `${base}/ok`, checked: '2026-11-09' }, { url: `${base}/gone`, checked: '2026-11-09' }], book_ahead: { required: false, links: [{ url: `${base}/moved` }] } });
    assert.deepEqual(cachedLinkProblems(p, cache).map((l) => l.status), ['dead', 'moved']);
    const g = gaps([p], { linkCache: cache }).items.filter((i) => i.kind === 'links');
    assert.deepEqual(g.map((i) => i.severity), ['high', 'medium']);
    assert.match(g[0].message, /source dead: .*\/gone/);
    assert.equal((await linkReport([{ file, id: 'x', kind: 'place' }], { offline: true })).offline, true);
  } finally { srv.close(); srv.closeAllConnections?.(); }
});

test('cli: links says it cannot check offline and exits 0; the command is documented', () => {
  const r = atr(['links', '--all', '--fixtures']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /can't be checked offline/);
  assert.equal(JSON.parse(atr(['links', 'yu-garden', '--fixtures', '--json']).stdout).offline, true);
  assert.match(atr(['links', '--help']).stdout, /--fresh/);
  assert.match(atr(['links', 'no-such-place'], { ATR_OFFLINE: '' }).stderr, /nothing found for "no-such-place"/);
});

// ───────────────────────── duplicates ─────────────────────────
test('duplicates: same name_local, or within ~80 m with similar names; stays and other dates are not duplicates', () => {
  const at = (lat, lng) => ({ address_local: '地', lat, lng });
  const a = mk({ id: 'yu-garden', name: 'Yu Garden', name_local: '豫园', location: at(31.2272, 121.4921) });
  const b = mk({ id: 'yuyuan', name: 'Yuyuan Garden (Yu Garden)', name_local: '豫园', location: at(31.2301, 121.4900) });
  const c = mk({ id: 'yu-garden-teahouse', name: 'Yu Garden Teahouse', name_local: '湖心亭', location: at(31.2274, 121.4923) });
  const far = mk({ id: 'another-garden', name: 'Yu Garden Annex', name_local: '别院', location: at(31.3, 121.6) });
  const stay = mk({ id: 'yu-garden-hostel', name: 'Yu Garden Hostel', name_local: '豫园', category: 'stay', kind: 'Stay', location: at(31.2272, 121.4921) });
  const d = findDuplicates([a, b, c, far, stay]);
  assert.deepEqual(d.map((x) => [x.a.id, x.b.id]), [['yu-garden', 'yuyuan'], ['yu-garden', 'yu-garden-teahouse']]);
  assert.match(d[0].reason, /both have name_local 豫园/);
  assert.match(d[1].reason, /^\d+ m apart with similar names$/);
  const spot = at(31.24, 121.49);
  const xmas = mk({ id: 'bund-christmas', name: 'Bund Lights', name_local: '外滩', location: spot, when: { dates: [{ from: '2026-12-24', to: '2026-12-25' }] } });
  const nye = mk({ id: 'bund-nye', name: 'Bund Lights', name_local: '外滩', location: spot, when: { dates: [{ from: '2026-12-31', to: '2026-12-31' }] } });
  const bund = mk({ id: 'the-bund', name: 'Bund Lights', name_local: '外滩', location: spot });
  assert.deepEqual(findDuplicates([xmas, nye, bund]), [], 'events on different dates, and an event vs the permanent place');
  assert.equal(findDuplicates([nye, { ...nye, id: 'bund-nye-2' }]).length, 1, 'the same event twice');
  assert.equal(findDuplicates([a, { ...a, id: 'k', country: 'korea' }]).length, 0);
});

test('duplicates: validate --all warns on both files and says to merge or rename', () => {
  const root = tmpDir();
  const src = path.join(FIXTURES, 'places/china/shanghai/nanxiang-mantou-dian');
  for (const id of ['nanxiang-mantou-dian', 'nanxiang-bun-shop']) {
    const dir = path.join(root, 'places/china/shanghai', id);
    fs.cpSync(src, dir, { recursive: true });
    const f = path.join(dir, 'place.yaml');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^id: .*$/m, `id: ${id}`).replace(/^fixture: true\n/m, ''));
  }
  const r = validateAll({ root, fixtures: false, now: '2026-11-10', taste: null, config: null });
  const dup = r.results.map((x) => x.issues.find((i) => /same place/.test(i.message)));
  assert.equal(dup.filter(Boolean).length, 2);
  assert.equal(dup[0].level, 'warning');
  assert.match(dup[0].message, /looks like the same place as "Nanxiang Mantou Dian" \(china\/shanghai\/nanxiang-mantou-dian\/place\.yaml\): both have name_local/);
  assert.match(dup[0].hint, /merge the two pages, or make the difference clear in both names/);
  assert.equal(r.errors, 0);
  assert.ok(!validateAll({ fixtures: true, now: '2026-11-10' }).results.some((x) => x.issues.some((i) => /same place/.test(i.message))), 'fixtures have no duplicates');
});

// ───────────────────────── review ─────────────────────────
const OUT = { facts: { supported: 9, unsupported: 2, contradicted: 1 }, issues: [{ severity: 'blocker', field: 'hours.summary', problem: 'Page says 23:00; the operator says 22:30.', evidence: 'https://example.org/t', fix: 'Change to 22:30.' }, { severity: 'nit', field: 'why', problem: 'Wordy.', fix: 'Trim.' }], summary: 'One wrong closing time.' };

test('review: the answer is parsed robustly (structured output, fenced block, bare JSON) and validated with fix-it errors', () => {
  assert.deepEqual(parseReviewOutput({ structured_output: OUT, result: '' }).data, OUT);
  assert.deepEqual(parseReviewOutput({ result: `Here is my review.\n\n\`\`\`json\n${JSON.stringify(OUT, null, 2)}\n\`\`\`\nDone.` }).data, OUT);
  assert.deepEqual(parseReviewOutput({ result: `Verdict below. ${JSON.stringify(OUT)}` }).data, OUT);
  assert.deepEqual(parseReviewOutput({ result: JSON.stringify({ ...OUT, verdict: 'pass' }) }).data, OUT, 'a verdict from the reviewer is ignored');
  assert.match(parseReviewOutput({ result: 'All good, nothing to report.' }).errors[0], /no JSON object/);
  const bad = parseReviewOutput({ result: JSON.stringify({ ...OUT, issues: [{ severity: 'blokker', field: 'x', problem: 'y', fix: 'z' }] }) });
  assert.match(bad.errors[0], /issues\[0\]\.severity: .*Did you mean "blocker"/);
  assert.equal(extractJson({ result: '[1,2]' }), null);
  assert.equal(verdictOf(OUT.issues), 'fix');
  assert.equal(verdictOf([{ severity: 'nit' }]), 'pass');
  assert.equal(verdictOf([{ severity: 'should' }]), 'fix');
});

test('review: the reviewer session is read-only and gets its own guide', () => {
  const a = reviewArgs({ prompt: 'x', model: 'sonnet', maxBudgetUsd: 2 });
  assert.equal(a[a.indexOf('--allowedTools') + 1], 'Read,Glob,Grep,Bash,WebSearch,WebFetch,Agent,ToolSearch');
  for (const t of ['Write', 'Edit', 'NotebookEdit', 'Bash(./atr new:*)', 'Bash(./atr media:*)', 'Bash(./atr run:*)']) assert.ok(REVIEW_DENIED.includes(t), t);
  assert.ok(!REVIEW_TOOLS.includes('Write') && !REVIEW_TOOLS.includes('Edit'));
  assert.equal(a[a.indexOf('--permission-mode') + 1], 'dontAsk');
  assert.ok(a.includes('--json-schema'));
  assert.equal(JSON.parse(a[a.indexOf('--json-schema') + 1]).required.join(), 'facts,issues,summary');
  const sys = a[a.indexOf('--append-system-prompt') + 1];
  assert.match(sys, /You did not write the page/);
  assert.match(sys, /# Reviewer guide/);
  assert.match(sys, /Read-only/);
  assert.equal(a[a.indexOf('--max-budget-usd') + 1], '2');
  assert.ok(fs.existsSync(path.join(ROOT, 'docs/REVIEWER-GUIDE.md')));
});

/** A data root with one valid place, plus a fake claude that answers from a script file. */
function reviewRoot(answers) {
  const root = tmpDir();
  const dir = path.join(root, 'places/china/shanghai/nanxiang-mantou-dian');
  fs.cpSync(path.join(FIXTURES, 'places/china/shanghai/nanxiang-mantou-dian'), dir, { recursive: true });
  const file = path.join(dir, 'place.yaml');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^fixture: true\n/m, ''));
  const fake = path.join(root, 'fake-claude.mjs');
  fs.writeFileSync(path.join(root, 'answers.json'), JSON.stringify(answers));
  fs.writeFileSync(fake, `#!/usr/bin/env node
import fs from 'node:fs';
const root = ${JSON.stringify(root)};
const log = root + '/calls.log';
const n = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\\n').length : 0;
const args = process.argv.slice(2);
const kind = args.includes('--json-schema') ? 'review' : 'curator';
fs.appendFileSync(log, kind + (args.includes('--resume') ? ':resume' : '') + '\\n');
const a = JSON.parse(fs.readFileSync(root + '/answers.json', 'utf8'))[n] || { result: 'done' };
if (a.touch) fs.appendFileSync(${JSON.stringify(file)}, '\\n# touched ' + n + '\\n');
console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-' + kind, model: 'fake-model' }));
if (a.touch) console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: ${JSON.stringify(file)} } }] } }));
console.log(JSON.stringify({ type: 'result', session_id: 'sess-' + kind, result: a.result ?? '', structured_output: a.structured_output, total_cost_usd: a.cost ?? 0.25, num_turns: 1 }));
`);
  fs.chmodSync(fake, 0o755);
  return { root, file, fake, calls: () => fs.readFileSync(path.join(root, 'calls.log'), 'utf8').trim().split('\n') };
}
async function withEnv(env, fn) {
  const old = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  try { return await fn(); } finally { for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

test('review: a fake reviewer writes reviews/<id>.yaml; reviewStatus is fix, then stale once the page changes', async () => {
  const { root, file, fake, calls } = reviewRoot([{ structured_output: OUT, cost: 0.61 }]);
  await withEnv({ ATR_DATA_ROOT: root, ATR_CLAUDE_BIN: fake }, async () => {
    const r = await reviewPlace({ id: 'nanxiang-mantou-dian', runDir: path.join(root, 'runs') });
    assert.deepEqual([r.verdict, r.parsedFirstTime, r.cost_usd, r.model], ['fix', true, 0.61, 'fake-model']);
    const saved = parse(fs.readFileSync(path.join(root, 'reviews/nanxiang-mantou-dian.yaml'), 'utf8'));
    assert.deepEqual(Object.keys(saved), ['id', 'type', 'reviewed', 'verdict', 'content_hash', 'facts', 'issues', 'summary', 'model', 'cost_usd']);
    assert.equal(saved.content_hash, contentHash(file));
    assert.equal(saved.issues[0].evidence, 'https://example.org/t');
    assert.deepEqual(calls(), ['review']);
    const [place] = api.loadPlaces({});
    const st = reviewStatus(place, loadReviews({}));
    assert.deepEqual([st.state, st.reviewed, st.issues.length], ['fix', saved.reviewed, 2]);
    assert.deepEqual(reviewTargets({ changed: true }), []);
    // gaps: blocker HIGH; next: right after validation errors
    const g = gapReport({ config: TRIP, taste: null, now: '2026-11-10', linkCache: {} }).items.filter((i) => i.kind === 'review');
    assert.deepEqual(g.map((i) => [i.severity, i.id]), [['high', 'nanxiang-mantou-dian']]);
    assert.match(g[0].message, /hours\.summary: Page says 23:00; the operator says 22:30\. → Change to 22:30\./);
    const tasks = nextTasks({ config: TRIP, taste: null, now: '2026-11-10', linkCache: {}, feedback: { swipes: [], duels: [], questions: [] }, validation: { results: [] }, count: 20 }).tasks;
    assert.equal(tasks[0].kind, 'review');
    assert.match(tasks[0].task, /^Fix review findings on nanxiang-mantou-dian: hours\.summary/);
    assert.match(tasks[0].why, /1 open issue on this page, 1 blocker among them/);
    // the page changes → stale: findings no longer shown, one grouped low line instead
    fs.appendFileSync(file, '\n# edited\n');
    assert.equal(reviewStatus(api.loadPlaces({})[0], loadReviews({})).state, 'stale');
    assert.deepEqual(reviewTargets({ changed: true }), ['nanxiang-mantou-dian']);
    const g2 = gapReport({ config: TRIP, taste: null, now: '2026-11-10', linkCache: {} }).items.filter((i) => i.kind === 'review');
    assert.deepEqual(g2.map((i) => i.severity), ['low']);
    assert.match(g2[0].message, /1 changed since their review \(nanxiang-mantou-dian\): run \.\/atr review --changed/);
  });
});

test('review: an unusable answer gets one retry in the same session; two bad answers are an error, no file', async () => {
  const a = reviewRoot([{ result: 'Looks fine to me!' }, { result: '```json\n' + JSON.stringify({ ...OUT, issues: [] }) + '\n```' }]);
  await withEnv({ ATR_DATA_ROOT: a.root, ATR_CLAUDE_BIN: a.fake }, async () => {
    const r = await reviewPlace({ id: 'nanxiang-mantou-dian', runDir: path.join(a.root, 'runs') });
    assert.deepEqual([r.verdict, r.parsedFirstTime, r.cost_usd], ['pass', false, 0.25]); // the retry resumes the session: its total_cost_usd is cumulative
    assert.deepEqual(a.calls(), ['review', 'review:resume']);
    assert.equal(reviewStatus(api.loadPlaces({})[0], loadReviews({})).state, 'pass');
  });
  const b = reviewRoot([{ result: 'no json' }, { result: 'still none' }]);
  await withEnv({ ATR_DATA_ROOT: b.root, ATR_CLAUDE_BIN: b.fake }, async () => {
    const r = await reviewPlace({ id: 'nanxiang-mantou-dian', runDir: path.join(b.root, 'runs') });
    assert.match(r.error, /did not return valid JSON/);
    assert.ok(!fs.existsSync(path.join(b.root, 'reviews/nanxiang-mantou-dian.yaml')));
    assert.equal((await reviewPlace({ id: 'nope' })).error, 'place "nope" not found');
  });
});

test('review: a passing, current review shows "Fact-checked <date>" in the footer; fix, stale and none do not', () => {
  const p = fixturePlace();
  assert.match(renderPlacePage(p, { credits: fixtureCredits(), review: { state: 'pass', reviewed: '2026-11-10' } }), /conf--checked[^>]*>.*Fact-checked 10 Nov 2026/);
  for (const state of ['fix', 'stale', 'none']) assert.doesNotMatch(renderPlacePage(p, { credits: fixtureCredits(), review: { state, reviewed: '2026-11-10' } }), /Fact-checked/);
  assert.doesNotMatch(renderPlacePage(p, { credits: fixtureCredits() }), /Fact-checked/);
  // the fixture review matches the fixture file (regenerate the hash when the yu-garden fixture changes)
  const yu = api.loadPlaces({ fixtures: true }).find((x) => x.id === 'yu-garden');
  assert.equal(reviewStatus(yu, loadReviews({ fixtures: true })).state, 'pass', 'platform/test/fixtures/reviews/yu-garden.yaml content_hash is out of date');
  assert.equal(reviewStatus({ id: 'never' }, new Map()).state, 'none');
});

test('cli: review --dry-run prints the reviewer command; --changed picks unreviewed places', () => {
  const r = atr(['review', '--changed', '--dry-run', '--fixtures']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /would review 7 page\(s\)/); // 3 places + 4 areas without a current review
  assert.doesNotMatch(r.stdout, /▶ review yu-garden/);
  assert.match(r.stdout, /--json-schema/);
  assert.match(r.stdout, /--allowedTools Read,Glob,Grep,Bash,WebSearch,WebFetch,Agent,ToolSearch/);
  assert.match(atr(['review']).stderr, /which place/);
  assert.match(atr(['review', 'harbin', '--dry-run', '--fixtures']).stdout, /Review the AREA page `harbin`/);
  assert.match(atr(['review', 'nope', '--dry-run', '--fixtures']).stderr, /no place or area "nope"/);
});

// ───────────────────────── runner gates ─────────────────────────
test('runner: after a clean validate, review findings go back to the curator once and only those places are re-reviewed', async () => {
  const pass = { ...OUT, issues: [OUT.issues[1]] };
  // calls: curator (edits the page) → reviewer: fix → curator resume (edits) → reviewer: pass
  const { root, fake, calls } = reviewRoot([{ result: 'added it', touch: true, cost: 1 }, { structured_output: OUT, cost: 0.5 }, { result: 'fixed', touch: true, cost: 0.4 }, { structured_output: pass, cost: 0.3 }]);
  await withEnv({ ATR_DATA_ROOT: root, ATR_CLAUDE_BIN: fake }, async () => {
    const { runCurator } = await import('../lib/runner.js');
    const r = await runCurator({ task: 'test', maxRounds: 1, links: false, log: () => {} });
    assert.deepEqual(calls(), ['curator', 'review', 'curator:resume', 'review']);
    assert.equal(r.clean, true);
    assert.equal(r.rounds.length, 2, 'the review feedback round is on top of --max-rounds');
    assert.deepEqual(r.rounds.map((x) => x.post), [[{ name: 'review', ok: false }], [{ name: 'review', ok: true }]]);
    const prompt = fs.readFileSync(path.join(r.dir, 'round-2.prompt.md'), 'utf8');
    assert.match(prompt, /An independent reviewer opened your sources/);
    assert.match(prompt, /### nanxiang-mantou-dian\n- \[blocker\] hours\.summary: Page says 23:00; the operator says 22:30\.\n  evidence: https:\/\/example\.org\/t\n  fix: Change to 22:30\./);
    assert.match(prompt, /say why in `confidence_note`/);
    assert.doesNotMatch(prompt, /Wordy/, 'nits are not sent back');
    assert.deepEqual(r.pages, [{ id: 'nanxiang-mantou-dian', type: 'place', change: 'changed', validation: 'ok', links: 'skipped', review: 'pass', open_issues: 0 }]);
    assert.deepEqual([r.cost, r.cost_curator, r.cost_review], [2.2, 1.4, 0.8]);
    const saved = JSON.parse(fs.readFileSync(path.join(r.dir, 'summary.json'), 'utf8'));
    assert.deepEqual(saved.pages, r.pages);
    assert.equal(saved.cost_review, 0.8);
    fs.rmSync(r.dir, { recursive: true, force: true });
  });
});

test('runner: a review that still says fix after its one feedback round ends the run as not clean; --no-review skips it', async () => {
  const a = reviewRoot([{ result: 'added', touch: true }, { structured_output: OUT }, { result: 'tried', touch: true }, { structured_output: OUT }, { result: 'should never run' }]);
  await withEnv({ ATR_DATA_ROOT: a.root, ATR_CLAUDE_BIN: a.fake }, async () => {
    const { runCurator } = await import('../lib/runner.js');
    const r = await runCurator({ task: 'test', maxRounds: 3, links: false, log: () => {} });
    assert.deepEqual(a.calls(), ['curator', 'review', 'curator:resume', 'review']);
    assert.equal(r.clean, false);
    assert.deepEqual(r.pages.map((p) => [p.review, p.open_issues]), [['fix', 1]]);
    fs.rmSync(r.dir, { recursive: true, force: true });
  });
  const b = reviewRoot([{ result: 'added', touch: true }]);
  await withEnv({ ATR_DATA_ROOT: b.root, ATR_CLAUDE_BIN: b.fake }, async () => {
    const { runCurator } = await import('../lib/runner.js');
    const r = await runCurator({ task: 'test', links: false, review: false, log: () => {} });
    assert.deepEqual(b.calls(), ['curator']);
    assert.deepEqual([r.clean, r.pages[0].review, r.cost_review], [true, 'skipped', undefined]);
    fs.rmSync(r.dir, { recursive: true, force: true });
  });
});

test('runner: dead links on changed pages go back to the same session as errors to fix', async () => {
  const { root, fake, calls } = reviewRoot([{ result: 'added', touch: true }, { result: 'replaced the source', touch: true }]);
  await withEnv({ ATR_DATA_ROOT: root, ATR_CLAUDE_BIN: fake, ATR_OFFLINE: '' }, async () => {
    const { runCurator } = await import('../lib/runner.js');
    let n = 0;
    const seen = [];
    const linkReport = async (files) => { seen.push(files.map((f) => `${f.kind}:${f.id}`)); n++; return { results: files.map((f) => ({ ...f, links: 2, issues: n === 1 ? [{ level: 'error', path: 'sources[1].url', line: 44, status: 'dead', message: 'source dead: https://example.com/gone — HTTP 404: the page is gone', hint: "find the page's new URL or replace the source; never keep a source you can't open" }, { level: 'info', path: 'sources[0].url', status: 'blocked', message: 'blocked' }] : [] })) }; };
    const r = await runCurator({ task: 'test', maxRounds: 3, review: false, linkReport, log: () => {} });
    assert.deepEqual(calls(), ['curator', 'curator:resume']);
    assert.deepEqual(seen, [['place:nanxiang-mantou-dian'], ['place:nanxiang-mantou-dian']]);
    assert.equal(r.clean, true);
    assert.deepEqual(r.rounds.map((x) => x.post), [[{ name: 'links', ok: false }], [{ name: 'links', ok: true }]]);
    const prompt = fs.readFileSync(path.join(r.dir, 'round-2.prompt.md'), 'utf8');
    assert.match(prompt, /The link check found dead links/);
    assert.match(prompt, /place\.yaml:44 sources\[1\]\.url: source dead: https:\/\/example\.com\/gone/);
    assert.doesNotMatch(prompt, /blocked/);
    assert.equal(r.pages[0].links, 'ok');
    fs.rmSync(r.dir, { recursive: true, force: true });
  });
});

test('runner: only pages this session touched count as its own (another curator may be live)', () => {
  const content = { places: { created: ['mine-new', 'theirs-new'], changed: ['mine-old', 'theirs-old'], deleted: [] }, areas: { created: ['my-area'], changed: ['their-area'], deleted: [] } };
  const writes = { files: new Set([path.join(ROOT, 'places/china/x/mine-new/place.yaml'), path.join(ROOT, 'areas/china/my-area.yaml')]), commands: ['./atr media fetch mine-old "File:X.jpg" --as a', './atr validate --all'] };
  assert.deepEqual(ownContent(content, writes), { places: { created: ['mine-new'], changed: ['mine-old'], deleted: [] }, areas: { created: ['my-area'], changed: [], deleted: [] } });
  assert.deepEqual(ownContent(content, { files: new Set(), commands: [] }), content, 'no tool events at all: everything counts');
});

test('cli: run --dry-run mentions the gates; --no-links / --no-review / --review-rounds are accepted', () => {
  const r = atr(['run', 'add 1 place', '--dry-run']);
  assert.match(r.stdout, /\.\/atr links on the pages it changed/);
  assert.match(r.stdout, /one reviewer session per changed place/);
  const off = atr(['run', 'add 1 place', '--dry-run', '--no-links', '--no-review', '--review-rounds', '2']);
  assert.equal(off.status, 0, off.stderr);
  assert.doesNotMatch(off.stdout, /reviewer session/);
  assert.match(reviewFeedback([{ id: 'a', verdict: 'pass', issues: [] }]), /^$/);
});
