// The Route tab's plan model (port of game/public/game.js routeLegs, legCard, stopRow, refreshPop and the edit
// helpers). Pure: the page feeds it the live RouteModel (app data) with any unsaved local edits laid over it.
import { legPlan, type LegPlan, type PlannedStop } from '@atr/shared/routemap';
import type { RouteCity, RouteModelLeg, RouteModelStop } from '#lib/content/types.js';

/** Which map is shown: the whole trip or one country leg (its id). */
export type MapView = string;
export const WHOLE_TRIP: MapView = 'all';

/** Nights a stop may take (the old input's min and max). */
export const MIN_NIGHTS = 1;
export const MAX_NIGHTS = 90;

/** A stop of the plan with its dates, its index in the leg, its trip-wide number and its map key. */
export type LegStop = PlannedStop<RouteModelStop> & {
	/** Index inside the leg. */
	i: number;
	/** 1-based number across the whole trip. */
	n: number;
	/** `<country>/<area>`: the map pin and the popup selection. */
	key: string;
	located: boolean;
};

/** A city of the leg's country that is not on the route. */
export type OtherCity = RouteCity & { key: string };

export interface Leg {
	c: RouteModelLeg;
	plan: LegPlan<RouteModelStop>;
	stops: LegStop[];
	others: OtherCity[];
}

const isNum = (v: unknown): v is number => typeof v === 'number';

/** Legs with dates per stop, a trip-wide stop number and the cities to show on the map (old routeLegs). */
export function routeLegs(countries: readonly RouteModelLeg[]): Leg[] {
	let n = 0;
	return countries.map((c) => {
		const plan = legPlan({ from: c.from, nights: c.nights, stops: c.stops });
		const stops = plan.stops.map((s, i): LegStop => ({
			...s,
			i,
			n: ++n,
			key: `${c.id}/${s.area}`,
			located: isNum(s.lat) && isNum(s.lng),
		}));
		const inRoute = new Set(stops.map((s) => s.area));
		const others = c.cities
			.filter((x) => !inRoute.has(x.area))
			.map((x) => ({ ...x, key: `${c.id}/${x.area}` }));
		return { c, plan, stops, others };
	});
}

/** Stops placed across the trip, and Must cities not placed yet (the header line). */
export function routeTotals(legs: readonly Leg[]): { placed: number; unplaced: number } {
	return {
		placed: legs.reduce((n, l) => n + l.stops.length, 0),
		unplaced: legs.reduce((n, l) => n + l.others.filter((x) => x.verdict === 'must').length, 0),
	};
}

// ---------------------------------------------------------------- text

// Built from the parts, so every engine gives "Sun 6 Dec": some ICU versions put a comma after the weekday.
const fmt = (iso: string, o: Intl.DateTimeFormatOptions): string =>
	new Intl.DateTimeFormat('en-GB', { ...o, timeZone: 'UTC' })
		.formatToParts(new Date(`${iso}T00:00:00Z`))
		.filter((p) => p.type !== 'literal')
		.map((p) => p.value)
		.join(' ');
/** "6 Dec" (old fmtDate). */
export const fmtDate = (iso: string): string => fmt(iso, { day: 'numeric', month: 'short' });
/** "Sun 6 Dec" (old fmtWeek). */
export const fmtWeek = (iso: string): string =>
	fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' });

export const plural = (n: number, w: string, ws = `${w}s`): string =>
	`${String(n)} ${n === 1 ? w : ws}`;

export const VERDICT_LABEL = { must: 'Must', maybe: 'Maybe', skip: 'Skip' } as const;

/** The header eyebrow: "6 Dec → 9 Feb · 6 legs", or "The trip" with no legs. */
export function eyebrow(countries: readonly RouteModelLeg[]): string {
	const first = countries[0];
	const last = countries.at(-1);
	if (first === undefined || last === undefined) return 'The trip';
	return `${fmtDate(first.from)} → ${fmtDate(last.to)} · ${String(countries.length)} legs`;
}

/** A stop's dates in the plan (old stopRow). */
export function stopWhen(s: LegStop): string {
	if (s.start !== null && s.end !== null) return `${fmtDate(s.start)} → ${fmtDate(s.end)}`;
	if (s.start !== null) return `from ${fmtDate(s.start)}`;
	return 'dates open until the stops above have nights';
}

/** The nights meter under a leg's title, as plain parts (the page bolds the numbers). */
export type Meter =
	| { status: 'over'; planned: number; more: number; nights: number }
	| { status: 'ok'; nights: number }
	| { status: 'empty'; nights: number }
	| { status: 'under'; planned: number; nights: number; left: number };

export function meter(l: Leg): Meter {
	const { plan, c } = l;
	switch (plan.status) {
		case 'over':
			return {
				status: 'over',
				planned: plan.planned,
				more: plan.planned - c.nights,
				nights: c.nights,
			};
		case 'ok':
			return { status: 'ok', nights: c.nights };
		case 'empty':
			return { status: 'empty', nights: c.nights };
		case 'under':
			return { status: 'under', planned: plan.planned, nights: c.nights, left: plan.left };
	}
}

/** Segments of the nights bar: one per stop with nights (alternating shades), then what is left. */
export interface NightSeg {
	key: string;
	/** Share of the bar, 0..100. */
	pct: number;
	tone: 0 | 1 | 'left';
	title: string;
}

export function nightSegments(l: Leg): NightSeg[] {
	const withNights = l.stops.filter((s) => isNum(s.nights) && s.nights > 0);
	const left = Math.max(0, l.plan.left);
	const total = withNights.reduce((n, s) => n + (s.nights ?? 0), 0) + left;
	if (total === 0) return [{ key: 'left', pct: 100, tone: 'left', title: '' }];
	const segs: NightSeg[] = withNights.map((s, i) => ({
		key: s.key,
		pct: ((s.nights ?? 0) / total) * 100,
		tone: i % 2 === 0 ? 0 : 1,
		title: `${s.name}: ${plural(s.nights ?? 0, 'night')}`,
	}));
	if (left > 0) segs.push({ key: 'left', pct: (left / total) * 100, tone: 'left', title: '' });
	return segs;
}

/** The leg's route differs from its config seed, so Reset has something to go back to. */
export function isSeeded(c: RouteModelLeg): boolean {
	return (
		c.seed.length > 0 &&
		JSON.stringify(c.seed) !==
			JSON.stringify(c.stops.map((s) => ({ area: s.area, nights: s.nights ?? null })))
	);
}

/** Reset shows in edit mode for a leg the game changed that has a seed to go back to. */
export const canReset = (c: RouteModelLeg): boolean => c.source === 'game' && isSeeded(c);

// ---------------------------------------------------------------- the city card (popup)

export interface CityCard {
	key: string;
	country: RouteModelLeg;
	area: string;
	name: string;
	verdict: RouteCity['verdict'];
	/** On the route (with its plan dates), or not. */
	stop: LegStop | null;
	/** "Stop 2 of 3 in China", "Must · not placed yet", ... */
	status: string;
	when: string;
	places: { must: number; maybe: number; total: number };
	hasPage: boolean;
	lat: number | null;
	lng: number | null;
}

/** What the card for a selected city says (old refreshPop); null when the key is no city of the route. */
export function cityCard(legs: readonly Leg[], key: string): CityCard | null {
	const [cid, area] = key.split('/');
	const l = legs.find((x) => x.c.id === cid);
	if (l === undefined || area === undefined) return null;
	const stop = l.stops.find((s) => s.area === area) ?? null;
	const x = stop ?? l.others.find((o) => o.area === area);
	if (x === undefined) return null;
	const v = x.verdict;
	const status = stop
		? `Stop ${String(stop.i + 1)} of ${String(l.stops.length)} in ${l.c.name}`
		: v === 'must'
			? 'Must · not placed yet'
			: v === 'maybe'
				? 'Maybe · not placed'
				: v === 'skip'
					? 'Skipped · not placed'
					: 'Not swiped yet';
	let when: string;
	if (stop === null) when = `${l.c.name} leg: ${fmtDate(l.c.from)} – ${fmtDate(l.c.to)}`;
	else if (stop.start !== null && stop.end !== null)
		when = `${fmtWeek(stop.start)} → ${fmtWeek(stop.end)} · ${plural(stop.nights ?? 0, 'night')}`;
	else if (stop.start !== null) when = `From ${fmtWeek(stop.start)} · nights not set`;
	else when = 'Dates open: set nights for the stops before it';
	return {
		key,
		country: l.c,
		area,
		name: x.name,
		verdict: v,
		stop,
		status,
		when,
		places: x.places,
		hasPage: x.hasPage,
		lat: isNum(x.lat) ? x.lat : null,
		lng: isNum(x.lng) ? x.lng : null,
	};
}

// ---------------------------------------------------------------- edits (pure: each returns a new list)

/** Clamp typed or stepped nights the old way: below 1 or empty clears, above 90 caps, decimals round. */
export function normalizeNights(n: number | null): number | null {
	if (n === null || !Number.isFinite(n) || n < MIN_NIGHTS) return null;
	return Math.min(MAX_NIGHTS, Math.round(n));
}

export function withNights(
	stops: readonly RouteModelStop[],
	i: number,
	n: number | null,
): RouteModelStop[] | null {
	const s = stops[i];
	if (s === undefined) return null;
	const v = normalizeNights(n);
	if ((s.nights ?? null) === v) return null;
	return stops.map((x, j) => (j === i ? { ...x, nights: v } : x));
}

export function moved(
	stops: readonly RouteModelStop[],
	i: number,
	d: number,
): RouteModelStop[] | null {
	const j = i + d;
	const a = stops[i];
	const b = stops[j];
	if (a === undefined || b === undefined) return null;
	const out = [...stops];
	out[i] = b;
	out[j] = a;
	return out;
}

export function removed(stops: readonly RouteModelStop[], i: number): RouteModelStop[] | null {
	if (stops[i] === undefined) return null;
	return stops.filter((_, j) => j !== i);
}

/** A city of the leg appended as a stop with no nights (old addStop); null when unknown or already placed. */
export function added(
	leg: RouteModelLeg,
	stops: readonly RouteModelStop[],
	area: string,
): RouteModelStop[] | null {
	const x = leg.cities.find((y) => y.area === area);
	if (x === undefined || stops.some((s) => s.area === area)) return null;
	return [
		...stops,
		{
			area: x.area,
			name: x.name,
			lat: x.lat,
			lng: x.lng,
			nights: null,
			hasPage: x.hasPage,
			located: true,
			verdict: x.verdict,
			places: x.places,
		},
	];
}

/** What route.save sends for a leg: area plus nights when set (old saveLeg). */
export function stopsPayload(
	stops: readonly RouteModelStop[],
): { area: string; nights?: number }[] {
	return stops.map((s) =>
		isNum(s.nights) && s.nights > 0 ? { area: s.area, nights: s.nights } : { area: s.area },
	);
}
