// Trip planner tests: the shared maths (game/lib/trip.js), the JSON store and the /api/trip endpoints.
// Uses made-up legs and temp dirs; the real trip/ files are never read or written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, diffDays, tripSpan, stayOn, hereOn, eventsOn, nextFlight, inDays, onDay, upcomingEvents, todayModel, searchPlaces, periods, moneyTotals, priceCheck, reachOf, cityCenters, COLLECTIONS } from '../lib/trip.js';
import { readTrip, writeDoc } from '../lib/tripstore.js';
import { startServer } from '../server.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'atr-trip-'));

const LEGS = [
  { id: 'f1', type: 'flight', from: 'GRU', to: 'PVG', start: '2026-12-04T17:10', end: '2026-12-06T05:10', status: 'booked' },
  { id: 's1', type: 'stay', country: 'china', city: 'shanghai', title: 'Shanghai · hostel', start: '2026-12-06', end: '2026-12-09' },
  { id: 's2', type: 'stay', country: 'china', city: 'beijing', title: 'Beijing', start: '2026-12-09', end: '2026-12-12', status: 'tbd' },
  { id: 'f2', type: 'flight', from: 'PEK', to: 'KIX', start: '2026-12-12T10:00', end: '2026-12-12T14:00' },
  { id: 's3', type: 'stay', country: 'japan', city: 'osaka', title: 'Osaka', start: '2026-12-12', end: '2026-12-16' },
  { id: 'l1', type: 'stay', country: 'singapore', city: 'singapore', title: 'Singapore · layover', start: '2026-12-16', end: '2026-12-16' },
  { id: 'f3', type: 'flight', from: 'SIN', to: 'GRU', start: '2026-12-16', end: '2026-12-17' },
];
const P = (id, o = {}) => ({ id, name: id, country: 'china', city: 'shanghai', cityName: 'Shanghai', category: 'food', tags: [], verdict: 'must', rating: 1500, ...o });
const PLACES = [
  P('bund-show', { days: [{ from: '2026-12-07', to: '2026-12-07' }], loc: { lat: 31.24, lng: 121.49 } }),
  P('lantern-week', { days: [{ from: '2026-12-05', to: '2026-12-08' }], verdict: 'maybe', loc: { lat: 31.22, lng: 121.47 } }),
  P('winter-season', { days: [{ from: '2026-11-01', to: '2027-02-28' }] }),
  P('skipped-fair', { days: [{ from: '2026-12-07', to: '2026-12-07' }], verdict: 'skip' }),
  P('suzhou-night', { city: 'suzhou', cityName: 'Suzhou', days: [{ from: '2026-12-08', to: '2026-12-08' }], loc: { lat: 31.3, lng: 120.62 } }),
  P('harbin-ice', { city: 'harbin', cityName: 'Harbin', days: [{ from: '2026-12-07', to: '2026-12-07' }], loc: { lat: 45.8, lng: 126.5 } }),
  P('duck', { city: 'beijing', cityName: 'Beijing', name: 'Peking duck house', tags: ['duck'], why: 'Crisp skin', rating: 1600 }),
  P('ramen-ya', { country: 'japan', city: 'osaka', cityName: 'Osaka', name: 'Jinrui Mina Menrui', tags: ['ramen'], days: [], note: 'ramém do bom' }),
  P('ado-live', { country: 'japan', city: 'osaka', cityName: 'Osaka', category: 'shows', days: [{ from: '2026-12-13', to: '2026-12-14' }], verdict: null }),
];

test('trip dates: span, stay of the night, where you are, what touches a day', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(diffDays('2026-12-06', '2027-01-02'), 27);
  assert.deepEqual(tripSpan(LEGS), { first: '2026-12-04', last: '2026-12-17', days: 14 });
  assert.equal(tripSpan([]), null);
  assert.equal(stayOn(LEGS, '2026-12-08').id, 's1');
  assert.equal(stayOn(LEGS, '2026-12-09').id, 's2', 'on a move day the night belongs to the next stay');
  assert.equal(stayOn(LEGS, '2026-12-05'), null, 'a night on the plane has no stay');
  assert.equal(stayOn(LEGS, '2026-12-16').id, 'l1', 'a same-day stay (layover) counts on its day');
  assert.equal(hereOn([{ id: 'x', type: 'stay', start: '2026-12-01', end: '2026-12-04' }], '2026-12-04').id, 'x', 'checkout day with nothing after still counts as there');
  assert.deepEqual(eventsOn(LEGS, '2026-12-12').map((l) => l.id), ['s2', 's3', 'f2']);
  assert.deepEqual(eventsOn(LEGS, '2026-12-05').map((l) => l.id), [], 'a flight shows on the days it leaves and lands');
  assert.deepEqual(eventsOn(LEGS, '2026-12-06').map((l) => l.id), ['f1', 's1']);
});

test('next flight: by time when it has one, by day when it does not', () => {
  assert.equal(nextFlight(LEGS, '2026-11-15T10:00').id, 'f1');
  assert.equal(nextFlight(LEGS, '2026-12-04T17:09').id, 'f1');
  assert.equal(nextFlight(LEGS, '2026-12-04T17:11').id, 'f2');
  assert.equal(nextFlight(LEGS, '2026-12-16T23:00').id, 'f3', 'a flight with no time counts until its day ends');
  assert.equal(nextFlight(LEGS, '2026-12-17T00:01'), null);
  assert.equal(inDays('2026-12-01', '2026-12-01'), 'today');
  assert.equal(inDays('2026-12-01', '2026-12-02'), 'tomorrow');
  assert.equal(inDays('2026-12-01', '2026-12-15'), 'in 14 days');
});

test('reach: your city, a day trip, or too far', () => {
  const centers = cityCenters(PLACES);
  assert.equal(reachOf(PLACES[0], ['shanghai'], centers), 'here');
  assert.equal(reachOf(PLACES.find((p) => p.id === 'suzhou-night'), ['shanghai'], centers), 'near');
  assert.equal(reachOf(PLACES.find((p) => p.id === 'harbin-ice'), ['shanghai'], centers), 'far');
  assert.equal(reachOf({ city: 'x' }, ['shanghai'], centers), 'far', 'no coordinates: not assumed near');
});

test('only today: one-day events, last days, running ones; skipped and other countries are out', () => {
  const xs = onDay(PLACES, '2026-12-07', { country: 'china', cities: ['shanghai'] });
  assert.deepEqual(xs.map((h) => [h.place.id, h.kind, h.reach]), [['bund-show', 'only', 'here'], ['lantern-week', 'on', 'here'], ['winter-season', 'on', 'here'], ['harbin-ice', 'only', 'far']]);
  assert.equal(xs.find((h) => h.place.id === 'lantern-week').left, 1);
  assert.ok(xs.find((h) => h.place.id === 'winter-season').season);
  assert.equal(onDay(PLACES, '2026-12-08', { country: 'china', cities: ['shanghai'] }).find((h) => h.place.id === 'lantern-week').kind, 'last');
  assert.deepEqual(onDay(PLACES, '2026-12-13', { country: 'china' }).map((h) => h.place.id), ['winter-season']);
});

test('next events: first day inside a stay they can be reached from, in date order', () => {
  const up = upcomingEvents(PLACES, LEGS, '2026-11-15');
  assert.deepEqual(up.map((u) => [u.place.id, u.date, u.reach]), [['lantern-week', '2026-12-06', 'here'], ['bund-show', '2026-12-07', 'here'], ['suzhou-night', '2026-12-08', 'near'], ['ado-live', '2026-12-13', 'here']]);
  assert.ok(!up.some((u) => ['winter-season', 'skipped-fair', 'harbin-ice'].includes(u.place.id)), 'no seasons, no skipped cards, nothing out of reach');
  assert.deepEqual(upcomingEvents(PLACES, LEGS, '2026-12-07').map((u) => u.place.id), ['lantern-week', 'suzhou-night', 'ado-live'], 'today itself is not "upcoming"');
  assert.equal(upcomingEvents(PLACES, LEGS, '2026-12-07')[0].date, '2026-12-08');
  assert.equal(upcomingEvents(PLACES, LEGS, '2026-11-15', { limit: 2 }).length, 2);
});

test('today: before, during and after the trip', () => {
  const tasks = [{ id: 'a', title: 'A', status: 'done' }, { id: 'b', title: 'B', order: 1 }, { id: 'c', title: 'C', status: 'doing', order: 2 }];
  const days = [{ id: '2026-12-07', status: 'vacation', note: 'hi' }];
  const before = todayModel({ legs: LEGS, places: PLACES, tasks, days, today: '2026-11-15', now: '2026-11-15T10:00' });
  assert.equal(before.phase, 'before');
  assert.equal(before.toDeparture, 19);
  assert.equal(before.stay, null);
  assert.equal(before.flight.id, 'f1');
  assert.deepEqual(before.tasks.map((t) => t.id), ['c', 'b'], 'in progress first, done left out');

  const during = todayModel({ legs: LEGS, places: PLACES, tasks, days, visited: [], today: '2026-12-07', now: '2026-12-07T09:00' });
  assert.equal(during.phase, 'during');
  assert.equal(during.dayNumber, 4);
  assert.equal(during.stay.id, 's1');
  assert.equal(during.country, 'china');
  assert.equal(during.shift, '20:00–05:00');
  assert.equal(during.day.note, 'hi');
  assert.equal(during.flight.id, 'f2');
  assert.deepEqual(during.onlyToday.map((h) => h.place.id), ['bund-show'], 'the Harbin event is out of reach, the skipped one is out');
  assert.deepEqual(during.endingSoon.map((h) => h.place.id), ['lantern-week'], 'the season is not "ending soon"');
  assert.deepEqual(during.musts.map((p) => p.id), ['winter-season'], 'Must cards here that are not already listed above');
  assert.equal(todayModel({ legs: LEGS, places: PLACES, visited: [{ id: 'winter-season' }], today: '2026-12-07', now: '2026-12-07T09:00' }).musts.length, 0, 'ticked cards drop out');

  const moveDay = todayModel({ legs: LEGS, places: PLACES, today: '2026-12-12', now: '2026-12-12T08:00' });
  assert.equal(moveDay.stay.id, 's3');
  assert.deepEqual(moveDay.moves.map((l) => l.id), ['f2']);
  assert.equal(todayModel({ legs: LEGS, today: '2026-12-20', now: '2026-12-20T08:00' }).phase, 'after');
  assert.equal(todayModel({ legs: [], today: '2026-12-20' }).phase, 'none');
});

test('search: every word must match; accents and case are ignored; Must first', () => {
  const ids = (o) => searchPlaces(PLACES, o).map((p) => p.id);
  assert.deepEqual(ids({ q: 'ramen' }), ['ramen-ya']);
  assert.deepEqual(ids({ q: 'RAMEM bom' }), ['ramen-ya'], 'the traveler\'s own note is searched too');
  assert.deepEqual(ids({ q: 'ramen', cities: ['shanghai'] }), []);
  assert.deepEqual(ids({ cities: ['osaka'] }), ['ramen-ya', 'ado-live'], 'Must before cards with no call');
  assert.deepEqual(ids({ cities: ['osaka'], show: 'picks' }), ['ramen-ya']);
  assert.deepEqual(ids({ q: 'duck crisp' }), ['duck']);
  assert.deepEqual(ids({ q: 'shows', categories: { shows: { label: 'Shows' } } }), ['ado-live']);
  assert.equal(ids({ cities: ['shanghai'] }).at(-1), 'skipped-fair', 'Skip goes last');
  assert.deepEqual(ids({ show: 'been', visited: [{ id: 'duck' }] }), ['duck']);
  assert.ok(!ids({ show: 'todo', visited: [{ id: 'duck' }] }).includes('duck'));
});

test('calendar periods and money', () => {
  const days = [{ id: '2026-12-01', status: 'work' }, { id: '2026-12-02', status: 'work' }, { id: '2026-12-05', status: 'off' }, { id: '2026-12-07', status: 'vacation' }, { id: '2026-12-08', status: 'vacation', holiday: 'x' }, { id: '2026-12-10', status: 'work' }, { id: 'junk', status: 'work' }];
  assert.deepEqual(periods(days), [{ kind: 'work', from: '2026-12-01', to: '2026-12-02', n: 2 }, { kind: 'vacation', from: '2026-12-07', to: '2026-12-08', n: 2 }, { kind: 'work', from: '2026-12-10', to: '2026-12-10', n: 1 }]);
  const m = moneyTotals({ budget: [{ bed: 80, food: 100, other: 170, days: 27 }, { bed: 0, food: 60, other: 120, days: 1 }], fixed: [{ amount: 775 }, { amount: 5500 }], spend: [{ amountBRL: 50 }], settings: [{ id: 'main', cap: 20000 }] });
  assert.deepEqual(m, { cap: 20000, fixedT: 6275, groundT: 9630, spentT: 50, planT: 15905, spare: 4095, days: 28 });
  const b = { bed: 80, food: 100 };
  assert.equal(priceCheck(b, 'bed', 100, 'CNY').level, 'ok');
  assert.equal(priceCheck(b, 'bed', 130, 'CNY').level, 'warn');
  assert.equal(priceCheck(b, 'bed', 200, 'CNY').level, 'over');
  assert.equal(priceCheck(b, 'bed', '', 'CNY').level, 'idle');
  assert.equal(priceCheck(b, 'other', 50, 'BRL').level, 'idle', 'no budget set for that kind');
});

test('trip store: set, update, delete; bad input is refused; files stay plain JSON arrays', () => {
  const dir = tmp();
  assert.deepEqual(Object.keys(readTrip(dir)), COLLECTIONS);
  const { doc } = writeDoc(dir, { col: 'tasks', op: 'set', data: { title: 'Buy eSIM', status: 'todo' } });
  assert.match(doc.id, /^x/);
  writeDoc(dir, { col: 'tasks', op: 'update', id: doc.id, data: { status: 'done', note: 'ok' } });
  writeDoc(dir, { col: 'tasks', op: 'update', id: doc.id, data: { note: null } });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8')), [{ id: doc.id, title: 'Buy eSIM', status: 'done' }]);
  writeDoc(dir, { col: 'days', op: 'set', id: '2026-12-25', data: { holiday: 'Natal', id: 'ignored' } });
  assert.deepEqual(readTrip(dir).days, [{ id: '2026-12-25', holiday: 'Natal' }]);
  writeDoc(dir, { col: 'tasks', op: 'delete', id: doc.id });
  assert.deepEqual(readTrip(dir).tasks, []);
  for (const bad of [{ col: 'nope', op: 'set', data: {} }, { col: 'tasks', op: 'drop', id: 'a' }, { col: 'tasks', op: 'set', id: '../x', data: {} }, { col: 'tasks', op: 'set', data: [] }, { col: 'tasks', op: 'update', id: 'missing', data: {} }, { col: 'tasks', op: 'update', data: {} }]) {
    assert.throws(() => writeDoc(dir, bad), (e) => e.status === 400, JSON.stringify(bad));
  }
  fs.writeFileSync(path.join(dir, 'bag.json'), '{broken');
  assert.deepEqual(readTrip(dir).bag, [], 'a broken file reads as empty instead of crashing the site');
});

test('server: /api/trip reads and writes the trip dir; the page shell has the two-level menu', async () => {
  const dir = tmp(), tripDir = path.join(dir, 'trip');
  const srv = await startServer({ port: 0, root: FIX, feedbackDir: path.join(dir, 'fb'), tripDir, assetsDir: path.join(dir, 'assets') });
  try {
    const get = async (u) => (await fetch(srv.url + u)).json();
    const post = async (u, body) => { const r = await fetch(srv.url + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };
    assert.deepEqual((await get('api/trip')).trip.legs, []);
    const a = await post('api/trip', { col: 'legs', op: 'set', id: 'tk216', data: { type: 'flight', from: 'GRU', to: 'IST', start: '2026-12-04T17:10' } });
    assert.equal(a.status, 200);
    assert.equal(a.json.doc.id, 'tk216');
    await post('api/trip', { col: 'visited', op: 'set', id: 'harbin-ice-world', data: { at: '2026-12-20' } });
    const t = (await get('api/trip')).trip;
    assert.equal(t.legs[0].from, 'GRU');
    assert.deepEqual(t.visited, [{ id: 'harbin-ice-world', at: '2026-12-20' }]);
    assert.ok(fs.existsSync(path.join(tripDir, 'legs.json')));
    assert.equal((await post('api/trip', { col: 'secrets', op: 'set', data: {} })).status, 400);
    const html = await (await fetch(srv.url)).text();
    assert.match(html, /id="subtabs"/);
    assert.match(html, /id="tsheet"/);
    assert.match(html, /trip\.css/);
    assert.equal((await fetch(srv.url + 'lib/trip.js')).status, 200);
    const st = await get('api/state');
    assert.ok(st.places.every((p) => 'loc' in p));
  } finally { srv.server.close(); }
});

test('timezones: labels, leg offsets and the times found in free text', async () => {
  const { tzLabel, tzText, tzSpots, legOffsets, offsetOn, instantOf } = await import('../lib/trip.js');
  assert.equal(tzLabel(-3), 'UTC−3');
  assert.equal(tzLabel(8), 'UTC+8');
  assert.equal(tzLabel(5.5), 'UTC+5:30');
  assert.equal(tzLabel(null), '');
  assert.equal(tzText('Lands at PVG 05:10: ask for bag storage', 'UTC+8'), 'Lands at PVG 05:10 UTC+8: ask for bag storage');
  assert.equal(tzText('work nights 20:00–05:00 on Dec 28', 'UTC+8'), 'work nights 20:00–05:00 UTC+8 on Dec 28', 'one label for a range');
  assert.equal(tzText('shows at 20:00, 21:00 and 22:00 on Sundays', 'UTC+8'), 'shows at 20:00, 21:00 and 22:00 UTC+8 on Sundays', 'one label for a list');
  assert.equal(tzText('opens 9am, last entry 4:30 pm', 'UTC+9'), 'opens 9am UTC+9, last entry 4:30 pm UTC+9');
  assert.deepEqual(tzSpots('already 17:10 UTC−3, R$ 774,89, 1h 05m, ratio 16:9'), [], 'labelled times, money, durations and ratios are left alone');
  const legs = [
    { id: 's0', type: 'stay', country: 'japan', start: '2027-02-02', end: '2027-02-05' },
    { id: 'cab', type: 'transport', start: '2027-02-05T10:00' },
    { id: 'f', type: 'flight', from: 'KIX', to: 'HKG', start: '2027-02-05T13:30', end: '2027-02-05T17:15' },
    { id: 'bus', type: 'transport', start: '2027-02-05T18:00' },
    { id: 's1', type: 'stay', country: 'hong-kong', start: '2027-02-05', end: '2027-02-09' },
  ];
  assert.deepEqual(legOffsets(legs[2], legs), { start: 9, end: 8 });
  assert.equal(legOffsets(legs[1], legs).start, 9, 'a transfer before the flight is in the departure zone');
  assert.equal(legOffsets(legs[3], legs).start, 8, 'a transfer after landing is in the arrival zone');
  assert.equal(legOffsets({ type: 'flight', from: 'XXX', to: 'HKG', tzStart: 2 }, []).start, 2, 'tzStart overrides');
  assert.equal(offsetOn(legs, '2027-02-07'), 8);
  assert.equal(offsetOn(legs, '2026-11-15'), -3, 'home before the trip');
  assert.equal(instantOf('2026-12-04T17:10', -3), Date.parse('2026-12-04T20:10:00Z'));
});

const OWNER = { user: 'eliton', password: 'dummy-owner-pw' };
const GUEST = { user: 'guest', password: 'dummy-guest-pw' };
const hosted = async (accounts) => {
  const dir = tmp();
  const srv = await startServer({ port: 0, root: FIX, feedbackDir: path.join(dir, 'fb'), tripDir: path.join(dir, 'trip'), assetsDir: path.join(dir, 'assets'), accounts });
  const req = (u, o = {}) => fetch(srv.url + u, { redirect: 'manual', ...o });
  const json = (body, cookie) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const login = async (username, password) => { const r = await req('login', json({ username, password })); return { status: r.status, set: r.headers.get('set-cookie'), body: await r.json() }; };
  return { dir, srv, req, json, login };
};

test('hosted mode: owner and guest logins gate every page and API call', async () => {
  const { dir, srv, req, json, login } = await hosted({ owner: OWNER, guest: GUEST });
  try {
    assert.equal((await req('healthz')).status, 200, 'the health check needs no login');
    const home = await req('');
    assert.equal(home.status, 303); assert.equal(home.headers.get('location'), '/login');
    assert.equal((await req('api/state')).status, 401);
    assert.equal((await req('api/trip', json({ col: 'tasks', op: 'set', id: 'a', data: {} }))).status, 401, 'no writes without a login');
    assert.equal(fs.existsSync(path.join(dir, 'trip', 'tasks.json')), false);
    assert.equal((await req('game/game.js')).status, 303);
    const page = await (await req('login')).text();
    assert.match(page, /<form method="post" action="\/login"/);
    assert.match(page, /name="username" autocomplete="username"/);
    assert.match(page, /type="password" name="password" autocomplete="current-password"/);
    assert.equal((await req('assets/atr.css')).status, 200, 'the login page can load its stylesheet');

    // wrong username and wrong password look the same
    const badPw = await login('eliton', 'nope'), badUser = await login('mallory', OWNER.password), noUser = await login(undefined, OWNER.password);
    for (const r of [badPw, badUser, noUser]) { assert.equal(r.status, 401); assert.equal(r.body.error, 'Wrong username or password.'); assert.equal(r.set, null); }
    assert.equal((await login('guest', OWNER.password)).status, 401, "the owner's password does not open the guest account");

    // the owner, with a sloppy username (case and spaces), and the cookie it gets
    const own = await login('  ELITON ', OWNER.password);
    assert.equal(own.status, 200); assert.equal(own.body.role, 'owner');
    assert.match(own.set, /^atr_session=owner\.[0-9a-f]{64}; /);
    assert.match(own.set, /Max-Age=34560000/); assert.match(own.set, /HttpOnly/); assert.match(own.set, /SameSite=Lax/); assert.match(own.set, /Path=\//);
    assert.doesNotMatch(own.set, /Secure/, 'plain http locally');
    assert.doesNotMatch(own.set, new RegExp(OWNER.password)); assert.doesNotMatch(own.set, /dummy/);
    const owner = own.set.split(';')[0];

    // the guest: GETs work, every write is refused, nothing lands on disk (not even the "seen" bookkeeping)
    const gst = await login('Guest', GUEST.password);
    assert.equal(gst.status, 200); assert.equal(gst.body.role, 'guest');
    assert.doesNotMatch(gst.set, new RegExp(GUEST.password));
    const guest = gst.set.split(';')[0];
    assert.notEqual(guest.split('.')[1], owner.split('.')[1]);
    const gs = await (await req('api/state', { headers: { cookie: guest } })).json();
    assert.equal(gs.role, 'guest'); assert.equal(gs.user, 'guest'); assert.ok(gs.places.length);
    for (const u of ['api/trip', 'api/route', 'game/game.js', 'place/' + gs.places[0].id]) assert.equal((await req(u, { headers: { cookie: guest } })).status, 200, `guest GET ${u}`);
    const gHome = await req('', { headers: { cookie: guest } });
    assert.equal(gHome.status, 200); assert.match(await gHome.text(), /Guest<span class="g-who__more"> · read only/);
    const writes = {
      'api/swipe': { round: 'place', id: gs.places[0].id, verdict: 'must' }, 'api/note': { round: 'place', id: gs.places[0].id, text: 'x' },
      'api/route': { country: 'japan', reset: true }, 'api/duel': { winner: gs.places[0].id, loser: gs.places[1]?.id }, 'api/local': { resetDays: true },
      'api/trip': { col: 'tasks', op: 'set', id: 'g', data: { title: 'x' } }, 'api/nope': {},
    };
    for (const [u, body] of Object.entries(writes)) {
      const r = await req(u, json(body, guest));
      assert.equal(r.status, 403, `guest POST ${u}`); assert.equal((await r.json()).error, 'Guests can look but not change anything.');
    }
    assert.equal((await req('api/trip', { method: 'DELETE', headers: { cookie: guest } })).status, 403);
    assert.deepEqual(fs.existsSync(path.join(dir, 'fb')) ? fs.readdirSync(path.join(dir, 'fb')) : [], [], 'a guest writes nothing to feedback/');
    assert.equal(fs.existsSync(path.join(dir, 'trip')), false, 'a guest writes nothing to trip/');

    // a guest cookie cannot pass as the owner's, and a forged one fails
    const forged = `atr_session=owner.${guest.split('.')[1]}`;
    assert.equal((await req('api/state', { headers: { cookie: forged } })).status, 401);
    assert.equal((await req('api/state', { headers: { cookie: 'atr_session=deadbeef' } })).status, 401);
    assert.equal((await req('api/state', { headers: { cookie: 'atr_session=owner.' + '0'.repeat(64) } })).status, 401);

    // the owner can do everything
    const os_ = await (await req('api/state', { headers: { cookie: owner } })).json();
    assert.equal(os_.role, 'owner'); assert.equal(os_.user, 'eliton');
    assert.equal(fs.existsSync(path.join(dir, 'fb', 'game-state.json')), true, 'the owner\'s visit does record first-seen times');
    assert.equal((await req('api/trip', json({ col: 'tasks', op: 'set', id: 'a', data: { title: 'x' } }, owner))).status, 200);
    assert.equal(fs.existsSync(path.join(dir, 'trip', 'tasks.json')), true);
    assert.equal((await req('api/swipe', json({ round: 'place', id: gs.places[0].id, verdict: 'must' }, owner))).status, 200);

    // remember me: an authenticated page load re-issues the cookie (sliding), Secure behind HTTPS
    const slide = await req('', { headers: { cookie: owner, 'x-forwarded-proto': 'https' } });
    assert.equal(slide.status, 200);
    const again = slide.headers.get('set-cookie');
    assert.equal(again.split(';')[0], owner); assert.match(again, /Max-Age=34560000/); assert.match(again, /; Secure/);
    assert.match(await slide.text(), /href="\/logout">Sign out/);

    // the plain HTML form works too: a redirect home, or the form again with the error
    const form = (username, password) => req('login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username, password }).toString() });
    const fOk = await form('eliton', OWNER.password);
    assert.equal(fOk.status, 303); assert.equal(fOk.headers.get('location'), '/'); assert.match(fOk.headers.get('set-cookie'), /^atr_session=owner\./);
    const fBad = await form('eliton', 'nope');
    assert.equal(fBad.status, 401); assert.match(await fBad.text(), /Wrong username or password\./);

    // sign out
    const out = await req('logout', { headers: { cookie: owner } });
    assert.equal(out.status, 303); assert.match(out.headers.get('set-cookie'), /Max-Age=0/);

    // the global brake: 4 wrong tries so far, 6 more lock the login for a while
    for (let i = 0; i < 6; i++) await login('eliton', 'x');
    assert.equal((await login('eliton', OWNER.password)).status, 429, 'ten wrong tries lock the login for a while');
  } finally { srv.server.close(); }
});

test('hosted mode: no guest password means no guest account; a new password signs the old cookie out', async () => {
  const a = await hosted({ owner: OWNER, guest: { user: 'guest', password: undefined } });
  let owner;
  try {
    for (const pw of ['', 'anything', undefined]) assert.equal((await a.login('guest', pw)).status, 401);
    const own = await a.login('eliton', OWNER.password);
    assert.equal(own.status, 200);
    owner = own.set.split(';')[0];
  } finally { a.srv.server.close(); }
  const b = await hosted({ owner: { ...OWNER, password: 'dummy-new-owner-pw' } });
  try {
    assert.equal((await b.req('api/state', { headers: { cookie: owner } })).status, 401, 'changing the password signs that account out');
    assert.equal((await b.login('guest', 'dummy-guest-pw')).status, 401);
  } finally { b.srv.server.close(); }
  const c = await hosted({ owner: { password: '' }, guest: GUEST });
  try {
    const st = await (await c.req('api/state')).json();
    assert.equal(st.role, null, 'no owner password: auth is off'); assert.equal(st.user, null);
  } finally { c.srv.server.close(); }
});
