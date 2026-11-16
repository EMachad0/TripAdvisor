// The Itinerary timeline as data (game/public/trip.js viewItinerary): legs in date order, the date column, the
// "Today" line, layovers between connecting flights, the country jump chips and the header counts.
import { dayKey, hereOn, legsSorted, timeOf, tripSpan, weekday } from '@atr/shared/trip';
import { MON, WD, plural } from './format.ts';
import type { TripLeg } from './types.ts';

export interface Jump {
	id: string;
	country: string;
	start: string;
}

export type TimelineItem =
	| { kind: 'today' }
	| { kind: 'layover'; key: string; minutes: number; where: string }
	| {
			kind: 'leg';
			leg: TripLeg;
			/** The date column: day number, "Dec · Sun"; null when the previous leg is on the same day. */
			when: { day: string; label: string } | 'nodate' | null;
			/** The stay you are in today. */
			isNow: boolean;
	  };

export interface ItineraryModel {
	legs: TripLeg[];
	span: { first: string; last: string; days: number } | null;
	eyebrow: string;
	lede: string;
	jumps: Jump[];
	items: TimelineItem[];
	/** During the trip the page opens at today (the stay you are in, else the Today line). */
	scrollToToday: boolean;
}

/** "Layover 2h 05m". */
export const layoverLabel = (minutes: number): string =>
	`${String(Math.floor(minutes / 60))}h ${String(minutes % 60).padStart(2, '0')}m`;

export function itineraryModel(
	rawLegs: readonly TripLeg[],
	today: string,
	fmtDay: (s: string) => string,
): ItineraryModel {
	const legs = legsSorted(rawLegs);
	const span = tripSpan(legs);
	const flights = legs.filter((l) => l.type === 'flight').length;
	const booked = legs.filter((l) => l.type === 'flight' && l.status === 'booked').length;
	const toBook = legs.filter(
		(l) =>
			l.type === 'stay' &&
			(l.status === 'planned' || l.status === 'tbd') &&
			dayKey(l.start) !== dayKey(l.end),
	).length;
	const eyebrow = span
		? `${fmtDay(span.first)} → ${fmtDay(span.last)} · ${String(span.days)} days`
		: 'Itinerary';
	const lede = `Flights, stays and moves in date order. Times are local to each airport or city.${
		flights > 0
			? ` ${String(booked)} of ${plural(flights, 'flight')} booked${toBook > 0 ? `, ${plural(toBook, 'stay')} still to book` : ''}.`
			: ''
	}`;

	const seen = new Set<string>();
	const jumps: Jump[] = [];
	for (const l of legs) {
		if (l.type === 'stay' && l.country !== undefined && l.country !== '' && !seen.has(l.country)) {
			seen.add(l.country);
			jumps.push({ id: l.id, country: l.country, start: l.start ?? '' });
		}
	}

	const here = hereOn(legs, today);
	const items: TimelineItem[] = [];
	let todayDrawn = false;
	let prev: TripLeg | null = null;
	for (const l of legs) {
		const d = dayKey(l.start);
		if (!todayDrawn && d !== '' && d > today) {
			if (span && span.first <= today) items.push({ kind: 'today' });
			todayDrawn = true;
		}
		if (
			prev?.type === 'flight' &&
			l.type === 'flight' &&
			prev.to !== undefined &&
			prev.to !== '' &&
			prev.to === l.from &&
			timeOf(prev.end) !== '' &&
			timeOf(l.start) !== ''
		) {
			// Both times are local to the same airport, so the wall-clock difference is the real one.
			const gap = Math.round(
				(Date.parse(`${l.start ?? ''}:00Z`) - Date.parse(`${prev.end ?? ''}:00Z`)) / 6e4,
			);
			if (gap > 0 && gap < 48 * 60) {
				items.push({
					kind: 'layover',
					key: `${prev.id}>${l.id}`,
					minutes: gap,
					where: prev.toName !== undefined && prev.toName !== '' ? prev.toName : prev.to,
				});
			}
		}
		const isNow =
			l.type === 'stay' &&
			d !== '' &&
			d <= today &&
			today <= dayKey(l.end !== undefined && l.end !== '' ? l.end : l.start) &&
			here === l;
		const same = prev !== null && dayKey(prev.start) === d;
		const when =
			d === ''
				? ('nodate' as const)
				: same
					? null
					: {
							day: String(Number(d.slice(8, 10))),
							label: `${MON[Number(d.slice(5, 7)) - 1] ?? ''} · ${WD[weekday(d)] ?? ''}`,
						};
		items.push({ kind: 'leg', leg: l, when, isNow });
		prev = l;
	}
	return {
		legs,
		span,
		eyebrow,
		lede,
		jumps,
		items,
		scrollToToday: span !== null && span.first < today && today <= span.last,
	};
}
