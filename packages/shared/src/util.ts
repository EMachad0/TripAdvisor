/**
 * `table[key]` for a fixed lookup table, without reaching inherited properties (`toString`, `constructor`).
 * The key is stringified the way a JS property access would (`undefined` looks up "undefined").
 */
export function lookup<V>(table: Readonly<Record<string, V>>, key: unknown): V | undefined {
	const k = String(key);
	return Object.hasOwn(table, k) ? table[k] : undefined;
}

/** Largest of some strings by code-unit order (what `[...].sort().at(-1)` gives). */
export const maxString = (first: string, ...rest: readonly string[]): string =>
	rest.reduce((a, b) => (b > a ? b : a), first);

/** Smallest of some strings by code-unit order (what `[...].sort()[0]` gives). */
export const minString = (first: string, ...rest: readonly string[]): string =>
	rest.reduce((a, b) => (b < a ? b : a), first);

/** `n || 0` for a number that may be missing (NaN and 0 give 0). */
export const orZero = (n: number | null | undefined): number =>
	n === undefined || n === null || Number.isNaN(n) ? 0 : n;

/** `s || fallback` for a string that may be missing or empty. */
export const orStr = <F>(s: string | null | undefined, fallback: F): string | F =>
	s === undefined || s === null || s === '' ? fallback : s;

/** JS truthiness of any value. */
export const truthy = (v: unknown): boolean => Boolean(v);

/** `String(v)` for any value, spelled out so no object is stringified by accident. */
export function jsString(v: unknown): string {
	if (typeof v === 'string') return v;
	if (
		v === null ||
		v === undefined ||
		typeof v === 'number' ||
		typeof v === 'boolean' ||
		typeof v === 'bigint'
	)
		return String(v);
	if (typeof v === 'symbol' || typeof v === 'function' || v instanceof Date) return v.toString();
	if (Array.isArray(v))
		return v.map((x: unknown) => (x === null || x === undefined ? '' : jsString(x))).join(',');
	return '[object Object]';
}
