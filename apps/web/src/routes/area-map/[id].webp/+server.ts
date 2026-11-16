// GET /area-map/:areaId.webp: the static map of an area (zoom 7 for a region, else 10), cached (max-age=86400).
import { areaMap, MAP_CACHE_CONTROL } from '#lib/server/maps.js';
import { fileResponse } from '../../media/serve.server.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) =>
	fileResponse((await areaMap(params.id).catch(() => null))?.file, MAP_CACHE_CONTROL);
