// export-v1: every traveler-data table rebuilt as today's files, byte for byte the way the old site writes them.
// One function for both callers: the backend's GET /ops/export (reading through ctx.db) and @atr/migrate's
// export-v1 / round trip (reading through the admin API). All 15 files are always written: an empty event log is
// an empty file, a missing game state is readState's defaults, an empty collection is "[]".
import { COLLECTIONS } from '../trip/constants.ts';
import { FEEDBACK_KINDS } from './feedback-specs.ts';
import { feedbackErrors } from './feedback.ts';
import { V1CodecError, type Json, type JsonObject } from './json.ts';
import { compareEventRows, rowsToState, rowToEvent, rowToTripDoc } from './rows.ts';
import {
	EVENT_TABLES,
	eventFile,
	STATE_FILE,
	TRIP_TABLES,
	tripFile,
	type DataTable,
} from './tables.ts';
import { tripDocErrors } from './trip.ts';

/** A v1 snapshot: relative path (feedback/swipes.jsonl, trip/tasks.json, …) -> file text. */
export type V1Files = ReadonlyMap<string, string>;

/** Every document of a table, system fields included, in creation order. */
export type ReadTable = (table: DataTable) => Promise<readonly JsonObject[]>;

/** appendEvent's bytes: JSON.stringify(event) + "\n" per line (LF, no BOM). */
export const jsonlText = (lines: readonly Json[]): string =>
	lines.map((line) => `${JSON.stringify(line)}\n`).join('');

/** writeState / writeCollection's bytes: two-space JSON with a final newline. */
export const jsonText = (value: Json): string => `${JSON.stringify(value, null, 2)}\n`;

/** export-v1 never writes a record the v1 codec would refuse: the rollback target must read every line. */
function assertValid(file: string, index: number, errors: readonly string[]): void {
	if (errors.length > 0) throw new V1CodecError(`${file} record ${String(index + 1)}`, errors);
}

/** The v1 files of a deployment, in V1_FILES order. */
export async function exportV1Files(read: ReadTable): Promise<Map<string, string>> {
	const files = new Map<string, string>();
	for (const kind of FEEDBACK_KINDS) {
		const rows = [...(await read(EVENT_TABLES[kind]))].sort(compareEventRows);
		const lines = rows.map((row) => rowToEvent(kind, row));
		lines.forEach((line, i) => {
			assertValid(eventFile(kind), i, feedbackErrors(kind, line));
		});
		files.set(eventFile(kind), jsonlText(lines));
	}
	const states = await read('gameState');
	if (states.length > 1) {
		throw new V1CodecError('gameState', [`a singleton, but it has ${String(states.length)} rows`]);
	}
	files.set(STATE_FILE, jsonText(rowsToState(states[0] ?? null, await read('firstSeen'))));
	for (const col of COLLECTIONS) {
		const docs = (await read(TRIP_TABLES[col])).map((row) => rowToTripDoc(col, row));
		docs.forEach((doc, i) => {
			assertValid(tripFile(col), i, tripDocErrors(col, doc, `[${String(i)}]`));
		});
		files.set(tripFile(col), jsonText(docs));
	}
	return files;
}
