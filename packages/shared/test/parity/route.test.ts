// Parity: platform/lib/route.js against the port, on the real config, the fixture areas and seeded route events.
import { beforeAll, describe, expect, test } from 'vitest';
import * as route from '../../src/route.ts';
import type { RouteEvent } from '../../src/route.ts';
import { fixtureAreas, readConfig } from '../samples.ts';
import { legacy, seeded } from '../support.ts';
import { pick, range, same } from './harness.ts';
import type { RouteArea } from '../../src/route.ts';

let old: typeof route;
let areas: RouteArea[];
beforeAll(async () => {
	old = await legacy<typeof route>('platform/lib/route.js');
	areas = await fixtureAreas();
});

type Cfg = Parameters<typeof route.currentRoute>[0];

/** A normalised config, as loadTripConfig returns it. */
async function normalised(): Promise<NonNullable<Cfg>['cfg']> {
	const cfg = await readConfig();
	route.normalizeConfigRoutes(cfg);
	return cfg;
}

const BROKEN = (): Record<string, unknown> => ({
	countries: [
		{
			id: 'china',
			route: [
				'shanghai',
				{ area: 'beijing', nights: 5 },
				{ area: 'beijing' },
				{ area: 'xian', nights: 0 },
				{ area: 'Bad Id' },
				{ area: 'harbin', lat: 45.7 },
				null,
				7,
				{ area: 'x', name: '  ', lat: 1, lng: 2 },
				{ area: 'y', extra: 1 },
				{ area: 'z', x_note: 'kept out' },
			],
		},
		{ id: 'thailand' },
		{ id: 'korea', route: 'seoul' },
		null,
		{ route: [{ area: 'a' }] },
		{ id: 'japan', route: range(35).map((i) => ({ area: `s${String(i)}` })) },
		{
			id: 'hong-kong',
			route: [{ area: 'hong-kong', name: 'Hong Kong', lat: 22.28, lng: 114.16, nights: 5 }],
		},
	],
});

describe('route parity', () => {
	test('specs and limits', () => {
		expect([route.MAX_STOPS, route.MAX_NIGHTS]).toStrictEqual([old.MAX_STOPS, old.MAX_NIGHTS]);
		expect(route.ROUTE_STOP_SPEC).toStrictEqual(old.ROUTE_STOP_SPEC);
		expect(route.ROUTE_STOPS_SPEC).toStrictEqual(old.ROUTE_STOPS_SPEC);
	});

	test('normalizeConfigRoutes: warnings and the config it leaves behind', async () => {
		const real = await readConfig();
		const both = (cfg: () => Record<string, unknown>, opts?: { file: string }): void => {
			const a = cfg(),
				b = cfg();
			expect(route.normalizeConfigRoutes(b, opts)).toStrictEqual(
				old.normalizeConfigRoutes(a, opts),
			);
			expect(b).toStrictEqual(a);
		};
		both(() => structuredClone(real));
		both(BROKEN);
		both(BROKEN, { file: 'elsewhere.yaml' });
		both(() => ({}));
		same(old.normalizeConfigRoutes, route.normalizeConfigRoutes)([() => [null], () => [undefined]]);
	});

	test('stopsErrors and clean', () => {
		const lists: unknown[] = [
			[],
			[{ area: 'a' }, { area: 'a' }],
			[{ area: 'x', nights: 0 }],
			[{ area: 'x', color: 'red' }],
			'shanghai',
			null,
			undefined,
			{},
			[{ area: 'x', nights: 2.5 }],
			[{ area: 'Bad' }],
			[{ area: 'ok', name: 'n'.repeat(81) }],
			[{ area: 'ok', lat: 91, lng: 'x' }],
			range(31).map((i) => ({ area: `a${String(i)}` })),
			[null, 3, 'x'],
			[{ area: 'ok', nights: '3' }],
			[{ area: 'ok', x_any: { deep: 1 } }],
		];
		same(old.stopsErrors, route.stopsErrors)(lists.map((l) => () => [l]));
		same(
			old.clean,
			route.clean,
		)(
			[
				{ area: 'a' },
				{ area: 'a', nights: 2, name: ' A ', lat: 1, lng: 2, extra: 1 },
				{ area: 'a', nights: 2.5, name: '', lat: 1 },
			].map((s) => () => [s]),
		);
		same(
			old.nightsBetween,
			route.nightsBetween,
		)([
			() => ['2026-12-06', '2027-01-02'],
			() => ['2027-01-02', '2026-12-06'],
			() => [undefined, '2026-12-06'],
			() => ['2026-12-06T10:00', '2026-12-08'],
		]);
	});

	test('latestRoutes, currentRoute and formatRoute over seeded events', async () => {
		const cfg = await normalised();
		const ids = ['china', 'japan', 'hong-kong', 'korea', 'thailand', 'singapore'];
		const areaIds = [...areas.map((a) => a.id), 'hong-kong', 'nowhere'];
		const runs = range(40).map((seed) => {
			const rng = seeded(seed + 1);
			const events: RouteEvent[] = range(Math.floor(rng() * 12)).map(() => ({
				ts: `2026-11-1${String(Math.floor(rng() * 9))}T10:0${String(Math.floor(rng() * 3))}:00Z`,
				country: pick(rng, ids),
				stops: range(Math.floor(rng() * 5)).map(() => {
					const nights = pick(rng, [undefined, 1, 2, 5]);
					return { area: pick(rng, areaIds), ...(nights === undefined ? {} : { nights }) };
				}),
			}));
			return events;
		});
		same(old.latestRoutes, route.latestRoutes)(runs.map((events) => () => [events]));
		same(
			old.currentRoute,
			route.currentRoute,
		)(runs.flatMap((events) => [() => [{ cfg, areas, events }], () => [{ cfg, events }]]));
		same(
			old.currentRoute,
			route.currentRoute,
		)([
			() => [{}],
			() => [{ cfg: null }],
			() => [
				{
					cfg: {
						countries: [null, { id: '' }, { id: 'mars', from: '2027-01-01', to: '2027-01-03' }],
					},
				},
			],
		]);
		const colors = {
			dim: (s: string) => `<d>${s}</d>`,
			bold: (s: string) => `<b>${s}</b>`,
			yellow: (s: string) => `<y>${s}</y>`,
		};
		same(
			old.formatRoute,
			route.formatRoute,
		)(
			runs.flatMap((events) => {
				const r = route.currentRoute({ cfg, areas, events });
				return [() => [r], () => [r, colors]];
			}),
		);
	});
});
