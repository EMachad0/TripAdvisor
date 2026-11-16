// The Calendar as data (game/public/trip.js calModel, viewCalendar and openDay): one cell per day from the first
// to the last month of the trip, coloured by the country (or stay) you sleep in, with flights, transfers, work /
// vacation, Brazilian holidays and dated cards; and the model of the day sheet.
import {
	addDays,
	dayKey,
	diffDays,
	eventsOn,
	hereOn,
	legsSorted,
	onDay,
	periods,
	stayCities,
	stayName,
	stayOn,
	tripSpan,
	weekday,
	type OnDay,
	type Period,
	type TripPlace,
} from '@atr/shared/trip';
import { MONL, fmtDay, plural } from './format.ts';
import type { TripDay, TripLeg } from './types.ts';

/** Country colour slot 1..7 (the k1-k7 palette). */
export type ColorSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface CalendarBase {
	legs: TripLeg[];
	span: { first: string; last: string; days: number } | null;
	/** Country ids (or stay names for a stay with no country), in trip order: the legend. */
	keys: string[];
	colorOf: (stay: TripLeg) => ColorSlot;
}

const slotOf = (i: number): ColorSlot => ((Math.max(0, i) % 7) + 1) as ColorSlot;

export function calendarBase(rawLegs: readonly TripLeg[]): CalendarBase {
	const legs = legsSorted(rawLegs).filter((l) => dayKey(l.start) !== '');
	const span = tripSpan(legs);
	const keyOf = (l: TripLeg): string =>
		l.country !== undefined && l.country !== '' ? l.country : stayName(l);
	const keys: string[] = [];
	for (const l of legs) {
		if (l.type !== 'stay') continue;
		const k = keyOf(l);
		if (!keys.includes(k)) keys.push(k);
	}
	return { legs, span, keys, colorOf: (s) => slotOf(keys.indexOf(keyOf(s))) };
}

/** Dated cards on a day in the country of the stay (seasons left out); none for a stay at home. */
export function datedOn<P extends TripPlace>(
	places: readonly P[],
	day: string,
	stay: TripLeg | null,
): OnDay<P>[] {
	if (!stay?.country || stay.country === 'brazil') return [];
	return onDay(places, day, { country: stay.country, cities: stayCities(stay) }).filter(
		(h) => !h.season,
	);
}

export interface DayCell {
	key: string;
	day: number;
	stay: TripLeg | null;
	color: ColorSlot | null;
	inTrip: boolean;
	/** Outside the trip with no day note: drawn faint. */
	out: boolean;
	tbd: boolean;
	today: boolean;
	status: 'work' | 'vacation' | null;
	holiday: string;
	flight: boolean;
	transfer: boolean;
	/** A day note or a dated card you could reach. */
	dot: boolean;
	/** The stay name, on the first day of a stay, on Sundays and on the 1st. */
	label: string;
	aria: string;
}

export interface CalendarMonth {
	key: string;
	name: string;
	year: string;
	/** Empty cells before the 1st (Sunday first). */
	lead: number;
	days: DayCell[];
}

export interface CalendarModel extends CalendarBase {
	periods: Period[];
	months: CalendarMonth[];
}

export function calendarModel(
	rawLegs: readonly TripLeg[],
	days: readonly TripDay[],
	places: readonly TripPlace[],
	today: string,
): CalendarModel {
	const base = calendarBase(rawLegs);
	const { legs, span } = base;
	const months: CalendarMonth[] = [];
	if (span) {
		const dayDoc = new Map(days.map((d) => [d.id, d]));
		let y = Number(span.first.slice(0, 4));
		let mo = Number(span.first.slice(5, 7));
		const endY = Number(span.last.slice(0, 4));
		const endM = Number(span.last.slice(5, 7));
		while (y < endY || (y === endY && mo <= endM)) {
			const first = `${String(y)}-${String(mo).padStart(2, '0')}-01`;
			const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
			const cells: DayCell[] = [];
			for (let day = 1; day <= dim; day++) {
				const k = `${first.slice(0, 8)}${String(day).padStart(2, '0')}`;
				const inTrip = k >= span.first && k <= span.last;
				const s = stayOn(legs, k) ?? (inTrip ? hereOn(legs, k) : null);
				const ev = eventsOn(legs, k);
				const flight = ev.some((l) => l.type === 'flight');
				const transfer = ev.some((l) => l.type === 'transport');
				const sp = stayOn(legs, addDays(k, -1));
				const label = s !== null && (sp !== s || weekday(k) === 0 || day === 1) ? stayName(s) : '';
				const di = dayDoc.get(k);
				const dated = s ? datedOn(places, k, s).filter((h) => h.reach !== 'far').length : 0;
				const status = di?.status === 'work' || di?.status === 'vacation' ? di.status : null;
				const holiday = di?.holiday ?? '';
				const aria = [
					fmtDay(k),
					s ? stayName(s) : '',
					status ?? '',
					holiday,
					flight ? 'flight' : '',
					dated > 0 ? plural(dated, 'dated card') : '',
				]
					.filter((x) => x !== '')
					.join(', ');
				cells.push({
					key: k,
					day,
					stay: s,
					color: s ? base.colorOf(s) : null,
					inTrip,
					out: !inTrip && di === undefined,
					tbd: s?.status === 'tbd',
					today: k === today,
					status,
					holiday,
					flight,
					transfer,
					dot: (di?.note ?? '') !== '' || dated > 0,
					label,
					aria,
				});
			}
			months.push({
				key: first.slice(0, 7),
				name: MONL[mo - 1] ?? '',
				year: String(y),
				lead: weekday(first),
				days: cells,
			});
			mo++;
			if (mo > 12) {
				mo = 1;
				y++;
			}
		}
	}
	return { ...base, periods: periods(days), months };
}

export interface DaySheetModel<P extends TripPlace> {
	key: string;
	/** "Day 12 of 66" or "Outside the trip". */
	position: string;
	stay: TripLeg | null;
	day: TripDay | null;
	events: TripLeg[];
	dated: OnDay<P>[];
}

export function daySheetModel<P extends TripPlace>(
	rawLegs: readonly TripLeg[],
	days: readonly TripDay[],
	places: readonly P[],
	k: string,
): DaySheetModel<P> {
	const { legs, span } = calendarBase(rawLegs);
	const stay = stayOn(legs, k) ?? hereOn(legs, k);
	const inTrip = span !== null && k >= span.first && k <= span.last;
	return {
		key: k,
		position: inTrip
			? `Day ${String(diffDays(span.first, k) + 1)} of ${String(span.days)}`
			: 'Outside the trip',
		stay,
		day: days.find((d) => d.id === k) ?? null,
		events: eventsOn(legs, k),
		dated: stay ? datedOn(places, k, stay) : [],
	};
}

/** A calendar route argument: a real YYYY-MM-DD day, else null (the old site ignored anything else). */
export function dayArg(s: string | undefined): string | null {
	if (s === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
	const t = Date.parse(`${s}T00:00:00Z`);
	return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? s : null;
}
