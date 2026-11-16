// Legs of the itinerary: flights, stays, transfers and notes.
import { orStr } from '../util.ts';
import { dayKey, diffDays, localStamp, timeOf } from './dates.ts';
import type { Leg } from './types.ts';

/** The end of a leg, or its start when it has none. */
export const endOrStart = (l: Leg): string | undefined => orStr(l.end, l.start);

export const legsSorted = <L extends Leg>(legs: readonly L[] = []): L[] =>
	[...legs].sort(
		(a, b) =>
			orStr(a.start, '9999').localeCompare(orStr(b.start, '9999')) ||
			(a.order ?? 0) - (b.order ?? 0),
	);

/** First and last day of the trip, or null when nothing is dated. */
export function tripSpan(
	legs: readonly Leg[] = [],
): { first: string; last: string; days: number } | null {
	const dated = legs.filter((l) => dayKey(l.start) !== '');
	if (dated.length === 0) return null;
	const first = dated.map((l) => dayKey(l.start)).sort()[0] ?? '';
	const last = dated.map((l) => dayKey(endOrStart(l))).sort().at(-1) ?? '';
	return { first, last, days: diffDays(first, last) + 1 };
}

const isDatedStay = (l: Leg): boolean => l.type === 'stay' && dayKey(l.start) !== '';

/** The stay you sleep in on the night of `day` (a same-day stay, like a layover, counts on its day). */
export function stayOn<L extends Leg>(legs: readonly L[] = [], day: string): L | null {
	return (
		legsSorted(legs)
			.filter((l) => {
				if (!isDatedStay(l)) return false;
				const a = dayKey(l.start),
					b = dayKey(endOrStart(l));
				return a <= day && (day < b || (a === b && day === a));
			})
			.pop() ?? null
	);
}

/** Where you are on `day`: the night's stay, or the stay you check out of that day. */
export function hereOn<L extends Leg>(legs: readonly L[] = [], day: string): L | null {
	return (
		stayOn(legs, day) ??
		legsSorted(legs)
			.filter(
				(l) => isDatedStay(l) && dayKey(l.start) <= day && dayKey(endOrStart(l)) === day,
			)
			.pop() ??
		null
	);
}

/** Everything that touches `day`: stays covering it, flights leaving or landing, transfers and notes starting. */
export function eventsOn<L extends Leg>(legs: readonly L[] = [], day: string): L[] {
	return legsSorted(legs).filter((l) => {
		const a = dayKey(l.start),
			b = dayKey(endOrStart(l));
		if (a === '') return false;
		if (l.type === 'stay') return a <= day && day <= b;
		if (l.type === 'flight') return a === day || b === day;
		return a === day;
	});
}

/** City ids a stay covers ("city" or "cities": a stay can be one block of two towns). */
export function stayCities(stay: Leg | null | undefined): readonly string[] {
	if (!stay) return [];
	if (stay.cities && stay.cities.length > 0) return stay.cities;
	return stay.city !== undefined && stay.city !== '' ? [stay.city] : [];
}

/** Short name of a stay for calendar cells: "Shanghai" from "Shanghai · Dayin hostel". */
export const stayName = (stay: Leg | null | undefined): string =>
	orStr((stay?.title ?? '').split(' · ')[0]?.trim(), 'Stay');

/** The next flight that hasn't left yet. A flight with no time counts until its day is over. */
export function nextFlight<L extends Leg>(legs: readonly L[] = [], now: string = localStamp()): L | null {
	return (
		legsSorted(legs).find((l) => {
			if (l.type !== 'flight' || dayKey(l.start) === '') return false;
			return timeOf(l.start) !== '' ? String(l.start) > now : dayKey(l.start) >= dayKey(now);
		}) ?? null
	);
}
