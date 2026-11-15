// Board maths (port of game/lib/board.js): ranking, cutoff lines, balance meter, budget check, book-ahead list,
// holiday dates. Never produces a day-by-day schedule.
import { addDays, ymd } from './board/dates.ts';
import { holidayOf, picksMany } from './board/holidays.ts';
import type { BoardCountry, BoardPlace, Booking, DayRange, Locks } from './board/types.ts';
import { lookup, maxString, minString, orStr, orZero } from './util.ts';

export { addDays } from './board/dates.ts';
export { HOLIDAYS, LUNAR_NEW_YEAR, picksMany, type Holiday } from './board/holidays.ts';
export type * from './board/types.ts';

const VERDICT_ORDER: Readonly<Record<string, number>> = { must: 0, maybe: 1 };

/** The country the traveler is in on a date (from <= date < to), or null. */
export function countryOn(date: string, countries: readonly BoardCountry[] = []): string | null {
	return countries.find((c) => ymd(c.from) <= date && date < ymd(c.to))?.id ?? null;
}

/** Concrete date of a holiday inside the trip window (e.g. '2026-12-25'), or null. */
export function holidayDate(
	holidayId: string,
	countries: readonly BoardCountry[] = [],
): string | null {
	const h = holidayOf(holidayId);
	const [first, ...rest] = countries;
	if (!h || !first) return null;
	const start = minString(ymd(first.from), ...rest.map((c) => ymd(c.from)));
	const end = maxString(ymd(first.to), ...rest.map((c) => ymd(c.to)));
	const candidates =
		h.dates ??
		[...new Set([start.slice(0, 4), end.slice(0, 4)])].map((y) => `${y}-${String(h.md)}`);
	return candidates.find((d) => d >= start && d <= end) ?? null;
}

/** The days a holiday covers inside the trip window (one day unless it has `before` / `after`), or null. */
export function holidayRange(
	holidayId: string,
	countries: readonly BoardCountry[] = [],
): DayRange | null {
	const date = holidayDate(holidayId, countries);
	const h = holidayOf(holidayId);
	if (date === null || !h) return null;
	return { from: addDays(date, -(h.before ?? 0)), to: addDays(date, h.after ?? 0) };
}

/** The first day a dated place (place.days) is on within a range, or null (not dated, or never in it). */
export function holidayDay(
	place: Pick<BoardPlace, 'days'> | null | undefined,
	range: DayRange | null,
): string | null {
	if (!range) return null;
	for (const r of place?.days ?? []) {
		const lo = r.from > range.from ? r.from : range.from,
			hi = r.to < range.to ? r.to : range.to;
		if (lo <= hi) return lo;
	}
	return null;
}

/** Days per country: local what-if override, else trip config. */
export function daysFor(
	country: Pick<BoardCountry, 'id' | 'days'>,
	overrides: Readonly<Record<string, unknown>> | null | undefined = {},
): number {
	const o = overrides ? lookup(overrides, country.id) : undefined;
	return typeof o === 'number' && Number.isFinite(o) && o >= 0 ? o : (country.days ?? 0);
}

const lockedSet = (locks: Locks | null | undefined): Set<string> =>
	new Set(
		Object.values(locks ?? {}).filter((id): id is string => typeof id === 'string' && id !== ''),
	);

/**
 * Ranked candidates for one country: Must/Maybe only. Locked holiday picks first
 * (they're decided), then rating, then Must before Maybe, then name.
 */
export function rankCountry<P extends BoardPlace>(
	places: readonly P[],
	countryId: string,
	locks: Locks | null = {},
): P[] {
	const locked = lockedSet(locks);
	return places
		.filter(
			(p) =>
				p.country === countryId &&
				(p.verdict === 'must' || p.verdict === 'maybe' || locked.has(p.id)),
		)
		.sort(
			(a, b) =>
				Number(locked.has(b.id)) - Number(locked.has(a.id)) ||
				(b.rating ?? 1500) - (a.rating ?? 1500) ||
				(lookup(VERDICT_ORDER, a.verdict) ?? 2) - (lookup(VERDICT_ORDER, b.verdict) ?? 2) ||
				String(a.name).localeCompare(String(b.name)),
		);
}

/** Split a ranked list at the cutoff (one attraction per day). */
export function cutoff<P>(
	ranked: readonly P[],
	days: number | null | undefined,
): { above: P[]; below: P[]; open: number } {
	const n = Math.max(0, Math.floor(orZero(days)));
	return {
		above: ranked.slice(0, n),
		below: ranked.slice(n),
		open: Math.max(0, n - ranked.length),
	};
}

export interface BalanceOptions {
	/** Category ids the traveler wants. */
	readonly interests?: readonly string[];
	readonly dominantShare?: number;
	readonly minForDominant?: number;
	readonly minForMissing?: number;
	readonly labels?: Readonly<Record<string, string>>;
}

export interface Nudge {
	kind: 'dominant' | 'missing';
	category: string;
	text: string;
}

export interface Balance {
	counts: Record<string, number>;
	shares: Record<string, number>;
	total: number;
	dominant: { category: string; share: number } | null;
	missing: string[];
	nudges: Nudge[];
}

/** Category mix of above-the-line picks. */
export function balance(
	picks: readonly Pick<BoardPlace, 'category'>[],
	opts: BalanceOptions = {},
): Balance {
	const {
		interests = [],
		dominantShare = 0.4,
		minForDominant = 4,
		minForMissing = 5,
		labels = {},
	} = opts;
	const counts: Record<string, number> = {};
	for (const p of picks)
		if (p.category !== undefined && p.category !== null && p.category !== '')
			counts[p.category] = (counts[p.category] ?? 0) + 1;
	const total = picks.length;
	const shares = Object.fromEntries(
		Object.entries(counts).map(([k, v]) => [k, total ? v / total : 0]),
	);
	const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
	const dominant =
		top && total >= minForDominant && top[1] / total > dominantShare
			? { category: top[0], share: top[1] / total }
			: null;
	const missing = total >= minForMissing ? interests.filter((c) => (counts[c] ?? 0) === 0) : [];
	const label = (c: string): string => orStr(lookup(labels, c), c);
	const nudges: Nudge[] = [];
	if (dominant)
		nudges.push({
			kind: 'dominant',
			category: dominant.category,
			text: `Heavy on ${label(dominant.category)}: ${String(Math.round(dominant.share * 100))}% of your picks. Duel a few others up?`,
		});
	for (const c of missing)
		nudges.push({ kind: 'missing', category: c, text: `No ${label(c)} above the line yet.` });
	return { counts, shares, total, dominant, missing, nudges };
}

export interface BudgetCheck {
	spend: number;
	cap: number;
	share: number;
	status: 'ok' | 'tight' | 'over';
	perDayAvg: number;
	perDay: number;
	excluded: number;
}

/**
 * Attraction spend vs the "everything else" budget for the days in a country. Places with budgeted === false
 * (food) do not count. status: ok (< 60%), tight (60–100%), over (> 100%).
 */
export function budget(
	picks: readonly Pick<BoardPlace, 'budgeted' | 'brl'>[],
	days: number | null | undefined,
	perDay: number | null | undefined,
): BudgetCheck {
	const counted = picks.filter((p) => p.budgeted !== false);
	const spend = counted.reduce((s, p) => s + (Number(p.brl) || 0), 0);
	const d = orZero(days),
		perDayN = orZero(perDay);
	const cap = d * perDayN;
	const share = cap > 0 ? spend / cap : spend > 0 ? Infinity : 0;
	const status = share > 1 ? 'over' : share >= 0.6 ? 'tight' : 'ok';
	return {
		spend: Math.round(spend * 100) / 100,
		cap,
		share,
		status,
		perDayAvg: d ? spend / d : 0,
		perDay: perDayN,
		excluded: picks.length - counted.length,
	};
}

const hasBooking = (p: BoardPlace): p is BoardPlace & { booking: Booking } =>
	p.booking !== undefined && p.booking !== null;

export interface BookAheadItem {
	id: string;
	name: string | null | undefined;
	country: string | undefined;
	city: string | undefined;
	level: Booking['level'];
	lead_days: number;
	badge: string | null | undefined;
	links: readonly unknown[];
	holiday: string | null;
	visit: string | null;
	deadline: string | null;
}

/**
 * Book-ahead list for the picks, sorted by deadline.
 * Deadline = visit date − lead_days, where the visit date is the holiday date for a locked
 * holiday pick, its own day for an option of a many-pick holiday (Lunar New Year), else the first
 * day in that country (the latest safe date if you went on day one).
 */
export function bookAhead(
	picks: readonly BoardPlace[],
	countries: readonly BoardCountry[] = [],
	locks: Locks | null = {},
): BookAheadItem[] {
	const lockDate = new Map<string, { date: string | null; holiday: string }>();
	for (const [h, id] of Object.entries(locks ?? {}))
		if (typeof id === 'string' && id !== '')
			lockDate.set(id, { date: holidayDate(h, countries), holiday: h });
	// An option of a many-pick holiday happens on its own day of the holiday, not on the first day in the country.
	for (const p of picks)
		for (const h of p.holidays ?? []) {
			const day = picksMany(h) ? holidayDay(p, holidayRange(h, countries)) : null;
			if (day !== null && day !== '' && !lockDate.has(p.id))
				lockDate.set(p.id, { date: day, holiday: h });
		}
	const from = new Map(countries.map((c) => [c.id, ymd(c.from)]));
	const seen = new Set<string>();
	const booked: (BoardPlace & { booking: Booking })[] = [];
	for (const p of picks)
		if (hasBooking(p) && p.booking.level !== 'none' && !seen.has(p.id)) {
			seen.add(p.id);
			booked.push(p);
		}
	return booked
		.map((p): BookAheadItem => {
			const lock = lockDate.get(p.id);
			const visit = (lock?.date ?? '') || (from.get(String(p.country)) ?? '') || null;
			const lead = p.booking.lead_days ?? 0;
			return {
				id: p.id,
				name: p.name,
				country: p.country,
				city: p.city,
				level: p.booking.level,
				lead_days: lead,
				badge: p.booking.badge,
				links: p.booking.links ?? [],
				holiday: lock && lock.holiday !== '' ? lock.holiday : null,
				visit,
				deadline: visit !== null ? addDays(visit, -lead) : null,
			};
		})
		.sort(
			(a, b) =>
				(a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') ||
				(a.level === b.level ? 0 : a.level === 'required' ? -1 : 1) ||
				b.lead_days - a.lead_days,
		);
}

export interface BoardRow<P extends BoardPlace> {
	id: string;
	name: string | undefined;
	flag: string | undefined;
	from: string | undefined;
	to: string | undefined;
	days: number;
	configDays: number;
	changed: boolean;
	perDay: number | undefined;
	ranked: P[];
	above: P[];
	below: P[];
	open: number;
	budget: BudgetCheck;
	balance: Balance;
}

export interface Board<P extends BoardPlace> {
	countries: BoardRow<P>[];
	picks: P[];
	totalDays: number;
	configTotal: number;
	balance: Balance;
	bookAhead: BookAheadItem[];
}

export interface BoardInput<P extends BoardPlace> {
	readonly places?: readonly P[];
	readonly countries?: readonly BoardCountry[];
	/** Local what-if day counts per country. */
	readonly days?: Readonly<Record<string, unknown>>;
	readonly locks?: Locks | null;
	readonly interests?: readonly string[];
	readonly dominantShare?: number;
	readonly labels?: Readonly<Record<string, string>>;
}

/** The whole board. */
export function buildBoard<P extends BoardPlace>({
	places = [],
	countries = [],
	days = {},
	locks = {},
	interests = [],
	dominantShare = 0.4,
	labels = {},
}: BoardInput<P>): Board<P> {
	const rows = countries.map((c): BoardRow<P> => {
		const d = daysFor(c, days);
		const ranked = rankCountry(places, c.id, locks);
		const { above, below, open } = cutoff(ranked, d);
		return {
			id: c.id,
			name: c.name,
			flag: c.flag,
			from: c.from,
			to: c.to,
			days: d,
			configDays: c.days ?? 0,
			changed: d !== (c.days ?? 0),
			perDay: c.budget_brl_per_day,
			ranked,
			above,
			below,
			open,
			budget: budget(above, d, c.budget_brl_per_day),
			balance: balance(above, { interests: [], dominantShare, labels }),
		};
	});
	const picks = rows.flatMap((r) => r.above);
	const lockedPicks = Object.values(locks ?? {})
		.map((id) => places.find((p) => p.id === id))
		.filter((p): p is P => p !== undefined);
	return {
		countries: rows,
		picks,
		totalDays: rows.reduce((s, r) => s + r.days, 0),
		configTotal: countries.reduce((s, c) => s + (c.days ?? 0), 0),
		balance: balance(picks, { interests, dominantShare, labels }),
		bookAhead: bookAhead([...lockedPicks, ...picks], countries, locks),
	};
}

/**
 * Holiday options: places tagged with the holiday's tag. Nothing is dropped for its dates.
 * With `countries`, the options of a many-pick holiday come in day order (those with no day in the holiday last).
 */
export function holidayOptions<P extends BoardPlace>(
	places: readonly P[],
	holidayId: string,
	countries?: readonly BoardCountry[],
): P[] {
	const tag = holidayOf(holidayId)?.tag;
	const opts = places.filter((p) => (p.tags ?? []).some((t) => t === tag));
	if (!countries || !picksMany(holidayId)) return opts;
	const range = holidayRange(holidayId, countries);
	const day = (p: P): string => holidayDay(p, range) ?? '9999';
	return opts.sort(
		(a, b) => day(a).localeCompare(day(b)) || String(a.name).localeCompare(String(b.name)),
	);
}
