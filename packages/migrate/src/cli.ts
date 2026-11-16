// @atr/migrate command line (plan section 14). Run through bin.ts:
//   dry-run    --src <dir> [--require-nonzero]                 parse + validate, per-table counts, quarantine report
//   import     --src <dir> --target <t> [--accept-quarantine N] [--parallel N]
//                                                              load, one atomic replace per table (N at a time)
//   export-v1  --target <t> --out <dir> [--bundle <file>]       rebuild the v1 files (the rollback tool)
//   verify     --src <dir> (--target <t> | --against <dir>)     counts + canonical sha256 per file; exit 0 on no diff
//   round-trip --src <dir> --target <t> [--out <dir>]           import, export-v1, verify against the source
// Targets: local (apps/web/.env.convex-local), scratch (packages/migrate/.env.scratch), ci | shadow | prod
// (CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY from the environment). prod requires writesFrozen.
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { toBundle } from './bundle.ts';
import { ConvexAdmin } from './deployment/convex.ts';
import type { Deployment } from './deployment/types.ts';
import { exportV1 } from './exportV1.ts';
import { importSnapshot } from './importer.ts';
import { loadTableValidators } from './schema.ts';
import { parseSnapshot, tableCounts, type Snapshot } from './snapshot.ts';
import { countsTable, reportDir, snapshotSummary, verifyTable, writeReportFile } from './report.ts';
import { isTargetName, REPO_ROOT, resolveTarget, TARGETS, type TargetName } from './target.ts';
import { readV1Dir, writeV1Dir, type V1Files } from './v1/files.ts';
import { verifySnapshots } from './verify.ts';

export interface Io {
	out: (text: string) => void;
	err: (text: string) => void;
	/** Builds the deployment for a target (tests pass a MemoryDeployment). */
	deployment: (target: TargetName) => Deployment;
	root: string;
}

export const defaultIo: Io = {
	out: (text) => process.stdout.write(`${text}\n`),
	err: (text) => process.stderr.write(`${text}\n`),
	deployment: (target) => new ConvexAdmin(resolveTarget(target)),
	root: REPO_ROOT,
};

const OPTIONS = {
	src: { type: 'string' },
	target: { type: 'string' },
	against: { type: 'string' },
	out: { type: 'string' },
	bundle: { type: 'string' },
	report: { type: 'string' },
	'accept-quarantine': { type: 'string' },
	parallel: { type: 'string' },
	'require-nonzero': { type: 'boolean' },
	'dry-run': { type: 'boolean' },
	json: { type: 'boolean' },
	help: { type: 'boolean', short: 'h' },
} as const;

type Options = ReturnType<
	typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>
>['values'];

class UsageError extends Error {}

const USAGE = `usage: migrate <dry-run|import|export-v1|verify|round-trip> [options]
  dry-run    --src <dir> [--require-nonzero] [--report <dir>]
  import     --src <dir> --target <${TARGETS.join('|')}> [--accept-quarantine N] [--parallel N] [--dry-run]
  export-v1  --target <t> --out <dir> [--bundle <file>]
  verify     --src <dir> (--target <t> | --against <dir>)
  round-trip --src <dir> --target <t> [--out <dir>] [--accept-quarantine N]`;

function need(o: Options, key: 'src' | 'out' | 'target'): string {
	const value = o[key];
	if (value === undefined || value === '') throw new UsageError(`--${key} is required`);
	return value;
}

function targetOf(o: Options): TargetName {
	const name = need(o, 'target');
	if (!isTargetName(name)) throw new UsageError(`--target must be one of ${TARGETS.join(', ')}`);
	return name;
}

function acceptQuarantine(o: Options): number {
	const raw = o['accept-quarantine'];
	if (raw === undefined) return 0;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 0)
		throw new UsageError('--accept-quarantine takes a whole number');
	return n;
}

/** --parallel N: tables replaced at once (default 1). prod keeps one at a time, in table order. */
function parallelOf(o: Options, target: TargetName): number {
	const raw = o.parallel;
	if (raw === undefined) return 1;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1) throw new UsageError('--parallel takes a whole number from 1');
	if (n > 1 && target === 'prod') throw new UsageError('--parallel is for test backends, not prod');
	return n;
}

async function loadSnapshot(src: string): Promise<{ files: V1Files; snapshot: Snapshot }> {
	const files = await readV1Dir(path.resolve(src));
	const snapshot = parseSnapshot(files, await loadTableValidators());
	return { files, snapshot };
}

async function report(io: Io, o: Options, command: string): Promise<string> {
	if (o.report !== undefined) {
		await fs.mkdir(o.report, { recursive: true, mode: 0o700 });
		return path.resolve(o.report);
	}
	return reportDir(io.root, command);
}

async function writeSnapshotReport(dir: string, src: string, s: Snapshot): Promise<void> {
	const counts = Object.fromEntries(tableCounts(s.rows));
	const summary = {
		src: path.resolve(src),
		counts,
		quarantine: s.quarantine.length,
		droppedNoId: s.droppedNoId,
		droppedNulls: s.droppedNulls,
	};
	await writeReportFile(dir, 'report.json', `${JSON.stringify(summary, null, 2)}\n`);
	await writeReportFile(
		dir,
		'quarantine.jsonl',
		s.quarantine.map((q) => `${JSON.stringify(q)}\n`).join(''),
	);
}

async function dryRun(io: Io, o: Options): Promise<number> {
	const src = need(o, 'src');
	const { snapshot } = await loadSnapshot(src);
	const dir = await report(io, o, 'dry-run');
	await writeSnapshotReport(dir, src, snapshot);
	const counts = tableCounts(snapshot.rows);
	const empty = [...counts].filter(([, n]) => n === 0).map(([t]) => t);
	if (o.json === true)
		io.out(
			JSON.stringify({
				counts: Object.fromEntries(counts),
				quarantine: snapshot.quarantine.length,
				report: dir,
			}),
		);
	else io.out(`source: ${path.resolve(src)}\n${snapshotSummary(snapshot)}\nreport: ${dir}`);
	if (o['require-nonzero'] === true && empty.length > 0) {
		io.err(`empty table(s): ${empty.join(', ')}`);
		return 1;
	}
	return 0;
}

async function runImport(
	io: Io,
	o: Options,
	target: TargetName,
	snapshot: Snapshot,
): Promise<Deployment> {
	const deployment = io.deployment(target);
	io.out(`importing into ${deployment.label} (target ${target})`);
	await importSnapshot(deployment, snapshot, {
		acceptQuarantine: acceptQuarantine(o),
		requireFrozen: target === 'prod',
		parallel: parallelOf(o, target),
		onTable: (table, n) => {
			io.out(`  ${table.padEnd(13)} ${String(n)}`);
		},
	});
	return deployment;
}

async function importCmd(io: Io, o: Options): Promise<number> {
	if (o['dry-run'] === true) return dryRun(io, o);
	const src = need(o, 'src');
	const target = targetOf(o);
	parallelOf(o, target);
	const { snapshot } = await loadSnapshot(src);
	await writeSnapshotReport(await report(io, o, 'import'), src, snapshot);
	await runImport(io, o, target, snapshot);
	io.out('import: done');
	return 0;
}

async function exportCmd(io: Io, o: Options): Promise<number> {
	const target = targetOf(o);
	const out = path.resolve(need(o, 'out'));
	const deployment = io.deployment(target);
	const files = await exportV1(deployment);
	await writeV1Dir(out, files);
	if (o.bundle !== undefined)
		await fs.writeFile(o.bundle, `${JSON.stringify(await toBundle(files))}\n`, { mode: 0o600 });
	io.out(`export-v1: ${String(files.size)} file(s) from ${deployment.label} written to ${out}`);
	return 0;
}

async function verifyAndReport(
	io: Io,
	o: Options,
	a: V1Files,
	b: V1Files,
	labels: readonly [string, string],
): Promise<number> {
	const result = verifySnapshots(a, b);
	const dir = await report(io, o, 'verify');
	await writeReportFile(dir, 'manifest-a.json', `${JSON.stringify(result.manifestA, null, 2)}\n`);
	await writeReportFile(dir, 'manifest-b.json', `${JSON.stringify(result.manifestB, null, 2)}\n`);
	if (o.json === true)
		io.out(JSON.stringify({ ok: result.ok, differences: result.differences, files: result.files }));
	else io.out(verifyTable(result, labels));
	return result.ok ? 0 : 1;
}

async function verifyCmd(io: Io, o: Options): Promise<number> {
	const a = await readV1Dir(path.resolve(need(o, 'src')));
	if (o.against !== undefined)
		return verifyAndReport(io, o, a, await readV1Dir(path.resolve(o.against)), ['src', 'against']);
	const deployment = io.deployment(targetOf(o));
	return verifyAndReport(io, o, a, await exportV1(deployment), ['src', deployment.label]);
}

async function roundTrip(io: Io, o: Options): Promise<number> {
	const src = need(o, 'src');
	const target = targetOf(o);
	const { files, snapshot } = await loadSnapshot(src);
	const dir = await report(io, o, 'round-trip');
	await writeSnapshotReport(dir, src, snapshot);
	io.out(`source: ${path.resolve(src)}\n${countsTable(tableCounts(snapshot.rows))}`);
	const deployment = await runImport(io, o, target, snapshot);
	const exported = await exportV1(deployment);
	const out = path.resolve(o.out ?? path.join(dir, 'export'));
	await writeV1Dir(out, exported);
	io.out(`exported to ${out}`);
	return verifyAndReport(io, o, files, exported, ['src', 'export']);
}

const COMMANDS: Record<string, (io: Io, o: Options) => Promise<number>> = {
	'dry-run': dryRun,
	import: importCmd,
	'export-v1': exportCmd,
	verify: verifyCmd,
	'round-trip': roundTrip,
};

export async function main(argv: readonly string[], io: Io = defaultIo): Promise<number> {
	try {
		const { values, positionals } = parseArgs({
			args: [...argv],
			options: OPTIONS,
			allowPositionals: true,
		});
		const command = COMMANDS[positionals[0] ?? ''];
		if (values.help === true || command === undefined) {
			io.out(USAGE);
			return values.help === true ? 0 : 2;
		}
		return await command(io, values);
	} catch (error) {
		io.err(`migrate: ${error instanceof Error ? error.message : String(error)}`);
		return error instanceof UsageError ? 2 : 1;
	}
}
