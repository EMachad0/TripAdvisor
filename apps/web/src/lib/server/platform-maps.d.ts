// Types for platform-maps.js (@atr/platform/maps, platform/lib/staticmap.js); see platform.d.ts.
/** platform/lib/staticmap.js: render (or reuse from the cache) a static OSM map; null when tiles are missing. */
export declare function staticMap(
	lat: unknown,
	lng: unknown,
	opts?: { zoom?: number; width?: number; height?: number },
): Promise<{ file: string; width: number; height: number } | null>;
