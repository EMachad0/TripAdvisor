import { describe, expect, it } from 'vitest';
import type { ContentArea, ContentPlace } from '#lib/content/types.js';
import {
	ALL_CALLS,
	areaDeck,
	arrangeDeck,
	callItems,
	deckFilters,
	filterCalls,
	groupByCountry,
	hapticMs,
	isLaterDrag,
	KEY_VERDICT,
	leanAmount,
	leanOf,
	leftByCountry,
	pickFirst,
	placeDeck,
	putOff,
	releaseVerdict,
	toggleCallsFilter,
	type VerdictMap,
} from './deck.ts';

const countries = [
	{ id: 'china', name: 'China', flag: '🇨🇳' },
	{ id: 'korea', name: 'South Korea', flag: '🇰🇷' },
	{ id: 'japan', name: 'Japan', flag: '🇯🇵' },
];

function place(id: string, country: string, city: string, extra: Partial<ContentPlace> = {}) {
	return { id, name: id, short: null, country, city, isNew: false, ...extra } as ContentPlace;
}
function area(id: string, country: string, cities: string[], extra: Partial<ContentArea> = {}) {
	return { id, name: id, country, cities, isNew: false, ...extra } as ContentArea;
}
const none: VerdictMap = { area: {}, place: {} };

describe('areaDeck', () => {
	const areas = [
		area('tokyo', 'japan', ['tokyo']),
		area('seoul', 'korea', ['seoul']),
		area('beijing', 'china', ['beijing']),
		area('harbin', 'china', ['harbin'], { isNew: true }),
	];
	it('puts new cards first, then trip order of the country, then name', () => {
		expect(areaDeck(areas, countries, none, 'all').map((a) => a.id)).toEqual([
			'harbin',
			'beijing',
			'seoul',
			'tokyo',
		]);
	});
	it('leaves out swiped cards and other countries', () => {
		const v: VerdictMap = { area: { beijing: 'must' }, place: {} };
		expect(areaDeck(areas, countries, v, 'all').map((a) => a.id)).toEqual([
			'harbin',
			'seoul',
			'tokyo',
		]);
		expect(areaDeck(areas, countries, v, 'china').map((a) => a.id)).toEqual(['harbin']);
	});
	it('sends countries missing from the trip last', () => {
		const xs = [area('a', 'mars', []), area('b', 'japan', [])];
		expect(areaDeck(xs, countries, none, 'all').map((a) => a.id)).toEqual(['b', 'a']);
	});
});

describe('placeDeck', () => {
	const areas = [
		area('shanghai', 'china', ['shanghai']),
		area('harbin', 'china', ['harbin']),
		area('seoul', 'korea', ['seoul']),
	];
	const places = [
		place('sh-1', 'china', 'shanghai'),
		place('hb-1', 'china', 'harbin'),
		place('bj-1', 'china', 'beijing'),
		place('se-1', 'korea', 'seoul'),
		place('se-new', 'korea', 'seoul', { isNew: true }),
	];
	it('funnels kept cities first and skipped cities last', () => {
		const v: VerdictMap = { area: { harbin: 'must', shanghai: 'skip' }, place: {} };
		expect(placeDeck(places, areas, countries, v, 'all').map((p) => p.id)).toEqual([
			'se-new',
			'hb-1',
			'bj-1',
			'se-1',
			'sh-1',
		]);
	});
	it('drops swiped places and filters by country', () => {
		const v: VerdictMap = { area: {}, place: { 'se-1': 'skip' } };
		expect(placeDeck(places, areas, countries, v, 'korea').map((p) => p.id)).toEqual(['se-new']);
	});
	it('orders by city then name inside a country', () => {
		expect(placeDeck(places, areas, countries, none, 'china').map((p) => p.id)).toEqual([
			'bj-1',
			'hb-1',
			'sh-1',
		]);
	});
});

describe('filters', () => {
	it('counts unswiped cards per country and lists only countries with cards left', () => {
		const xs = [place('a', 'china', 'x'), place('b', 'china', 'x'), place('c', 'japan', 'y')];
		const left = leftByCountry(xs, 'place', { area: {}, place: { c: 'must' } });
		expect(left).toEqual({ china: 2 });
		expect(deckFilters(countries, left)).toEqual([
			{ id: 'all', label: 'All', count: 2 },
			{ id: 'china', label: '🇨🇳 China', count: 2 },
		]);
	});
});

describe('the drag gesture', () => {
	it('leans after a 30 px dead zone, up beats sideways', () => {
		expect(leanOf(20, 0)).toBeNull();
		expect(leanOf(31, 0)).toBe('must');
		expect(leanOf(-31, 0)).toBe('skip');
		expect(leanOf(10, -40)).toBe('maybe');
		expect(leanOf(50, -40)).toBe('must');
		expect(leanAmount(55, 0)).toBe(0.5);
		expect(leanAmount(500, 0)).toBe(1);
	});
	it('swipes past 110 px or on a fast flick past 40 px, else springs back', () => {
		expect(releaseVerdict(111, 0, 1000)).toBe('must');
		expect(releaseVerdict(-111, 0, 1000)).toBe('skip');
		expect(releaseVerdict(109, 0, 1000)).toBeNull();
		expect(releaseVerdict(50, 0, 50)).toBe('must'); // 1 px/ms
		expect(releaseVerdict(-50, 0, 50)).toBe('skip');
		expect(releaseVerdict(39, 0, 10)).toBeNull(); // fast but too short
		expect(releaseVerdict(10, -111, 500)).toBe('maybe');
		expect(releaseVerdict(10, -100, 500)).toBeNull();
	});
	it('maps the arrow keys and the haptic lengths', () => {
		expect(KEY_VERDICT['ArrowRight']).toBe('must');
		expect(KEY_VERDICT['ArrowLeft']).toBe('skip');
		expect(KEY_VERDICT['ArrowUp']).toBe('maybe');
		expect(KEY_VERDICT['ArrowDown']).toBeUndefined();
		expect([hapticMs('skip'), hapticMs('maybe'), hapticMs('must')]).toEqual([8, 14, 14]);
	});
});

describe('My calls', () => {
	const content = {
		countries,
		areas: [area('harbin', 'china', ['harbin']), area('seoul', 'korea', ['seoul'])],
		places: [
			place('b', 'china', 'x'),
			place('a', 'china', 'x'),
			place('c', 'korea', 'y'),
			place('d', 'japan', 'z'),
		],
	};
	const v: VerdictMap = {
		area: { harbin: 'must' },
		place: { a: 'skip', b: 'must', c: 'maybe' },
	};
	const notes = { area: { seoul: 'Maybe in spring' }, place: { d: 'only a note' } };
	const all = callItems(content, v, notes);

	it('lists swiped or noted cards: areas first, then trip order, verdict, name', () => {
		expect(all.map((x) => `${x.round}:${x.id}`)).toEqual([
			'area:harbin',
			'area:seoul',
			'place:b',
			'place:a',
			'place:c',
			'place:d',
		]);
		expect(all.find((x) => x.id === 'd')).toMatchObject({
			verdict: undefined,
			note: 'only a note',
		});
	});
	it('filters by round, verdict, country and notes', () => {
		const ids = (f: typeof ALL_CALLS): string[] => filterCalls(all, f).map((x) => x.id);
		expect(ids({ ...ALL_CALLS, round: 'area' })).toEqual(['harbin', 'seoul']);
		expect(ids({ ...ALL_CALLS, verdict: 'must' })).toEqual(['harbin', 'b']);
		expect(ids({ ...ALL_CALLS, country: 'korea' })).toEqual(['seoul', 'c']);
		expect(ids({ ...ALL_CALLS, noted: true })).toEqual(['seoul', 'd']);
	});
	it('toggles verdict and country chips back to all, but not the round chips', () => {
		const f1 = toggleCallsFilter(ALL_CALLS, 'verdict', 'must');
		expect(f1.verdict).toBe('must');
		expect(toggleCallsFilter(f1, 'verdict', 'must').verdict).toBe('all');
		const f2 = toggleCallsFilter(ALL_CALLS, 'round', 'area');
		expect(toggleCallsFilter(f2, 'round', 'area').round).toBe('area');
		expect(toggleCallsFilter(ALL_CALLS, 'country', 'china').country).toBe('china');
		expect(toggleCallsFilter({ ...ALL_CALLS, country: 'china' }, 'country', 'china').country).toBe(
			'all',
		);
		expect(toggleCallsFilter(ALL_CALLS, 'noted', '').noted).toBe(true);
	});
	it('groups rows by country in order', () => {
		expect(
			groupByCountry(all.filter((x) => x.round === 'place')).map((g) => [
				g.country,
				g.items.length,
			]),
		).toEqual([
			['china', 2],
			['korea', 1],
			['japan', 1],
		]);
	});
});

describe('Later and Find', () => {
	const cards = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
	const ids = (xs: readonly { id: string }[]): string => xs.map((x) => x.id).join('');
	it('keeps the deck order when nothing was put off or picked', () => {
		expect(ids(arrangeDeck(cards, { first: null, later: [] }))).toBe('abcd');
	});
	it('sends put-off cards to the back in the order they were put off', () => {
		expect(ids(arrangeDeck(cards, { first: null, later: ['c', 'a'] }))).toBe('bdca');
	});
	it('brings the picked card to the top, and ignores ids no longer in the deck', () => {
		expect(ids(arrangeDeck(cards, { first: 'c', later: ['a', 'gone'] }))).toBe('cbda');
		expect(ids(arrangeDeck(cards, { first: 'gone', later: [] }))).toBe('abcd');
	});
	it('putOff moves a card behind the earlier put-offs and unpicks it', () => {
		expect(putOff({ first: 'a', later: ['a', 'b'] }, 'a')).toEqual({
			first: null,
			later: ['b', 'a'],
		});
		expect(putOff({ first: 'c', later: [] }, 'a')).toEqual({ first: 'c', later: ['a'] });
	});
	it('pickFirst takes a card out of the put-offs', () => {
		expect(pickFirst({ first: null, later: ['a', 'b'] }, 'a')).toEqual({
			first: 'a',
			later: ['b'],
		});
	});
	it('a drag means Later only when it goes mostly down, past the distance', () => {
		expect(isLaterDrag(0, 120)).toBe(true);
		expect(isLaterDrag(0, 100)).toBe(false);
		expect(isLaterDrag(130, 120)).toBe(false);
		expect(isLaterDrag(0, -120)).toBe(false);
		expect(isLaterDrag(10, 40, 30)).toBe(true);
	});
});
