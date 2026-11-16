// Small object helpers that copy instead of mutating (no dynamic `delete`).

/** A copy of a record without the given keys. */
export function omitKeys<V>(
	record: Readonly<Record<string, V>>,
	keys: Iterable<string>,
): Record<string, V> {
	const drop = new Set(keys);
	return Object.fromEntries(Object.entries(record).filter(([key]) => !drop.has(key)));
}

/** A copy of a record without the entries whose value is null. */
export function omitNulls<V>(record: Readonly<Record<string, V | null>>): Record<string, V> {
	const out: Record<string, V> = {};
	for (const [key, value] of Object.entries(record)) if (value !== null) out[key] = value;
	return out;
}
