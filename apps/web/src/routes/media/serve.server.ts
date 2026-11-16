// Serving files from disk the way the old server did (game/server.js send / sendFile / inside): a path that leaves
// its base folder, or a missing file, is a JSON 404 with Cache-Control: no-store; a file goes out with its type
// and the route's Cache-Control. Shared by /media, /area-media, /map, /area-map and /assets.
import fs from 'node:fs';
import path from 'node:path';

const TYPES: Readonly<Record<string, string>> = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.webp': 'image/webp',
	'.woff2': 'font/woff2',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.json': 'application/json',
};

/** `rel` resolved under `base`, or null when it points outside it (or at base itself). */
export function inside(base: string, rel: string): string | null {
	const f = path.resolve(base, rel);
	return f.startsWith(path.resolve(base) + path.sep) ? f : null;
}

/** The old JSON 404. */
export function notFound(): Response {
	return Response.json(
		{ error: 'not found' },
		{ status: 404, headers: { 'cache-control': 'no-store' } },
	);
}

/** The file with its content type and `cache`, or the JSON 404 when it is not a regular file. */
export async function fileResponse(
	file: string | null | undefined,
	cache: string,
): Promise<Response> {
	if (file === null || file === undefined) return notFound();
	let body: Buffer;
	try {
		if (!fs.statSync(file).isFile()) return notFound();
		body = await fs.promises.readFile(file);
	} catch {
		return notFound();
	}
	return new Response(new Uint8Array(body), {
		status: 200,
		headers: {
			'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
			'cache-control': cache,
		},
	});
}

/** Old media file names: one path segment ending in .webp. */
export const WEBP_FILE = /^[^/]+\.webp$/;
