import path from 'node:path';
import { expect, test } from 'vitest';
import { readV1Dir } from '../v1/files.ts';
import { e2eFiles } from './e2e.ts';

test('fixtures/e2e is what src/fixtures/e2e.ts generates (node scripts/write-e2e-fixtures.ts)', async () => {
	const onDisk = await readV1Dir(path.resolve(import.meta.dirname, '../../fixtures/e2e'));
	expect(onDisk).toEqual(e2eFiles());
});
