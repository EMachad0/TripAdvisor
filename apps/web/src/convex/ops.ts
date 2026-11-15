// Operator switches, run from the laptop with scripts/convex-prod.sh run (plan section 5). Internal only.
import { v } from 'convex/values';
import { components } from './_generated/api';
import { internalMutation, internalQuery } from './_generated/server';
import { writesFrozen } from './lib/access';

/** The shadow, cutover and rollback freeze: ownerMutation and internal.trip.adminWrite refuse while it is on. */
export const setWritesFrozen = internalMutation({
	args: { value: v.boolean() },
	handler: async (ctx, { value }) => {
		const flags = await ctx.db.query('opsFlags').first();
		if (flags === null) await ctx.db.insert('opsFlags', { writesFrozen: value });
		else await ctx.db.patch('opsFlags', flags._id, { writesFrozen: value });
		return { writesFrozen: value };
	},
});

export const getWritesFrozen = internalQuery({
	args: {},
	handler: async (ctx) => ({ writesFrozen: await writesFrozen(ctx.db) }),
});

/** Clear Better Auth's rate-limit buckets (a sign-in lockout) without touching sessions or users. */
export const clearRateLimit = internalMutation({
	args: {},
	handler: async (ctx) => {
		await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
			input: { model: 'rateLimit', where: [] },
			paginationOpts: { cursor: null, numItems: 1000 },
		});
		return null;
	},
});
