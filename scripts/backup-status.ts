// Backup freshness (plan section 13): the same checks as .github/workflows/backup-freshness.yml, runnable anywhere.
//
//   node scripts/backup-status.ts --dest <dir | remote:path> [--max-age-hours 26] [--min-free-gb 2]
//
// --dest is BACKUP_DEST of deploy/backup/backup.sh: a local directory, or an rclone remote path read with
// `rclone lsf` / `rclone cat` (a read-only key is enough). It fails (exit 1) when the newest convex/ object is older
// than the limit, or when the newest status/ object reports less free disk than the limit. old/ (the retired old
// site's /data) is not checked: that leg stops once OLD_DATA_DIR is unset. --convex is accepted and ignored (the
// Convex leg is always checked now), so older runbooks still work. Object keys are `<prefix>/<UTC YYYYMMDDTHHMMSSZ>.<ext>`, so the newest is the greatest key.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

export interface StatusObject {
	ts: string;
	diskFreeBytes: number;
}

export interface Snapshot {
	/** Newest key name (without the prefix) per prefix, or null when the prefix is empty. */
	newest: Record<string, string | null>;
	status: StatusObject | null;
}

export interface Limits {
	maxAgeHours: number;
	minFreeBytes: number;
	prefixes: readonly string[];
}

export interface Check {
	name: string;
	ok: boolean;
	detail: string;
}

const KEY = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z(?:\.|$)/;

/** The UTC time a key such as `20261115T161700Z.tar.age` was taken, or null when it is not a backup key. */
export function keyTime(key: string): Date | null {
	const m = KEY.exec(key);
	if (m === null) return null;
	const [, y, mo, d, h, mi, s] = m.map(Number);
	if ([y, mo, d, h, mi, s].some((n) => n === undefined || Number.isNaN(n))) return null;
	const t = Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, s ?? 0);
	return Number.isNaN(t) ? null : new Date(t);
}

/** The greatest backup key of a listing (other names are ignored). */
export function newestKey(names: readonly string[]): string | null {
	const keys = names.filter((n) => keyTime(n) !== null).sort();
	return keys.at(-1) ?? null;
}

export function parseStatus(text: string): StatusObject | null {
	try {
		const value: unknown = JSON.parse(text);
		if (typeof value !== 'object' || value === null) return null;
		const { ts, diskFreeBytes } = value as Record<string, unknown>;
		if (typeof ts !== 'string' || typeof diskFreeBytes !== 'number') return null;
		return { ts, diskFreeBytes };
	} catch {
		return null;
	}
}

const hours = (ms: number): string => `${(ms / 3_600_000).toFixed(1)} h`;
const gb = (bytes: number): string => `${(bytes / 1e9).toFixed(1)} GB`;

export function evaluate(snapshot: Snapshot, limits: Limits, now: Date): Check[] {
	const checks: Check[] = [];
	for (const prefix of limits.prefixes) {
		const key = snapshot.newest[prefix] ?? null;
		const at = key === null ? null : keyTime(key);
		if (key === null || at === null) {
			checks.push({ name: `${prefix}/`, ok: false, detail: 'no backup object' });
			continue;
		}
		const age = now.getTime() - at.getTime();
		checks.push({
			name: `${prefix}/`,
			ok: age <= limits.maxAgeHours * 3_600_000,
			detail: `newest ${key}, ${hours(age)} old (limit ${String(limits.maxAgeHours)} h)`,
		});
	}
	const status = snapshot.status;
	if (status === null) {
		checks.push({ name: 'status/', ok: false, detail: 'no readable status object' });
	} else {
		checks.push({
			name: 'status/',
			ok: status.diskFreeBytes >= limits.minFreeBytes,
			detail: `${gb(status.diskFreeBytes)} free on the VPS at ${status.ts} (limit ${gb(limits.minFreeBytes)})`,
		});
	}
	return checks;
}

/** Lists and reads a backup destination: a local directory or an rclone remote path. */
export interface Store {
	list(prefix: string): string[];
	read(key: string): string;
}

export function localStore(root: string): Store {
	return {
		list: (prefix) => {
			const dir = path.join(root, prefix);
			return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
		},
		read: (key) => fs.readFileSync(path.join(root, key), 'utf8'),
	};
}

export function rcloneStore(remote: string): Store {
	const rclone = (args: string[]): string =>
		execFileSync('rclone', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
	return {
		list: (prefix) =>
			rclone(['lsf', '--files-only', `${remote}/${prefix}/`])
				.split('\n')
				.filter((l) => l !== ''),
		read: (key) => rclone(['cat', `${remote}/${key}`]),
	};
}

export function snapshotOf(store: Store, prefixes: readonly string[]): Snapshot {
	const newest: Record<string, string | null> = {};
	for (const prefix of prefixes) newest[prefix] = newestKey(store.list(prefix));
	const statusKey = newestKey(store.list('status'));
	return {
		newest,
		status: statusKey === null ? null : parseStatus(store.read(`status/${statusKey}`)),
	};
}

export function main(argv: readonly string[], now: Date = new Date()): number {
	const { values } = parseArgs({
		args: [...argv],
		options: {
			dest: { type: 'string' },
			convex: { type: 'boolean' },
			'max-age-hours': { type: 'string', default: '26' },
			'min-free-gb': { type: 'string', default: '2' },
		},
	});
	const dest = values.dest ?? process.env['BACKUP_DEST'];
	if (dest === undefined || dest === '') {
		console.error('backup-status: --dest <dir | remote:path> (or BACKUP_DEST) is required');
		return 2;
	}
	const limits: Limits = {
		maxAgeHours: Number(values['max-age-hours']),
		minFreeBytes: Number(values['min-free-gb']) * 1e9,
		prefixes: ['convex'],
	};
	const store = path.isAbsolute(dest) ? localStore(dest) : rcloneStore(dest);
	const checks = evaluate(snapshotOf(store, limits.prefixes), limits, now);
	for (const c of checks)
		process.stdout.write(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(8)} ${c.detail}\n`);
	return checks.every((c) => c.ok) ? 0 : 1;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
