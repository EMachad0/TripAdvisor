// Fails when a mig/* branch touches paths outside its allow-list in docs/migration/ownership.json.
//   node scripts/check-ownership.ts [--branch <name>] [--base <ref>]
// The branch defaults to GITHUB_HEAD_REF (a PR in CI) or the current branch; the base to origin/mig/next, else
// mig/next. Changed paths: everything differing from the merge base (commits, staged, unstaged) plus untracked
// files, so an agent can run it before opening a PR.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { checkBranch, type Ownership } from './ownership.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const git = (...args: string[]): string =>
	execFileSync('git', args, {
		cwd: ROOT,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
const lines = (s: string): string[] => s.split('\n').filter((l) => l !== '');

const { values } = parseArgs({ options: { branch: { type: 'string' }, base: { type: 'string' } } });
const headRef = process.env['GITHUB_HEAD_REF'];
const branch =
	values.branch ??
	(headRef !== undefined && headRef !== '' ? headRef : git('rev-parse', '--abbrev-ref', 'HEAD'));
const rules = JSON.parse(
	fs.readFileSync(path.join(ROOT, 'docs/migration/ownership.json'), 'utf8'),
) as Ownership;

function baseRef(): string {
	if (values.base !== undefined) return values.base;
	for (const ref of ['origin/mig/next', 'mig/next']) {
		try {
			git('rev-parse', '--verify', '--quiet', ref);
			return ref;
		} catch {
			// try the next one
		}
	}
	throw new Error('no base: pass --base <ref> (origin/mig/next and mig/next are missing)');
}

const pre = checkBranch(rules, branch, []);
if (pre.kind === 'unchecked') {
	process.stdout.write(`check-ownership: ${branch}: ${pre.reason}\n`);
	process.exit(0);
}
const mergeBase = git('merge-base', baseRef(), 'HEAD');
const changed = [
	...new Set([
		...lines(git('diff', '--name-only', mergeBase)),
		...lines(git('ls-files', '--others', '--exclude-standard')),
	]),
].sort();
const verdict = checkBranch(rules, branch, changed);
if (verdict.kind === 'fail') {
	process.stderr.write(
		`check-ownership: ${branch} (${verdict.role}) touches ${String(verdict.outside.length)} path(s) outside its allow-list:\n` +
			verdict.outside.map((p) => `  ${p}\n`).join('') +
			'Ask the integrator for those changes (docs/migration/ownership.json).\n',
	);
	process.exit(1);
}
process.stdout.write(
	`check-ownership: ${branch} (${verdict.kind === 'ok' ? verdict.role : ''}): ${String(changed.length)} changed path(s), all allowed\n`,
);
