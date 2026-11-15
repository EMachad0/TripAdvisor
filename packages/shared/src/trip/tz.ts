// Time zones: every clock time on the site is local to where it happens and is shown with its UTC offset.
import { jsString, lookup } from '../util.ts';
import { AIRPORT_TZ, TZ_OFFSET } from './constants.ts';
import { dayKey, pad, timeOf } from './dates.ts';
import { endOrStart, hereOn, legsSorted } from './legs.ts';
import type { Leg } from './types.ts';

/** A number from a form field: '' / null / undefined / not finite give null. */
const num = (v: unknown): number | null =>
	v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);

/** "UTC+8", "UTC−3", "UTC+5:30"; '' when the offset is unknown. */
export function tzLabel(off: unknown): string {
	const o = num(off);
	if (o === null) return '';
	const a = Math.abs(o),
		h = Math.floor(a),
		m = Math.round((a - h) * 60);
	return `UTC${o < 0 ? '−' : '+'}${String(h)}${m ? `:${pad(m)}` : ''}`;
}

/** The instant (ms) of a wall-clock stamp "YYYY-MM-DDTHH:MM" at `off` hours from UTC; NaN when it has no time or offset. */
export function instantOf(stamp: string | null | undefined, off: unknown): number {
	const o = num(off);
	if (timeOf(stamp) === '' || o === null) return NaN;
	return Date.parse(`${String(stamp).slice(0, 16)}:00Z`) - o * 36e5;
}

/** The offset of the place you are in on `day`: that day's stay, else the last stay before it, else home (Brazil). */
export function offsetOn(legs: readonly Leg[] = [], day: string): number | null {
	const here =
		hereOn(legs, day) ??
		legsSorted(legs)
			.filter((l) => l.type === 'stay' && dayKey(l.start) !== '' && dayKey(l.start) <= day)
			.pop();
	return here
		? (num(here.tz) ?? lookup(TZ_OFFSET, here.country) ?? null)
		: (lookup(TZ_OFFSET, 'brazil') ?? null);
}

export interface LegOffsets {
	start: number | null;
	end: number | null;
}

const airportTz = (code: string | undefined): number | undefined =>
	lookup(AIRPORT_TZ, (code ?? '').toUpperCase());

/**
 * The offsets a leg's times are in (null when unknown). Flights use their two airports; stays their
 * country; a transfer or note uses a flight of the same day (the airport it lands at, else the one it leaves from),
 * else the stay of that day. "tz" on a leg (or tzStart / tzEnd on a flight) overrides.
 */
export function legOffsets(l: Leg | null | undefined, legs: readonly Leg[] = []): LegOffsets {
	if (!l) return { start: null, end: null };
	if (l.type === 'flight')
		return {
			start: num(l.tzStart) ?? airportTz(l.from) ?? null,
			end: num(l.tzEnd) ?? airportTz(l.to) ?? null,
		};
	const own = num(l.tz) ?? (l.type === 'stay' ? lookup(TZ_OFFSET, l.country) : undefined) ?? null;
	if (own !== null) return { start: own, end: own };
	const day = dayKey(l.start);
	if (day === '') return { start: null, end: null };
	const sorted = legsSorted(legs);
	const i = sorted.findIndex(
		(x) => x === l || (x.id !== undefined && x.id !== '' && x.id === l.id),
	);
	const flights = sorted
		.map((f, j) => ({ f, j }))
		.filter(({ f }) => f.type === 'flight' && f !== l);
	const landed = flights.filter(({ f, j }) => j < i && dayKey(endOrStart(f)) === day).pop();
	const leaving = flights.find(({ f, j }) => j > i && dayKey(f.start) === day);
	const off = landed
		? legOffsets(landed.f).end
		: leaving
			? legOffsets(leaving.f).start
			: offsetOn(legs, day);
	return { start: off, end: off };
}

const TIME =
	'(?:(?:[01]?\\d|2[0-3]):[0-5]\\d(?:\\s?[ap]m\\b)?|\\b(?:1[0-2]|0?[1-9])\\s?[ap]m\\b)';
const TIME_RUN = new RegExp(
	`(?<![\\d:.,])${TIME}(?:\\s?(?:[–—-]|to|and|or|,|, and|, or)\\s?${TIME})*(?!\\d|:\\d)`,
	'gi',
);

/**
 * Where a timezone label belongs in a piece of free text: the index just after each time, or run of times
 * ("20:00–05:00", "20:00, 21:00 and 22:00"), that does not already have one.
 */
export function tzSpots(text: unknown): number[] {
	const s = jsString(text ?? ''),
		out: number[] = [];
	for (const m of s.matchAll(TIME_RUN)) {
		const end = m.index + m[0].length;
		if (!/^\s*\(?(?:UTC|GMT)\b/i.test(s.slice(end))) out.push(end);
	}
	return out;
}

/** Free text with `label` written after every time that has none. */
export function tzText(text: unknown, label: string | null | undefined): string {
	let s = jsString(text ?? '');
	if (label === undefined || label === null || label === '') return s;
	for (const at of tzSpots(s).reverse()) s = `${s.slice(0, at)} ${label}${s.slice(at)}`;
	return s;
}
