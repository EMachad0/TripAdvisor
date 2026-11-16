// `check`: validate a value against a spec with fix-it messages (port of platform/lib/schema/dsl.js `check`).
// Messages, paths and examples are byte-identical to the old validator; the parity tests compare them.
import {
	DATE_RE,
	describe,
	exampleOf,
	isSet,
	joinPath,
	nearest,
	SLUG_RE,
	TEL_RE,
	type ObjectSpec,
	type PathPart,
	type Spec,
	type TaggedSpec,
} from './dsl.ts';
import { jsString } from '../util.ts';

export interface Issue {
	level: 'error' | 'warning';
	path: string;
	pathArr: PathPart[];
	message: string;
	expected: string;
	example: unknown;
	hint?: string;
}

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

function show(v: unknown): string {
	if (v === null) return 'null';
	if (v === undefined) return 'nothing';
	if (typeof v === 'string') return JSON.stringify(v.length > 60 ? v.slice(0, 57) + '...' : v);
	if (Array.isArray(v)) return `a list (${String(v.length)} items)`;
	if (typeof v === 'object') return 'an object';
	if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
	if (typeof v === 'symbol') return v.toString();
	// A function: never in parsed JSON or YAML (the old code printed its source).
	return typeof v;
}

function typeName(v: unknown): string {
	if (v === null) return 'null';
	if (Array.isArray(v)) return 'a list';
	return typeof v === 'object' ? 'an object' : typeof v;
}

type Extra = Partial<Pick<Issue, 'example' | 'hint'>>;

/**
 * Validate `value` against `spec`. Pushes issues into `issues` and returns it:
 * { level: 'error'|'warning', path, pathArr, message, expected, example, hint? }
 */
export function check(
	spec: Spec,
	value: unknown,
	path: readonly PathPart[] = [],
	issues: Issue[] = [],
): Issue[] {
	const err = (message: string, extra: Extra = {}): void => {
		issues.push({
			level: 'error',
			path: joinPath(path),
			pathArr: [...path],
			message,
			expected: describe(spec),
			example: exampleOf(spec),
			...extra,
		});
	};

	if (value === undefined || value === null) {
		if (spec.optional !== true)
			err(`missing required field${path.length ? ` \`${String(path[path.length - 1])}\`` : ''}`);
		return issues;
	}

	switch (spec.kind) {
		case 'string': {
			let raw = value;
			if (raw instanceof Date) raw = raw.toISOString().slice(0, 10);
			if (typeof raw === 'number' && spec.format === undefined) raw = String(raw);
			if (typeof raw !== 'string') {
				err(`expected text but got ${typeName(raw)} ${show(raw)}`);
				break;
			}
			const v = raw.trim();
			if (!v && spec.optional !== true && spec.allowEmpty !== true) {
				err('is empty');
				break;
			}
			if (
				spec.format === 'url' &&
				!/^https?:\/\/[^\s]+\.[^\s]+/.test(v) &&
				!(spec.tel === true && TEL_RE.test(v))
			)
				err(
					`${show(v)} is not a full URL${spec.tel === true && /^tel:/i.test(v) ? ' or phone link (tel:+ then 6–15 digits; spaces and dashes are fine)' : ''}`,
				);
			else if (spec.format === 'date') {
				if (!DATE_RE.test(v) || isNaN(Date.parse(v + 'T00:00:00Z')))
					err(`${show(v)} is not a valid date`);
			} else if (spec.format === 'slug' && !SLUG_RE.test(v)) {
				const fixed = v
					.toLowerCase()
					.normalize('NFKD')
					.replace(/[̀-ͯ]/g, '')
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-|-$/g, '');
				err(`${show(v)} is not a valid slug`, { example: fixed || exampleOf(spec) });
			}
			if (isSet(spec.max) && v.length > spec.max)
				err(`is ${String(v.length)} characters, too long (max ${String(spec.max)})`, {
					hint: `shorten it by ${String(v.length - spec.max)} characters`,
				});
			if (isSet(spec.min) && v.length < spec.min)
				err(`is ${String(v.length)} characters, too short (min ${String(spec.min)})`);
			if (spec.pattern && !spec.pattern.test(v)) {
				const near = spec.suggest ? nearest(v, spec.suggest) : null;
				err(
					`${show(v)} has the wrong format${near !== null ? `. Did you mean "${near}"?` : ''}`,
					near !== null ? { example: near } : {},
				);
			}
			if (spec.markdown === true && /<\/?[a-z][^>]*>/i.test(v))
				issues.push({
					level: 'warning',
					path: joinPath(path),
					pathArr: [...path],
					message: 'contains HTML tags; raw HTML is escaped and will show as text',
					expected: 'Markdown subset: **bold**, *italic*, [link](https://...), "- " lists',
					example: '**Go early** — the queue builds by 10:00.',
				});
			break;
		}
		case 'number': {
			if (
				typeof value === 'string' &&
				value.trim() !== '' &&
				!isNaN(Number(value.replace(/,/g, '')))
			) {
				err(`${show(value)} is text; write the number without quotes`, {
					example: Number(value.replace(/,/g, '')),
				});
				break;
			}
			if (typeof value !== 'number' || !Number.isFinite(value)) {
				err(`expected a number but got ${typeName(value)} ${show(value)}`);
				break;
			}
			if (spec.int === true && !Number.isInteger(value))
				err(`${String(value)} must be a whole number`);
			if (spec.min !== undefined && value < spec.min)
				err(`${String(value)} is below the minimum ${String(spec.min)}`);
			if (spec.max !== undefined && value > spec.max)
				err(`${String(value)} is above the maximum ${String(spec.max)}`);
			break;
		}
		case 'boolean':
			if (typeof value !== 'boolean')
				err(`expected true or false but got ${show(value)}`, {
					example: /^(yes|y|true|1)$/i.test(jsString(value)),
				});
			break;
		case 'enum': {
			if (!spec.values.some((x) => x === value)) {
				const near = nearest(value, spec.values.map(String));
				err(
					`${show(value)} is not an allowed value${near !== null ? `. Did you mean "${near}"?` : ''}`,
					near !== null ? { example: near } : {},
				);
			}
			break;
		}
		case 'array': {
			if (!Array.isArray(value)) {
				err(`expected a list but got ${typeName(value)}`, {
					hint: 'in YAML a list item starts with "- "',
				});
				break;
			}
			const items: readonly unknown[] = value;
			if (isSet(spec.min) && items.length < spec.min)
				err(`has ${String(items.length)} item(s), needs at least ${String(spec.min)}`);
			if (isSet(spec.max) && items.length > spec.max)
				err(`has ${String(items.length)} items, at most ${String(spec.max)} allowed`);
			items.forEach((item, i) => check(spec.of, item, [...path, i], issues));
			break;
		}
		case 'object': {
			if (!isRecord(value)) {
				err(`expected an object (key: value pairs) but got ${typeName(value)} ${show(value)}`);
				break;
			}
			checkFields(spec, value, path, issues, []);
			break;
		}
		case 'tagged':
			checkTagged(spec, value, path, issues, err);
			break;
	}
	return issues;
}

function checkTagged(
	spec: TaggedSpec,
	value: unknown,
	path: readonly PathPart[],
	issues: Issue[],
	err: (message: string) => void,
): void {
	if (!isRecord(value)) {
		err(`expected an object but got ${typeName(value)}`);
		return;
	}
	const names = Object.keys(spec.variants);
	const tag = value[spec.tag];
	if (tag === undefined) {
		err(`missing \`${spec.tag}\`. Valid ${spec.tag}s: ${names.join(', ')}`);
		return;
	}
	const key = jsString(tag);
	const variant = Object.hasOwn(spec.variants, key) ? spec.variants[key] : undefined;
	if (!variant) {
		const near = nearest(tag, names);
		issues.push({
			level: 'error',
			path: joinPath([...path, spec.tag]),
			pathArr: [...path, spec.tag],
			message: `unknown ${spec.tag} ${show(tag)}${near !== null ? `. Did you mean "${near}"?` : ''}`,
			expected: `one of: ${names.join(', ')}`,
			example: near ?? names[0],
			hint: `run \`./atr blocks${near !== null ? ' ' + near : ''}\` to see each block's YAML shape`,
		});
		return;
	}
	checkFields(variant, value, path, issues, [spec.tag]);
}

function checkFields(
	spec: ObjectSpec,
	value: Readonly<Record<string, unknown>>,
	path: readonly PathPart[],
	issues: Issue[],
	extraAllowed: readonly string[],
): void {
	const known = Object.keys(spec.fields);
	for (const [k, f] of Object.entries(spec.fields)) check(f, value[k], [...path, k], issues);
	for (const k of Object.keys(value)) {
		if (known.includes(k) || extraAllowed.includes(k) || k.startsWith('x_')) continue;
		const near = nearest(k, known);
		const nearSpec = near !== null ? spec.fields[near] : undefined;
		issues.push({
			level: 'error',
			path: joinPath([...path, k]),
			pathArr: [...path, k],
			message: `unknown field \`${k}\`${near !== null ? `. Did you mean \`${near}\`?` : ''}`,
			expected: `fields allowed here: ${known.join(', ')}`,
			example: near !== null && nearSpec ? { [near]: exampleOf(nearSpec) } : undefined,
			hint: 'prefix a key with x_ if you really need a private note field',
		});
	}
}
