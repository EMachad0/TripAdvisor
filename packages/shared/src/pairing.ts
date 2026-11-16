// Smart duel pairing (port of game/lib/pairing.js).
// Prefers: same country (most of the time), uncertain items (few games), close ratings,
// pairs that have not met, and items not shown in the last couple of duels.
import { START, type DuelResult } from './elo.ts';

export interface PoolItem {
	readonly id: string;
	readonly country?: string | undefined;
}

export interface PairRating {
	readonly rating: number;
	readonly games: number;
}

/** A past duel: `{ winner, loser }` or a `[a, b]` pair. */
export type PairHistory = DuelResult | readonly [string, string];

export interface PickPairOptions {
	/** Random source in [0, 1); Math.random by default. */
	readonly rng?: (() => number) | undefined;
	/** Only pair items of this country. */
	readonly country?: string | undefined;
	/** Chance of same-country mode when no country is forced (0.85). */
	readonly sameCountryBias?: number | undefined;
	/** How many past duels count as "just shown" (2). */
	readonly recent?: number | undefined;
}

/** Pair key independent of order. */
export const pairKey = (a: unknown, b: unknown): string =>
	String(a) < String(b) ? `${String(a)}|${String(b)}` : `${String(b)}|${String(a)}`;

const isPair = (h: PairHistory): h is readonly [string, string] => Array.isArray(h);
const sides = (h: PairHistory): readonly [unknown, unknown] =>
	isPair(h) ? [h[0], h[1]] : [h.winner, h.loser];

/**
 * Pick the next duel from `pool`. Returns two pool items (random left/right) or null when fewer than two qualify.
 * The random source is called in the same order as the old module, so a seeded rng gives the same pair.
 */
export function pickPair<T extends PoolItem>(
	pool: readonly (T | null | undefined)[],
	ratings: ReadonlyMap<string, PairRating>,
	history: readonly PairHistory[] = [],
	opts: PickPairOptions = {},
): [T, T] | null {
	const rng = opts.rng ?? Math.random;
	const bias = opts.sameCountryBias ?? 0.85;
	let items = pool.filter((p): p is T => p !== null && p !== undefined && p.id !== '');
	if (opts.country !== undefined && opts.country !== '')
		items = items.filter((p) => p.country === opts.country);
	if (items.length < 2) return null;

	const met = new Map<string, number>();
	const norm = history.map(sides);
	for (const [a, b] of norm) met.set(pairKey(a, b), (met.get(pairKey(a, b)) ?? 0) + 1);
	const recent = new Set(norm.slice(-(opts.recent ?? 2)).flat());

	const byCountry = new Map<string, T[]>();
	for (const p of items) {
		const key = String(p.country);
		const group = byCountry.get(key);
		if (group) group.push(p);
		else byCountry.set(key, [p]);
	}
	const multi = [...byCountry.values()].filter((g) => g.length >= 2);
	const sameOnly =
		(opts.country === undefined || opts.country === '') && multi.length > 0 && rng() < bias;

	const r = (id: string): PairRating => ratings.get(id) ?? { rating: START, games: 0 };
	const top: { cost: number; pair: [T, T] | null } = { cost: Infinity, pair: null };
	const consider = (a: T, b: T): void => {
		const ra = r(a.id),
			rb = r(b.id);
		const closeness = Math.abs(ra.rating - rb.rating) / 100;
		const uncertainty = 1 / (1 + ra.games) + 1 / (1 + rb.games);
		const repeats = met.get(pairKey(a.id, b.id)) ?? 0;
		const fresh = (recent.has(a.id) ? 1 : 0) + (recent.has(b.id) ? 1 : 0);
		const cost = closeness - 1.5 * uncertainty + 2.5 * repeats + 1.2 * fresh + rng() * 0.4;
		if (cost < top.cost) {
			top.cost = cost;
			top.pair = [a, b];
		}
	};
	const groups = sameOnly ? multi : [items];
	for (const g of groups)
		g.forEach((a, i) => {
			for (const b of g.slice(i + 1)) consider(a, b);
		});
	const { pair } = top;
	if (pair === null) return null;
	return rng() < 0.5 ? pair : [pair[1], pair[0]];
}
