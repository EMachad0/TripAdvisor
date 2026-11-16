// Formatting and small parsers shared by the Itinerary, the Calendar and the trip forms. Ports of the helpers at
// the top of game/public/trip.js (fmtDay, fmtShort, plural, legStatus, parsePlan, linkify, the map and Uber links).
import { dayKey, weekday } from '@atr/shared/trip';

export const MON = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
] as const;
export const MONL = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
] as const;
export const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const monthOf = (k: string): string => MON[Number(k.slice(5, 7)) - 1] ?? '';

/** "Sun 6 Dec" from a date or a stamp; '' when there is no date. */
export function fmtDay(s: string | null | undefined): string {
	const k = dayKey(s);
	return k === ''
		? ''
		: `${WD[weekday(k)] ?? ''} ${String(Number(k.slice(8, 10)))} ${monthOf(k)}`;
}

/** "6 Dec" from a date or a stamp; '' when there is no date. */
export function fmtShort(s: string | null | undefined): string {
	const k = dayKey(s);
	return k === '' ? '' : `${String(Number(k.slice(8, 10)))} ${monthOf(k)}`;
}

/** The text, or a fallback when it is missing or empty (the old `x || 'Untitled'`). */
export const or = (s: string | null | undefined, fallback: string): string =>
	s !== undefined && s !== null && s !== '' ? s : fallback;

/** "1 night", "3 nights". */
export const plural = (n: number, w: string, ws = `${w}s`): string =>
	`${String(n)} ${n === 1 ? w : ws}`;

/** The status chips of a leg, in the old labels. */
export const STATUS = {
	booked: 'Booked',
	planned: 'To book',
	tbd: 'Not fixed',
	onday: 'On the day',
	later: 'Book later',
} as const;
export type LegStatus = keyof typeof STATUS;

const isStatus = (s: string): s is LegStatus => s in STATUS;

/** The chip a leg shows: a planned Uber, taxi, walk or metro transfer is "On the day". */
export function legStatus(l: { type?: string | undefined; status?: string | undefined; mode?: string | undefined }): string {
	const s = l.status !== undefined && l.status !== '' ? l.status : 'planned';
	return l.type === 'transport' && s === 'planned' && /uber|taxi|99|walk|metro|subway/i.test(l.mode ?? '')
		? 'onday'
		: s;
}

/** The label of a status chip (an unknown status shows as it is). */
export const statusLabel = (s: string): string => (isStatus(s) ? STATUS[s] : s);

/** One step of a transfer plan: "12:30 Request Uber"; a leading "!" marks a key step. */
export interface PlanStep {
	key: boolean;
	/** "12:30" or "Mon 12:30"; '' when the line has no time. */
	t: string;
	text: string;
}

export function parsePlan(s: string | null | undefined): PlanStep[] {
	return (s ?? '')
		.split('\n')
		.map((x) => x.trim())
		.filter((x) => x !== '')
		.map((line) => {
			const key = line.startsWith('!');
			const x = key ? line.slice(1).trim() : line;
			const m = /^((?:[A-Z][a-z]{2}\s)?\d{1,2}:\d{2})\s*[-–—·]?\s*(.*)$/.exec(x);
			return { key, t: m?.[1] ?? '', text: m ? (m[2] ?? '') : x };
		});
}

/** A link the traveler typed, made absolute ("trip.com/x" becomes "https://trip.com/x"). */
export function safeUrl(u: string | null | undefined): string {
	const s = (u ?? '').trim();
	return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** A URL as short link text: no scheme, no www, no trailing slash, at most 48 characters. */
export const shortUrl = (u: string): string =>
	u
		.replace(/^https?:\/\/(www\.)?/i, '')
		.replace(/\/$/, '')
		.slice(0, 48);

/** Free text split around the http(s) links in it (the old linkify). */
export type LinkPart = { kind: 'text'; text: string } | { kind: 'link'; href: string; text: string };

export function linkParts(s: string | null | undefined): LinkPart[] {
	const text = s ?? '';
	const out: LinkPart[] = [];
	let from = 0;
	for (const m of text.matchAll(/https?:\/\/[^\s<]+/g)) {
		const at = m.index;
		if (at > from) out.push({ kind: 'text', text: text.slice(from, at) });
		out.push({ kind: 'link', href: m[0], text: shortUrl(m[0]) });
		from = at + m[0].length;
	}
	if (from < text.length) out.push({ kind: 'text', text: text.slice(from) });
	return out;
}

const enc = encodeURIComponent;
export const gmaps = (q: string): string =>
	`https://www.google.com/maps/search/?api=1&query=${enc(q)}`;
export const amaps = (q: string): string => `https://maps.apple.com/?q=${enc(q)}`;
export const uberTo = (d: string, o?: string): string =>
	`https://m.uber.com/ul/?action=setPickup&${o !== undefined && o !== '' ? `pickup%5Bformatted_address%5D=${enc(o)}` : 'pickup=my_location'}&dropoff%5Bformatted_address%5D=${enc(d)}`;
export const gdirections = (o: string, d: string): string =>
	`https://www.google.com/maps/dir/?api=1&origin=${enc(o)}&destination=${enc(d)}&travelmode=driving`;

/** "Brazil" for the home country, else the config name (or the id). */
export function countryName(
	id: string | null | undefined,
	countries: readonly { id: string; name: string }[],
): string {
	if (id === undefined || id === null || id === '') return '';
	if (id === 'brazil') return 'Brazil';
	return countries.find((c) => c.id === id)?.name ?? id;
}

/** The country flag emoji from the config ('' for Brazil and unknown ids, as the old site). */
export function countryFlag(
	id: string | null | undefined,
	countries: readonly { id: string; flag: string }[],
): string {
	return countries.find((c) => c.id === id)?.flag ?? '';
}
