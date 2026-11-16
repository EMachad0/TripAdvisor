// node --test deploy/backup/test
// backup.sh end to end against a local destination, with age and the Convex CLI stubbed (AGE, CONVEX_CLI): what is
// written where, for which recipients, the old-leg checks, the Convex-only default once OLD_DATA_DIR is empty, the
// status object and local retention.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

const SCRIPT = path.resolve(import.meta.dirname, '../backup.sh');
const OWNER = 'age1owner0000000000000000000000000000000000000000000000000000';
const CI = 'age1ci000000000000000000000000000000000000000000000000000000000';

let dir = '';

function write(rel: string, body: string, mode = 0o644): string {
	const file = path.join(dir, rel);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, body, { mode });
	return file;
}

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-backup-test-'));
	// age stub: records its arguments, passes the data through.
	write('bin/age', `#!/bin/sh\necho "$*" >> "${dir}/age-calls"\nexec cat\n`, 0o755);
	// Convex CLI stub: export writes a fake zip, run prints a bundle, env list prints two variables.
	write(
		'bin/convex',
		`#!/usr/bin/env bash
case "$1" in
	export) while [[ $# -gt 0 ]]; do [[ "$1" == --path ]] && printf 'PK fake zip' > "$2"; shift; done ;;
	run) printf '%s\\n' '{"format":"atr-v1-bundle","version":1,"generatedAt":"t","files":{"feedback/swipes.jsonl":{"count":2,"sha256":"aa","content":"x"},"trip/days.json":{"count":3,"sha256":"bb","content":"y"}}}' ;;
	env) printf 'SITE_URL=https://example.invalid\\nBETTER_AUTH_SECRET=stub-secret\\n' ;;
esac
`,
		0o755,
	);
	write('data/feedback/swipes.jsonl', '{"id":"a"}\n{"id":"b"}\n');
	write('data/feedback/game-state.json', '{"round":1}');
	write('data/trip/days.json', '[{"id":"d1"}]');
	write(
		'conf/convex.env',
		"CONVEX_SELF_HOSTED_URL='http://127.0.0.1:1'\nCONVEX_SELF_HOSTED_ADMIN_KEY='x|y'\n",
		0o600,
	);
	write(
		'conf/backup.env',
		[
			`BACKUP_DEST=${dir}/dest`,
			`OLD_DATA_DIR=${dir}/data`,
			`AGE_OWNER_RECIPIENT=${OWNER}`,
			`AGE_CI_RECIPIENT=${CI}`,
			'',
		].join('\n'),
	);
});

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

function run(...args: string[]): { status: number | null; out: string } {
	const r = spawnSync(SCRIPT, ['--config', path.join(dir, 'conf'), ...args], {
		encoding: 'utf8',
		env: {
			...process.env,
			AGE: path.join(dir, 'bin/age'),
			CONVEX_CLI: path.join(dir, 'bin/convex'),
			TMPDIR: dir,
		},
	});
	return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const list = (prefix: string): string[] => {
	const p = path.join(dir, 'dest', prefix);
	return fs.existsSync(p) ? fs.readdirSync(p).sort() : [];
};
const tarList = (file: string, gz: boolean): string[] =>
	execFileSync('tar', [gz ? '-tzf' : '-tf', file], { encoding: 'utf8' })
		.split('\n')
		.filter(Boolean)
		.sort();
const tarRead = (file: string, member: string, gz: boolean): string =>
	execFileSync('tar', [gz ? '-xzOf' : '-xOf', file, member], { encoding: 'utf8' });

void test('both legs write old/, convex/, convex-env/ and status/ under one UTC second key', () => {
	const r = run('--now');
	assert.equal(r.status, 0, r.out);
	const [old] = list('old');
	const [cvx] = list('convex');
	const [env] = list('convex-env');
	const [status] = list('status');
	assert.match(old ?? '', /^\d{8}T\d{6}Z\.tar\.gz\.age$/);
	const ts = (old ?? '').slice(0, 16);
	assert.equal(cvx, `${ts}.tar.age`);
	assert.equal(env, `${ts}.env.age`);
	assert.equal(status, `${ts}.json`);

	const oldFile = path.join(dir, 'dest/old', old ?? '');
	assert.deepEqual(tarList(oldFile, true), [
		'feedback/',
		'feedback/game-state.json',
		'feedback/swipes.jsonl',
		'manifest.json',
		'trip/',
		'trip/days.json',
	]);
	const manifest = JSON.parse(tarRead(oldFile, 'manifest.json', true)) as {
		files: { file: string; lines: number; parse: string; sha256: string }[];
	};
	assert.deepEqual(
		manifest.files.map((f) => [f.file, f.lines, f.parse]),
		[
			['feedback/game-state.json', 1, 'ok'],
			['feedback/swipes.jsonl', 2, 'ok'],
			['trip/days.json', 1, 'ok'],
		],
	);

	const cvxFile = path.join(dir, 'dest/convex', cvx);
	assert.deepEqual(tarList(cvxFile, false), ['export.zip', 'manifest.json', 'v1-bundle.json']);
	const cm = JSON.parse(tarRead(cvxFile, 'manifest.json', false)) as {
		v1: Record<string, { count: number }>;
		export: { bytes: number };
	};
	assert.equal(cm.v1['trip/days.json']?.count, 3);
	assert.equal(cm.export.bytes, 'PK fake zip'.length);

	const st = JSON.parse(fs.readFileSync(path.join(dir, 'dest/status', status), 'utf8')) as Record<
		string,
		unknown
	>;
	assert.deepEqual(Object.keys(st).sort(), ['diskFreeBytes', 'ts']);
	assert.ok(!r.out.includes('stub-secret'), 'no env value in the output');
	assert.ok(!r.out.includes('x|y'), 'no admin key in the output');
});

void test('with OLD_DATA_DIR empty the job is the Convex leg alone; --leg old then fails clearly', () => {
	write(
		'conf/backup.env',
		[
			`BACKUP_DEST=${dir}/dest`,
			'OLD_DATA_DIR=',
			`AGE_OWNER_RECIPIENT=${OWNER}`,
			`AGE_CI_RECIPIENT=${CI}`,
			'',
		].join('\n'),
	);
	const r = run();
	assert.equal(r.status, 0, r.out);
	assert.doesNotMatch(r.out, /leg old/);
	assert.deepEqual(list('old'), []);
	assert.equal(list('convex').length, 1);
	assert.equal(list('convex-env').length, 1);
	assert.equal(list('status').length, 1);
	const old = run('--leg', 'old');
	assert.equal(old.status, 1);
	assert.match(old.out, /OLD_DATA_DIR is not set/);
});

void test('old/ and convex/ go to owner + CI; convex-env/ to the owner alone', () => {
	assert.equal(run().status, 0);
	const calls = fs.readFileSync(path.join(dir, 'age-calls'), 'utf8').trim().split('\n');
	assert.deepEqual(calls, [`-r ${OWNER} -r ${CI}`, `-r ${OWNER} -r ${CI}`, `-r ${OWNER}`]);
	assert.equal(
		fs.readdirSync(dir).filter((n) => n.startsWith('atr-backup.')).length,
		0,
		'staging removed',
	);
});

void test('a JSONL that ends mid-line fails the old leg; the convex leg and status still run', () => {
	write('data/feedback/swipes.jsonl', '{"id":"a"}\n{"id":"b"');
	const r = run();
	assert.equal(r.status, 1);
	assert.match(r.out, /ends mid-line after 3 tries/);
	assert.match(r.out, /failed leg\(s\): old/);
	assert.deepEqual(list('old'), []);
	assert.equal(list('convex').length, 1);
	assert.equal(list('status').length, 1);
});

void test('a file that does not parse fails the old leg', () => {
	write('data/trip/days.json', '[{"id":');
	const r = run('--leg', 'old');
	assert.equal(r.status, 1);
	assert.match(r.out, /trip\/days\.json does not parse/);
});

void test('refuses a world-readable Convex key file and a malformed recipient', () => {
	fs.chmodSync(path.join(dir, 'conf/convex.env'), 0o644);
	const r = run('--leg', 'convex');
	assert.equal(r.status, 1);
	assert.match(r.out, /must be mode 600/);
	write('conf/backup.env', `BACKUP_DEST=${dir}/dest\nAGE_OWNER_RECIPIENT=ssh-rsa AAAA\n`);
	assert.match(run().out, /must be an age public key/);
});

void test('a local destination keeps the 30 newest plus the newest of 12 older weeks', () => {
	// 60 daily objects before today: 30 stay as the newest, then one per ISO week for 12 weeks.
	const day = 86_400_000;
	const start = Date.UTC(2026, 6, 1, 16, 17, 0);
	for (let i = 0; i < 60; i++) {
		const ts = new Date(start + i * day)
			.toISOString()
			.replace(/[-:]/g, '')
			.replace(/\.\d{3}/, '');
		write(`dest/status/${ts}.json`, '{}');
	}
	assert.equal(run('--leg', 'old').status, 0);
	const kept = list('status');
	// 61 objects (60 + this run): the 30 newest, then at most one per week.
	assert.ok(kept.length > 30 && kept.length <= 42, `kept ${String(kept.length)}`);
	const older = kept.slice(0, kept.length - 30);
	const weeks = new Set(older.map((k) => k.slice(0, 8)));
	assert.equal(weeks.size, older.length);
});
