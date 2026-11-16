// What the service worker does with each request (pure, tested in strategy.test.ts). Plan section 11.1.

/** Cache names. A precache per build version; pages and runtime responses outlive versions. */
export const PRECACHE_PREFIX = 'precache-';
export const PAGES_CACHE = 'pages';
export const RUNTIME_CACHE = 'runtime';
/** Older builds whose precache is kept, so a page saved under an older build still finds its scripts offline. */
export const KEEP_VERSIONS = 3;
/** Media, maps and other runtime responses kept at most (oldest dropped first). */
export const RUNTIME_MAX_ENTRIES = 400;
/** How long a page or media request waits for the network before a saved copy answers (lie-fi on the road). */
export const NETWORK_TIMEOUT_MS = 5000;
/** Header the worker adds to a saved page: the build it belongs to. */
export const VERSION_HEADER = 'x-atr-sw-version';

export type Strategy =
	/** Not handled: the browser goes to the network as if there were no worker. */
	| 'skip'
	/** In this build's precache: cache first. */
	| 'precache'
	/** A hashed build file, maybe of an older build: any cache, else network. */
	| 'immutable'
	/** A page navigation or its `__data.json`: network first, saved copy offline. */
	| 'page'
	/** Media, maps, content pages and the rest: network first with a saved copy. */
	| 'runtime';

export interface RequestFacts {
	url: URL;
	method: string;
	/** `navigate` for a page load. */
	mode: string;
	/** A Range request (video seeking): never cached. */
	range: boolean;
}

/** Paths never answered from a cache: sign-in, sign-out, health and ops endpoints, the deploy check. */
const NEVER = ['/api', '/login', '/logout', '/healthz', '/ops', '/_app/version.json'];

/** `/login`, `/login/__data.json` and `/api/auth/x` match; `/loginx` does not. */
const under = (path: string, p: string): boolean => path === p || path.startsWith(`${p}/`);

export function isDataRequest(url: URL): boolean {
	return url.pathname.endsWith('/__data.json') || url.pathname === '/__data.json';
}

export function strategyOf(
	req: RequestFacts,
	origin: string,
	precached: ReadonlySet<string>,
): Strategy {
	if (req.method !== 'GET' || req.range || req.url.origin !== origin) return 'skip';
	const path = req.url.pathname;
	if (NEVER.some((p) => under(path, p))) return 'skip';
	if (precached.has(path)) return 'precache';
	if (path.startsWith('/_app/immutable/')) return 'immutable';
	if (req.mode === 'navigate' || isDataRequest(req.url)) return 'page';
	return 'runtime';
}

/** Whether a network answer may be saved: a plain same-origin 200 that was not redirected (to /login, say). */
export function cacheable(res: {
	ok: boolean;
	status: number;
	redirected: boolean;
	type: string;
}): boolean {
	return res.ok && res.status === 200 && !res.redirected && res.type === 'basic';
}

/**
 * The precache names to keep: the current one plus the newest others, up to KEEP_VERSIONS in all. `names` is in
 * creation order (CacheStorage.keys()).
 */
export function precachesToKeep(
	names: readonly string[],
	current: string,
	keep = KEEP_VERSIONS,
): string[] {
	const others = names.filter((n) => n.startsWith(PRECACHE_PREFIX) && n !== current);
	return [...others.slice(Math.max(0, others.length - (keep - 1))), current];
}

export const versionOfCache = (name: string): string => name.slice(PRECACHE_PREFIX.length);

/** Saved page paths worth listing on the offline page (navigations, not data). */
export function savedPagePaths(urls: readonly string[]): string[] {
	const paths = new Set<string>();
	for (const u of urls) {
		const url = new URL(u);
		if (isDataRequest(url)) continue;
		paths.add(url.pathname + url.search);
	}
	return [...paths].sort();
}

const escapeHtml = (s: string): string =>
	s.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

/** The page shown for a navigation with no network and no saved copy. */
export function offlineHtml(saved: readonly string[]): string {
	const list =
		saved.length === 0
			? '<p>No pages are saved on this device yet. Open them once while online.</p>'
			: `<p>Saved on this device:</p><ul>${saved
					.map((p) => `<li><a href="${escapeHtml(p)}">${escapeHtml(p)}</a></li>`)
					.join('')}</ul>`;
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>Offline · Asia Trip</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem;line-height:1.5}a{color:inherit}</style></head><body><h1>You are offline</h1><p>This page is not saved on this device.</p>${list}<p><a href="">Try again</a></p></body></html>`;
}
