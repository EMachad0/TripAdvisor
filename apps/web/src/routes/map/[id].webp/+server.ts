// GET /map/:placeId.webp: the static map of a place, rendered on first request and cached (max-age=86400).
import { MAP_CACHE_CONTROL, placeMap } from '#lib/server/maps.js';
import { fileResponse } from '../../media/serve.server.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) =>
	fileResponse((await placeMap(params.id).catch(() => null))?.file, MAP_CACHE_CONTROL);
