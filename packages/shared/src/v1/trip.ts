// The v1 codec for trip/<collection>.json: a JSON array of documents, each with a string `id`.
// Parsing follows the old store (game/lib/tripstore.js) where it is lenient on purpose: documents with no string
// id are dropped (and counted), and a null field means "absent" (writeDoc strips nulls on update), except
// `legs.cities`, where null is kept. Unlike the old reader it never swallows a broken file or an unknown field.
import { jsString } from '../util.ts';
import type { Collection } from '../trip/constants.ts';
import {
	badExtraKeys,
	fail,
	isJsonObject,
	ok,
	splitExtra,
	V1CodecError,
	type Json,
	type JsonObject,
	type Result,
} from './json.ts';
import { TRIP_FIELDS, type FieldKind, type TripRecord } from './trip-types.ts';

const fieldsOf = (col: Collection): Readonly<Record<string, FieldKind>> => TRIP_FIELDS[col];

function fitsKind(kind: FieldKind, v: Json): boolean {
	switch (kind) {
		case 'string':
			return typeof v === 'string';
		case 'number':
			return typeof v === 'number';
		case 'boolean':
			return typeof v === 'boolean';
		case 'numberOrString':
			return typeof v === 'number' || typeof v === 'string';
		case 'cities':
			return v === null || (Array.isArray(v) && v.every((x) => typeof x === 'string'));
		default:
			return typeof v === 'string' && kind.enum.includes(v);
	}
}

const describeKind = (kind: FieldKind): string =>
	typeof kind === 'string'
		? {
				string: 'text',
				number: 'a number',
				boolean: 'true or false',
				numberOrString: 'a number or text',
				cities: 'a list of city ids or null',
			}[kind]
		: `one of: ${kind.enum.map((x) => JSON.stringify(x)).join(' | ')}`;

/** Type and unknown-field errors of one document's fields (id and x_ fields excluded). */
function fieldErrors(col: Collection, where: string, fields: JsonObject): string[] {
	const spec = fieldsOf(col);
	return Object.entries(fields).flatMap(([k, v]) => {
		const kind = Object.hasOwn(spec, k) ? spec[k] : undefined;
		if (kind === undefined) return [`${where}.${k}: unknown field`];
		return fitsKind(kind, v)
			? []
			: [`${where}.${k}: expected ${describeKind(kind)} but got ${JSON.stringify(v)}`];
	});
}

/** Every reason one document is not valid in trip/<col>.json (an empty list when it is), "[i].field: …" style. */
export function tripDocErrors(col: Collection, doc: JsonObject, where = '(doc)'): string[] {
	const { fields, unknown } = splitExtra(doc, ['id', ...Object.keys(fieldsOf(col))]);
	const { id, ...rest } = fields;
	return [
		...(typeof id === 'string' && id !== '' ? [] : [`${where}.id: expected text`]),
		...unknown.map((k) => `${where}.${k}: unknown field`),
		...fieldErrors(col, where, rest),
	];
}

export interface ParsedTripFile<C extends Collection> {
	docs: TripRecord<C>[];
	/** Elements dropped for having no string id (the old reader skips them too). */
	dropped: number;
	/** Fields that held null and were dropped as absent ("[3].note"). */
	nulls: string[];
}

/** Parse trip/<col>.json. */
export function parseTripFile<C extends Collection>(
	col: C,
	text: string,
): Result<ParsedTripFile<C>> {
	let raw: Json;
	try {
		raw = JSON.parse(text) as Json;
	} catch (e) {
		return fail([`not valid JSON (${e instanceof Error ? e.message : jsString(e)})`]);
	}
	if (!Array.isArray(raw)) return fail(['(root): expected a list of documents']);
	const docs: TripRecord<C>[] = [],
		nulls: string[] = [],
		errors: string[] = [];
	let dropped = 0;
	raw.forEach((el, i) => {
		const where = `[${String(i)}]`;
		if (!isJsonObject(el) || typeof el['id'] !== 'string') {
			dropped++;
			return;
		}
		const { fields, extra, unknown } = splitExtra(el, ['id', ...Object.keys(fieldsOf(col))]);
		errors.push(...unknown.map((k) => `${where}.${k}: unknown field`));
		const kept: JsonObject = {};
		for (const [k, v] of Object.entries(fields))
			if (v === null && !(col === 'legs' && k === 'cities')) nulls.push(`${where}.${k}`);
			else kept[k] = v;
		const { id, ...rest } = kept;
		errors.push(...fieldErrors(col, where, rest));
		// Sound once fieldErrors is empty: every field is one TRIP_FIELDS lists, with the type it states.
		docs.push({ id, ...rest, ...(extra ? { extra } : {}) } as unknown as TripRecord<C>);
	});
	return errors.length > 0 ? fail(errors) : ok({ docs, dropped, nulls });
}

/** trip/<col>.json as the old store writes it: id first, two-space indent, trailing newline. */
export function serialiseTripFile<C extends Collection>(
	col: C,
	docs: readonly TripRecord<C>[],
): string {
	const errors: string[] = [];
	const out = docs.map((doc, i) => {
		const where = `[${String(i)}]`;
		const { id, extra, ...fields } = doc;
		const plain = fields as JsonObject;
		errors.push(
			...badExtraKeys(extra).map((k) => `${where}.extra.${k}: not an x_ field`),
			...fieldErrors(col, where, plain),
		);
		if (typeof id !== 'string' || id === '') errors.push(`${where}.id: expected text`);
		return { id, ...plain, ...extra };
	});
	if (errors.length > 0) throw new V1CodecError(`${col} documents`, errors);
	return JSON.stringify(out, null, 2) + '\n';
}
