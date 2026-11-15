// The v1 feedback codec: one JSONL line <-> one record. Lines are validated with the same specs and messages as
// the old reader (platform/lib/feedback readJsonl); x_ fields move into `extra` and come back last on export.
// Any other unknown field, or an x_ field nested inside `stops` / `elo`, fails: nothing is dropped silently.
import { check } from '../schema/check.ts';
import { jsString } from '../util.ts';
import { FEEDBACK_SPECS, type FeedbackKind } from './feedback-specs.ts';
import type { FeedbackRecord } from './feedback-types.ts';
import {
	badExtraKeys,
	fail,
	isJsonObject,
	nestedExtraPaths,
	ok,
	splitExtra,
	V1CodecError,
	type Json,
	type JsonObject,
	type Result,
} from './json.ts';
import { ordered, strictTypeErrors } from './strict.ts';

/** Every reason `obj` is not a valid `kind` line, in the old reader's "path: message" form. */
export function feedbackErrors(kind: FeedbackKind, obj: Json): string[] {
	const spec = FEEDBACK_SPECS[kind];
	const errors = check(spec, obj)
		.filter((x) => x.level === 'error')
		.map((x) => `${x.path}: ${x.message}`);
	if (errors.length > 0) return errors;
	return [
		...strictTypeErrors(spec, obj),
		...nestedExtraPaths(obj).map((p) => `${p}: x_ fields are only kept at the top level of a line`),
	];
}

/**
 * The record a validated object stands for. Sound because `feedbackErrors` returned nothing for it: the spec
 * check proved every field's type and the absence of unknown fields, which is what FeedbackRecord<K> states.
 */
function toRecord<K extends FeedbackKind>(kind: K, obj: JsonObject): FeedbackRecord<K> {
	const spec = FEEDBACK_SPECS[kind];
	const { fields, extra } = splitExtra(obj, Object.keys(spec.fields));
	const record = { ...(ordered(spec, fields) as JsonObject), ...(extra ? { extra } : {}) };
	return record as unknown as FeedbackRecord<K>;
}

/** Parse one line of feedback/<kind>.jsonl. */
export function parseFeedbackLine<K extends FeedbackKind>(
	kind: K,
	line: string,
): Result<FeedbackRecord<K>> {
	let obj: Json;
	try {
		obj = JSON.parse(line) as Json;
	} catch (e) {
		const message = e instanceof Error ? e.message : jsString(e);
		return fail([`not valid JSON (${message.split('\n')[0] ?? ''})`]);
	}
	if (isJsonObject(obj) && obj['v'] !== undefined && obj['v'] !== 1)
		return fail([`unsupported version v=${jsString(obj['v'])}`]);
	const errors = feedbackErrors(kind, obj);
	if (errors.length > 0 || !isJsonObject(obj)) return fail(errors);
	return ok(toRecord(kind, obj));
}

/** One line of feedback/<kind>.jsonl (no newline): fields in the old writer's order, then the x_ fields. */
export function serialiseFeedbackLine<K extends FeedbackKind>(
	kind: K,
	record: FeedbackRecord<K>,
): string {
	const { extra, ...fields } = record;
	const bad = badExtraKeys(extra);
	if (bad.length > 0)
		throw new V1CodecError(
			`${kind} record`,
			bad.map((k) => `extra.${k}: not an x_ field`),
		);
	const line = { ...(ordered(FEEDBACK_SPECS[kind], fields as JsonObject) as JsonObject), ...extra };
	const errors = feedbackErrors(kind, line);
	if (errors.length > 0) throw new V1CodecError(`${kind} record`, errors);
	return JSON.stringify(line);
}

export interface ParsedLine<K extends FeedbackKind> {
	/** 1-based line number in the file (the import's `seq`). */
	line: number;
	record: FeedbackRecord<K>;
}

export interface BadLine {
	line: number;
	text: string;
	errors: string[];
}

/** Parse a whole JSONL file. Blank lines are skipped; bad lines are returned with their reasons (quarantine). */
export function parseFeedbackJsonl<K extends FeedbackKind>(
	kind: K,
	text: string,
): { records: ParsedLine<K>[]; bad: BadLine[] } {
	const records: ParsedLine<K>[] = [],
		bad: BadLine[] = [];
	text.split('\n').forEach((raw, i) => {
		if (!raw.trim()) return;
		const r = parseFeedbackLine(kind, raw);
		if (r.ok) records.push({ line: i + 1, record: r.value });
		else bad.push({ line: i + 1, text: raw, errors: r.errors });
	});
	return { records, bad };
}

/** A whole JSONL file: one line per record, each ending in a newline ('' for no records). */
export const serialiseFeedbackJsonl = <K extends FeedbackKind>(
	kind: K,
	records: readonly FeedbackRecord<K>[],
): string => records.map((r) => serialiseFeedbackLine(kind, r) + '\n').join('');
