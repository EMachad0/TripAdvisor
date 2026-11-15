// export-v1 (plan section 14, also the rollback tool): rebuild the v1 files from a deployment through the shared
// codec, the same function GET /ops/export runs inside Convex (@atr/shared v1 exportV1Files).
import { v1 } from '@atr/shared';
import type { Deployment } from './deployment/types.ts';

export async function exportV1(deployment: Deployment): Promise<v1.V1Files> {
	return await v1.exportV1Files(async (table) => await deployment.readTable(table));
}
