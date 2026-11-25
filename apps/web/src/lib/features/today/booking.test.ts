import { describe, expect, it } from 'vitest';
import type { TripLeg } from '../trip/types.ts';
import { bookedPlaces, bookingList, legItems, peakOf, placeItems } from './booking.ts';
import type { TodayPlace } from './model.ts';

const stay = (
	id: string,
	start: string,
	end: string,
	status = 'planned',
	extra: Partial<TripLeg> = {},
): TripLeg => ({
	id,
	type: 'stay',
	country: 'china',
	city: id,
	title: id,
	start,
	end,
	status,
	...extra,
});

const place = (id: string, over: Partial<TodayPlace> = {}): TodayPlace =>
	({
		id,
		name: id,
		city: 'shanghai',
		cityName: 'Shanghai',
		country: 'china',
		days: [],
		verdict: 'must',
		booking: { level: 'required', lead_days: 3, badge: null, links: [] },
		...over,
	}) as TodayPlace;

describe('legItems', () => {
	it('lists a stay with no bed, due a week before check-in', () => {
		const [x] = legItems([stay('beijing', '2026-12-13', '2026-12-16')], '2026-11-25');
		expect(x).toMatchObject({ kind: 'bed', by: '2026-12-06', tone: 'later' });
		expect(x?.detail).toContain('3 nights');
	});

	it('leaves out booked, on-the-day and zero-night stays, and stays already over', () => {
		const legs = [
			stay('a', '2026-12-06', '2026-12-09', 'booked'),
			stay('b', '2027-01-10', '2027-01-10', 'planned'),
			stay('c', '2026-12-01', '2026-12-04', 'onday'),
			stay('d', '2026-11-01', '2026-11-05'),
		];
		expect(legItems(legs, '2026-11-25')).toEqual([]);
	});

	it('asks a month ahead when a night falls on New Year’s Eve', () => {
		const ckg = stay('chongqing', '2026-12-26', '2027-01-02');
		expect(peakOf(ckg)).toBe('New Year’s Eve');
		expect(legItems([ckg], '2026-11-25')[0]).toMatchObject({ by: '2026-11-26', tone: 'soon' });
	});

	it('does not count the checkout day as a night', () => {
		expect(peakOf(stay('x', '2026-12-28', '2026-12-31'))).toBeNull();
	});

	it('Lunar New Year is a peak only where it is celebrated', () => {
		expect(
			peakOf(stay('hk', '2027-02-05', '2027-02-09', 'planned', { country: 'hong-kong' })),
		).toBe('Lunar New Year');
		expect(
			peakOf(stay('kyoto', '2027-02-02', '2027-02-05', 'planned', { country: 'japan' })),
		).toBeNull();
	});

	it('warns loudly when check-in is days away and nothing is booked', () => {
		expect(legItems([stay('x', '2026-12-09', '2026-12-11', 'tbd')], '2026-12-08')[0]).toMatchObject(
			{
				tone: 'late',
				label: 'Check-in tomorrow: no bed yet',
			},
		);
	});

	it('a stay you are in with no bed counts from tonight', () => {
		expect(legItems([stay('x', '2026-12-09', '2026-12-12')], '2026-12-10')[0]?.label).toBe(
			'Tonight: no bed booked',
		);
	});

	it('lists a flight not bought, three weeks ahead', () => {
		const fl: TripLeg = {
			id: 'home',
			type: 'flight',
			status: 'tbd',
			from: 'HKG',
			to: 'GRU',
			start: '2027-02-09',
		};
		expect(legItems([fl], '2026-11-25')[0]).toMatchObject({ kind: 'flight', by: '2027-01-19' });
	});
});

describe('placeItems', () => {
	const legs = [stay('shanghai', '2026-12-06', '2026-12-09')];

	it('a pick is due its lead days before the first day in its city', () => {
		expect(placeItems([place('yu')], legs, '2026-11-25')[0]).toMatchObject({
			by: '2026-12-03',
			on: '2026-12-06',
		});
	});

	it('a fixed deadline wins, and a card not called yet still shows when it has one', () => {
		const disney = place('disney', {
			verdict: null,
			booking: { level: 'recommended', deadline: '2026-11-27', badge: null, links: [] },
		});
		expect(placeItems([disney], legs, '2026-11-25')[0]).toMatchObject({
			by: '2026-11-27',
			tone: 'soon',
			optional: true,
		});
	});

	it('leaves out skipped, visited, booked, uncalled without a deadline, and cities off the route', () => {
		const xs = [
			place('skip', { verdict: 'skip' }),
			place('seen'),
			place('done'),
			place('none', { verdict: null }),
			place('far', { city: 'harbin' }),
			place('free', { booking: { level: 'none', badge: null, links: [] } }),
		];
		expect(
			placeItems(xs, legs, '2026-11-25', { visited: new Set(['seen']), booked: new Set(['done']) }),
		).toEqual([]);
	});

	it('a dated card uses its first day inside the stay', () => {
		const ev = place('ev', { days: [{ from: '2026-12-08', to: '2026-12-08' }] });
		expect(placeItems([ev], legs, '2026-11-25')[0]?.on).toBe('2026-12-08');
		const off = place('off', { days: [{ from: '2026-12-20', to: '2026-12-21' }] });
		expect(placeItems([off], legs, '2026-11-25')).toEqual([]);
	});
});

describe('bookingList', () => {
	it('sorts everything by book-by day', () => {
		const xs = bookingList({
			legs: [
				stay('shanghai', '2026-12-06', '2026-12-09'),
				stay('beijing', '2026-12-13', '2026-12-16'),
			],
			places: [place('yu')],
			today: '2026-11-25',
		});
		expect(xs.map((x) => x.id)).toEqual(['shanghai', 'yu', 'beijing']);
	});

	it('reads the booked cards from settings', () => {
		expect([...bookedPlaces([{ id: 'main' }, { id: 'booked', places: ['a', 'b'] }])]).toEqual([
			'a',
			'b',
		]);
		expect(bookedPlaces([])).toEqual(new Set());
	});
});
