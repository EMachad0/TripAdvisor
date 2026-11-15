// Greedy label placement for the route map (screen px).
import type { Rect } from './geo.ts';

export type Dir = 'E' | 'W' | 'NE' | 'SE' | 'N' | 'S' | 'NW' | 'SW';
const DIRS: readonly Dir[] = ['E', 'W', 'NE', 'SE', 'N', 'S', 'NW', 'SW'];

/** A label to place next to its pin. */
export interface PinLabel {
	readonly id: string;
	/** The pin. */
	readonly x: number;
	readonly y: number;
	/** Label size. */
	readonly w: number;
	readonly h: number;
	/** Distance from the pin centre to the label. */
	readonly r: number;
	/** Lower = placed first (9 when missing). */
	readonly priority?: number | undefined;
	/** Always shown, even where it overlaps. */
	readonly must?: boolean | undefined;
	readonly prefer?: Dir | undefined;
	readonly fixed?: undefined;
}

/** A label kept exactly where it is (others avoid it). */
export interface FixedLabel {
	readonly id: string;
	readonly fixed: Rect;
	readonly priority?: number | undefined;
}

export type LabelItem = PinLabel | FixedLabel;

export interface Obstacle extends Rect {
	readonly id?: string;
}

export interface LabelPlacement {
	box: Rect | null;
	dir: Dir | 'fixed' | null;
	leader: boolean;
	hidden: boolean;
	overlap?: true;
}

function boxAt(it: PinLabel, dir: Dir, d: number): Rect {
	const { x, y, w, h } = it;
	switch (dir) {
		case 'E':
			return { x: x + d, y: y - h / 2, w, h };
		case 'W':
			return { x: x - d - w, y: y - h / 2, w, h };
		case 'N':
			return { x: x - w / 2, y: y - d - h, w, h };
		case 'S':
			return { x: x - w / 2, y: y + d, w, h };
		case 'NE':
			return { x: x + d * 0.7, y: y - d * 0.7 - h, w, h };
		case 'SE':
			return { x: x + d * 0.7, y: y + d * 0.7, w, h };
		case 'NW':
			return { x: x - d * 0.7 - w, y: y - d * 0.7 - h, w, h };
		case 'SW':
			return { x: x - d * 0.7 - w, y: y + d * 0.7, w, h };
	}
}

export const overlaps = (a: Rect, b: Rect, gap = 0): boolean =>
	a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

const inside = (b: Rect, bounds: Rect | null, m: number): boolean =>
	!bounds ||
	(b.x >= bounds.x + m &&
		b.y >= bounds.y + m &&
		b.x + b.w <= bounds.x + bounds.w - m &&
		b.y + b.h <= bounds.y + bounds.h - m);

const area = (a: Rect, b: Rect): number =>
	Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
	Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

export interface LayoutOptions {
	/** Boxes labels must avoid (pins, legend); an obstacle with the label's own id is ignored. */
	readonly obstacles?: readonly Obstacle[];
	/** The visible map. */
	readonly bounds?: Rect | null;
	readonly margin?: number;
	readonly gap?: number;
}

/**
 * Each label tries 8 directions next to its pin, then 8 farther out with a leader line. A `must` label that fits
 * nowhere is put where it overlaps least; any other label that fits nowhere is hidden.
 * Returns Map id → placement.
 */
export function layoutLabels(
	items: readonly LabelItem[],
	{ obstacles = [], bounds = null, margin = 4, gap = 2 }: LayoutOptions = {},
): Map<string, LabelPlacement> {
	const placed: Rect[] = [];
	const out = new Map<string, LabelPlacement>();
	const sorted = items
		.map((it, i) => ({ it, i }))
		.sort((a, b) => (a.it.priority ?? 9) - (b.it.priority ?? 9) || a.i - b.i)
		.map((x) => x.it);
	const free = (b: Rect, self: string): boolean =>
		inside(b, bounds, margin) &&
		!placed.some((p) => overlaps(b, p, gap)) &&
		!obstacles.some((o) => o.id !== self && overlaps(b, o, 0));
	for (const it of sorted) {
		if (it.fixed) {
			placed.push(it.fixed);
			out.set(it.id, { box: it.fixed, dir: 'fixed', leader: false, hidden: false });
			continue;
		}
		const { r } = it;
		const dirs = it.prefer ? [it.prefer, ...DIRS.filter((d) => d !== it.prefer)] : DIRS;
		let hit: LabelPlacement | null = null;
		for (const [dist, leader] of [
			[r, false],
			[r + 16, true],
			[r + 34, true],
		] as const) {
			for (const d of dirs) {
				const b = boxAt(it, d, dist);
				if (free(b, it.id)) {
					hit = { box: b, dir: d, leader, hidden: false };
					break;
				}
			}
			if (hit) break;
		}
		if (!hit && it.must === true) {
			// least-bad spot near the pin: inside the bounds if possible, smallest overlap with what is already placed
			let bestCost = Infinity;
			for (const d of dirs) {
				const b = boxAt(it, d, r);
				const cost =
					placed.reduce((n, p) => n + area(b, p), 0) +
					obstacles.filter((o) => o.id !== it.id).reduce((n, o) => n + area(b, o) * 0.5, 0) +
					(inside(b, bounds, margin) ? 0 : 1e6);
				if (cost < bestCost) {
					bestCost = cost;
					hit = { box: b, dir: d, leader: false, hidden: false, overlap: true };
				}
			}
		}
		if (hit?.box) {
			placed.push(hit.box);
			out.set(it.id, hit);
		} else out.set(it.id, { box: null, dir: null, leader: false, hidden: true });
	}
	return out;
}
