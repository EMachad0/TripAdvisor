// Map geometry. Everything on the map lives in Web-Mercator "world pixels" at WORLD_Z (the OSM tile scheme,
// 256 px tiles). Base images (cached OSM tiles stitched by platform/lib/staticmap.js) are placed in the same
// space, so the SVG overlay and the images line up at any zoom: zooming is only a change of viewBox.

export const TILE = 256;
export const WORLD_Z = 12;

export interface Point {
	x: number;
	y: number;
}
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}
export interface GeoPoint {
	readonly lat?: unknown;
	readonly lng?: unknown;
}

/** lat/lng → world pixels at zoom z (same formula as platform/lib/staticmap.js). */
export function project(lat: number, lng: number, z: number = WORLD_Z): Point {
	const n = 2 ** z * TILE;
	const s = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
	return { x: ((lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}

/** World pixels at zoom z → lat/lng. */
export function unproject(x: number, y: number, z: number = WORLD_Z): { lng: number; lat: number } {
	const n = 2 ** z * TILE;
	return {
		lng: (x / n) * 360 - 180,
		lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
	};
}

const located = (p: GeoPoint | null | undefined): p is { lat: number; lng: number } =>
	typeof p?.lat === 'number' && typeof p.lng === 'number';

/** Bounding box of lat/lng points in world pixels (w/h ≥ min); null when none has coordinates. */
export function boundsOf(
	points: readonly (GeoPoint | null | undefined)[],
	{ z = WORLD_Z, min = 0 }: { z?: number; min?: number } = {},
): Rect | null {
	const ps = points.filter(located).map((p) => project(p.lat, p.lng, z));
	if (ps.length === 0) return null;
	let x0 = Math.min(...ps.map((p) => p.x)),
		x1 = Math.max(...ps.map((p) => p.x));
	let y0 = Math.min(...ps.map((p) => p.y)),
		y1 = Math.max(...ps.map((p) => p.y));
	if (x1 - x0 < min) {
		const c = (x0 + x1) / 2;
		x0 = c - min / 2;
		x1 = c + min / 2;
	}
	if (y1 - y0 < min) {
		const c = (y0 + y1) / 2;
		y0 = c - min / 2;
		y1 = c + min / 2;
	}
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export interface ImageFrame {
	/** staticMap() arguments (staticMap renders tiles at zoom + 1). */
	zoom: number;
	lat: number;
	lng: number;
	width: number;
	height: number;
	/** Where the image sits in world pixels at WORLD_Z. */
	rect: Rect;
}

export interface ImageFrameOptions {
	pad?: number;
	minSide?: number;
	maxSide?: number;
	minSpanDeg?: number;
	maxTileZoom?: number;
	minTileZoom?: number;
}

/**
 * The base image for a set of points: a square around their bounding box (square, so it still covers the view
 * when the map is wide on a desktop or tall on a phone), at the highest tile zoom that keeps it ≤ maxSide px.
 */
export function imageFrame(
	points: readonly (GeoPoint | null | undefined)[],
	{
		pad = 0.16,
		minSide = 900,
		maxSide = 2048,
		minSpanDeg = 0.4,
		maxTileZoom = 11,
		minTileZoom = 3,
	}: ImageFrameOptions = {},
): ImageFrame | null {
	const minWorld = (minSpanDeg / 360) * 2 ** WORLD_Z * TILE;
	const b = boundsOf(points, { min: minWorld });
	if (!b) return null;
	let tz = minTileZoom;
	for (let z = maxTileZoom; z >= minTileZoom; z--) {
		const k = 2 ** (z - WORLD_Z);
		if (Math.max(b.w, b.h) * k * (1 + 2 * pad) <= maxSide) {
			tz = z;
			break;
		}
	}
	const k = 2 ** (tz - WORLD_Z);
	const side = Math.round(
		Math.min(maxSide, Math.max(minSide, Math.max(b.w, b.h) * k * (1 + 2 * pad))),
	);
	const c = unproject((b.x + b.w / 2) * k, (b.y + b.h / 2) * k, tz);
	// Round the centre like staticMap's cache key does, so the overlay sits exactly where the image puts things.
	const lat = Number(c.lat.toFixed(5)),
		lng = Number(c.lng.toFixed(5));
	const cc = project(lat, lng, tz);
	const rect = { x: (cc.x - side / 2) / k, y: (cc.y - side / 2) / k, w: side / k, h: side / k };
	return { zoom: tz - 1, lat, lng, width: side, height: side, rect };
}

/** A viewBox (world px) showing rect with `pad` (share of each side) in a container of aspect cw:ch. */
export function fitView(
	rect: Rect,
	cw: number,
	ch: number,
	{ pad = 0.12, minW = 0 }: { pad?: number; minW?: number } = {},
): Rect {
	let w = Math.max(rect.w * (1 + 2 * pad), minW),
		h = rect.h * (1 + 2 * pad);
	const want = cw / ch;
	if (w / h < want) w = h * want;
	else h = w / want;
	return { x: rect.x + rect.w / 2 - w / 2, y: rect.y + rect.h / 2 - h / 2, w, h };
}

/** Interpolate two viewBoxes (zoom animation): linear in the centre, geometric in the size, so the zoom feels even. */
export function lerpView(a: Rect, b: Rect, t: number): Rect {
	const e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
	const w = a.w * (b.w / a.w) ** e,
		h = a.h * (b.h / a.h) ** e;
	const cx = a.x + a.w / 2 + (b.x + b.w / 2 - a.x - a.w / 2) * e,
		cy = a.y + a.h / 2 + (b.y + b.h / 2 - a.y - a.h / 2) * e;
	return { x: cx - w / 2, y: cy - h / 2, w, h };
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

export interface Arc {
	/** SVG path. */
	d: string;
	/** Control point. */
	c: Point;
	mid: Point;
	/** Direction of travel at the midpoint, degrees. */
	angle: number;
	/** Direction at the end (for arrowheads), degrees. */
	endAngle: number;
}

/** A gentle arc from a to b (screen or world px): quadratic Bézier bent to the left of travel by `bend` × length. */
export function arc(a: Point, b: Point, bend = 0.2): Arc {
	const dx = b.x - a.x,
		dy = b.y - a.y,
		len = Math.hypot(dx, dy) || 1;
	const c = {
		x: (a.x + b.x) / 2 + (dy / len) * len * bend,
		y: (a.y + b.y) / 2 - (dx / len) * len * bend,
	};
	const mid = { x: 0.25 * a.x + 0.5 * c.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * c.y + 0.25 * b.y };
	const tan = { x: b.x - a.x, y: b.y - a.y };
	const endTan = { x: b.x - c.x, y: b.y - c.y };
	return {
		d: `M${String(r1(a.x))} ${String(r1(a.y))}Q${String(r1(c.x))} ${String(r1(c.y))} ${String(r1(b.x))} ${String(r1(b.y))}`,
		c,
		mid,
		angle: (Math.atan2(tan.y, tan.x) * 180) / Math.PI,
		endAngle: (Math.atan2(endTan.y, endTan.x) * 180) / Math.PI,
	};
}

export interface PinNode {
	p: Point;
	r: number;
}

/**
 * Nudge overlapping pins apart (in place). nodes: [{ p: { x, y }, r }] in screen px. Pins closer than r1 + r2 + gap
 * are pushed apart along the line between them (straight apart for identical points), a few rounds.
 * Pins that don't overlap never move. Returns nodes.
 */
export function relaxPins<N extends PinNode>(
	nodes: N[],
	{ gap = 2, rounds = 10 }: { gap?: number; rounds?: number } = {},
): N[] {
	for (let k = 0; k < rounds; k++) {
		let moved = false;
		for (const [i, ni] of nodes.entries())
			for (const [j, nj] of nodes.entries()) {
				if (j <= i) continue;
				const a = ni.p,
					b = nj.p;
				const min = ni.r + nj.r + gap;
				let dx = b.x - a.x,
					dy = b.y - a.y,
					d = Math.hypot(dx, dy);
				if (d >= min - 0.01) continue;
				if (d < 0.01) {
					const t = (j * 2.399963) % (2 * Math.PI);
					dx = Math.cos(t);
					dy = Math.sin(t);
					d = 1;
				} else {
					dx /= d;
					dy /= d;
				}
				const push = (min - (d < 0.01 ? 0 : d)) / 2 + 0.01;
				ni.p = { x: a.x - dx * push, y: a.y - dy * push };
				nj.p = { x: b.x + dx * push, y: b.y + dy * push };
				moved = true;
			}
		if (!moved) break;
	}
	return nodes;
}
