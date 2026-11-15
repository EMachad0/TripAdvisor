// Backend glue for the route: the content index as the route port's input, and two small rules of game/server.js
// that only the server needs (the no-op save check and the Home line). The route logic itself (currentRoute,
// stopsErrors, clean) is @atr/shared's port of platform/lib/route.js.
import { currentRoute, type CurrentLeg, type CurrentStop, type RouteStop } from '@atr/shared/route';
import type { ContentIndex } from '../state';

export interface RouteEventRow {
	ts: string;
	country: string;
	stops: RouteStop[];
}

/** The current route per country leg, in trip order, from contentIndex.legs seeds and the route events. */
export function routeFromIndex(
	index: ContentIndex,
	events: readonly RouteEventRow[],
): CurrentLeg[] {
	const countries = index.legs.map((leg) => ({
		id: leg.country,
		from: leg.from,
		to: leg.to,
		route: leg.routeSeed,
	}));
	return currentRoute({ cfg: { countries }, areas: index.areas, events });
}

/** True when a save would not change the route: same areas and nights, in the same order. */
export function sameStops(current: readonly CurrentStop[], next: readonly RouteStop[]): boolean {
	return (
		current.length === next.length &&
		current.every((s, i) => s.area === next[i]?.area && s.nights === (next[i].nights ?? null))
	);
}

export interface RouteSummary {
	stops: number;
	unplaced: number;
	legs: number;
	edited: boolean;
}

interface AreaRef {
	id: string;
	country: string;
}

/** Home line: stops placed, must cities not placed yet (game/server.js routeSummary). */
export function routeSummary(
	route: readonly CurrentLeg[],
	areas: readonly AreaRef[],
	areaVerdicts: Readonly<Record<string, string>>,
): RouteSummary {
	const inRoute = new Set(route.flatMap((r) => r.stops.map((s) => `${r.id}/${s.area}`)));
	const legs = new Set(route.map((r) => r.id));
	const unplaced = areas.filter(
		(a) =>
			legs.has(a.country) && areaVerdicts[a.id] === 'must' && !inRoute.has(`${a.country}/${a.id}`),
	).length;
	return {
		stops: inRoute.size,
		unplaced,
		legs: route.length,
		edited: route.some((r) => r.source === 'game'),
	};
}
