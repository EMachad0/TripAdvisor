// Ported from game/test/route.test.js (map maths, label layout, leg dates).
import { beforeAll, describe, expect, test } from 'vitest';
import {
	arc,
	boundsOf,
	fitView,
	imageFrame,
	layoutLabels,
	legPlan,
	lerpView,
	nightsBetween,
	overlaps,
	project,
	addDays,
	relaxPins,
	TILE,
	WORLD_Z,
	type LabelItem,
	type Point,
	type Rect,
} from '../src/routemap.ts';
import { legacy } from './support.ts';

const close = (a: number | undefined, b: number | undefined, eps = 1e-6): boolean =>
	a !== undefined && b !== undefined && Math.abs(a - b) <= eps;

/** platform/lib/staticmap.js `project`: the tile maths the stitched base images use. */
let platformProject: (lat: number, lng: number, z: number) => Point;
beforeAll(async () => {
	({ project: platformProject } = await legacy<{ project: typeof platformProject }>(
		'platform/lib/staticmap.js',
	));
});

describe('routemap', () => {
	test('project/unproject round-trip and match the platform tile maths', async () => {
		const { unproject } = await import('../src/routemap.ts');
		for (const [lat, lng] of [
			[31.2325, 121.4692],
			[13.7525, 100.4942],
			[35.0116, 135.7681],
			[22.2819, 114.1582],
			[-23.55, -46.63],
		] as const) {
			const p = project(lat, lng);
			const back = unproject(p.x, p.y);
			expect(close(back.lat, lat, 1e-9) && close(back.lng, lng, 1e-9)).toBe(true);
			const q = platformProject(lat, lng, WORLD_Z);
			expect(close(p.x, q.x) && close(p.y, q.y)).toBe(true);
		}
		const a = project(30, 120, 5),
			b = project(30, 120, 6);
		expect(close(b.x, a.x * 2) && close(b.y, a.y * 2)).toBe(true);
		expect(project(40, 120).y).toBeLessThan(project(30, 120).y);
		expect(project(30, 130).x).toBeGreaterThan(project(30, 120).x);
		expect(project(0, -180, 0).x).toBe(0);
		expect(project(0, 180, 0).x).toBe(TILE);
	});

	test('imageFrame places the stitched image exactly where the overlay expects it', () => {
		const pts = [
			{ lat: 31.2325, lng: 121.4692 },
			{ lat: 39.9067, lng: 116.3975 },
			{ lat: 29.117, lng: 110.479 },
			{ lat: 45.767, lng: 126.6107 },
		];
		const f = imageFrame(pts);
		if (!f) throw new Error('no frame');
		expect(f.width).toBeLessThanOrEqual(2048);
		expect(f.width).toBe(f.height);
		const tz = f.zoom + 1,
			k = 2 ** (tz - WORLD_Z);
		const c = platformProject(f.lat, f.lng, tz);
		for (const p of pts) {
			const inImg = platformProject(p.lat, p.lng, tz);
			const px = inImg.x - (c.x - f.width / 2),
				py = inImg.y - (c.y - f.height / 2);
			const w = project(p.lat, p.lng);
			expect(close(px, (w.x - f.rect.x) * k) && close(py, (w.y - f.rect.y) * k)).toBe(true);
			expect(px > 0 && px < f.width && py > 0 && py < f.height).toBe(true);
		}
		const b = boundsOf(pts);
		expect(Math.max(b?.w ?? 0, b?.h ?? 0) * 2 ** (tz + 1 - WORLD_Z) * 1.32).toBeGreaterThan(2048);
		const one = imageFrame([{ lat: 22.2819, lng: 114.1582 }]);
		expect(one !== null && one.zoom + 1 <= 11 && one.width >= 900).toBe(true);
		expect(imageFrame([])).toBeNull();
	});

	test('fitView keeps the container aspect and contains the rect; lerpView hits both ends', () => {
		const r = { x: 1000, y: 2000, w: 400, h: 100 };
		for (const [cw, ch] of [
			[358, 440],
			[720, 600],
			[1000, 300],
		] as const) {
			const v = fitView(r, cw, ch, { pad: 0.1 });
			expect(close(v.w / v.h, cw / ch, 1e-9)).toBe(true);
			expect(v.x <= r.x && v.y <= r.y && v.x + v.w >= r.x + r.w && v.y + v.h >= r.y + r.h).toBe(
				true,
			);
			expect(close(v.x + v.w / 2, r.x + r.w / 2) && close(v.y + v.h / 2, r.y + r.h / 2)).toBe(true);
		}
		const a = { x: 0, y: 0, w: 100, h: 80 },
			b = { x: 500, y: 300, w: 10, h: 8 };
		expect(lerpView(a, b, 0)).toEqual(a);
		const end = lerpView(a, b, 1);
		for (const k of ['x', 'y', 'w', 'h'] as const) expect(close(end[k], b[k], 1e-9)).toBe(true);
	});

	test('arcs bend to one side and pass through the midpoint they report', () => {
		const a = arc({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.2);
		expect(a.d).toBe('M0 0Q50 -20 100 0');
		expect(a.mid).toEqual({ x: 50, y: -10 });
		expect(a.angle).toBe(0);
	});

	test('relaxPins separates overlapping pins (identical points too) and leaves the rest alone', () => {
		const nodes = [
			{ p: { x: 100, y: 100 }, r: 10 },
			{ p: { x: 104, y: 103 }, r: 10 },
			{ p: { x: 300, y: 300 }, r: 10 },
			{ p: { x: 50, y: 50 }, r: 5 },
			{ p: { x: 50, y: 50 }, r: 5 },
		];
		relaxPins(nodes, { gap: 3 });
		const at = (i: number): Point => nodes[i]?.p ?? { x: NaN, y: NaN };
		const d = (i: number, j: number): number => Math.hypot(at(i).x - at(j).x, at(i).y - at(j).y);
		expect(d(0, 1)).toBeGreaterThanOrEqual(23 - 0.05);
		expect(d(3, 4)).toBeGreaterThanOrEqual(13 - 0.05);
		expect(at(2)).toEqual({ x: 300, y: 300 });
		expect(close((at(0).x + at(1).x) / 2, 102)).toBe(true);
	});

	test('layoutLabels never overlaps placed labels, avoids pins, hides what does not fit, forces must labels', () => {
		const bounds = { x: 0, y: 0, w: 300, h: 200 };
		const items: LabelItem[] = [
			{ id: 'shanghai', x: 150, y: 100, w: 70, h: 20, r: 12, priority: 1, must: true },
			{ id: 'huangshan', x: 140, y: 104, w: 120, h: 20, r: 9, priority: 3 },
			{ id: 'hangzhou', x: 146, y: 112, w: 80, h: 20, r: 9, priority: 5 },
			{ id: 'far', x: 30, y: 30, w: 40, h: 16, r: 6, priority: 5 },
		];
		const obstacles = items.flatMap((it) =>
			it.fixed ? [] : [{ id: it.id, x: it.x - 8, y: it.y - 8, w: 16, h: 16 }],
		);
		const out = layoutLabels(items, { obstacles, bounds });
		const shown = [...out.entries()].flatMap(([id, v]) =>
			v.box && !v.hidden ? [{ id, v, box: v.box }] : [],
		);
		for (const [i, s] of shown.entries())
			for (const t of shown.slice(i + 1)) expect(overlaps(s.box, t.box)).toBe(false);
		for (const { id, v, box } of shown) {
			expect(box.x >= 0 && box.y >= 0 && box.x + box.w <= 300 && box.y + box.h <= 200).toBe(true);
			for (const o of obstacles)
				if (o.id !== id && v.overlap !== true) expect(overlaps(box, o)).toBe(false);
		}
		expect(out.get('shanghai')?.hidden).toBe(false);
		expect(out.get('far')?.hidden).toBe(false);
		const tiny = { x: 0, y: 0, w: 60, h: 30 };
		const crowded = layoutLabels(
			[
				{ id: 'a', x: 30, y: 15, w: 50, h: 20, r: 4, priority: 1, must: true },
				{ id: 'b', x: 31, y: 15, w: 50, h: 20, r: 4, priority: 2 },
			],
			{ bounds: tiny, margin: 0 },
		);
		expect(crowded.get('b')?.hidden).toBe(true);
		expect(crowded.get('a')?.hidden).toBe(false);
		const lh: Rect = { x: 0, y: 0, w: 300, h: 100 };
		const fixed = layoutLabels(
			[
				{ id: 'lh', fixed: lh },
				{ id: 'c', x: 150, y: 120, w: 40, h: 16, r: 5 },
			],
			{ bounds },
		);
		expect(fixed.get('lh')?.box).toEqual(lh);
		const cBox = fixed.get('c')?.box;
		expect(cBox && !overlaps(cBox, lh)).toBe(true);
	});

	test('legPlan dates, nights used vs available and over/under', () => {
		expect(nightsBetween('2026-12-06', '2027-01-02')).toBe(27);
		expect(addDays('2026-12-30', 4)).toBe('2027-01-03');
		const from = '2026-12-06';
		const empty = legPlan({ from, nights: 27, stops: [{ area: 'shanghai' }] });
		expect([empty.status, empty.planned, empty.left]).toEqual(['empty', 0, 27]);
		expect([empty.stops[0]?.start, empty.stops[0]?.end]).toEqual([from, null]);
		const under = legPlan({
			from,
			nights: 27,
			stops: [
				{ area: 'shanghai', nights: 6 },
				{ area: 'beijing', nights: 5 },
				{ area: 'xian' },
				{ area: 'chongqing', nights: 4 },
			],
		});
		expect(under.status).toBe('under');
		expect(under.planned).toBe(15);
		expect(under.stops.map((s) => [s.start, s.end])).toEqual([
			['2026-12-06', '2026-12-12'],
			['2026-12-12', '2026-12-17'],
			['2026-12-17', null],
			[null, null],
		]);
		expect(legPlan({ from, nights: 8, stops: [{ area: 'bangkok', nights: 8 }] }).status).toBe('ok');
		const over = legPlan({
			from: '2027-02-04',
			nights: 5,
			stops: [{ area: 'hong-kong', nights: 7 }],
		});
		expect([over.status, over.left]).toEqual(['over', -2]);
	});
});
