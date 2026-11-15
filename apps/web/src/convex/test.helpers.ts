// Shared fixtures for the feature specs (skipped by the Convex bundler: the file name has two dots).
import type { Infer } from 'convex/values';
import { internal } from './_generated/api';
import type { TableNames } from './_generated/dataModel';
import type { contentIndex } from './tables/app';
import { as, createUser, type TestClient, type TestConvex } from './test.setup';

/** The `code` of the ConvexError a call rejected with (Invalid, Forbidden, Frozen, ...). */
export async function codeOf(promise: Promise<unknown>): Promise<string> {
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

/** The message of the ConvexError a call rejected with. */
export async function messageOf(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		const data: unknown = (error as { data?: unknown }).data;
		if (
			typeof data === 'object' &&
			data !== null &&
			'message' in data &&
			typeof data.message === 'string'
		) {
			return data.message;
		}
		throw error;
	}
	throw new Error('expected the call to be refused');
}

export type ContentIndexFixture = Infer<typeof contentIndex.validator>;

/** A small content index: two countries, places in three cities, a config-only stop and the holidays. */
export const CONTENT: ContentIndexFixture = {
	sha: 'sha-1',
	places: [
		{ id: 'yu-garden', country: 'china', city: 'shanghai' },
		{ id: 'the-bund', country: 'china', city: 'shanghai' },
		{ id: 'great-wall', country: 'china', city: 'beijing' },
		{ id: 'gyeongbokgung', country: 'korea', city: 'seoul' },
	],
	areas: [
		{ id: 'shanghai', country: 'china', name: 'Shanghai', lat: 31.23, lng: 121.47 },
		{ id: 'beijing', country: 'china', name: 'Beijing', lat: 39.9, lng: 116.4 },
		{ id: 'seoul', country: 'korea', name: 'Seoul', lat: 37.56, lng: 126.97 },
	],
	legs: [
		{
			country: 'china',
			from: '2026-12-06',
			to: '2027-01-02',
			routeSeed: [
				{ area: 'shanghai', nights: 4 },
				{ area: 'suzhou', nights: 2, name: 'Suzhou', lat: 31.3, lng: 120.6 },
			],
		},
		{ country: 'korea', from: '2027-01-02', to: '2027-01-12', routeSeed: [] },
	],
	holidays: [
		{ id: 'christmas', pickMany: false },
		{ id: 'nye', pickMany: false },
		{ id: 'lny', pickMany: true },
	],
};

export async function publishContent(
	t: TestConvex,
	index: ContentIndexFixture = CONTENT,
): Promise<void> {
	await t.mutation(internal.content.publish, index);
}

export interface World {
	t: TestConvex;
	owner: TestClient;
	guest: TestClient;
	/** A fresh clientOpId per call. */
	op: () => string;
}

/** Owner and guest accounts, with the content index published. */
export async function world(t: TestConvex): Promise<World> {
	const owner = as(t, await createUser(t, { username: 'owner', role: 'owner' }));
	const guest = as(t, await createUser(t, { username: 'guest', role: 'guest' }));
	await publishContent(t);
	let n = 0;
	return { t, owner, guest, op: () => `op-${String(++n)}` };
}

export async function countRows(t: TestConvex, table: TableNames): Promise<number> {
	return await t.run(async (ctx) => (await ctx.db.query(table).take(10_000)).length);
}

export async function freeze(t: TestConvex, value = true): Promise<void> {
	await t.mutation(internal.ops.setWritesFrozen, { value });
}
