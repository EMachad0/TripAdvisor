// JSON value types (the shared v1 codec's) plus the narrowing and hashing helpers this package needs.
import type { Json, JsonObject } from '@atr/shared/v1';

export type { Json, JsonObject };

export function isObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON.parse that reports failure as a message instead of throwing. */
export function parseJson(text: string): { ok: true; value: Json } | { ok: false; error: string } {
	try {
		return { ok: true, value: JSON.parse(text) as Json };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? (error.message.split('\n')[0] ?? '') : 'bad JSON',
		};
	}
}

/** A copy of `value` with object keys sorted at every depth: the canonical form used for hashing. */
export function sortKeysDeep(value: Json): Json {
	if (Array.isArray(value)) return value.map(sortKeysDeep);
	if (!isObject(value)) return value;
	const out: JsonObject = {};
	for (const key of Object.keys(value).sort()) {
		const inner = value[key];
		if (inner !== undefined) out[key] = sortKeysDeep(inner);
	}
	return out;
}

/** A property of a value of unknown shape (a loaded module, an error), or undefined. */
export function prop(value: unknown, key: string): unknown {
	return typeof value === 'object' && value !== null
		? (Reflect.get(value, key) as unknown)
		: undefined;
}
