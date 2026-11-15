// Parity: game/lib/routemap.js against the port, on the fixture areas, the config route stops and seeded
// random geometry.
import { beforeAll, describe, test } from 'vitest';
import * as routemap from '../../src/routemap.ts';
import type { LabelItem, Obstacle, PinNode, Rect } from '../../src/routemap.ts';
import { fixtureAreas, readConfig } from '../samples.ts';
import { legacy, seeded } from '../support.ts';
import { grid, pick, range, same } from './harness.ts';

let old: typeof routemap;
let points: { lat: number; lng: number }[];
let routes: { from: string; to: string; stops: { area: string; nights?: unknown }[] }[];
beforeAll(async () => {
	old = await legacy<typeof routemap>('game/lib/routemap.js');
	const areas = await fixtureAreas();
	const cfg = await readConfig();
	const legs = (cfg['countries'] ?? []) as {
		from: string;
		to: string;
		route?: ({ area: string; lat?: number; lng?: number } | string)[];
	}[];
	const stops = legs.flatMap((c) =>
		(c.route ?? []).flatMap((s) => (typeof s === 'string' ? [] : [s])),
	);
	points = [...areas, ...stops].flatMap((p) =>
		typeof p.lat === 'number' && typeof p.lng === 'number' ? [{ lat: p.lat, lng: p.lng }] : [],
	);
	routes = legs.map((c) => ({
		from: c.from.slice(0, 10),
		to: c.to.slice(0, 10),
		stops: (c.route ?? []).map((s) => (typeof s === 'string' ? { area: s } : s)),
	}));
});

const rect = (rng: () => number): Rect => ({
	x: rng() * 4000,
	y: rng() * 4000,
	w: 1 + rng() * 900,
	h: 1 + rng() * 900,
});

describe('routemap parity', () => {
	test('projection', () => {
		const zooms = [0, 3, 8, 12, 14];
		same(
			old.project,
			routemap.project,
		)(grid(points, zooms).map(([p, z]) => () => [p.lat, p.lng, z]));
		same(old.project, routemap.project)([() => [89.9, 180], () => [-89.9, -180], () => [0, 0]]);
		const px = points.map((p) => routemap.project(p.lat, p.lng));
		same(old.unproject, routemap.unproject)(grid(px, zooms).map(([p, z]) => () => [p.x, p.y, z]));
		same(old.unproject, routemap.unproject)(px.map((p) => () => [p.x, p.y]));
	});

	test('bounds and image frames for sets of points', () => {
		const rng = seeded(11);
		const sets = [
			points,
			points.slice(0, 1),
			[],
			[{ lat: 'x' }, null, ...points.slice(0, 3)],
			...range(30).map(() => points.filter(() => rng() < 0.3)),
		];
		same(
			old.boundsOf,
			routemap.boundsOf,
		)(sets.flatMap((s) => [() => [s], () => [s, { min: 500 }], () => [s, { z: 9, min: 10 }]]));
		same(
			old.imageFrame,
			routemap.imageFrame,
		)(
			sets.flatMap((s) => [
				() => [s],
				() => [s, { pad: 0.05, maxSide: 1024, minSide: 400 }],
				() => [s, { maxTileZoom: 6, minTileZoom: 4, minSpanDeg: 2 }],
			]),
		);
	});

	test('views, arcs and pins', () => {
		const rng = seeded(5);
		same(
			old.fitView,
			routemap.fitView,
		)(
			range(80).map((i) => {
				const r = rect(seeded(i + 100));
				return () => [
					r,
					200 + i * 10,
					300 + (i % 7) * 50,
					{ pad: (i % 5) / 20, minW: i % 3 ? 0 : 2000 },
				];
			}),
		);
		same(
			old.lerpView,
			routemap.lerpView,
		)(
			range(80).map((i) => {
				const a = rect(seeded(i)),
					b = rect(seeded(i + 999));
				return () => [a, b, i / 79];
			}),
		);
		same(
			old.arc,
			routemap.arc,
		)(
			range(60).map((i) => {
				const r = seeded(i + 7);
				const a = { x: r() * 1000, y: r() * 1000 },
					b = i % 10 ? { x: r() * 1000, y: r() * 1000 } : a;
				return () => [a, b, (i % 4) / 10];
			}),
		);
		const pinSets = range(40).map(() => {
			const n = 2 + Math.floor(rng() * 14);
			return range(n).map((j) => ({
				p: { x: Math.round(rng() * 120), y: j % 5 ? Math.round(rng() * 120) : 60 },
				r: 3 + Math.floor(rng() * 8),
			}));
		});
		same(
			old.relaxPins,
			routemap.relaxPins,
		)(
			pinSets.flatMap((s) => [
				() => [structuredClone(s)] as [PinNode[]],
				() =>
					[structuredClone(s), { gap: 5, rounds: 3 }] as [
						PinNode[],
						{ gap: number; rounds: number },
					],
			]),
		);
	});

	test('label layout', () => {
		const dirs = [undefined, 'E', 'W', 'N', 'S', 'NE', 'SE', 'NW', 'SW'] as const;
		const cases = range(80).map((i) => {
			const rng = seeded(i + 31);
			const n = 1 + Math.floor(rng() * 12);
			const items: LabelItem[] = range(n).map((j): LabelItem => {
				const id = `c${String(j)}`;
				if (j === 0 && i % 4 === 0) return { id, fixed: { x: 0, y: 0, w: 120, h: 30 } };
				return {
					id,
					x: rng() * 300,
					y: rng() * 200,
					w: 20 + rng() * 90,
					h: 14 + rng() * 6,
					r: 4 + rng() * 10,
					priority: Math.floor(rng() * 6),
					must: rng() < 0.3,
					prefer: pick(rng, dirs),
				};
			});
			const obstacles: Obstacle[] = items.flatMap((it) =>
				it.fixed ? [] : [{ id: it.id, x: it.x - 6, y: it.y - 6, w: 12, h: 12 }],
			);
			const bounds = i % 5 ? { x: 0, y: 0, w: 300, h: 200 } : null;
			return () =>
				[items, { obstacles, bounds, margin: i % 3, gap: (i % 4) / 2 }] as Parameters<
					typeof routemap.layoutLabels
				>;
		});
		same(old.layoutLabels, routemap.layoutLabels)(cases);
		same(
			old.layoutLabels,
			routemap.layoutLabels,
		)([() => [[]], () => [[{ id: 'a', x: 1, y: 1, w: 0, h: 0, r: 0 }]]]);
		same(
			old.overlaps,
			routemap.overlaps,
		)(range(50).map((i) => () => [rect(seeded(i)), rect(seeded(i + 50)), i % 3]));
	});

	test('leg plans and nights', () => {
		const rng = seeded(3);
		const nightsOf = [undefined, 0, 1, 2, 4, 2.5, -1, '3', null];
		same(
			old.legPlan,
			routemap.legPlan,
		)(
			routes.flatMap((r) => {
				const available = routemap.nightsBetween(r.from, r.to);
				const shuffled = r.stops.map((s) => ({ ...s, nights: pick(rng, nightsOf) }));
				return [
					() => [{ from: r.from, nights: available, stops: r.stops }],
					() => [{ from: r.from, nights: available, stops: shuffled }],
					() => [{ from: r.from, nights: available }],
				];
			}),
		);
		same(
			old.nightsBetween,
			routemap.nightsBetween,
		)(routes.flatMap((r) => [() => [r.from, r.to], () => [r.to, r.from]]));
		same(
			old.nightsBetween,
			routemap.nightsBetween,
		)([() => ['x', '2027-01-01'], () => [undefined, undefined]]);
		same(old.addDays, routemap.addDays)(routes.map((r, i) => () => [r.from, i * 3 - 4]));
	});
});
