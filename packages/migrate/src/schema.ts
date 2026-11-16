// The Convex schema (apps/web/src/convex/schema.ts) as the second validation gate of the import, after
// FEEDBACK_SPECS. It is loaded at runtime rather than imported statically: the app's sources use bundler-style
// extensionless imports, which this package's NodeNext typecheck must not follow (bin.ts resolves them for node).
import type { GenericValidator } from 'convex/values';
import { isObject, prop, type Json } from './json.ts';

export type TableValidators = ReadonlyMap<string, GenericValidator>;

export const SCHEMA_URL = new URL('../../../apps/web/src/convex/schema.ts', import.meta.url);

const KINDS: ReadonlySet<string> = new Set([
	'id',
	'string',
	'float64',
	'int64',
	'boolean',
	'null',
	'any',
	'literal',
	'bytes',
	'object',
	'array',
	'record',
	'union',
	'commitTs',
	'function',
]);

/** A Convex validator by shape (convex/values does not export its own isValidator from the package root). */
function isValidator(value: unknown): value is GenericValidator {
	const kind = prop(value, 'kind');
	const optional = prop(value, 'isOptional');
	return (
		typeof kind === 'string' &&
		KINDS.has(kind) &&
		(optional === 'optional' || optional === 'required')
	);
}

export async function loadTableValidators(url: URL = SCHEMA_URL): Promise<TableValidators> {
	const mod: unknown = await import(url.href);
	const tables = prop(prop(mod, 'default'), 'tables');
	if (typeof tables !== 'object' || tables === null)
		throw new Error(`no schema tables in ${url.pathname}`);
	const out = new Map<string, GenericValidator>();
	for (const [name, table] of Object.entries(tables)) {
		const validator = prop(table, 'validator');
		if (!isValidator(validator)) throw new Error(`table ${name} has no document validator`);
		out.set(name, validator);
	}
	return out;
}

const describe = (value: Json): string =>
	value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

/** Every way `value` breaks `validator`, as "path: message" strings. Mirrors Convex's own document check. */
export function validatorErrors(
	validator: GenericValidator,
	value: Json | undefined,
	path = '$',
): string[] {
	if (value === undefined) return validator.isOptional === 'optional' ? [] : [`${path}: missing`];
	const bad = (expected: string): string[] => [
		`${path}: expected ${expected}, got ${describe(value)}`,
	];
	switch (validator.kind) {
		case 'string':
		case 'id':
			return typeof value === 'string' ? [] : bad('string');
		case 'float64':
			return typeof value === 'number' ? [] : bad('number');
		case 'boolean':
			return typeof value === 'boolean' ? [] : bad('boolean');
		case 'null':
			return value === null ? [] : bad('null');
		case 'any':
			return [];
		case 'literal': {
			const literal: unknown = validator.value;
			return value === literal ? [] : bad(JSON.stringify(literal));
		}
		case 'object': {
			if (!isObject(value)) return bad('object');
			const errors = Object.entries(validator.fields).flatMap(([key, field]) =>
				validatorErrors(field, value[key], `${path}.${key}`),
			);
			for (const key of Object.keys(value))
				if (!(key in validator.fields)) errors.push(`${path}.${key}: unknown field`);
			return errors;
		}
		case 'array':
			return Array.isArray(value)
				? value.flatMap((item, i) =>
						validatorErrors(validator.element, item, `${path}[${String(i)}]`),
					)
				: bad('array');
		case 'record':
			return isObject(value)
				? Object.entries(value).flatMap(([key, item]) => [
						...validatorErrors(validator.key, key, `${path}{${key}}`),
						...validatorErrors(validator.value, item, `${path}.${key}`),
					])
				: bad('object');
		case 'union':
			return validator.members.some((member) => validatorErrors(member, value, path).length === 0)
				? []
				: bad(
						`one of ${validator.members.map((m) => (m.kind === 'literal' ? JSON.stringify(m.value) : m.kind)).join(' | ')}`,
					);
		case 'int64':
		case 'bytes':
		case 'commitTs':
		case 'function':
			return [`${path}: ${validator.kind} cannot come from a v1 file`];
	}
}
