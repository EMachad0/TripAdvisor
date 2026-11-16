// The v1 export (plan section 5): every traveler-written table as today's files, for curators
// (`./atr feedback pull`, `./atr trip pull`), the nightly backup and a lossless rollback. Read-only; served by
// GET /ops/export in http.ts. The files come from @atr/shared's exportV1Files, the same codec @atr/migrate's
// export-v1 runs, so the two cannot drift. App-only tables (tripChanges, appliedOps, members, contentIndex,
// opsFlags) and app-only fields (userId, seq) are never exported.
import { v1 } from '@atr/shared';
import { internalQuery } from './_generated/server';
import type { DatabaseReader } from './_generated/server';
import { nowTs } from './lib/access';
import { allRows } from './lib/rows';
import { sha256Hex } from './lib/sha256';

/**
 * Every row of a data table as plain JSON. Every value the data tables store is JSON (strings, numbers, booleans,
 * null, lists, objects; ids are strings), so the row type widens to the codec's JSON object without loss.
 */
async function readTable(db: DatabaseReader, table: v1.DataTable): Promise<v1.JsonObject[]> {
	const rows: object[] = await allRows(db, table);
	return rows as v1.JsonObject[];
}

/** The whole v1 bundle: 15 files, each with its record count and sha256 (format: @atr/shared v1/bundle.ts). */
export const bundle = internalQuery({
	args: {},
	handler: async (ctx): Promise<v1.Bundle> => {
		const files = await v1.exportV1Files(async (table) => await readTable(ctx.db, table));
		return await v1.toBundle(files, sha256Hex, nowTs());
	},
});
