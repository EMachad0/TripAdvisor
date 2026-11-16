// Elo ratings for the duels (port of game/lib/elo.js).
// Seeds: a Must starts a little above a Maybe, so an unduelled Must ranks above an unduelled Maybe.
// K = 32 like the curator's taste summary (platform/lib/feedback).
import { lookup } from './util.ts';

export const START = 1500;
export const K = 32;
export const SEED = { must: 1550, maybe: 1450, skip: 1400 } as const;

export interface Rating {
	rating: number;
	games: number;
	wins: number;
}

/** A duel result as the history keeps it; malformed entries (missing or equal ids) are skipped. */
export interface DuelResult {
	readonly winner?: string | null | undefined;
	readonly loser?: string | null | undefined;
}

const isId = (s: string | null | undefined): s is string => typeof s === 'string' && s !== '';

export const expected = (ra: number, rb: number): number => 1 / (1 + 10 ** ((rb - ra) / 400));

/** New ratings after `winner` beats `loser`. */
export function update(
	rw: number,
	rl: number,
	k: number = K,
): { winner: number; loser: number; delta: number } {
	const delta = k * (1 - expected(rw, rl));
	return { winner: rw + delta, loser: rl - delta, delta };
}

/**
 * Ratings from verdicts (`{ id: 'must' | 'maybe' | 'skip' }`) and duel history (oldest first).
 * Returns Map id → { rating, games, wins }.
 */
export function computeRatings(
	verdicts: Readonly<Record<string, string | null | undefined>> = {},
	duels: readonly (DuelResult | null | undefined)[] = [],
	k: number = K,
): Map<string, Rating> {
	const r = new Map<string, Rating>();
	const get = (id: string): Rating => {
		let x = r.get(id);
		if (x === undefined) {
			x = { rating: lookup(SEED, verdicts[id]) ?? START, games: 0, wins: 0 };
			r.set(id, x);
		}
		return x;
	};
	for (const id of Object.keys(verdicts)) get(id);
	for (const d of duels) {
		const winner = d?.winner,
			loser = d?.loser;
		if (!isId(winner) || !isId(loser) || winner === loser) continue;
		const w = get(winner),
			l = get(loser);
		const u = update(w.rating, l.rating, k);
		w.rating = u.winner;
		l.rating = u.loser;
		w.games++;
		l.games++;
		w.wins++;
	}
	return r;
}

/** A rating rounded to 0.1, as game/server.js stamps `elo` on a duel line. */
export const roundRating = (rating: number): number => Math.round(rating * 10) / 10;

/** How settled a pool's ranking is, 0..1: mean of min(games, full) / full. */
export function confidence(
	ids: readonly string[],
	ratings: ReadonlyMap<string, Pick<Rating, 'games'>>,
	full = 4,
): number {
	if (ids.length === 0) return 0;
	const sum = ids.reduce((s, id) => s + Math.min(ratings.get(id)?.games ?? 0, full) / full, 0);
	return sum / ids.length;
}
