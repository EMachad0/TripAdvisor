// @atr/migrate: import, dry run, export-v1 and verify for moving feedback/ and trip/ into Convex (plan section 14).
export { toBundle } from './bundle.ts';
export { manifestOf, type FileDigest, type Manifest } from './canonical.ts';
export { main } from './cli.ts';
export { ConvexAdmin, type ConvexTarget } from './deployment/convex.ts';
export { MemoryDeployment } from './deployment/memory.ts';
export type { Deployment } from './deployment/types.ts';
export { exportV1 } from './exportV1.ts';
export { importSnapshot, type ImportOptions } from './importer.ts';
export { loadTableValidators } from './schema.ts';
export { parseSnapshot, tableCounts, type QuarantineEntry, type Snapshot } from './snapshot.ts';
export { readV1Dir, writeV1Dir, type V1Files } from './v1/files.ts';
export { verifySnapshots, type VerifyResult } from './verify.ts';
