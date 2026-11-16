// node --test deploy/backup/test
// scripts/convex-prod.sh refusals: everything here stops before the Convex CLI could reach any host.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

const SCRIPT = path.resolve(import.meta.dirname, '../../../scripts/convex-prod.sh');
const KEY = 'prod-admin|0123456789abcdef';
let dir = '';
let keyFile = '';

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-prod-test-'));
	keyFile = path.join(dir, '.env.convex-prod');
	fs.writeFileSync(
		keyFile,
		`CONVEX_SELF_HOSTED_URL='https://api.example.invalid'\nCONVEX_SELF_HOSTED_ADMIN_KEY='${KEY}'\n`,
		{ mode: 0o600 },
	);
});
afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

function run(
	args: string[],
	env: Record<string, string> = {},
): { status: number | null; out: string } {
	const r = spawnSync(SCRIPT, args, {
		encoding: 'utf8',
		input: 'value-from-stdin',
		env: { ...process.env, ATR_CONVEX_PROD_ENV: keyFile, ...env },
	});
	const out = `${r.stdout}${r.stderr}`;
	assert.ok(!out.includes(KEY), 'the admin key is never printed');
	assert.ok(!out.includes('value-from-stdin'), 'a value is never printed');
	return { status: r.status, out };
}

void test('refuses a key file that is not mode 600, or a non-https URL', () => {
	fs.chmodSync(keyFile, 0o644);
	assert.match(run(['status']).out, /must be mode 600/);
	fs.chmodSync(keyFile, 0o600);
	fs.writeFileSync(
		keyFile,
		`CONVEX_SELF_HOSTED_URL='http://127.0.0.1:3210'\nCONVEX_SELF_HOSTED_ADMIN_KEY='${KEY}'\n`,
	);
	const r = run(['status']);
	assert.equal(r.status, 1);
	assert.match(r.out, /must be the https production origin/);
});

void test('a missing key file says where it should be', () => {
	fs.rmSync(keyFile);
	assert.match(run(['status']).out, /no .*\.env\.convex-prod/);
});

void test('never prints values: env get and env list --include-values are refused', () => {
	assert.match(run(['env', 'get', 'BETTER_AUTH_SECRET']).out, /refused/);
	assert.match(run(['env', 'list', '--include-values']).out, /never listed/);
});

void test('env set refuses a value given as an argument', () => {
	const r = run(['env', 'set', 'SITE_URL', 'https://x'], {
		ATR_PROD_CONFIRM: 'api.example.invalid',
	});
	assert.equal(r.status, 1);
	assert.match(r.out, /never as an argument/);
});

void test('a write prints the host and stops when the confirmation does not match', () => {
	for (const args of [
		['deploy'],
		['run', 'ops:setWritesFrozen', '{"value":true}'],
		['import', 'x.zip'],
	]) {
		const r = run(args, { ATR_PROD_CONFIRM: 'api.other.invalid' });
		assert.equal(r.status, 1, args.join(' '));
		assert.match(r.out, /target api\.example\.invalid \(WRITE: /);
		assert.match(r.out, /does not match api\.example\.invalid; nothing done/);
	}
});

void test('read-only functions and commands are not asked to confirm', () => {
	// They then fail to reach the fake host, which is fine: the point is the classification printed first.
	const r = run(['run', 'ops:getWritesFrozen', '{}'], { ATR_PROD_CONFIRM: 'wrong' });
	assert.match(r.out, /target api\.example\.invalid \(read: run ops:getWritesFrozen\)/);
	assert.doesNotMatch(r.out, /nothing done/);
});

void test('unknown commands are refused', () => {
	assert.match(run(['dev']).out, /not allowed against prod/);
});
