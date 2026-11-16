// What import, export-v1 and verify need from a Convex deployment. ConvexAdmin talks to a real backend with an
// admin key; MemoryDeployment imitates one for tests (sorted fields, creation order).
import type { JsonObject } from '../json.ts';
import type { DataTable } from '../tables.ts';

export interface Deployment {
	/** Where it is, for messages: a host, never a key. */
	readonly label: string;
	/** Every document of the table, system fields included, in creation order. */
	readTable(table: DataTable): Promise<JsonObject[]>;
	/** Replaces the whole table with `rows` in one atomic step, inserting them in the given order. */
	replaceTable(table: DataTable, rows: readonly JsonObject[]): Promise<void>;
	/** opsFlags.writesFrozen (false when the flag row does not exist). */
	writesFrozen(): Promise<boolean>;
}
