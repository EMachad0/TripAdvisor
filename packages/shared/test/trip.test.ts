// Ported from game/test/trip.test.js (the shared trip maths; the store and server tests stay with the old site).
import { describe, expect, test } from 'vitest';
import {
	addDays,
	cityCenters,
	COLLECTIONS,
	diffDays,
	eventsOn,
	hereOn,
	inDays,
	instantOf,
	legOffsets,
	moneyTotals,
	nextFlight,
	offsetOn,
	onDay,
	periods,
	priceCheck,
	reachOf,
	searchPlaces,
	stayOn,
	todayModel,
	tripSpan,
	tzLabel,
	tzSpots,
	tzText,
	upcomingEvents,
	type Leg,
	type SearchOptions,
	type TripPlace,
} from '../src/trip.ts';

import { LEGS, P, PLACES } from './trip-fixtures.ts';

const byId = (id: string): TripPlace => PLACES.find((p) => p.id === id) ?? P('missing');

describe('trip maths', () => {
	test('dates: span, stay of the night, where you are, what touches a day', () => {
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(diffDays('2026-12-06', '2027-01-02')).toBe(27);
		expect(tripSpan(LEGS)).toEqual({ first: '2026-12-04', last: '2026-12-17', days: 14 });
		expect(tripSpan([])).toBeNull();
		expect(stayOn(LEGS, '2026-12-08')?.id).toBe('s1');
		expect(stayOn(LEGS, '2026-12-09')?.id).toBe('s2');
		expect(stayOn(LEGS, '2026-12-05')).toBeNull();
		expect(stayOn(LEGS, '2026-12-16')?.id).toBe('l1');
		expect(
			hereOn([{ id: 'x', type: 'stay', start: '2026-12-01', end: '2026-12-04' }], '2026-12-04')?.id,
		).toBe('x');
		expect(eventsOn(LEGS, '2026-12-12').map((l) => l.id)).toEqual(['s2', 's3', 'f2']);
		expect(eventsOn(LEGS, '2026-12-05')).toEqual([]);
		expect(eventsOn(LEGS, '2026-12-06').map((l) => l.id)).toEqual(['f1', 's1']);
	});

	test('next flight: by time when it has one, by day when it does not', () => {
		expect(nextFlight(LEGS, '2026-11-15T10:00')?.id).toBe('f1');
		expect(nextFlight(LEGS, '2026-12-04T17:09')?.id).toBe('f1');
		expect(nextFlight(LEGS, '2026-12-04T17:11')?.id).toBe('f2');
		expect(nextFlight(LEGS, '2026-12-16T23:00')?.id).toBe('f3');
		expect(nextFlight(LEGS, '2026-12-17T00:01')).toBeNull();
		expect(inDays('2026-12-01', '2026-12-01')).toBe('today');
		expect(inDays('2026-12-01', '2026-12-02')).toBe('tomorrow');
		expect(inDays('2026-12-01', '2026-12-15')).toBe('in 14 days');
	});

	test('reach: your city, a day trip, or too far', () => {
		const centers = cityCenters(PLACES);
		expect(reachOf(byId('bund-show'), ['shanghai'], centers)).toBe('here');
		expect(reachOf(byId('suzhou-night'), ['shanghai'], centers)).toBe('near');
		expect(reachOf(byId('harbin-ice'), ['shanghai'], centers)).toBe('far');
		expect(reachOf({ city: 'x' }, ['shanghai'], centers)).toBe('far');
	});

	test('only today: one-day events, last days, running ones; skipped and other countries are out', () => {
		const xs = onDay(PLACES, '2026-12-07', { country: 'china', cities: ['shanghai'] });
		expect(xs.map((h) => [h.place.id, h.kind, h.reach])).toEqual([
			['bund-show', 'only', 'here'],
			['lantern-week', 'on', 'here'],
			['winter-season', 'on', 'here'],
			['harbin-ice', 'only', 'far'],
		]);
		expect(xs.find((h) => h.place.id === 'lantern-week')?.left).toBe(1);
		expect(xs.find((h) => h.place.id === 'winter-season')?.season).toBe(true);
		const dec8 = onDay(PLACES, '2026-12-08', { country: 'china', cities: ['shanghai'] });
		expect(dec8.find((h) => h.place.id === 'lantern-week')?.kind).toBe('last');
		expect(onDay(PLACES, '2026-12-13', { country: 'china' }).map((h) => h.place.id)).toEqual([
			'winter-season',
		]);
	});

	test('next events: first day inside a stay they can be reached from, in date order', () => {
		const up = upcomingEvents(PLACES, LEGS, '2026-11-15');
		expect(up.map((u) => [u.place.id, u.date, u.reach])).toEqual([
			['lantern-week', '2026-12-06', 'here'],
			['bund-show', '2026-12-07', 'here'],
			['suzhou-night', '2026-12-08', 'near'],
			['ado-live', '2026-12-13', 'here'],
		]);
		expect(upcomingEvents(PLACES, LEGS, '2026-12-07').map((u) => u.place.id)).toEqual([
			'lantern-week',
			'suzhou-night',
			'ado-live',
		]);
		expect(upcomingEvents(PLACES, LEGS, '2026-12-07')[0]?.date).toBe('2026-12-08');
		expect(upcomingEvents(PLACES, LEGS, '2026-11-15', { limit: 2 })).toHaveLength(2);
	});

	test('today: before, during and after the trip', () => {
		const tasks = [
			{ id: 'a', title: 'A', status: 'done' },
			{ id: 'b', title: 'B', order: 1 },
			{ id: 'c', title: 'C', status: 'doing', order: 2 },
		];
		const days = [{ id: '2026-12-07', status: 'vacation', note: 'hi' }];
		const before = todayModel({
			legs: LEGS,
			places: PLACES,
			tasks,
			days,
			today: '2026-11-15',
			now: '2026-11-15T10:00',
		});
		expect([before.phase, before.toDeparture, before.stay, before.flight?.id]).toEqual([
			'before',
			19,
			null,
			'f1',
		]);
		expect(before.tasks.map((t) => t.id)).toEqual(['c', 'b']);

		const during = todayModel({
			legs: LEGS,
			places: PLACES,
			tasks,
			days,
			visited: [],
			today: '2026-12-07',
			now: '2026-12-07T09:00',
		});
		expect([during.phase, during.dayNumber, during.stay?.id, during.country]).toEqual([
			'during',
			4,
			's1',
			'china',
		]);
		expect([during.shift, during.day?.note, during.flight?.id]).toEqual([
			'20:00–05:00',
			'hi',
			'f2',
		]);
		expect(during.onlyToday.map((h) => h.place.id)).toEqual(['bund-show']);
		expect(during.endingSoon.map((h) => h.place.id)).toEqual(['lantern-week']);
		expect(during.musts.map((p) => p.id)).toEqual(['winter-season']);
		const ticked = todayModel({
			legs: LEGS,
			places: PLACES,
			visited: [{ id: 'winter-season' }],
			today: '2026-12-07',
			now: '2026-12-07T09:00',
		});
		expect(ticked.musts).toHaveLength(0);

		const moveDay = todayModel({
			legs: LEGS,
			places: PLACES,
			today: '2026-12-12',
			now: '2026-12-12T08:00',
		});
		expect(moveDay.stay?.id).toBe('s3');
		expect(moveDay.moves.map((l) => l.id)).toEqual(['f2']);
		expect(todayModel({ legs: LEGS, today: '2026-12-20', now: '2026-12-20T08:00' }).phase).toBe(
			'after',
		);
		expect(todayModel({ legs: [], today: '2026-12-20' }).phase).toBe('none');
	});

	test('search: every word must match; accents and case are ignored; Must first', () => {
		const ids = (o: SearchOptions): string[] => searchPlaces(PLACES, o).map((p) => p.id);
		expect(ids({ q: 'ramen' })).toEqual(['ramen-ya']);
		expect(ids({ q: 'RAMEM bom' })).toEqual(['ramen-ya']);
		expect(ids({ q: 'ramen', cities: ['shanghai'] })).toEqual([]);
		expect(ids({ cities: ['osaka'] })).toEqual(['ramen-ya', 'ado-live']);
		expect(ids({ cities: ['osaka'], show: 'picks' })).toEqual(['ramen-ya']);
		expect(ids({ q: 'duck crisp' })).toEqual(['duck']);
		expect(ids({ q: 'shows', categories: { shows: { label: 'Shows' } } })).toEqual(['ado-live']);
		expect(ids({ cities: ['shanghai'] }).at(-1)).toBe('skipped-fair');
		expect(ids({ show: 'been', visited: [{ id: 'duck' }] })).toEqual(['duck']);
		expect(ids({ show: 'todo', visited: [{ id: 'duck' }] })).not.toContain('duck');
	});

	test('calendar periods and money', () => {
		const days = [
			{ id: '2026-12-01', status: 'work' },
			{ id: '2026-12-02', status: 'work' },
			{ id: '2026-12-05', status: 'off' },
			{ id: '2026-12-07', status: 'vacation' },
			{ id: '2026-12-08', status: 'vacation', holiday: 'x' },
			{ id: '2026-12-10', status: 'work' },
			{ id: 'junk', status: 'work' },
		];
		expect(periods(days)).toEqual([
			{ kind: 'work', from: '2026-12-01', to: '2026-12-02', n: 2 },
			{ kind: 'vacation', from: '2026-12-07', to: '2026-12-08', n: 2 },
			{ kind: 'work', from: '2026-12-10', to: '2026-12-10', n: 1 },
		]);
		const m = moneyTotals({
			budget: [
				{ bed: 80, food: 100, other: 170, days: 27 },
				{ bed: 0, food: 60, other: 120, days: 1 },
			],
			fixed: [{ amount: 775 }, { amount: 5500 }],
			spend: [{ amountBRL: 50 }],
			settings: [{ id: 'main', cap: 20000 }],
		});
		expect(m).toEqual({
			cap: 20000,
			fixedT: 6275,
			groundT: 9630,
			spentT: 50,
			planT: 15905,
			spare: 4095,
			days: 28,
		});
		const b = { bed: 80, food: 100 };
		expect(priceCheck(b, 'bed', 100, 'CNY').level).toBe('ok');
		expect(priceCheck(b, 'bed', 130, 'CNY').level).toBe('warn');
		expect(priceCheck(b, 'bed', 200, 'CNY').level).toBe('over');
		expect(priceCheck(b, 'bed', '', 'CNY').level).toBe('idle');
		expect(priceCheck(b, 'other', 50, 'BRL').level).toBe('idle');
	});

	test('collections are the nine trip files, in order', () => {
		expect(COLLECTIONS).toEqual([
			'tasks',
			'legs',
			'bag',
			'budget',
			'fixed',
			'spend',
			'settings',
			'days',
			'visited',
		]);
	});

	test('timezones: labels, leg offsets and the times found in free text', () => {
		expect(tzLabel(-3)).toBe('UTC−3');
		expect(tzLabel(8)).toBe('UTC+8');
		expect(tzLabel(5.5)).toBe('UTC+5:30');
		expect(tzLabel(null)).toBe('');
		expect(tzText('Lands at PVG 05:10: ask for bag storage', 'UTC+8')).toBe(
			'Lands at PVG 05:10 UTC+8: ask for bag storage',
		);
		expect(tzText('work nights 20:00–05:00 on Dec 28', 'UTC+8')).toBe(
			'work nights 20:00–05:00 UTC+8 on Dec 28',
		);
		expect(tzText('shows at 20:00, 21:00 and 22:00 on Sundays', 'UTC+8')).toBe(
			'shows at 20:00, 21:00 and 22:00 UTC+8 on Sundays',
		);
		expect(tzText('opens 9am, last entry 4:30 pm', 'UTC+9')).toBe(
			'opens 9am UTC+9, last entry 4:30 pm UTC+9',
		);
		expect(tzSpots('already 17:10 UTC−3, R$ 774,89, 1h 05m, ratio 16:9')).toEqual([]);
		const legs: Leg[] = [
			{ id: 's0', type: 'stay', country: 'japan', start: '2027-02-02', end: '2027-02-05' },
			{ id: 'cab', type: 'transport', start: '2027-02-05T10:00' },
			{
				id: 'f',
				type: 'flight',
				from: 'KIX',
				to: 'HKG',
				start: '2027-02-05T13:30',
				end: '2027-02-05T17:15',
			},
			{ id: 'bus', type: 'transport', start: '2027-02-05T18:00' },
			{ id: 's1', type: 'stay', country: 'hong-kong', start: '2027-02-05', end: '2027-02-09' },
		];
		expect(legOffsets(legs[2], legs)).toEqual({ start: 9, end: 8 });
		expect(legOffsets(legs[1], legs).start).toBe(9);
		expect(legOffsets(legs[3], legs).start).toBe(8);
		expect(legOffsets({ type: 'flight', from: 'XXX', to: 'HKG', tzStart: 2 }, []).start).toBe(2);
		expect(offsetOn(legs, '2027-02-07')).toBe(8);
		expect(offsetOn(legs, '2026-11-15')).toBe(-3);
		expect(instantOf('2026-12-04T17:10', -3)).toBe(Date.parse('2026-12-04T20:10:00Z'));
	});
});
