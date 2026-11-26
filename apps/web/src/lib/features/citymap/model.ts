// The city map's model (Trip → Map → a city): which places, stays and hubs a city has, how each pin is drawn, the
// filters, where the traveler gets in and out, and how a route stop finds its city. Pure: no Svelte, no Leaflet,
// unit tested in citymap.test.ts. The page joins it with live verdicts (app.feedback) and trip legs (trip.all).
import { dayKey, diffDays, legsSorted, stayCities } from '@atr/shared/trip';
import type { ContentArea, ContentPlace, Hub } from '#lib/content/types.js';
import type { TripLeg } from '#lib/features/trip/types.js';
import { fmtDate, fmtWeek } from '#lib/features/routemap/model.js';

export type Verdict = 'must' | 'maybe' | 'skip';
export type VerdictMap = Readonly<Record<string, Verdict | undefined>>;

export interface LatLng {
	lat: number;
	lng: number;
}

export const cityKey = (country: string, city: string): string => `${country}/${city}`;

// ---------------------------------------------------------------- which cities have a map

/** Places of one city (located or not), in content order. */
export const cityPlaces = (
	places: readonly ContentPlace[],
	country: string,
	city: string,
): ContentPlace[] => places.filter((p) => p.country === country && p.city === city);

/** Hubs of one city. */
export const cityHubs = (hubs: readonly Hub[], country: string, city: string): Hub[] =>
	hubs.filter((h) => h.country === country && h.city === city);

/** `country/city` of every city with at least one located place or one hub: the cities that get a map page. */
export function mapCities(places: readonly ContentPlace[], hubs: readonly Hub[]): Set<string> {
	const out = new Set<string>();
	for (const p of places) if (p.loc !== null) out.add(cityKey(p.country, p.city));
	for (const h of hubs) out.add(cityKey(h.country, h.city));
	return out;
}

const titleCase = (s: string): string =>
	s
		.split('-')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');

/** The city's display name: its area card, else a place's city name, else the id in title case. */
export function cityName(
	content: { areas: readonly ContentArea[]; places: readonly ContentPlace[] },
	country: string,
	city: string,
): string {
	const area = content.areas.find((a) => a.country === country && a.id === city);
	if (area !== undefined) return area.name;
	const place = content.places.find((p) => p.country === country && p.city === city);
	return place?.cityName ?? titleCase(city);
}

// ---------------------------------------------------------------- stays

/** Every stay leg of the city (`city` or `cities`), in trip order. */
export const cityStays = (legs: readonly TripLeg[], city: string): TripLeg[] =>
	legsSorted(legs).filter((l) => l.type === 'stay' && stayCities(l).includes(city));

export const isBooked = (l: TripLeg): boolean => l.status === 'booked';

/** True when the city has at least one stay and every one of them is booked. */
export const allNightsBooked = (stays: readonly TripLeg[]): boolean =>
	stays.length > 0 && stays.every(isBooked);

/** Nights of a stay (0 when a date is missing). */
export function nightsOf(l: TripLeg): number {
	const a = dayKey(l.start);
	const b = dayKey(l.end);
	return a === '' || b === '' ? 0 : Math.max(0, diffDays(a, b));
}

export interface NightsSummary {
	booked: number;
	total: number;
}

/**
 * A stay with no bed to book: a dated stay of 0 nights (an airport layover such as Singapore's "Jewel Changi, no
 * bed"). The page lists it apart instead of under "Not booked yet".
 */
export const noBed = (l: TripLeg): boolean => dayKey(l.start) !== '' && nightsOf(l) === 0;

/** Nights booked of the city's stay nights ("3 of 5 nights booked"). */
export function nightsBooked(stays: readonly TripLeg[]): NightsSummary {
	return {
		booked: stays.filter(isBooked).reduce((n, l) => n + nightsOf(l), 0),
		total: stays.reduce((n, l) => n + nightsOf(l), 0),
	};
}

/** "6 – 9 Dec", "30 Dec – 2 Jan", "6 Dec" (no timezone: whole days). '' when undated. */
export function dateSpan(start: string | undefined, end: string | undefined): string {
	const a = dayKey(start);
	const b = dayKey(end);
	if (a === '') return '';
	if (b === '' || b === a) return fmtDate(a);
	const [da = '', ma = ''] = fmtDate(a).split(' ');
	const db = fmtDate(b);
	return ma === db.split(' ')[1] ? `${da} – ${db}` : `${fmtDate(a)} – ${db}`;
}

/** Where a booked stay is drawn, and what opens on a tap. */
export interface BookedStay {
	leg: TripLeg;
	/** The stay card the leg points to (opens the place sheet), or null. */
	placeId: string | null;
	name: string;
	/** "Dayin Hostel · 6 – 9 Dec": the pin's permanent label. */
	label: string;
	/** The pin: the card's location, else the leg's lat/lng, else null (no pin, one line on the page). */
	at: LatLng | null;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The booked stays of the city with their pins: the card's loc, else the leg's lat/lng, else none. */
export function bookedStays(
	stays: readonly TripLeg[],
	placesById: ReadonlyMap<string, ContentPlace>,
): BookedStay[] {
	return stays.filter(isBooked).map((leg) => {
		const card =
			leg.place !== undefined && leg.place !== '' ? placesById.get(leg.place) : undefined;
		const at = card?.loc ?? (num(leg.lat) && num(leg.lng) ? { lat: leg.lat, lng: leg.lng } : null);
		const name =
			card?.short ??
			card?.name ??
			(leg.host !== undefined && leg.host !== '' ? leg.host : (leg.title ?? 'Booked stay'));
		const when = dateSpan(leg.start, leg.end);
		return {
			leg,
			placeId: card?.id ?? null,
			name,
			label: when === '' ? name : `${name} · ${when}`,
			at: at === null ? null : { lat: at.lat, lng: at.lng },
		};
	});
}

// ---------------------------------------------------------------- getting in and out

export interface HubUse {
	hub: Hub;
	/** Days (YYYY-MM-DD) the traveler arrives here, sorted, unique. */
	arrive: string[];
	/** Days the traveler leaves from here. */
	leave: string[];
}

const matches = (v: string | undefined, hub: Hub): boolean => {
	if (v === undefined || v === '') return false;
	const x = v.trim().toLowerCase();
	return x === hub.id || (hub.code !== null && x === hub.code.toLowerCase());
};

const sortedDays = (days: readonly string[]): string[] =>
	[...new Set(days.filter((d) => d !== ''))].sort();

/**
 * How the traveler uses each hub of the city. Arrival: a flight or transport leg whose `to` is the hub's code or id
 * (dated by the leg's end, else start), or a stay of the city with `arrive` = the hub id (its start). Departure
 * likewise with `from` / `leave` and the leg's start / the stay's end. A hub can be both, several times.
 */
export function hubUses(
	hubs: readonly Hub[],
	legs: readonly TripLeg[],
	stays: readonly TripLeg[],
): HubUse[] {
	const moves = legs.filter((l) => l.type === 'flight' || l.type === 'transport');
	return hubs.map((hub) => {
		const arrive: string[] = [];
		const leave: string[] = [];
		for (const l of moves) {
			if (matches(l.to, hub)) arrive.push(dayKey(l.end ?? l.start));
			if (matches(l.from, hub)) leave.push(dayKey(l.start));
		}
		for (const s of stays) {
			if (matches(s.arrive, hub)) arrive.push(dayKey(s.start));
			if (matches(s.leave, hub)) leave.push(dayKey(s.end));
		}
		return { hub, arrive: sortedDays(arrive), leave: sortedDays(leave) };
	});
}

const KIND_WORDS =
	/\s+(international\s+)?(airport|railway station|train station|station|bus terminal|terminal|pier)$/i;
const DIRECTION = /^(north|south|east|west|central)$/i;

/**
 * A hub's short name for the map (its edge chip and its tag): the code when it has one ("PVG"), else the name
 * without the city and the kind ("Shanghai Hongqiao railway station" → "Hongqiao"). A bare direction keeps the city
 * ("Huangshan North"); when nothing is left, the city and the kind word ("Shanghai station").
 */
export function shortHubName(hub: Pick<Hub, 'code' | 'name' | 'kind'>, city: string): string {
	if (hub.code !== null) return hub.code;
	const bare = hub.name.replace(/\s*\([^)]*\)/g, '').trim();
	const noKind = bare.replace(KIND_WORDS, '').trim();
	const cityRe = new RegExp(`^${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i');
	const rest = noKind.replace(cityRe, '').trim();
	if (rest === '' || rest.toLowerCase() === city.toLowerCase()) {
		return `${noKind === '' ? city : noKind} ${hub.kind === 'airport' ? 'airport' : 'station'}`;
	}
	if (DIRECTION.test(rest)) return noKind;
	return rest;
}

export const isUsed = (u: HubUse): boolean => u.arrive.length > 0 || u.leave.length > 0;

/** The hub's permanent tags: "Arrive Sun 6 Dec", "Leave Sat 2 Jan" (several when it is used several times). */
export const hubTags = (u: HubUse): string[] => [
	...u.arrive.map((d) => `Arrive ${fmtWeek(d)}`),
	...u.leave.map((d) => `Leave ${fmtWeek(d)}`),
];

// ---------------------------------------------------------------- pins and filters

/** How a place pin is drawn, strongest first. */
export type PinTone = 'booked' | 'must' | 'maybe' | 'none' | 'skip';

export const pinTone = (verdict: Verdict | undefined, booked: boolean): PinTone =>
	booked ? 'booked' : (verdict ?? 'none');

/** Z order: booked stays on top, Skip at the bottom (Leaflet zIndexOffset). */
export const PIN_Z: Readonly<Record<PinTone, number>> = {
	booked: 4000,
	must: 1500,
	maybe: 1000,
	none: 500,
	skip: 0,
};

export const VERDICT_WORD: Readonly<Record<PinTone, string>> = {
	booked: 'Booked',
	must: 'Must',
	maybe: 'Maybe',
	none: 'Not rated',
	skip: 'Skipped',
};

/** The pin's accessible name: "<name>, <category>, <Must|Maybe|Skipped|Not rated>[, booked stay]". */
export function pinLabel(
	name: string,
	category: string,
	verdict: Verdict | undefined,
	booked: boolean,
): string {
	const v = VERDICT_WORD[verdict ?? 'none'];
	return `${name}, ${category}, ${v}${booked ? ', booked stay' : ''}`;
}

export interface CityFilter {
	/** Category ids; empty = all. */
	cats: readonly string[];
	hideSkipped: boolean;
	/** Airports and stations. */
	hubs: boolean;
	/** Stay cards that are not the booked one(s) are hidden. */
	onlyBooked: boolean;
}

/** The filters a city opens with: skipped and other stays hidden once every night there is booked. */
export const defaultFilter = (stays: readonly TripLeg[]): CityFilter => ({
	cats: [],
	hideSkipped: true,
	hubs: true,
	onlyBooked: allNightsBooked(stays),
});

/**
 * The toggles the traveler flipped for a city (they win over the derived defaults). `onlyBookedOver` is the default
 * Only booked stays had when it was flipped: the choice holds only while that default does, so booking the last
 * night turns the toggle on again (the default moved), and un-booking turns it off.
 */
export type CityChoices = Partial<CityFilter> & { onlyBookedOver?: boolean };

/** The choice to store when the traveler flips Only booked stays: the value and the default it overrides. */
export const chooseOnlyBooked = (
	value: boolean,
	defaults: CityFilter,
): Pick<CityChoices, 'onlyBooked' | 'onlyBookedOver'> => ({
	onlyBooked: value,
	onlyBookedOver: defaults.onlyBooked,
});

/** The filter in force: the defaults with the traveler's choices over them (only well-typed ones). */
export function withChoices(defaults: CityFilter, c: CityChoices | undefined): CityFilter {
	if (c === undefined) return defaults;
	const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
	const cats: unknown = c.cats;
	// A stored Only booked stays choice counts only against the default it overrode (none stored: stale, dropped).
	const onlyBookedHolds = c.onlyBookedOver === defaults.onlyBooked;
	return {
		cats: Array.isArray(cats)
			? cats.filter((x): x is string => typeof x === 'string')
			: defaults.cats,
		hideSkipped: bool(c.hideSkipped, defaults.hideSkipped),
		hubs: bool(c.hubs, defaults.hubs),
		onlyBooked: onlyBookedHolds ? bool(c.onlyBooked, defaults.onlyBooked) : defaults.onlyBooked,
	};
}

/** Whether a place pin shows. A booked stay always does: it is what the rest is judged against. */
export function placeVisible(
	p: Pick<ContentPlace, 'id' | 'category'>,
	verdict: Verdict | undefined,
	booked: ReadonlySet<string>,
	f: CityFilter,
	opts: { ignoreCats?: boolean } = {},
): boolean {
	if (booked.has(p.id)) return true;
	if (opts.ignoreCats !== true && f.cats.length > 0 && !f.cats.includes(p.category)) return false;
	if (f.hideSkipped && verdict === 'skip') return false;
	if (f.onlyBooked && p.category === 'stay') return false;
	return true;
}

/** Category chips: every category of the city's places with how many pass the other filters, in config order. */
export function categoryCounts(
	places: readonly Pick<ContentPlace, 'id' | 'category'>[],
	verdicts: VerdictMap,
	booked: ReadonlySet<string>,
	f: CityFilter,
	order: readonly string[],
): { id: string; n: number }[] {
	const n = new Map<string, number>();
	for (const p of places) {
		const shown = placeVisible(p, verdicts[p.id], booked, f, { ignoreCats: true });
		n.set(p.category, (n.get(p.category) ?? 0) + (shown ? 1 : 0));
	}
	const rank = (c: string): number => {
		const i = order.indexOf(c);
		return i < 0 ? order.length : i;
	};
	return [...n.entries()]
		.sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
		.map(([id, count]) => ({ id, n: count }));
}

// ---------------------------------------------------------------- geometry

const RAD = Math.PI / 180;

/** Straight-line distance in km (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
	const dLat = (b.lat - a.lat) * RAD;
	const dLng = (b.lng - a.lng) * RAD;
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
	return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "31 km", "1.4 km", "350 m". */
export function fmtKm(km: number): string {
	if (km < 1) return `${String(Math.round(km * 20) * 50)} m`;
	if (km < 10) return `${km.toFixed(1)} km`;
	return `${String(Math.round(km))} km`;
}

const median = (xs: readonly number[]): number => {
	const s = [...xs].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 === 1 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};

/** The median point (per axis); null for no points. */
export function medianPoint(points: readonly LatLng[]): LatLng | null {
	if (points.length === 0) return null;
	return { lat: median(points.map((p) => p.lat)), lng: median(points.map((p) => p.lng)) };
}

/**
 * What the first view fits: the points within `radiusKm` of `around` (the booked stay), else of the median point, so
 * the view opens on the neighbourhood the traveler judges, not the whole metro area or a far day trip. The radius
 * doubles (up to 25 km) until at least three points (or all of them) are in.
 */
export function focusPoints(
	points: readonly LatLng[],
	radiusKm = 7,
	around: LatLng | null = null,
): LatLng[] {
	const m = around ?? medianPoint(points);
	if (m === null) return [];
	const want = Math.min(3, points.length);
	const within = (r: number): LatLng[] => points.filter((p) => distanceKm(m, p) <= r);
	let r = radiusKm;
	let near = within(r);
	while (near.length < want && r < 25) {
		r = Math.min(25, r * 2);
		near = within(r);
	}
	if (around !== null && !near.some((p) => p.lat === around.lat && p.lng === around.lng)) {
		near.push(around);
	}
	return near.length > 0 ? near : [m];
}

// ---------------------------------------------------------------- stacks (pins too close to tell apart)

export interface ScreenPoint {
	key: string;
	/** Pixel position at the current zoom (Leaflet's project()). */
	x: number;
	y: number;
	/** A booked stay: never folded into a stack, the stack of its neighbours sits beside it. */
	anchor: boolean;
}

export interface PinStack {
	/** The folded pins (the anchor excluded), strongest first. */
	keys: string[];
	/** The booked stay the stack sits beside, or null. */
	anchor: string | null;
	/** Where the stack is drawn: the anchor, else the middle of its pins. */
	x: number;
	y: number;
}

/**
 * Groups pins closer than `radiusPx` on screen into stacks, so no pin hides under another. `points` come strongest
 * first (the order decides which pile a pin joins); anchors (booked stays) stay put, and the pins near one become
 * its stack. Returns every group, singles included (keys.length 1 and no anchor: drawn as itself; an anchor with
 * no neighbours has keys []).
 */
export function stackPoints(points: readonly ScreenPoint[], radiusPx: number): PinStack[] {
	interface G {
		keys: string[];
		anchor: string | null;
		x: number;
		y: number;
		sx: number;
		sy: number;
	}
	const groups: G[] = points
		.filter((p) => p.anchor)
		.map((p) => ({ keys: [], anchor: p.key, x: p.x, y: p.y, sx: 0, sy: 0 }));
	const near = (g: G, x: number, y: number): number => Math.hypot(g.x - x, g.y - y);
	const add = (g: G, p: { keys: string[]; sx: number; sy: number }): void => {
		g.keys.push(...p.keys);
		g.sx += p.sx;
		g.sy += p.sy;
		if (g.anchor === null) {
			g.x = g.sx / g.keys.length;
			g.y = g.sy / g.keys.length;
		}
	};
	for (const p of points) {
		if (p.anchor) continue;
		let best: G | null = null;
		for (const g of groups) {
			const d = near(g, p.x, p.y);
			if (d < radiusPx && (best === null || d < near(best, p.x, p.y))) best = g;
		}
		if (best === null)
			groups.push({ keys: [p.key], anchor: null, x: p.x, y: p.y, sx: p.x, sy: p.y });
		else add(best, { keys: [p.key], sx: p.x, sy: p.y });
	}
	// A pile's middle moves as pins join: fold piles that now overlap (two anchors never merge).
	for (let merged = true; merged;) {
		merged = false;
		outer: for (let i = 0; i < groups.length; i++) {
			for (let j = i + 1; j < groups.length; j++) {
				const a = groups[i];
				const b = groups[j];
				if (a === undefined || b === undefined) continue;
				if (a.anchor !== null && b.anchor !== null) continue;
				if (near(a, b.x, b.y) >= radiusPx) continue;
				const [keep, gone] = b.anchor !== null ? [b, a] : [a, b];
				add(keep, gone);
				groups.splice(groups.indexOf(gone), 1);
				merged = true;
				break outer;
			}
		}
	}
	return groups.map((g) => ({ keys: g.keys, anchor: g.anchor, x: g.x, y: g.y }));
}

/**
 * Where the pins of an opened stack go: on a ring around the stack (pixel offsets), far enough apart for a 44 px
 * tap target each, and clear of a booked stay's bigger pin in the middle. Starts at the top, clockwise.
 */
export function fanOffsets(n: number, aroundAnchor: boolean): { dx: number; dy: number }[] {
	const r = Math.max(aroundAnchor ? 56 : 40, (n * 48) / (2 * Math.PI));
	return Array.from({ length: n }, (_, i) => {
		const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1);
		return { dx: Math.round(r * Math.cos(a)), dy: Math.round(r * Math.sin(a)) };
	});
}

export interface Bounds {
	south: number;
	west: number;
	north: number;
	east: number;
}

export function boundsOf(points: readonly LatLng[]): Bounds | null {
	if (points.length === 0) return null;
	return {
		south: Math.min(...points.map((p) => p.lat)),
		west: Math.min(...points.map((p) => p.lng)),
		north: Math.max(...points.map((p) => p.lat)),
		east: Math.max(...points.map((p) => p.lng)),
	};
}

const ARROWS = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'] as const;

/** One of eight arrows pointing from `from` to `to` (screen directions: north is up). */
export function arrowTo(from: LatLng, to: LatLng): string {
	const dx = (to.lng - from.lng) * Math.cos(((from.lat + to.lat) / 2) * RAD);
	const dy = to.lat - from.lat;
	const a = Math.atan2(dy, dx);
	const i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
	return ARROWS[i] ?? '→';
}

// ---------------------------------------------------------------- route stops → cities

export interface StopContext {
	areas: readonly Pick<ContentArea, 'id' | 'country' | 'cities'>[];
	/** `country/city` keys that have a map (mapCities). */
	mapped: ReadonlySet<string>;
	legs: readonly TripLeg[];
}

/**
 * The city whose map a route stop opens, or null (no link: it would lead to an empty map). In order: the stop's
 * area card's cities; a places city with the stop's id; a stay leg in that country overlapping the stop's dates;
 * a mapped city whose id starts the stop's id (`shanghai-weekend` → shanghai).
 */
export function stopCity(
	stop: { area: string; start?: string | null; end?: string | null },
	country: string,
	ctx: StopContext,
): string | null {
	const ok = (c: string): boolean => ctx.mapped.has(cityKey(country, c));
	const area = ctx.areas.find((a) => a.country === country && a.id === stop.area);
	if (area !== undefined) {
		const pick = (area.cities.length > 0 ? area.cities : [area.id]).find(ok);
		if (pick !== undefined) return pick;
	}
	if (ok(stop.area)) return stop.area;
	const a = dayKey(stop.start ?? undefined);
	const b = dayKey(stop.end ?? undefined);
	if (a !== '' && b !== '') {
		for (const l of legsSorted(ctx.legs)) {
			if (l.type !== 'stay' || l.country !== country) continue;
			const s = dayKey(l.start);
			const e = dayKey(l.end ?? l.start);
			if (s === '' || s >= b || e <= a) continue;
			const pick = stayCities(l).find(ok);
			if (pick !== undefined) return pick;
		}
	}
	for (const key of ctx.mapped) {
		const [c = '', city = ''] = key.split('/');
		if (c === country && city !== '' && stop.area.startsWith(`${city}-`)) return city;
	}
	return null;
}

export interface RouteCityLink {
	country: string;
	city: string;
}

/** The route's cities that have a map, in travel order, each once (the city switcher). */
export function routeCityLinks(
	stops: readonly { country: string; area: string; start?: string | null; end?: string | null }[],
	ctx: StopContext,
): RouteCityLink[] {
	const out: RouteCityLink[] = [];
	const seen = new Set<string>();
	for (const s of stops) {
		const city = stopCity(s, s.country, ctx);
		if (city === null) continue;
		const key = cityKey(s.country, city);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ country: s.country, city });
	}
	return out;
}
