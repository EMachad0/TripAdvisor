// CI shards for the e2e matrix (.github/workflows/ci.yml). A shard is a list of whole spec files (a file's serial
// describes share backend state, so a file never splits), balanced by the seconds each file took on CI, which
// e2e/durations.json keeps per Playwright project. Playwright's own --shard counts tests instead, and one file here
// spends 70 s waiting for a JWT to expire.
//
//   node e2e/shards.ts <project> <n> <total>    print shard n (1 to total) of a project: spec paths, one per line
//   node e2e/shards.ts update <report.json>…    rewrite e2e/durations.json from Playwright JSON reports
//
// Every spec file lands in exactly one shard. A file missing from durations.json (a new spec) counts as the mean of
// its project. The CI job uploads its JSON report (artifact e2e-durations-*), so durations can be refreshed with
// `gh run download <run> -p 'e2e-durations-*' -D /tmp/d && node e2e/shards.ts update /tmp/d/*/*.json`.
import fs from 'node:fs';
import path from 'node:path';

const WEB = path.resolve(import.meta.dirname, '..');
const DURATIONS = path.join(import.meta.dirname, 'durations.json');
/** Playwright's default testMatch, which the device projects use. */
const SPEC = /\.(spec|test)\.[cm]?[jt]sx?$/;

type Durations = Record<string, Record<string, number>>;

function specFiles(): string[] {
	const dir = path.join(WEB, 'e2e');
	return fs
		.readdirSync(dir, { recursive: true, encoding: 'utf8' })
		.filter((f) => SPEC.test(f))
		.map((f) => f.split(path.sep).join('/'))
		.sort();
}

function readDurations(): Durations {
	return fs.existsSync(DURATIONS)
		? (JSON.parse(fs.readFileSync(DURATIONS, 'utf8')) as Durations)
		: {};
}

/** Longest file first into the lightest shard (ties: name, then the lower shard), so the split is deterministic. */
export function shards(
	files: string[],
	seconds: Record<string, number>,
	total: number,
): string[][] {
	const known = files.map((f) => seconds[f]).filter((s): s is number => s !== undefined);
	const fallback = known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : 1;
	const weight = (f: string): number => seconds[f] ?? fallback;
	const bins = Array.from({ length: total }, () => ({ load: 0, files: [] as string[] }));
	const order = [...files].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b));
	for (const file of order) {
		const bin = bins.reduce((min, b) => (b.load < min.load ? b : min));
		bin.files.push(file);
		bin.load += weight(file);
	}
	return bins.map((b) => b.files.sort());
}

interface ReportResult {
	startTime: string;
	duration: number;
}

interface ReportSuite {
	file?: string;
	specs?: { tests: { projectName: string; results: ReportResult[] }[] }[];
	suites?: ReportSuite[];
}

interface Report {
	suites: ReportSuite[];
	stats: { startTime: string; duration: number };
}

/**
 * Seconds per project and spec file (relative to e2e/) from Playwright JSON reports. A test counts from its start to
 * the next test's start, so a file also carries its hooks (a reseed takes seconds on CI) and the page setup between
 * tests, which a test's own duration leaves out. Every attempt counts.
 */
function fromReports(reports: string[]): Durations {
	const out: Durations = {};
	for (const report of reports) {
		const json = JSON.parse(fs.readFileSync(report, 'utf8')) as Report;
		const runs: { project: string; file: string; start: number; duration: number }[] = [];
		const walk = (suite: ReportSuite, file: string | undefined): void => {
			const f = suite.file ?? file;
			for (const spec of suite.specs ?? []) {
				for (const t of spec.tests) {
					if (f === undefined || !SPEC.test(f)) continue;
					for (const r of t.results) {
						runs.push({
							project: t.projectName,
							file: f,
							start: Date.parse(r.startTime),
							duration: r.duration,
						});
					}
				}
			}
			for (const child of suite.suites ?? []) walk(child, f);
		};
		for (const suite of json.suites) walk(suite, undefined);
		runs.sort((a, b) => a.start - b.start);
		const end = Date.parse(json.stats.startTime) + json.stats.duration;
		runs.forEach((run, i) => {
			const next = runs[i + 1]?.start ?? end;
			const ms = Math.max(run.duration, next - run.start);
			const project = (out[run.project] ??= {});
			project[run.file] = (project[run.file] ?? 0) + ms / 1000;
		});
	}
	return out;
}

function main(args: string[]): void {
	const [first, ...rest] = args;
	if (first === 'update') {
		if (rest.length === 0) throw new Error('update takes one or more Playwright JSON reports');
		// File by file: a report of some shards updates their files and keeps the others; deleted specs drop out.
		const merged = readDurations();
		const exists = new Set(specFiles());
		for (const [project, files] of Object.entries(fromReports(rest))) {
			const rounded = Object.entries(files).map(([f, s]) => [f, Math.round(s)] as const);
			merged[project] = Object.fromEntries(
				Object.entries({ ...merged[project], ...Object.fromEntries(rounded) })
					.filter(([f]) => exists.has(f))
					.sort(([a], [b]) => a.localeCompare(b)),
			);
		}
		fs.writeFileSync(DURATIONS, `${JSON.stringify(merged, null, '\t')}\n`);
		process.stdout.write(
			`wrote ${path.relative(WEB, DURATIONS)}: ${Object.keys(merged).join(', ')}\n`,
		);
		return;
	}
	const [n, total] = rest.map(Number);
	if (
		first === undefined ||
		n === undefined ||
		total === undefined ||
		!Number.isInteger(n) ||
		!Number.isInteger(total) ||
		n < 1 ||
		n > total
	) {
		throw new Error('usage: node e2e/shards.ts <project> <n> <total> | update <report.json>…');
	}
	const files = specFiles();
	const split = shards(files, readDurations()[first] ?? {}, total);
	if (split.flat().length !== files.length)
		throw new Error('a spec file is missing from the shards');
	const mine = split[n - 1] ?? [];
	if (mine.length === 0)
		throw new Error(`shard ${String(n)}/${String(total)} of ${first} is empty`);
	process.stdout.write(mine.map((f) => `e2e/${f}\n`).join(''));
}

if (import.meta.filename === path.resolve(process.argv[1] ?? '')) main(process.argv.slice(2));
