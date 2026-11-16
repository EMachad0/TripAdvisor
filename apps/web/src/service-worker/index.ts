// The service worker (plan section 11.1): the app opens with no network.
//   - install: precache this build's hashed files, static files and prerendered pages in `precache-<version>`;
//   - activate: keep the newest KEEP_VERSIONS precaches (a page saved under an older build still finds its scripts),
//     drop saved pages of builds no longer kept, take over open tabs;
//   - fetch: precache first for build files; network first with a saved copy for pages, `__data.json`, media, maps
//     and content pages (a slow network falls back to the copy after NETWORK_TIMEOUT_MS); sign-in, sign-out, health
//     and ops endpoints are never cached;
//   - POST /logout forgets the saved pages, runtime responses and the offline query mirror (the outbox is kept: it
//     only replays for the owner).
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { self } from '$app/service-worker';
import { openSyncDB } from '#lib/sync/db.js';
import {
	cacheable,
	isDataRequest,
	NETWORK_TIMEOUT_MS,
	offlineHtml,
	PAGES_CACHE,
	PRECACHE_PREFIX,
	precachesToKeep,
	RUNTIME_CACHE,
	RUNTIME_MAX_ENTRIES,
	savedPagePaths,
	strategyOf,
	VERSION_HEADER,
	versionOfCache,
} from './strategy';

const PRECACHE = `${PRECACHE_PREFIX}${version}`;
const urlOf = (path: string): URL => new URL(path, self.registration.scope);
const PRECACHED = [...immutable, ...assets, ...prerendered].map((p) => urlOf(p.path));
const PRECACHED_PATHS = new Set(PRECACHED.map((u) => u.pathname));

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(PRECACHE);
			await cache.addAll(PRECACHED.map((u) => u.href));
			await self.skipWaiting();
		})(),
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const names = await caches.keys();
			const keep = precachesToKeep(names, PRECACHE);
			for (const name of names) {
				if (name.startsWith(PRECACHE_PREFIX) && !keep.includes(name)) await caches.delete(name);
			}
			const versions = new Set(keep.map(versionOfCache));
			const pages = await caches.open(PAGES_CACHE);
			for (const req of await pages.keys()) {
				const res = await pages.match(req);
				const v = res?.headers.get(VERSION_HEADER);
				if (v === null || v === undefined || !versions.has(v)) await pages.delete(req);
			}
			await self.clients.claim();
		})(),
	);
});

/** The network, or null once `ms` passed (the fetch keeps going and still settles `pending`). */
async function raceNetwork(pending: Promise<Response>, ms: number): Promise<Response | null> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<null>((resolve) => {
		timer = setTimeout(() => {
			resolve(null);
		}, ms);
	});
	try {
		return await Promise.race([pending, late]);
	} finally {
		clearTimeout(timer);
	}
}

/** A copy of `res` that records which build it was saved under. */
async function stamped(res: Response): Promise<Response> {
	const headers = new Headers(res.headers);
	headers.set(VERSION_HEADER, res.headers.get('x-sveltekit-version') ?? version);
	return new Response(await res.blob(), {
		status: res.status,
		statusText: res.statusText,
		headers,
	});
}

async function trim(cache: Cache, max: number): Promise<void> {
	const keys = await cache.keys();
	for (const req of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(req);
}

/**
 * Network first. A good answer is saved; with no network (or a slow one, when a copy exists) the saved copy answers.
 */
async function networkFirst(
	event: FetchEvent,
	cacheName: string,
	save: (cache: Cache, res: Response) => Promise<void>,
	fallback: () => Promise<Response | undefined>,
): Promise<Response> {
	const req = event.request;
	const cache = await caches.open(cacheName);
	const network = fetch(req).then((res) => {
		if (cacheable(res)) event.waitUntil(save(cache, res.clone()));
		return res;
	});
	// When the saved copy answered first, a later network failure is expected, not an error.
	network.catch(() => undefined);
	const saved = cache.match(req, { ignoreVary: true });
	try {
		const quick = await raceNetwork(network, NETWORK_TIMEOUT_MS);
		if (quick !== null) return quick;
		const copy = await saved;
		return copy ?? (await network);
	} catch {
		return (await saved) ?? (await fallback()) ?? Response.error();
	}
}

async function offlinePage(): Promise<Response> {
	const pages = await caches.open(PAGES_CACHE);
	const paths = savedPagePaths((await pages.keys()).map((r) => r.url));
	return new Response(offlineHtml(paths), {
		status: 503,
		headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
	});
}

function page(event: FetchEvent): Promise<Response> {
	const req = event.request;
	return networkFirst(
		event,
		PAGES_CACHE,
		async (cache, res) => {
			await cache.put(req, await stamped(res));
		},
		async () => {
			// A `__data.json` miss fails as a network error: SvelteKit then loads the page itself, which the
			// navigation branch answers from a saved copy or the offline page.
			if (isDataRequest(new URL(req.url))) return undefined;
			const pages = await caches.open(PAGES_CACHE);
			return (await pages.match(req, { ignoreSearch: true, ignoreVary: true })) ?? offlinePage();
		},
	);
}

function runtime(event: FetchEvent): Promise<Response> {
	return networkFirst(
		event,
		RUNTIME_CACHE,
		async (cache, res) => {
			await cache.put(event.request, res);
			await trim(cache, RUNTIME_MAX_ENTRIES);
		},
		() => Promise.resolve(undefined),
	);
}

async function precached(req: Request): Promise<Response> {
	const cache = await caches.open(PRECACHE);
	return (await cache.match(req)) ?? fetch(req);
}

/** A hashed build file: whichever kept build has it, else the network (saved for next time). */
async function immutableFile(req: Request): Promise<Response> {
	const hit = await caches.match(req);
	if (hit !== undefined) return hit;
	const res = await fetch(req);
	if (cacheable(res)) {
		const cache = await caches.open(PRECACHE);
		await cache.put(req, res.clone());
	}
	return res;
}

/** Sign-out: nothing of this account stays readable on the device. */
async function forgetAccount(): Promise<void> {
	await Promise.all([caches.delete(PAGES_CACHE), caches.delete(RUNTIME_CACHE)]);
	try {
		const db = await openSyncDB();
		await db.clear('mirror');
		db.close();
	} catch (error) {
		console.warn('sw: could not clear the offline mirror', error);
	}
}

self.addEventListener('fetch', (event) => {
	const req = event.request;
	const url = new URL(req.url);
	if (req.method === 'POST' && url.origin === self.location.origin && url.pathname === '/logout') {
		event.waitUntil(forgetAccount());
		return;
	}
	const strategy = strategyOf(
		{ url, method: req.method, mode: req.mode, range: req.headers.has('range') },
		self.location.origin,
		PRECACHED_PATHS,
	);
	switch (strategy) {
		case 'skip':
			return;
		case 'precache':
			event.respondWith(precached(req));
			return;
		case 'immutable':
			event.respondWith(immutableFile(req));
			return;
		case 'page':
			event.respondWith(page(event));
			return;
		case 'runtime':
			event.respondWith(runtime(event));
			return;
	}
});

self.addEventListener('message', (event) => {
	if (event.data === 'forget-account') event.waitUntil(forgetAccount());
});
