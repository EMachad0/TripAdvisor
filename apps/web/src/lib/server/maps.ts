// Static map images for the content pages and the route map (plan section 5: /map, /area-map, /route-map), and the
// raw content files those pages need. The signatures of placeMap, areaMap, routeMap and embeddedMap are FROZEN.
//
// Maps are the old platform staticMap (platform/lib/staticmap.js): OpenStreetMap tiles stitched with sharp around a
// point, rendered at 2x density, cached forever by coordinates. The difference: the cache lives under ATR_CACHE_DIR
// (the web image mounts a volume at /data/cache), else <content root>/.cache like the old server. Tiles go to
// <cache>/tiles/<z>/<x>/<y>.png and maps to <cache>/maps/<lat>_<lng>_<z>_<w>x<h>.webp, the same layout and keys as
// the old cache, so an old cache directory can be copied in as is. ATR_OFFLINE=1 never fetches a tile.
//
// Node only. Relative imports with .ts extensions, like content.ts.
import fs from 'node:fs';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import type { RouteFrameArgs } from '@atr/shared/routemodel';
import { getContent, sourceFromEnv, type ContentSource } from './content.ts';
import * as platform from './platform.js';
import type { AreaFile, DataOptions, PlaceFile, SiteAnswer, TripConfig } from './platform.js';
import * as platformMaps from './platform-maps.js';

/** A rendered map image on disk. */
export interface MapImage {
	/** Absolute path of the .webp file in the map cache. */
	file: string;
	width: number;
	height: number;
}

/** The URL and size a page embeds (old `staticMap` option of renderPlacePage / renderAreaPage). */
export interface EmbeddedMap {
	url: string;
	width: number;
	height: number;
}

/** Cache-Control of every map response (old server: max-age=86400). */
export const MAP_CACHE_CONTROL = 'max-age=86400';
/** How many OpenStreetMap tiles one map fetches at a time. */
const TILE_CONCURRENCY = 4;

// ---------------------------------------------------------------- raw content files

/**
 * The platform files behind getContent(): the content pages and the maps need fields the content model drops
 * (blocks, credits, media folders, the map block's zoom). Re-read whenever getContent()'s version changes.
 */
export interface ContentFiles {
	version: string;
	/** Loader options (content root, fixtures switch, config file), as content.ts passes them. */
	opts: DataOptions & { root: string };
	places: PlaceFile[];
	areas: AreaFile[];
	byId: ReadonlyMap<string, PlaceFile>;
	cfg: TripConfig;
	answers: SiteAnswer[];
}

/** Read the platform files of a content root (no cache). */
export function readContentFiles(source: ContentSource, version = ''): ContentFiles {
	const opts = {
		root: source.root,
		includeFixtures: source.includeFixtures,
		configFile: path.join(source.root, 'config', 'trip.yaml'),
	};
	const places = platform.loadPlaces(opts).filter((p) => p.id && p.name && p.country);
	const areas = platform.loadAreas(opts).filter((a) => a.id && a.name && a.country);
	return {
		version,
		opts,
		places,
		areas,
		byId: new Map(places.map((p) => [p.id, p])),
		cfg: platform.loadTripConfig(opts) ?? { countries: [] },
		answers: platform.siteAnswers({ ...opts, places, areas }),
	};
}

let files: ContentFiles | null = null;

/** The current content files (cached; follows the content cache's change checks). */
export function contentFiles(): ContentFiles {
	const { version } = getContent();
	if (files?.version !== version) files = readContentFiles(sourceFromEnv(), version);
	return files;
}

// ---------------------------------------------------------------- rendering

interface TileWindow {
	x0: number;
	x1: number;
	y0: number;
	y1: number;
	cropLeft: number;
	cropTop: number;
	fullWidth: number;
	fullHeight: number;
}
// platform-maps.d.ts declares only staticMap; tileWindow is the platform's own crop maths (floored offsets).
const { tileWindow } = platformMaps as typeof platformMaps & {
	tileWindow: (lat: number, lng: number, z: number, width: number, height: number) => TileWindow;
};

const UA =
	'AsiaTripRankerBot/0.1 (personal travel-research tool; static maps for a handful of pages)';
const TILE = 256;
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

/** ATR_CACHE_DIR, else <content root>/.cache (the old server's cache). */
export function mapCacheDir(env: NodeJS.ProcessEnv = process.env): string {
	const dir = env['ATR_CACHE_DIR'];
	return dir !== undefined && dir !== '' ? path.resolve(dir) : path.join(platform.ROOT, '.cache');
}

export interface RenderDeps {
	cacheDir?: string;
	fetch?: typeof fetch;
	/** Pause between tile retries (tests pass 0). */
	retryMs?: number;
	offline?: boolean;
}

async function tile(z: number, x: number, y: number, deps: Required<RenderDeps>): Promise<Buffer> {
	const f = path.join(deps.cacheDir, 'tiles', String(z), String(x), `${String(y)}.png`);
	if (fs.existsSync(f)) return fs.readFileSync(f);
	if (deps.offline) throw new Error('offline and tile not cached');
	for (let i = 0; i < 3; i++) {
		const res = await deps.fetch(
			`https://tile.openstreetmap.org/${String(z)}/${String(x)}/${String(y)}.png`,
			{
				headers: { 'User-Agent': UA },
			},
		);
		if (res.ok) {
			const buf = Buffer.from(await res.arrayBuffer());
			fs.mkdirSync(path.dirname(f), { recursive: true });
			fs.writeFileSync(f, buf);
			return buf;
		}
		if (!RETRY_STATUS.has(res.status)) throw new Error(`tile HTTP ${String(res.status)}`);
		await new Promise((r) => setTimeout(r, deps.retryMs * (i + 1)));
	}
	throw new Error('tile server busy');
}

/** The cache file name of a map (same key as the old platform cache). */
export function mapKey(
	lat: number,
	lng: number,
	zoom: number,
	width: number,
	height: number,
): string {
	const z = Math.min(19, zoom + 1); // rendered at 2x density
	return `${lat.toFixed(5)}_${lng.toFixed(5)}_${String(z)}_${String(width)}x${String(height)}.webp`;
}

/** The size of every place and area map. */
const MAP_SIZE = { width: 1200, height: 720 } as const;

const inflight = new Map<string, Promise<MapImage | null>>();

/**
 * Render (or reuse from the cache) a static map centred on lat/lng; null when the point is not a number pair or
 * tiles are unavailable. The pin is not baked in (the page overlays it so it keeps its colour in dark mode).
 * Concurrent requests for the same map share one render.
 */
export function renderStaticMap(
	lat: unknown,
	lng: unknown,
	{
		zoom = 16,
		width = MAP_SIZE.width,
		height = MAP_SIZE.height,
	}: { zoom?: number; width?: number; height?: number } = {},
	deps: RenderDeps = {},
): Promise<MapImage | null> {
	if (typeof lat !== 'number' || typeof lng !== 'number') return Promise.resolve(null);
	const d: Required<RenderDeps> = {
		cacheDir: deps.cacheDir ?? mapCacheDir(),
		fetch: deps.fetch ?? fetch,
		retryMs: deps.retryMs ?? 1500,
		offline: deps.offline ?? process.env['ATR_OFFLINE'] === '1',
	};
	const out = path.join(d.cacheDir, 'maps', mapKey(lat, lng, zoom, width, height));
	if (fs.existsSync(out)) return Promise.resolve({ file: out, width, height });
	const running = inflight.get(out);
	if (running !== undefined) return running;
	const job = (async (): Promise<MapImage | null> => {
		try {
			const z = Math.min(19, zoom + 1);
			const w = tileWindow(lat, lng, z, width, height);
			const spots: { x: number; y: number }[] = [];
			for (let x = w.x0; x <= w.x1; x++) {
				for (let y = w.y0; y <= w.y1; y++) spots.push({ x, y });
			}
			// A few tiles at a time: one by one, a map nobody has opened yet took several seconds.
			const comps: OverlayOptions[] = [];
			let next = 0;
			const worker = async (): Promise<void> => {
				for (let spot = spots[next++]; spot !== undefined; spot = spots[next++]) {
					comps.push({
						input: await tile(z, spot.x, spot.y, d),
						left: (spot.x - w.x0) * TILE,
						top: (spot.y - w.y0) * TILE,
					});
				}
			};
			await Promise.all(Array.from({ length: TILE_CONCURRENCY }, worker));
			const big = await sharp({
				create: { width: w.fullWidth, height: w.fullHeight, channels: 3, background: '#e8e4dc' },
			})
				.composite(comps)
				.png()
				.toBuffer();
			fs.mkdirSync(path.dirname(out), { recursive: true });
			// Write beside, then rename: a reader never sees half a file.
			const tmp = `${out}.${String(process.pid)}.${String(Date.now())}.tmp`;
			await sharp(big)
				.extract({ left: w.cropLeft, top: w.cropTop, width, height })
				.webp({ quality: 80 })
				.toFile(tmp);
			fs.renameSync(tmp, out);
			return { file: out, width, height };
		} catch (e) {
			// Say why instead of silently leaving the placeholder (offline runs are expected to miss tiles).
			if (!d.offline) {
				console.warn(
					`static map skipped for ${String(lat)}, ${String(lng)}: ${e instanceof Error ? e.message : String(e)}`,
				);
			}
			return null;
		} finally {
			inflight.delete(out);
		}
	})();
	inflight.set(out, job);
	return job;
}

// ---------------------------------------------------------------- the maps of the site

interface MapBlock {
	type: 'map';
	zoom?: number;
	embed?: boolean;
}

/** A place's map block, if it has one. */
export function mapBlock(p: PlaceFile): MapBlock | null {
	for (const b of p.blocks ?? []) {
		if (typeof b === 'object' && b !== null && 'type' in b && b.type === 'map') {
			const zoom = 'zoom' in b && typeof b.zoom === 'number' ? b.zoom : undefined;
			const embed = 'embed' in b && typeof b.embed === 'boolean' ? b.embed : undefined;
			return {
				type: 'map',
				...(zoom === undefined ? {} : { zoom }),
				...(embed === undefined ? {} : { embed }),
			};
		}
	}
	return null;
}

/** The map block's zoom, else 16 (a zoom of 0 also means 16, as in the old `mapB.zoom || 16`). */
const placeZoom = (p: PlaceFile): number => {
	const z = mapBlock(p)?.zoom;
	return z === undefined || z === 0 ? 16 : z;
};
const areaZoom = (a: AreaFile): number => (a.scope === 'region' ? 7 : 10);

/** placeMap over given content files (any place with a location; the zoom of its map block, else 16). */
export function placeMapOf(
	files: ContentFiles,
	placeId: string,
	deps: RenderDeps = {},
): Promise<MapImage | null> {
	const p = files.byId.get(placeId);
	if (p === undefined) return Promise.resolve(null);
	return renderStaticMap(p.location?.lat, p.location?.lng, { zoom: placeZoom(p) }, deps);
}

/** areaMap over given content files. */
export function areaMapOf(
	files: ContentFiles,
	areaId: string,
	deps: RenderDeps = {},
): Promise<MapImage | null> {
	const a = files.areas.find((x) => x.id === areaId);
	if (a === undefined) return Promise.resolve(null);
	return renderStaticMap(a.lat, a.lng, { zoom: areaZoom(a) }, deps);
}

/** The map of a place (its location, the map block's zoom or 16), or null when it has none or tiles fail. */
export async function placeMap(placeId: string): Promise<MapImage | null> {
	return placeMapOf(contentFiles(), placeId);
}

/** The map of an area (zoom 7 for a region, else 10), or null. */
export async function areaMap(areaId: string): Promise<MapImage | null> {
	return areaMapOf(contentFiles(), areaId);
}

/** The base image of one route-map frame (overview or a country), from the route model's frame arguments. */
export async function routeMap(frame: RouteFrameArgs): Promise<MapImage | null> {
	const { lat, lng, zoom, width, height } = frame.args;
	return renderStaticMap(lat, lng, { zoom, width, height });
}

/**
 * embeddedMap over given content files and render options (tests and the live function). The page never waits for
 * the image: a map not in the cache yet starts rendering here and the page's <img> gets it from /map or /area-map
 * when it is done. Offline with no cached image there is nothing to show, so the page gets no map.
 */
export function embeddedMapOf(
	files: ContentFiles,
	kind: 'place' | 'area',
	id: string,
	deps: RenderDeps = {},
): Promise<EmbeddedMap | null> {
	let point: { lat: unknown; lng: unknown; zoom: number };
	let url: string;
	if (kind === 'place') {
		const p = files.byId.get(id);
		const block = p === undefined ? null : mapBlock(p);
		if (p === undefined || block === null || block.embed === false) return Promise.resolve(null);
		point = { lat: p.location?.lat, lng: p.location?.lng, zoom: placeZoom(p) };
		url = `/map/${encodeURIComponent(p.id)}.webp`;
	} else {
		const a = files.areas.find((x) => x.id === id);
		if (a === undefined) return Promise.resolve(null);
		point = { lat: a.lat, lng: a.lng, zoom: areaZoom(a) };
		url = `/area-map/${encodeURIComponent(a.id)}.webp`;
	}
	const { lat, lng, zoom } = point;
	if (typeof lat !== 'number' || typeof lng !== 'number') return Promise.resolve(null);
	const { width, height } = MAP_SIZE;
	const cached = fs.existsSync(
		path.join(deps.cacheDir ?? mapCacheDir(), 'maps', mapKey(lat, lng, zoom, width, height)),
	);
	if (!cached) {
		if (deps.offline ?? process.env['ATR_OFFLINE'] === '1') return Promise.resolve(null);
		void renderStaticMap(lat, lng, { zoom }, deps);
	}
	return Promise.resolve({ url, width, height });
}

/**
 * A page's embedded map: its URL and size, without waiting for the image. A place embeds one only when it has a map
 * block without `embed: false`; an area when it has coordinates.
 */
export function embeddedMap(kind: 'place' | 'area', id: string): Promise<EmbeddedMap | null> {
	return embeddedMapOf(contentFiles(), kind, id);
}
