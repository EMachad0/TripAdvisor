// GET /tiles/<z>/<x>/<y>.png: which tile addresses the city map may ask for. Pure, so it is unit tested without a
// server. Zoom 2 to 18 (the city map's range; OSM's usage policy frowns on bulk z19), x and y inside the zoom's grid.

export const TILE_MIN_ZOOM = 2;
export const TILE_MAX_ZOOM = 18;
/** Behind the sign-in guard, so private; tiles change rarely, so a week. */
export const TILE_CACHE_CONTROL = 'private, max-age=604800';

const INT = /^(0|[1-9][0-9]{0,5})$/;

/** The tile address, or null when it is not one the endpoint serves (the route answers 404). */
export function parseTile(
	z: string,
	x: string,
	y: string,
): { z: number; x: number; y: number } | null {
	if (!INT.test(z) || !INT.test(x) || !INT.test(y)) return null;
	const zn = Number(z);
	if (zn < TILE_MIN_ZOOM || zn > TILE_MAX_ZOOM) return null;
	const n = 2 ** zn;
	const xn = Number(x);
	const yn = Number(y);
	if (xn >= n || yn >= n) return null;
	return { z: zn, x: xn, y: yn };
}
