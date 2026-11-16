// Slice F model: the Decide maths against the old client (game.js counts, viewHome, duels, board, holidays).
import { describe, expect, test, vi } from 'vitest';
import type { ContentCountry } from '#lib/content/types.js';
import type { VerdictMap } from '#lib/features/cards/model.js';
import { piecePosition } from './holidays/confetti.ts';
import {
	boardOf,
	bookingFact,
	brl,
	counts,
	decidePlaces,
	duelFilters,
	duelPool,
	effectiveFilter,
	fmtDate,
	holidayOpenCount,
	holidayPair,
	liveRanking,
	manySection,
	manyTally,
	manyWhenLine,
	mergeDays,
	nextPair,
	oneSection,
	oneWhenLine,
	pairStands,
	rankLines,
	ratingsOf,
	stepDays,
	stepLine,
	steps,
	whereOn,
	type DecidePlace,
	type Duel,
} from './model.ts';

function place(id: string, over: Partial<DecidePlace> = {}): DecidePlace {
	return {
		id,
		name: id,
		short: null,
		name_local: null,
		country: 'china',
		city: 'shanghai',
		cityName: 'Shanghai',
		category: 'culture',
		tags: [],
		loc: null,
		brl: 50,
		costLabel: '',
		budgeted: true,
		booking: { level: 'none', badge: null, links: [] },
		drone: false,
		holidays: [],
		days: [],
		whenLabel: null,
		isNew: false,
		thumb: null,
		facts: {
			cold: null,
			coldLevel: null,
			outdoor: undefined,
			crowd: null,
			winter: null,
			hours: null,
		},
		tz: 8,
		card: {
			categoryLabel: 'Culture',
			categoryIcon: '🏛️',
			stay: false,
			cover: null,
			lang: 'zh-Hans',
			costLocal: '',
			timeNeeded: null,
			flags: [],
		},
		verdict: null,
		rating: null,
		games: 0,
		note: '',
		...over,
	};
}

const COUNTRIES: ContentCountry[] = [
	{
		id: 'china',
		name: 'China',
		flag: '🇨🇳',
		days: 3,
		budget_brl_per_day: 100,
		from: '2026-12-06',
		to: '2027-01-02',
		cities: [],
	},
	{
		id: 'korea',
		name: 'Korea',
		flag: '🇰🇷',
		days: 2,
		budget_brl_per_day: 100,
		from: '2027-01-02',
		to: '2027-01-20',
		cities: [],
	},
	{
		id: 'hong-kong',
		name: 'Hong Kong',
		flag: '🇭🇰',
		days: 2,
		budget_brl_per_day: 100,
		from: '2027-01-20',
		to: '2027-02-09',
		cities: [],
	},
];

/** A seeded generator, so a pairing test sees the same numbers on every run. */
function seeded(seed: number): () => number {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
}

const verdictMap = (place: Record<string, 'must' | 'maybe' | 'skip'>): VerdictMap => ({
	area: {},
	place,
});

function joined(
	raw: DecidePlace[],
	calls: Record<string, 'must' | 'maybe' | 'skip'>,
	duels: Duel[] = [],
): DecidePlace[] {
	const v = verdictMap(calls);
	return decidePlaces(raw, v, ratingsOf(v, duels), { b: 'why not' });
}

describe('places and counts', () => {
	const raw = [
		place('a'),
		place('b'),
		place('c', { country: 'korea', isNew: true }),
		place('d', { country: 'korea' }),
		place('x', { tags: ['christmas'] }),
		place('y', { tags: ['christmas'] }),
		place('l1', { tags: ['lunar-new-year-option'], country: 'hong-kong' }),
	];

	test('decidePlaces joins calls, game ratings (seeded 1550/1450) and notes', () => {
		const ps = joined(raw, { a: 'must', b: 'maybe' });
		expect(ps.find((p) => p.id === 'a')).toMatchObject({ verdict: 'must', rating: 1550, games: 0 });
		expect(ps.find((p) => p.id === 'b')).toMatchObject({
			verdict: 'maybe',
			rating: 1450,
			note: 'why not',
		});
		expect(ps.find((p) => p.id === 'c')).toMatchObject({ verdict: null, rating: null });
	});

	test('counts: left, pool, confidence, new, holidays open and locked (old counts())', () => {
		const duels = [{ winner: 'a', loser: 'b' }];
		const v = verdictMap({ a: 'must', b: 'maybe', c: 'skip', l1: 'must' });
		const ps = decidePlaces(raw, v, ratingsOf(v, duels), {});
		const n = counts(ps, [], v, duels, { christmas: 'x', nye: 'gone' }, ratingsOf(v, duels), {
			area: {},
			place: {},
		});
		expect(n).toMatchObject({
			places: 7,
			swiped: 4,
			placesLeft: 3,
			must: 2,
			maybe: 1,
			pool: 3,
			duels: 1,
			newCount: 1,
		});
		// a and b have 1 game each, l1 none: (1/4 + 1/4 + 0) / 3
		expect(n.conf).toBeCloseTo(1 / 6);
		// christmas locked; nye has no options; lny's only option is called → nothing open
		expect(n.holidayOpen).toBe(0);
		// a lock on a place that no longer exists does not count
		expect(n.locked).toBe(1);
	});

	test('holidayOpenCount: pick-one with options and no lock; pick-many with an option not called', () => {
		const ps = joined(raw, {});
		expect(holidayOpenCount(ps, {})).toBe(2);
		expect(holidayOpenCount(ps, { christmas: 'x' })).toBe(1);
	});
});

describe('overview steps', () => {
	test('the five steps and their lines (old viewHome)', () => {
		const ps = joined([place('a'), place('b')], { a: 'must' });
		const v = verdictMap({ a: 'must' });
		const n = counts(ps, [], v, [], {}, ratingsOf(v, []), { area: {}, place: {} });
		const list = steps(n, 7);
		expect(list.map((s) => s.cta)).toEqual([
			'Coming soon',
			'Keep swiping',
			'Needs 2 picks',
			'Open board',
			'Pick',
		]);
		expect(list.map((s) => s.empty)).toEqual([true, false, true, false, false]);
		expect(list.map(stepLine)).toEqual([
			'nothing yet',
			'1 / 2 swiped',
			'0% confident · 0 duels',
			'1 / 7 days filled',
			'0 / 2 locked',
		]);
	});
});

describe('duels', () => {
	const raw = [
		place('a'),
		place('b'),
		place('c'),
		place('k1', { country: 'korea' }),
		place('k2', { country: 'korea' }),
		place('s', { country: 'korea' }),
	];
	const calls = { a: 'must', b: 'maybe', c: 'must', k1: 'must', k2: 'maybe', s: 'skip' } as const;
	const duels = [
		{ winner: 'a', loser: 'b' },
		{ winner: 'k1', loser: 'k2' },
	];

	test('pool, filters and the fallback to mix', () => {
		const pool = duelPool(joined(raw, calls, duels));
		expect(pool.map((p) => p.id)).toEqual(['a', 'b', 'c', 'k1', 'k2']);
		expect(duelFilters(pool, COUNTRIES).map((f) => f.label)).toEqual([
			'Mostly same country',
			'🇨🇳 China',
			'🇰🇷 Korea',
		]);
		expect(effectiveFilter(pool, 'korea')).toBe('korea');
		expect(effectiveFilter(pool, 'hong-kong')).toBe('mix');
	});

	test('a country filter keeps both sides in that country; pairStands follows the pool', () => {
		const pool = duelPool(joined(raw, calls, duels));
		const ratings = ratingsOf(verdictMap(calls), duels);
		const pair = nextPair(pool, ratings, duels, 'korea', seeded(3));
		expect(pair === null ? [] : [...pair].sort()).toEqual(['k1', 'k2']);
		expect(pairStands(pair, pool, 'korea')).toBe(true);
		expect(pairStands(pair, pool, 'china')).toBe(false);
		expect(pairStands(['a', 's'], pool, 'mix')).toBe(false);
		expect(pairStands(null, pool, 'mix')).toBe(false);
	});

	test('liveRanking: the country by rating, six at most', () => {
		const pool = duelPool(joined(raw, calls, duels));
		expect(liveRanking(pool, 'china').map((p) => p.id)).toEqual(['a', 'c', 'b']);
	});
});

describe('board', () => {
	const raw = [
		place('a', { brl: 100 }),
		place('b', { brl: 0 }),
		place('c', { brl: 60, budgeted: false }),
		place('k', { country: 'korea' }),
	];

	test('rankLines puts the cut line after the days and marks rows below it', () => {
		const ps = joined(raw, { a: 'must', b: 'maybe', c: 'must' });
		const board = boardOf(
			ps,
			{ countries: COUNTRIES, interests: [], dominantShare: 0.4, categories: {} },
			{ china: 2 },
			{},
		);
		const china = board.countries.find((c) => c.id === 'china');
		expect(china).toBeDefined();
		if (china === undefined) return;
		const lines = rankLines(china, {});
		expect(lines.map((l) => (l.kind === 'cut' ? 'cut' : l.key))).toEqual(['a', 'c', 'cut', 'b']);
		expect(lines.filter((l) => l.kind === 'row' && l.below).map((l) => l.key)).toEqual(['b']);
		expect(china.changed).toBe(true);
		// food (budgeted false) is left out of the budget
		expect(china.budget).toMatchObject({ spend: 100, cap: 200, excluded: 1 });
	});

	test('a short list ends with the cut line and its open days; a lock ranks first', () => {
		const ps = joined(raw, { a: 'must', b: 'maybe' });
		const board = boardOf(
			ps,
			{ countries: COUNTRIES, interests: [], dominantShare: 0.4, categories: {} },
			{},
			{ christmas: 'b' },
		);
		const china = board.countries.find((c) => c.id === 'china');
		if (china === undefined) throw new Error('no china');
		const lines = rankLines(china, { christmas: 'b' });
		expect(lines.map((l) => (l.kind === 'cut' ? `cut:${String(l.open)}` : l.key))).toEqual([
			'b',
			'a',
			'cut:1',
		]);
		expect(lines[0]).toMatchObject({ kind: 'row', holiday: 'christmas' });
		expect(board.totalDays).toBe(7);
		expect(board.configTotal).toBe(7);
	});

	test('stepDays clamps to 0..90 and stores null back at the plan; mergeDays applies pending changes', () => {
		expect(stepDays(3, 3, 1)).toEqual({ next: 4, override: 4 });
		expect(stepDays(4, 3, -1)).toEqual({ next: 3, override: null });
		expect(stepDays(0, 3, -1)).toBeNull();
		expect(stepDays(90, 3, 1)).toBeNull();
		expect(mergeDays({ china: 5, japan: 2 }, { china: null, korea: 4 })).toEqual({
			japan: 2,
			korea: 4,
		});
	});
});

describe('holidays', () => {
	const raw = [
		place('x', { tags: ['christmas'] }),
		place('y', { tags: ['christmas'], country: 'korea' }),
		place('z', { tags: ['christmas'] }),
		place('e', {
			tags: ['lunar-new-year-option'],
			country: 'hong-kong',
			days: [{ from: '2027-02-07', to: '2027-02-07' }],
		}),
		place('f', {
			tags: ['lunar-new-year-option'],
			country: 'hong-kong',
			days: [{ from: '2027-02-05', to: '2027-02-05' }],
		}),
	];

	test('pick-one: the locked option first, then by rating; date and where', () => {
		const duels = [{ winner: 'z', loser: 'x' }];
		const ps = joined(raw, { x: 'must', z: 'maybe' }, duels);
		const sec = oneSection(
			{
				id: 'christmas',
				tag: 'christmas',
				md: '12-25',
				title: 'T',
				short: 'Christmas',
				emoji: '🎄',
			},
			ps,
			COUNTRIES,
			'y',
		);
		// z beat x once, but a Must starts 100 above a Maybe: x 1529.5, z 1470.5
		expect(sec.opts.map((p) => p.id)).toEqual(['y', 'x', 'z']);
		expect(sec.date).toBe('2026-12-25');
		expect(sec.where).toBe('china');
		expect(sec.locked?.id).toBe('y');
		const name = (id: string) => ({ flag: '🏳️', name: id });
		expect(oneWhenLine(sec, name)).toBe('Fri 25 Dec · you’ll be in 🏳️ china · 3 options');
		expect(oneWhenLine({ ...sec, date: null, opts: [] }, name)).toBe('Not in the trip window');
	});

	test('pick-many: day order, apart, tally and where on each day', () => {
		const ps = joined(raw, { e: 'must' });
		const lny = {
			id: 'lny',
			tag: 'lunar-new-year-option',
			dates: ['2027-02-06'],
			before: 1,
			after: 2,
			pick: 'many',
			title: 'T',
			short: 'Lunar New Year',
			emoji: '🧧',
		} as const;
		const sec = manySection(lny, ps, COUNTRIES);
		expect(sec.opts.map((p) => p.id)).toEqual(['f', 'e']);
		expect(sec.days).toEqual(['2027-02-05', '2027-02-07']);
		expect(sec.apart).toBe(true);
		expect(manyTally(sec.opts)).toBe('1 Must · 1 not called yet');
		expect(manyWhenLine(sec, (id) => ({ flag: '🏳️', name: id }))).toBe(
			'Fri 5 Feb – Mon 8 Feb · Lunar New Year is Sat 6 Feb · you’ll be in 🏳️ hong-kong',
		);
		expect(whereOn('2027-02-05', 'korea', COUNTRIES)).toBe('hong-kong');
		expect(whereOn(null, 'korea', COUNTRIES)).toBe('korea');
	});

	test('the mini duel pairs two options with no same-country bias', () => {
		const ps = joined(raw, {});
		const pair = holidayPair(ps, 'christmas', ratingsOf(verdictMap({}), []), [], seeded(7));
		expect(pair).not.toBeNull();
		expect(pair?.every((id) => ['x', 'y', 'z'].includes(id))).toBe(true);
		expect(holidayPair(ps, 'nye', ratingsOf(verdictMap({}), []), [])).toBeNull();
	});
});

describe('formatting', () => {
	test('a weekday date has no comma, even where the ICU data adds one (Linux WebKit)', () => {
		const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockReturnValue([
			{ type: 'weekday', value: 'Fri' },
			{ type: 'literal', value: ', ' },
			{ type: 'day', value: '25' },
			{ type: 'literal', value: ' ' },
			{ type: 'month', value: 'Dec' },
		]);
		try {
			expect(fmtDate('2026-12-25', { weekday: 'short', day: 'numeric', month: 'short' })).toBe(
				'Fri 25 Dec',
			);
		} finally {
			spy.mockRestore();
		}
	});

	test('brl, dates and booking facts like the old client', () => {
		expect(brl(0)).toBe('Free');
		expect(brl(1234.4)).toBe('R$ 1.234');
		expect(brl(Number.NaN)).toBe('');
		expect(fmtDate('2026-12-25')).toBe('25 Dec');
		expect(fmtDate('2026-12-25', { weekday: 'short', day: 'numeric', month: 'short' })).toBe(
			'Fri 25 Dec',
		);
		expect(bookingFact({ level: 'required', lead_days: 7, badge: null, links: [] })).toEqual({
			text: 'Must book · 7 days ahead',
			warn: true,
		});
		expect(bookingFact({ level: 'recommended', lead_days: 1, badge: null, links: [] }).text).toBe(
			'Recommended · 1 day ahead',
		);
		expect(bookingFact({ level: 'none', badge: null, links: [] }).text).toBe('No booking needed');
	});

	test('confetti pieces arc up then fall, like the old keyframes', () => {
		const p = { angle: 0, speed: 200 };
		expect(Math.abs(piecePosition(p, 0).x) + Math.abs(piecePosition(p, 0).y)).toBe(0);
		expect(piecePosition(p, 0.7)).toEqual({ x: 200, y: -80 });
		const end = piecePosition(p, 1);
		expect(end.x).toBeCloseTo(220);
		expect(end.y).toBeCloseTo(120);
	});
});
