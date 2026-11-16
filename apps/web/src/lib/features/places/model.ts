// Pure model of the Places and Answers pages (old game/public/trip.js viewPlaces / cityIndex and game.js
// viewAnswers, platform render/answers.js renderAnswerCard). No Svelte, no I/O: unit tested in model.test.ts.
import type { Leg } from '@atr/shared/trip';
import {
	legsSorted,
	searchPlaces,
	stayCities,
	tzLabel,
	tzSpots,
	type Show,
} from '@atr/shared/trip';
import type { Answer, ContentCountry, ContentPlace } from '#lib/content/types.js';

export type Verdict = 'must' | 'maybe' | 'skip';

/** The "Which cards" choices, in order (old t-seg). */
export const SHOWS: readonly { id: Show; label: string }[] = [
	{ id: 'all', label: 'All' },
	{ id: 'picks', label: 'Must + Maybe' },
	{ id: 'todo', label: 'Not been' },
	{ id: 'been', label: 'Been' },
];

export const isShow = (v: unknown): v is Show => SHOWS.some((s) => s.id === v);

export const plural = (n: number, w: string, ws = `${w}s`): string =>
	`${String(n)} ${n === 1 ? w : ws}`;

/** A city in the City select: route cities (from the stays, in order) first, then every other city with cards. */
export interface CityOption {
	id: string;
	name: string;
	/** Cards in it. */
	n: number;
	country: string;
	/** On the route (a stay sleeps there). */
	route: boolean;
}

/** Old cityIndex(): cities in route order (from the stays abroad), then the rest by country order and card count. */
export function cityIndex(
	places: readonly ContentPlace[],
	legs: readonly Leg[],
	countryOrder: readonly string[],
): CityOption[] {
	const byCity = new Map<string, ContentPlace[]>();
	for (const p of places) {
		const list = byCity.get(p.city);
		if (list === undefined) byCity.set(p.city, [p]);
		else list.push(p);
	}
	const out: CityOption[] = [];
	const seen = new Set<string>();
	for (const l of legsSorted(legs)) {
		if (l.type !== 'stay' || l.country === 'brazil') continue;
		for (const c of stayCities(l)) {
			const list = byCity.get(c);
			if (seen.has(c) || list === undefined) continue;
			seen.add(c);
			out.push({
				id: c,
				name: list[0]?.cityName ?? c,
				n: list.length,
				country: l.country ?? list[0]?.country ?? '',
				route: true,
			});
		}
	}
	const rest: CityOption[] = [];
	for (const [c, list] of byCity) {
		if (seen.has(c)) continue;
		rest.push({
			id: c,
			name: list[0]?.cityName ?? c,
			n: list.length,
			country: list[0]?.country ?? '',
			route: false,
		});
	}
	const at = (id: string): number => countryOrder.indexOf(id);
	rest.sort((a, b) => at(a.country) - at(b.country) || b.n - a.n);
	return [...out, ...rest];
}

/** `/places/<a+b>`: the known city ids in the path, or null (Everywhere) when none is known. */
export function citiesFromArg(arg: string, cities: readonly CityOption[]): string[] | null {
	let raw = arg;
	try {
		raw = decodeURIComponent(arg);
	} catch {
		// a malformed escape: use the text as it is
	}
	const ids = raw.split('+').filter((c) => cities.some((x) => x.id === c));
	return ids.length > 0 ? ids : null;
}

/** The city filter's select value ('' = Everywhere; several cities joined with '+'). */
export const cityValue = (city: readonly string[] | null): string =>
	city === null ? '' : city.join('+');

/** The cities of today's stay that have cards (the first visit starts there), or null. */
export function startCities(here: Leg | null, cities: readonly CityOption[]): string[] | null {
	const ids = stayCities(here).filter((c) => cities.some((x) => x.id === c));
	return ids.length > 0 ? [...ids] : null;
}

/** A place with the traveler's call, note and game rating joined in (what the old client kept on S.data.places). */
export type PlaceHit = ContentPlace & {
	verdict: Verdict | null;
	note: string | null;
	rating: number | null;
};

export function placeHits(
	places: readonly ContentPlace[],
	verdicts: Readonly<Record<string, Verdict | undefined>>,
	notes: Readonly<Record<string, string | undefined>>,
	ratings: Readonly<Record<string, { rating: number } | undefined>>,
): PlaceHit[] {
	return places.map((p) => ({
		...p,
		verdict: verdicts[p.id] ?? null,
		note: notes[p.id] ?? null,
		rating: ratings[p.id]?.rating ?? null,
	}));
}

export interface PlacesFilter {
	q: string;
	city: readonly string[] | null;
	cat: string | null;
	show: Show;
}

/** The cards that match, in the old order (Must, Maybe, not called, Skip; then rating; then name). */
export function findPlaces(
	hits: readonly PlaceHit[],
	f: PlacesFilter,
	visited: readonly { id: string }[],
	categories: Readonly<Record<string, { label: string }>>,
): PlaceHit[] {
	return searchPlaces(hits, {
		q: f.q,
		cities: f.city,
		category: f.cat,
		show: f.show,
		visited,
		categories,
	});
}

export interface CityGroup {
	key: string;
	country: string;
	cityName: string;
	places: PlaceHit[];
	/** How many of them have a visited row. */
	been: number;
}

/** Results grouped by city, cities in City-select order (old t-group headers with "N/M been"). */
export function groupByCity(
	hits: readonly PlaceHit[],
	cities: readonly CityOption[],
	been: ReadonlySet<string>,
): CityGroup[] {
	const groups = new Map<string, CityGroup>();
	for (const p of hits) {
		const key = `${p.country}/${p.city}`;
		let g = groups.get(key);
		if (g === undefined) {
			g = { key, country: p.country, cityName: p.cityName, places: [], been: 0 };
			groups.set(key, g);
		}
		g.places.push(p);
		if (been.has(p.id)) g.been++;
	}
	const order = cities.map((c) => c.id);
	const cityOf = (key: string): string => key.slice(key.indexOf('/') + 1);
	return [...groups.values()].sort(
		(a, b) => order.indexOf(cityOf(a.key)) - order.indexOf(cityOf(b.key)),
	);
}

/** The categories some card uses, in config order (the Kind select). */
export function usedCategories(
	places: readonly ContentPlace[],
	categories: Readonly<Record<string, { label: string; icon: string }>>,
): { id: string; label: string }[] {
	const used = new Set(places.map((p) => p.category));
	return Object.entries(categories)
		.filter(([id]) => used.has(id))
		.map(([id, c]) => ({ id, label: c.label }));
}

/** The empty-results hint (old viewPlaces). */
export const noMatchHint = (f: PlacesFilter): string =>
	f.city !== null || f.cat !== null || f.show !== 'all'
		? 'Try “Everywhere”, any kind, or All.'
		: 'Try another word.';

/** Google Maps for a place: its pin, else a search by name and city (old placeRow). */
export function mapUrl(p: Pick<ContentPlace, 'loc' | 'name' | 'cityName'>): string {
	return p.loc === null
		? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.cityName}`)}`
		: `https://www.google.com/maps/search/?api=1&query=${String(p.loc.lat)},${String(p.loc.lng)}`;
}

// ---------------------------------------------------------------- answers

export interface AnswerFilter {
	/** A country id, 'trip' (answers about no country) or 'all'. */
	id: string;
	label: string;
	n: number;
}

/**
 * The country chips of the Answers page (old viewAnswers): All, then the trip's countries in order, then any other
 * country, then Whole trip; each with its count, and only when some answer is about it.
 */
export function answerFilters(
	answers: readonly Answer[],
	countries: readonly Pick<ContentCountry, 'id' | 'name' | 'flag'>[],
): AnswerFilter[] {
	const byC = new Map<string, number>();
	for (const a of answers) {
		const k = a.country ?? 'trip';
		byC.set(k, (byC.get(k) ?? 0) + 1);
	}
	const known = new Set(countries.map((c) => c.id));
	return [
		{ id: 'all', label: 'All', n: answers.length },
		...countries
			.filter((c) => byC.has(c.id))
			.map((c) => ({ id: c.id, label: `${c.flag} ${c.name}`, n: byC.get(c.id) ?? 0 })),
		...[...byC.keys()]
			.filter((c) => c !== 'trip' && !known.has(c))
			.map((c) => ({ id: c, label: c, n: byC.get(c) ?? 0 })),
		...(byC.has('trip') ? [{ id: 'trip', label: 'Whole trip', n: byC.get('trip') ?? 0 }] : []),
	];
}

export const filterAnswers = (answers: readonly Answer[], f: string): Answer[] =>
	answers.filter((a) => f === 'all' || (a.country ?? 'trip') === f);

/** `#answer-<id>` → the id, else null. */
export function answerIdFromHash(hash: string): string | null {
	const m = /^#answer-(.+)$/.exec(hash);
	if (m?.[1] === undefined) return null;
	try {
		return decodeURIComponent(m[1]);
	} catch {
		return m[1];
	}
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "13 Nov 2026" from "2026-11-13" (a calendar date, so no timezone); anything else as it is. */
export const answerDate = (d: string): string =>
	/^\d{4}-\d{2}-\d{2}$/.test(d)
		? `${String(Number(d.slice(8, 10)))} ${MON[Number(d.slice(5, 7)) - 1] ?? ''} ${d.slice(0, 4)}`
		: d;

/** The fold's summary (platform renderAnswerCard). */
export function moreLabel(hasBody: boolean, sources: number): string {
	if (hasBody)
		return `Full answer${sources > 0 ? ` and ${sources === 1 ? 'source' : 'sources'}` : ''}`;
	return sources === 1 ? 'Source' : `Sources (${String(sources)})`;
}

/** http(s) links only (platform safeUrl). */
export const safeUrl = (u: string): string => {
	const s = u.trim();
	return /^https?:\/\//i.test(s) ? s : '#';
};

/** "example.com" for a source line (platform hostOf). */
export function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return '';
	}
}

/** The class of the offset label written after a clock time inside answer HTML (same look as TzText). */
export const TZ_LABEL_CLASS = 'text-xs font-medium whitespace-nowrap text-muted-foreground';

/**
 * Escaped platform HTML (md / mdInline output) with the UTC offset written after every clock time in its text, as
 * the old watchTimes pass did with `data-tz`: text between tags only, never inside a tag. `offset` null leaves the
 * HTML as it is ("do not guess").
 */
export function tzMarkup(html: string, offset: number | null): string {
	const label = tzLabel(offset);
	if (label === '') return html;
	return html.replace(/(^|>)([^<]+)/g, (_m, open: string, chunk: string) => {
		let s = chunk;
		for (const at of tzSpots(s).reverse())
			s = `${s.slice(0, at)} <span class="${TZ_LABEL_CLASS}">${label}</span>${s.slice(at)}`;
		return `${open}${s}`;
	});
}
