// The Today screen's view model (port of game/public/trip.js viewToday, countdown, answerRow and the clocks).
// Pure: the day and the instant come in as arguments, so tests pin "today" without touching the clock. The maths
// itself is @atr/shared's todayModel; this file only adds which day "today" is, and the text the old page wrote.
import {
	dayKey,
	diffDays,
	inDays,
	instantOf,
	legOffsets,
	localKey,
	localStamp,
	offsetOn,
	pad,
	stayName,
	timeOf,
	todayModel,
	tripSpan,
	TZ_OFFSET,
	type OnDay,
	type TodayModel,
	type Upcoming,
} from '@atr/shared/trip';
import type { Rating } from '@atr/shared/elo';
import type { Answer, ContentCountry, ContentPlace } from '#lib/content/types.js';
import { taskStatus } from '../money/record/schema.ts';
import { flag, num, str } from '../money/trip-docs.ts';
import { countryName, fmtDay, fmtShort, plural } from '../trip/format.ts';
import type { TripDay, TripDoc, TripLeg } from '../trip/types.ts';

/** A place as Today reads it: the content card plus the traveler's call, note and game rating. */
export type TodayPlace = ContentPlace & {
	verdict: 'must' | 'maybe' | 'skip' | null;
	note: string | null;
	rating: number | null;
};

/** A task as Today reads it (old taskRow fields). */
export interface TodayTask {
	id: string;
	title: string;
	note: string;
	status: 'todo' | 'doing' | 'done';
	done: boolean;
	order: number;
	suggested: boolean;
}

export type Model = TodayModel<TripLeg, TodayPlace, TodayTask, TripDay>;

/** Typed tasks from trip.all (a hand-edited field of the wrong type reads as missing). */
export function todayTasks(docs: readonly TripDoc[]): TodayTask[] {
	return docs.map((x) => {
		const status = taskStatus(x);
		return {
			id: x.id,
			title: str(x, 'title'),
			note: str(x, 'note'),
			status,
			done: status === 'done',
			order: num(x, 'order'),
			suggested: flag(x, 'suggested'),
		};
	});
}

/** The cards joined with feedback.state (old GET /api/state did this join on the server). */
export function todayPlaces(
	places: readonly ContentPlace[],
	verdicts: Readonly<Record<string, 'must' | 'maybe' | 'skip' | undefined>>,
	notes: Readonly<Record<string, string>>,
	ratings: Readonly<Record<string, Rating>>,
): TodayPlace[] {
	return places.map((p) => ({
		...p,
		verdict: verdicts[p.id] ?? null,
		note: notes[p.id] ?? null,
		rating: ratings[p.id]?.rating ?? null,
	}));
}

/** todayModel for one clock (explicit day and stamp, never the machine's). */
export function modelFor(
	input: {
		legs: readonly TripLeg[];
		places: readonly TodayPlace[];
		tasks: readonly TodayTask[];
		days: readonly TripDay[];
		visited: readonly { id: string }[];
	},
	clock: TripClock,
): Model {
	return todayModel({ ...input, today: clock.today, now: clock.now });
}

/** "YYYY-MM-DDTHH:MM", the wall clock at `offset` hours from UTC at instant `ms`. */
export function stampAt(ms: number, offset: number): string {
	const d = new Date(ms + offset * 36e5);
	return `${String(d.getUTCFullYear())}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export interface TripClock {
	/** YYYY-MM-DD */
	today: string;
	/** "YYYY-MM-DDTHH:MM", local to `today`'s place. */
	now: string;
	/** The UTC offset `today` and `now` are in; null: the device's own zone. */
	offset: number | null;
}

/**
 * Which day it is for the traveler. During the trip that is the date where the current leg is (the stay of that
 * day, else the last one before it: offsetOn), whatever zone the phone is set to. Before and after the trip, and
 * with no dated legs, it is the device's own date, as on the old page. `device` is the device's local date and
 * stamp at `ms` (passed in so tests do not depend on the machine's zone).
 */
export function tripClock(
	legs: readonly TripLeg[],
	ms: number,
	device: { day: string; stamp: string } = {
		day: localKey(new Date(ms)),
		stamp: localStamp(new Date(ms)),
	},
): TripClock {
	const own: TripClock = { today: device.day, now: device.stamp, offset: null };
	const span = tripSpan(legs);
	if (span === null) return own;
	const first = offsetOn(legs, device.day);
	if (first === null) return own;
	const guess = dayKey(stampAt(ms, first));
	if (guess < span.first || guess > span.last) return own;
	// The guessed day can sit in another stay (crossing midnight while changing zones): read its offset again.
	const offset = offsetOn(legs, guess) ?? first;
	const now = stampAt(ms, offset);
	return { today: dayKey(now), now, offset };
}

/** A day picked on the page (/today/<date>): its morning, as the old T.day did ("09:00" for the next flight). */
export function pinnedClock(legs: readonly TripLeg[], day: string): TripClock {
	return { today: day, now: `${day}T09:00`, offset: offsetOn(legs, day) };
}

/** A YYYY-MM-DD that is a real date, else null (the /today/<date> argument). */
export function dayArg(raw: string | undefined): string | null {
	if (raw === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
	const d = new Date(`${raw}T00:00:00Z`);
	return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw ? null : raw;
}

/** IANA zones of the clocks row (the old TZ table). */
export const CLOCK_ZONES: Readonly<Record<string, string>> = {
	brazil: 'America/Sao_Paulo',
	china: 'Asia/Shanghai',
	'hong-kong': 'Asia/Hong_Kong',
	singapore: 'Asia/Singapore',
	thailand: 'Asia/Bangkok',
	korea: 'Asia/Seoul',
	japan: 'Asia/Tokyo',
};

export interface Clock {
	country: string;
	/** "São Paulo", or the country's name. */
	name: string;
	/** "Sun" */
	weekday: string;
	/** "14:05" */
	time: string;
	/** Hours from UTC (TZ_OFFSET), for the label. */
	offset: number | null;
}

/** The clocks row: São Paulo and China before the trip, else the country you are in and São Paulo. */
export function clocks(
	m: Pick<Model, 'phase' | 'country'>,
	ms: number,
	countries: readonly ContentCountry[],
): Clock[] {
	const ids =
		m.phase === 'before'
			? ['brazil', 'china']
			: [...new Set([m.country, 'brazil'].filter((c): c is string => c !== null && c !== ''))];
	return ids.map((c) => {
		const { weekday, time } = clockAt(ms, CLOCK_ZONES[c]);
		return {
			country: c,
			name: c === 'brazil' ? 'São Paulo' : countryName(c, countries),
			weekday,
			time,
			offset: TZ_OFFSET[c] ?? null,
		};
	});
}

/** Weekday and HH:MM at `ms` in an IANA zone ("–" when the zone is unknown, as the old clock()). */
export function clockAt(ms: number, zone: string | undefined): { weekday: string; time: string } {
	if (zone === undefined) return { weekday: '', time: '–' };
	try {
		const parts = new Intl.DateTimeFormat('en-GB', {
			timeZone: zone,
			hour: '2-digit',
			minute: '2-digit',
			weekday: 'short',
			hourCycle: 'h23',
		}).formatToParts(ms);
		const get = (t: Intl.DateTimeFormatPartTypes): string =>
			parts.find((p) => p.type === t)?.value ?? '';
		return { weekday: get('weekday'), time: `${get('hour')}:${get('minute')}` };
	} catch {
		return { weekday: '', time: '–' };
	}
}

export interface Head {
	/** "Sun 15 Nov 2026", plus " · not today" for a picked day. */
	eyebrow: string;
	/** The h1: plain text, then the stay name in italics during the trip. */
	title: string;
	titleStay: string;
	lede: string;
}

/** The header of the page (old head() call in viewToday). */
export function head(m: Model, isReal: boolean, countries: readonly ContentCountry[]): Head {
	const k = m.today;
	const eyebrow = `${fmtDay(k)} ${k.slice(0, 4)}${isReal ? '' : ' · not today'}`;
	let title = 'No trip dates yet',
		titleStay = '',
		lede = '';
	if (m.phase === 'before' && m.span) {
		title =
			m.toDeparture === 0 ? 'You leave today' : `${plural(m.toDeparture ?? 0, 'day')} to departure`;
		lede = `The trip runs ${fmtDay(m.span.first)} → ${fmtDay(m.span.last)}, ${String(m.span.days)} days.`;
	} else if (m.phase === 'during' && m.span) {
		title = `Day ${String(m.dayNumber ?? 0)} of ${String(m.span.days)}`;
		if (m.stay) {
			titleStay = stayName(m.stay);
			const left = diffDays(k, dayKey(m.stay.end ?? m.stay.start));
			const where =
				left > 0
					? `${plural(left, 'more night')} here, until ${fmtDay(m.stay.end)}.`
					: left === 0 && dayKey(m.stay.start) !== k
						? 'You leave today.'
						: 'Just for today.';
			lede = `${countryName(m.country, countries)}. ${where}${m.nextStay ? ` Next: ${stayName(m.nextStay)}.` : ''}`;
		} else lede = 'Between stays today.';
	} else if (m.phase === 'after') title = 'Back home';
	return { eyebrow, title, titleStay, lede };
}

/** The Next flight chip: "in 15 days", "tomorrow", "in 3 h 05 min" or "today" (old countdown()). */
export function countdown(
	fl: TripLeg,
	legs: readonly TripLeg[],
	clock: TripClock,
	pinned: boolean,
	ms: number,
): string {
	const n = diffDays(clock.today, dayKey(fl.start));
	if (n > 1) return `in ${String(n)} days`;
	if (n === 1) return 'tomorrow';
	const t = timeOf(fl.start);
	if (t === '' || pinned) return 'today';
	// the real instant, so it is right whatever zone this device is in
	const at = instantOf(fl.start, legOffsets(fl, legs).start);
	const mins = Number.isFinite(at)
		? Math.round((at - ms) / 6e4)
		: Number(t.slice(0, 2)) * 60 +
			Number(t.slice(3, 5)) -
			(Number(clock.now.slice(11, 13)) * 60 + Number(clock.now.slice(14, 16)));
	return mins > 0 ? `in ${String(Math.floor(mins / 60))} h ${pad(mins % 60)} min` : 'today';
}

/** "Only today", "Last day", "Until 24 Dec · 3 more days". */
export const kindLabel = (h: OnDay<TodayPlace>): string =>
	h.kind === 'only'
		? 'Only today'
		: h.kind === 'last'
			? 'Last day'
			: `Until ${fmtShort(h.to)} · ${plural(h.left, 'more day')}`;

/** " · in Osaka, a day trip" when the event is not in the city you sleep in. */
export const elsewhere = (h: OnDay<TodayPlace>): string =>
	h.reach === 'here' ? '' : ` · in ${h.place.cityName}${h.reach === 'near' ? ', a day trip' : ''}`;

/** "Sat 26 Dec – 28 Dec" (bold part) and " · in 3 days · a day trip from Kyoto · stop not fixed". */
export function upcomingWhen(
	u: Upcoming<TodayPlace, TripLeg>,
	today: string,
): { date: string; rest: string } {
	return {
		date: `${fmtDay(u.date)}${u.to !== u.date ? ` – ${fmtShort(u.to)}` : ''}`,
		rest: ` · ${inDays(today, u.date)}${u.reach === 'here' ? '' : ` · a day trip from ${stayName(u.stay)}`}${u.open ? ' · stop not fixed' : ''}`,
	};
}

/** Cards in the cities of a stay and how many of them are Must (old cityCards). */
export function cityCards(
	places: readonly TodayPlace[],
	cities: readonly string[],
): { n: number; must: number } {
	const xs = places.filter((p) => cities.includes(p.city));
	return { n: xs.length, must: xs.filter((p) => p.verdict === 'must').length };
}

/** Markdown in a tldr as plain text (the compact card shows no links or emphasis). */
export const plainMd = (s: string): string =>
	s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '');

/** "20 Nov 2026" from the asked date. */
export const askedLabel = (a: Pick<Answer, 'asked'>): string =>
	`${fmtShort(a.asked)} ${a.asked.slice(0, 4)}`;
