import { describe, expect, test } from 'vitest';
import { contentKeys, keysToTrack, newCardsMessage, seedRoute, withNewFlags } from './derive';
import type { ContentPayload } from './types';

const place = (id: string) => ({ id }) as ContentPayload['places'][number];
const area = (id: string) => ({ id }) as ContentPayload['areas'][number];
const content = {
	places: [place('a'), place('b'), place('c')],
	areas: [area('x'), area('a')],
} as ContentPayload;

describe('withNewFlags', () => {
	const feedback = {
		verdicts: { place: { b: 'must' }, area: {} },
		firstSeen: {
			a: '2026-11-02T00:00:00Z',
			b: '2026-11-02T00:00:00Z',
			'area:x': '2026-10-01T00:00:00Z',
		},
		firstRun: '2026-11-01T00:00:00Z',
	};
	test('new = not swiped and first seen after the first run; unseen keys count as seen now', () => {
		const out = withNewFlags(content, feedback, '2026-11-15T00:00:00Z');
		expect(out.places.map((p) => [p.id, p.isNew])).toEqual([
			['a', true],
			['b', false],
			['c', true],
		]);
		expect(out.areas.map((a) => [a.id, a.isNew])).toEqual([
			['x', false],
			['a', true],
		]);
	});
	test('a place sharing its id with a swiped area is not new (the old swiped set mixed them)', () => {
		const out = withNewFlags(
			content,
			{ ...feedback, verdicts: { place: {}, area: { a: 'skip' } } },
			'2026-11-15T00:00:00Z',
		);
		expect(out.places[0]?.isNew).toBe(false);
		expect(out.areas[1]?.isNew).toBe(false);
	});
	test('nothing is new before the first run or while feedback loads', () => {
		const out = withNewFlags(content, { ...feedback, firstRun: null }, '2026-11-15T00:00:00Z');
		expect(out.places.some((p) => p.isNew)).toBe(false);
		expect(withNewFlags(content, undefined, 'x')).toBe(content);
	});
});

describe('first-seen keys', () => {
	test('places by id, areas as area:<id>; only the unseen ones after the first run', () => {
		expect(contentKeys(content)).toEqual(['a', 'b', 'c', 'area:x', 'area:a']);
		expect(keysToTrack(content, { firstRun: null, firstSeen: {} })).toHaveLength(5);
		expect(
			keysToTrack(content, { firstRun: 't', firstSeen: { a: 't', b: 't', 'area:x': 't' } }),
		).toEqual(['c', 'area:a']);
	});
});

describe('newCardsMessage', () => {
	test('the old toast text, singular and plural; nothing on the first load', () => {
		expect(newCardsMessage(null, ['a'])).toBeNull();
		expect(newCardsMessage(['a'], ['a'])).toBeNull();
		expect(newCardsMessage(['a'], ['a', 'b'])).toBe('✨ 1 new card from the curator');
		expect(newCardsMessage([], ['a', 'area:b'])).toBe('✨ 2 new cards from the curator');
	});
});

describe('seedRoute', () => {
	test('the config seed, before route.current is available', () => {
		const route = seedRoute({
			countries: [
				{ id: 'china', name: 'China', flag: '', from: '2026-12-06', to: '2026-12-16', cities: [] },
			],
			routeBase: {
				countries: [{ id: 'china', route: [{ area: 'shanghai', nights: 4 }] }],
				home: '',
				warnings: [],
			},
			areas: [
				{
					id: 'shanghai',
					country: 'china',
					name: 'Shanghai',
					lat: 31.2,
					lng: 121.4,
				} as ContentPayload['areas'][number],
			],
		});
		expect(route[0]).toMatchObject({ id: 'china', source: 'config', nights: 10, planned: 4 });
		expect(route[0]?.stops[0]).toMatchObject({ area: 'shanghai', name: 'Shanghai', located: true });
	});
});
