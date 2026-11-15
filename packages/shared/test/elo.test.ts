// Ported from game/test/game.test.js (Elo and pairing).
import { describe, expect, test } from 'vitest';
import { computeRatings, confidence, expected, SEED, update } from '../src/elo.ts';
import { pairKey, pickPair, type PoolItem } from '../src/pairing.ts';

const seq = (vals: number[]): (() => number) => {
	let i = 0;
	return () => vals[i++ % vals.length] ?? 0;
};
const ids = (pair: readonly PoolItem[] | null): Set<string> => new Set(pair?.map((x) => x.id));
const rating = (r: Map<string, { rating: number }>, id: string): number => r.get(id)?.rating ?? NaN;

describe('elo', () => {
	test('expected score is symmetric and update is zero-sum', () => {
		expect(expected(1500, 1500)).toBe(0.5);
		expect(Math.abs(expected(1600, 1400) + expected(1400, 1600) - 1)).toBeLessThan(1e-12);
		const u = update(1500, 1500);
		expect(u.delta).toBe(16);
		expect(u.winner + u.loser).toBe(3000);
		expect(update(1400, 1600).delta).toBeGreaterThan(update(1600, 1400).delta);
	});

	test('computeRatings seeds by verdict and replays duels in order', () => {
		const r = computeRatings({ a: 'must', b: 'maybe', c: 'skip' }, [
			{ winner: 'b', loser: 'a' },
			{ winner: 'b', loser: 'a' },
		]);
		expect(rating(r, 'c')).toBe(SEED.skip);
		expect(r.get('a')?.games).toBe(2);
		expect(r.get('b')?.wins).toBe(2);
		expect(rating(r, 'b')).toBeGreaterThan(SEED.maybe);
		expect(rating(r, 'a')).toBeLessThan(SEED.must);
		expect(rating(r, 'a') + rating(r, 'b')).toBe(SEED.must + SEED.maybe);
		// unknown ids in duels get START; self-duels are ignored
		const r2 = computeRatings({}, [
			{ winner: 'x', loser: 'x' },
			{ winner: 'x', loser: 'y' },
		]);
		expect(rating(r2, 'x')).toBe(1516);
	});

	test('confidence is mean of min(games,4)/4', () => {
		const r = computeRatings({}, [
			{ winner: 'a', loser: 'b' },
			{ winner: 'a', loser: 'b' },
		]);
		expect(confidence(['a', 'b'], r)).toBe(0.5);
		expect(confidence(['a', 'z'], r)).toBe(0.25);
		expect(confidence([], r)).toBe(0);
	});
});

describe('pairing', () => {
	test('null with fewer than 2, never pairs an item with itself', () => {
		expect(pickPair([{ id: 'a', country: 'china' }], new Map())).toBeNull();
		const p = pickPair(
			[
				{ id: 'a', country: 'china' },
				{ id: 'b', country: 'korea' },
			],
			new Map(),
			[],
			{ rng: seq([0.99, 0.1]) },
		);
		expect(ids(p)).toEqual(new Set(['a', 'b']));
	});

	test('prefers same country, close ratings and uncertain items', () => {
		const pool = [
			{ id: 'c1', country: 'china' },
			{ id: 'c2', country: 'china' },
			{ id: 'c3', country: 'china' },
			{ id: 'k1', country: 'korea' },
		];
		const ratings = new Map([
			['c1', { rating: 1500, games: 0 }],
			['c2', { rating: 1505, games: 0 }],
			['c3', { rating: 1800, games: 0 }],
			['k1', { rating: 1502, games: 0 }],
		]);
		// rng 0 → same-country mode, no jitter
		expect(ids(pickPair(pool, ratings, [], { rng: () => 0 }))).toEqual(new Set(['c1', 'c2']));
		// uncertainty: a settled close pair loses to an unsettled one
		const r2 = new Map([
			['c1', { rating: 1500, games: 20 }],
			['c2', { rating: 1500, games: 20 }],
			['c3', { rating: 1560, games: 0 }],
		]);
		expect(ids(pickPair(pool.slice(0, 3), r2, [], { rng: () => 0 })).has('c3')).toBe(true);
	});

	test('avoids repeats and the items from the last duel', () => {
		const pool = ['a', 'b', 'c', 'd'].map((id) => ({ id, country: 'china' }));
		const ratings = new Map(pool.map((p) => [p.id, { rating: 1500, games: 1 }]));
		const p = pickPair(pool, ratings, [{ winner: 'a', loser: 'b' }], { rng: () => 0 });
		expect(ids(p)).toEqual(new Set(['c', 'd']));
		expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
	});

	test('country filter restricts the pool', () => {
		const pool = [
			{ id: 'c1', country: 'china' },
			{ id: 'k1', country: 'korea' },
			{ id: 'k2', country: 'korea' },
		];
		const p = pickPair(pool, new Map(), [], { country: 'korea', rng: Math.random });
		expect(p?.every((x) => x.country === 'korea')).toBe(true);
		expect(pickPair(pool, new Map(), [], { country: 'china' })).toBeNull();
	});
});
