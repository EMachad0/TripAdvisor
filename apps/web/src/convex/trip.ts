// Trip planner data: the nine collections (plan section 5, replacing GET and POST /api/trip). Every write goes
// through lib/tripStore.ts, which keeps the old writeDoc rules and the form shaping.
import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { assertWritable, memberQuery, nowTs, ownerMutation } from './lib/access';
import type { TripDoc } from './lib/logic/trip';
import { readCollection, writeTripDoc } from './lib/tripStore';
import { TRIP_COLLECTIONS, tripCollection, tripOp, type TripCollection } from './tables/validators';

/** A field value a trip write may send (string, number, boolean, null to clear, or a list of city ids). */
const tripValue = v.union(v.string(), v.number(), v.boolean(), v.null(), v.array(v.string()));

const writeArgs = {
	col: tripCollection,
	op: tripOp,
	id: v.optional(v.union(v.string(), v.null())),
	data: v.optional(v.record(v.string(), tripValue)),
};

/** Every trip collection (about 180 documents), each in stored order. */
export const all = memberQuery({
	args: {},
	handler: async (ctx): Promise<Record<TripCollection, TripDoc[]>> => {
		const entries = await Promise.all(
			TRIP_COLLECTIONS.map(async (col) => [col, await readCollection(ctx.db, col)] as const),
		);
		return Object.fromEntries(entries) as Record<TripCollection, TripDoc[]>;
	},
});

/**
 * One write to one collection: { col, op: set | update | delete, id?, data? }. Answers { ok, doc } (doc is null
 * after a delete), like POST /api/trip.
 */
export const write = ownerMutation({
	args: writeArgs,
	handler: async (ctx, args): Promise<{ ok: true; doc: TripDoc | null }> => {
		const { doc } = await writeTripDoc(ctx.db, args, { userId: ctx.member.authUserId, ts: ctx.ts });
		return { ok: true, doc };
	},
});

/** Untick every packed bag item in one write (the old client sent one POST per item). */
export const bagUntickAll = ownerMutation({
	args: {},
	handler: async (ctx): Promise<{ ok: true; changed: number }> => {
		const packed = (await readCollection(ctx.db, 'bag')).filter((d) => d['packed'] === true);
		for (const item of packed) {
			await writeTripDoc(
				ctx.db,
				{ col: 'bag', op: 'update', id: item.id, data: { packed: false } },
				{ userId: ctx.member.authUserId, ts: ctx.ts },
			);
		}
		return { ok: true, changed: packed.length };
	},
});

/**
 * Hand edits from the laptop (`./atr trip`, through scripts/convex-prod.sh run): the same rules as trip.write.
 * Refuses while writes are frozen unless `force: true`, which only the owner passes by hand, never an agent.
 */
export const adminWrite = internalMutation({
	args: { ...writeArgs, force: v.optional(v.boolean()) },
	handler: async (ctx, { force, ...req }): Promise<{ ok: true; doc: TripDoc | null }> => {
		await assertWritable(ctx.db, { force: force === true });
		const { doc } = await writeTripDoc(ctx.db, req, { userId: 'admin', ts: nowTs() });
		return { ok: true, doc };
	},
});
