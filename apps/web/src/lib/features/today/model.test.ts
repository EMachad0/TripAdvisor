import { describe, expect, it } from 'vitest';
import type { ContentPlace } from '#lib/content/types.js';
import type { TripDay, TripLeg } from '../trip/types.ts';
import {
	askedLabel,
	clockAt,
	clocks,
	countdown,
	dayArg,
	elsewhere,
	head,
	kindLabel,
	modelFor,
	pinnedClock,
	plainMd,
	stampAt,
	todayPlaces,
	todayTasks,
	tripClock,
	upcomingWhen,
	type TodayPlace,
} from './model.ts';

const LEGS: TripLeg[] = [
	{
		id: 'gru-pvg',
		type: 'flight',
		from: 'GRU',
		to: 'PVG',
		start: '2026-12-04T23:55',
		end: '2026-12-06T06:10',
		tzStart: -3,
		tzEnd: 8,
	},
	{
		id: 'stay-sha',
		type: 'stay',
		country: 'china',
		city: 'shanghai',
		title: 'Shanghai · Hostel',
		start: '2026-12-06',
		end: '2026-12-09',
	},
	{
		id: 'stay-harbin',
		type: 'stay',
		country: 'china',
		city: 'harbin',
		title: 'Harbin hostel',
		start: '2026-12-20',
		end: '2026-12-24',
	},
	{
		id: 'pvg-nrt',
		type: 'flight',
		from: 'PVG',
		to: 'NRT',
		start: '2027-01-10T10:00',
		end: '2027-01-10T14:00',
	},
	{
		id: 'stay-kansai',
		type: 'stay',
		country: 'japan',
		cities: ['kyoto', 'osaka'],
		title: 'Kansai base',
		start: '2027-01-10',
		end: '2027-01-15',
		status: 'tbd',
	},
	{ id: 'train', type: 'transport', start: '2027-01-12T10:00', title: 'Kyoto to Osaka' },
];

const COUNTRIES = [
	{ id: 'china', name: 'China', flag: '🇨🇳' },
	{ id: 'japan', name: 'Japan', flag: '🇯🇵' },
] as unknown as Parameters<typeof clocks>[2];

function place(id: string, over: Partial<TodayPlace> = {}): TodayPlace {
	return {
		id,
		name: id,
		country: 'china',
		city: 'harbin',
		cityName: 'Harbin',
		category: 'event',
		loc: null,
		days: [],
		verdict: null,
		note: null,
		rating: null,
		...over,
	} as unknown as TodayPlace;
}

const at = (iso: string): number => Date.parse(iso);

describe('tripClock', () => {
	it('uses the zone of the current leg, whatever the device says', () => {
		// 22:00 in São Paulo on Dec 20 is 09:00 on Dec 21 in Harbin (UTC+8).
		const ms = at('2026-12-21T01:00:00Z');
		const c = tripClock(LEGS, ms, { day: '2026-12-20', stamp: '2026-12-20T22:00' });
		expect(c).toEqual({ today: '2026-12-21', now: '2026-12-21T09:00', offset: 8 });
	});

	it('keeps the device date before and after the trip', () => {
		const before = tripClock(LEGS, at('2026-11-15T12:00:00Z'), {
			day: '2026-11-15',
			stamp: '2026-11-15T09:00',
		});
		expect(before).toEqual({ today: '2026-11-15', now: '2026-11-15T09:00', offset: null });
		const after = tripClock(LEGS, at('2027-03-01T12:00:00Z'), {
			day: '2027-03-01',
			stamp: '2027-03-01T09:00',
		});
		expect(after.offset).toBeNull();
	});

	it('the departure evening in Brazil is the first trip day at UTC−3', () => {
		const c = tripClock(LEGS, at('2026-12-05T01:00:00Z'), {
			day: '2026-12-05',
			stamp: '2026-12-05T10:00',
		});
		expect(c).toEqual({ today: '2026-12-04', now: '2026-12-04T22:00', offset: -3 });
	});

	it('with no dated legs it is the device date', () => {
		const c = tripClock([], 0, { day: '2026-01-01', stamp: '2026-01-01T00:00' });
		expect(c.today).toBe('2026-01-01');
	});

	it('re-reads the offset when the guessed day sits in another stay', () => {
		// Jan 10 05:00 UTC: by China (UTC+8, last stay) it is 13:00 on Jan 10, inside the Kansai stay (UTC+9).
		const c = tripClock(LEGS, at('2027-01-10T05:00:00Z'), {
			day: '2027-01-09',
			stamp: '2027-01-09T23:00',
		});
		expect(c).toEqual({ today: '2027-01-10', now: '2027-01-10T14:00', offset: 9 });
	});
});

describe('small helpers', () => {
	it('stampAt writes the wall clock at an offset', () => {
		expect(stampAt(at('2026-12-21T01:05:00Z'), 8)).toBe('2026-12-21T09:05');
		expect(stampAt(at('2026-12-21T01:05:00Z'), -3)).toBe('2026-12-20T22:05');
		expect(stampAt(at('2026-12-21T01:05:00Z'), 5.5)).toBe('2026-12-21T06:35');
	});

	it('dayArg accepts real dates only', () => {
		expect(dayArg('2027-01-30')).toBe('2027-01-30');
		expect(dayArg('2027-02-30')).toBeNull();
		expect(dayArg('tomorrow')).toBeNull();
		expect(dayArg(undefined)).toBeNull();
	});

	it('pinnedClock is the morning of the day', () => {
		expect(pinnedClock(LEGS, '2026-12-22')).toEqual({
			today: '2026-12-22',
			now: '2026-12-22T09:00',
			offset: 8,
		});
	});

	it('clockAt formats the weekday and the 24 h time in a zone', () => {
		expect(clockAt(at('2026-12-21T01:05:00Z'), 'Asia/Shanghai')).toEqual({
			weekday: 'Mon',
			time: '09:05',
		});
		expect(clockAt(at('2026-12-21T01:05:00Z'), 'America/Sao_Paulo')).toEqual({
			weekday: 'Sun',
			time: '22:05',
		});
		expect(clockAt(0, undefined).time).toBe('–');
	});

	it('plainMd drops links and emphasis', () => {
		expect(plainMd('Use **[Alipay](https://x.y)** and `cash`_now_')).toBe('Use Alipay and cashnow');
	});

	it('askedLabel is the short date with the year', () => {
		expect(askedLabel({ asked: '2026-11-20' })).toBe('20 Nov 2026');
	});

	it('todayPlaces joins verdicts, notes and ratings', () => {
		const [p] = todayPlaces(
			[{ id: 'a', city: 'x' } as unknown as ContentPlace],
			{ a: 'must' },
			{ a: 'go early' },
			{ a: { rating: 1550, games: 0, wins: 0 } },
		);
		expect(p).toMatchObject({ verdict: 'must', note: 'go early', rating: 1550 });
	});

	it('todayTasks reads the old task fields', () => {
		const [a, b] = todayTasks([
			{ id: 'a', title: 'Visa', done: true },
			{ id: 'b', title: 'eSIM', status: 'doing', order: 2, suggested: true },
		]);
		expect(a).toMatchObject({ status: 'done', done: true, order: 0, note: '' });
		expect(b).toMatchObject({ status: 'doing', done: false, order: 2, suggested: true });
	});
});

describe('head and clocks', () => {
	const input = { legs: LEGS, places: [], tasks: [], days: [] as TripDay[], visited: [] };

	it('before the trip: days to departure, the span, São Paulo and China clocks', () => {
		const m = modelFor(input, { today: '2026-11-15', now: '2026-11-15T09:00', offset: null });
		expect(head(m, true, COUNTRIES)).toEqual({
			eyebrow: 'Sun 15 Nov 2026',
			title: '19 days to departure',
			titleStay: '',
			lede: 'The trip runs Fri 4 Dec → Fri 15 Jan, 43 days.',
		});
		const cs = clocks(m, at('2026-11-15T12:00:00Z'), COUNTRIES);
		expect(cs.map((c) => [c.name, c.weekday, c.time, c.offset])).toEqual([
			['São Paulo', 'Sun', '09:00', -3],
			['China', 'Sun', '20:00', 8],
		]);
	});

	it('the departure day is day 1 (the old "You leave today" title could never show)', () => {
		const m = modelFor(input, { today: '2026-12-04', now: '2026-12-04T09:00', offset: -3 });
		expect(head(m, true, COUNTRIES).title).toBe('Day 1 of 43');
		const eve = modelFor(input, { today: '2026-12-03', now: '2026-12-03T09:00', offset: null });
		expect(head(eve, true, COUNTRIES).title).toBe('1 day to departure');
	});

	it('during a stay: day number, the stay, nights left and the next stop', () => {
		const m = modelFor(input, { today: '2026-12-21', now: '2026-12-21T09:00', offset: 8 });
		expect(head(m, false, COUNTRIES)).toEqual({
			eyebrow: 'Mon 21 Dec 2026 · not today',
			title: 'Day 18 of 43',
			titleStay: 'Harbin hostel',
			lede: 'China. 3 more nights here, until Thu 24 Dec. Next: Kansai base.',
		});
		expect(clocks(m, 0, COUNTRIES).map((c) => c.country)).toEqual(['china', 'brazil']);
	});

	it('the checkout day, a one-day stay, between stays and after', () => {
		const out = modelFor(input, { today: '2026-12-24', now: '2026-12-24T09:00', offset: 8 });
		expect(head(out, true, COUNTRIES).lede).toBe('China. You leave today. Next: Kansai base.');
		const legs: TripLeg[] = [
			...LEGS,
			{ id: 'one', type: 'stay', country: 'china', title: 'Layover', start: '2026-12-15' },
		];
		const one = modelFor(
			{ ...input, legs },
			{ today: '2026-12-15', now: '2026-12-15T09:00', offset: 8 },
		);
		expect(head(one, true, COUNTRIES).lede).toBe('China. Just for today. Next: Harbin hostel.');
		const gap = modelFor(input, { today: '2026-12-12', now: '2026-12-12T09:00', offset: 8 });
		expect(head(gap, true, COUNTRIES).lede).toBe('Between stays today.');
		expect(clocks(gap, 0, COUNTRIES).map((c) => c.country)).toEqual(['brazil']);
		const after = modelFor(input, { today: '2027-02-01', now: '2027-02-01T09:00', offset: null });
		expect(head(after, true, COUNTRIES).title).toBe('Back home');
		const none = modelFor({ ...input, legs: [] }, { today: '2027-02-01', now: '', offset: null });
		expect(head(none, true, COUNTRIES).title).toBe('No trip dates yet');
	});
});

describe('countdown', () => {
	const fl: TripLeg = {
		id: 'pvg-nrt',
		type: 'flight',
		from: 'PVG',
		to: 'NRT',
		start: '2027-01-10T10:00',
		end: '2027-01-10T14:00',
	}; // the same leg as in LEGS: Jan 10 10:00 UTC+8
	const clock = (today: string, now = `${today}T09:00`) => ({ today, now, offset: 8 });

	it('days, tomorrow, hours and minutes, then today', () => {
		expect(countdown(fl, LEGS, clock('2026-12-21'), false, 0)).toBe('in 20 days');
		expect(countdown(fl, LEGS, clock('2027-01-09'), false, 0)).toBe('tomorrow');
		// 10:00 UTC+8 is 02:00 UTC; at 23:55 UTC the day before it is 2 h 05 min away.
		expect(countdown(fl, LEGS, clock('2027-01-10'), false, at('2027-01-09T23:55:00Z'))).toBe(
			'in 2 h 05 min',
		);
		expect(countdown(fl, LEGS, clock('2027-01-10'), false, at('2027-01-10T03:00:00Z'))).toBe(
			'today',
		);
	});

	it('a picked day says today, not hours', () => {
		expect(countdown(fl, LEGS, clock('2027-01-10'), true, at('2027-01-09T23:55:00Z'))).toBe(
			'today',
		);
	});

	it('without a known offset it compares wall clocks', () => {
		const loose: TripLeg = { id: 'x', type: 'flight', from: '???', start: '2027-01-10T10:30' };
		expect(countdown(loose, [loose], clock('2027-01-10', '2027-01-10T09:00'), false, 0)).toBe(
			'in 1 h 30 min',
		);
	});
});

describe('the place lists', () => {
	const harbinDay = { today: '2026-12-21', now: '2026-12-21T09:00', offset: 8 };

	it('only today, ending soon, upcoming and the Musts still to do', () => {
		const places = [
			place('ice-only', { days: [{ from: '2026-12-21', to: '2026-12-21' }] }),
			place('fair-ending', { days: [{ from: '2026-12-18', to: '2026-12-23' }] }),
			place('later', { days: [{ from: '2026-12-23', to: '2026-12-23' }] }),
			place('must-a', { verdict: 'must', rating: 1500 }),
			place('must-b', { verdict: 'must', rating: 1600 }),
			place('must-been', { verdict: 'must' }),
			place('kyoto-fest', {
				country: 'japan',
				city: 'kyoto',
				cityName: 'Kyoto',
				days: [{ from: '2027-01-12', to: '2027-01-13' }],
			}),
		];
		const m = modelFor(
			{ legs: LEGS, places, tasks: [], days: [], visited: [{ id: 'must-been' }] },
			harbinDay,
		);
		expect(m.onlyToday.map((h) => [h.place.id, kindLabel(h), elsewhere(h)])).toEqual([
			['ice-only', 'Only today', ''],
		]);
		expect(m.endingSoon.map((h) => [h.place.id, kindLabel(h)])).toEqual([
			['fair-ending', 'Until 23 Dec · 2 more days'],
		]);
		expect(m.musts.map((p) => p.id)).toEqual(['must-b', 'must-a']);
		expect(
			m.upcoming.map((u) => {
				const w = upcomingWhen(u, m.today);
				return `${u.place.id}: ${w.date}${w.rest}`;
			}),
		).toEqual([
			'later: Wed 23 Dec · in 2 days',
			'kyoto-fest: Tue 12 Jan – 13 Jan · in 22 days · stop not fixed',
		]);
	});

	it('a day trip and a last day are labelled', () => {
		const h = {
			place: place('x', { cityName: 'Osaka' }),
			kind: 'last' as const,
			from: '2027-01-10',
			to: '2027-01-12',
			left: 0,
			reach: 'near' as const,
			season: false,
		};
		expect(kindLabel(h)).toBe('Last day');
		expect(elsewhere(h)).toBe(' · in Osaka, a day trip');
		expect(elsewhere({ ...h, reach: 'far' })).toBe(' · in Osaka');
	});
});
