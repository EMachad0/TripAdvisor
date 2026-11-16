// Offline reads: the mirror answers localQueryResult while there is no live result, records live results, and
// replays a stored result to a new subscriber after a cold start.
import type { ConvexClient } from 'convex/browser';
import { getFunctionName, makeFunctionReference } from 'convex/server';
import type { Value } from 'convex/values';
import { describe, expect, test } from 'vitest';
import type { MirrorRow } from './db';
import type { OptimisticLocalStore } from 'convex/browser';
import { installMirror, Mirror, mirroredStore, mirrorKey, type MirrorStore } from './mirror';

const tripAll = makeFunctionReference<'query'>('trip:all');

function memoryStore(rows: MirrorRow[] = []): MirrorStore & { rows: MirrorRow[] } {
	return {
		rows,
		all: () => Promise.resolve([...rows]),
		put: (row) => {
			rows.push(row);
			return Promise.resolve();
		},
	};
}

/** The two client calls the mirror wraps, with a switch for "live result" and "query error". */
function fakeClient() {
	const state: { live: Value | undefined; error: Error | null; cb: ((r: unknown) => void) | null } =
		{
			live: undefined,
			error: null,
			cb: null,
		};
	const client = {
		client: {
			localQueryResult: (): Value | undefined => {
				if (state.error !== null) throw state.error;
				return state.live;
			},
		},
		onUpdate: (_q: unknown, _a: unknown, cb: (r: unknown) => void) => {
			state.cb = cb;
			return () => undefined;
		},
	};
	return { client: client as unknown as ConvexClient, state };
}

describe('mirror', () => {
	test('keys by query name and Convex JSON args', () => {
		expect(mirrorKey('trip:all', {})).toBe('trip:all|{}');
		expect(mirrorKey('trip:all', undefined)).toBe('trip:all|{}');
		expect(mirrorKey('x:y', { a: 1n })).toBe('x:y|{"a":{"$integer":"AQAAAAAAAAA="}}');
	});

	test('a live result is recorded and stored; with no live result the mirror answers', async () => {
		const store = memoryStore();
		const mirror = new Mirror(Promise.resolve(store));
		const { client, state } = fakeClient();
		installMirror(client, mirror);
		const seen: unknown[] = [];
		client.onUpdate(tripAll, {}, (r) => seen.push(r));
		state.live = { legs: [1] };
		state.cb?.({ legs: [1] });
		await mirror.ready;
		await Promise.resolve();
		expect(store.rows.map((r) => r.key)).toEqual(['trip:all|{}']);
		expect(mirror.lastSynced).not.toBeNull();
		state.live = undefined;
		expect(client.client.localQueryResult('trip:all', {})).toEqual({ legs: [1] });
		state.error = new Error('Unauthenticated');
		expect(client.client.localQueryResult('trip:all', {})).toEqual({ legs: [1] });
		expect(() => client.client.localQueryResult('other:q', {})).toThrow('Unauthenticated');
		expect(seen).toEqual([{ legs: [1] }]);
	});

	test('after a cold start a subscriber gets the stored result once the rows load', async () => {
		const at = '2026-11-15T06:05:00.000Z';
		const mirror = new Mirror(
			Promise.resolve(memoryStore([{ key: 'trip:all|{}', value: { legs: [2] }, at }])),
		);
		const { client } = fakeClient();
		installMirror(client, mirror);
		const seen: unknown[] = [];
		client.onUpdate(tripAll, {}, (r) => seen.push(r));
		await mirror.ready;
		await Promise.resolve();
		expect(seen).toEqual([{ legs: [2] }]);
		expect(mirror.lastSynced).toBe(at);
		expect(client.client.localQueryResult('trip:all', {})).toEqual({ legs: [2] });
	});

	test('without IndexedDB the mirror still works in memory', async () => {
		const mirror = new Mirror(Promise.resolve(null));
		mirror.record('a|{}', 1);
		await mirror.ready;
		expect(mirror.get('a|{}')?.value).toBe(1);
	});
});

describe('mirroredStore', () => {
	test('an optimistic update reads the mirrored value when the client has none, and sets the query', () => {
		const mirror = new Mirror(Promise.resolve(null));
		mirror.record('trip:all|{}', { n: 1 });
		const set: unknown[] = [];
		const live = new Map<string, unknown>();
		const store = {
			getQuery: (q: Parameters<typeof getFunctionName>[0]) => live.get(getFunctionName(q)),
			getAllQueries: () => [],
			setQuery: (_q: unknown, _a: unknown, v: unknown) => {
				set.push(v);
				live.set('trip:all', v);
			},
		} as unknown as OptimisticLocalStore;
		const s = mirroredStore(store, mirror);
		expect(s.getQuery(tripAll, {})).toEqual({ n: 1 });
		s.setQuery(tripAll, {}, { n: 2 });
		expect(set).toEqual([{ n: 2 }]);
		// The client's own value wins once it has one.
		expect(s.getQuery(tripAll, {})).toEqual({ n: 2 });
		expect(s.getQuery(makeFunctionReference<'query'>('other:q'), {})).toBeUndefined();
	});
});
