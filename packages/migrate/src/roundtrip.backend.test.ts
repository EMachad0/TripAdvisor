// The full round trip v1 -> Convex -> v1 against a real backend. Opt-in, because it replaces the data tables:
//   packages/migrate/scripts/scratch-backend.sh up
//   MIGRATE_BACKEND_TARGET=scratch corepack pnpm --filter @atr/migrate test
// Only the throwaway targets are allowed (scratch, or ci for a CI service container), never local, shadow or prod.
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { ConvexAdmin } from './deployment/convex.ts';
import { exportV1 } from './exportV1.ts';
import { importSnapshot } from './importer.ts';
import { loadTableValidators } from './schema.ts';
import { parseSnapshot } from './snapshot.ts';
import { resolveTarget } from './target.ts';
import { readV1Dir } from './v1/files.ts';
import { verifySnapshots } from './verify.ts';

const target = process.env['MIGRATE_BACKEND_TARGET'];

describe.skipIf(target === undefined)(`round trip on the ${target ?? '(unset)'} backend`, () => {
	// one table at a time (the import), then all tables in one ZIP import (--together, the e2e reseed)
	for (const together of [false, true]) {
		test(
			`e2e fixtures${together ? ', all tables together' : ''}: zero differences, byte-identical files`,
			{
				timeout: 120_000,
			},
			async () => {
				if (target !== 'scratch' && target !== 'ci')
					throw new Error('MIGRATE_BACKEND_TARGET must be scratch or ci');
				const files = await readV1Dir(path.resolve(import.meta.dirname, '../fixtures/e2e'));
				const snapshot = parseSnapshot(files, await loadTableValidators());
				const deployment = new ConvexAdmin(resolveTarget(target));
				await importSnapshot(deployment, snapshot, {
					acceptQuarantine: 0,
					requireFrozen: false,
					together,
				});
				const exported = await exportV1(deployment);
				expect(verifySnapshots(files, exported).ok).toBe(true);
				for (const [rel, text] of files) expect(exported.get(rel), rel).toBe(text);
			},
		);
	}
});
