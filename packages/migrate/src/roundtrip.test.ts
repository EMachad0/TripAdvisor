// v1 -> Convex -> v1 through the in-memory deployment (sorted fields, creation order, like Convex; spike S14).
// The same flow against a real backend is roundtrip.backend.test.ts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { main, type Io } from './cli.ts';
import { MemoryDeployment } from './deployment/memory.ts';
import { exportV1 } from './exportV1.ts';
import { importSnapshot } from './importer.ts';
import { loadTableValidators, type TableValidators } from './schema.ts';
import { parseSnapshot, tableCounts } from './snapshot.ts';
import { DATA_TABLES } from './tables.ts';
import { readV1Dir } from './v1/files.ts';
import { verifySnapshots } from './verify.ts';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');
const REPO = path.resolve(import.meta.dirname, '../../..');
let validators: TableValidators;
beforeAll(async () => {
	validators = await loadTableValidators();
});

async function roundTrip(dir: string, acceptQuarantine = 0) {
	const files = await readV1Dir(dir);
	const snapshot = parseSnapshot(files, validators);
	const deployment = new MemoryDeployment();
	await importSnapshot(deployment, snapshot, { acceptQuarantine, requireFrozen: false });
	const exported = await exportV1(deployment);
	return { files, snapshot, deployment, exported, result: verifySnapshots(files, exported) };
}

describe('e2e fixture set', () => {
	test('every table has rows and the round trip is byte-identical', async () => {
		const { snapshot, files, exported, result } = await roundTrip(path.join(FIXTURES, 'e2e'));
		for (const [table, n] of tableCounts(snapshot.rows)) expect(n, table).toBeGreaterThan(0);
		expect(result.ok).toBe(true);
		expect([...exported.keys()].sort()).toEqual([...files.keys()].sort());
		for (const [rel, text] of files) expect(exported.get(rel), rel).toBe(text);
	});

	test('an import of all tables together exports the same files as one table at a time', async () => {
		const { snapshot, exported } = await roundTrip(path.join(FIXTURES, 'e2e'));
		const deployment = new MemoryDeployment();
		const replaced: string[] = [];
		await importSnapshot(deployment, snapshot, {
			acceptQuarantine: 0,
			requireFrozen: false,
			together: true,
			onTable: (table) => replaced.push(table),
		});
		expect(replaced).toEqual(DATA_TABLES);
		expect(await exportV1(deployment)).toEqual(exported);
	});

	test('an export is stable: exporting twice gives the same files', async () => {
		const { deployment, exported } = await roundTrip(path.join(FIXTURES, 'e2e'));
		expect(await exportV1(deployment)).toEqual(exported);
	});

	test('rows written by the new app are appended after the imported lines', async () => {
		const { deployment } = await roundTrip(path.join(FIXTURES, 'e2e'));
		deployment.insert('swipes', {
			v: 1,
			ts: '2026-11-09T00:00:00Z',
			session: 'web-1',
			round: 'place',
			id: 'yu-garden',
			verdict: 'skip',
			userId: 'u',
		});
		const lines =
			(await exportV1(deployment)).get('feedback/swipes.jsonl')?.trimEnd().split('\n') ?? [];
		expect(lines.at(-1)).toBe(
			'{"v":1,"ts":"2026-11-09T00:00:00Z","session":"web-1","round":"place","id":"yu-garden","verdict":"skip"}',
		);
	});
});

describe('quarantine fixture', () => {
	test('bad lines are quarantined with reasons; ignored docs and null fields are counted', async () => {
		const files = await readV1Dir(path.join(FIXTURES, 'quarantine'));
		const s = parseSnapshot(files, validators);
		expect(s.quarantine.map((q) => `${q.file}:${String(q.line)}`)).toEqual([
			'feedback/swipes.jsonl:2',
			'feedback/swipes.jsonl:4',
			'feedback/swipes.jsonl:5',
			'feedback/swipes.jsonl:6',
			'trip/tasks.json:4',
		]);
		expect(s.droppedNoId).toEqual({ 'trip/tasks.json': 2 });
		expect(s.droppedNulls).toEqual({ 'trip/tasks.json': 1 });
		expect(s.rows.get('swipes')?.map((r) => r['seq'])).toEqual([1, 7]);
		expect(s.rows.get('notes')).toHaveLength(2);
	});

	test('import refuses unless --accept-quarantine matches, and writes nothing', async () => {
		const s = parseSnapshot(await readV1Dir(path.join(FIXTURES, 'quarantine')), validators);
		const deployment = new MemoryDeployment();
		await expect(
			importSnapshot(deployment, s, { acceptQuarantine: 4, requireFrozen: false }),
		).rejects.toThrow('--accept-quarantine 5');
		expect(await deployment.readTable('swipes')).toEqual([]);
	});

	test('a schema-only rejection is a real difference for verify', async () => {
		const { result } = await roundTrip(path.join(FIXTURES, 'quarantine'), 5);
		expect(result.files.filter((f) => !f.sameCanonical).map((f) => f.file)).toEqual([
			'trip/tasks.json',
		]);
		// CRLF and a missing final newline are normalised to the writer's bytes but read the same.
		expect(result.files.find((f) => f.file === 'feedback/notes.jsonl')).toMatchObject({
			sameCanonical: true,
			sameRaw: false,
		});
	});
});

test('prod imports require writesFrozen', async () => {
	const s = parseSnapshot(await readV1Dir(path.join(FIXTURES, 'e2e')), validators);
	const deployment = new MemoryDeployment();
	await expect(
		importSnapshot(deployment, s, { acceptQuarantine: 0, requireFrozen: true }),
	).rejects.toThrow('not frozen');
	deployment.frozen = true;
	const counts = await importSnapshot(deployment, s, { acceptQuarantine: 0, requireFrozen: true });
	expect([...counts.keys()]).toEqual(DATA_TABLES);
});

describe.skipIf(!fs.existsSync(path.join(REPO, 'feedback', 'swipes.jsonl')))(
	'repo copies of feedback/ and trip/',
	() => {
		test('round trip with zero canonical differences', async () => {
			const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-migrate-repo-'));
			try {
				fs.cpSync(path.join(REPO, 'feedback'), path.join(tmp, 'feedback'), { recursive: true });
				fs.cpSync(path.join(REPO, 'trip'), path.join(tmp, 'trip'), { recursive: true });
				const { snapshot, result } = await roundTrip(tmp);
				expect(snapshot.quarantine).toEqual([]);
				expect(result.differences).toBe(0);
			} finally {
				fs.rmSync(tmp, { recursive: true, force: true });
			}
		});
	},
);

describe('cli', () => {
	function io(deployment = new MemoryDeployment()): Io & { lines: string[]; errors: string[] } {
		const lines: string[] = [];
		const errors: string[] = [];
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-migrate-cli-'));
		return {
			lines,
			errors,
			root,
			out: (t) => lines.push(t),
			err: (t) => errors.push(t),
			deployment: () => deployment,
		};
	}

	test('dry-run --require-nonzero passes on the e2e set and fails on the quarantine set', async () => {
		const a = io();
		expect(
			await main(['dry-run', '--src', path.join(FIXTURES, 'e2e'), '--require-nonzero'], a),
		).toBe(0);
		expect(a.lines.join('\n')).toContain('quarantine: 0');
		const b = io();
		expect(
			await main(['dry-run', '--src', path.join(FIXTURES, 'quarantine'), '--require-nonzero'], b),
		).toBe(1);
		expect(
			fs
				.readFileSync(
					path.join(
						b.root,
						'.cache/migrate',
						fs.readdirSync(path.join(b.root, '.cache/migrate'))[0] ?? '',
						'quarantine.jsonl',
					),
					'utf8',
				)
				.trimEnd()
				.split('\n'),
		).toHaveLength(5);
	});

	test('round-trip, then verify and export-v1 against the same deployment', async () => {
		const shared = io();
		const src = path.join(FIXTURES, 'e2e');
		expect(await main(['round-trip', '--src', src, '--target', 'scratch'], shared)).toBe(0);
		expect(shared.lines.at(-1)).toContain('verify: 0 differences');
		expect(await main(['verify', '--src', src, '--target', 'scratch'], shared)).toBe(0);
		const out = path.join(shared.root, 'out');
		expect(await main(['export-v1', '--target', 'scratch', '--out', out], shared)).toBe(0);
		expect(await main(['verify', '--src', src, '--against', out], shared)).toBe(0);
		expect(
			await main(['verify', '--src', src, '--against', path.join(FIXTURES, 'quarantine')], shared),
		).toBe(1);
	});

	test('usage errors exit 2', async () => {
		const a = io();
		expect(await main(['import', '--src', 'x', '--target', 'nowhere'], a)).toBe(2);
		expect(await main(['bogus'], a)).toBe(2);
		// prod imports one table at a time
		const src = path.join(FIXTURES, 'e2e');
		expect(await main(['import', '--src', src, '--target', 'prod', '--together'], a)).toBe(2);
	});
});
