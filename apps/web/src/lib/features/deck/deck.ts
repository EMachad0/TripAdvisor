// Pure deck and My calls logic (port of game/public/game.js deckItems, the drag thresholds, callItems and the
// calls filters). No Svelte, no Convex: the screens feed it content plus the effective verdicts and notes.
import type { ContentArea, ContentCountry, ContentPlace } from '#lib/content/types.js';
import type { Round, Verdict, VerdictMap } from '#lib/features/cards/model.js';

export type { Round, Verdict, VerdictMap } from '#lib/features/cards/model.js';

/** Notes per round and id (feedback.state notes). */
export interface NoteMap {
	area: Readonly<Record<string, string | undefined>>;
	place: Readonly<Record<string, string | undefined>>;
}

/** A country filter value: 'all' or a country id. */
export type CountryFilter = string;

const countryIndex = (countries: readonly Pick<ContentCountry, 'id'>[]) => {
	const order = countries.map((c) => c.id);
	return (id: string): number => order.indexOf(id) + 1 || 99;
};

/** The verdict of a card, undefined when not swiped. */
export const verdictOf = (verdicts: VerdictMap, round: Round, id: string): Verdict | undefined =>
	Object.hasOwn(verdicts[round], id) ? verdicts[round][id] : undefined;

/** The note on a card, '' when none. */
export const noteOf = (notes: NoteMap, round: Round, id: string): string =>
	(Object.hasOwn(notes[round], id) ? notes[round][id] : undefined) ?? '';

/**
 * The unswiped area cards in deck order: new first, then trip order of the country, then name.
 */
export function areaDeck(
	areas: readonly ContentArea[],
	countries: readonly Pick<ContentCountry, 'id'>[],
	verdicts: VerdictMap,
	filter: CountryFilter,
): ContentArea[] {
	const ci = countryIndex(countries);
	return areas
		.filter(
			(a) =>
				verdictOf(verdicts, 'area', a.id) === undefined &&
				(filter === 'all' || a.country === filter),
		)
		.sort(
			(a, b) =>
				Number(b.isNew) - Number(a.isNew) ||
				ci(a.country) - ci(b.country) ||
				a.name.localeCompare(b.name),
		);
}

/**
 * The unswiped place cards in deck order. Funnel: places in cities of kept areas (must/maybe) come first, cities
 * of skipped areas last; within that, new first, trip order, city, then name.
 */
export function placeDeck(
	places: readonly ContentPlace[],
	areas: readonly Pick<ContentArea, 'id' | 'country' | 'cities'>[],
	countries: readonly Pick<ContentCountry, 'id'>[],
	verdicts: VerdictMap,
	filter: CountryFilter,
): ContentPlace[] {
	const ci = countryIndex(countries);
	const citiesWith = (pick: (v: Verdict | undefined) => boolean): Set<string> =>
		new Set(
			areas
				.filter((a) => pick(verdictOf(verdicts, 'area', a.id)))
				.flatMap((a) => a.cities.map((c) => `${a.country}/${c}`)),
		);
	const skipped = citiesWith((v) => v === 'skip');
	const kept = citiesWith((v) => v === 'must' || v === 'maybe');
	const rank = (p: ContentPlace): number => {
		const key = `${p.country}/${p.city}`;
		return skipped.has(key) ? 2 : kept.has(key) ? 0 : 1;
	};
	return places
		.filter(
			(p) =>
				verdictOf(verdicts, 'place', p.id) === undefined &&
				(filter === 'all' || p.country === filter),
		)
		.sort(
			(a, b) =>
				Number(b.isNew) - Number(a.isNew) ||
				rank(a) - rank(b) ||
				ci(a.country) - ci(b.country) ||
				a.city.localeCompare(b.city) ||
				a.name.localeCompare(b.name),
		);
}

// ---------------------------------------------------------------- Later and Find

/** The traveler's own reordering of a deck: one card picked to the top, and the cards put off for later. */
export interface DeckOrder {
	first: string | null;
	later: readonly string[];
}

/** A deck with the picked card first and the put-off cards last, in the order they were put off. */
export function arrangeDeck<T extends { id: string }>(items: readonly T[], order: DeckOrder): T[] {
	const at = (id: string): number => order.later.indexOf(id);
	const now = items.filter((x) => at(x.id) < 0);
	const later = items.filter((x) => at(x.id) >= 0).sort((a, b) => at(a.id) - at(b.id));
	const out = [...now, ...later];
	const i = order.first === null ? -1 : out.findIndex((x) => x.id === order.first);
	const picked = out[i];
	if (picked !== undefined) {
		out.splice(i, 1);
		out.unshift(picked);
	}
	return out;
}

/** The order after the card `id` is put off: it goes behind every other card, the earlier put-offs included. */
export const putOff = (order: DeckOrder, id: string): DeckOrder => ({
	first: order.first === id ? null : order.first,
	later: [...order.later.filter((x) => x !== id), id],
});

/** The order after the card `id` is picked from the list: it is next, and no longer put off. */
export const pickFirst = (order: DeckOrder, id: string): DeckOrder => ({
	first: id,
	later: order.later.filter((x) => x !== id),
});

/** Unswiped cards per country (the filter chip counts). */
export function leftByCountry(
	items: readonly { id: string; country: string }[],
	round: Round,
	verdicts: VerdictMap,
): Record<string, number> {
	const out: Record<string, number> = {};
	for (const x of items) {
		if (verdictOf(verdicts, round, x.id) === undefined) out[x.country] = (out[x.country] ?? 0) + 1;
	}
	return out;
}

/** The filter chips of a deck: All (with every unswiped card), then each country with cards left, in trip order. */
export function deckFilters(
	countries: readonly Pick<ContentCountry, 'id' | 'name' | 'flag'>[],
	left: Readonly<Record<string, number>>,
): { id: string; label: string; count: number }[] {
	const total = Object.values(left).reduce((a, b) => a + b, 0);
	return [
		{ id: 'all', label: 'All', count: total },
		...countries
			.filter((c) => (left[c.id] ?? 0) > 0)
			.map((c) => ({ id: c.id, label: `${c.flag} ${c.name}`, count: left[c.id] ?? 0 })),
	];
}

// ---------------------------------------------------------------- the drag gesture

/** Past this many px sideways (or up) a released card is swiped. */
export const SWIPE_DISTANCE = 110;
/** A flick faster than this (px/ms) sideways swipes from SWIPE_FLICK_MIN px. */
export const SWIPE_VELOCITY = 0.6;
export const SWIPE_FLICK_MIN = 40;
/** Movement under this (|dx| + |dy|) is a tap, which opens the card. */
export const TAP_SLOP = 6;

/** The stamp a card leans towards while dragged (30 px dead zone). */
export function leanOf(dx: number, dy: number): Verdict | null {
	if (-dy > Math.abs(dx) && -dy > 30) return 'maybe';
	if (dx > 30) return 'must';
	if (dx < -30) return 'skip';
	return null;
}

/** How strongly the stamp shows (0..1). */
export const leanAmount = (dx: number, dy: number): number =>
	Math.min(1, Math.max(Math.abs(dx), -dy) / SWIPE_DISTANCE);

/** What a released drag does: a verdict, or null to spring back. `dt` is the drag time in ms. */
export function releaseVerdict(dx: number, dy: number, dt: number): Verdict | null {
	const vx = dx / Math.max(dt, 1);
	if (
		Math.abs(dx) > SWIPE_DISTANCE ||
		(Math.abs(vx) > SWIPE_VELOCITY && Math.abs(dx) > SWIPE_FLICK_MIN)
	) {
		return dx > 0 ? 'must' : 'skip';
	}
	if (dy < -SWIPE_DISTANCE) return 'maybe';
	return null;
}

/** True when a drag points down far enough (`min` px) to mean Later. */
export const isLaterDrag = (dx: number, dy: number, min = SWIPE_DISTANCE): boolean =>
	dy > min && dy > Math.abs(dx);

/** Arrow keys of the deck. */
export const KEY_VERDICT: Readonly<Record<string, Verdict | undefined>> = {
	ArrowRight: 'must',
	ArrowLeft: 'skip',
	ArrowUp: 'maybe',
};

/** Haptic pulse length per verdict (navigator.vibrate ms). */
export const hapticMs = (verdict: Verdict): number => (verdict === 'skip' ? 8 : 14);

// ---------------------------------------------------------------- My calls

export interface CallItem {
	round: Round;
	id: string;
	name: string;
	short: string | null;
	country: string;
	verdict: Verdict | undefined;
	note: string;
	place: ContentPlace | null;
	area: ContentArea | null;
}

export interface CallsFilter {
	round: 'all' | Round;
	verdict: 'all' | Verdict;
	country: CountryFilter;
	noted: boolean;
}

export const ALL_CALLS: CallsFilter = {
	round: 'all',
	verdict: 'all',
	country: 'all',
	noted: false,
};

const VERDICT_ORDER: Readonly<Record<Verdict, number>> = { must: 0, maybe: 1, skip: 2 };

/** Every swiped or noted card: areas first, then places; each by trip order, verdict (Must first) and name. */
export function callItems(
	content: {
		places: readonly ContentPlace[];
		areas: readonly ContentArea[];
		countries: readonly Pick<ContentCountry, 'id'>[];
	},
	verdicts: VerdictMap,
	notes: NoteMap,
): CallItem[] {
	const ci = countryIndex(content.countries);
	const rows: CallItem[] = [
		...content.areas.map((a): CallItem => ({
			round: 'area',
			id: a.id,
			name: a.name,
			short: null,
			country: a.country,
			verdict: verdictOf(verdicts, 'area', a.id),
			note: noteOf(notes, 'area', a.id),
			place: null,
			area: a,
		})),
		...content.places.map((p): CallItem => ({
			round: 'place',
			id: p.id,
			name: p.name,
			short: p.short,
			country: p.country,
			verdict: verdictOf(verdicts, 'place', p.id),
			note: noteOf(notes, 'place', p.id),
			place: p,
			area: null,
		})),
	].filter((x) => x.verdict !== undefined || x.note !== '');
	const vr = (v: Verdict | undefined): number => (v === undefined ? 3 : VERDICT_ORDER[v]);
	return rows.sort(
		(a, b) =>
			(a.round === b.round ? 0 : a.round === 'area' ? -1 : 1) ||
			ci(a.country) - ci(b.country) ||
			vr(a.verdict) - vr(b.verdict) ||
			a.name.localeCompare(b.name),
	);
}

/** The rows a filter shows. */
export const filterCalls = (all: readonly CallItem[], f: CallsFilter): CallItem[] =>
	all.filter(
		(x) =>
			(f.round === 'all' || x.round === f.round) &&
			(f.verdict === 'all' || x.verdict === f.verdict) &&
			(f.country === 'all' || x.country === f.country) &&
			(!f.noted || x.note !== ''),
	);

/**
 * A tap on a verdict or country chip toggles it back to 'all' when it was on (the round chips do not toggle).
 */
export function toggleCallsFilter(
	f: CallsFilter,
	key: 'round' | 'verdict' | 'country' | 'noted',
	value: string,
): CallsFilter {
	if (key === 'noted') return { ...f, noted: !f.noted };
	if (key === 'round') return { ...f, round: value as CallsFilter['round'] };
	const cur = f[key];
	const next = cur === value && value !== 'all' ? 'all' : value;
	return key === 'verdict'
		? { ...f, verdict: next as CallsFilter['verdict'] }
		: { ...f, country: next };
}

/** Rows grouped by country, in the order they come. */
export function groupByCountry<T extends { country: string }>(
	xs: readonly T[],
): { country: string; items: T[] }[] {
	const out: { country: string; items: T[] }[] = [];
	for (const x of xs) {
		let g = out.find((o) => o.country === x.country);
		if (g === undefined) {
			g = { country: x.country, items: [] };
			out.push(g);
		}
		g.items.push(x);
	}
	return out;
}

/** "3 Musts · 2 Maybes" style counters. */
export const plural = (n: number, one: string, many = `${one}s`): string =>
	`${String(n)} ${n === 1 ? one : many}`;
