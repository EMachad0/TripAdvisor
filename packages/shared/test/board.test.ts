// Ported from game/test/game.test.js (board maths and Lunar New Year).
import { describe, expect, test } from 'vitest';
import {
	addDays,
	balance,
	bookAhead,
	budget,
	buildBoard,
	countryOn,
	cutoff,
	daysFor,
	holidayDate,
	holidayDay,
	holidayOptions,
	holidayRange,
	HOLIDAYS,
	LUNAR_NEW_YEAR,
	picksMany,
	rankCountry,
	type BoardCountry,
	type BoardPlace,
} from '../src/board.ts';

const COUNTRIES: BoardCountry[] = [
	{
		id: 'china',
		name: 'China',
		days: 3,
		budget_brl_per_day: 100,
		from: '2026-12-06',
		to: '2027-01-02',
	},
	{
		id: 'korea',
		name: 'Korea',
		days: 2,
		budget_brl_per_day: 50,
		from: '2027-01-02',
		to: '2027-01-10',
	},
];
const P = (id: string, o: Partial<BoardPlace> = {}): BoardPlace => ({
	id,
	name: id,
	country: 'china',
	city: 'x',
	category: 'culture',
	verdict: 'must',
	rating: 1500,
	brl: 10,
	budgeted: true,
	booking: { level: 'none' },
	tags: [],
	...o,
});
const idsOf = (xs: readonly { id: string }[]): string[] => xs.map((p) => p.id);

describe('board', () => {
	test('rank = locked first, then rating, Must before Maybe on ties; skip excluded', () => {
		const places = [
			P('a', { rating: 1500, verdict: 'maybe' }),
			P('b', { rating: 1500 }),
			P('c', { rating: 1600 }),
			P('d', { verdict: 'skip', rating: 1900 }),
			P('e', { verdict: null, rating: 1400 }),
		];
		expect(idsOf(rankCountry(places, 'china'))).toEqual(['c', 'b', 'a']);
		expect(idsOf(rankCountry(places, 'china', { nye: 'e' }))).toEqual(['e', 'c', 'b', 'a']);
	});

	test('cutoff at days, open days when the list is short', () => {
		const r = ['a', 'b', 'c', 'd'].map((id) => P(id));
		expect(idsOf(cutoff(r, 3).above)).toEqual(['a', 'b', 'c']);
		expect(idsOf(cutoff(r, 3).below)).toEqual(['d']);
		expect(cutoff(r, 6).open).toBe(2);
		expect(cutoff(r, 0).above).toHaveLength(0);
		expect(daysFor({ id: 'china', days: 27 }, { china: 20 })).toBe(20);
		expect(daysFor({ id: 'china', days: 27 }, {})).toBe(27);
		expect(daysFor({ id: 'china', days: 27 }, { china: 0 })).toBe(0);
	});

	test('balance flags a dominant category and missing interests', () => {
		const picks = [
			P('a', { category: 'food' }),
			P('b', { category: 'food' }),
			P('c', { category: 'food' }),
			P('d', { category: 'views' }),
			P('e', { category: 'culture' }),
		];
		const b = balance(picks, {
			interests: ['food', 'nature', 'views'],
			dominantShare: 0.4,
			labels: { food: 'Food', nature: 'Nature' },
		});
		expect(b.dominant).toEqual({ category: 'food', share: 0.6 });
		expect(b.missing).toEqual(['nature']);
		expect(b.nudges[0]?.text.startsWith('Heavy on Food')).toBe(true);
		// too few picks: no nudges
		const small = balance(picks.slice(0, 3), { interests: ['nature'] });
		expect(small.dominant).toBeNull();
		expect(small.missing).toEqual([]);
		// exactly at the threshold is not dominant
		const even = [
			P('a', { category: 'food' }),
			P('b', { category: 'food' }),
			P('c', { category: 'views' }),
			P('d', { category: 'nature' }),
			P('e', { category: 'shows' }),
		];
		expect(balance(even, { dominantShare: 0.4 }).dominant).toBeNull();
	});

	test('budget only counts budgeted places, status thresholds', () => {
		const b = budget([P('a', { brl: 100 }), P('b', { brl: 50, budgeted: false })], 2, 100);
		expect([b.spend, b.cap, b.share, b.status, b.excluded]).toEqual([100, 200, 0.5, 'ok', 1]);
		expect(budget([P('a', { brl: 150 })], 2, 100).status).toBe('tight');
		expect(budget([P('a', { brl: 201 })], 2, 100).status).toBe('over');
		expect(budget([P('a', { brl: 5 })], 0, 100).status).toBe('over');
		expect(budget([], 0, 100).status).toBe('ok');
	});

	test('holiday dates and countries from the trip window', () => {
		expect(holidayDate('christmas', COUNTRIES)).toBe('2026-12-25');
		expect(holidayDate('nye', COUNTRIES)).toBe('2026-12-31');
		expect(countryOn('2026-12-25', COUNTRIES)).toBe('china');
		expect(countryOn('2027-01-02', COUNTRIES)).toBe('korea');
		expect(addDays('2026-12-06', -7)).toBe('2026-11-29');
		expect(
			holidayDate('christmas', [{ id: 'k', from: '2027-01-02', to: '2027-01-10' }]),
		).toBeNull();
	});

	test('book-ahead sorted by deadline; locked holiday picks use the holiday date', () => {
		const picks = [
			P('k', { country: 'korea', booking: { level: 'required', lead_days: 7 } }),
			P('c', { booking: { level: 'recommended', lead_days: 1 } }),
			P('h', { booking: { level: 'required', lead_days: 3 } }),
			P('n', { booking: { level: 'none' } }),
		];
		const list = bookAhead(picks, COUNTRIES, { nye: 'h' });
		expect(idsOf(list)).toEqual(['c', 'k', 'h']);
		expect(list.map((x) => x.deadline)).toEqual(['2026-12-05', '2026-12-26', '2026-12-28']);
		expect(list[2]?.holiday).toBe('nye');
	});

	test('buildBoard moves the cutoff with days overrides', () => {
		const places = [
			P('a', { rating: 1600 }),
			P('b', { rating: 1550 }),
			P('c', { rating: 1500 }),
			P('d', { rating: 1450 }),
			P('k', { country: 'korea' }),
		];
		const b1 = buildBoard({ places, countries: COUNTRIES });
		expect(b1.countries[0]?.above).toHaveLength(3);
		expect(b1.totalDays).toBe(5);
		const b2 = buildBoard({ places, countries: COUNTRIES, days: { china: 1, korea: 4 } });
		expect(idsOf(b2.countries[0]?.above ?? [])).toEqual(['a']);
		expect(b2.countries[0]?.changed).toBe(true);
		expect(b2.countries[1]?.open).toBe(3);
		expect(b2.totalDays).toBe(5);
		expect(b2.picks).toHaveLength(2);
		expect(
			idsOf(holidayOptions([P('x', { tags: ['nye'] }), P('y', { tags: ['christmas'] })], 'nye')),
		).toEqual(['x']);
	});
});

// Lunar New Year: a holiday over several days whose options don't compete.
const HK: BoardCountry[] = [
	{ id: 'japan', from: '2027-01-20', to: '2027-02-04' },
	{ id: 'hong-kong', name: 'Hong Kong', days: 5, from: '2027-02-04', to: '2027-02-09' },
];
const LNY = (id: string, from: string, to = from, o: Partial<BoardPlace> = {}): BoardPlace =>
	P(id, {
		country: 'hong-kong',
		tags: ['lunar-new-year', 'lunar-new-year-option'],
		holidays: ['lny'],
		days: [{ from, to }],
		...o,
	});

describe('lunar new year', () => {
	test('the date comes from one table and the holiday covers the eve to day 3', () => {
		expect(LUNAR_NEW_YEAR[2027]).toBe('2027-02-06');
		expect(HOLIDAYS.lny.dates).toEqual(Object.values(LUNAR_NEW_YEAR));
		expect(HOLIDAYS.lny.md).toBeUndefined();
		expect(holidayDate('lny', HK)).toBe('2027-02-06');
		expect(holidayRange('lny', HK)).toEqual({ from: '2027-02-05', to: '2027-02-08' });
		expect(countryOn('2027-02-06', HK)).toBe('hong-kong');
		expect(holidayDate('lny', COUNTRIES)).toBeNull();
		expect(holidayRange('lny', COUNTRIES)).toBeNull();
		expect(holidayRange('nye', COUNTRIES)).toEqual({ from: '2026-12-31', to: '2026-12-31' });
		expect([picksMany('lny'), picksMany('christmas'), picksMany('nye')]).toEqual([
			true,
			false,
			false,
		]);
	});

	test('every option keeps its own day; none is dropped for not being on Feb 6', () => {
		const range = holidayRange('lny', HK);
		const fair = LNY('fair', '2027-01-31', '2027-02-06'),
			parade = LNY('parade', '2027-02-06'),
			fireworks = LNY('fireworks', '2027-02-07'),
			races = LNY('races', '2027-02-08');
		expect(holidayDay(fair, range)).toBe('2027-02-05');
		expect(holidayDay(parade, range)).toBe('2027-02-06');
		expect(holidayDay(fireworks, range)).toBe('2027-02-07');
		expect(holidayDay(races, range)).toBe('2027-02-08');
		expect(holidayDay(P('undated'), range)).toBeNull();
		expect(holidayDay(LNY('late', '2027-02-20'), range)).toBeNull();
		const mall = P('mall', { country: 'hong-kong', tags: ['lunar-new-year', 'mall'] });
		const undated = P('undated', { country: 'hong-kong', tags: ['lunar-new-year-option'] });
		const opts = holidayOptions([races, mall, undated, fireworks, parade, fair], 'lny', HK);
		expect(idsOf(opts)).toEqual(['fair', 'parade', 'fireworks', 'races', 'undated']);
		expect(holidayOptions([races, mall, fair], 'lny')).toHaveLength(2);
	});

	test("book-ahead counts back from the option's own day, with no lock", () => {
		const parade = LNY('parade', '2027-02-06', '2027-02-06', {
			booking: { level: 'recommended', lead_days: 14 },
		});
		const races = LNY('races', '2027-02-08', '2027-02-08', {
			booking: { level: 'required', lead_days: 2 },
		});
		const peak = P('peak', {
			country: 'hong-kong',
			booking: { level: 'recommended', lead_days: 1 },
		});
		const list = bookAhead([races, parade, peak], HK, {});
		expect(list.map((x) => [x.id, x.visit, x.deadline, x.holiday])).toEqual([
			['parade', '2027-02-06', '2027-01-23', 'lny'],
			['peak', '2027-02-04', '2027-02-03', null],
			['races', '2027-02-08', '2027-02-06', 'lny'],
		]);
	});
});
