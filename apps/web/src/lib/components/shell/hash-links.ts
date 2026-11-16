// Old links (plan section 8): the old site was one page with hash routes (#/calendar, #/places/a+b, #/home ...).
// Phone bookmarks and sent links keep working: the app layout maps the hash to the new path on first load.

/** Old page id → new path. `game` and `home` were the ranking overview. */
const PAGES: Readonly<Record<string, string>> = {
	today: '/',
	itinerary: '/trip/itinerary',
	calendar: '/trip/calendar',
	route: '/trip/map',
	places: '/places',
	answers: '/places/answers',
	game: '/decide',
	home: '/decide',
	areas: '/decide/areas',
	swipe: '/decide/swipe',
	duels: '/decide/duels',
	board: '/decide/board',
	holidays: '/decide/holidays',
	calls: '/decide/calls',
	money: '/money',
	todo: '/prep/todo',
	bag: '/prep/bag',
};

/** Pages whose old argument (`#/<page>/<arg>`) has a path segment now. */
const WITH_ARG: Readonly<Record<string, string>> = {
	today: '/today',
	calendar: '/trip/calendar',
	places: '/places',
	answers: '/places/answers',
};

/**
 * The new path for an old `#/page[/arg]` hash, or null when the hash is not an old route (an in-page anchor such
 * as `#answer-x`, or nothing). An unknown page opens Today, as the old router did.
 */
export function hashTarget(hash: string): string | null {
	const m = /^#\/?(.*)$/.exec(hash);
	if (m === null || !hash.startsWith('#/')) return null;
	const [head = '', ...rest] = (m[1] ?? '').split('/');
	const arg = rest.join('/');
	const base = WITH_ARG[head];
	if (arg !== '' && base !== undefined)
		return `${base}/${encodeURIComponent(decodeSafe(arg)).replace(/%2B/g, '+')}`;
	return PAGES[head] ?? '/';
}

function decodeSafe(s: string): string {
	try {
		return decodeURIComponent(s);
	} catch {
		return s;
	}
}
