// verify (plan section 14): per-file counts and canonical sha256 between two v1 snapshots (a directory, or a
// deployment exported in memory). Zero differences is the only pass. Raw byte equality is reported too, as
// information: Convex does not keep field order (spike S14), so trip files can differ in key order only.
import { manifestOf, type Manifest } from './canonical.ts';
import { V1_FILES } from './tables.ts';
import type { V1Files } from './v1/files.ts';

export interface FileComparison {
	file: string;
	countA: number;
	countB: number;
	sameCount: boolean;
	sameCanonical: boolean;
	/** Same bytes, or both absent. */
	sameRaw: boolean;
}

export interface VerifyResult {
	ok: boolean;
	differences: number;
	files: FileComparison[];
	manifestA: Manifest;
	manifestB: Manifest;
}

export function verifySnapshots(a: V1Files, b: V1Files): VerifyResult {
	const manifestA = manifestOf(a);
	const manifestB = manifestOf(b);
	const files = V1_FILES.map((file): FileComparison => {
		const da = manifestA[file];
		const db = manifestB[file];
		const countA = da?.count ?? 0;
		const countB = db?.count ?? 0;
		return {
			file,
			countA,
			countB,
			sameCount: countA === countB,
			sameCanonical: da?.sha256 !== undefined && da.sha256 === db?.sha256,
			sameRaw: da?.rawSha256 === db?.rawSha256,
		};
	});
	const differences = files.filter((f) => !f.sameCount || !f.sameCanonical).length;
	return { ok: differences === 0, differences, files, manifestA, manifestB };
}
