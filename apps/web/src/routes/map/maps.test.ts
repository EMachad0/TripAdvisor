// Static maps (#lib/server/maps.ts): the tile stitching with a fake tile server, the cache layout and keys of the old
// platform cache, ATR_CACHE_DIR, offline mode, retries, and which places and areas get a map.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	areaMapOf,
	embeddedMapOf,
	mapBlock,
	mapCacheDir,
	mapKey,
	osmTile,
	placeMapOf,
	readContentFiles,
	renderStaticMap,
	TILE_FETCH_LIMIT,
	type ContentFiles,
} from '#lib/server/maps.js';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const E2E_CONTENT = path.join(ROOT, 'packages/migrate/fixtures/e2e/content');

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
const tmpDir = (): string => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-maps-'));
	dirs.push(d);
	return d;
};

let tilePng: Buffer | null = null;
async function png(): Promise<Buffer> {
	tilePng ??= await sharp({
		create: { width: 256, height: 256, channels: 3, background: '#88aa66' },
	})
		.png()
		.toBuffer();
	return tilePng;
}

/** A fake OSM tile server: every tile is a green square; counts requests and checks the User-Agent. */
function tileServer(statuses: number[] = []): { fetch: typeof fetch; urls: string[] } {
	const urls: string[] = [];
	const queue = [...statuses];
	const fake = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		const url = input instanceof Request ? input.url : String(input);
		urls.push(url);
		expect(new Headers(init?.headers).get('User-Agent')).toMatch(/^AsiaTripRankerBot\//);
		const status = queue.shift() ?? 200;
		return status === 200
			? new Response(new Uint8Array(await png()), { status })
			: new Response('busy', { status });
	});
	return { fetch: fake, urls };
}

describe('osmTile (GET /tiles and the stitcher)', () => {
	test('fetches once with the bot User-Agent, caches, and shares one fetch between concurrent calls', async () => {
		const cacheDir = tmpDir();
		const server = tileServer();
		const opts = { cacheDir, fetch: server.fetch, offline: false };
		const [a, b] = await Promise.all([
			osmTile(12, 3425, 1677, opts),
			osmTile(12, 3425, 1677, opts),
		]);
		expect(a.equals(b)).toBe(true);
		expect(server.urls).toEqual(['https://tile.openstreetmap.org/12/3425/1677.png']);
		expect(fs.existsSync(path.join(cacheDir, 'tiles', '12', '3425', '1677.png'))).toBe(true);
		// from the cache afterwards, also offline
		const again = tileServer();
		await osmTile(12, 3425, 1677, { cacheDir, fetch: again.fetch, offline: true });
		expect(again.urls).toEqual([]);
	});

	test('offline and not cached, or refused by the tile server: rejects', async () => {
		await expect(osmTile(5, 1, 1, { cacheDir: tmpDir(), offline: true })).rejects.toThrow(
			/offline/,
		);
		const gone = tileServer([404]);
		await expect(
			osmTile(5, 1, 1, { cacheDir: tmpDir(), fetch: gone.fetch, offline: false, retryMs: 0 }),
		).rejects.toThrow(/404/);
		const busy = tileServer([503, 429]);
		const buf = await osmTile(5, 1, 1, {
			cacheDir: tmpDir(),
			fetch: busy.fetch,
			offline: false,
			retryMs: 0,
		});
		expect(buf.length).toBeGreaterThan(0);
		expect(busy.urls).toHaveLength(3);
	});

	test(`sends at most ${String(TILE_FETCH_LIMIT)} upstream requests at once`, async () => {
		const cacheDir = tmpDir();
		let now = 0;
		let peak = 0;
		const slow = vi.fn(async () => {
			now++;
			peak = Math.max(peak, now);
			await new Promise((r) => setTimeout(r, 5));
			now--;
			return new Response(new Uint8Array(await png()), { status: 200 });
		});
		const tiles = Array.from({ length: 12 }, (_, i) =>
			osmTile(10, i, 7, { cacheDir, fetch: slow, offline: false }),
		);
		await Promise.all(tiles);
		expect(slow).toHaveBeenCalledTimes(12);
		expect(peak).toBe(TILE_FETCH_LIMIT);
	});

	test('a stalled tile server is aborted after the timeout, and the slot is freed', async () => {
		const stalled = vi.fn(
			(_url: string | URL | Request, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						reject(new Error('aborted'));
					});
				}),
		);
		const opts = { cacheDir: tmpDir(), fetch: stalled, offline: false, timeoutMs: 20 };
		await expect(osmTile(6, 1, 1, opts)).rejects.toThrow(/aborted/);
		// every slot is free again: a later tile still loads
		const ok = tileServer();
		const many = Array.from({ length: TILE_FETCH_LIMIT + 1 }, (_, i) =>
			osmTile(6, i, 2, { cacheDir: opts.cacheDir, fetch: ok.fetch, offline: false }),
		);
		await expect(Promise.all(many)).resolves.toHaveLength(TILE_FETCH_LIMIT + 1);
	});
});

describe('renderStaticMap', () => {
	test('stitches tiles into a cached webp, keyed like the old platform cache', async () => {
		const cacheDir = tmpDir();
		const server = tileServer();
		const m = await renderStaticMap(
			45.8038,
			126.5349,
			{ zoom: 10 },
			{ cacheDir, fetch: server.fetch, offline: false },
		);
		expect(m).not.toBeNull();
		expect(m?.file).toBe(path.join(cacheDir, 'maps', '45.80380_126.53490_11_1200x720.webp'));
		expect(m?.width).toBe(1200);
		const meta = await sharp(m?.file).metadata();
		expect([meta.format, meta.width, meta.height]).toEqual(['webp', 1200, 720]);
		expect(server.urls.length).toBeGreaterThan(0);
		expect(server.urls.every((u) => u.startsWith('https://tile.openstreetmap.org/11/'))).toBe(true);
		// tiles land in <cache>/tiles/<z>/<x>/<y>.png
		const [z, x, y] = new URL(server.urls[0] ?? '').pathname
			.slice(1)
			.replace('.png', '')
			.split('/');
		expect(fs.existsSync(path.join(cacheDir, 'tiles', z ?? '', x ?? '', `${y ?? ''}.png`))).toBe(
			true,
		);
		// a second request is served from the cache, with no tile fetch
		const again = tileServer();
		expect(
			await renderStaticMap(
				45.8038,
				126.5349,
				{ zoom: 10 },
				{ cacheDir, fetch: again.fetch, offline: false },
			),
		).toEqual(m);
		expect(again.urls).toEqual([]);
	});

	test('reuses cached tiles for a new size and shares one render between concurrent calls', async () => {
		const cacheDir = tmpDir();
		const server = tileServer();
		const opts = { cacheDir, fetch: server.fetch, offline: false };
		const [a, b] = await Promise.all([
			renderStaticMap(13.74678, 100.53495, { zoom: 16, width: 400, height: 300 }, opts),
			renderStaticMap(13.74678, 100.53495, { zoom: 16, width: 400, height: 300 }, opts),
		]);
		expect(a).toEqual(b);
		const first = server.urls.length;
		expect(new Set(server.urls).size).toBe(first);
		// the same tiles again in offline mode: everything comes from the tile cache
		const m = await renderStaticMap(
			13.74678,
			100.53495,
			{ zoom: 16, width: 380, height: 300 },
			{ cacheDir, offline: true },
		);
		expect(m?.width).toBe(380);
	});

	test('retries a busy tile server, gives up on other errors, and returns null', async () => {
		const busy = tileServer([503]);
		expect(
			await renderStaticMap(
				10,
				10,
				{ zoom: 3, width: 200, height: 200 },
				{ cacheDir: tmpDir(), fetch: busy.fetch, retryMs: 0, offline: false },
			),
		).not.toBeNull();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const gone = tileServer([404]);
		expect(
			await renderStaticMap(
				10,
				10,
				{ zoom: 3, width: 200, height: 200 },
				{ cacheDir: tmpDir(), fetch: gone.fetch, retryMs: 0, offline: false },
			),
		).toBeNull();
		expect(gone.urls).toHaveLength(1);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('tile HTTP 404'));
		warn.mockRestore();
	});

	test('offline with no cached tiles, or no coordinates: no map and no fetch', async () => {
		const server = tileServer();
		const cacheDir = tmpDir();
		expect(
			await renderStaticMap(1, 2, {}, { cacheDir, fetch: server.fetch, offline: true }),
		).toBeNull();
		expect(await renderStaticMap(undefined, 2, {}, { cacheDir, fetch: server.fetch })).toBeNull();
		expect(await renderStaticMap('1', 2, {}, { cacheDir, fetch: server.fetch })).toBeNull();
		expect(server.urls).toEqual([]);
		expect(fs.existsSync(path.join(cacheDir, 'maps'))).toBe(false);
	});
});

describe('cache location and keys', () => {
	test('ATR_CACHE_DIR, else <content root>/.cache', () => {
		expect(mapCacheDir({ ATR_CACHE_DIR: '/data/cache' })).toBe('/data/cache');
		expect(mapCacheDir({ ATR_CACHE_DIR: '' })).toMatch(/[/\\]\.cache$/);
		expect(mapCacheDir({})).toMatch(/[/\\]\.cache$/);
	});

	test('the key is the old one: 5 decimals, zoom + 1 capped at 19, the size', () => {
		expect(mapKey(31.23, 121.49, 16, 1200, 720)).toBe('31.23000_121.49000_17_1200x720.webp');
		expect(mapKey(1, 2, 19, 10, 20)).toBe('1.00000_2.00000_19_10x20.webp');
	});
});

describe('the maps of places and areas', () => {
	const files = (): ContentFiles => readContentFiles({ root: E2E_CONTENT, includeFixtures: true });
	/** The content files with one place given a map block. */
	function withMapBlock(block: Record<string, unknown>): ContentFiles {
		const f = files();
		const p = f.places[0];
		if (p === undefined) throw new Error('no fixture place');
		const q = { ...p, blocks: [...(p.blocks ?? []), { type: 'map', ...block }] };
		return { ...f, places: [q, ...f.places.slice(1)], byId: new Map([...f.byId, [q.id, q]]) };
	}

	test('mapBlock reads zoom and embed', () => {
		const f = withMapBlock({ zoom: 14, embed: false });
		const p = f.places[0];
		expect(p && mapBlock(p)).toEqual({ type: 'map', zoom: 14, embed: false });
		const plain = files().places[0];
		expect(plain && mapBlock(plain)).toBeNull();
	});

	test('a place map uses the map block zoom, else 16; an area map 10 for a city', async () => {
		const cacheDir = tmpDir();
		const server = tileServer();
		const deps = { cacheDir, fetch: server.fetch, offline: false };
		const f = withMapBlock({ zoom: 12 });
		const id = f.places[0]?.id ?? '';
		expect(path.basename((await placeMapOf(f, id, deps))?.file ?? '')).toMatch(
			/_13_1200x720\.webp$/,
		);
		const plain = files().places[1];
		expect(path.basename((await placeMapOf(files(), plain?.id ?? '', deps))?.file ?? '')).toMatch(
			/_17_1200x720\.webp$/,
		);
		expect((await areaMapOf(files(), 'harbin', deps))?.file).toBe(
			path.join(cacheDir, 'maps', '45.80380_126.53490_11_1200x720.webp'),
		);
		expect(await placeMapOf(files(), 'no-such-place', deps)).toBeNull();
		expect(await areaMapOf(files(), 'no-such-area', deps)).toBeNull();
	});

	test('a page embeds a place map only with a map block (not embed: false), an area map with coordinates', async () => {
		const cacheDir = tmpDir();
		const server = tileServer();
		const deps = { cacheDir, fetch: server.fetch, offline: false };
		const f = withMapBlock({});
		const id = f.places[0]?.id ?? '';
		expect(await embeddedMapOf(f, 'place', id, deps)).toEqual({
			url: `/map/${id}.webp`,
			width: 1200,
			height: 720,
		});
		expect(await embeddedMapOf(withMapBlock({ embed: false }), 'place', id, deps)).toBeNull();
		expect(await embeddedMapOf(files(), 'place', id, deps)).toBeNull();
		expect(await embeddedMapOf(files(), 'area', 'harbin', deps)).toEqual({
			url: '/area-map/harbin.webp',
			width: 1200,
			height: 720,
		});
		expect(await embeddedMapOf(files(), 'area', 'nowhere', deps)).toBeNull();
	});

	test('a page does not wait for a slow map: it embeds the URL at once and the render fills the cache', async () => {
		const cacheDir = tmpDir();
		let release: () => void = () => undefined;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		const slow: typeof fetch = async () => {
			await gate;
			return new Response(new Uint8Array(await png()));
		};
		const deps = { cacheDir, fetch: slow, offline: false };
		expect(await embeddedMapOf(files(), 'area', 'harbin', deps)).toEqual({
			url: '/area-map/harbin.webp',
			width: 1200,
			height: 720,
		});
		expect(fs.existsSync(path.join(cacheDir, 'maps'))).toBe(false);
		release();
		await vi.waitFor(() => {
			expect(
				fs.existsSync(path.join(cacheDir, 'maps', '45.80380_126.53490_11_1200x720.webp')),
			).toBe(true);
		});
	});

	test('offline, a page embeds only a map that is already in the cache', async () => {
		const cacheDir = tmpDir();
		const server = tileServer();
		const offline = { cacheDir, fetch: server.fetch, offline: true };
		expect(await embeddedMapOf(files(), 'area', 'harbin', offline)).toBeNull();
		await areaMapOf(files(), 'harbin', { ...offline, offline: false });
		expect(await embeddedMapOf(files(), 'area', 'harbin', offline)).toEqual({
			url: '/area-map/harbin.webp',
			width: 1200,
			height: 720,
		});
	});
});
