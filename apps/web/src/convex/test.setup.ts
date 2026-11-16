/// <reference types="vite/client" />
// convex-test harness for the backend specs (skipped by the Convex bundler: the file name has two dots).
import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest, type TestConvex as ConvexTestRoot } from 'convex-test';
import { components } from './_generated/api';
import schema from './schema';
import type { Role } from './tables/validators';

export const modules = import.meta.glob('./**/*.ts');

export type TestConvex = ConvexTestRoot<typeof schema>;
export type TestClient = ReturnType<TestConvex['withIdentity']>;

/** A fresh in-memory backend with the betterAuth component registered. */
export function newTest(): TestConvex {
	const t = convexTest(schema, modules);
	betterAuthTest.register(t, 'betterAuth');
	return t;
}

/** Create a Better Auth user with a live session (and a members row unless `role` is null). */
export async function createUser(
	t: TestConvex,
	opts: { username: string; role: Role | null },
): Promise<{ userId: string; sessionId: string }> {
	const now = Date.now();
	return await t.run(async (ctx) => {
		const user: unknown = await ctx.runMutation(components.betterAuth.adapter.create, {
			input: {
				model: 'user',
				data: {
					name: opts.username,
					email: `${opts.username}@example.invalid`,
					emailVerified: false,
					username: opts.username,
					createdAt: now,
					updatedAt: now,
				},
			},
		});
		const userId = idOf(user);
		const session: unknown = await ctx.runMutation(components.betterAuth.adapter.create, {
			input: {
				model: 'session',
				data: {
					userId,
					token: `token-${opts.username}`,
					expiresAt: now + 3_600_000,
					createdAt: now,
					updatedAt: now,
				},
			},
		});
		if (opts.role !== null) await ctx.db.insert('members', { authUserId: userId, role: opts.role });
		return { userId, sessionId: idOf(session) };
	});
}

/** The client for a signed-in user (what the Convex JWT carries: subject and sessionId). */
export function as(t: TestConvex, user: { userId: string; sessionId: string }): TestClient {
	return t.withIdentity({ subject: user.userId, sessionId: user.sessionId });
}

function idOf(doc: unknown): string {
	if (typeof doc === 'object' && doc !== null && '_id' in doc && typeof doc._id === 'string') {
		return doc._id;
	}
	throw new Error('expected a component document with an _id');
}
