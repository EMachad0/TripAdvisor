import { describe, expect, it } from 'vitest';
import { parseHub, parseHubs } from '#lib/content/hubs.js';
import type { ContentPlace, Hub } from '#lib/content/types.js';
import type { TripLeg } from '#lib/features/trip/types.js';
import { asLeg } from '#lib/features/trip/types.js';
import { parseTile } from '#lib/server/tiles.js';
import {
	allNightsBooked,
	arrowTo,
	bookedStays,
	categoryCounts,
	chooseOnlyBooked,
	cityHubs,
	cityName,
	cityPlaces,
	cityStays,
	dateSpan,
	defaultFilter,
	distanceKm,
	fanOffsets,
	fmtKm,
	focusPoints,
	hubTags,
	hubUses,
	mapCities,
	nightsBooked,
	noBed,
	pinLabel,
	pinTone,
	placeVisible,
	routeCityLinks,
	shortHubName,
	stackPoints,
	stopCity,
	withChoices,
	type CityFilter,
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
		loc: { lat: 31.23, lng: 121.47 },
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

const hub = (id: string, over: Partial<Hub> = {}): Hub => ({
	id,
	kind: 'airport',
	code: id.toUpperCase(),
	name: id,
	name_local: null,
	country: 'china',
	city: 'shanghai',
	lat: 31.14,
	lng: 121.8,
	note: null,
	...over,
});

const stay = (id: string, over: Partial<TripLeg> = {}): TripLeg => ({
	id,
	type: 'stay',
	country: 'china',
	city: 'shanghai',
	status: 'planned',
	...over,
});

const F = (over: Partial<CityFilter> = {}): CityFilter => ({
	cats: [],
	hideSkipped: true,
	hubs: true,
	onlyBooked: false,
	...over,
});

describe('places and cities', () => {
	const places = [
		place('a'),
		place('b', { city: 'beijing', cityName: 'Beijing' }),
		place('c', { loc: null }),
		place('d', { country: 'japan', city: 'tokyo', loc: null }),
	];

	it('groups the places of one city (located or not)', () => {
		expect(cityPlaces(places, 'china', 'shanghai').map((p) => p.id)).toEqual(['a', 'c']);
		expect(cityPlaces(places, 'japan', 'shanghai')).toEqual([]);
	});

	it('gives a map to cities with a located place or a hub, not to the others', () => {
		const m = mapCities(places, [hub('kix', { country: 'japan', city: 'osaka' })]);
		expect([...m].sort()).toEqual(['china/beijing', 'china/shanghai', 'japan/osaka']);
		expect(m.has('japan/tokyo')).toBe(false);
	});

	it('finds the hubs of a city', () => {
		const hs = [hub('pvg'), hub('pek', { city: 'beijing' })];
		expect(cityHubs(hs, 'china', 'shanghai').map((h) => h.id)).toEqual(['pvg']);
	});

	it('names a city after its area, else a place, else its id', () => {
		const content = {
			areas: [{ id: 'shanghai', country: 'china', name: 'Shanghai 上海' }] as never[],
			places,
		};
		expect(cityName(content, 'china', 'shanghai')).toBe('Shanghai 上海');
		expect(cityName(content, 'china', 'beijing')).toBe('Beijing');
		expect(cityName(content, 'china', 'chiang-mai')).toBe('Chiang Mai');
	});
});

describe('stays', () => {
	const legs: TripLeg[] = [
		stay('s2', { start: '2026-12-11', end: '2026-12-13', status: 'booked' }),
		stay('s1', { start: '2026-12-06', end: '2026-12-09', status: 'booked' }),
		stay('kansai', { city: 'kyoto', cities: ['kyoto', 'osaka'], start: '2027-01-10' }),
		{ id: 'f', type: 'flight', to: 'PVG' },
	];

	it("a city's stays: by city or cities, in trip order", () => {
		expect(cityStays(legs, 'shanghai').map((l) => l.id)).toEqual(['s1', 's2']);
		expect(cityStays(legs, 'osaka').map((l) => l.id)).toEqual(['kansai']);
		expect(cityStays(legs, 'beijing')).toEqual([]);
	});

	it('all nights booked: at least one stay and every one booked', () => {
		expect(allNightsBooked(cityStays(legs, 'shanghai'))).toBe(true);
		expect(allNightsBooked(cityStays(legs, 'osaka'))).toBe(false);
		expect(allNightsBooked([])).toBe(false);
	});

	it('counts nights booked of the nights planned', () => {
		const s = [
			...cityStays(legs, 'shanghai'),
			stay('s3', { start: '2026-12-13', end: '2026-12-14' }),
		];
		expect(nightsBooked(s)).toEqual({ booked: 5, total: 6 });
	});

	it('a dated stay of no nights (an airport layover) has no bed to book', () => {
		expect(noBed(stay('sin', { status: 'onday', start: '2027-01-10', end: '2027-01-10' }))).toBe(
			true,
		);
		expect(noBed(stay('sin2', { start: '2027-01-10' }))).toBe(true);
		expect(noBed(stay('a', { start: '2026-12-06', end: '2026-12-09' }))).toBe(false);
		expect(noBed(stay('undated'))).toBe(false);
	});

	it('writes date spans without a timezone', () => {
		expect(dateSpan('2026-12-06', '2026-12-09T11:00')).toBe('6 – 9 Dec');
		expect(dateSpan('2026-12-30', '2027-01-02')).toBe('30 Dec – 2 Jan');
		expect(dateSpan('2026-12-06', undefined)).toBe('6 Dec');
		expect(dateSpan(undefined, undefined)).toBe('');
	});

	it("resolves a booked stay's pin: its card, else its lat/lng, else none", () => {
		const card = place('dayin', {
			category: 'stay',
			name: 'Dayin Hostel',
			loc: { lat: 31.2, lng: 121.5 },
		});
		const noLoc = place('nowhere', { category: 'stay', loc: null });
		const byId = new Map([card, noLoc].map((p) => [p.id, p]));
		const b = bookedStays(
			[
				stay('1', { status: 'booked', place: 'dayin', start: '2026-12-06', end: '2026-12-09' }),
				stay('2', { status: 'booked', title: 'Friend', lat: 31.3, lng: 121.6 }),
				stay('3', { status: 'booked', place: 'nowhere', title: 'Weekend' }),
				stay('4', { status: 'booked', place: 'gone', host: 'Some Hotel', lat: 1, lng: 2 }),
				stay('5', { status: 'planned', place: 'dayin' }),
			],
			byId,
		);
		expect(b.map((x) => [x.leg.id, x.placeId, x.at])).toEqual([
			['1', 'dayin', { lat: 31.2, lng: 121.5 }],
			['2', null, { lat: 31.3, lng: 121.6 }],
			['3', 'nowhere', null],
			['4', null, { lat: 1, lng: 2 }],
		]);
		expect(b[0]?.label).toBe('Dayin Hostel · 6 – 9 Dec');
		expect(b[1]?.label).toBe('Friend');
		expect(b[3]?.name).toBe('Some Hotel');
	});

	it('reads the new leg fields with their types', () => {
		const l = asLeg({
			id: 'x',
			type: 'stay',
			place: 'dayin',
			arrive: 'pvg',
			leave: 'shanghai-hongqiao',
			lat: 31.2,
			lng: 121.5,
		});
		expect(l).toMatchObject({
			place: 'dayin',
			arrive: 'pvg',
			leave: 'shanghai-hongqiao',
			lat: 31.2,
			lng: 121.5,
		});
		const bad = asLeg({ id: 'y', place: 3, lat: '31', lng: null });
		expect(bad.place).toBeUndefined();
		expect(bad.lat).toBeUndefined();
		expect(bad.lng).toBeUndefined();
	});
});

describe('getting in and out', () => {
	const pvg = hub('pvg');
	const hongqiao = hub('shanghai-hongqiao', { kind: 'station', code: null });
	const legs: TripLeg[] = [
		{
			id: 'in',
			type: 'flight',
			from: 'GRU',
			to: 'pvg',
			start: '2026-12-04T23:55',
			end: '2026-12-06T06:10',
		},
		{ id: 'out', type: 'flight', from: 'PVG', to: 'CKG', start: '2026-12-20T10:00' },
		{ id: 'train', type: 'transport', from: 'shanghai-hongqiao', start: '2026-12-13T08:00' },
		{ id: 'note', type: 'note', to: 'PVG', start: '2026-12-30' },
	];
	const stays: TripLeg[] = [
		stay('s1', { start: '2026-12-06', end: '2026-12-09', leave: 'shanghai-hongqiao' }),
		stay('s2', { start: '2026-12-11', end: '2026-12-13', arrive: 'shanghai-hongqiao' }),
	];

	it('derives arrivals and departures from flight codes, transfers and stay overrides', () => {
		const [p, h] = hubUses([pvg, hongqiao], legs, stays);
		expect(p).toMatchObject({ arrive: ['2026-12-06'], leave: ['2026-12-20'] });
		// a city visited twice: out by train on the 9th, back on the 11th, out again on the 13th
		expect(h).toMatchObject({ arrive: ['2026-12-11'], leave: ['2026-12-09', '2026-12-13'] });
	});

	it('a hub nobody uses has no dates; tags read like the site', () => {
		const [u] = hubUses([hub('sha')], legs, stays);
		expect(u).toMatchObject({ arrive: [], leave: [] });
		const [p] = hubUses([pvg], legs, stays);
		expect(p && hubTags(p)).toEqual(['Arrive Sun 6 Dec', 'Leave Sun 20 Dec']);
	});

	it('the same day twice counts once', () => {
		const [p] = hubUses(
			[pvg],
			[...legs, { id: 'dup', type: 'flight', to: 'PVG', start: '2026-12-06' }],
			[],
		);
		expect(p?.arrive).toEqual(['2026-12-06']);
	});
});

describe('pins and filters', () => {
	const booked = new Set(['bed']);
	const v = { must: 'must', skipped: 'skip', bed: 'skip', otherbed: 'maybe' } as const;

	it('Only booked stays defaults on once every night is booked', () => {
		expect(defaultFilter([]).onlyBooked).toBe(false);
		expect(defaultFilter([stay('a', { status: 'booked' })])).toEqual(F({ onlyBooked: true }));
		expect(defaultFilter([stay('a', { status: 'booked' }), stay('b')]).onlyBooked).toBe(false);
	});

	it("the traveler's choice wins over the derived default, bad values do not", () => {
		const d = defaultFilter([stay('a', { status: 'booked' })]);
		expect(withChoices(d, chooseOnlyBooked(false, d)).onlyBooked).toBe(false);
		expect(withChoices(d, { hideSkipped: 'yes' as unknown as boolean }).hideSkipped).toBe(true);
		expect(withChoices(d, undefined)).toBe(d);
	});

	it('an Only booked stays choice lapses once the default it overrode changes', () => {
		const half = defaultFilter([stay('a', { status: 'booked' }), stay('b')]);
		const all = defaultFilter([stay('a', { status: 'booked' }), stay('b', { status: 'booked' })]);
		// Turned on while one stay was still planned: holds while it is planned...
		const on = chooseOnlyBooked(true, half);
		expect(withChoices(half, on).onlyBooked).toBe(true);
		// ...and booking the last night brings the default back (here the same value).
		expect(withChoices(all, on).onlyBooked).toBe(true);
		// Turned off before: booking the last night turns it on, as the default says.
		expect(withChoices(all, chooseOnlyBooked(false, half)).onlyBooked).toBe(true);
		// Turned off after everything was booked: holds.
		expect(withChoices(all, chooseOnlyBooked(false, all)).onlyBooked).toBe(false);
		// A choice stored without its default (an older visit) gives way to the default.
		expect(withChoices(all, { onlyBooked: false }).onlyBooked).toBe(true);
	});

	it('hides skipped places (stays too) unless shown; a booked stay always shows', () => {
		const skipped = place('skipped');
		const bed = place('bed', { category: 'stay' });
		expect(placeVisible(skipped, v.skipped, booked, F())).toBe(false);
		expect(placeVisible(skipped, v.skipped, booked, F({ hideSkipped: false }))).toBe(true);
		expect(placeVisible(place('s', { category: 'stay' }), 'skip', booked, F())).toBe(false);
		expect(placeVisible(bed, v.bed, booked, F({ cats: ['food'], onlyBooked: true }))).toBe(true);
	});

	it('Only booked stays hides the other stay cards whatever their verdict', () => {
		const other = place('otherbed', { category: 'stay' });
		expect(placeVisible(other, 'must', booked, F({ onlyBooked: true }))).toBe(false);
		expect(placeVisible(other, 'must', booked, F())).toBe(true);
		expect(placeVisible(place('food'), undefined, booked, F({ onlyBooked: true }))).toBe(true);
	});

	it('category chips filter, and count what the other filters let through', () => {
		const ps = [
			place('a'),
			place('b', { category: 'views' }),
			place('skipped'),
			place('c', { category: 'culture' }),
		];
		expect(
			placeVisible(place('b', { category: 'views' }), undefined, booked, F({ cats: ['food'] })),
		).toBe(false);
		expect(
			categoryCounts(ps, v, booked, F({ cats: ['food'] }), ['culture', 'food', 'views']),
		).toEqual([
			{ id: 'culture', n: 1 },
			{ id: 'food', n: 1 },
			{ id: 'views', n: 1 },
		]);
		expect(
			categoryCounts(ps, v, booked, F({ hideSkipped: false }), []).find((c) => c.id === 'food')?.n,
		).toBe(2);
	});

	it('pin tones and accessible names tell the calls apart', () => {
		expect(pinTone('must', false)).toBe('must');
		expect(pinTone(undefined, false)).toBe('none');
		expect(pinTone('skip', true)).toBe('booked');
		expect(pinLabel('Dayin', 'Stay', undefined, true)).toBe('Dayin, Stay, Not rated, booked stay');
		expect(pinLabel('Bund', 'Views', 'skip', false)).toBe('Bund, Views, Skipped');
	});
});

describe('geometry', () => {
	it('measures straight-line km', () => {
		// The Bund to Pudong airport is about 31 km.
		const d = distanceKm({ lat: 31.24, lng: 121.49 }, { lat: 31.1443, lng: 121.8083 });
		expect(d).toBeGreaterThan(29);
		expect(d).toBeLessThan(33);
		expect(fmtKm(d)).toMatch(/^3\d km$/);
		expect(fmtKm(1.44)).toBe('1.4 km');
		expect(fmtKm(0.34)).toBe('350 m');
	});

	it('fits the city, not a far day trip', () => {
		const city = [
			{ lat: 31.23, lng: 121.47 },
			{ lat: 31.24, lng: 121.49 },
			{ lat: 31.22, lng: 121.45 },
		];
		const far = { lat: 30.2, lng: 120.15 };
		expect(focusPoints([...city, far])).toEqual(city);
		expect(focusPoints([])).toEqual([]);
	});

	it('opens on the neighbourhood of the booked stay, widening until a few pins are in', () => {
		const bed = { lat: 31.235, lng: 121.475 };
		const centre = [
			{ lat: 31.23, lng: 121.47 },
			{ lat: 31.24, lng: 121.49 },
			{ lat: 31.22, lng: 121.45 },
		];
		// Zhujiajiao (about 45 km) and Pudong (about 20 km) stay out of the first view.
		const zhujiajiao = { lat: 31.11, lng: 121.05 };
		const pudong = { lat: 31.2, lng: 121.68 };
		expect(focusPoints([...centre, zhujiajiao, pudong, bed], 7, bed)).toEqual([...centre, bed]);
		// Only one pin within 7 km: the radius grows until three are in.
		const sparse = [bed, pudong, { lat: 31.3, lng: 121.6 }, zhujiajiao];
		expect(focusPoints(sparse, 7, bed)).toEqual([bed, pudong, { lat: 31.3, lng: 121.6 }]);
	});

	it('stacks pins too close to tell apart; a booked stay keeps its spot and its neighbours stack beside it', () => {
		const p = (key: string, x: number, y: number, anchor = false) => ({ key, x, y, anchor });
		const stacks = stackPoints(
			[
				p('bed', 100, 100, true),
				p('a', 110, 105),
				p('b', 300, 300),
				p('c', 305, 300),
				p('d', 300, 310),
				p('e', 500, 100),
			],
			32,
		);
		expect(stacks).toContainEqual({ keys: ['a'], anchor: 'bed', x: 100, y: 100 });
		expect(stacks.find((s) => s.keys.includes('b'))?.keys).toEqual(['b', 'c', 'd']);
		expect(stacks).toContainEqual({ keys: ['e'], anchor: null, x: 500, y: 100 });
		expect(stacks).toHaveLength(3);
		// three pins on the very same spot (Fenghuang): one stack of three
		const same = stackPoints([p('x', 0, 0), p('y', 0, 0), p('z', 0, 0)], 32);
		expect(same).toEqual([{ keys: ['x', 'y', 'z'], anchor: null, x: 0, y: 0 }]);
		// piles whose middles drift together are folded
		const chain = stackPoints([p('a', 0, 0), p('c', 40, 0), p('b', 20, 0)], 32);
		expect(chain.map((g) => g.keys)).toEqual([['a', 'b', 'c']]);
	});

	it('fans an opened stack out with room for a 44 px tap target per pin', () => {
		const ring = fanOffsets(6, false);
		expect(ring[0]).toEqual({ dx: 0, dy: -46 });
		for (let i = 0; i < ring.length; i++) {
			const a = ring[i];
			const b = ring[(i + 1) % ring.length];
			if (a === undefined || b === undefined) continue;
			expect(Math.hypot(a.dx - b.dx, a.dy - b.dy)).toBeGreaterThanOrEqual(44);
		}
		expect(Math.hypot(fanOffsets(2, true)[0]?.dx ?? 0, fanOffsets(2, true)[0]?.dy ?? 0)).toBe(56);
	});

	it('points an arrow from the view to a hub', () => {
		const c = { lat: 31.23, lng: 121.47 };
		expect(arrowTo(c, { lat: 31.23, lng: 121.8 })).toBe('→');
		expect(arrowTo(c, { lat: 31.6, lng: 121.47 })).toBe('↑');
		expect(arrowTo(c, { lat: 31.0, lng: 121.2 })).toBe('↙');
	});
});

describe('hub short names', () => {
	const h = (name: string, kind: Hub['kind'] = 'station', code: string | null = null) => ({
		name,
		kind,
		code,
	});
	it('the code, else the name without the city and the kind', () => {
		expect(
			shortHubName(h('Shanghai Pudong International Airport', 'airport', 'PVG'), 'Shanghai'),
		).toBe('PVG');
		expect(shortHubName(h('Shanghai Hongqiao railway station'), 'Shanghai')).toBe('Hongqiao');
		expect(shortHubName(h('Huangshan North railway station'), 'Huangshan')).toBe('Huangshan North');
		expect(shortHubName(h('Shanghai railway station'), 'Shanghai')).toBe('Shanghai station');
		expect(shortHubName(h('Osaka Station (Umeda)'), 'Osaka')).toBe('Osaka station');
		expect(shortHubName(h('Shin-Osaka Station'), 'Osaka')).toBe('Shin-Osaka');
		expect(shortHubName(h('Hong Kong West Kowloon station'), 'Hong Kong')).toBe('West Kowloon');
		expect(shortHubName(h('Seoul Station'), 'Seoul')).toBe('Seoul station');
	});
});

describe('route stops to cities', () => {
	const mapped = new Set(['china/shanghai', 'china/fenghuang', 'china/zhangjiajie']);
	const areas = [
		{ id: 'shanghai', country: 'china', cities: ['shanghai'] },
		{ id: 'fenghuang-zhangjiajie', country: 'china', cities: ['huaihua', 'zhangjiajie'] },
		{ id: 'xian', country: 'china', cities: [] },
	];
	const legs: TripLeg[] = [stay('wk', { start: '2026-12-11', end: '2026-12-13' })];
	const ctx = { areas, mapped, legs };

	it("takes the area's cities that have a map", () => {
		expect(stopCity({ area: 'shanghai' }, 'china', ctx)).toBe('shanghai');
		expect(stopCity({ area: 'fenghuang-zhangjiajie' }, 'china', ctx)).toBe('zhangjiajie');
	});

	it('a second visit with no area file resolves to its real city', () => {
		const s = { area: 'shanghai-weekend', start: '2026-12-11', end: '2026-12-13' };
		expect(stopCity(s, 'china', ctx)).toBe('shanghai');
		// with no stay leg on those days, the id prefix still finds it
		expect(stopCity(s, 'china', { ...ctx, legs: [] })).toBe('shanghai');
	});

	it('no link to an empty map', () => {
		expect(stopCity({ area: 'xian' }, 'china', ctx)).toBeNull();
		expect(stopCity({ area: 'harbin' }, 'china', ctx)).toBeNull();
	});

	it('lists the route cities with a map once each, in travel order', () => {
		const stops = [
			{ country: 'china', area: 'shanghai' },
			{ country: 'china', area: 'xian' },
			{ country: 'china', area: 'shanghai-weekend', start: '2026-12-11', end: '2026-12-13' },
			{ country: 'china', area: 'fenghuang-zhangjiajie' },
		];
		expect(routeCityLinks(stops, ctx)).toEqual([
			{ country: 'china', city: 'shanghai' },
			{ country: 'china', city: 'zhangjiajie' },
		]);
	});
});

describe('hubs file', () => {
	const good = {
		id: 'PVG',
		kind: 'airport',
		code: 'pvg',
		name: 'Pudong',
		country: 'china',
		city: 'shanghai',
		lat: 31.1,
		lng: 121.8,
	};

	it('keeps well-formed hubs and normalises ids and codes', () => {
		expect(parseHub(good)).toMatchObject({ id: 'pvg', code: 'PVG', name_local: null, note: null });
	});

	it('drops bad entries instead of throwing', () => {
		const bad = [
			null,
			'pvg',
			{ ...good, kind: 'spaceport' },
			{ ...good, lat: '31.1' },
			{ ...good, lng: 500 },
			{ ...good, id: 'has space' },
			{ ...good, name: '' },
			{ ...good, city: undefined },
		];
		expect(
			parseHubs({ hubs: [...bad, good, { ...good, name: 'Dup' }] }).map((h) => h.name),
		).toEqual(['Pudong']);
	});

	it('tolerates a missing or empty file', () => {
		expect(parseHubs(null)).toEqual([]);
		expect(parseHubs(undefined)).toEqual([]);
		expect(parseHubs({})).toEqual([]);
		expect(parseHubs({ hubs: 'nope' })).toEqual([]);
		expect(parseHubs([good])).toHaveLength(1);
	});
});

describe('tile addresses', () => {
	it('serves zoom 2 to 18 inside the grid', () => {
		expect(parseTile('2', '3', '3')).toEqual({ z: 2, x: 3, y: 3 });
		expect(parseTile('18', '262143', '0')).toEqual({ z: 18, x: 262143, y: 0 });
	});

	it('anything else is a 404', () => {
		for (const [z, x, y] of [
			['1', '0', '0'],
			['19', '0', '0'],
			['2', '4', '0'],
			['2', '0', '4'],
			['2', '-1', '0'],
			['2', '1.5', '0'],
			['2', '01', '0'],
			['two', '0', '0'],
			['2', '', '0'],
			['2', '0x1', '0'],
		] as const) {
			expect(parseTile(z, x, y)).toBeNull();
		}
	});
});
