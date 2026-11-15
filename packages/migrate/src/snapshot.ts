// Parse and validate a v1 snapshot into the rows each Convex table will hold (plan section 14, import step 1).
// Every line or document goes through the @atr/shared v1 feedback check (feedback only) and then the table's Convex validator; what
// fails either goes to the quarantine with the reason and the raw text. Nothing is dropped silently: trip docs
// without a string id (which the old reader ignores) and null fields are counted.
import { v1 } from '@atr/shared';
import { lineErrors } from './feedbackSpecs.ts';
import { isObject, parseJson, type JsonObject } from './json.ts';
import { validatorErrors, type TableValidators } from './schema.ts';
import {
	DATA_TABLES,
	EVENT_KINDS,
	EVENT_TABLES,
	eventFile,
	STATE_FILE,
	TRIP_COLLECTIONS,
	TRIP_TABLES,
	tripFile,
	type DataTable,
} from './tables.ts';
import type { V1Files } from './v1/files.ts';

export interface QuarantineEntry {
	file: string;
	/** 1-based line (JSONL) or array position (trip); null when the whole file is unusable. */
	line: number | null;
	reason: string;
	raw: string;
}

export interface Snapshot {
	rows: ReadonlyMap<DataTable, readonly JsonObject[]>;
	quarantine: readonly QuarantineEntry[];
	/** Trip docs without a string id, per file (the old reader skips them too). */
	droppedNoId: Readonly<Record<string, number>>;
	/** Null fields dropped from trip docs, per file. */
	droppedNulls: Readonly<Record<string, number>>;
}

class Builder {
	readonly rows = new Map<DataTable, JsonObject[]>(DATA_TABLES.map((t) => [t, []]));
	readonly quarantine: QuarantineEntry[] = [];
	readonly droppedNoId: Record<string, number> = {};
	readonly droppedNulls: Record<string, number> = {};

	private readonly validators: TableValidators;

	constructor(validators: TableValidators) {
		this.validators = validators;
	}

	/** Adds the row when it fits the table, else quarantines it. Returns whether it was added. */
	add(table: DataTable, row: JsonObject, where: Omit<QuarantineEntry, 'reason'>): boolean {
		const validator = this.validators.get(table);
		const errors =
			validator === undefined
				? [`no table ${table} in the schema`]
				: validatorErrors(validator, row);
		if (errors.length > 0) {
			this.reject({ ...where, reason: `${table}: ${errors.join('; ')}` });
			return false;
		}
		this.rows.get(table)?.push(row);
		return true;
	}

	reject(entry: QuarantineEntry): void {
		this.quarantine.push(entry);
	}

	count(map: Record<string, number>, file: string, n = 1): void {
		map[file] = (map[file] ?? 0) + n;
	}
}

function parseEvents(b: Builder, files: V1Files): void {
	for (const kind of EVENT_KINDS) {
		const file = eventFile(kind);
		const text = files.get(file);
		if (text === undefined) continue;
		for (const [i, raw] of text.split('\n').entries()) {
			if (raw.trim() === '') continue;
			const where = { file, line: i + 1, raw };
			const parsed = parseJson(raw);
			const reason = !parsed.ok
				? `not valid JSON (${parsed.error})`
				: !isObject(parsed.value)
					? 'not a JSON object'
					: lineErrors(kind, parsed.value).join('; ');
			if (parsed.ok && isObject(parsed.value) && reason === '') {
				b.add(EVENT_TABLES[kind], v1.eventToRow(parsed.value, where.line), where);
			} else {
				b.reject({ ...where, reason });
			}
		}
	}
}

function parseState(b: Builder, files: V1Files): void {
	const text = files.get(STATE_FILE);
	if (text === undefined) return;
	const where = { file: STATE_FILE, line: null, raw: text };
	const parsed = parseJson(text);
	const state = parsed.ok
		? v1.stateToRows(parsed.value)
		: { ok: false as const, error: `not valid JSON (${parsed.error})` };
	if (!state.ok) {
		b.reject({ ...where, reason: state.error });
		return;
	}
	if (!b.add('gameState', state.rows.gameState, where)) return;
	for (const row of state.rows.firstSeen)
		b.add('firstSeen', row, { ...where, raw: JSON.stringify(row) });
}

function parseTrip(b: Builder, files: V1Files): void {
	for (const col of TRIP_COLLECTIONS) {
		const file = tripFile(col);
		const text = files.get(file);
		if (text === undefined) continue;
		const parsed = parseJson(text);
		if (!parsed.ok) {
			b.reject({ file, line: null, raw: text, reason: `not valid JSON (${parsed.error})` });
			continue;
		}
		if (!Array.isArray(parsed.value)) {
			b.reject({ file, line: null, raw: text, reason: 'not a JSON array' });
			continue;
		}
		for (const [i, doc] of parsed.value.entries()) {
			if (!v1.isTripDoc(doc)) {
				b.count(b.droppedNoId, file);
				continue;
			}
			const { row, droppedNulls } = v1.tripDocToRow(col, doc);
			if (droppedNulls.length > 0) b.count(b.droppedNulls, file, droppedNulls.length);
			b.add(TRIP_TABLES[col], row, { file, line: i + 1, raw: JSON.stringify(doc) });
		}
	}
}

export function parseSnapshot(files: V1Files, validators: TableValidators): Snapshot {
	const b = new Builder(validators);
	parseEvents(b, files);
	parseState(b, files);
	parseTrip(b, files);
	return {
		rows: b.rows,
		quarantine: b.quarantine,
		droppedNoId: b.droppedNoId,
		droppedNulls: b.droppedNulls,
	};
}

/** Row count per table, in load order (zero for a table with no rows). */
export function tableCounts(
	rows: ReadonlyMap<DataTable, readonly JsonObject[]>,
): Map<DataTable, number> {
	return new Map(DATA_TABLES.map((table) => [table, rows.get(table)?.length ?? 0]));
}
