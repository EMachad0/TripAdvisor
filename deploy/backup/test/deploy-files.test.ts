// node --test deploy/backup/test
// Static checks of the deploy files: the Coolify compose keeps the local image pin, the dashboard stays on loopback,
// every service rotates logs and has a memory cap, env templates hold names only, the web image runs as non-root.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

interface Service {
	image?: string;
	ports?: string[];
	mem_limit?: string;
	logging?: { driver?: string; options?: Record<string, string> };
	environment?: Record<string, string>;
}
const services = (rel: string): Record<string, Service> =>
	(parse(read(rel)) as { services: Record<string, Service> }).services;

void test('Coolify Convex images are the same 40-char commit sha as deploy/convex-local', () => {
	const local = services('deploy/convex-local/compose.yaml');
	const prod = services('deploy/coolify/convex.compose.yaml');
	for (const name of ['backend', 'dashboard']) {
		const image = prod[name]?.image ?? '';
		assert.match(image, /^ghcr\.io\/convex\/convex-(backend|dashboard):[0-9a-f]{40}$/, name);
		assert.equal(image, local[name]?.image, `${name} differs from deploy/convex-local`);
	}
});

void test('the dashboard is bound to 127.0.0.1 only and has no Coolify domain', () => {
	const text = read('deploy/coolify/convex.compose.yaml');
	const prod = services('deploy/coolify/convex.compose.yaml');
	assert.deepEqual(prod['dashboard']?.ports, ['127.0.0.1:6791:6791']);
	assert.equal(
		prod['backend']?.ports,
		undefined,
		'the backend is reached through Coolify domains, not ports',
	);
	assert.ok(!/^\s*-?\s*SERVICE_(URL|FQDN)_DASHBOARD/m.test(text));
	assert.ok(!text.includes('NEXT_PUBLIC_SKIP_LOGIN'));
});

void test('every Coolify service rotates its logs and has a memory limit', () => {
	for (const [name, s] of Object.entries(services('deploy/coolify/convex.compose.yaml'))) {
		assert.equal(s.logging?.driver, 'json-file', name);
		assert.ok(s.logging.options?.['max-size'] !== undefined, `${name} max-size`);
		assert.ok(s.logging.options['max-file'] !== undefined, `${name} max-file`);
		assert.match(s.mem_limit ?? '', /^\d+[mg]$/, `${name} mem_limit`);
	}
	const backend = services('deploy/coolify/convex.compose.yaml')['backend']?.environment ?? {};
	assert.equal(backend['DISABLE_BEACON'], 'true');
	assert.equal(backend['REDACT_LOGS_TO_CLIENT'], 'true');
});

void test('env templates list names only', () => {
	const dir = path.join(ROOT, 'deploy/coolify/env');
	const files = fs.readdirSync(dir).filter((f) => f.endsWith('.template'));
	assert.ok(files.length >= 5);
	for (const f of files) {
		for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
			if (line === '' || line.startsWith('#')) continue;
			assert.match(line, /^[A-Z][A-Z0-9_]*=$/, `${f}: "${line}" must be NAME= with no value`);
		}
	}
});

void test('the web image: non-root, HEALTHCHECK on /healthz, GIT_SHA build arg, content baked in', () => {
	const df = read('apps/web/Dockerfile');
	const runtime = df.slice(df.indexOf('AS runtime'));
	assert.match(runtime, /^USER node$/m);
	assert.match(runtime, /^HEALTHCHECK .*\n?.*\/healthz/m);
	assert.match(df, /^ARG GIT_SHA=/m);
	for (const dir of ['places', 'areas', 'answers', 'config']) {
		assert.match(runtime, new RegExp(`^COPY --chown=node:node ${dir} /app/content/${dir}$`, 'm'));
	}
	assert.match(runtime, /^CMD \["node", "build"\]$/m);
	const ignore = read('apps/web/Dockerfile.dockerignore');
	assert.match(ignore, /^\*\*\/\.env$/m);
	assert.match(ignore, /^\*\*\/node_modules$/m);
});

void test('the timer fires at 16:17 UTC and runs the installed backup script', () => {
	assert.match(read('deploy/backup/atr-backup.timer'), /^OnCalendar=\*-\*-\* 16:17:00 UTC$/m);
	assert.match(
		read('deploy/backup/atr-backup.service'),
		/^ExecStart=\/usr\/local\/lib\/atr-backup\/backup\.sh$/m,
	);
});
