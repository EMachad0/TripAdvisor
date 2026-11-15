// The export bundle: every v1 file plus its manifest in one JSON value. GET /ops/export returns it,
// `@atr/migrate export-v1 --bundle` writes it, and `./atr feedback pull` / `./atr trip pull`
// (platform/lib/feedback/pull.js, the same checks in plain JS) read it. Format:
//   { "format": "atr-v1-bundle", "version": 1, "generatedAt": "<ISO>",
//     "files": { "feedback/swipes.jsonl": { "count": n, "sha256": "<hex of the UTF-8 bytes>", "content": "..." } } }
import type { V1Files } from './export.ts';
import { isJsonObject, type Json } from './json.ts';

export const BUNDLE_FORMAT = 'atr-v1-bundle';

export interface BundleFile {
	/** Lines (JSONL), documents (trip/*.json) or firstSeen keys (game-state.json). */
	count: number;
	sha256: string;
	content: string;
}

export interface Bundle {
	format: typeof BUNDLE_FORMAT;
	version: 1;
	generatedAt: string;
	files: Record<string, BundleFile>;
}

/** Lowercase hex sha256 of a string's UTF-8 bytes. Injected: Node and Web Crypto spell it differently. */
export type Sha256 = (text: string) => string | Promise<string>;

/** The record count of a v1 file, as the manifest states it (pull.js countOf). Throws on a broken file. */
export function countOf(path: string, content: string): number {
	if (path.endsWith('.jsonl')) return content.split('\n').filter((l) => l.trim() !== '').length;
	const value = JSON.parse(content) as Json;
	if (path.endsWith('/game-state.json')) {
		const seen = isJsonObject(value) ? value['firstSeen'] : undefined;
		return isJsonObject(seen) ? Object.keys(seen).length : 0;
	}
	if (!Array.isArray(value)) throw new Error(`${path}: not a JSON array`);
	return value.length;
}

/** Wrap files with their counts and hashes. `generatedAt` is an ISO timestamp. */
export async function toBundle(
	files: V1Files,
	sha256: Sha256,
	generatedAt: string,
): Promise<Bundle> {
	const out: Record<string, BundleFile> = {};
	for (const [path, content] of files) {
		out[path] = { count: countOf(path, content), sha256: await sha256(content), content };
	}
	return { format: BUNDLE_FORMAT, version: 1, generatedAt, files: out };
}
