// "Book ahead" on Today: what still has to be booked, and by when, so nothing is missed by forgetting it.
// Three kinds: a stay with no bed booked (nowhere to sleep), a flight not bought, and a picked card that needs a
// ticket or a reservation. Each gets a "book by" day; the list is sorted by it. Pure: today comes in.
import { addDays, dayKey, diffDays, legsSorted, stayCities, stayName } from '@atr/shared/trip';
import { fmtDay, plural } from '../trip/format.ts';
import type { TripDoc, TripLeg } from '../trip/types.ts';
import type { TodayPlace } from './model.ts';

/** Days before check-in to book an ordinary bed. */
export const BED_LEAD = 7;
/** Days before check-in when a night falls in a peak (New Year's Eve, Lunar New Year): beds sell out. */
export const PEAK_LEAD = 30;
/** Days before a flight that is not bought yet. */
export const FLIGHT_LEAD = 21;
/** A row whose book-by day is this close (or past) is "due"; the rest go under "Later". */
export const SOON_DAYS = 7;

/** Nights when beds sell out and cost more. `countries` null: everywhere. */
export const PEAKS: readonly {
	from: string;
	to: string;
	label: string;
	countries: readonly string[] | null;
}[] = [
	{ from: '2026-12-31', to: '2026-12-31', label: 'New Year’s Eve', countries: null },
	{
		from: '2027-02-04',
		to: '2027-02-09',
		label: 'Lunar New Year',
		countries: ['china', 'hong-kong', 'korea', 'singapore'],
	},
];

/** Leg statuses that need nothing booked. */
const SETTLED = new Set(['booked', 'onday', 'cancelled']);

/** The settings document that holds the cards marked booked on Today. */
export const BOOKED_DOC = 'booked';

/** Ids of the cards marked booked (settings/booked `places`). */
export function bookedPlaces(settings: readonly TripDoc[]): Set<string> {
	const xs = settings.find((d) => d.id === BOOKED_DOC)?.['places'];
	return new Set(Array.isArray(xs) ? xs : []);
}

export type BookKind = 'bed' | 'flight' | 'place';
export type BookTone = 'late' | 'soon' | 'later';

export interface BookItem {
	kind: BookKind;
	/** Leg id or place id. */
	id: string;
	title: string;
	/** "2 nights from Wed 9 Dec · New Year’s Eve · stop not fixed". */
	detail: string;
	/** The day it is used: check-in, take-off or the visit. */
	on: string;
	/** Book by this day. */
	by: string;
	/** "Book today", "Book by Wed 2 Dec · 7 days left", "Check-in tomorrow". */
	label: string;
	tone: BookTone;
	/** Booking is only recommended (a card), not required. */
	optional: boolean;
}

const isYmd = (s: string | undefined): s is string =>
	s !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** The peak a stay's nights fall in (check-in night up to the night before checkout), else null. */
export function peakOf(leg: TripLeg): string | null {
	const from = dayKey(leg.start);
	const last = addDays(dayKey(leg.end ?? leg.start), -1);
	for (const p of PEAKS) {
		if (p.countries !== null && !p.countries.includes(leg.country ?? '')) continue;
		if (from <= p.to && last >= p.from) return p.label;
	}
	return null;
}

function labelOf(
	kind: BookKind,
	today: string,
	on: string,
	by: string,
): { label: string; tone: BookTone } {
	const toUse = diffDays(today, on);
	const left = diffDays(today, by);
	if (kind === 'bed' && toUse <= 2) {
		return {
			label:
				toUse <= 0
					? 'Tonight: no bed booked'
					: toUse === 1
						? 'Check-in tomorrow: no bed yet'
						: 'Check-in in 2 days: no bed yet',
			tone: 'late',
		};
	}
	if (left < 0) return { label: `Book now · was due ${fmtDay(by)}`, tone: 'late' };
	if (left === 0) return { label: 'Book today', tone: 'late' };
	if (left === 1) return { label: 'Book by tomorrow', tone: 'soon' };
	return {
		label: `Book by ${fmtDay(by)} · ${plural(left, 'day')} left`,
		tone: left <= SOON_DAYS ? 'soon' : 'later',
	};
}

/** Unbooked stays (a bed for at least one night) and flights still ahead. */
export function legItems(legs: readonly TripLeg[], today: string): BookItem[] {
	const out: BookItem[] = [];
	for (const l of legsSorted(legs)) {
		const start = dayKey(l.start);
		if (!isYmd(start) || SETTLED.has(l.status ?? '')) continue;
		const open = l.status === 'tbd' ? ' · stop not fixed' : '';
		if (l.type === 'stay') {
			const end = dayKey(l.end ?? l.start);
			const nights = diffDays(start, end);
			if (nights < 1 || end <= today) continue;
			const peak = peakOf(l);
			const by = addDays(start, -(peak === null ? BED_LEAD : PEAK_LEAD));
			// a stay you are already in counts from tonight
			const on = start < today ? today : start;
			out.push({
				kind: 'bed',
				id: l.id,
				title: `No bed in ${stayName(l)}`,
				detail: `${plural(nights, 'night')} from ${fmtDay(start)}${peak === null ? '' : ` · ${peak}, beds sell out`}${open}`,
				on,
				by,
				...labelOf('bed', today, on, by),
				optional: false,
			});
		} else if (l.type === 'flight') {
			if (start < today) continue;
			const by = addDays(start, -FLIGHT_LEAD);
			const route = l.from && l.to ? `${l.from} → ${l.to}` : stayName(l);
			out.push({
				kind: 'flight',
				id: l.id,
				title: `Flight not bought: ${route}`,
				detail: `${fmtDay(start)}${l.fromName && l.toName ? ` · ${l.fromName} to ${l.toName}` : ''}${open}`,
				on: start,
				by,
				...labelOf('flight', today, start, by),
				optional: false,
			});
		}
	}
	return out;
}

/** The day you could first use a card: a dated card's first day inside a stay in its city, else that stay's first day ahead. */
function visitOf(p: TodayPlace, stays: readonly TripLeg[], today: string): string | null {
	for (const s of stays) {
		if (!stayCities(s).includes(p.city)) continue;
		const lo = [dayKey(s.start), today].sort().at(-1) ?? today;
		const hi = dayKey(s.end ?? s.start);
		if (hi < today) continue;
		if (p.days.length === 0) return lo;
		for (const r of p.days) {
			const d = r.from > lo ? r.from : lo;
			if (d <= hi && (r.open === true || d <= r.to)) return d;
		}
	}
	return null;
}

/**
 * Cards that need booking: Must and Maybe picks with a booking rule, plus any card not skipped whose booking has a
 * fixed deadline (an early price, a lottery), so a new card with a closing date is not missed before it is swiped.
 * Cards visited or marked booked are left out.
 */
export function placeItems(
	places: readonly TodayPlace[],
	legs: readonly TripLeg[],
	today: string,
	{
		visited = new Set<string>(),
		booked = new Set<string>(),
	}: { visited?: ReadonlySet<string>; booked?: ReadonlySet<string> } = {},
): BookItem[] {
	const stays = legsSorted(legs).filter((l) => l.type === 'stay' && isYmd(dayKey(l.start)));
	const out: BookItem[] = [];
	for (const p of places) {
		const b = p.booking;
		if (b.level === 'none' || visited.has(p.id) || booked.has(p.id) || p.verdict === 'skip')
			continue;
		const hard = isYmd(b.deadline) ? b.deadline : null;
		if (p.verdict === null && hard === null) continue;
		const visit = visitOf(p, stays, today);
		if (visit === null) continue;
		const by = hard ?? addDays(visit, -(b.lead_days ?? 0));
		const hint = b.lead_time ?? '';
		out.push({
			kind: 'place',
			id: p.id,
			title: p.name,
			detail: `${p.cityName} · ${fmtDay(visit)}${p.verdict === null ? ' · not called yet' : ''}${hint === '' ? '' : ` · ${hint}`}`,
			on: visit,
			by,
			...labelOf('place', today, visit, by),
			optional: b.level === 'recommended',
		});
	}
	return out;
}

/** Everything to book, by book-by day (required before recommended, then the sooner use). */
export function bookingList(input: {
	legs: readonly TripLeg[];
	places: readonly TodayPlace[];
	today: string;
	visited?: ReadonlySet<string>;
	booked?: ReadonlySet<string>;
}): BookItem[] {
	const { legs, places, today, visited, booked } = input;
	return [
		...legItems(legs, today),
		...placeItems(places, legs, today, {
			...(visited === undefined ? {} : { visited }),
			...(booked === undefined ? {} : { booked }),
		}),
	].sort(
		(a, b) =>
			a.by.localeCompare(b.by) ||
			Number(a.optional) - Number(b.optional) ||
			a.on.localeCompare(b.on),
	);
}
