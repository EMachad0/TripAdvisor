// The canonical form of a v1 file (plan section 14, verify): what the old site reads from it, with keys sorted.
// - feedback/*.jsonl: the lines the old reader keeps (valid JSON, passing FEEDBACK_SPECS), in file order;
// - game-state.json: readState's view ({v, firstRun, firstSeen, days, locks} with defaults); a missing file reads
//   as the empty state;
// - trip/*.json: readCollection's view (objects with a string id), null fields dropped (legs.cities keeps null),
//   in file order.
// Two snapshots with equal canonical hashes give the old site the same data.
import { createHash } from 'node:crypto';
import { v1 } from '@atr/shared';
import { oldReaderKeeps } from './feedbackSpecs.ts';
import { isObject, parseJson, sortKeysDeep, type Json } from './json.ts';
import {
	EVENT_KINDS,
	eventFile,
	STATE_FILE,
	TRIP_COLLECTIONS,
	tripFile,
	type EventKind,
	type TripCollection,
} from './tables.ts';
import type { V1Files } from './v1/files.ts';

export interface FileDigest {
	/** Lines (JSONL), documents (trip) or firstSeen keys (game-state) the old site reads. */
	count: number;
	/** sha256 of the canonical form. */
	sha256: string;
	/** sha256 of the file bytes, or null when the file is absent. */
	rawSha256: string | null;
	bytes: number;
}

export type Manifest = Record<string, FileDigest>;

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const canon = (value: Json): string => JSON.stringify(sortKeysDeep(value));

function canonicalEvents(kind: EventKind, text: string): Json[] {
	const out: Json[] = [];
	for (const raw of text.split('\n')) {
		if (raw.trim() === '') continue;
		const parsed = parseJson(raw);
		if (parsed.ok && isObject(parsed.value) && oldReaderKeeps(kind, parsed.value))
			out.push(parsed.value);
	}
	return out;
}

function canonicalState(text: string | undefined): { value: Json; count: number } {
	const parsed = text === undefined ? null : parseJson(text);
	const s = parsed?.ok === true && isObject(parsed.value) ? parsed.value : {};
	const part = (key: string): Json => (isObject(s[key]) ? s[key] : {});
	const firstSeen = part('firstSeen');
	const value = { v: 1, firstRun: null, ...s, firstSeen, days: part('days'), locks: part('locks') };
	return { value, count: isObject(firstSeen) ? Object.keys(firstSeen).length : 0 };
}

function canonicalTrip(col: TripCollection, text: string): Json[] {
	const parsed = parseJson(text);
	if (!parsed.ok || !Array.isArray(parsed.value)) return [];
	return parsed.value.filter(v1.isTripDoc).map((doc) => v1.tripDocToRow(col, doc).row);
}

function digest(items: { value: Json; count: number }, text: string | undefined): FileDigest {
	return {
		count: items.count,
		sha256: sha256(canon(items.value)),
		rawSha256: text === undefined ? null : sha256(text),
		bytes: text === undefined ? 0 : Buffer.byteLength(text, 'utf8'),
	};
}

/** Canonical digests of every v1 file (absent files digest as empty). */
export function manifestOf(files: V1Files): Manifest {
	const out: Manifest = {};
	for (const kind of EVENT_KINDS) {
		const text = files.get(eventFile(kind));
		const lines = text === undefined ? [] : canonicalEvents(kind, text);
		out[eventFile(kind)] = digest({ value: lines, count: lines.length }, text);
	}
	const stateText = files.get(STATE_FILE);
	out[STATE_FILE] = digest(canonicalState(stateText), stateText);
	for (const col of TRIP_COLLECTIONS) {
		const text = files.get(tripFile(col));
		const docs = text === undefined ? [] : canonicalTrip(col, text);
		out[tripFile(col)] = digest({ value: docs, count: docs.length }, text);
	}
	return out;
}
