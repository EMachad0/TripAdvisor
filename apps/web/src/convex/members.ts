// Roles (plan section 6). The UI reads members.me to hide edit controls from the guest; the server enforces it
// in ownerMutation regardless.
import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { memberQuery } from './lib/access';
import { role } from './tables/validators';

export const me = memberQuery({
	args: {},
	handler: (ctx) => ({ role: ctx.member.role, username: ctx.member.username }),
});

/** Role of a Better Auth user, for the auth hooks that run in an action context. */
export const roleOf = internalQuery({
	args: { authUserId: v.string() },
	handler: async (ctx, { authUserId }) => {
		const member = await ctx.db
			.query('members')
			.withIndex('by_authUserId', (q) => q.eq('authUserId', authUserId))
			.unique();
		return member?.role ?? null;
	},
});

/** Create or update the members row of one Better Auth user. */
export const upsert = internalMutation({
	args: { authUserId: v.string(), role },
	handler: async (ctx, { authUserId, role: newRole }) => {
		const existing = await ctx.db
			.query('members')
			.withIndex('by_authUserId', (q) => q.eq('authUserId', authUserId))
			.unique();
		if (existing === null) {
			await ctx.db.insert('members', { authUserId, role: newRole });
		} else if (existing.role !== newRole) {
			await ctx.db.patch('members', existing._id, { role: newRole });
		}
	},
});
