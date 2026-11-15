// src/ is imported by the browser bundle and by the Convex runtime: no Node built-ins, no Node or DOM globals.
// (tsconfig.json also compiles src/ with no ambient types, so a Node or DOM global does not even type-check.)
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

const SRC = path.join(import.meta.dirname, '../src');
const files = (dir: string): string[] =>
	fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		return e.isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
	});

const FORBIDDEN = [
	/from ['"]node:/,
	/from ['"](fs|path|os|url|crypto|child_process|http|https|stream|buffer|util)['"]/,
	/\bimport\(/,
	/\brequire\(/,
	/\bprocess\./,
	/\bBuffer\b/,
	/\b__dirname\b/,
	/\bimport\.meta\b/,
	/\b(window|document|localStorage|navigator)\./,
];

test('no module under src/ reaches for Node or the DOM', () => {
	const found = files(SRC).flatMap((f) => {
		const text = fs.readFileSync(f, 'utf8');
		return FORBIDDEN.filter((re) => re.test(text)).map(
			(re) => `${path.relative(SRC, f)}: ${String(re)}`,
		);
	});
	expect(files(SRC).length).toBeGreaterThan(20);
	expect(found).toEqual([]);
});

test('every relative import names a .ts file that exists', () => {
	const bad = files(SRC).flatMap((f) =>
		[...fs.readFileSync(f, 'utf8').matchAll(/from '(\.[^']+)'/g)]
			.map((m) => m[1] ?? '')
			.filter(
				(spec) => !spec.endsWith('.ts') || !fs.existsSync(path.resolve(path.dirname(f), spec)),
			)
			.map((spec) => `${path.relative(SRC, f)}: ${spec}`),
	);
	expect(bad).toEqual([]);
});
