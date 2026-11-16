// GET /assets/*: atr.css and its fonts for the platform pages (old Cache-Control: max-age=3600). Written once per
// process by the platform's copyAssets into <map cache>/game-assets, as the old server did at start.
import fs from 'node:fs';
import path from 'node:path';
import { mapCacheDir } from '#lib/server/maps.js';
import * as platform from '#lib/server/platform.js';
import { fileResponse, inside } from '../../media/serve.server.js';
import type { RequestHandler } from './$types';

const { copyAssets } = platform as typeof platform & { copyAssets: (dir: string) => string };

let dir: string | null = null;
function assetsDir(): string {
	if (dir === null) {
		const target = path.join(mapCacheDir(), 'game-assets');
		fs.mkdirSync(target, { recursive: true });
		dir = copyAssets(target);
	}
	return dir;
}

export const GET: RequestHandler = ({ params }) =>
	fileResponse(inside(assetsDir(), params.path), 'max-age=3600');
