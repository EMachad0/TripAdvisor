// Plain data for the Decide screens (no Svelte, no Convex): the overview counts and steps, the duel pool and
// pairing, the board rows and the holiday sections. Ports of old game.js counts(), viewHome(), duelPool(),
// nextPair(), liveRanking(), board(), countryBlock() and the holiday helpers, on the @atr/shared maths
// (elo, pairing, board), which stay in the browser as before.
import {
	buildBoard,
	countryOn,
	HOLIDAYS,
	holidayDate,
	holidayDay,
	holidayOptions,
	holidayRange,
	picksMany,
	type Board,
	type BoardRow,
	type DayRange,
	type Holiday,
} from '@atr/shared/board';
import { computeRatings, confidence, type Rating } from '@atr/shared/elo';
import { pickPair, type PairHistory } from '@atr/shared/pairing';
import type {
	ContentArea,
	ContentCountry,
	ContentPayload,
	ContentPlace,
} from '#lib/content/types.js';
import type { Verdict, VerdictMap } from '#lib/features/cards/model.js';

/** A place as the decide screens see it: content plus the traveler's call, game rating and note. */
export interface DecidePlace extends ContentPlace {
	verdict: Verdict | null;
	/** Game Elo; null for a place with no call and no duel (as the old client set it). */
	rating: number | null;
	games: number;
	note: string;
}

export interface Duel {
	winner: string;
	loser: string;
}

export type Locks = Readonly<Record<string, string>>;
export type DaysOverrides = Readonly<Record<string, number>>;

/** Holidays that take one locked pick (Christmas, New Year's Eve). */
export const LOCKABLE: readonly string[] = Object.keys(HOLIDAYS).filter((h) => !picksMany(h));
export const HOLIDAY_LIST: readonly Holiday[] = Object.values(HOLIDAYS);
export const holidayById = (id: string): Holiday | undefined =>
	HOLIDAY_LIST.find((h) => h.id === id);

/** Ratings from the calls (local undo applied) and the duel log, as old recompute(). */
export const ratingsOf = (verdicts: VerdictMap, duels: readonly Duel[]): Map<string, Rating> =>
	computeRatings(verdicts.place, duels);

/** Content places joined with calls, ratings and notes. */
export function decidePlaces(
	places: readonly ContentPlace[],
	verdicts: VerdictMap,
	ratings: ReadonlyMap<string, Rating>,
	notes: Readonly<Record<string, string>>,
): DecidePlace[] {
	return places.map((p) => {
		const r = ratings.get(p.id);
		return {
			...p,
			verdict: verdicts.place[p.id] ?? null,
			rating: r?.rating ?? null,
			games: r?.games ?? 0,
			note: notes[p.id] ?? '',
		};
	});
}

const isPick = (p: DecidePlace): boolean => p.verdict === 'must' || p.verdict === 'maybe';

/** Places in the duel pool: Must and Maybe. */
export const duelPool = (places: readonly DecidePlace[]): DecidePlace[] => places.filter(isPick);

export interface Counts {
	places: number;
	placesLeft: number;
	swiped: number;
	areas: number;
	areasLeft: number;
	areasSwiped: number;
	must: number;
	maybe: number;
	pool: number;
	duels: number;
	/** Ranking confidence of the pool, 0..1. */
	conf: number;
	newCount: number;
	/** Holidays still to decide (the Holidays badge). */
	holidayOpen: number;
	/** Lockable holidays with a lock on an existing place. */
	locked: number;
	notes: number;
}

/**
 * Holidays still to decide: a pick-one holiday with options and no lock; a pick-many holiday with an option not
 * called yet (old counts().holidayOpen).
 */
export function holidayOpenCount(places: readonly DecidePlace[], locks: Locks): number {
	return HOLIDAY_LIST.filter((h) => {
		const opts = holidayOptions(places, h.id);
		return picksMany(h.id)
			? opts.some((p) => p.verdict === null)
			: locks[h.id] === undefined && opts.length > 0;
	}).length;
}

/** Old counts(), plus the note count of the My calls link. */
export function counts(
	places: readonly DecidePlace[],
	areas: readonly ContentArea[],
	verdicts: VerdictMap,
	duels: readonly Duel[],
	locks: Locks,
	ratings: ReadonlyMap<string, Rating>,
	notes: { area: Readonly<Record<string, string>>; place: Readonly<Record<string, string>> },
): Counts {
	const swiped = places.filter((p) => p.verdict !== null).length;
	const areasSwiped = areas.filter((a) => verdicts.area[a.id] !== undefined).length;
	const pool = duelPool(places);
	const ids = new Set(places.map((p) => p.id));
	const areaIds = new Set(areas.map((a) => a.id));
	return {
		places: places.length,
		placesLeft: places.length - swiped,
		swiped,
		areas: areas.length,
		areasLeft: areas.length - areasSwiped,
		areasSwiped,
		must: places.filter((p) => p.verdict === 'must').length,
		maybe: places.filter((p) => p.verdict === 'maybe').length,
		pool: pool.length,
		duels: duels.length,
		conf: confidence(
			pool.map((p) => p.id),
			ratings,
		),
		newCount: places.filter((p) => p.isNew).length + areas.filter((a) => a.isNew).length,
		holidayOpen: holidayOpenCount(places, locks),
		locked: LOCKABLE.filter((h) => {
			const id = locks[h];
			return id !== undefined && ids.has(id);
		}).length,
		notes:
			places.filter((p) => (notes.place[p.id] ?? '') !== '').length +
			areas.filter((a) => areaIds.has(a.id) && (notes.area[a.id] ?? '') !== '').length,
	};
}

// ------------------------------------------------------------------ overview

export type StepId = 'areas' | 'swipe' | 'duels' | 'board' | 'holidays';

export interface Step {
	id: StepId;
	n: number;
	title: string;
	text: string;
	done: number;
	total: number;
	unit: string;
	cta: string;
	empty: boolean;
	festive: boolean;
	extra: string;
}

const plural = (n: number, w: string, ws = `${w}s`): string => `${String(n)} ${n === 1 ? w : ws}`;

export const pct = (a: number, b: number): number => (b ? Math.round((a / b) * 100) : 0);

/** The five steps of the overview (old viewHome steps). */
export function steps(n: Counts, days: number): Step[] {
	return [
		{
			id: 'areas',
			n: 1,
			title: 'Areas round',
			text: 'Which regions and cities deserve days?',
			done: n.areasSwiped,
			total: n.areas,
			unit: 'swiped',
			cta: n.areas ? (n.areasLeft ? 'Swipe areas' : 'Review') : 'Coming soon',
			empty: !n.areas,
			festive: false,
			extra: '',
		},
		{
			id: 'swipe',
			n: 2,
			title: 'Swipe round',
			text: 'Must, Maybe or Skip every attraction.',
			done: n.swiped,
			total: n.places,
			unit: 'swiped',
			cta: n.placesLeft ? 'Keep swiping' : 'All swiped',
			empty: !n.places,
			festive: false,
			extra: '',
		},
		{
			id: 'duels',
			n: 3,
			title: 'Duels',
			text: 'This or that? Quick calls build the ranking.',
			done: Math.round(n.conf * 100),
			total: 100,
			unit: '% confident',
			cta: n.pool >= 2 ? 'Duel' : 'Needs 2 picks',
			empty: n.pool < 2,
			festive: false,
			extra: plural(n.duels, 'duel'),
		},
		{
			id: 'board',
			n: 4,
			title: 'Board',
			text: 'Ranked per country, cut at one pick per day.',
			done: Math.min(n.must + n.maybe, days),
			total: days,
			unit: 'days filled',
			cta: 'Open board',
			empty: false,
			festive: false,
			extra: '',
		},
		{
			id: 'holidays',
			n: 5,
			title: 'Holidays',
			text: 'Lock where you spend Christmas and New Year’s Eve, and choose what to do over Lunar New Year.',
			done: n.locked,
			total: LOCKABLE.length,
			unit: 'locked',
			cta: n.locked === LOCKABLE.length && !n.holidayOpen ? 'Locked in' : 'Pick',
			empty: false,
			festive: true,
			extra: '',
		},
	];
}

/** The small line under a step's meter ("3 / 10 swiped · 9 duels", "40% confident", "nothing yet"). */
export function stepLine(s: Step): string {
	if (!s.total) return 'nothing yet';
	const amount = s.unit.startsWith('%')
		? `${String(s.done)}${s.unit}`
		: `${String(s.done)} / ${String(s.total)} ${s.unit}`;
	return s.extra ? `${amount} · ${s.extra}` : amount;
}

/** Total trip days in the config and the date range of the legs. */
export function tripSpan(countries: readonly ContentCountry[]): {
	days: number;
	from: string;
	to: string;
} {
	return {
		days: countries.reduce((s, c) => s + (c.days ?? 0), 0),
		from: countries[0]?.from ?? '',
		to: countries.at(-1)?.to ?? '',
	};
}

// ------------------------------------------------------------------ duels

/** 'mix' (mostly same country) or a country id. */
export type DuelFilter = string;
export type Pair = readonly [string, string];

/** The duel filters: "Mostly same country" and every country with two or more picks. */
export function duelFilters(
	pool: readonly DecidePlace[],
	countries: readonly ContentCountry[],
): { id: DuelFilter; label: string }[] {
	const byC = poolByCountry(pool);
	return [
		{ id: 'mix', label: 'Mostly same country' },
		...countries
			.filter((c) => (byC.get(c.id) ?? 0) >= 2)
			.map((c) => ({ id: c.id, label: `${c.flag} ${c.name}` })),
	];
}

function poolByCountry(pool: readonly DecidePlace[]): Map<string, number> {
	const byC = new Map<string, number>();
	for (const p of pool) byC.set(p.country, (byC.get(p.country) ?? 0) + 1);
	return byC;
}

/** A country filter with fewer than two picks falls back to 'mix' (old viewDuels). */
export function effectiveFilter(pool: readonly DecidePlace[], filter: DuelFilter): DuelFilter {
	return filter !== 'mix' && (poolByCountry(pool).get(filter) ?? 0) < 2 ? 'mix' : filter;
}

/** The next duel (old nextPair / skipDuel): pickPair over the pool, forced to one country by a filter. */
export function nextPair(
	pool: readonly DecidePlace[],
	ratings: ReadonlyMap<string, Rating>,
	history: readonly PairHistory[],
	filter: DuelFilter,
	rng?: () => number,
): Pair | null {
	const pair = pickPair(pool, ratings, history, {
		...(filter === 'mix' ? {} : { country: filter }),
		...(rng === undefined ? {} : { rng }),
	});
	return pair ? [pair[0].id, pair[1].id] : null;
}

/** The current pair still stands: both in the pool and, with a country filter, in that country. */
export function pairStands(
	pair: Pair | null,
	pool: readonly DecidePlace[],
	filter: DuelFilter,
): boolean {
	if (pair === null) return false;
	const sides = pair.map((id) => pool.find((p) => p.id === id));
	if (sides.some((p) => p === undefined)) return false;
	return filter === 'mix' || sides[0]?.country === filter;
}

/** The six best-rated picks of a country (old liveRanking). */
export function liveRanking(pool: readonly DecidePlace[], country: string): DecidePlace[] {
	return pool
		.filter((p) => p.country === country)
		.sort((x, y) => (y.rating ?? 0) - (x.rating ?? 0))
		.slice(0, 6);
}

// ------------------------------------------------------------------ board

/** Category labels for the balance nudges. */
export const labelsOf = (categories: ContentPayload['categories']): Record<string, string> =>
	Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, v.label]));

/** The whole board (old board()). */
export function boardOf(
	places: readonly DecidePlace[],
	content: Pick<ContentPayload, 'countries' | 'interests' | 'dominantShare' | 'categories'>,
	days: DaysOverrides,
	locks: Locks,
): Board<DecidePlace> {
	return buildBoard({
		places,
		countries: content.countries,
		days,
		locks,
		interests: content.interests,
		dominantShare: content.dominantShare,
		labels: labelsOf(content.categories),
	});
}

/** One line of a country's ranked list: a place, or the dashed cut line. */
export type RankLine =
	| {
			kind: 'row';
			key: string;
			place: DecidePlace;
			i: number;
			below: boolean;
			holiday: string | null;
	  }
	| { kind: 'cut'; key: 'cut'; days: number; open: number };

/** The ranked list with the cut line at the number of days (old countryBlock rows). */
export function rankLines(row: BoardRow<DecidePlace>, locks: Locks): RankLine[] {
	const lockedBy = new Map(Object.entries(locks).map(([h, id]) => [id, h]));
	const lines: RankLine[] = [];
	const cut = (open: number): RankLine => ({ kind: 'cut', key: 'cut', days: row.days, open });
	row.ranked.forEach((p, i) => {
		if (i === row.days) lines.push(cut(0));
		lines.push({
			kind: 'row',
			key: p.id,
			place: p,
			i,
			below: i >= row.days,
			holiday: lockedBy.get(p.id) ?? null,
		});
	});
	if (row.ranked.length <= row.days) lines.push(cut(row.open));
	return lines;
}

/** Merge pending (not yet sent) day changes over the saved overrides; null removes an override. */
export function mergeDays(
	saved: DaysOverrides,
	pending: Readonly<Record<string, number | null>>,
): Record<string, number> {
	const out: Record<string, number> = {};
	for (const [k, v] of Object.entries(saved)) if (!(k in pending)) out[k] = v;
	for (const [k, v] of Object.entries(pending)) if (v !== null) out[k] = v;
	return out;
}

/** Places by id. */
export const indexById = (places: readonly DecidePlace[]): ReadonlyMap<string, DecidePlace> =>
	new Map(places.map((p) => [p.id, p]));

export const MAX_DAYS = 90;

/**
 * The change a stepper press makes: the new count (0..90) and the override to store (null when it is back at the
 * plan). Null when nothing changes.
 */
export function stepDays(
	current: number,
	configDays: number,
	step: number,
): { next: number; override: number | null } | null {
	const next = Math.max(0, Math.min(MAX_DAYS, current + step));
	if (next === current) return null;
	return { next, override: next === configDays ? null : next };
}

export type BudgetStatus = 'ok' | 'tight' | 'over';

/** The budget meter's sentence (old countryBlock). */
export function budgetLine(status: BudgetStatus, perDay: number, excluded: number): string {
	const head =
		status === 'over'
			? 'Over the “everything else” budget'
			: status === 'tight'
				? 'Tight: little left for transport and nights out'
				: 'Room left for transport and nightlife';
	const food = excluded ? ` · ${plural(excluded, 'food pick')} not counted` : '';
	return `${head} · ${brl(perDay)}/day${food}`;
}

/** Category counts, biggest first. */
export const mixOf = (counts: Readonly<Record<string, number>>): [string, number][] =>
	Object.entries(counts).sort((a, b) => b[1] - a[1]);

// ------------------------------------------------------------------ holidays

export interface OneSection {
	holiday: Holiday;
	date: string | null;
	where: string | null;
	/** Options, the locked one first, then by rating. */
	opts: DecidePlace[];
	locked: DecidePlace | undefined;
}

/** A pick-one holiday (old holidaySection). */
export function oneSection(
	h: Holiday,
	places: readonly DecidePlace[],
	countries: readonly ContentCountry[],
	lockedId: string | undefined,
): OneSection {
	const date = holidayDate(h.id, countries);
	const where = date === null ? null : countryOn(date, countries);
	const opts = holidayOptions(places, h.id).sort(
		(a, b) =>
			Number(b.id === lockedId) - Number(a.id === lockedId) ||
			(b.rating ?? 1500) - (a.rating ?? 1500),
	);
	return {
		holiday: h,
		date,
		where,
		opts,
		locked: lockedId === undefined ? undefined : places.find((p) => p.id === lockedId),
	};
}

export interface ManySection {
	holiday: Holiday;
	date: string | null;
	where: string | null;
	range: DayRange | null;
	opts: DecidePlace[];
	/** Each option's first day in the holiday (null: not dated in it). */
	days: (string | null)[];
	/** Every option is on its own day. */
	apart: boolean;
}

/** A pick-many holiday (old holidaySectionMany): options in day order. */
export function manySection(
	h: Holiday,
	places: readonly DecidePlace[],
	countries: readonly ContentCountry[],
): ManySection {
	const date = holidayDate(h.id, countries);
	const where = date === null ? null : countryOn(date, countries);
	const range = holidayRange(h.id, countries);
	const opts = holidayOptions(places, h.id, countries);
	const days = opts.map((p) => holidayDay(p, range));
	const apart =
		opts.length > 1 && days.every((d) => d !== null) && new Set(days).size === opts.length;
	return { holiday: h, date, where, range, opts, days, apart };
}

type CountryOf = (id: string) => { flag: string; name: string };

/** "Fri 25 Dec · you’ll be in 🇨🇳 China · 3 options" (old holidaySection header). */
export function oneWhenLine(s: OneSection, country: CountryOf): string {
	const parts: string[] = [];
	if (s.date === null) parts.push('Not in the trip window');
	else {
		parts.push(fmtDate(s.date, WDM));
		if (s.where !== null)
			parts.push(`you’ll be in ${country(s.where).flag} ${country(s.where).name}`);
	}
	if (s.opts.length > 0) parts.push(plural(s.opts.length, 'option'));
	return parts.join(' · ');
}

/** "Fri 5 Feb – Mon 8 Feb · Lunar New Year is Sat 6 Feb · you’ll be in 🇭🇰 Hong Kong" (old holidaySectionMany). */
export function manyWhenLine(s: ManySection, country: CountryOf): string {
	const r = s.range;
	const parts = [
		r === null
			? 'Not in the trip window'
			: r.from === r.to
				? fmtDate(r.from, WDM)
				: `${fmtDate(r.from, WDM)} – ${fmtDate(r.to, WDM)}`,
	];
	if (s.date !== null) parts.push(`${s.holiday.short} is ${fmtDate(s.date, WDM)}`);
	if (s.where !== null)
		parts.push(`you’ll be in ${country(s.where).flag} ${country(s.where).name}`);
	return parts.join(' · ');
}

/** "2 Must · 1 Maybe · 1 not called yet" (old manyTally). */
export function manyTally(opts: readonly DecidePlace[]): string {
	const n = (v: Verdict): number => opts.filter((p) => p.verdict === v).length;
	const left = opts.filter((p) => p.verdict === null).length;
	return [
		n('must') ? `${String(n('must'))} Must` : '',
		n('maybe') ? `${String(n('maybe'))} Maybe` : '',
		n('skip') ? `${String(n('skip'))} Skip` : '',
		left ? `${String(left)} not called yet` : '',
	]
		.filter(Boolean)
		.join(' · ');
}

/** Where the traveler is on a pick-many option's own day, else on the holiday. */
export const whereOn = (
	day: string | null,
	where: string | null,
	countries: readonly ContentCountry[],
): string | null => (day === null ? where : (countryOn(day, countries) ?? where));

/** The mini duel's pair among a holiday's options (no same-country bias, old nextHolidayPair). */
export function holidayPair(
	places: readonly DecidePlace[],
	holidayId: string,
	ratings: ReadonlyMap<string, Rating>,
	duels: readonly Duel[],
	rng?: () => number,
): Pair | null {
	const opts = holidayOptions(places, holidayId).map((p) => ({ id: p.id, country: p.country }));
	const pair = pickPair(opts, ratings, duels, {
		sameCountryBias: 0,
		...(rng === undefined ? {} : { rng }),
	});
	return pair ? [pair[0].id, pair[1].id] : null;
}

/** The booking fact of a holiday card. */
export function bookingFact(b: ContentPlace['booking']): { text: string; warn: boolean } {
	const lead = b.lead_days === undefined ? '?' : String(b.lead_days);
	if (b.level === 'required') return { text: `Must book · ${lead} days ahead`, warn: true };
	if (b.level === 'recommended') {
		return {
			text: `Recommended · ${lead} day${b.lead_days === 1 ? '' : 's'} ahead`,
			warn: false,
		};
	}
	return { text: 'No booking needed', warn: false };
}

/** The larger cover for a holiday card (old thumb -640 → -1280). */
export const largeThumb = (thumb: string): string => thumb.replace(/-\d+\.webp$/, '-1280.webp');

// ------------------------------------------------------------------ formatting

/** R$ like the old brl(): "Free" for 0, '' for no price. */
export function brl(n: number | null | undefined): string {
	if (typeof n !== 'number' || !Number.isFinite(n)) return '';
	return n === 0 ? 'Free' : `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
}

/** A calendar date (YYYY-MM-DD) in en-GB, read in UTC so it never shifts a day ("6 Dec"). */
export function fmtDate(
	d: string,
	o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' },
): string {
	if (!/^\d{4}-\d{2}-\d{2}/.test(d)) return d;
	// Built from the parts, so every engine gives "Fri 25 Dec": some ICU versions put a comma after the weekday.
	return new Intl.DateTimeFormat('en-GB', { ...o, timeZone: 'UTC' })
		.formatToParts(new Date(`${d.slice(0, 10)}T00:00:00Z`))
		.filter((p) => p.type !== 'literal')
		.map((p) => p.value)
		.join(' ');
}

export const WDM: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };

export { plural };
