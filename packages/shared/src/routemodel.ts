// The Route tab's model (port of game/server.js routeModel / GET /api/route): legs in order with their stops, every
// city of each country that has coordinates (with the traveler's area verdict and how many of its places are must or
// maybe), the long-haul flights home and where the cached base images sit in world pixels. Pure: the SvelteKit load
// runs it on loaded content plus route.current, and the browser re-runs it on live data.
import type { CurrentLeg, CurrentStop, RouteStop } from './route.ts';
import { imageFrame, type ImageFrame, type Rect } from './routemap/geo.ts';
import type { Verdict } from './v1/feedback-types.ts';

/** A config/trip.yaml country leg, after normalizeConfigRoutes, as far as the model reads it. */
export interface RouteModelCountry {
	readonly id: string;
	readonly notes?: unknown;
	readonly route?: readonly RouteStop[] | undefined;
}

export interface RouteModelArea {
	readonly id: string;
	readonly country: string;
	readonly name: string;
	readonly lat?: unknown;
	readonly lng?: unknown;
	readonly scope?: unknown;
	readonly cities?: readonly string[] | undefined;
}

export interface RouteModelPlace {
	readonly id: string;
	readonly country: string;
	readonly city: string;
}

export interface RouteModelInput {
	/** Countries of config/trip.yaml (after normalizeConfigRoutes). */
	countries: readonly RouteModelCountry[];
	areas: readonly RouteModelArea[];
	places: readonly RouteModelPlace[];
	/** route.current countries (currentRoute output). */
	route: readonly CurrentLeg[];
	/** Latest verdict per place and area id. */
	verdicts: {
		readonly area: Readonly<Record<string, Verdict>>;
		readonly place: Readonly<Record<string, Verdict>>;
	};
	/** traveler.home from the config. */
	home: unknown;
	/** cfg.warnings from loadTripConfig. */
	warnings?: readonly string[];
	/** True when the site runs on test content. */
	fixtures?: boolean;
}

export interface PlaceCounts {
	must: number;
	maybe: number;
	total: number;
}

export interface RouteCity {
	area: string;
	name: string;
	lat: number;
	lng: number;
	hasPage: boolean;
	scope: string;
	verdict: Verdict | null;
	places: PlaceCounts;
}

export type RouteModelStop = CurrentStop & { verdict: Verdict | null; places: PlaceCounts };

export type RouteModelLeg = Omit<CurrentLeg, 'stops'> & {
	notes: string;
	seed: { area: string; nights: number | null }[];
	stops: RouteModelStop[];
	cities: RouteCity[];
};

export interface RouteFrame {
	url: string;
	rect: Rect;
}

/** Everything /route-map/<key>.webp needs to render a frame (staticMap arguments). */
export interface RouteFrameArgs {
	key: string;
	url: string;
	rect: Rect;
	args: { lat: number; lng: number; zoom: number; width: number; height: number };
}

export interface LongHaul {
	in: { from: string; country: string; date: string };
	out: { to: string; country: string; date: string; booked: boolean };
}

export interface RouteModel {
	countries: RouteModelLeg[];
	longHaul: LongHaul | null;
	frames: Record<string, RouteFrame | null>;
	warnings: string[];
	fixtures: boolean;
}

interface Located {
	lat: number;
	lng: number;
}

const located = (o: { lat?: unknown; lng?: unknown } | null | undefined): o is Located =>
	typeof o?.lat === 'number' && typeof o.lng === 'number';

const titleCase = (s: string): string =>
	s
		.split('-')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');

/** The base image of a set of cities, with its /route-map URL (game/server.js frame). */
export function routeFrame(key: string, points: readonly Located[]): RouteFrameArgs | null {
	const f: ImageFrame | null = imageFrame(points);
	if (f === null) return null;
	return {
		key,
		url: `/route-map/${key}.webp?v=${String(f.zoom)}_${String(f.lat)}_${String(f.lng)}_${String(f.width)}`,
		rect: f.rect,
		args: { lat: f.lat, lng: f.lng, zoom: f.zoom, width: f.width, height: f.height },
	};
}

/** Every frame of the model by key (`overview` and one per country), with the render arguments. */
export function routeFrames(
	countries: readonly Pick<RouteModelLeg, 'id' | 'cities'>[],
): Record<string, RouteFrameArgs | null> {
	const frames: Record<string, RouteFrameArgs | null> = {
		overview: routeFrame(
			'overview',
			countries.flatMap((c) => c.cities),
		),
	};
	for (const c of countries) frames[c.id] = routeFrame(c.id, c.cities);
	return frames;
}

/** The Route tab model, equal to the old GET /api/route body. */
export function routeModel(input: RouteModelInput): RouteModel {
	const { verdicts } = input;
	const placesIn = (country: string, cities: readonly string[]): PlaceCounts => {
		const xs = input.places.filter((p) => p.country === country && cities.includes(p.city));
		return {
			must: xs.filter((p) => verdicts.place[p.id] === 'must').length,
			maybe: xs.filter((p) => verdicts.place[p.id] === 'maybe').length,
			total: xs.length,
		};
	};
	const countries = input.route.map((r): RouteModelLeg => {
		const cfgC = input.countries.find((c) => c.id === r.id);
		const seedStops = cfgC?.route ?? [];
		const cities: RouteCity[] = input.areas
			.filter((a): a is RouteModelArea & Located => a.country === r.id && located(a))
			.map((a) => ({
				area: a.id,
				name: a.name,
				lat: a.lat,
				lng: a.lng,
				hasPage: true,
				scope: typeof a.scope === 'string' && a.scope !== '' ? a.scope : 'city',
				verdict: verdicts.area[a.id] ?? null,
				places: placesIn(r.id, a.cities !== undefined && a.cities.length > 0 ? a.cities : [a.id]),
			}));
		// Stops with no area file (config-only, e.g. Hong Kong) are cities too.
		for (const s of [...seedStops, ...r.stops]) {
			if (cities.some((c) => c.area === s.area) || !located(s)) continue;
			cities.push({
				area: s.area,
				name: s.name !== undefined && s.name !== '' ? s.name : titleCase(s.area),
				lat: s.lat,
				lng: s.lng,
				hasPage: false,
				scope: 'city',
				verdict: null,
				places: placesIn(r.id, [s.area]),
			});
		}
		const byArea = new Map(cities.map((c) => [c.area, c]));
		const stops = r.stops.map((s) => ({
			...s,
			verdict: byArea.get(s.area)?.verdict ?? null,
			places: byArea.get(s.area)?.places ?? placesIn(r.id, [s.area]),
		}));
		const notes = cfgC?.notes;
		return {
			...r,
			notes: typeof notes === 'string' ? notes : '',
			seed: seedStops.map((s) => ({ area: s.area, nights: s.nights ?? null })),
			stops,
			cities,
		};
	});
	const frames = routeFrames(countries);
	const home = typeof input.home === 'string' ? input.home : '';
	const homeCity = /são paulo|sao paulo/i.test(home)
		? 'São Paulo'
		: home.replace(/\s*\(.*$/, '') || 'home';
	const first = countries[0];
	const last = countries.at(-1);
	return {
		countries,
		longHaul:
			first !== undefined && last !== undefined
				? {
						in: { from: homeCity, country: first.id, date: first.from },
						out: {
							to: homeCity,
							country: last.id,
							date: last.to,
							booked: !/not booked/i.test(last.notes),
						},
					}
				: null,
		frames: Object.fromEntries(
			Object.entries(frames).map(([k, f]) => [k, f && { url: f.url, rect: f.rect }]),
		),
		warnings: [...(input.warnings ?? [])],
		fixtures: input.fixtures ?? false,
	};
}
