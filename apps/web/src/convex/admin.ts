// Account seeding (plan section 6). Passwords come from temporary Convex env vars set from stdin and removed
// right after (scripts/convex-local.sh seed does both); never pass a password as a CLI argument.
import { v } from 'convex/values';
import { components, internal } from './_generated/api';
import { internalAction, type ActionCtx } from './_generated/server';
import { createAuth } from './auth';
import * as env from './lib/env';
import type { Role } from './tables/validators';

type SeedResult = 'created' | 'exists';

/** The `_id` of a component document, or null. The component's findOne is typed `any`; check it here. */
function userIdOf(doc: unknown): string | null {
	if (typeof doc !== 'object' || doc === null || !('_id' in doc)) return null;
	return typeof doc._id === 'string' ? doc._id : null;
}

async function findUserId(ctx: ActionCtx, username: string): Promise<string | null> {
	const doc: unknown = await ctx.runQuery(components.betterAuth.adapter.findOne, {
		model: 'user',
		where: [{ field: 'username', value: username.toLowerCase() }],
	});
	return userIdOf(doc);
}

/** Create the Better Auth user (unless the username exists) and upsert its members row. Idempotent. */
async function ensureAccount(
	ctx: ActionCtx,
	account: { username: string; password: string; email: string; role: Role },
): Promise<SeedResult> {
	const username = account.username.toLowerCase();
	const existing = await findUserId(ctx, username);
	let authUserId: string;
	let result: SeedResult;
	if (existing !== null) {
		authUserId = existing;
		result = 'exists';
	} else {
		const created = await createAuth(ctx).api.signUpEmail({
			body: {
				email: account.email,
				password: account.password,
				name: account.username,
				username,
			},
		});
		authUserId = created.user.id;
		result = 'created';
	}
	await ctx.runMutation(internal.members.upsert, { authUserId, role: account.role });
	return result;
}

/** The two production accounts: the owner and the read-only guest. */
export const seedAccounts = internalAction({
	args: {},
	handler: async (ctx): Promise<{ owner: SeedResult; guest: SeedResult }> => {
		const { owner, guest } = env.seedAccounts();
		return {
			owner: await ensureAccount(ctx, { ...owner, email: 'owner@example.invalid', role: 'owner' }),
			guest: await ensureAccount(ctx, { ...guest, email: 'guest@example.invalid', role: 'guest' }),
		};
	},
});

/**
 * The restore test's owner, `ci_restore` (a username never used in prod), with E2E_OWNER_PASSWORD from env.
 * Refuses unless the deployment has ATR_CI_DEPLOYMENT=1, so it cannot open a backdoor on prod.
 */
export const seedCiUser = internalAction({
	args: {},
	handler: async (ctx): Promise<SeedResult> => {
		if (!env.isCiDeployment()) throw new Error('seedCiUser runs only where ATR_CI_DEPLOYMENT=1');
		return await ensureAccount(ctx, {
			username: 'ci_restore',
			password: env.ciOwnerPassword(),
			email: 'ci_restore@example.invalid',
			role: 'owner',
		});
	},
});

/** How many accounts exist per role (the restore test asserts the prod usernames survived). */
export const accountCounts = internalAction({
	args: { usernames: v.array(v.string()) },
	handler: async (ctx, { usernames }): Promise<Record<string, boolean>> => {
		const out: Record<string, boolean> = {};
		for (const name of usernames) {
			out[name] = (await findUserId(ctx, name)) !== null;
		}
		return out;
	},
});
