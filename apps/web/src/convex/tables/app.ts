// App-only tables (plan section 4). Never exported to v1 and dropped on rollback; none holds traveler-written data.
import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { country, role, routeStop, tripCollection, tripOp } from './validators';

/** Audit of trip writes (material for undo later). */
export const tripChanges = defineTable({
	col: tripCollection,
	op: tripOp,
	id: v.string(),
	/** The fields written (absent on delete); any trip document shape. */
	data: v.optional(v.any()),
	ts: v.string(),
	userId: v.string(),
}).index('by_ts', ['ts']);

/** Idempotency for outbox replays (section 11): one row per applied clientOpId. */
export const appliedOps = defineTable({
	clientOpId: v.string(),
	ts: v.string(),
}).index('by_clientOpId', ['clientOpId']);

/** Roles (section 6). Exactly two rows in production: the owner and the read-only guest. */
export const members = defineTable({
	authUserId: v.string(),
	role,
}).index('by_authUserId', ['authUserId']);

/** Singleton written only by content sync (`internal.content.publish`), so mutations can validate ids. */
export const contentIndex = defineTable({
	/** Git sha of the content the index was built from. */
	sha: v.string(),
	places: v.array(v.object({ id: v.string(), country, city: v.string() })),
	areas: v.array(
		v.object({
			id: v.string(),
			country,
			name: v.string(),
			lat: v.optional(v.number()),
			lng: v.optional(v.number()),
		}),
	),
	/** Country legs from config/trip.yaml, with the route seed (`route:`) of each. */
	legs: v.array(
		v.object({ country, from: v.string(), to: v.string(), routeSeed: v.array(routeStop) }),
	),
	/** Holidays from game/lib/board.js HOLIDAYS; `pickMany` holidays take no lock. */
	holidays: v.array(v.object({ id: v.string(), pickMany: v.boolean() })),
});

/** Singleton: the shadow, cutover and rollback write freeze. */
export const opsFlags = defineTable({
	writesFrozen: v.boolean(),
});
