// Convex rows <-> v1 file values: the seam @atr/migrate (import, export-v1) and the backend's GET /ops/export share.
// Convex returns document fields sorted by name, nested objects included (spike S14), so the export puts keys back
// in the order the old writers produce:
// - feedback lines: appendEvent's `{v, ts, ...event}` order (FEEDBACK_SPECS field order), `extra` spread back last;
// - trip documents: `id` first, then the dominant order of the real files (legs: per leg type);
// - game-state.json: writeState's {v, firstRun, firstSeen, days, locks}, days in COUNTRY_IDS order.
import { COUNTRY_IDS } from '../schema/enums.ts';
import type { Collection } from '../trip/constants.ts';
import { FEEDBACK_SPECS, type FeedbackKind } from './feedback-specs.ts';
import { isJsonObject, type Json, type JsonObject } from './json.ts';
import { ordered } from './strict.ts';

/** Fields Convex adds to every stored row. */
export const SYSTEM_FIELDS: ReadonlySet<string> = new Set(['_id', '_creationTime']);

/** Listed keys first (when present), then the others in the order they arrive. */
export function orderKeys(source: JsonObject, order: readonly string[]): JsonObject {
	const out: JsonObject = {};
	for (const key of order) {
		const value = source[key];
		if (value !== undefined) out[key] = value;
	}
	for (const [key, value] of Object.entries(source)) if (!(key in out)) out[key] = value;
	return out;
}

/** A copy without the keys in `drop`. */
export function omitKeys(source: JsonObject, drop: ReadonlySet<string>): JsonObject {
	const out: JsonObject = {};
	for (const [key, value] of Object.entries(source)) if (!drop.has(key)) out[key] = value;
	return out;
}

// ---- feedback events --------------------------------------------------------------------------------------------

/** Row fields that never reach a v1 line (`extra` is spread back instead). */
const NOT_IN_LINE: ReadonlySet<string> = new Set([...SYSTEM_FIELDS, 'seq', 'userId', 'extra']);

/** A v1 line as an event-table row: seq = its 1-based line number, `x_*` keys moved into `extra`. */
export function eventToRow(line: JsonObject, seq: number): JsonObject {
	const row: JsonObject = {};
	const extra: JsonObject = {};
	for (const [key, value] of Object.entries(line)) {
		if (key.startsWith('x_')) extra[key] = value;
		else row[key] = value;
	}
	row['seq'] = seq;
	if (Object.keys(extra).length > 0) row['extra'] = extra;
	return row;
}

/** An event-table row as its v1 line value: app-only fields dropped, writer key order, `extra` last. */
export function rowToEvent(kind: FeedbackKind, row: JsonObject): JsonObject {
	const line = ordered(FEEDBACK_SPECS[kind], omitKeys(row, NOT_IN_LINE));
	const out: JsonObject = isJsonObject(line) ? line : {};
	const extra = row['extra'];
	if (isJsonObject(extra)) for (const [key, value] of Object.entries(extra)) out[key] = value;
	return out;
}

/**
 * Line order on export, which is append order in v1: imported rows by seq (their source line), then rows the new
 * app wrote (no seq) by creation time, as if each had been appended when it was written.
 */
export function compareEventRows(a: JsonObject, b: JsonObject): number {
	const seqA = a['seq'];
	const seqB = b['seq'];
	const hasA = typeof seqA === 'number';
	const hasB = typeof seqB === 'number';
	if (hasA && hasB) return seqA - seqB;
	if (hasA !== hasB) return hasA ? -1 : 1;
	return Number(a['_creationTime'] ?? 0) - Number(b['_creationTime'] ?? 0);
}

// ---- trip documents ---------------------------------------------------------------------------------------------

/** Leg time zones come last (they are added after the form fields). */
const TZ = ['tz', 'tzStart', 'tzEnd'] as const;

const STAY_ORDER = [
	'id',
	'type',
	'country',
	'city',
	'title',
	'start',
	'end',
	'status',
	'host',
	'checkIn',
	'checkOut',
	'address',
	'cities',
	'note',
	'order',
	...TZ,
] as const;

const LEG_ORDER: Readonly<Record<string, readonly string[]>> = {
	stay: STAY_ORDER,
	note: STAY_ORDER,
	flight: [
		'id',
		'type',
		'status',
		'cabin',
		'carrier',
		'flight',
		'from',
		'fromName',
		'to',
		'toName',
		'start',
		'end',
		'duration',
		'ref',
		'note',
		'order',
		...TZ,
	],
	transport: [
		'id',
		'type',
		'status',
		'mode',
		'title',
		'start',
		'end',
		'fromName',
		'toName',
		'fromPlace',
		'toPlace',
		'duration',
		'plan',
		'ref',
		'note',
		'order',
		...TZ,
	],
};

/** Key order of each collection's documents: the dominant order in the real files. */
export const TRIP_KEY_ORDER: Readonly<Record<Collection, readonly string[]>> = {
	tasks: ['id', 'parent', 'title', 'suggested', 'status', 'opens', 'due', 'note', 'order', 'done'],
	legs: STAY_ORDER,
	bag: ['id', 'category', 'item', 'note', 'qty', 'packed', 'order'],
	budget: ['id', 'country', 'currency', 'bed', 'food', 'other', 'pay', 'order'],
	fixed: ['id', 'title', 'amount', 'status', 'note', 'order'],
	spend: ['id', 'date', 'note', 'amount', 'currency', 'amountBRL', 'category', 'country', 'order'],
	settings: ['id', 'cap', 'tips'],
	days: ['id', 'status', 'holiday', 'note'],
	visited: ['id', 'at'],
};

function tripKeyOrder(col: Collection, doc: JsonObject): readonly string[] {
	if (col !== 'legs') return TRIP_KEY_ORDER[col];
	const type = doc['type'];
	return (typeof type === 'string' ? LEG_ORDER[type] : undefined) ?? TRIP_KEY_ORDER.legs;
}

/** The one field that keeps an explicit null in the schema. */
const keepsNull = (col: Collection, key: string): boolean => col === 'legs' && key === 'cities';

/** The reader rule of game/lib/tripstore.js: only objects with a string id are documents. */
export function isTripDoc(value: unknown): value is JsonObject {
	return isJsonObject(value) && typeof value['id'] === 'string';
}

export interface TripRow {
	row: JsonObject;
	/** Fields dropped because they were null (writeDoc strips nulls; counted by the dry run). */
	droppedNulls: string[];
}

/** A trip document as a row: null fields dropped, except `legs.cities`. */
export function tripDocToRow(col: Collection, doc: JsonObject): TripRow {
	const row: JsonObject = {};
	const droppedNulls: string[] = [];
	for (const [key, value] of Object.entries(doc)) {
		if (value === null && !keepsNull(col, key)) droppedNulls.push(key);
		else row[key] = value;
	}
	return { row, droppedNulls };
}

/** A trip-table row as its v1 document: system fields dropped, keys in the files' order. */
export function rowToTripDoc(col: Collection, row: JsonObject): JsonObject {
	const doc = omitKeys(row, SYSTEM_FIELDS);
	return orderKeys(doc, tripKeyOrder(col, doc));
}

// ---- game state -------------------------------------------------------------------------------------------------

const STATE_KEY_ORDER = ['v', 'firstRun', 'firstSeen', 'days', 'locks'] as const;
const STATE_KEYS: ReadonlySet<string> = new Set(STATE_KEY_ORDER);

export interface StateRows {
	gameState: JsonObject;
	/** One row per firstSeen key, in file order (row creation order keeps it). */
	firstSeen: JsonObject[];
}

export type StateResult = { ok: true; rows: StateRows } | { ok: false; error: string };

/** game-state.json as the gameState singleton plus firstSeen rows; missing parts default like readState. */
export function stateToRows(value: Json): StateResult {
	if (!isJsonObject(value)) return { ok: false, error: 'game-state.json is not a JSON object' };
	const unknown = Object.keys(value).filter((key) => !STATE_KEYS.has(key));
	if (unknown.length > 0) return { ok: false, error: `unknown field(s): ${unknown.join(', ')}` };
	const firstSeen = value['firstSeen'] ?? {};
	if (!isJsonObject(firstSeen)) return { ok: false, error: 'firstSeen is not an object' };
	const gameState: JsonObject = {
		v: value['v'] ?? 1,
		firstRun: value['firstRun'] ?? null,
		days: value['days'] ?? {},
		locks: value['locks'] ?? {},
	};
	return {
		ok: true,
		rows: {
			gameState,
			firstSeen: Object.entries(firstSeen).map(([key, ts]) => ({ key, ts })),
		},
	};
}

const orderedDays = (days: Json | undefined): Json =>
	isJsonObject(days) ? orderKeys(days, COUNTRY_IDS) : {};

/**
 * The game-state.json value from the singleton row (or null) and the firstSeen rows in creation order.
 * No singleton and no firstSeen rows is the state of a fresh /data: readState's defaults.
 */
export function rowsToState(
	gameState: JsonObject | null,
	firstSeen: readonly JsonObject[],
): JsonObject {
	const base: JsonObject =
		gameState === null
			? { v: 1, firstRun: null, days: {}, locks: {} }
			: omitKeys(gameState, SYSTEM_FIELDS);
	const seen: JsonObject = {};
	for (const row of firstSeen) {
		const key = row['key'];
		const ts = row['ts'];
		if (typeof key === 'string' && ts !== undefined) seen[key] = ts;
	}
	return orderKeys(
		{ ...base, firstSeen: seen, days: orderedDays(base['days']), locks: base['locks'] ?? {} },
		STATE_KEY_ORDER,
	);
}
