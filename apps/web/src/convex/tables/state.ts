// Current game state, from feedback/game-state.json (plan section 4): {v, firstRun, firstSeen, days, locks}.
// firstSeen lives in its own table so first-seen bookkeeping does not conflict with days and locks writes.
import { defineTable } from 'convex/server';
import { v } from 'convex/values';

/** Singleton. */
export const gameState = defineTable({
	v: v.literal(1),
	firstRun: v.union(v.string(), v.null()),
	/** Country id -> whole days 0..90. */
	days: v.record(v.string(), v.number()),
	/** Holiday id (not many-pick) -> place id. */
	locks: v.record(v.string(), v.string()),
});

export const firstSeen = defineTable({
	/** A place id, or `area:<id>`. */
	key: v.string(),
	ts: v.string(),
}).index('by_key', ['key']);
