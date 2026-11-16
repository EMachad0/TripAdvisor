// import (plan section 14, load step): replace each data table with the snapshot's rows, one atomic replace per
// table in the fixed order of DATA_TABLES. App-only tables (members, appliedOps, tripChanges, contentIndex,
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
	 * Tables replaced at the same time (default 1: one after another, in DATA_TABLES order). Each replace is its
	 * own atomic CLI import, so this only shortens the wall time; e2e reseeds of a local test backend use it.
	 */
	parallel?: number;
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
	const queue = [...DATA_TABLES];
	const lane = async (): Promise<void> => {
		for (let table = queue.shift(); table !== undefined; table = queue.shift()) {
			const rows = snapshot.rows.get(table) ?? [];
			await deployment.replaceTable(table, rows);
			options.onTable?.(table, rows.length);
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, options.parallel ?? 1) }, lane));
	return tableCounts(snapshot.rows);
}
