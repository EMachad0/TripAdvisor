// Parity: game/lib/trip.js against the port, on the real trip/ files, the real notes (free text with times) and
// the game's fixture places, every day from before the trip to after it.
import { beforeAll, describe, expect, test } from 'vitest';
import * as trip from '../../src/trip.ts';
import type { Leg } from '../../src/trip.ts';
import {
	feedbackRecords,
	fixtureState,
	readConfig,
	tripDocs,
	type FixtureState,
} from '../samples.ts';
import { LEGS, PLACES } from '../trip-fixtures.ts';
import { legacy, seeded } from '../support.ts';
import { grid, pick, range, same } from './harness.ts';

let old: typeof trip;
let fx: FixtureState;
let configDays: Record<string, number>;
beforeAll(async () => {
	old = await legacy<typeof trip>('game/lib/trip.js');
	fx = await fixtureState();
	const cfg = await readConfig();
	const countries = Array.isArray(cfg['countries'])
		? (cfg['countries'] as { id: string; days: number }[])
		: [];
	configDays = Object.fromEntries(countries.map((c) => [c.id, c.days]));
});

const realLegs = (): Leg[] => tripDocs('legs');
const legSets = (): Leg[][] => [realLegs(), LEGS, [...realLegs(), ...LEGS], []];

/** The fixture places with seeded verdicts and ratings, plus the made-up dated places. */
function places(seed: number): (typeof PLACES)[number][] {
	const rng = seeded(seed);
	return [
		...fx.places.map((p) => ({
			...p,
			verdict: pick(rng, ['must', 'maybe', 'skip', null]),
			rating: 1400 + rng() * 300,
		})),
		...PLACES,
	];
}

/** Every day from 10 days before the real trip to 10 days after it. */
function tripDays(): string[] {
	const span = trip.tripSpan(realLegs());
	if (!span) return [];
	const start = trip.addDays(span.first, -10);
	return range(span.days + 20).map((i) => trip.addDays(start, i));
}

describe('trip parity', () => {
	test('tables', () => {
		for (const k of [
			'COLLECTIONS',
			'RATES',
			'SHIFT',
			'TZ_OFFSET',
			'AIRPORT_TZ',
			'EVENT_MAX_DAYS',
			'NEAR_KM',
		] as const)
			expect(trip[k], k).toStrictEqual(old[k]);
	});

	test('todayModel for every day of the real trip', () => {
		const days = tripDays();
		expect(days.length).toBeGreaterThan(30);
		const tasks = tripDocs('tasks'),
			dayDocs = tripDocs('days'),
			visited = tripDocs('visited');
		const cases = days.flatMap((today, i) =>
			['06:30', '13:05', '23:59'].map(
				(t) => () =>
					[
						{
							legs: realLegs(),
							places: places(i),
							tasks,
							days: dayDocs,
							visited: i % 3 ? visited : [{ id: fx.places[0]?.id ?? '' }],
							today,
							now: `${today}T${t}`,
						},
					] as Parameters<typeof trip.todayModel>,
			),
		);
		same(old.todayModel, trip.todayModel)(cases);
		same(
			old.todayModel,
			trip.todayModel,
		)([
			() => [{ legs: LEGS, places: PLACES, today: '2026-12-07', now: '2026-12-07T09:00' }],
			() => [{ legs: [], today: '2026-12-20', now: '2026-12-20T00:00' }],
		]);
	});

	test('legs: span, stays, events and next flight by day', () => {
		const days = tripDays();
		for (const legs of legSets()) {
			same(old.tripSpan, trip.tripSpan)([() => [legs]]);
			same(old.legsSorted, trip.legsSorted)([() => [legs]]);
			same(old.stayOn, trip.stayOn)(days.map((d) => () => [legs, d]));
			same(old.hereOn, trip.hereOn)(days.map((d) => () => [legs, d]));
			same(old.eventsOn, trip.eventsOn)(days.map((d) => () => [legs, d]));
			same(old.offsetOn, trip.offsetOn)(days.map((d) => () => [legs, d]));
			same(
				old.nextFlight,
				trip.nextFlight,
			)(grid(days, ['00:00', '12:00', '23:59']).map(([d, t]) => () => [legs, `${d}T${t}`]));
			same(old.legOffsets, trip.legOffsets)(legs.map((l) => () => [l, legs]));
			same(old.stayCities, trip.stayCities)(legs.map((l) => () => [l]));
			same(old.stayName, trip.stayName)(legs.map((l) => () => [l]));
		}
		same(
			old.legOffsets,
			trip.legOffsets,
		)([
			() => [null, []],
			() => [{ type: 'note' }, []],
			() => [{ type: 'flight', from: 'xxx', to: 'hkg', tzEnd: '' }, []],
			() => [{ type: 'stay', tz: '5.5' }, []],
		]);
		same(
			old.stayCities,
			trip.stayCities,
		)([() => [null], () => [{ cities: [], city: 'a' }], () => [{ cities: null }]]);
		same(
			old.stayName,
			trip.stayName,
		)([() => [null], () => [{ title: ' · x' }], () => [{ title: 'Kyoto · Piece Hostel' }]]);
	});

	test('dated places: onDay, upcomingEvents, reach', () => {
		const days = tripDays();
		const ps = places(7);
		const countries = [null, 'china', 'japan', 'hong-kong', 'thailand'];
		const cities = [[], ['shanghai'], ['tokyo', 'kyoto'], ['hong-kong']];
		same(
			old.onDay,
			trip.onDay,
		)(
			grid(days, grid(countries, cities)).map(([d, [country, cs]]) => () => [
				ps,
				d,
				{ country, cities: cs },
			]),
		);
		same(old.onDay, trip.onDay)([() => [ps, '2027-02-06'], () => [[], '2027-02-06']]);
		for (const legs of legSets())
			same(
				old.upcomingEvents,
				trip.upcomingEvents,
			)(
				days.flatMap((d) => [
					() => [ps, legs, d],
					() => [ps, legs, d, { limit: 0, includeToday: true }],
					() => [ps, legs, d, { limit: 3 }],
				]),
			);
		const centers = trip.cityCenters(ps);
		same(old.cityCenters, trip.cityCenters)([() => [ps], () => [[]]]);
		same(old.reachOf, trip.reachOf)(grid(ps, cities).map(([p, cs]) => () => [p, cs, centers]));
	});

	test('time zones on every free text of the trip and the notes', () => {
		const texts = [
			...tripDocs('legs').flatMap((l) => [
				l.note,
				l.plan,
				l.title,
				l.checkIn,
				l.checkOut,
				l.duration,
			]),
			...tripDocs('tasks').flatMap((t) => [t.title, t.note]),
			...tripDocs('days').map((d) => d.note),
			...tripDocs('settings').map((s) => s.tips),
			...tripDocs('budget').map((b) => b.pay),
			...feedbackRecords('notes').map((n) => n.text),
			...feedbackRecords('questions').flatMap((q) => [q.question, q.answer_summary]),
			'already 17:10 UTC−3, R$ 774,89, 1h 05m, ratio 16:9',
			'opens 9am, last entry 4:30 pm; 12pm or 1 pm; 20:00 to 22:00, and 23:00 (GMT+8)',
			'',
			null,
			undefined,
			42,
		];
		expect(texts.length).toBeGreaterThan(500);
		same(old.tzSpots, trip.tzSpots)(texts.map((t) => () => [t]));
		same(old.tzText, trip.tzText)(grid(texts, ['UTC+8', '', null]).map(([t, l]) => () => [t, l]));
		same(
			old.tzLabel,
			trip.tzLabel,
		)(
			[-3, 8, 5.5, 5.75, -9.5, 0, '9', '', null, undefined, 'x', NaN, Infinity].map((o) => () => [
				o,
			]),
		);
		same(
			old.instantOf,
			trip.instantOf,
		)(
			grid(
				['2026-12-04T17:10', '2026-12-04', '', null, '2027-02-05T23:59:30'],
				[-3, 8, '8', '', null],
			).map(([s, o]) => () => [s, o]),
		);
	});

	test('dates', () => {
		const days = tripDays();
		same(
			old.dayKey,
			trip.dayKey,
		)(['2026-12-04T17:10', '2026-12-04', '', null, undefined].map((s) => () => [s]));
		same(
			old.timeOf,
			trip.timeOf,
		)(
			['2026-12-04T17:10', '2026-12-04', '', null, undefined, 'T9:00', 'xT10:30y'].map(
				(s) => () => [s],
			),
		);
		same(old.addDays, trip.addDays)(days.map((d, i) => () => [d, i - 40]));
		same(
			old.diffDays,
			trip.diffDays,
		)(grid(days.slice(0, 15), days.slice(-15)).map(([a, b]) => () => [a, b]));
		same(old.weekday, trip.weekday)(days.map((d) => () => [d]));
		same(old.inDays, trip.inDays)(grid(days.slice(0, 5), days).map(([a, b]) => () => [a, b]));
		const at = new Date(2026, 11, 31, 23, 59);
		same(old.localKey, trip.localKey)([() => [at]]);
		same(old.localStamp, trip.localStamp)([() => [at]]);
		same(old.pad, trip.pad)([() => [3], () => [12], () => ['7']]);
	});

	test('search', () => {
		const ps = places(3);
		const qs = [
			'',
			'ramen',
			'RAMEM bom',
			'duck crisp',
			'shows',
			'hong kong',
			'temple',
			'zzz',
			'Ō',
			'café',
		];
		const shows = ['all', 'picks', 'must', 'been', 'todo'] as const;
		const visited = [{ id: 'duck' }, { id: fx.places[1]?.id ?? '' }];
		const cases = grid(qs, shows).flatMap(([q, show]) => [
			() =>
				[ps, { q, show, visited, categories: fx.categories }] as Parameters<
					typeof trip.searchPlaces
				>,
			() =>
				[ps, { q, show, cities: ['osaka', 'shanghai'], visited }] as Parameters<
					typeof trip.searchPlaces
				>,
			() =>
				[ps, { q, show, country: 'japan', category: 'food' }] as Parameters<
					typeof trip.searchPlaces
				>,
		]);
		same(old.searchPlaces, trip.searchPlaces)(cases);
		same(old.searchPlaces, trip.searchPlaces)([() => [ps], () => []]);
		same(
			old.haystack,
			trip.haystack,
		)(ps.map((p) => () => [p, fx.categories[p.category ?? '']?.label]));
	});

	test('calendar and money on the real files', () => {
		const budget = tripDocs('budget').map((b) => ({
			...b,
			days: configDays[b.country ?? ''] ?? 0,
		}));
		const money = {
			budget,
			fixed: tripDocs('fixed'),
			spend: tripDocs('spend'),
			settings: tripDocs('settings'),
		};
		same(
			old.periods,
			trip.periods,
		)([
			() => [tripDocs('days')],
			() => [],
			() => [
				[
					{ id: '2026-12-01', status: 'work' },
					{ id: '2026-12-03', status: 'off' },
					{ id: '2026-12-02', status: 'work' },
					{ id: 'bad', status: 'work' },
				],
			],
		]);
		same(
			old.moneyTotals,
			trip.moneyTotals,
		)([() => [money], () => [], () => [{ budget: [{ bed: '10', food: 'x', days: '3' }] }]]);
		same(old.dailyOf, trip.dailyOf)(budget.map((b) => () => [b]));
		const kinds = ['bed', 'food', 'other'] as const;
		const prices = [0, 1, 50, 100, 111, 130, 200, '', '75', -5];
		const currencies = ['BRL', 'CNY', 'JPY', 'THB', 'XXX'];
		same(
			old.priceCheck,
			trip.priceCheck,
		)(
			[...budget, null, undefined, { bed: 0 }].flatMap((b) =>
				grid(grid(kinds, prices), currencies).map(([[k, p], c]) => () => [b, k, p, c]),
			),
		);
	});
});
