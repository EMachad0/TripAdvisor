// Event logs from feedback/*.jsonl (plan section 4). Insert-only: no function updates or deletes these rows.
import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { country, eventFields, round, routeStop, verdict } from './validators';

export const swipes = defineTable({
	...eventFields,
	/** Stamped by the server, at most 80 characters. */
	session: v.string(),
	round,
	id: v.string(),
	verdict,
	country: v.optional(country),
	/** Integer milliseconds on the card, clamped 0..3,600,000. */
	ms: v.optional(v.number()),
})
	.index('by_ts', ['ts'])
	.index('by_round_id_ts', ['round', 'id', 'ts']);

export const duels = defineTable({
	...eventFields,
	session: v.optional(v.string()),
	winner: v.string(),
	loser: v.string(),
	country: v.optional(country),
	/** Pre-duel game ratings, rounded to 0.1. */
	elo: v.optional(v.object({ winner: v.number(), loser: v.number() })),
})
	.index('by_ts', ['ts'])
	.index('by_winner', ['winner'])
	.index('by_loser', ['loser']);

export const notes = defineTable({
	...eventFields,
	session: v.optional(v.string()),
	round,
	id: v.string(),
	/** At most 2000 characters; "" clears the note. */
	text: v.string(),
	country: v.optional(country),
})
	.index('by_ts', ['ts'])
	.index('by_round_id_ts', ['round', 'id', 'ts']);

export const routes = defineTable({
	...eventFields,
	session: v.optional(v.string()),
	country,
	/** At most 30 stops. */
	stops: v.array(routeStop),
})
	.index('by_ts', ['ts'])
	.index('by_country_ts', ['country', 'ts']);

/** Frozen: imported once, no write function. */
export const questions = defineTable({
	...eventFields,
	session: v.optional(v.string()),
	id: v.string(),
	question: v.string(),
	answer_summary: v.optional(v.string()),
})
	.index('by_ts', ['ts'])
	.index('by_id_ts', ['id', 'ts']);
