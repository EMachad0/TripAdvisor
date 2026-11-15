// Regenerates fixtures/e2e from src/fixtures/e2e.ts: node scripts/write-e2e-fixtures.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { e2eFiles } from '../src/fixtures/e2e.ts';

const dir = path.resolve(import.meta.dirname, '../fixtures/e2e');
await fs.rm(dir, { recursive: true, force: true });
for (const [rel, text] of e2eFiles()) {
	await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
	await fs.writeFile(path.join(dir, rel), text);
}
process.stdout.write(`wrote ${dir}\n`);
