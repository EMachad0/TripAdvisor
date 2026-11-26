// GET /tiles/:z/:x/:y.png: one OpenStreetMap tile for the city map (Leaflet in the browser), served from the server's
// tile cache (#lib/server/maps.ts osmTile: same cache, User-Agent, retries and ATR_OFFLINE as the static maps), so
// the browser never talks to a third party. Behind the sign-in guard like /route-map. A bad address, or a tile that
// is not cached while offline or that the tile server refuses, is the JSON 404.
import { osmTile } from '#lib/server/maps.js';
import { parseTile, TILE_CACHE_CONTROL } from '#lib/server/tiles.js';
import { notFound } from '../../../../media/serve.server.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const t = parseTile(params.z, params.x, params.y);
	if (t === null) return notFound();
	const body = await osmTile(t.z, t.x, t.y).catch(() => null);
	if (body === null) return notFound();
	return new Response(new Uint8Array(body), {
		status: 200,
		headers: { 'content-type': 'image/png', 'cache-control': TILE_CACHE_CONTROL },
	});
};
