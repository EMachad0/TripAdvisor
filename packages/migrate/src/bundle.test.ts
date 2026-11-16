import path from 'node:path';
import { bundleProblems } from '@atr/platform/lib/feedback/pull.js';
import { expect, test } from 'vitest';
import { toBundle } from './bundle.ts';
import { readV1Dir } from './v1/files.ts';

test('the bundle export-v1 writes is one ./atr feedback pull accepts', async () => {
	const files = await readV1Dir(path.resolve(import.meta.dirname, '../fixtures/e2e'));
	const bundle = await toBundle(files, new Date('2026-11-15T12:00:00.123Z'));
	expect(bundle.generatedAt).toBe('2026-11-15T12:00:00Z');
	expect(Object.keys(bundle.files)).toHaveLength(15);
	expect(bundle.files['feedback/swipes.jsonl']?.count).toBe(17);
	expect(bundleProblems(JSON.parse(JSON.stringify(bundle)))).toEqual([]);
	const tampered = structuredClone(bundle);
	const notes = tampered.files['feedback/notes.jsonl'];
	if (notes !== undefined) notes.content += '{}\n';
	expect(bundleProblems(tampered)).toEqual([
		'feedback/notes.jsonl: sha256 does not match the manifest',
	]);
});
