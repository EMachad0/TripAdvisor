// Plain-text tables and the on-disk report folder. Reports can quote traveler data (quarantined lines), so they
// go under the repo's gitignored .cache/ with mode 700/600.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Snapshot } from './snapshot.ts';
import { tableCounts } from './snapshot.ts';
import {
	EVENT_KINDS,
	EVENT_TABLES,
	eventFile,
	STATE_FILE,
	TRIP_COLLECTIONS,
	TRIP_TABLES,
	tripFile,
	type DataTable,
} from './tables.ts';
import type { VerifyResult } from './verify.ts';

export function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
	const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
	const line = (cells: readonly string[]): string =>
		cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i] ?? 0))).join('  ');
	return [line(header), ...rows.map(line)].join('\n');
}

/** The v1 file a table comes from. */
export function sourceOf(t: DataTable): string {
	if (t === 'gameState') return STATE_FILE;
	if (t === 'firstSeen') return `${STATE_FILE} (firstSeen keys)`;
	const kind = EVENT_KINDS.find((k) => EVENT_TABLES[k] === t);
	if (kind !== undefined) return eventFile(kind);
	const col = TRIP_COLLECTIONS.find((c) => TRIP_TABLES[c] === t);
	return col === undefined ? '?' : tripFile(col);
}

export function countsTable(counts: ReadonlyMap<DataTable, number>): string {
	return table(
		['table', 'source', 'rows'],
		[...counts].map(([t, n]) => [t, sourceOf(t), String(n)]),
	);
}

const sum = (r: Readonly<Record<string, number>>): number =>
	Object.values(r).reduce((a, b) => a + b, 0);

export function snapshotSummary(s: Snapshot): string {
	const lines = [countsTable(tableCounts(s.rows)), ''];
	lines.push(
		`quarantine: ${String(s.quarantine.length)} · trip docs without a string id: ${String(sum(s.droppedNoId))} · null trip fields dropped: ${String(sum(s.droppedNulls))}`,
	);
	for (const q of s.quarantine.slice(0, 20))
		lines.push(`  ${q.file}${q.line === null ? '' : `:${String(q.line)}`}  ${q.reason}`);
	if (s.quarantine.length > 20)
		lines.push(`  … ${String(s.quarantine.length - 20)} more in quarantine.jsonl`);
	return lines.join('\n');
}

export function verifyTable(r: VerifyResult, labels: readonly [string, string]): string {
	const body = table(
		['file', `${labels[0]} count`, `${labels[1]} count`, 'canonical', 'bytes'],
		r.files.map((f) => [
			f.file,
			String(f.countA),
			String(f.countB),
			f.sameCanonical ? 'same' : 'DIFFERS',
			f.sameRaw ? 'same' : 'differ',
		]),
	);
	return `${body}\n\n${r.ok ? 'verify: 0 differences' : `verify: ${String(r.differences)} difference(s)`}`;
}

export async function reportDir(
	root: string,
	command: string,
	now: Date = new Date(),
): Promise<string> {
	const stamp = now
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}Z$/, 'Z');
	const dir = path.join(root, '.cache', 'migrate', `${stamp}-${command}`);
	await fs.mkdir(dir, { recursive: true, mode: 0o700 });
	return dir;
}

export async function writeReportFile(dir: string, name: string, text: string): Promise<string> {
	const file = path.join(dir, name);
	await fs.writeFile(file, text, { mode: 0o600 });
	return file;
}
