// An in-memory stand-in for a Convex deployment, faithful in the two ways that matter to the codec (spike S14):
// documents come back with their fields sorted by name, and in creation order with fractional creation times.
import { isObject, sortKeysDeep, type JsonObject } from '../json.ts';
import type { DataTable } from '../tables.ts';
import type { Deployment } from './types.ts';

export class MemoryDeployment implements Deployment {
	readonly label = 'memory';
	private readonly tables = new Map<string, JsonObject[]>();
	private clock = 1_794_776_219_767;
	private nextId = 0;
	frozen = false;

	readTable(table: DataTable): Promise<JsonObject[]> {
		return Promise.resolve((this.tables.get(table) ?? []).map((doc) => structuredClone(doc)));
	}

	replaceTable(table: DataTable, rows: readonly JsonObject[]): Promise<void> {
		this.tables.set(
			table,
			rows.map((row) => this.store(row)),
		);
		return Promise.resolve();
	}

	async replaceTables(tables: ReadonlyMap<DataTable, readonly JsonObject[]>): Promise<void> {
		for (const [table, rows] of tables) await this.replaceTable(table, rows);
	}

	/** Inserts one document the way the new app would (no seq), after everything already stored. */
	insert(table: DataTable, row: JsonObject): void {
		const docs = this.tables.get(table) ?? [];
		docs.push(this.store(row));
		this.tables.set(table, docs);
	}

	writesFrozen(): Promise<boolean> {
		return Promise.resolve(this.frozen);
	}

	private store(row: JsonObject): JsonObject {
		this.clock += 0.0003;
		this.nextId += 1;
		const sorted = sortKeysDeep({
			...row,
			_id: `m${String(this.nextId)}`,
			_creationTime: this.clock,
		});
		return isObject(sorted) ? sorted : {};
	}
}
