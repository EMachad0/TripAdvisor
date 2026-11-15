// Place search for the Places tab.
import { lookup } from '../util.ts';
import type { IdDoc, TripPlace } from './types.ts';

const fold = (s: string): string =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase();

/** Text a place is searched by. */
export function haystack(p: TripPlace, catLabel = ''): string {
	const parts = [
		p.name,
		p.short,
		p.name_local,
		p.cityName,
		p.city,
		p.area,
		catLabel,
		p.category,
		p.kind,
		(p.tags ?? []).join(' '),
		p.why,
		p.note,
	];
	return fold(parts.filter((x): x is string => x !== undefined && x !== null && x !== '').join(' · '));
}

export type Show = 'all' | 'picks' | 'must' | 'been' | 'todo';

export interface SearchOptions {
	/** Every word must appear somewhere (accents and case ignored). */
	readonly q?: string;
	/** City ids. */
	readonly cities?: readonly string[] | null;
	readonly country?: string | null;
	readonly category?: string | null;
	readonly show?: Show;
	readonly visited?: readonly IdDoc[];
	readonly categories?: Readonly<Record<string, { readonly label?: string }>>;
}

const order = (p: TripPlace): number =>
	p.verdict === 'must' ? 0 : p.verdict === 'maybe' ? 1 : p.verdict === 'skip' ? 3 : 2;
const isPick = (p: TripPlace): boolean => p.verdict === 'must' || p.verdict === 'maybe';
const set = (s: string | null | undefined): s is string => s !== undefined && s !== null && s !== '';

/**
 * Filter places by text, cities, country, category and `show` ("picks" = Must + Maybe, "must", "been",
 * "todo" = picks not visited, "all"). Order: Must, Maybe, not called, Skip; then by ranking.
 */
export function searchPlaces<P extends TripPlace>(
	places: readonly P[] = [],
	{
		q = '',
		cities = null,
		country = null,
		category = null,
		show = 'all',
		visited = [],
		categories = {},
	}: SearchOptions = {},
): P[] {
	const words = fold(q)
		.split(/\s+/)
		.filter((w) => w !== '');
	const been = new Set(visited.map((v) => v.id));
	return places
		.filter((p) => {
			if (cities && (p.city === undefined || !cities.includes(p.city))) return false;
			if (set(country) && p.country !== country) return false;
			if (set(category) && p.category !== category) return false;
			if (show === 'picks' && !isPick(p)) return false;
			if (show === 'must' && p.verdict !== 'must') return false;
			if (show === 'been' && !been.has(p.id)) return false;
			if (show === 'todo' && (been.has(p.id) || !isPick(p))) return false;
			if (words.length === 0) return true;
			const h = haystack(p, lookup(categories, p.category)?.label);
			return words.every((w) => h.includes(w));
		})
		.sort(
			(a, b) =>
				order(a) - order(b) ||
				(b.rating ?? 0) - (a.rating ?? 0) ||
				String(a.name).localeCompare(String(b.name)),
		);
}
