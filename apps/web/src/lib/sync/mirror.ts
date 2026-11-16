// Offline reads (plan section 11.2). Every query result the browser receives (trip.all, feedback.state,
// route.current, ...) is mirrored to IndexedDB. While there is no live result for a query (offline, or before the
// first result after a cold start), the client answers from the mirror instead, so the itinerary, addresses and
// booking refs still show with no network.
//
// It works under every screen without touching them: convex-svelte's useQuery reads
// `client.client.localQueryResult(name, args)` and re-reads it when its `onUpdate` callback fires, so the mirror
// wraps those two calls on the one ConvexClient of the tab.
import type { ConvexClient, OptimisticLocalStore } from 'convex/browser';
import { getFunctionName, type FunctionReference } from 'convex/server';
import { convexToJson, type Value } from 'convex/values';
import { openSyncDB, type MirrorRow, type SyncDatabase } from './db';

/** `trip:all|{}`: the query name and its arguments as Convex JSON. */
export function mirrorKey(name: string, args: Record<string, Value> | undefined): string {
	return `${name}|${JSON.stringify(convexToJson(args ?? {}))}`;
}

/** Where mirrored results persist. */
export interface MirrorStore {
	all(): Promise<MirrorRow[]>;
	put(row: MirrorRow): Promise<void>;
}

export function idbMirrorStore(db: SyncDatabase): MirrorStore {
	return {
		all: () => db.getAll('mirror'),
		put: async (row) => {
			await db.put('mirror', row);
		},
	};
}

type Listener = (lastSynced: string | null) => void;

/** The mirrored rows in memory (localQueryResult is synchronous) plus their persistence. */
export class Mirror {
	readonly #rows = new Map<string, MirrorRow>();
	readonly #store: Promise<MirrorStore | null>;
	readonly #listeners = new Set<Listener>();
	#lastSynced: string | null = null;
	/** Resolves once the stored rows are in memory. */
	readonly ready: Promise<void>;

	constructor(store: Promise<MirrorStore | null>) {
		this.#store = store;
		this.ready = store.then(
			async (s) => {
				for (const row of (await s?.all()) ?? []) {
					// A live result that arrived while loading wins over the stored one.
					if (!this.#rows.has(row.key)) this.#rows.set(row.key, row);
					this.#bump(row.at);
				}
			},
			() => undefined,
		);
	}

	get(key: string): MirrorRow | undefined {
		return this.#rows.get(key);
	}

	/** A live result from the server: keep it in memory and in IndexedDB. */
	record(key: string, value: unknown, at: Date = new Date()): void {
		const row: MirrorRow = { key, value, at: at.toISOString() };
		this.#rows.set(key, row);
		this.#bump(row.at);
		void this.#store
			.then((s) => s?.put(row))
			.catch((error: unknown) => {
				console.warn('sync: could not mirror a query result', error);
			});
	}

	/** ISO time of the newest live result ever received (stored ones included). */
	get lastSynced(): string | null {
		return this.#lastSynced;
	}

	onSynced(fn: Listener): () => void {
		this.#listeners.add(fn);
		fn(this.#lastSynced);
		return () => this.#listeners.delete(fn);
	}

	#bump(at: string): void {
		if (this.#lastSynced !== null && this.#lastSynced >= at) return;
		this.#lastSynced = at;
		for (const fn of this.#listeners) fn(at);
	}
}

const patched = new WeakSet<ConvexClient>();

/**
 * Wrap the tab's client so queries fall back to the mirror and every live result is recorded. Idempotent per client.
 * Errors (Unauthenticated after an offline start, for one) also fall back while a mirrored value exists.
 */
export function installMirror(client: ConvexClient, mirror: Mirror): void {
	if (patched.has(client)) return;
	patched.add(client);
	const base = client.client;
	const localQueryResult = base.localQueryResult.bind(base);
	base.localQueryResult = (udfPath: string, args?: Record<string, Value>): Value | undefined => {
		const key = mirrorKey(udfPath, args);
		try {
			const live = localQueryResult(udfPath, args);
			if (live !== undefined) return live;
		} catch (error) {
			const kept = mirror.get(key);
			if (kept === undefined) throw error;
			return kept.value as Value;
		}
		return mirror.get(key)?.value as Value | undefined;
	};

	const onUpdate = client.onUpdate.bind(client);
	const wrapped = (
		query: FunctionReference<'query'>,
		args: Record<string, Value>,
		callback: (result: unknown) => unknown,
		onError?: (e: Error) => unknown,
	): ReturnType<typeof onUpdate> => {
		const name = getFunctionName(query);
		const key = mirrorKey(name, args);
		let live = false;
		const unsubscribe = onUpdate(
			query,
			args,
			(result: unknown) => {
				live = true;
				mirror.record(key, result);
				callback(result);
			},
			onError,
		);
		// Rows load asynchronously: tell the subscriber once they are there, if nothing live came first.
		void mirror.ready.then(() => {
			const row = mirror.get(key);
			if (!live && row !== undefined) callback(structuredClone(row.value));
		});
		return unsubscribe;
	};
	client.onUpdate = wrapped as typeof client.onUpdate;
}

/**
 * An optimistic store that reads through to the mirror. After an offline start the client holds no server result
 * for feedback.state or trip.all, so a screen's optimistic update would find nothing to change and the write would
 * not show until it lands. Reading the mirrored value lets the update set the query as usual (Convex keeps any
 * query it is given and tells its subscribers); once the server answers, Convex re-applies the update on the live
 * value instead.
 */
export function mirroredStore(store: OptimisticLocalStore, mirror: Mirror): OptimisticLocalStore {
	const getQuery: OptimisticLocalStore['getQuery'] = (query, ...args) => {
		const live = store.getQuery(query, ...args);
		if (live !== undefined) return live;
		const queryArgs = (args[0] ?? {}) as Record<string, Value>;
		const kept = mirror.get(mirrorKey(getFunctionName(query), queryArgs));
		return kept?.value;
	};
	return {
		getQuery,
		getAllQueries: (query) => store.getAllQueries(query),
		setQuery: (query, args, value) => {
			store.setQuery(query, args, value);
		},
	};
}

/** The mirror of this tab, over IndexedDB (memory only where it cannot open). */
export function browserMirror(open: () => Promise<SyncDatabase> = openSyncDB): Mirror {
	return new Mirror(
		open().then(idbMirrorStore, (error: unknown) => {
			console.warn('sync: IndexedDB unavailable, no offline reads', error);
			return null;
		}),
	);
}
