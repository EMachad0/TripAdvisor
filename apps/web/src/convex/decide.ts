// Decide: duels, the days what-if and holiday locks (plan section 5, replacing POST /api/duel and
// POST /api/local). Days and locks live in the gameState singleton.
import { computeRatings, roundRating, START } from '@atr/shared/elo';
import { latestVerdicts, sortedDuels } from '@atr/shared/feedback';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { ownerMutation } from './lib/access';
import { invalid } from './lib/errors';
import { omitKeys } from './lib/logic/object';
import { eventsInFileOrder } from './lib/rows';
import { findPlace, patchGameState, readGameState, requireContentIndex } from './lib/state';
import { COUNTRY_IDS } from './tables/validators';

export const MAX_DAYS = 90;

type DuelEvent = Omit<Doc<'duels'>, '_id' | '_creationTime' | 'userId'>;

/** One duel result. `elo` holds both places' game ratings before this duel, rounded to 0.1. */
export const duel = ownerMutation({
	args: { winner: v.string(), loser: v.string() },
	handler: async (ctx, args): Promise<{ ok: true; event: DuelEvent }> => {
		const index = await requireContentIndex(ctx.db);
		const w = findPlace(index, args.winner);
		const l = findPlace(index, args.loser);
		if (w === undefined || l === undefined || w.id === l.id) {
			throw invalid('winner and loser must be two different existing places');
		}
		const [swipes, duels] = await Promise.all([
			eventsInFileOrder(ctx.db, 'swipes'),
			eventsInFileOrder(ctx.db, 'duels'),
		]);
		const ratings = computeRatings(latestVerdicts(swipes).place, sortedDuels(duels));
		const event: DuelEvent = {
			v: 1,
			ts: ctx.ts,
			session: ctx.session,
			winner: w.id,
			loser: l.id,
			...(w.country === l.country ? { country: w.country } : {}),
			elo: {
				winner: roundRating(ratings.get(w.id)?.rating ?? START),
				loser: roundRating(ratings.get(l.id)?.rating ?? START),
			},
		};
		await ctx.db.insert('duels', { ...event, userId: ctx.member.authUserId });
		return { ok: true, event };
	},
});

interface LocalResult {
	ok: true;
	local: { days: Record<string, number>; locks: Record<string, string> };
}

const COUNTRY_SET: ReadonlySet<string> = new Set(COUNTRY_IDS);

/**
 * Days-per-country what-if. Per entry: null removes the override, a whole number 0..90 sets it; unknown
 * countries and other values are skipped, as POST /api/local did.
 */
export const setDays = ownerMutation({
	args: { days: v.record(v.string(), v.union(v.number(), v.null())) },
	handler: async (ctx, args): Promise<LocalResult> => {
		const game = await readGameState(ctx.db);
		let days = { ...game.days };
		for (const [country, value] of Object.entries(args.days)) {
			if (!COUNTRY_SET.has(country)) continue;
			if (value === null) days = omitKeys(days, [country]);
			else if (Number.isInteger(value) && value >= 0 && value <= MAX_DAYS) days[country] = value;
		}
		const next = await patchGameState(ctx.db, { days });
		return { ok: true, local: { days: next.days, locks: next.locks } };
	},
});

/** Clear every days override. */
export const resetDays = ownerMutation({
	args: {},
	handler: async (ctx): Promise<LocalResult> => {
		const next = await patchGameState(ctx.db, { days: {} });
		return { ok: true, local: { days: next.days, locks: next.locks } };
	},
});

/**
 * Lock (or with null, unlock) the pick for a holiday. Only a single-pick holiday from the content index takes a
 * lock, and only an existing place; anything else leaves the locks unchanged, as POST /api/local did.
 */
export const setLock = ownerMutation({
	args: { holiday: v.string(), placeId: v.union(v.string(), v.null()) },
	handler: async (ctx, args): Promise<LocalResult & { changed: boolean }> => {
		const index = await requireContentIndex(ctx.db);
		const game = await readGameState(ctx.db);
		const holiday = index.holidays.find((h) => h.id === args.holiday);
		let locks = { ...game.locks };
		let changed = false;
		if (holiday !== undefined && !holiday.pickMany) {
			if (args.placeId === null) {
				changed = args.holiday in locks;
				locks = omitKeys(locks, [args.holiday]);
			} else if (findPlace(index, args.placeId) !== undefined) {
				changed = locks[args.holiday] !== args.placeId;
				locks[args.holiday] = args.placeId;
			}
		}
		const next = changed ? await patchGameState(ctx.db, { locks }) : game;
		return { ok: true, changed, local: { days: next.days, locks: next.locks } };
	},
});
