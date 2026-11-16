// Which deployment a command talks to. The URL and admin key come from a gitignored env file (local, scratch) or
// the environment (ci, shadow, prod: scripts/convex-prod.sh sets them). Only the host is ever shown.
import fs from 'node:fs';
import path from 'node:path';
import type { ConvexTarget } from './deployment/convex.ts';

export const TARGETS = ['local', 'scratch', 'ci', 'shadow', 'prod'] as const;
export type TargetName = (typeof TARGETS)[number];

export const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

/** `local` follows ATR_SLOT (scripts/convex-local.sh): slot n > 0 uses apps/web/.env.convex-local.s<n>. */
export function localEnvFile(env: NodeJS.ProcessEnv = process.env): string {
	const slot = env['ATR_SLOT'] ?? '';
	if (slot !== '' && !/^[0-8]$/.test(slot)) throw new Error('ATR_SLOT must be 0 to 8');
	const suffix = slot === '' || slot === '0' ? '' : `.s${slot}`;
	return path.join(REPO_ROOT, `apps/web/.env.convex-local${suffix}`);
}

function envFileOf(name: TargetName, env: NodeJS.ProcessEnv): string | undefined {
	if (name === 'local') return localEnvFile(env);
	if (name === 'scratch') return path.join(REPO_ROOT, 'packages/migrate/.env.scratch');
	return undefined;
}

/** KEY=value or KEY='value' lines (the format scripts/convex-local.sh writes). */
export function parseEnvFile(text: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const line of text.split('\n')) {
		const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
		const key = m?.[1];
		const raw = m?.[2];
		if (key === undefined || raw === undefined) continue;
		out.set(key, raw.replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1'));
	}
	return out;
}

export function isTargetName(value: string): value is TargetName {
	return (TARGETS as readonly string[]).includes(value);
}

export function resolveTarget(
	name: TargetName,
	env: NodeJS.ProcessEnv = process.env,
): ConvexTarget {
	const file = envFileOf(name, env);
	const vars =
		file === undefined
			? null
			: fs.existsSync(file)
				? parseEnvFile(fs.readFileSync(file, 'utf8'))
				: null;
	if (file !== undefined && vars === null)
		throw new Error(`no ${path.relative(REPO_ROOT, file)}; start that backend first`);
	const url = vars?.get('CONVEX_SELF_HOSTED_URL') ?? env['CONVEX_SELF_HOSTED_URL'];
	const adminKey = vars?.get('CONVEX_SELF_HOSTED_ADMIN_KEY') ?? env['CONVEX_SELF_HOSTED_ADMIN_KEY'];
	if (url === undefined || url === '' || adminKey === undefined || adminKey === '') {
		throw new Error(
			`target ${name}: CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY are not set`,
		);
	}
	if ((name === 'local' || name === 'scratch') && !url.startsWith('http://127.0.0.1:')) {
		throw new Error(`target ${name} must be a 127.0.0.1 backend`);
	}
	return { url, adminKey };
}
