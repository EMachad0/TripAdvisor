// node --test deploy/backup/test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
	evaluate,
	keyTime,
	localStore,
	main,
	newestKey,
	parseStatus,
	snapshotOf,
	type Limits,
} from '../../../scripts/backup-status.ts';

const LIMITS: Limits = { maxAgeHours: 26, minFreeBytes: 2e9, prefixes: ['old', 'convex'] };
const NOW = new Date('2026-11-16T18:00:00Z');

void test('keyTime reads the UTC second of a backup key and rejects other names', () => {
	assert.equal(keyTime('20261115T161700Z.tar.gz.age')?.toISOString(), '2026-11-15T16:17:00.000Z');
	assert.equal(keyTime('20261115T161700Z.json')?.toISOString(), '2026-11-15T16:17:00.000Z');
	assert.equal(keyTime('latest.tar.age'), null);
	assert.equal(keyTime('2026-11-15.tar.age'), null);
});

void test('newestKey is the greatest backup key; stray names are ignored', () => {
	assert.equal(
		newestKey([
			'20261114T161700Z.tar.age',
			'README',
			'20261115T161700Z.tar.age',
			'20261115T090000Z.tar.age',
		]),
		'20261115T161700Z.tar.age',
	);
	assert.equal(newestKey(['notes.txt']), null);
	assert.equal(newestKey([]), null);
});

void test('parseStatus needs ts and a numeric diskFreeBytes', () => {
	assert.deepEqual(parseStatus('{"ts":"20261115T161700Z","diskFreeBytes":5}'), {
		ts: '20261115T161700Z',
		diskFreeBytes: 5,
	});
	assert.equal(parseStatus('{"ts":"x","diskFreeBytes":"5"}'), null);
	assert.equal(parseStatus('not json'), null);
});

void test('evaluate passes fresh objects with enough disk', () => {
	const checks = evaluate(
		{
			newest: { old: '20261116T161700Z.tar.gz.age', convex: '20261116T161700Z.tar.age' },
			status: { ts: '20261116T161700Z', diskFreeBytes: 3e9 },
		},
		LIMITS,
		NOW,
	);
	assert.deepEqual(
		checks.map((c) => [c.name, c.ok]),
		[
			['old/', true],
			['convex/', true],
			['status/', true],
		],
	);
});

void test('evaluate fails a stale object (over 26 h), a missing prefix and low disk', () => {
	const checks = evaluate(
		{
			newest: { old: '20261115T155959Z.tar.gz.age', convex: null },
			status: { ts: '20261116T161700Z', diskFreeBytes: 1.5e9 },
		},
		LIMITS,
		NOW,
	);
	assert.deepEqual(
		checks.map((c) => [c.name, c.ok]),
		[
			['old/', false],
			['convex/', false],
			['status/', false],
		],
	);
	// exactly 26 h is still fresh
	const edge = evaluate(
		{ newest: { old: '20261115T160000Z.tar.gz.age' }, status: { ts: 'x', diskFreeBytes: 2e9 } },
		{ ...LIMITS, prefixes: ['old'] },
		NOW,
	);
	assert.ok(edge.every((c) => c.ok));
});

void test('a local destination is read the way backup.sh writes it; main exits 0 or 1', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-status-'));
	try {
		for (const [dir, name, body] of [
			['old', '20261116T161700Z.tar.gz.age', 'x'],
			['old', '20261115T161700Z.tar.gz.age', 'x'],
			['convex', '20261116T161700Z.tar.age', 'x'],
			['status', '20261115T161700Z.json', '{"ts":"20261115T161700Z","diskFreeBytes":1}'],
			['status', '20261116T161700Z.json', '{"ts":"20261116T161700Z","diskFreeBytes":9000000000}'],
		] as const) {
			fs.mkdirSync(path.join(root, dir), { recursive: true });
			fs.writeFileSync(path.join(root, dir, name), body);
		}
		const snap = snapshotOf(localStore(root), ['old', 'convex']);
		assert.equal(snap.newest['old'], '20261116T161700Z.tar.gz.age');
		assert.equal(snap.newest['convex'], '20261116T161700Z.tar.age');
		assert.equal(snap.status?.diskFreeBytes, 9e9);
		const write = process.stdout.write.bind(process.stdout);
		process.stdout.write = () => true;
		try {
			assert.equal(main(['--dest', root], NOW), 0);
			assert.equal(
				main(['--dest', root, '--convex'], NOW),
				0,
				'--convex is accepted and changes nothing',
			);
			assert.equal(main(['--dest', root, '--max-age-hours', '1'], NOW), 1);
			// a stale old/ (the old leg stopped) does not fail the check; a stale convex/ does
			fs.rmSync(path.join(root, 'old'), { recursive: true });
			assert.equal(main(['--dest', root], NOW), 0, 'old/ is not checked');
			fs.rmSync(path.join(root, 'convex'), { recursive: true });
			assert.equal(main(['--dest', root], NOW), 1, 'no convex/ object fails');
		} finally {
			process.stdout.write = write;
		}
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
