// Round 9: off-route events, when.kind / when.weekly, faq corrections, stays without fame, cities without an area card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { ROOT, FIXTURES } from '../lib/paths.js';
import * as api from '../lib/index.js';
import { whenLabel, whenTitle, eventDays, eventDates, tripOverlap, tripOverlapInfo, routeNote, singleDay, sameDayGroups, weeklyDays } from '../lib/when.js';
import { validatePlace } from '../lib/validate.js';
import { renderPlacePage, renderPlaceCard, renderAreaCard, renderIndexPage } from '../lib/render/index.js';
import { gapReport } from '../lib/gaps.js';
import { nextTasks } from '../lib/next.js';
import { newFeedback, formatNewFeedback, cityLevel } from '../lib/feedback/index.js';
import { placeTemplate } from '../lib/scaffold.js';
import { fixturePlace, fixtureCredits, fixtureMedia } from './helpers.js';

const errors = (issues) => issues.filter((i) => i.level === 'error');
const TRIP = { countries: [
  { id: 'china', from: '2026-12-06', to: '2027-01-02', days: 27, cities: ['shanghai'] },
  { id: 'hong-kong', from: '2027-01-19', to: '2027-01-22', days: 3, cities: ['hong-kong'] },
  { id: 'korea', from: '2027-01-02', to: '2027-01-10', days: 8, cities: ['seoul'] },
] };
const yuCtx = (extra = {}) => ({ credits: fixtureCredits(), mediaFiles: fixtureMedia(), fixtureMode: true, now: '2026-11-10', knownIds: new Set(['yu-garden', 'nanxiang-mantou-dian', 'the-bund']), trip: TRIP, ...extra });
const day = (d) => [{ from: d, to: d }];
const W = (when, extra = {}) => ({ ...fixturePlace(), when, ...extra });
const HK = (when) => W(when, { country: 'hong-kong', city: 'hong-kong' });
let seq = 0;
const mk = (o = {}) => ({
  id: `r${++seq}`, name: `Place ${seq}`, name_local: `地${seq}`, country: 'china', city: 'shanghai', category: 'culture', kind: 'See', fame: 'popular',
  cost: { local: 10, currency: 'CNY', brl: 8 }, book_ahead: { required: false }, hours: { summary: 'x', winter: 'x' }, location: { address_local: '地', lat: 31 + seq / 50, lng: 121 },
  sources: [{ url: `https://a.example/${seq}`, checked: '2026-11-09' }, { url: `https://b.example/${seq}`, checked: '2026-11-09' }], confidence: 'high', last_updated: '2026-11-09',
  blocks: [{ type: 'hero' }, { type: 'highlights' }, { type: 'map' }, { type: 'tips' }, { type: 'weather' }], ...o,
});
const gaps = (places, areas = [], extra = {}) => gapReport({ config: TRIP, taste: null, places, areas, now: '2026-11-10', linkCache: {}, reviews: new Map(), ...extra });

// ───────────────────────── 1. off-route events ─────────────────────────
test('route: a dated page says when it is not on the route, on the hero, the quick fact and the card', () => {
  const p = HK({ dates: day('2026-12-31') });
  assert.deepEqual(routeNote(p, TRIP), { state: 'none', chip: 'Not on your route', text: "Not on your route: you're in Hong Kong 19–22 Jan" });
  assert.deepEqual(routeNote(p, { from: '2027-01-19', to: '2027-01-22' }), routeNote(p, TRIP), 'a plain { from, to } window works too');
  const page = renderPlacePage(p, { credits: fixtureCredits(), trip: TRIP });
  assert.match(page, /<li class="chip chip--flag chip--offroute" title="Not on your route: you&#39;re in Hong Kong 19–22 Jan">.*Not on your route<\/li>/);
  assert.match(page, /fact--when fact--offroute[\s\S]*?31 Dec only<\/p><p class="fact__sub fact__route">Not on your route: you&#39;re in Hong Kong 19–22 Jan<\/p>/);
  const card = renderPlaceCard(p, { credits: fixtureCredits(), trip: TRIP });
  assert.match(card, /chip--when[^>]*>.*31 Dec only.*chip--offroute[^>]*>.*Not on your route/);
  // without a trip the renderers say nothing (they never read files)
  assert.doesNotMatch(renderPlacePage(p, { credits: fixtureCredits() }), /offroute|fact__route/);
  assert.doesNotMatch(renderPlaceCard(p, { credits: fixtureCredits() }), /offroute/);
  // on the route: no note
  const ok = W({ dates: day('2026-12-31') });
  assert.equal(routeNote(ok, TRIP), null);
  assert.doesNotMatch(renderPlacePage(ok, { credits: fixtureCredits(), trip: TRIP }), /offroute|fact__route/);
  assert.equal(routeNote(fixturePlace(), TRIP), null, 'not dated');
  assert.equal(routeNote({ ...p, country: 'japan' }, TRIP), null, 'no trip dates for the country');
});

test('route: partial overlap shows the usable days; the index and area cards get the trip too', () => {
  const p = W({ dates: [{ from: '2026-12-17', to: '2027-02-21' }], kind: 'season' });
  const n = routeNote(p, TRIP);
  assert.deepEqual([n.state, n.chip], ['partial', 'On your route: 17 Dec – 2 Jan']);
  const page = renderPlacePage(p, { credits: fixtureCredits(), trip: TRIP });
  assert.match(page, /<p class="fact__sub fact__route">On your route: 17 Dec – 2 Jan \(you&#39;re in China 6 Dec – 2 Jan\)<\/p>/);
  assert.doesNotMatch(page, /chip--offroute/, 'partial is fine: no warning chip');
  const hk = { ...HK({ dates: day('2026-12-31') }), id: 'hk-fireworks', _meta: { credits: fixtureCredits() } };
  assert.match(renderIndexPage([hk], { countries: TRIP.countries }), /chip--offroute/);
  assert.doesNotMatch(renderIndexPage([hk], {}), /chip--offroute/);
  const area = { ...parse(fs.readFileSync(path.join(FIXTURES, 'areas/china/harbin.yaml'), 'utf8')), when: { dates: day('2027-02-10') } };
  assert.match(renderAreaCard(area, { trip: TRIP }), /chip--offroute/);
  const src = fs.readFileSync(path.join(ROOT, 'platform/lib/build.js'), 'utf8');
  assert.match(src, /trip: cfg/, 'the build passes config/trip.yaml into the renderers');
});

// ───────────────────────── 2. when.kind and when.weekly ─────────────────────────
test('when.kind: only / season / best change the label, the chip title and what counts as a same-day event', () => {
  assert.equal(whenLabel(W({ dates: day('2026-12-31') })), '31 Dec only');
  assert.equal(whenLabel(W({ dates: day('2026-12-31'), kind: 'only' })), '31 Dec only');
  assert.equal(whenLabel(W({ dates: [{ from: '2026-12-20', to: '2027-02-28' }], kind: 'season' })), 'From 20 Dec to 28 Feb');
  assert.equal(whenLabel(W({ dates: [{ from: '2026-12-20', to: '2027-02-28' }], kind: 'season', confirmed: false })), 'From about 20 Dec to 28 Feb');
  assert.equal(whenLabel(W({ dates: [{ from: '2026-12-24', to: '2026-12-25' }], kind: 'best' })), 'Best on 24–25 Dec');
  assert.equal(whenLabel(W({ dates: [...day('2026-12-24'), ...day('2026-12-31')], kind: 'best' })), 'Best on 24 Dec, 31 Dec');
  assert.equal(whenLabel(W({ dates: day('2026-12-24'), kind: 'best', label: 'Christmas Eve' })), 'Christmas Eve', 'a label still wins');
  assert.deepEqual(['only', 'season', 'best'].map((kind) => whenTitle(W({ dates: day('2026-12-24'), kind }))), ['Only on these dates', 'Open during this period', 'Open all the time; best on these dates']);
  assert.equal(whenTitle(W({ dates: day('2026-12-24'), confirmed: false })), 'Dates not confirmed yet');
  const page = renderPlacePage(W({ dates: [{ from: '2026-12-24', to: '2026-12-25' }], kind: 'best' }), { credits: fixtureCredits(), trip: TRIP });
  assert.match(page, /chip--when chip--when-best" title="Open all the time; best on these dates">.*Best on 24–25 Dec/);
  assert.match(page, /When<\/p><p class="fact__value">Best on 24–25 Dec<\/p>/);
  // sameDayGroups: only `only`
  const a = mk({ id: 'nye-a', when: { dates: day('2026-12-31') } }), b = mk({ id: 'nye-b', when: { dates: day('2026-12-31'), kind: 'only' } });
  const best = mk({ id: 'street-on-nye', when: { dates: day('2026-12-31'), kind: 'best' } }), season = mk({ id: 'opens-nye', when: { dates: day('2026-12-31'), kind: 'season' } });
  assert.deepEqual(sameDayGroups([a, b, best, season]).map((g) => g.ids), [['nye-a', 'nye-b']]);
  assert.equal(singleDay(best), null);
  // schema + did-you-mean
  assert.deepEqual(errors(validatePlace(W({ dates: day('2026-12-31'), kind: 'best', weekly: ['sat'] }), yuCtx())).filter((i) => /^when/.test(i.path) && !/weekly$/.test(i.path)), []);
  assert.match(errors(validatePlace(W({ dates: day('2026-12-31'), kind: 'seasonal' }), yuCtx())).find((i) => i.path === 'when.kind').message, /Did you mean "season"/);
  // kind best off the route: the place is still visitable → info, softer chip, no gap
  const off = HK({ dates: day('2026-12-25'), kind: 'best' });
  const i = validatePlace(off, yuCtx()).find((x) => x.path === 'when.dates');
  assert.equal(i.level, 'info');
  assert.match(i.message, /its best dates \(25 Dec\) are outside the days in Hong Kong/);
  assert.equal(routeNote(off, TRIP).chip, 'Best dates not on your route');
  assert.equal(gaps([mk({ id: 'x', country: 'hong-kong', city: 'hong-kong', when: { dates: day('2026-12-25'), kind: 'best' } })]).items.filter((g) => g.kind === 'event').length, 0);
  assert.equal(gaps([mk({ id: 'y', country: 'hong-kong', city: 'hong-kong', when: { dates: day('2026-12-25') } })]).items.filter((g) => g.kind === 'event').length, 1);
});

test('when.weekly: weekdays inside the ranges drive the label, the days and the trip overlap', () => {
  const sat = W({ dates: [{ from: '2026-12-06', to: '2027-01-02' }], weekly: ['sat'] });
  assert.deepEqual(weeklyDays(sat), ['sat']);
  assert.deepEqual(eventDays(sat).map((r) => r.from), ['2026-12-12', '2026-12-19', '2026-12-26', '2027-01-02']);
  assert.deepEqual(eventDates(sat), [{ from: '2026-12-06', to: '2027-01-02' }], 'the ranges as written are unchanged');
  assert.equal(whenLabel(sat), 'Saturdays, 6 Dec – 2 Jan');
  assert.equal(tripOverlap(sat, TRIP), 'full');
  const wknd = W({ dates: [{ from: '2026-12-25', to: '2027-01-10' }], weekly: ['sun', 'sat'] });
  assert.equal(whenLabel(wknd), 'Saturdays and Sundays, 25 Dec – 10 Jan');
  assert.deepEqual(eventDays(wknd), [{ from: '2026-12-26', to: '2026-12-27' }, { from: '2027-01-02', to: '2027-01-03' }, { from: '2027-01-09', to: '2027-01-10' }], 'consecutive days merge');
  const o = tripOverlapInfo(wknd, TRIP);
  assert.deepEqual([o.state, o.usable], ['partial', [{ from: '2026-12-26', to: '2026-12-27' }, { from: '2027-01-02', to: '2027-01-02' }]]);
  assert.equal(routeNote(wknd, TRIP).chip, 'On your route: 26–27 Dec, 2 Jan');
  // a range of weekdays with no Saturday on the route
  const hkSat = HK({ dates: [{ from: '2027-01-19', to: '2027-01-22' }], weekly: ['sat'] });
  assert.match(errors(validatePlace(hkSat, yuCtx())).find((i) => i.path === 'when.weekly').message, /no sat falls inside the date ranges/);
  assert.equal(whenLabel(W({ dates: [{ from: '2026-12-06', to: '2027-01-02' }], weekly: ['sat'], kind: 'best' })), 'Best on saturdays, 6 Dec – 2 Jan');
  assert.equal(singleDay(W({ dates: [{ from: '2026-12-28', to: '2027-01-03' }], weekly: ['thu'] })), '2026-12-31', 'one Thursday in the range is a single-day event');
  assert.match(errors(validatePlace(W({ dates: day('2026-12-31'), weekly: ['saturday'] }), yuCtx())).find((i) => /when\.weekly\[0\]/.test(i.path)).message, /not an allowed value/);
  const exported = JSON.parse(fs.readFileSync(path.join(ROOT, 'platform/schema/place.schema.json'), 'utf8'));
  assert.ok(exported.properties.when.properties.kind && exported.properties.when.properties.weekly, 'run ./atr schema --export');
  assert.match(placeTemplate({ country: 'china', city: 'x', name: 'Y', today: '2026-11-10' }), /^#   kind: only .*\n#   weekly: \[sat\]/m);
});

// ───────────────────────── 3. faq corrections, city-level questions ─────────────────────────
test('faq: correction: true shows a "Correction" tag; feedback --new shows the game answer and flags city-level questions', () => {
  const p = fixturePlace();
  p.blocks.push({ type: 'faq', items: [{ q: 'Is the drone show confirmed for New Year?', a: 'No. No source confirms a 2026 programme yet.', correction: true }, { q: 'Cash?', a: 'Yes.' }] });
  assert.deepEqual(errors(validatePlace(p, yuCtx())), []);
  const html = renderPlacePage(p, { credits: fixtureCredits() });
  assert.equal((html.match(/tag--correction/g) || []).length, 1);
  assert.match(html, /Is the drone show confirmed for New Year\? <span class="tag tag--correction"[^>]*>Correction<\/span>/);
  // city-level questions
  const place = { id: 'harbin-ice-and-snow-world', name: 'Harbin Ice and Snow World', country: 'china', city: 'harbin', category: 'shows' };
  const q = (question) => ({ v: 1, ts: '2026-11-22T10:00:00Z', id: place.id, question, answer_summary: 'Take the overnight sleeper.' });
  assert.deepEqual(cityLevel(q('How do I get to Harbin from Shanghai?'), place, []), { city: 'harbin', area: null });
  assert.deepEqual(cityLevel(q('How do I get to Harbin from Shanghai?'), place, [{ id: 'harbin', country: 'china', name: 'Harbin', cities: ['harbin'] }]), { city: 'harbin', area: 'harbin' });
  assert.deepEqual(cityLevel(q('how long is the train from Beijing to harbin'), place, []), { city: 'harbin', area: null });
  assert.equal(cityLevel(q('How do I get to Harbin Ice and Snow World from the centre?'), place, []), null, 'about the place itself');
  assert.equal(cityLevel(q('Is it too cold in Harbin?'), place, []), null);
  assert.equal(cityLevel(q('How do I get to Tokyo?'), place, []), null, 'another city');
  const fb = { swipes: [], duels: [], questions: [q('How do I get to Harbin from Shanghai?'), q('Is it open on Jan 1?')] };
  const none = formatNewFeedback(newFeedback(fb, { since: null, places: [place], areas: [] }));
  assert.match(none, /the game answered: Take the overnight sleeper\. {2}\(if the page says otherwise, add a faq item with correction: true\)/);
  assert.match(none, /city-level question: answer it on the area card; no area card covers harbin yet, so add one \(\.\/atr new area --name "Harbin" …\)/);
  assert.equal((none.match(/city-level question/g) || []).length, 1);
  const withArea = formatNewFeedback(newFeedback(fb, { since: null, places: [place], areas: [{ id: 'harbin', country: 'china', name: 'Harbin' }] }));
  assert.match(withArea, /city-level question: answer it on the area card `harbin` \(getting_there \/ getting_around\)/);
});

// ───────────────────────── 4. stays and fame ─────────────────────────
test('stays: never a fame chip; an info hint when a stay sets fame; gaps does not ask for it', () => {
  const hostel = parse(fs.readFileSync(path.join(FIXTURES, 'places/china/shanghai/bund-rooftop-hostel/place.yaml'), 'utf8'));
  for (const fame of ['hidden', 'iconic', 'popular']) {
    const h = { ...hostel, fame };
    assert.doesNotMatch(renderPlaceCard(h, { credits: [] }), /Hidden gem|chip--iconic/, fame);
    assert.doesNotMatch(renderPlacePage(h, { credits: [] }), /Hidden gem|chip--iconic/, fame);
    const i = validatePlace(h, { fixtureMode: true, now: '2026-11-10' }).find((x) => x.path === 'fame');
    assert.equal(i.level, 'info');
    assert.match(i.message, /stays need no `fame`/);
  }
  assert.ok(!validatePlace(hostel, { fixtureMode: true, now: '2026-11-10' }).some((x) => x.path === 'fame'));
  assert.match(renderPlaceCard(hostel, { credits: [] }), /On your list/, 'the must-do chip stays');
  const r = gaps([mk({ id: 'hostel', category: 'stay', kind: 'Stay', fame: undefined, blocks: [{ type: 'hero' }, { type: 'stay' }, { type: 'highlights' }, { type: 'map' }, { type: 'tips' }] })]);
  assert.ok(!r.items.some((i) => /no fame/.test(i.message)));
  assert.doesNotMatch(placeTemplate({ country: 'japan', city: 'tokyo', name: 'Pods', category: 'stay', today: '2026-11-10' }), /^#? ?fame:/m);
});

// ───────────────────────── 5. cities without an area card ─────────────────────────
test('areas: a city with 2+ places and no area card is a gap, and a task right after the must-do items', () => {
  const places = [mk({ city: 'harbin' }), mk({ city: 'harbin' }), mk({ city: 'shanghai' }), mk({ city: 'shanghai' }), mk({ city: 'shanghai', category: 'stay', kind: 'Stay' }), mk({ city: 'chengdu' }), mk({ country: 'korea', city: 'seoul' }), mk({ country: 'korea', city: 'seoul' })];
  const areas = [{ id: 'yangtze-delta', country: 'china', name: 'Yangtze Delta', cities: ['shanghai', 'suzhou'] }];
  const r = gaps(places, areas);
  const miss = r.items.filter((i) => i.kind === 'area-missing');
  assert.deepEqual(miss.map((i) => [i.country, i.city, i.severity]), [['china', 'harbin', 'medium'], ['korea', 'seoul', 'medium']], 'shanghai is covered by a region card; chengdu has one place');
  assert.match(miss[0].message, /harbin has 2 places but no area card covers it/);
  const taste = { must_do: [{ key: 'wall', said: 'great wall', country: 'china' }] };
  const tasks = nextTasks({ config: TRIP, taste, places, areas, now: '2026-11-10', validation: { results: [] }, feedback: { swipes: [], duels: [], questions: [] }, seen: null, linkCache: {}, reviews: new Map(), count: 50 }).tasks;
  const kinds = tasks.map((t) => `${t.kind}:${t.country}`);
  const i = tasks.findIndex((t) => /^Add an area card for Harbin \(China\)/.test(t.task));
  assert.ok(i > kinds.lastIndexOf('must-do:china') && i < kinds.indexOf('city-empty:hong-kong') && i < kinds.indexOf('places:china'), kinds.join(','));
  assert.match(tasks[i].task, /it already has researched places but no card\. Give getting there, getting around, suggested days, the winter note, lat\/lng/);
  assert.match(tasks[i].why, /Harbin has 2 places and no card/);
  assert.ok(tasks.some((t) => /^Add an area card for Seoul \(South Korea\)/.test(t.task)));
  // several cities of one country go into one task
  const many = nextTasks({ config: TRIP, taste: null, places: [...places, mk({ city: 'chengdu' })], areas, now: '2026-11-10', validation: { results: [] }, feedback: { swipes: [], duels: [], questions: [] }, seen: null, linkCache: {}, reviews: new Map(), count: 50 }).tasks;
  assert.ok(many.some((t) => /^Add 2 area cards for Chengdu and Harbin \(China\): each already has/.test(t.task)));
});

test('public API and guide: round 9', () => {
  for (const k of ['routeNote', 'eventDays', 'whenKind', 'whenTitle', 'weeklyDays', 'cityLevel']) assert.ok(api[k], k);
  const guide = fs.readFileSync(path.join(ROOT, 'docs/CURATOR-GUIDE.md'), 'utf8');
  for (const re of [/kind: best/, /weekly: \[sat\]/, /correction: true/, /Not on your route/, /stays need no `fame`/i]) assert.match(guide, re);
  const css = fs.readFileSync(path.join(ROOT, 'platform/lib/render/assets/atr.css'), 'utf8');
  assert.match(css, /rgba\(10, 8, 5, 0\) 88%\)/, 'the scrim ends before the top of the text box');
});
