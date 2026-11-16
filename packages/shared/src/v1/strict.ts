// Spec-driven helpers the codecs share: the type checks `check` is lenient about, and key ordering.
import type { Spec } from '../schema/dsl.ts';
import { isJsonObject, type Json, type JsonObject } from './json.ts';

/**
 * Type errors `check` lets through because the curator files are hand-written YAML: a number where text is
 * expected is accepted there (and turned into text by the YAML readers). A v1 line must round-trip exactly,
 * so here text fields must hold text.
 */
export function strictTypeErrors(spec: Spec, value: Json | undefined, path = '(root)'): string[] {
	if (value === undefined || value === null) return [];
	const at = (k: string | number): string =>
		typeof k === 'number'
			? `${path === '(root)' ? '' : path}[${String(k)}]`
			: path === '(root)'
				? k
				: `${path}.${k}`;
	switch (spec.kind) {
		case 'string':
			return typeof value === 'string' ? [] : [`${path}: expected text but got ${typeof value}`];
		case 'array':
			return Array.isArray(value)
				? value.flatMap((x, i) => strictTypeErrors(spec.of, x, at(i)))
				: [];
		case 'object':
			return isJsonObject(value)
				? Object.entries(spec.fields).flatMap(([k, f]) => strictTypeErrors(f, value[k], at(k)))
				: [];
		case 'number':
		case 'boolean':
		case 'enum':
		case 'tagged':
			return [];
	}
}

/** The value with every object's keys in spec field order (unknown keys last, as found). */
export function ordered(spec: Spec, value: Json): Json {
	if (spec.kind === 'array' && Array.isArray(value)) return value.map((x) => ordered(spec.of, x));
	if (spec.kind !== 'object' || !isJsonObject(value)) return value;
	const out: JsonObject = {};
	for (const [k, f] of Object.entries(spec.fields)) {
		const v = value[k];
		if (v !== undefined) out[k] = ordered(f, v);
	}
	for (const [k, v] of Object.entries(value)) if (!(k in out)) out[k] = v;
	return out;
}
