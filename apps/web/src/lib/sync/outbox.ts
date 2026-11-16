// The durable outbox behind write.ts (plan section 11, spike S25): every write is stored in IndexedDB before it is
// sent and removed only when its mutation resolves (or is refused for good), so a reload, a crash or a dead battery
// never loses one. Entries come back oldest first (autoIncrement key), which is the replay order.
// Where IndexedDB cannot open (private mode, blocked storage) it falls back to memory, as before slice L.
import { openSyncDB, type StoredEntry, type SyncDatabase } from './db';
import type { Outbox, OutboxEntry } from './write';

function memoryOutbox(): Outbox {
	const entries = new Map<string, OutboxEntry>();
	return {
		add: (e) => {
			entries.set(e.clientOpId, e);
			return Promise.resolve();
		},
		remove: (id) => {
			entries.delete(id);
			return Promise.resolve();
		},
		list: () => Promise.resolve([...entries.values()]),
	};
}

const toEntry = ({ clientOpId, name, args, at }: StoredEntry): OutboxEntry => ({
	clientOpId,
	name: name as OutboxEntry['name'],
	args,
	at,
});

/** An outbox over an open database. */
export function idbOutbox(db: SyncDatabase): Outbox {
	return {
		async add(entry) {
			const tx = db.transaction('outbox', 'readwrite');
			// A replayed entry is already there: keep its place in the queue.
			if ((await tx.store.index('clientOpId').getKey(entry.clientOpId)) === undefined) {
				await tx.store.add({ ...entry });
			}
			await tx.done;
		},
		async remove(clientOpId) {
			const tx = db.transaction('outbox', 'readwrite');
			const key = await tx.store.index('clientOpId').getKey(clientOpId);
			if (key !== undefined) await tx.store.delete(key);
			await tx.done;
		},
		async list() {
			return (await db.getAll('outbox')).map(toEntry);
		},
	};
}

/**
 * The outbox write.ts uses in the browser: IndexedDB once it opens, memory if it cannot. Calls made while the
 * database is still opening wait for it, so the first write of a page load is durable too.
 */
export function durableOutbox(open: () => Promise<SyncDatabase> = openSyncDB): Outbox {
	const ready: Promise<Outbox> = open().then(idbOutbox, (error: unknown) => {
		console.warn('sync: IndexedDB unavailable, unsent writes live in memory only', error);
		return memoryOutbox();
	});
	return {
		add: async (entry) => {
			await (await ready).add(entry);
		},
		remove: async (id) => {
			await (await ready).remove(id);
		},
		list: async () => (await ready).list(),
	};
}
