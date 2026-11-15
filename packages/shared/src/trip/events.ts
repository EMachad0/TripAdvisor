// Dated places (events): what is on today, and what you could still reach from your stays.
import { maxString, minString, orStr } from '../util.ts';
import { EVENT_MAX_DAYS, NEAR_KM } from './constants.ts';
import { addDays, dayKey, diffDays } from './dates.ts';
import { endOrStart, legsSorted, stayCities } from './legs.ts';
import type { LatLng, Leg, ReachKind, TripPlace } from './types.ts';

const REACH_RANK: Readonly<Record<ReachKind, number>> = { here: 0, near: 1, far: 2 };

function rangesOf(p: TripPlace): { from: string; to: string }[] {
	const out: { from: string; to: string }[] = [];
	for (const r of p.days ?? []) {
		if (r?.from === undefined || r.from === '') continue;
		out.push({ from: dayKey(r.from), to: dayKey(orStr(r.to, r.from)) });
	}
	return out;
}

const verdictRank = (p: TripPlace): number =>
	p.verdict === 'must' ? 0 : p.verdict === 'maybe' ? 1 : 2;

const km = (a: LatLng, b: LatLng): number => {
	const r = Math.PI / 180,
		dLat = (b.lat - a.lat) * r,
		dLng = (b.lng - a.lng) * r;
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
	return 12742 * Math.asin(Math.sqrt(h));
};

/** Rough centre of each city: the average position of its cards. */
export function cityCenters(places: readonly TripPlace[] = []): Map<string, LatLng> {
	const acc = new Map<string, { lat: number; lng: number; n: number }>();
	for (const p of places)
		if (p.loc && p.city !== undefined && p.city !== '') {
			const a = acc.get(p.city) ?? { lat: 0, lng: 0, n: 0 };
			a.lat += p.loc.lat;
			a.lng += p.loc.lng;
			a.n++;
			acc.set(p.city, a);
		}
	return new Map([...acc].map(([c, a]) => [c, { lat: a.lat / a.n, lng: a.lng / a.n }]));
}

/** "here" (in a city you sleep in), "near" (within NEAR_KM of one: a day trip) or "far". */
export function reachOf(
	p: Pick<TripPlace, 'city' | 'loc'>,
	cities: readonly string[] = [],
	centers: ReadonlyMap<string, LatLng> = new Map(),
): ReachKind {
	if (p.city !== undefined && cities.includes(p.city)) return 'here';
	const { loc } = p;
	if (
		loc &&
		cities.some((c) => {
			const centre = centers.get(c);
			return centre !== undefined && km(centre, loc) <= NEAR_KM;
		})
	)
		return 'near';
	return 'far';
}

export interface OnDay<P extends TripPlace> {
	place: P;
	/** "only" (one-day event), "last" (its last day) or "on" (running). */
	kind: 'only' | 'last' | 'on';
	from: string;
	to: string;
	/** Days after `day` it keeps running. */
	left: number;
	reach: ReachKind;
	/** Longer than EVENT_MAX_DAYS: a season, not an event. */
	season: boolean;
}

const KIND_RANK: Readonly<Record<OnDay<TripPlace>['kind'], number>> = { only: 0, last: 1, on: 2 };

/** Dated places on `day` in the country you are in, closest first. Skipped places are left out. */
export function onDay<P extends TripPlace>(
	places: readonly P[] = [],
	day: string,
	{ country = null, cities = [] }: { country?: string | null; cities?: readonly string[] } = {},
): OnDay<P>[] {
	const out: OnDay<P>[] = [],
		centers = cityCenters(places);
	for (const p of places) {
		if (p.verdict === 'skip' || (country !== null && country !== '' && p.country !== country)) continue;
		const r = rangesOf(p).find((x) => x.from <= day && day <= x.to);
		if (!r) continue;
		const kind = r.from === r.to ? 'only' : r.to === day ? 'last' : 'on';
		out.push({
			place: p,
			kind,
			from: r.from,
			to: r.to,
			left: diffDays(day, r.to),
			reach: reachOf(p, cities, centers),
			season: diffDays(r.from, r.to) + 1 > EVENT_MAX_DAYS,
		});
	}
	return out.sort(
		(a, b) =>
			REACH_RANK[a.reach] - REACH_RANK[b.reach] ||
			KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
			a.left - b.left ||
			verdictRank(a.place) - verdictRank(b.place),
	);
}

export interface Upcoming<P extends TripPlace, L extends Leg> {
	place: P;
	date: string;
	to: string;
	reach: ReachKind;
	stay: L;
	/** The stay is not booked yet (status tbd). */
	open: boolean;
}

/**
 * Dated places you could still go to: each one's first day that falls inside a stay it can be reached from
 * (`reach`: "here" = the stay's own city, "near" = a day trip). Seasons longer than EVENT_MAX_DAYS are left out.
 */
export function upcomingEvents<P extends TripPlace, L extends Leg>(
	places: readonly P[] = [],
	legs: readonly L[] = [],
	today: string,
	{ limit = 8, includeToday = false }: { limit?: number; includeToday?: boolean } = {},
): Upcoming<P, L>[] {
	const stays = legsSorted(legs).filter(
		(l) => l.type === 'stay' && l.country !== undefined && l.country !== '' && dayKey(l.start) !== '',
	);
	const floor = includeToday ? today : addDays(today, 1);
	const out: Upcoming<P, L>[] = [],
		centers = cityCenters(places);
	for (const p of places) {
		if (p.verdict === 'skip') continue;
		let best: Upcoming<P, L> | null = null;
		for (const r of rangesOf(p)) {
			if (diffDays(r.from, r.to) + 1 > EVENT_MAX_DAYS) continue;
			for (const s of stays) {
				if (s.country !== p.country) continue;
				const lo = maxString(r.from, dayKey(s.start), floor),
					hi = minString(r.to, dayKey(endOrStart(s)));
				if (lo > hi) continue;
				const reach = reachOf(p, stayCities(s), centers);
				if (reach === 'far') continue;
				const c = { place: p, date: lo, to: hi, reach, stay: s, open: s.status === 'tbd' };
				if (
					!best ||
					REACH_RANK[c.reach] < REACH_RANK[best.reach] ||
					(c.reach === best.reach && c.date < best.date)
				)
					best = c;
			}
		}
		if (best) out.push(best);
	}
	out.sort(
		(a, b) =>
			a.date.localeCompare(b.date) ||
			REACH_RANK[a.reach] - REACH_RANK[b.reach] ||
			verdictRank(a.place) - verdictRank(b.place),
	);
	return limit ? out.slice(0, limit) : out;
}
