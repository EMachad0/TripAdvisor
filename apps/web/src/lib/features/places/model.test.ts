import type { Leg } from '@atr/shared/trip';
import { describe, expect, it } from 'vitest';
import type { Answer, ContentPlace } from '#lib/content/types.js';
import {
	answerDate,
	answerFilters,
	answerIdFromHash,
	citiesFromArg,
	cityIndex,
	cityValue,
	filterAnswers,
	findPlaces,
	groupByCity,
	hostOf,
	mapUrl,
	moreLabel,
	noMatchHint,
	placeHits,
	safeUrl,
	startCities,
	tzMarkup,
	usedCategories,
} from './model.ts';

function place(id: string, over: Partial<ContentPlace> = {}): ContentPlace {
	return {
		id,
		name: id,
		short: null,
		name_local: null,
		country: 'china',
		city: 'shanghai',
		cityName: 'Shanghai',
		category: 'food',
		tags: [],
		loc: null,
		brl: 0,
		costLabel: '',
		budgeted: false,
		booking: { level: 'none', badge: null, links: [] },
		drone: false,
		holidays: [],
		days: [],
		whenLabel: null,
		isNew: false,
		thumb: null,
		facts: {} as ContentPlace['facts'],
		tz: 8,
		card: {} as ContentPlace['card'],
		...over,
	};
}

function answer(id: string, over: Partial<Answer> = {}): Answer {
	return {
		id,
		question: `Q ${id}?`,
		asked: '2026-11-20',
		updated: null,
		tldr: 'tldr',
		about: { kind: 'trip', id: 'trip', name: 'the whole trip' },
		country: null,
		sources: [],
		tldrHtml: 'tldr',
		bodyHtml: '',
		tz: null,
		...over,
	};
}

const stay = (id: string, country: string, city: string, start: string): Leg => ({
	id,
	type: 'stay',
	country,
	city,
	start,
	end: start,
});

const PLACES = [
	place('bund', { name: 'The Bund', category: 'views' }),
	place('dumplings', { name: 'Nanxiang dumplings', category: 'food' }),
	place('ice', { name: 'Ice World', city: 'harbin', cityName: 'Harbin', category: 'odd' }),
	place('sky', {
		name: 'Shibuya Sky',
		country: 'japan',
		city: 'tokyo',
		cityName: 'Tokyo',
		category: 'views',
	}),
	place('stairs', { name: 'Suga stairs', country: 'japan', city: 'tokyo', cityName: 'Tokyo' }),
	place('peak', { name: 'Peak tram', country: 'korea', city: 'seoul', cityName: 'Seoul' }),
];
const COUNTRIES = ['china', 'korea', 'japan'];

describe('cityIndex', () => {
	it('lists route cities in stay order first, then the rest by country order and card count', () => {
		const legs = [
			stay('b', 'china', 'harbin', '2026-12-20'),
			stay('a', 'china', 'shanghai', '2026-12-06'),
			stay('br', 'brazil', 'sao-paulo', '2026-12-01'),
			stay('x', 'china', 'nowhere', '2026-12-25'),
		];
		const out = cityIndex(PLACES, legs, COUNTRIES);
		expect(out.map((c) => [c.id, c.route, c.n])).toEqual([
			['shanghai', true, 2],
			['harbin', true, 1],
			['seoul', false, 1],
			['tokyo', false, 2],
		]);
		expect(out[0]?.name).toBe('Shanghai');
	});

	it('orders cities off the route by card count inside a country', () => {
		const out = cityIndex(
			[...PLACES, place('osaka1', { country: 'japan', city: 'osaka', cityName: 'Osaka' })],
			[],
			COUNTRIES,
		);
		expect(out.filter((c) => c.country === 'japan').map((c) => c.id)).toEqual(['tokyo', 'osaka']);
	});
});

describe('city filter helpers', () => {
	const cities = cityIndex(PLACES, [], COUNTRIES);
	it('reads /places/<a+b>, dropping unknown cities', () => {
		expect(citiesFromArg('shanghai+tokyo', cities)).toEqual(['shanghai', 'tokyo']);
		expect(citiesFromArg('shanghai%2Bnope', cities)).toEqual(['shanghai']);
		expect(citiesFromArg('nope', cities)).toBeNull();
		expect(citiesFromArg('%E0%A4%A', cities)).toBeNull();
	});
	it('joins the select value', () => {
		expect(cityValue(null)).toBe('');
		expect(cityValue(['a', 'b'])).toBe('a+b');
	});
	it('starts in the cities of the stay you are in that have cards', () => {
		expect(startCities(stay('a', 'china', 'shanghai', '2026-12-06'), cities)).toEqual(['shanghai']);
		expect(startCities(stay('a', 'china', 'nowhere', '2026-12-06'), cities)).toBeNull();
		expect(startCities(null, cities)).toBeNull();
	});
});

describe('findPlaces and groupByCity', () => {
	const cats = { food: { label: 'Food' }, views: { label: 'Views' }, odd: { label: 'Odd local' } };
	const hits = placeHits(
		PLACES,
		{ bund: 'must', sky: 'maybe', peak: 'skip' },
		{ dumplings: 'soup dumplings at 08:30' },
		{ stairs: { rating: 1600 }, ice: { rating: 1400 } },
	);
	const all = { q: '', city: null, cat: null, show: 'all' as const };

	it('joins verdict, note and rating', () => {
		const d = hits.find((h) => h.id === 'dumplings');
		expect(d).toMatchObject({ verdict: null, note: 'soup dumplings at 08:30', rating: null });
		expect(hits.find((h) => h.id === 'stairs')?.rating).toBe(1600);
	});

	it('sorts Must, Maybe, not called, Skip; then rating; then name', () => {
		expect(findPlaces(hits, all, [], cats).map((p) => p.id)).toEqual([
			'bund',
			'sky',
			'stairs',
			'ice',
			'dumplings',
			'peak',
		]);
	});

	it('filters by words (accents and case ignored), category label, city, kind and show', () => {
		expect(findPlaces(hits, { ...all, q: 'SHIBUYA' }, [], cats).map((p) => p.id)).toEqual(['sky']);
		expect(findPlaces(hits, { ...all, q: 'odd local' }, [], cats).map((p) => p.id)).toEqual([
			'ice',
		]);
		expect(findPlaces(hits, { ...all, q: 'tokyo views' }, [], cats).map((p) => p.id)).toEqual([
			'sky',
		]);
		expect(findPlaces(hits, { ...all, city: ['harbin'] }, [], cats).map((p) => p.id)).toEqual([
			'ice',
		]);
		expect(findPlaces(hits, { ...all, cat: 'views' }, [], cats).map((p) => p.id)).toEqual([
			'bund',
			'sky',
		]);
		expect(findPlaces(hits, { ...all, show: 'picks' }, [], cats).map((p) => p.id)).toEqual([
			'bund',
			'sky',
		]);
		const visited = [{ id: 'bund' }, { id: 'peak' }];
		expect(findPlaces(hits, { ...all, show: 'been' }, visited, cats).map((p) => p.id)).toEqual([
			'bund',
			'peak',
		]);
		// "Not been" is the picks you have not ticked yet (shared searchPlaces, as the old site)
		expect(findPlaces(hits, { ...all, show: 'todo' }, visited, cats).map((p) => p.id)).toEqual([
			'sky',
		]);
	});

	it('groups by city in City-select order with the been count', () => {
		const cities = cityIndex(PLACES, [stay('t', 'japan', 'tokyo', '2026-12-01')], COUNTRIES);
		const groups = groupByCity(findPlaces(hits, all, [], cats), cities, new Set(['sky', 'bund']));
		expect(groups.map((g) => [g.key, g.places.length, g.been])).toEqual([
			['japan/tokyo', 2, 1],
			['china/shanghai', 2, 1],
			['china/harbin', 1, 0],
			['korea/seoul', 1, 0],
		]);
		expect(groups[0]?.cityName).toBe('Tokyo');
	});

	it('lists the kinds some card uses, in config order', () => {
		const config = {
			culture: { label: 'Culture', icon: '' },
			views: { label: 'Views', icon: '' },
			food: { label: 'Food', icon: '' },
		};
		expect(usedCategories(PLACES, config)).toEqual([
			{ id: 'views', label: 'Views' },
			{ id: 'food', label: 'Food' },
		]);
	});

	it('gives the old empty-result hints', () => {
		expect(noMatchHint(all)).toBe('Try another word.');
		expect(noMatchHint({ ...all, show: 'been' })).toBe('Try “Everywhere”, any kind, or All.');
		expect(noMatchHint({ ...all, city: ['x'] })).toBe('Try “Everywhere”, any kind, or All.');
	});

	it('links Maps to the pin, else a search by name and city', () => {
		expect(mapUrl({ loc: { lat: 31.2, lng: 121.5 }, name: 'x', cityName: 'y' })).toBe(
			'https://www.google.com/maps/search/?api=1&query=31.2,121.5',
		);
		expect(mapUrl({ loc: null, name: 'The Bund', cityName: 'Shanghai' })).toBe(
			'https://www.google.com/maps/search/?api=1&query=The%20Bund%20Shanghai',
		);
	});
});

describe('answers', () => {
	const countries = [
		{ id: 'china', name: 'China', flag: '🇨🇳' },
		{ id: 'japan', name: 'Japan', flag: '🇯🇵' },
		{ id: 'korea', name: 'Korea', flag: '🇰🇷' },
	];
	const list = [
		answer('a', { country: 'japan' }),
		answer('b', { country: 'china' }),
		answer('c'),
		answer('d', { country: 'china' }),
		answer('e', { country: 'singapore' }),
	];

	it('builds the country chips: All, trip countries in order, others, Whole trip', () => {
		expect(answerFilters(list, countries)).toEqual([
			{ id: 'all', label: 'All', n: 5 },
			{ id: 'china', label: '🇨🇳 China', n: 2 },
			{ id: 'japan', label: '🇯🇵 Japan', n: 1 },
			{ id: 'singapore', label: 'singapore', n: 1 },
			{ id: 'trip', label: 'Whole trip', n: 1 },
		]);
		expect(answerFilters([], countries)).toEqual([{ id: 'all', label: 'All', n: 0 }]);
	});

	it('filters by country, trip or all', () => {
		expect(filterAnswers(list, 'china').map((a) => a.id)).toEqual(['b', 'd']);
		expect(filterAnswers(list, 'trip').map((a) => a.id)).toEqual(['c']);
		expect(filterAnswers(list, 'all')).toHaveLength(5);
	});

	it('reads #answer-<id>', () => {
		expect(answerIdFromHash('#answer-2026-11-20-x')).toBe('2026-11-20-x');
		expect(answerIdFromHash('#answer-a%20b')).toBe('a b');
		expect(answerIdFromHash('#answers')).toBeNull();
		expect(answerIdFromHash('')).toBeNull();
	});

	it('formats dates, the fold label, links and hosts as the platform', () => {
		expect(answerDate('2026-11-05')).toBe('5 Nov 2026');
		expect(answerDate('soon')).toBe('soon');
		expect(moreLabel(true, 0)).toBe('Full answer');
		expect(moreLabel(true, 1)).toBe('Full answer and source');
		expect(moreLabel(true, 3)).toBe('Full answer and sources');
		expect(moreLabel(false, 1)).toBe('Source');
		expect(moreLabel(false, 2)).toBe('Sources (2)');
		expect(safeUrl(' https://x.org/a ')).toBe('https://x.org/a');
		expect(safeUrl('javascript:alert(1)')).toBe('#');
		expect(hostOf('https://www.example.com/a')).toBe('example.com');
		expect(hostOf('nope')).toBe('');
	});

	it('writes the offset after clock times in the text, never inside a tag', () => {
		const html =
			'Opens 11:00–21:30, <a href="https://x.org/10:00">at 10:00</a> <strong>13:00</strong>';
		const out = tzMarkup(html, 8);
		expect(out).toContain('href="https://x.org/10:00"');
		// a range ("11:00–21:30") takes one label after its end, as the old tzSpots
		expect(out.match(/UTC\+8/g)).toHaveLength(3);
		expect(out).toMatch(/21:30 <span class="[^"]+">UTC\+8<\/span>/);
		expect(out).toMatch(/at 10:00 <span[^>]*>UTC\+8<\/span><\/a>/);
		expect(tzMarkup(html, null)).toBe(html);
		expect(tzMarkup('No times here.', 9)).toBe('No times here.');
	});
});
