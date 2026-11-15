// Game tests: Elo, pairing, board maths (cutoff/balance/budget/book-ahead), feedback writing,
// the server API and pages. Uses game/test/fixtures and temp dirs, never real places.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeRatings, update, expected, confidence, SEED } from '../lib/elo.js';
import { pickPair, pairKey } from '../lib/pairing.js';
import { rankCountry, cutoff, balance, budget, bookAhead, buildBoard, holidayDate, countryOn, addDays, daysFor, holidayOptions, holidayRange, holidayDay, picksMany, HOLIDAYS, LUNAR_NEW_YEAR } from '../lib/board.js';
import { appendEvent, latestVerdicts, readState, writeState, trackSeen } from '../lib/store.js';
import { readFeedback, loadTripConfig } from '../../platform/lib/index.js';
import { startServer, holidayFacts } from '../server.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'atr-game-'));
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const COUNTRIES = [
  { id: 'china', name: 'China', days: 3, budget_brl_per_day: 100, from: '2026-12-06', to: '2027-01-02' },
  { id: 'korea', name: 'Korea', days: 2, budget_brl_per_day: 50, from: '2027-01-02', to: '2027-01-10' },
];
const P = (id, o = {}) => ({ id, name: id, country: 'china', city: 'x', category: 'culture', verdict: 'must', rating: 1500, brl: 10, budgeted: true, booking: { level: 'none' }, tags: [], ...o });

// ---------------- Elo ----------------
test('elo: expected score is symmetric and update is zero-sum', () => {
  assert.equal(expected(1500, 1500), 0.5);
  assert.ok(Math.abs(expected(1600, 1400) + expected(1400, 1600) - 1) < 1e-12);
  const u = update(1500, 1500);
  assert.equal(u.delta, 16);
  assert.equal(u.winner + u.loser, 3000);
  assert.ok(update(1400, 1600).delta > update(1600, 1400).delta, 'upsets move more');
});

test('elo: computeRatings seeds by verdict and replays duels in order', () => {
  const r = computeRatings({ a: 'must', b: 'maybe', c: 'skip' }, [{ winner: 'b', loser: 'a' }, { winner: 'b', loser: 'a' }]);
  assert.equal(r.get('c').rating, SEED.skip);
  assert.equal(r.get('a').games, 2);
  assert.equal(r.get('b').wins, 2);
  assert.ok(r.get('b').rating > SEED.maybe && r.get('a').rating < SEED.must);
  assert.equal(r.get('a').rating + r.get('b').rating, SEED.must + SEED.maybe);
  // unknown ids in duels get START; self-duels are ignored
  const r2 = computeRatings({}, [{ winner: 'x', loser: 'x' }, { winner: 'x', loser: 'y' }]);
  assert.equal(r2.get('x').rating, 1516);
});

test('elo: confidence is mean of min(games,4)/4', () => {
  const r = computeRatings({}, [{ winner: 'a', loser: 'b' }, { winner: 'a', loser: 'b' }]);
  assert.equal(confidence(['a', 'b'], r), 0.5);
  assert.equal(confidence(['a', 'z'], r), 0.25);
  assert.equal(confidence([], r), 0);
});

// ---------------- pairing ----------------
test('pairing: null with fewer than 2, never pairs an item with itself', () => {
  assert.equal(pickPair([{ id: 'a', country: 'china' }], new Map()), null);
  const p = pickPair([{ id: 'a', country: 'china' }, { id: 'b', country: 'korea' }], new Map(), [], { rng: seq([0.99, 0.1]) });
  assert.deepEqual(new Set(p.map((x) => x.id)), new Set(['a', 'b']));
});

test('pairing: prefers same country, close ratings and uncertain items', () => {
  const pool = [{ id: 'c1', country: 'china' }, { id: 'c2', country: 'china' }, { id: 'c3', country: 'china' }, { id: 'k1', country: 'korea' }];
  const ratings = new Map([['c1', { rating: 1500, games: 0 }], ['c2', { rating: 1505, games: 0 }], ['c3', { rating: 1800, games: 0 }], ['k1', { rating: 1502, games: 0 }]]);
  const p = pickPair(pool, ratings, [], { rng: () => 0 }); // rng 0 → same-country mode, no jitter
  assert.deepEqual(new Set(p.map((x) => x.id)), new Set(['c1', 'c2']));
  // uncertainty: a settled close pair loses to an unsettled one
  const r2 = new Map([['c1', { rating: 1500, games: 20 }], ['c2', { rating: 1500, games: 20 }], ['c3', { rating: 1560, games: 0 }]]);
  const p2 = pickPair(pool.slice(0, 3), r2, [], { rng: () => 0 });
  assert.ok(p2.some((x) => x.id === 'c3'));
});

test('pairing: avoids repeats and the items from the last duel', () => {
  const pool = ['a', 'b', 'c', 'd'].map((id) => ({ id, country: 'china' }));
  const ratings = new Map(pool.map((p) => [p.id, { rating: 1500, games: 1 }]));
  const p = pickPair(pool, ratings, [{ winner: 'a', loser: 'b' }], { rng: () => 0 });
  assert.deepEqual(new Set(p.map((x) => x.id)), new Set(['c', 'd']));
  assert.equal(pairKey('b', 'a'), pairKey('a', 'b'));
});

test('pairing: country filter restricts the pool', () => {
  const pool = [{ id: 'c1', country: 'china' }, { id: 'k1', country: 'korea' }, { id: 'k2', country: 'korea' }];
  const p = pickPair(pool, new Map(), [], { country: 'korea', rng: Math.random });
  assert.ok(p.every((x) => x.country === 'korea'));
  assert.equal(pickPair(pool, new Map(), [], { country: 'china' }), null);
});

// ---------------- board ----------------
test('board: rank = locked first, then rating, Must before Maybe on ties; skip excluded', () => {
  const places = [P('a', { rating: 1500, verdict: 'maybe' }), P('b', { rating: 1500 }), P('c', { rating: 1600 }), P('d', { verdict: 'skip', rating: 1900 }), P('e', { verdict: null, rating: 1400 })];
  assert.deepEqual(rankCountry(places, 'china').map((p) => p.id), ['c', 'b', 'a']);
  assert.deepEqual(rankCountry(places, 'china', { nye: 'e' }).map((p) => p.id), ['e', 'c', 'b', 'a']);
});

test('board: cutoff at days, open days when the list is short', () => {
  const r = ['a', 'b', 'c', 'd'].map((id) => P(id));
  assert.deepEqual(cutoff(r, 3).above.map((p) => p.id), ['a', 'b', 'c']);
  assert.deepEqual(cutoff(r, 3).below.map((p) => p.id), ['d']);
  assert.equal(cutoff(r, 6).open, 2);
  assert.equal(cutoff(r, 0).above.length, 0);
  assert.equal(daysFor({ id: 'china', days: 27 }, { china: 20 }), 20);
  assert.equal(daysFor({ id: 'china', days: 27 }, {}), 27);
  assert.equal(daysFor({ id: 'china', days: 27 }, { china: 0 }), 0);
});

test('board: balance flags a dominant category and missing interests', () => {
  const picks = [P('a', { category: 'food' }), P('b', { category: 'food' }), P('c', { category: 'food' }), P('d', { category: 'views' }), P('e', { category: 'culture' })];
  const b = balance(picks, { interests: ['food', 'nature', 'views'], dominantShare: 0.4, labels: { food: 'Food', nature: 'Nature' } });
  assert.equal(b.dominant.category, 'food');
  assert.equal(b.dominant.share, 0.6);
  assert.deepEqual(b.missing, ['nature']);
  assert.ok(b.nudges[0].text.startsWith('Heavy on Food'));
  // too few picks: no nudges
  const small = balance(picks.slice(0, 3), { interests: ['nature'] });
  assert.equal(small.dominant, null);
  assert.deepEqual(small.missing, []);
  // exactly at the threshold is not dominant
  assert.equal(balance([P('a', { category: 'food' }), P('b', { category: 'food' }), P('c', { category: 'views' }), P('d', { category: 'nature' }), P('e', { category: 'shows' })], { dominantShare: 0.4 }).dominant, null);
});

test('board: budget only counts budgeted places, status thresholds', () => {
  const b = budget([P('a', { brl: 100 }), P('b', { brl: 50, budgeted: false })], 2, 100);
  assert.equal(b.spend, 100);
  assert.equal(b.cap, 200);
  assert.equal(b.share, 0.5);
  assert.equal(b.status, 'ok');
  assert.equal(b.excluded, 1);
  assert.equal(budget([P('a', { brl: 150 })], 2, 100).status, 'tight');
  assert.equal(budget([P('a', { brl: 201 })], 2, 100).status, 'over');
  assert.equal(budget([P('a', { brl: 5 })], 0, 100).status, 'over');
  assert.equal(budget([], 0, 100).status, 'ok');
});

test('board: holiday dates and countries from the trip window', () => {
  assert.equal(holidayDate('christmas', COUNTRIES), '2026-12-25');
  assert.equal(holidayDate('nye', COUNTRIES), '2026-12-31');
  assert.equal(countryOn('2026-12-25', COUNTRIES), 'china');
  assert.equal(countryOn('2027-01-02', COUNTRIES), 'korea');
  assert.equal(addDays('2026-12-06', -7), '2026-11-29');
  assert.equal(holidayDate('christmas', [{ from: '2027-01-02', to: '2027-01-10' }]), null);
});

test('board: book-ahead sorted by deadline; locked holiday picks use the holiday date', () => {
  const picks = [
    P('k', { country: 'korea', booking: { level: 'required', lead_days: 7 } }),
    P('c', { booking: { level: 'recommended', lead_days: 1 } }),
    P('h', { booking: { level: 'required', lead_days: 3 } }),
    P('n', { booking: { level: 'none' } }),
  ];
  const list = bookAhead(picks, COUNTRIES, { nye: 'h' });
  assert.deepEqual(list.map((x) => x.id), ['c', 'k', 'h']);
  assert.equal(list[0].deadline, '2026-12-05');
  assert.equal(list[1].deadline, '2026-12-26');
  assert.equal(list[2].deadline, '2026-12-28');
  assert.equal(list[2].holiday, 'nye');
});

test('board: buildBoard moves the cutoff with days overrides', () => {
  const places = [P('a', { rating: 1600 }), P('b', { rating: 1550 }), P('c', { rating: 1500 }), P('d', { rating: 1450 }), P('k', { country: 'korea' })];
  const b1 = buildBoard({ places, countries: COUNTRIES });
  assert.equal(b1.countries[0].above.length, 3);
  assert.equal(b1.totalDays, 5);
  const b2 = buildBoard({ places, countries: COUNTRIES, days: { china: 1, korea: 4 } });
  assert.deepEqual(b2.countries[0].above.map((p) => p.id), ['a']);
  assert.equal(b2.countries[0].changed, true);
  assert.equal(b2.countries[1].open, 3);
  assert.equal(b2.totalDays, 5);
  assert.equal(b2.picks.length, 2);
  assert.deepEqual(holidayOptions([P('x', { tags: ['nye'] }), P('y', { tags: ['christmas'] })], 'nye').map((p) => p.id), ['x']);
});

// ---------------- Lunar New Year: a holiday over several days whose options don't compete ----------------
const HK = [{ id: 'japan', from: '2027-01-20', to: '2027-02-04' }, { id: 'hong-kong', name: 'Hong Kong', days: 5, from: '2027-02-04', to: '2027-02-09' }];
const LNY = (id, from, to = from, o = {}) => P(id, { country: 'hong-kong', tags: ['lunar-new-year', 'lunar-new-year-option'], holidays: ['lny'], days: [{ from, to }], ...o });

test('lunar new year: the date comes from one table and the holiday covers the eve to day 3', () => {
  assert.equal(LUNAR_NEW_YEAR[2027], '2027-02-06');
  assert.deepEqual(HOLIDAYS.lny.dates, Object.values(LUNAR_NEW_YEAR), 'no month-day baked into the holiday');
  assert.equal(HOLIDAYS.lny.md, undefined);
  assert.equal(holidayDate('lny', HK), '2027-02-06');
  assert.deepEqual(holidayRange('lny', HK), { from: '2027-02-05', to: '2027-02-08' });
  assert.equal(countryOn('2027-02-06', HK), 'hong-kong');
  assert.equal(holidayDate('lny', COUNTRIES), null, 'a trip that ends in January has no Lunar New Year');
  assert.equal(holidayRange('lny', COUNTRIES), null);
  assert.deepEqual(holidayRange('nye', COUNTRIES), { from: '2026-12-31', to: '2026-12-31' }, 'fixed-date holidays are one day');
  assert.equal(picksMany('lny'), true);
  assert.equal(picksMany('christmas'), false);
  assert.equal(picksMany('nye'), false);
});

test('lunar new year: every option keeps its own day; none is dropped for not being on Feb 6', () => {
  const range = holidayRange('lny', HK);
  const fair = LNY('fair', '2027-01-31', '2027-02-06'), parade = LNY('parade', '2027-02-06'), fireworks = LNY('fireworks', '2027-02-07'), races = LNY('races', '2027-02-08');
  assert.equal(holidayDay(fair, range), '2027-02-05', 'a fair that runs up to New Year counts on the eve');
  assert.equal(holidayDay(parade, range), '2027-02-06');
  assert.equal(holidayDay(fireworks, range), '2027-02-07');
  assert.equal(holidayDay(races, range), '2027-02-08');
  assert.equal(holidayDay(P('undated'), range), null);
  assert.equal(holidayDay(LNY('late', '2027-02-20'), range), null);
  const mall = P('mall', { country: 'hong-kong', tags: ['lunar-new-year', 'mall'] });
  const undated = P('undated', { country: 'hong-kong', tags: ['lunar-new-year-option'] });
  const opts = holidayOptions([races, mall, undated, fireworks, parade, fair], 'lny', HK);
  assert.deepEqual(opts.map((p) => p.id), ['fair', 'parade', 'fireworks', 'races', 'undated'], 'day order, undated last, malls with only `lunar-new-year` left out');
  assert.equal(holidayOptions([races, mall, fair], 'lny').length, 2, 'without trip dates the options are still all there');
});

test('lunar new year: book-ahead counts back from the option\'s own day, with no lock', () => {
  const parade = LNY('parade', '2027-02-06', '2027-02-06', { booking: { level: 'recommended', lead_days: 14 } });
  const races = LNY('races', '2027-02-08', '2027-02-08', { booking: { level: 'required', lead_days: 2 } });
  const peak = P('peak', { country: 'hong-kong', booking: { level: 'recommended', lead_days: 1 } });
  const list = bookAhead([races, parade, peak], HK, {});
  assert.deepEqual(list.map((x) => [x.id, x.visit, x.deadline, x.holiday]), [['parade', '2027-02-06', '2027-01-23', 'lny'], ['peak', '2027-02-04', '2027-02-03', null], ['races', '2027-02-08', '2027-02-06', 'lny']]);
});

// ---------------- feedback writing ----------------
test('feedback: appendEvent writes valid v1 JSONL the platform reader accepts', () => {
  const dir = tmp();
  appendEvent(dir, 'swipes', { session: 's1', round: 'place', id: 'yu-garden', verdict: 'must', country: 'china', ms: 900 }, { now: new Date('2026-11-20T10:00:00Z') });
  appendEvent(dir, 'duels', { winner: 'a', loser: 'b', elo: { winner: 1500, loser: 1500 } });
  appendEvent(dir, 'questions', { id: 'a', question: 'Open on Dec 25?', answer_summary: 'Yes.' });
  const fb = readFeedback(dir);
  assert.equal(fb.warnings.length, 0);
  assert.equal(fb.swipes[0].ts, '2026-11-20T10:00:00Z');
  assert.equal(fb.swipes[0].v, 1);
  assert.equal(fb.duels.length, 1);
  assert.equal(fb.questions[0].question, 'Open on Dec 25?');
});

test('feedback: rejects invalid events, never merges lines, append-only', () => {
  const dir = tmp();
  assert.throws(() => appendEvent(dir, 'swipes', { session: 's', round: 'place', id: 'a', verdict: 'love' }), /invalid swipes event/);
  assert.throws(() => appendEvent(dir, 'nope', {}), /unknown feedback kind/);
  fs.writeFileSync(path.join(dir, 'swipes.jsonl'), '{"v":1,"ts":"2026-01-01T10:00:00Z","session":"s","round":"place","id":"a","verdict":"skip"}'); // no trailing newline
  appendEvent(dir, 'swipes', { session: 's', round: 'place', id: 'a', verdict: 'must' });
  const lines = fs.readFileSync(path.join(dir, 'swipes.jsonl'), 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).verdict, 'skip');
  assert.deepEqual(latestVerdicts(readFeedback(dir).swipes).place, { a: 'must' });
});

test('state: first run is the baseline, later ids are new until swiped', () => {
  const file = path.join(tmp(), 'game-state.json');
  const st = readState(file);
  assert.deepEqual(st.days, {});
  trackSeen(st, ['a', 'b'], new Set(), '2026-11-10T10:00:00Z');
  const t = trackSeen(st, ['a', 'b', 'c', 'd'], new Set(['d']), '2026-11-11T10:00:00Z');
  assert.equal(t.isNew('a'), false);
  assert.equal(t.isNew('c'), true);
  assert.equal(t.isNew('d'), false, 'swiped cards are not new');
  writeState(file, st);
  assert.equal(readState(file).firstSeen.c, '2026-11-11T10:00:00Z');
  fs.writeFileSync(file, '{broken');
  assert.deepEqual(readState(file).locks, {}, 'corrupt state falls back to empty');
});

test('holiday facts: cold from weather block, crowd sentence pulled out of winter notes', () => {
  const f = holidayFacts({ tags: ['cold'], hours: { winter: 'Opens Dec 18. Tickets sell out on NYE.' }, blocks: [{ type: 'weather', temp_low_c: -20, temp_high_c: -10, conditions: 'Bitter' }] });
  assert.equal(f.cold, '-20 to -10 °C · Bitter');
  assert.equal(f.coldLevel, 'brutal');
  assert.match(f.crowd, /sell out/);
  assert.equal(f.winter, 'Opens Dec 18.');
  assert.equal(holidayFacts({ tags: [], why: 'the techno crowd parties' }).crowd, null);
});

// ---------------- server API ----------------
async function withServer(fn) {
  const fbDir = tmp();
  const srv = await startServer({ port: 0, root: FIX, feedbackDir: fbDir, assetsDir: path.join(fbDir, 'assets') });
  try { await fn({ base: srv.url.replace(/\/$/, ''), fbDir }); } finally { srv.server.close(); }
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('server: state, swipe, duel, local what-if, pages', async () => {
  await withServer(async ({ base, fbDir }) => {
    const st = await (await fetch(`${base}/api/state`)).json();
    assert.ok(st.places.length >= 10);
    assert.ok(st.areas.length >= 1);
    assert.ok(st.places.some((p) => p.drone && p.card.includes('Drone show')));
    assert.ok(st.places.every((p) => p.card.includes('atr-card')));
    const [a, b] = st.places;
    assert.equal((await post(`${base}/api/swipe`, { round: 'place', id: a.id, verdict: 'must', ms: 1200 })).status, 200);
    assert.equal((await post(`${base}/api/swipe`, { round: 'place', id: 'does-not-exist', verdict: 'must' })).status, 400);
    assert.equal((await post(`${base}/api/swipe`, { round: 'place', id: a.id, verdict: 'love' })).status, 400);
    assert.equal((await post(`${base}/api/swipe`, { round: 'area', id: st.areas[0].id, verdict: 'skip' })).status, 200);
    const d = await (await post(`${base}/api/duel`, { winner: a.id, loser: b.id })).json();
    assert.deepEqual(d.event.elo, { winner: 1550, loser: 1500 });
    assert.equal((await post(`${base}/api/duel`, { winner: a.id, loser: a.id })).status, 400);
    const loc = await (await post(`${base}/api/local`, { days: { china: 20, mars: 3 }, locks: { nye: a.id, easter: a.id } })).json();
    assert.deepEqual(loc.local, { days: { china: 20 }, locks: { nye: a.id } });
    // Lunar New Year: four fixture options, each with its dates; it never takes a single lock
    const lny = st.places.filter((p) => p.holidays.includes('lny'));
    assert.deepEqual(holidayOptions(st.places, 'lny', st.countries).map((p) => [p.id, holidayDay(p, holidayRange('lny', st.countries))]), [['lny-eve-flower-fair', '2027-02-05'], ['lny-night-parade', '2027-02-06'], ['lny-harbour-fireworks', '2027-02-07'], ['lny-raceday', '2027-02-08']]);
    assert.ok(lny.every((p) => p.country === 'hong-kong' && p.whenLabel));
    const loc2 = await (await post(`${base}/api/local`, { locks: { lny: lny[0].id } })).json();
    assert.deepEqual(loc2.local.locks, { nye: a.id });
    const fb = readFeedback(fbDir);
    assert.equal(fb.warnings.length, 0);
    assert.equal(fb.swipes.length, 2);
    assert.equal(fb.duels.length, 1);
    const st2 = await (await fetch(`${base}/api/state`)).json();
    assert.equal(st2.places.find((p) => p.id === a.id).verdict, 'must');
    assert.equal(st2.local.days.china, 20);
    const page = await (await fetch(`${base}/place/${a.id}?embed=1`)).text();
    assert.match(page, /data-embed="1"/);
    assert.match(page, /\/game\/place\.js/);
    assert.equal((await fetch(`${base}/place/nope`)).status, 404);
    // areas get the same detail page as places
    const areaPage = await (await fetch(`${base}/area/${st.areas[0].id}?embed=1`)).text();
    assert.match(areaPage, /data-embed="1"/);
    assert.equal((await fetch(`${base}/area/nope`)).status, 404);
    assert.equal((await fetch(`${base}/lib/board.js`)).status, 200);
    assert.equal((await fetch(`${base}/lib/store.js`)).status, 404, 'only pure libs are served');
    assert.equal((await fetch(`${base}/game/../server.js`)).status, 404);
    assert.equal((await fetch(`${base}/assets/atr.css`)).status, 200);
    // config is never edited by the what-if
    assert.equal(loadTripConfig().countries.find((c) => c.id === 'china').days, 27);
  });
});

// ---------------- notes ----------------
test('notes: appendEvent validates note events; "" is a valid clear, > 2000 chars is not', () => {
  const dir = tmp();
  appendEvent(dir, 'notes', { session: 's1', round: 'area', id: 'harbin', text: 'Must, but only if I go in January.', country: 'china' });
  appendEvent(dir, 'notes', { round: 'area', id: 'harbin', text: '' });
  assert.throws(() => appendEvent(dir, 'notes', { round: 'area', id: 'harbin' }), /invalid notes event/);
  assert.throws(() => appendEvent(dir, 'notes', { round: 'area', id: 'harbin', text: 'x'.repeat(2001) }), /invalid notes event/);
  assert.throws(() => appendEvent(dir, 'notes', { round: 'city', id: 'harbin', text: 'x' }), /invalid notes event/);
  const fb = readFeedback(dir);
  assert.equal(fb.warnings.length, 0);
  assert.equal(fb.notes.length, 2);
});

test('server: /api/note writes, dedupes, clears; notes show in /api/state', async () => {
  await withServer(async ({ base, fbDir }) => {
    const st = await (await fetch(`${base}/api/state`)).json();
    const place = st.places[0], area = st.areas[0];
    assert.ok(st.places.every((p) => p.note === null) && st.areas.every((a) => a.note === null));
    const r1 = await (await post(`${base}/api/note`, { round: 'place', id: place.id, text: '  Only if it is not raining.\r\n' })).json();
    assert.equal(r1.note, 'Only if it is not raining.');
    assert.equal(r1.event.text, 'Only if it is not raining.');
    assert.equal(r1.event.country, place.country);
    // same text again: no new line (autosave never floods the log)
    assert.equal((await (await post(`${base}/api/note`, { round: 'place', id: place.id, text: 'Only if it is not raining.' })).json()).unchanged, true);
    assert.equal((await post(`${base}/api/note`, { round: 'area', id: area.id, text: 'Must, but only in January.' })).status, 200);
    assert.equal((await post(`${base}/api/note`, { round: 'place', id: 'nope', text: 'x' })).status, 400);
    assert.equal((await post(`${base}/api/note`, { round: 'city', id: place.id, text: 'x' })).status, 400);
    assert.equal((await post(`${base}/api/note`, { round: 'place', id: place.id })).status, 400);
    assert.equal((await post(`${base}/api/note`, { round: 'place', id: place.id, text: 'x'.repeat(2001) })).status, 400);
    let st2 = await (await fetch(`${base}/api/state`)).json();
    assert.equal(st2.places.find((p) => p.id === place.id).note, 'Only if it is not raining.');
    assert.equal(st2.areas.find((a) => a.id === area.id).note, 'Must, but only in January.');
    // clearing: "" is logged, the note is gone from state
    const cl = await (await post(`${base}/api/note`, { round: 'place', id: place.id, text: '' })).json();
    assert.equal(cl.note, null);
    st2 = await (await fetch(`${base}/api/state`)).json();
    assert.equal(st2.places.find((p) => p.id === place.id).note, null);
    const lines = fs.readFileSync(path.join(fbDir, 'notes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => l.text), ['Only if it is not raining.', 'Must, but only in January.', '']);
    assert.equal(readFeedback(fbDir).warnings.length, 0);
  });
});
