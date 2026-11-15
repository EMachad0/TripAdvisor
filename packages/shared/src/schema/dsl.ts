// Tiny schema DSL (port of the validation half of platform/lib/schema/dsl.js): specs, `check` with fix-it
// messages, `describe` and `exampleOf`. JSON Schema export and `specAt` stay in the platform.

interface Common {
	readonly desc?: string;
	readonly example?: unknown;
	readonly optional?: boolean;
}
export interface StringSpec extends Common {
	readonly kind: 'string';
	readonly format?: 'url' | 'date' | 'slug';
	readonly markdown?: boolean;
	readonly tel?: boolean;
	readonly min?: number;
	readonly max?: number;
	readonly allowEmpty?: boolean;
	readonly pattern?: RegExp;
	readonly patternHint?: string;
	readonly suggest?: readonly string[];
}
export interface NumberSpec extends Common {
	readonly kind: 'number';
	readonly int?: boolean;
	readonly min?: number;
	readonly max?: number;
}
export interface BooleanSpec extends Common {
	readonly kind: 'boolean';
}
export interface EnumSpec extends Common {
	readonly kind: 'enum';
	readonly values: readonly (string | number)[];
}
export interface ArraySpec extends Common {
	readonly kind: 'array';
	readonly of: Spec;
	readonly min?: number;
	readonly max?: number;
}
export interface ObjectSpec extends Common {
	readonly kind: 'object';
	readonly fields: Readonly<Record<string, Spec>>;
}
export interface TaggedSpec extends Common {
	readonly kind: 'tagged';
	readonly tag: string;
	readonly variants: Readonly<Record<string, ObjectSpec>>;
}
export type Spec =
	StringSpec | NumberSpec | BooleanSpec | EnumSpec | ArraySpec | ObjectSpec | TaggedSpec;

type Opts<S extends Spec> = Omit<S, 'kind'>;

/** A bound or length that the old JS treated as set when truthy (not missing, not 0). */
export const isSet = (n: number | undefined): n is number =>
	n !== undefined && n !== 0 && !Number.isNaN(n);

export const t = {
	string: (o: Opts<StringSpec> = {}): StringSpec => ({ kind: 'string', ...o }),
	markdown: (o: Opts<StringSpec> = {}): StringSpec => ({ kind: 'string', markdown: true, ...o }),
	url: (o: Opts<StringSpec> = {}): StringSpec => ({ kind: 'string', format: 'url', ...o }),
	date: (o: Opts<StringSpec> = {}): StringSpec => ({ kind: 'string', format: 'date', ...o }),
	slug: (o: Opts<StringSpec> = {}): StringSpec => ({ kind: 'string', format: 'slug', ...o }),
	number: (o: Opts<NumberSpec> = {}): NumberSpec => ({ kind: 'number', ...o }),
	int: (o: Opts<NumberSpec> = {}): NumberSpec => ({ kind: 'number', int: true, ...o }),
	boolean: (o: Opts<BooleanSpec> = {}): BooleanSpec => ({ kind: 'boolean', ...o }),
	enum: (
		values: readonly (string | number)[],
		o: Omit<Opts<EnumSpec>, 'values'> = {},
	): EnumSpec => ({
		kind: 'enum',
		values,
		...o,
	}),
	array: (of: Spec, o: Omit<Opts<ArraySpec>, 'of'> = {}): ArraySpec => ({
		kind: 'array',
		of,
		...o,
	}),
	object: (
		fields: Readonly<Record<string, Spec>>,
		o: Omit<Opts<ObjectSpec>, 'fields'> = {},
	): ObjectSpec => ({ kind: 'object', fields, ...o }),
	tagged: (
		tag: string,
		variants: Readonly<Record<string, ObjectSpec>>,
		o: Omit<Opts<TaggedSpec>, 'tag' | 'variants'> = {},
	): TaggedSpec => ({ kind: 'tagged', tag, variants, ...o }),
	opt: <S extends Spec>(spec: S): S => ({ ...spec, optional: true }),
};

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A phone link: tel:+66 2 246 5472 (country code, then 6–15 digits; spaces, dots, dashes, brackets allowed). */
export const TEL_RE = /^tel:\+?(?:[\s().-]*\d){6,15}[\s().-]*$/i;

export function levenshtein(a: unknown, b: unknown): number {
	const s = String(a),
		u = String(b);
	const m = s.length,
		n = u.length;
	if (!m) return n;
	if (!n) return m;
	let prev = Array.from({ length: n + 1 }, (_, i) => i);
	for (let i = 1; i <= m; i++) {
		const cur = [i];
		for (let j = 1; j <= n; j++) {
			const del = (prev[j] ?? 0) + 1,
				ins = (cur[j - 1] ?? 0) + 1,
				sub = (prev[j - 1] ?? 0) + (s[i - 1] === u[j - 1] ? 0 : 1);
			cur[j] = Math.min(del, ins, sub);
		}
		prev = cur;
	}
	return prev[n] ?? 0;
}

/** The option closest to `word` (typo distance), or null when none is close enough. */
export function nearest(word: unknown, options: readonly string[]): string | null {
	const w = String(word)
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	let best: string | null = null,
		bestD = Infinity;
	for (const o of options) {
		const oo = o.toLowerCase().replace(/[\s-]+/g, '_');
		let d = levenshtein(w, oo);
		if (oo.includes(w) || w.includes(oo)) d = Math.min(d, 1.5);
		if (d < bestD) {
			bestD = d;
			best = o;
		}
	}
	const limit = Math.max(2, Math.ceil(String(word).length / 3));
	return bestD <= limit ? best : null;
}

export type PathPart = string | number;

export function joinPath(path: readonly PathPart[]): string {
	let s = '';
	for (const p of path) s += typeof p === 'number' ? `[${String(p)}]` : s ? `.${p}` : p;
	return s || '(root)';
}

/** Human description of what a spec expects. */
export function describe(spec: Spec): string {
	switch (spec.kind) {
		case 'string': {
			if (spec.format === 'url')
				return spec.tel === true
					? 'a full URL starting with https:// (or tel:+<country code><number> for a phone booking)'
					: 'a full URL starting with https:// (or http://)';
			if (spec.format === 'date') return 'a date as YYYY-MM-DD';
			if (spec.format === 'slug')
				return 'a lowercase slug (a-z, 0-9 and single hyphens), e.g. "yu-garden"';
			const parts = [spec.markdown === true ? 'text (Markdown subset allowed)' : 'text'];
			if (isSet(spec.min) && isSet(spec.max))
				parts.push(`${String(spec.min)}–${String(spec.max)} characters`);
			else if (isSet(spec.max)) parts.push(`at most ${String(spec.max)} characters`);
			else if (isSet(spec.min)) parts.push(`at least ${String(spec.min)} characters`);
			if (spec.patternHint !== undefined && spec.patternHint !== '') parts.push(spec.patternHint);
			return parts.join(', ');
		}
		case 'number': {
			const parts = [spec.int === true ? 'a whole number' : 'a number'];
			if (spec.min !== undefined) parts.push(`≥ ${String(spec.min)}`);
			if (spec.max !== undefined) parts.push(`≤ ${String(spec.max)}`);
			return parts.join(' ');
		}
		case 'boolean':
			return 'true or false';
		case 'enum':
			return `one of: ${spec.values.join(' | ')}`;
		case 'array': {
			const n = isSet(spec.min) ? `${String(spec.min)}+ ` : '';
			const max = isSet(spec.max) ? ` (max ${String(spec.max)})` : '';
			return `a list of ${n}${spec.of.kind === 'object' ? 'objects' : describe(spec.of)}${max}`;
		}
		case 'object':
			return `an object with fields: ${Object.entries(spec.fields)
				.map(([k, v]) => (v.optional === true ? `${k}?` : k))
				.join(', ')}`;
		case 'tagged':
			return `an object with \`${spec.tag}\` set to one of: ${Object.keys(spec.variants).join(', ')}`;
	}
}

/** Example value for a spec (explicit example wins; otherwise derived). */
export function exampleOf(spec: Spec, { all = false }: { all?: boolean } = {}): unknown {
	if (spec.example !== undefined) return spec.example;
	switch (spec.kind) {
		case 'string':
			if (spec.format === 'url') return 'https://example.com/page';
			if (spec.format === 'date') return '2026-11-09';
			if (spec.format === 'slug') return 'my-slug';
			return 'text';
		case 'number':
			return spec.min ?? 1;
		case 'boolean':
			return false;
		case 'enum':
			return spec.values[0];
		case 'array':
			return [exampleOf(spec.of, { all })];
		case 'object': {
			const o: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(spec.fields))
				if (all || v.optional !== true) o[k] = exampleOf(v, { all });
			return o;
		}
		case 'tagged': {
			const first = Object.entries(spec.variants)[0];
			if (!first) return null;
			const [name, v] = first;
			const ex = exampleOf(v, { all });
			return { [spec.tag]: name, ...(typeof ex === 'object' && ex !== null ? ex : {}) };
		}
	}
}
