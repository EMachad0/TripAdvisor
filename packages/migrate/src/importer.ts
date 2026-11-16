// import (plan section 14, load step): replace each data table with the snapshot's rows, one atomic replace per
// table in the fixed order of DATA_TABLES (or, for test backends, all of them in one atomic replace). App-only tables (members, appliedOps, tripChanges, contentIndex,
// opsFlags) and the Better Auth tables are never touched.
import type { Deployment } from './deployment/types.ts';
import { tableCounts, type Snapshot } from './snapshot.ts';
import { DATA_TABLES, type DataTable } from './tables.ts';

export interface ImportOptions {
	/** The quarantine must hold exactly this many entries, or nothing is written. */
	acceptQuarantine: number;
	/** Refuse unless opsFlags.writesFrozen is on (prod). */
	requireFrozen: boolean;
	onTable?: (table: DataTable, count: number) => void;
	/**
	 * Replace every table in one import instead of one per table (one CLI start instead of sixteen): what the e2e
	 * reseeds of a local test backend use. prod imports keep one table at a time.
	 */
	together?: boolean;
}

export async function importSnapshot(
	deployment: Deployment,
	snapshot: Snapshot,
	options: ImportOptions,
): Promise<Map<DataTable, number>> {
	const bad = snapshot.quarantine.length;
	if (bad !== options.acceptQuarantine) {
		throw new Error(
			`${String(bad)} quarantined line(s); pass --accept-quarantine ${String(bad)} after reading the report (nothing written)`,
		);
	}
	if (options.requireFrozen && !(await deployment.writesFrozen())) {
		throw new Error(
			`writes are not frozen on ${deployment.label}; run ops:setWritesFrozen '{"value": true}' first`,
		);
	}
	if (options.together === true) {
		const tables = new Map(DATA_TABLES.map((table) => [table, snapshot.rows.get(table) ?? []]));
		await deployment.replaceTables(tables);
		for (const [table, rows] of tables) options.onTable?.(table, rows.length);
		return tableCounts(snapshot.rows);
	}
	for (const table of DATA_TABLES) {
		const rows = snapshot.rows.get(table) ?? [];
		await deployment.replaceTable(table, rows);
		options.onTable?.(table, rows.length);
	}
	return tableCounts(snapshot.rows);
}
