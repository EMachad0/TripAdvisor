import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import { sha256Hex } from './lib/sha256';
import { CONTENT, countRows } from './test.helpers';
import { newTest, type TestConvex } from './test.setup';

const TOKEN = 'content-token-for-tests';
let t: TestConvex;
beforeEach(async () => {
	vi.stubEnv('CONTENT_TOKEN_SHA256', await sha256Hex(TOKEN));
	t = newTest();
});
afterEach(() => {
	vi.unstubAllEnvs();
});

describe('internal content.publish', () => {
	test('inserts, is a no-op for the same sha, and replaces on a new sha', async () => {
		expect(await t.mutation(internal.content.publish, CONTENT)).toEqual({
			changed: true,
			sha: 'sha-1',
		});
		expect(await t.mutation(internal.content.publish, { ...CONTENT, places: [] })).toEqual({
			changed: false,
			sha: 'sha-1',
		});
		expect(await t.query(internal.content.currentSha, {})).toEqual({ sha: 'sha-1' });
		expect(
			await t.mutation(internal.content.publish, { ...CONTENT, sha: 'sha-2', places: [] }),
		).toEqual({ changed: true, sha: 'sha-2' });
		expect(await countRows(t, 'contentIndex')).toBe(1);
		const index = await t.run(async (ctx) => await ctx.db.query('contentIndex').first());
		expect(index?.places).toEqual([]);
	});

	test('currentSha is null before the first publish', async () => {
		expect(await t.query(internal.content.currentSha, {})).toEqual({ sha: null });
	});
});

describe('POST /ops/content-index', () => {
	const post = (body: unknown, token: string | null = TOKEN) =>
		t.fetch('/ops/content-index', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(token === null ? {} : { Authorization: `Bearer ${token}` }),
			},
			body: typeof body === 'string' ? body : JSON.stringify(body),
		});

	test('publishes with the right token', async () => {
		const res = await post(CONTENT);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, changed: true, sha: 'sha-1' });
		expect(await (await post(CONTENT)).json()).toEqual({ ok: true, changed: false, sha: 'sha-1' });
	});

	test('refuses a missing or wrong token and writes nothing', async () => {
		expect((await post(CONTENT, null)).status).toBe(401);
		expect((await post(CONTENT, 'wrong')).status).toBe(401);
		expect(await countRows(t, 'contentIndex')).toBe(0);
	});

	test('refuses a body that is not JSON or not a content index', async () => {
		expect((await post('{nope')).status).toBe(400);
		const res = await post({ ...CONTENT, places: [{ id: 'x', country: 'brazil', city: 'rio' }] });
		expect(res.status).toBe(400);
		expect(((await res.json()) as { error: string }).error).toMatch(/^invalid content index/);
		expect(await countRows(t, 'contentIndex')).toBe(0);
	});

	test('answers 503 when CONTENT_TOKEN_SHA256 is not set', async () => {
		vi.stubEnv('CONTENT_TOKEN_SHA256', '');
		expect((await post(CONTENT)).status).toBe(503);
	});
});
