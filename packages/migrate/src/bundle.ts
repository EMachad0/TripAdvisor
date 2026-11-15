// The export bundle (format in @atr/shared v1/bundle.ts): what `export-v1 --bundle` writes and what
// `./atr feedback pull` / `./atr trip pull` read. Hashing is Node's here; GET /ops/export uses Web Crypto.
import { createHash } from 'node:crypto';
import { v1 } from '@atr/shared';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** The bundle of a set of v1 files; generatedAt is second precision (like every v1 timestamp). */
export async function toBundle(files: v1.V1Files, now: Date = new Date()): Promise<v1.Bundle> {
	return await v1.toBundle(files, sha256, now.toISOString().replace(/\.\d{3}Z$/, 'Z'));
}
