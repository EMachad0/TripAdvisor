// node --test scripts/ownership.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkBranch, globToRegExp, sliceOf, type Ownership } from './ownership.ts';

const rules = JSON.parse(
	fs.readFileSync(path.join(import.meta.dirname, '../docs/migration/ownership.json'), 'utf8'),
) as Ownership;

void test('globs: * stays in a segment, ** spans them, (app) is literal', () => {
	assert.ok(
		globToRegExp('apps/web/src/routes/(app)/places/**').test(
			'apps/web/src/routes/(app)/places/[x]/+page.svelte',
		),
	);
	assert.ok(
		globToRegExp('apps/web/src/routes/(app)/places/**').test(
			'apps/web/src/routes/(app)/places/+page.svelte',
		),
	);
	assert.ok(
		!globToRegExp('apps/web/src/routes/(app)/places/**').test('apps/web/src/routes/app/places/x'),
	);
	assert.ok(globToRegExp('a/*.ts').test('a/b.ts'));
	assert.ok(!globToRegExp('a/*.ts').test('a/b/c.ts'));
	assert.ok(globToRegExp('a/**/c.ts').test('a/c.ts'));
});

void test('every slice in the task 9 table, each branch maps to one slice', () => {
	assert.deepEqual(Object.keys(rules.slices), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'L']);
	assert.equal(sliceOf(rules, 'mig/t9-e'), 'E');
	assert.equal(sliceOf(rules, 'mig/t9-screens/d-places'), 'D');
	assert.equal(sliceOf(rules, 'mig/t9-a-today'), 'A');
	assert.equal(sliceOf(rules, 'mig/t8-web-image'), null);
});

void test('a slice may touch its own paths and its parity doc, nothing else', () => {
	const ok = checkBranch(rules, 'mig/t9-d', [
		'apps/web/src/routes/(app)/places/answers/+page.svelte',
		'apps/web/src/lib/components/shared/AnswerCard.svelte',
		'apps/web/e2e/places.spec.ts',
		'docs/migration/parity/places.md',
	]);
	assert.equal(ok.kind, 'ok');
	const bad = checkBranch(rules, 'mig/t9-d', [
		'apps/web/src/lib/components/shared/PlaceSheet.svelte',
		'apps/web/package.json',
		'apps/web/src/routes/(app)/places/+page.svelte',
	]);
	assert.ok(bad.kind === 'fail');
	assert.deepEqual(bad.outside, [
		'apps/web/src/lib/components/shared/PlaceSheet.svelte',
		'apps/web/package.json',
	]);
});

void test('shared files: integrator only; mig/next and non-mig branches are not checked', () => {
	assert.equal(checkBranch(rules, 'mig/integrator-deps', ['pnpm-lock.yaml']).kind, 'ok');
	assert.equal(checkBranch(rules, 'mig/t8-web-image', ['apps/web/Dockerfile']).kind, 'ok');
	assert.equal(
		checkBranch(rules, 'mig/t8-web-image', ['apps/web/src/convex/schema.ts']).kind,
		'fail',
	);
	assert.equal(checkBranch(rules, 'mig/next', ['pnpm-lock.yaml']).kind, 'unchecked');
	assert.equal(checkBranch(rules, 'answers/2026-11-15-x', ['answers/x.md']).kind, 'unchecked');
});
