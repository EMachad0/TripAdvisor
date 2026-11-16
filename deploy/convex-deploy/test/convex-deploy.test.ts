// node --test 'deploy/*/test/*.test.ts' (part of `pnpm test`)
// convex-deploy.sh's decisions with docker stubbed: which container and image it picks, when it deploys, what it
// records, the backoff after a failure, the lock, and that the admin key only ever travels by name.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

const SCRIPT = path.resolve(import.meta.dirname, '../convex-deploy.sh');
const UUID = 'xbgdnounik78nabmkmecl45d';
const KEY = 'self-hosted-key|0123abcd-secret';
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const T0 = 1_800_000_000;
const T0S = String(T0);

let dir = '';
const p = (rel: string): string => path.join(dir, rel);

function write(rel: string, body: string, mode = 0o644): void {
	fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
	fs.writeFileSync(p(rel), body, { mode });
	fs.chmodSync(p(rel), mode);
}
const read = (rel: string): string =>
	fs.existsSync(p(rel)) ? fs.readFileSync(p(rel), 'utf8') : '';

interface Container {
	id: string;
	name: string;
	created: string;
	image: string;
	health: 'healthy' | 'starting' | 'unhealthy' | 'none';
	/** The image reference the container was started from (docker's .Config.Image), e.g. `<uuid>:<commit>`. */
	ref?: string;
}
/** The docker world the stub reports: running containers and each image's env. */
function world(containers: Container[], images: Record<string, string[]>): void {
	write('docker/ps', containers.map((c) => `${c.id} ${c.name}\n`).join(''));
	for (const c of containers) {
		write(
			`docker/inspect/${c.id}`,
			`${c.created} /${c.name} ${c.image} ${c.health} ${c.ref ?? ''}\n`,
		);
	}
	for (const [image, env] of Object.entries(images)) {
		write(`docker/images/${image}`, env.map((e) => `${e}\n`).join(''));
	}
}
const app = (
	id: string,
	image: string,
	created: string,
	health: Container['health'] = 'healthy',
): Container => ({
	id,
	name: `${UUID}-${id}`,
	created,
	image,
	health,
});

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-convex-deploy-test-'));
	// docker stub: ps / inspect / image inspect answer from docker/, run records its argv and whether the key and
	// URL arrived in its environment, then exits with docker/run-exit (default 0).
	write(
		'bin/docker',
		`#!/usr/bin/env bash
D="${dir}/docker"
case "$1" in
	ps) cat "$D/ps" ;;
	inspect) shift 3; for id in "$@"; do cat "$D/inspect/$id"; done ;;
	image) cat "$D/images/$5" ;;
	run)
		shift
		printf '%s\\n' "$@" > "$D/run-args"
		printf 'url=%s key=%s\\n' "\${CONVEX_SELF_HOSTED_URL:-}" "\${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" > "$D/run-env"
		echo run >> "$D/runs"
		exit "$(cat "$D/run-exit" 2>/dev/null || echo 0)" ;;
	*) echo "unexpected docker $*" >&2; exit 99 ;;
esac
`,
		0o755,
	);
	write(
		'conf/convex.env',
		`CONVEX_SELF_HOSTED_URL='https://api.example.invalid'\nCONVEX_SELF_HOSTED_ADMIN_KEY='${KEY}'\n`,
		0o600,
	);
	write('conf/convex-deploy.env', `APP_UUID=${UUID}\nCONVEX_ENV_FILE=${p('conf/convex.env')}\n`);
	world(
		[
			app('c1', 'sha256:img1', '2026-11-16T10:00:00.000000000Z'),
			{
				id: 'cx',
				name: 'backend-otheruuid',
				created: '2026-11-16T12:00:00Z',
				image: 'sha256:cvx',
				health: 'healthy',
			},
		],
		{ 'sha256:img1': ['PATH=/usr/bin', `GIT_SHA=${SHA_A}`], 'sha256:cvx': [] },
	);
});

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

function run(opts: { now?: number; args?: string[] } = {}): { status: number | null; out: string } {
	const r = spawnSync(
		SCRIPT,
		['--config', p('conf'), '--state', p('state'), ...(opts.args ?? [])],
		{
			encoding: 'utf8',
			env: {
				...process.env,
				PATH: `${p('bin')}:${process.env['PATH'] ?? ''}`,
				ATR_CONVEX_DEPLOY_NOW: String(opts.now ?? T0),
			},
		},
	);
	const out = `${r.stdout}${r.stderr}`;
	assert.ok(!out.includes(KEY), 'the admin key never reaches the output');
	return { status: r.status, out };
}
const runs = (): number => read('docker/runs').split('\n').filter(Boolean).length;

void test('first run with no state deploys from the live image and records its sha', () => {
	const r = run();
	assert.equal(r.status, 0, r.out);
	assert.equal(runs(), 1);
	assert.equal(read('state/deployed-sha').trim(), SHA_A);
	assert.match(
		r.out,
		/deploying functions of aaaaaaaaaaaa \(container xbgdnounik78nabmkmecl45d-c1/,
	);
	assert.match(r.out, /deployed functions of aaaaaaaaaaaa/);
	const args = read('docker/run-args').split('\n');
	// The image of the live container (by id), its own CLI, the deploy flags of scripts/convex-prod.sh.
	assert.ok(args.includes('sha256:img1'));
	assert.deepEqual(args.slice(args.indexOf('sha256:img1') + 1, -1), [
		'node_modules/convex/bin/main.js',
		'deploy',
		'--yes',
		'--typecheck',
		'disable',
		'--codegen',
		'disable',
	]);
	assert.deepEqual(args.slice(args.indexOf('--network'), args.indexOf('--network') + 2), [
		'--network',
		'coolify',
	]);
	// The key and URL go in by name only: never in argv, present in the docker client's environment.
	assert.ok(args.includes('CONVEX_SELF_HOSTED_ADMIN_KEY'));
	assert.ok(args.includes('CONVEX_SELF_HOSTED_URL'));
	assert.ok(!read('docker/run-args').includes(KEY));
	assert.ok(!read('docker/run-args').includes('api.example.invalid'));
	assert.equal(read('docker/run-env').trim(), `url=https://api.example.invalid key=${KEY}`);
	assert.ok(args.includes('--read-only'));
	assert.ok(!fs.existsSync(p('state/lock')), 'the lock is released');
});

void test('a second run for the same sha does nothing and prints nothing', () => {
	assert.equal(run().status, 0);
	const r = run();
	assert.equal(r.status, 0);
	assert.equal(r.out, '');
	assert.equal(runs(), 1);
});

void test('a different recorded sha (a new image) deploys again', () => {
	write('state/deployed-sha', `${SHA_B}\n`);
	const r = run();
	assert.equal(r.status, 0, r.out);
	assert.equal(runs(), 1);
	assert.match(r.out, /recorded: b{40}/);
	assert.equal(read('state/deployed-sha').trim(), SHA_A);
});

void test('a failed deploy keeps the state, exits non-zero and backs off 1, 2, 4 … minutes', () => {
	write('state/deployed-sha', `${SHA_B}\n`);
	write('docker/run-exit', '1');
	const r1 = run();
	assert.equal(r1.status, 1);
	assert.match(
		r1.out,
		/convex deploy of aaaaaaaaaaaa failed \(exit 1\) \(attempt 1\); next try in 1 min/,
	);
	assert.equal(read('state/deployed-sha').trim(), SHA_B);
	assert.equal(read('state/failures').trim(), `${SHA_A} 1 ${T0S}`);

	// Within the minute: a silent skip, no docker run.
	assert.deepEqual(run({ now: T0 + 59 }), { status: 0, out: '' });
	assert.equal(runs(), 1);
	// After it: attempt 2, which waits 2 minutes.
	const r2 = run({ now: T0 + 60 });
	assert.equal(r2.status, 1);
	assert.match(r2.out, /attempt 2\); next try in 2 min/);
	assert.equal(runs(), 2);
	assert.deepEqual(run({ now: T0 + 60 + 119 }), { status: 0, out: '' });
	assert.equal(runs(), 2);

	// Fixed: the next try succeeds, records the sha and clears the failures.
	write('docker/run-exit', '0');
	assert.equal(run({ now: T0 + 60 + 120 }).status, 0);
	assert.equal(read('state/deployed-sha').trim(), SHA_A);
	assert.ok(!fs.existsSync(p('state/failures')));
});

void test('the backoff is capped at an hour', () => {
	write('state/failures', `${SHA_A} 12 ${T0S}\n`);
	assert.deepEqual(run({ now: T0 + 3599 }), { status: 0, out: '' });
	assert.equal(runs(), 0);
	assert.equal(run({ now: T0 + 3600 }).status, 0);
	assert.equal(runs(), 1);
});

void test("a new commit does not wait for the previous commit's backoff", () => {
	write('state/failures', `${SHA_B} 3 ${T0S}\n`);
	const r = run({ now: T0 + 1 });
	assert.equal(r.status, 0, r.out);
	assert.equal(runs(), 1);
	assert.equal(read('state/deployed-sha').trim(), SHA_A);
});

void test('--force deploys a recorded sha and ignores the backoff', () => {
	write('state/deployed-sha', `${SHA_A}\n`);
	assert.equal(run({ args: ['--force'] }).status, 0);
	assert.equal(runs(), 1);
	write('state/failures', `${SHA_A} 2 ${T0S}\n`);
	write('state/deployed-sha', `${SHA_B}\n`);
	assert.equal(run({ args: ['--force'] }).status, 0);
	assert.equal(runs(), 2);
});

void test('mid-rollout: waits while the newest container is starting, then deploys the newest', () => {
	write('state/deployed-sha', `${SHA_A}\n`);
	const old = app('c1', 'sha256:img1', '2026-11-16T10:00:00.000000000Z');
	const images = { 'sha256:img1': [`GIT_SHA=${SHA_A}`], 'sha256:img2': [`GIT_SHA=${SHA_B}`] };
	world([app('c2', 'sha256:img2', '2026-11-16T11:00:00.000000000Z', 'starting'), old], images);
	const r = run();
	assert.equal(r.status, 0);
	assert.match(
		r.out,
		/newest container xbgdnounik78nabmkmecl45d-c2 is starting \(rollout in progress\); waiting/,
	);
	assert.equal(runs(), 0);

	world([app('c2', 'sha256:img2', '2026-11-16T11:00:00.000000000Z', 'unhealthy'), old], images);
	assert.equal(run().status, 0);
	assert.equal(runs(), 0);

	world([old, app('c2', 'sha256:img2', '2026-11-16T11:00:00.000000000Z')], images);
	assert.equal(run().status, 0);
	assert.equal(runs(), 1);
	assert.ok(read('docker/run-args').split('\n').includes('sha256:img2'));
	assert.equal(read('state/deployed-sha').trim(), SHA_B);
});

void test('no app container: nothing to do; other containers are ignored', () => {
	world(
		[{ id: 'cx', name: 'backend-x', created: 't', image: 'sha256:cvx', health: 'healthy' }],
		{},
	);
	const r = run();
	assert.equal(r.status, 0);
	assert.match(r.out, /no running container named xbgdnounik78nabmkmecl45d-…/);
	assert.equal(runs(), 0);
	assert.ok(!fs.existsSync(p('state/deployed-sha')));
});

void test('an image without GIT_SHA fails with backoff and never deploys', () => {
	world([app('c1', 'sha256:img1', '2026-11-16T10:00:00Z')], { 'sha256:img1': ['GIT_SHA='] });
	const r = run();
	assert.equal(r.status, 1);
	assert.match(r.out, /has no usable GIT_SHA/);
	assert.equal(runs(), 0);
	assert.deepEqual(run({ now: T0 + 30 }), { status: 0, out: '' });
});

void test('a Coolify image (GIT_SHA empty in the image) takes the commit from its tag', () => {
	world([{ ...app('c1', 'sha256:img1', '2026-11-16T10:00:00Z'), ref: `${UUID}:${SHA_A}` }], {
		'sha256:img1': ['GIT_SHA='],
	});
	const r = run();
	assert.equal(r.status, 0);
	assert.equal(runs(), 1);
	assert.equal(read('state/deployed-sha').trim(), SHA_A);
	// A tag that is not a commit (latest) is not trusted.
	fs.rmSync(p('state/deployed-sha'));
	world([{ ...app('c2', 'sha256:img1', '2026-11-16T11:00:00Z'), ref: `${UUID}:latest` }], {
		'sha256:img1': ['GIT_SHA='],
	});
	assert.equal(run().status, 1);
	assert.equal(runs(), 1);
});

void test('a held lock skips the run; a stale one is taken over', () => {
	write('state/lock/pid', `${String(process.pid)}\n`);
	const held = run();
	assert.equal(held.status, 0);
	assert.match(held.out, /another run \(pid \d+\) is in progress; skipping/);
	assert.equal(runs(), 0);
	assert.ok(fs.existsSync(p('state/lock')), "someone else's lock is left alone");

	write('state/lock/pid', '999999\n');
	const stale = run();
	assert.equal(stale.status, 0, stale.out);
	assert.match(stale.out, /taking over a stale lock/);
	assert.equal(runs(), 1);
	assert.ok(!fs.existsSync(p('state/lock')));
});

void test('refuses a key file that is not mode 600, and a missing APP_UUID', () => {
	fs.chmodSync(p('conf/convex.env'), 0o644);
	const r = run();
	assert.equal(r.status, 1);
	assert.match(r.out, /must be mode 600 \(is 644\)/);
	assert.equal(runs(), 0);

	write('conf/convex-deploy.env', 'APP_UUID=\n');
	assert.match(run().out, /APP_UUID .* must be the Coolify app uuid/);
});

const ROOT = path.resolve(import.meta.dirname, '../../..');
const repo = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

void test('the units: every minute, the installed script, capped and niced like the backup job', () => {
	assert.match(
		repo('deploy/convex-deploy/atr-convex-deploy.timer'),
		/^OnCalendar=\*-\*-\* \*:\*:30$/m,
	);
	const unit = repo('deploy/convex-deploy/atr-convex-deploy.service');
	assert.match(unit, /^ExecStart=\/usr\/local\/lib\/atr-convex-deploy\/convex-deploy\.sh$/m);
	assert.match(unit, /^Type=oneshot$/m);
	assert.match(unit, /^StateDirectory=atr-convex-deploy$/m);
	assert.match(unit, /^MemoryMax=\d+M$/m);
	assert.match(unit, /^Nice=10$/m);
});

void test('the web image carries what convex deploy needs, and no key', () => {
	const df = repo('apps/web/Dockerfile');
	const build = df.slice(0, df.indexOf('AS runtime'));
	assert.match(build, /cp -r apps\/web\/src\/convex \/prod\/web\/src\/convex/);
	assert.match(build, /cp apps\/web\/convex\.json \/prod\/web\/convex\.json/);
	assert.match(build, /packages\/shared\/src \/prod\/web\/node_modules\/@atr\/shared\//);
	assert.match(
		df.slice(df.indexOf('AS runtime')),
		/^COPY --from=build --chown=node:node \/prod\/web \/app\/web$/m,
	);
	assert.ok(!df.includes('ADMIN_KEY'));
	assert.match(repo('apps/web/convex.json'), /"functions": "src\/convex\/"/);
});
