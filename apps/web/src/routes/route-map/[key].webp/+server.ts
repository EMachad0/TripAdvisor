// GET /route-map/:key.webp: one base image of the route map (`overview` or a country leg), stitched from cached
// OSM tiles on first request and cached (max-age=86400), as the old server did. The `?v=` query only busts the
// browser cache. Unknown keys and failed renders are the old JSON 404.
import { frameOf } from '#lib/features/routemap/frames.js';
import { getContent } from '#lib/server/content.js';
import { MAP_CACHE_CONTROL, routeMap } from '#lib/server/maps.js';
import { fileResponse } from '../../media/serve.server.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const frame = frameOf(getContent().payload, params.key);
	const map = frame === null ? null : await routeMap(frame).catch(() => null);
	return fileResponse(map?.file, MAP_CACHE_CONTROL);
};
