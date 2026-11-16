// Which part of the world the map shows (port of game.js viewRect, targetView and the tap-a-country rule).
import { TILE, WORLD_Z, boundsOf, fitView, project, type Rect } from '@atr/shared/routemap';
import { WHOLE_TRIP, type Leg, type MapView } from './model.ts';

const WORLD = 2 ** WORLD_Z * TILE;

/** The world rect to show: the whole trip, or one country's stops and its Must and Maybe cities. */
export function viewRect(legs: readonly Leg[], view: MapView, skipped: boolean): Rect | null {
	const all = view === WHOLE_TRIP;
	const pick = all ? legs : legs.filter((l) => l.c.id === view);
	const pts: { lat: number | null; lng: number | null }[] = pick.flatMap((l) => [
		...l.stops.filter((s) => s.located),
		...l.others.filter((x) => x.verdict === 'must' || x.verdict === 'maybe' || (skipped && !all)),
	]);
	if (pts.length === 0) pts.push(...pick.flatMap((l) => l.c.cities));
	const b = boundsOf(pts, { min: ((all ? 8 : 0.9) / 360) * WORLD });
	if (b === null) return null;
	// room at the bottom for the long-haul stub and its label
	if (all) b.h *= 1.1;
	return b;
}

/** The viewBox (world px) for a view in a W×H map; null before the map has a size. */
export function targetView(
	legs: readonly Leg[],
	view: MapView,
	skipped: boolean,
	W: number,
	H: number,
): Rect | null {
	const r = viewRect(legs, view, skipped);
	return r !== null && W > 0 && H > 0
		? fitView(r, W, H, { pad: view === WHOLE_TRIP ? 0.07 : 0.16 })
		: null;
}

/**
 * Tapping the map away from any pin: the country of the nearest city within reach (90 px on the whole trip, 60 px
 * zoomed in), unless that is the one already shown. x and y are screen px inside the map.
 */
export function countryAt(
	legs: readonly Leg[],
	vb: Rect,
	W: number,
	x: number,
	y: number,
	view: MapView,
): string | null {
	const k = W / vb.w;
	let best: string | null = null;
	let bestD = Infinity;
	for (const l of legs) {
		const pts: { lat: number | null; lng: number | null }[] = [
			...l.stops.filter((s) => s.located),
			...l.c.cities,
		];
		for (const c of pts) {
			if (c.lat === null || c.lng === null) continue;
			const p = project(c.lat, c.lng);
			const d = Math.hypot((p.x - vb.x) * k - x, (p.y - vb.y) * k - y);
			if (d < bestD) {
				bestD = d;
				best = l.c.id;
			}
		}
	}
	return best !== null && bestD < (view === WHOLE_TRIP ? 90 : 60) && best !== view ? best : null;
}
