// A v1 snapshot as a map of relative path -> file text (feedback/*.jsonl, feedback/game-state.json,
// trip/*.json), read from or written to a directory with the same layout as /data.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { v1 } from '@atr/shared';
import { V1_FILES } from '../tables.ts';

export type V1Files = v1.V1Files;

/** Reads every known v1 file that exists under `dir`; other files are ignored. */
export async function readV1Dir(dir: string): Promise<V1Files> {
	const stat = await fs.stat(dir).catch(() => null);
	if (stat?.isDirectory() !== true) throw new Error(`not a directory: ${dir}`);
	const out = new Map<string, string>();
	for (const rel of V1_FILES) {
		const text = await fs.readFile(path.join(dir, rel), 'utf8').catch((error: unknown) => {
			if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
			throw error;
		});
		if (text !== null) out.set(rel, text);
	}
	return out;
}

/**
 * Writes the files under `dir`, which must not exist or be empty (an export never mixes with older files).
 * Each file goes through a temp name and a rename, mode 600: these are traveler data.
 */
export async function writeV1Dir(dir: string, files: V1Files): Promise<void> {
	const existing = await fs.readdir(dir).catch(() => []);
	if (existing.length > 0) throw new Error(`refusing to write into a non-empty directory: ${dir}`);
	for (const [rel, text] of files) {
		const target = path.join(dir, rel);
		await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
		const tmp = `${target}.${String(process.pid)}.tmp`;
		await fs.writeFile(tmp, text, { mode: 0o600 });
		await fs.rename(tmp, target);
	}
}
