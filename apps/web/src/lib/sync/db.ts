// The one IndexedDB database of the sync layer (plan section 11): the write outbox, the mirror of the last query
// results and a little metadata. The service worker opens the same database to clear the mirror on sign-out.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const DB_NAME = 'atr-sync';
export const DB_VERSION = 1;

/** A stored outbox entry: the write.ts entry plus its insertion order. */
export interface StoredEntry {
	seq?: number;
	clientOpId: string;
	name: string;
	args: Record<string, unknown>;
	at: string;
}

/** The last result of one query (`name|args`), and when the server sent it. */
export interface MirrorRow {
	key: string;
	value: unknown;
	at: string;
}

export interface SyncDB extends DBSchema {
	outbox: { key: number; value: StoredEntry; indexes: { clientOpId: string } };
	mirror: { key: string; value: MirrorRow };
}

export type SyncDatabase = IDBPDatabase<SyncDB>;

/** Opens (and on first use creates) the database. Rejects where IndexedDB is missing or blocked. */
export function openSyncDB(): Promise<SyncDatabase> {
	return openDB<SyncDB>(DB_NAME, DB_VERSION, {
		upgrade(db) {
			const outbox = db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
			outbox.createIndex('clientOpId', 'clientOpId', { unique: true });
			db.createObjectStore('mirror', { keyPath: 'key' });
		},
	});
}
