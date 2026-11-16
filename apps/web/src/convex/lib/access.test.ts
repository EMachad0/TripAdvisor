import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, components, internal } from '../_generated/api';
import { as, createUser, newTest, type TestConvex } from '../test.setup';
import { nowTs } from './access';

/** The ConvexError `code` a call rejected with. */
async function codeOf(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		const data: unknown = (error as { data?: unknown }).data;
		if (
			typeof data === 'object' &&
			data !== null &&
			'code' in data &&
			typeof data.code === 'string'
		) {
			return data.code;
		}
		throw error;
	}
	throw new Error('expected the call to be refused');
}

async function appliedCount(t: TestConvex): Promise<number> {
	return await t.run(async (ctx) => (await ctx.db.query('appliedOps').take(1000)).length);
}

let t: TestConvex;
beforeEach(() => {
	vi.stubEnv('ATR_CI_DEPLOYMENT', '1');
	t = newTest();
});
afterEach(() => {
	vi.unstubAllEnvs();
});

describe('memberQuery', () => {
	test('refuses a caller with no identity', async () => {
		expect(await codeOf(t.query(api.members.me, {}))).toBe('Unauthenticated');
	});

	test('refuses a user with no members row', async () => {
		const stranger = await createUser(t, { username: 'stranger', role: null });
		expect(await codeOf(as(t, stranger).query(api.members.me, {}))).toBe('Forbidden');
	});

	test('refuses a revoked session (the row is gone, the JWT is not)', async () => {
		const owner = await createUser(t, { username: 'owner', role: 'owner' });
		await t.run(async (ctx) => {
			await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
				input: { model: 'session', where: [{ field: '_id', value: owner.sessionId }] },
			});
		});
		expect(await codeOf(as(t, owner).query(api.members.me, {}))).toBe('Unauthenticated');
	});

	test('serves the owner and the guest', async () => {
		const owner = await createUser(t, { username: 'owner', role: 'owner' });
		const guest = await createUser(t, { username: 'guest', role: 'guest' });
		expect(await as(t, owner).query(api.members.me, {})).toEqual({
			role: 'owner',
			username: 'owner',
		});
		expect(await as(t, guest).query(api.members.me, {})).toEqual({
			role: 'guest',
			username: 'guest',
		});
	});
});

describe('ownerMutation', () => {
	test('refuses the guest and writes nothing', async () => {
		const guest = await createUser(t, { username: 'guest', role: 'guest' });
		const call = as(t, guest).mutation(api.e2e.probeWrite, { clientOpId: 'op-guest' });
		expect(await codeOf(call)).toBe('Forbidden');
		expect(await appliedCount(t)).toBe(0);
	});

	test('refuses a caller with no identity', async () => {
		expect(await codeOf(t.mutation(api.e2e.probeWrite, { clientOpId: 'op-anon' }))).toBe(
			'Unauthenticated',
		);
	});

	test('runs for the owner and records the clientOpId once', async () => {
		const owner = as(t, await createUser(t, { username: 'owner', role: 'owner' }));
		expect(await owner.mutation(api.e2e.probeWrite, { clientOpId: 'op-1' })).toEqual({ ok: true });
		expect(await appliedCount(t)).toBe(1);
		// An outbox replay of the same op returns early and adds nothing.
		expect(await owner.mutation(api.e2e.probeWrite, { clientOpId: 'op-1' })).toEqual({
			replayed: true,
		});
		expect(await appliedCount(t)).toBe(1);
	});

	test('throws Frozen while writes are frozen, and lands after the unfreeze', async () => {
		const owner = as(t, await createUser(t, { username: 'owner', role: 'owner' }));
		await owner.mutation(api.e2e.probeWrite, { clientOpId: 'op-before' });
		await t.mutation(internal.ops.setWritesFrozen, { value: true });

		expect(await codeOf(owner.mutation(api.e2e.probeWrite, { clientOpId: 'op-frozen' }))).toBe(
			'Frozen',
		);
		// An op that already landed still drains from the outbox while frozen.
		expect(await owner.mutation(api.e2e.probeWrite, { clientOpId: 'op-before' })).toEqual({
			replayed: true,
		});
		expect(await appliedCount(t)).toBe(1);

		await t.mutation(internal.ops.setWritesFrozen, { value: false });
		expect(await owner.mutation(api.e2e.probeWrite, { clientOpId: 'op-frozen' })).toEqual({
			ok: true,
		});
		expect(await appliedCount(t)).toBe(2);
	});

	test('the CI probe is inert outside test deployments', async () => {
		vi.stubEnv('ATR_CI_DEPLOYMENT', '');
		const owner = as(t, await createUser(t, { username: 'owner', role: 'owner' }));
		await expect(owner.mutation(api.e2e.probeWrite, { clientOpId: 'op-prod' })).rejects.toThrow(
			/ATR_CI_DEPLOYMENT/,
		);
		expect(await appliedCount(t)).toBe(0);
	});
});

describe('nowTs', () => {
	test('writes ts at second precision, as the old server did', () => {
		expect(nowTs(new Date('2026-11-15T15:50:48.765Z'))).toBe('2026-11-15T15:50:48Z');
	});
});
