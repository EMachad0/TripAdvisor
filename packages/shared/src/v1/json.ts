// JSON values and the `extra` bag that carries a v1 line's x_ fields through the new stack unchanged.

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonObject = Record<string, Json>;

/** x_-prefixed fields of a v1 record, exported back as they were. */
export type Extra = JsonObject;

export const isJsonObject = (v: unknown): v is JsonObject =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T>(errors: string[]): Result<T> => ({ ok: false, errors });

/** Thrown by a serialiser handed a record that would not make a valid v1 file. */
export class V1CodecError extends Error {
	override readonly name = 'V1CodecError';
	readonly errors: readonly string[];
	constructor(what: string, errors: readonly string[]) {
		super(`invalid ${what}: ${errors.join('; ')}`);
		this.errors = errors;
	}
}

/**
 * Split an object into its known fields and its x_ fields (in their original order).
 * `unknown` lists every other key, which the caller turns into errors.
 */
export function splitExtra(
	obj: JsonObject,
	known: readonly string[],
): { fields: JsonObject; extra: Extra | undefined; unknown: string[] } {
	const fields: JsonObject = {},
		extra: Extra = {},
		unknown: string[] = [];
	for (const [k, v] of Object.entries(obj)) {
		if (known.includes(k)) fields[k] = v;
		else if (k.startsWith('x_')) extra[k] = v;
		else unknown.push(k);
	}
	return { fields, extra: Object.keys(extra).length > 0 ? extra : undefined, unknown };
}

/** The extra keys that are not x_ fields (a record built by hand can carry anything). */
export const badExtraKeys = (extra: Extra | undefined): string[] =>
	Object.keys(extra ?? {}).filter((k) => !k.startsWith('x_'));

/** Paths of x_ keys nested below the top level (the schema keeps x_ fields only at the top). */
export function nestedExtraPaths(v: Json, path = ''): string[] {
	if (Array.isArray(v)) return v.flatMap((x, i) => nestedExtraPaths(x, `${path}[${String(i)}]`));
	if (!isJsonObject(v)) return [];
	return Object.entries(v).flatMap(([k, x]) => {
		const p = path ? `${path}.${k}` : k;
		return (path && k.startsWith('x_') ? [p] : []).concat(nestedExtraPaths(x, p));
	});
}
