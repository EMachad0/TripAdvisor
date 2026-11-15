// Ported from game/test/route.test.js (the pure parts: config route normalising, stop validation, the current
// route and its text form). Writing events and the HTTP endpoints stay with the old site's tests.
import { describe, expect, test } from 'vitest';
import {
	currentRoute,
	formatRoute,
	latestRoutes,
	normalizeConfigRoutes,
	stopsErrors,
	type RouteEvent,
} from '../src/route.ts';
import { readConfig } from './samples.ts';

describe('config route', () => {
	test('route is optional, validated, normalised; problems are warnings, never thrown', () => {
		const cfg = {
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
					],
				},
				{ id: 'thailand' },
				{ id: 'korea', route: 'seoul' },
				{
					id: 'hong-kong',
					route: [{ area: 'hong-kong', name: 'Hong Kong', lat: 22.28, lng: 114.16, nights: 5 }],
				},
			] as Record<string, unknown>[],
		};
		const w = normalizeConfigRoutes(cfg);
		expect(cfg.countries.map((c) => c['route'])).toEqual([
			[{ area: 'shanghai' }, { area: 'beijing', nights: 5 }],
			[],
			[],
			[{ area: 'hong-kong', nights: 5, name: 'Hong Kong', lat: 22.28, lng: 114.16 }],
		]);
		expect(w).toHaveLength(5);
		expect(w.some((x) => /route\[2\].*already on this route/.test(x))).toBe(true);
		expect(w.some((x) => /route\[3\].*nights.*minimum 1/.test(x))).toBe(true);
		expect(w.some((x) => /route\[4\].*area/.test(x))).toBe(true);
		expect(w.some((x) => /route\[5\].*lat and lng go together/.test(x))).toBe(true);
		expect(w.some((x) => x.includes('(korea).route: expected a list'))).toBe(true);
	});

	test('the real config is valid and every leg has a route', async () => {
		const cfg = (await readConfig()) as {
			countries: { id: string; route: { area: unknown; lat?: unknown }[] }[];
		};
		expect(normalizeConfigRoutes(cfg)).toEqual([]);
		expect(cfg.countries.map((c) => c.id)).toEqual([
			'china',
			'thailand',
			'singapore',
			'korea',
			'japan',
			'hong-kong',
		]);
		for (const c of cfg.countries) {
			expect(c.route.length).toBeGreaterThanOrEqual(1);
			expect(c.route.every((s) => typeof s.area === 'string')).toBe(true);
		}
		expect(typeof cfg.countries.at(-1)?.route[0]?.lat).toBe('number');
	});
});

describe('route events', () => {
	const at = (m: number): string =>
		new Date(Date.UTC(2026, 10, 12, 10, m)).toISOString().replace('.000', '');
	const events: RouteEvent[] = [
		{ ts: at(1), country: 'china', stops: [{ area: 'shanghai', nights: 4 }] },
		{
			ts: at(2),
			country: 'china',
			stops: [
				{ area: 'shanghai', nights: 6 },
				{ area: 'beijing', nights: 5 },
			],
		},
		{ ts: at(3), country: 'hong-kong', stops: [{ area: 'hong-kong', nights: 5 }] },
	];

	test('stop validation', () => {
		expect(stopsErrors([{ area: 'a' }, { area: 'a' }])).toEqual([
			'stops[1]: a is on the route twice',
		]);
		expect(stopsErrors([{ area: 'x', nights: 0 }]).join()).toMatch(/nights/);
		expect(stopsErrors([{ area: 'x', color: 'red' }]).join()).toMatch(/unknown field/);
		expect(stopsErrors('shanghai').join()).toMatch(/list/);
		expect(stopsErrors([{ area: 'x', nights: 2.5 }]).join()).toMatch(/nights/);
	});

	test('latest line per country wins, the config seeds the rest', () => {
		expect(latestRoutes(events).get('china')?.stops).toHaveLength(2);
		const cfg = {
			countries: [
				{ id: 'china', from: '2026-12-06', to: '2027-01-02', route: [{ area: 'shanghai' }] },
				{ id: 'thailand', from: '2027-01-02', to: '2027-01-10', route: [{ area: 'bangkok' }] },
				{
					id: 'hong-kong',
					from: '2027-02-04',
					to: '2027-02-09',
					route: [{ area: 'hong-kong', name: 'Hong Kong', lat: 22.28, lng: 114.16 }],
				},
			],
		};
		const areas = [
			{ id: 'shanghai', country: 'china', name: 'Shanghai', lat: 31.2, lng: 121.5 },
			{ id: 'beijing', country: 'china', name: 'Beijing', lat: 39.9, lng: 116.4 },
		];
		const r = currentRoute({ cfg, areas, events });
		expect(
			r.map((x) => [x.id, x.source, x.stops.map((s) => `${s.area}:${String(s.nights)}`).join(',')]),
		).toEqual([
			['china', 'game', 'shanghai:6,beijing:5'],
			['thailand', 'config', 'bangkok:null'],
			['hong-kong', 'game', 'hong-kong:5'],
		]);
		expect([r[0]?.nights, r[0]?.planned, r[0]?.status]).toEqual([27, 11, 'under']);
		const hk = r[2]?.stops[0];
		expect([hk?.name, hk?.lat, hk?.lng, hk?.hasPage, hk?.located]).toEqual([
			'Hong Kong',
			22.28,
			114.16,
			false,
			true,
		]);
		expect(r[1]?.stops[0]?.located).toBe(false);
		expect(r[2]?.status).toBe('ok');
		const txt = formatRoute(r);
		expect(txt).toMatch(/1\. China.*Shanghai 6n → Beijing 5n/);
		expect(txt).toMatch(/11 of 27 nights placed/);
		expect(txt).toMatch(/2\. Thailand[\s\S]*from config\/trip\.yaml/);
		expect(txt).toMatch(/3\. Hong Kong.*Hong Kong 5n/);
	});
});
