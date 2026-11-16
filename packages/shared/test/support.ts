// Test support: the old JS modules (typed as their TS ports, so a missing or renamed export shows up as a
// failing call), the sample data and a seeded random source.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The repo (worktree) root. */
export const ROOT = path.resolve(import.meta.dirname, '../../..');
/** platform/test/site-fixtures (places, areas, answers; no trip/ and an empty feedback/). */
export const FIXTURES = path.join(ROOT, 'platform/test/site-fixtures');
/**
 * Where the real feedback/ and trip/ files are read from: the repo copies by default, or another snapshot
 * (e.g. the main checkout, or a live pull under .cache/) through ATR_SAMPLE_ROOT.
 */
export const SAMPLE_ROOT = path.resolve(process.env['ATR_SAMPLE_ROOT'] ?? ROOT);

/** Import an old module by its repo path, typed as the port that must behave the same. */
export async function legacy<T>(rel: string): Promise<T> {
	const mod: unknown = await import(pathToFileURL(path.join(ROOT, rel)).href);
	return mod as T;
}

export const readText = (file: string): string => fs.readFileSync(file, 'utf8');
export const sampleFile = (...parts: string[]): string => path.join(SAMPLE_ROOT, ...parts);
export const tmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'atr-shared-'));

/** Non-empty lines of a sample JSONL file, parsed. */
export function sampleJsonl(name: string): Record<string, unknown>[] {
	const file = sampleFile('feedback', `${name}.jsonl`);
	if (!fs.existsSync(file)) return [];
	return readText(file)
		.split('\n')
		.filter((l) => l.trim() !== '')
		.map((l) => JSON.parse(l) as Record<string, unknown>);
}

/** A sample trip collection, as the old store reads it. */
export function sampleTrip(col: string): Record<string, unknown>[] {
	const raw = JSON.parse(readText(sampleFile('trip', `${col}.json`))) as unknown;
	return Array.isArray(raw)
		? raw.filter(
				(x): x is Record<string, unknown> =>
					typeof x === 'object' && x !== null && typeof (x as { id?: unknown }).id === 'string',
			)
		: [];
}

/** Deterministic random source in [0, 1) (mulberry32). Two calls with one seed give the same sequence. */
export function seeded(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** A deep copy (so a function that mutates its input gets its own). */
export const clone = <T>(v: T): T => structuredClone(v);
