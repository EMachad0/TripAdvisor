// The Route tab's pure parts on the e2e content (packages/migrate/fixtures/e2e/content): the plan model, the edit
// helpers, the debounced saver, the map view and overlay, and the image frames behind /route-map/<key>.webp.
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { currentRoute } from '@atr/shared/route';
import { layoutRouteModel } from '#lib/content/derive.js';
import type { RouteModelLeg } from '#lib/content/types.js';
import { readContent } from '#lib/server/content.js';
import { RouteEdits, type EditsDeps, type Outcome } from './edits.ts';
import { frameArgs, frameOf } from './frames.ts';
import {
	WHOLE_TRIP,
	added,
	canReset,
	cityCard,
	eyebrow,
	fmtWeek,
	meter,
	moved,
	nightSegments,
	normalizeNights,
	removed,
	routeLegs,
	routeTotals,
	stopWhen,
	stopsPayload,
	withNights,
} from './model.ts';
import { arrowHead, computeOverlay } from './overlay.ts';
import { countryAt, targetView } from './view.ts';

const ROOT = path.resolve(
	import.meta.dirname,
	'../../../../../../packages/migrate/fixtures/e2e/content',
);
const content = readContent({ root: ROOT, includeFixtures: true }).payload;
const verdicts = { area: { harbin: 'must', kyoto: 'maybe', shanghai: 'skip' }, place: {} };

/** The seed route as route.current would answer, with one saved China line. */
function savedRoute() {
	const seed = layoutRouteModel(content, null, verdicts);
	const legs = seed.countries;
	const china = legs.find((c) => c.id === 'china');
	if (!china) throw new Error('no china leg');
	const areas = content.areas.map((a) => ({
		id: a.id,
		country: a.country,
		name: a.name,
		lat: a.lat ?? undefined,
		lng: a.lng ?? undefined,
	}));
	const countries = content.routeBase.countries.map((c) => {
		const leg = content.countries.find((x) => x.id === c.id);
		return { id: c.id, from: leg?.from, to: leg?.to, route: c.route };
	});
	return currentRoute({
		cfg: { countries },
		areas,
		events: [
			{
				ts: '2026-11-10T09:32:00Z',
				country: 'china',
				stops: [{ area: 'beijing', nights: 3 }, { area: 'chengdu' }],
			},
		],
	});
}

const model = layoutRouteModel(content, null, verdicts);
const legs = routeLegs(model.countries);
const leg = (id: string) => {
	const l = legs.find((x) => x.c.id === id);
	if (!l) throw new Error(`no leg ${id}`);
	return l;
};

describe('plan model', () => {
	it('numbers stops across the trip, dates them and lists the cities not placed', () => {
		const china = leg('china');
		expect(china.stops.map((s) => [s.n, s.area, s.start, s.end])).toEqual([
			[1, 'shanghai', '2026-12-06', '2026-12-10'],
			[2, 'huangshan', '2026-12-10', '2026-12-12'],
			[3, 'beijing', '2026-12-12', '2026-12-16'],
			[4, 'harbin', '2026-12-16', '2026-12-20'],
			[5, 'chengdu', '2026-12-20', '2026-12-23'],
			[6, 'chongqing', '2026-12-23', '2026-12-30'],
		]);
		expect(china.stops.find((s) => s.area === 'huangshan')?.located).toBe(false);
		expect(leg('thailand').stops[0]?.n).toBe(7);
		expect(china.others).toEqual([]);
		expect(routeTotals(legs)).toEqual({ placed: 14, unplaced: 0 });
		expect(eyebrow(model.countries)).toBe('6 Dec → 9 Feb · 6 legs');
		expect(eyebrow([])).toBe('The trip');
	});

	it('the nights meter, its bar and the stop dates follow the plan status', () => {
		expect(meter(leg('china'))).toEqual({ status: 'under', planned: 24, nights: 27, left: 3 });
		expect(meter(leg('japan'))).toEqual({ status: 'ok', nights: 16 });
		expect(meter(leg('thailand'))).toEqual({ status: 'empty', nights: 8 });
		const segs = nightSegments(leg('china'));
		expect(segs.map((s) => s.tone)).toEqual([0, 1, 0, 1, 0, 1, 'left']);
		expect(segs.reduce((n, s) => n + s.pct, 0)).toBeCloseTo(100);
		expect(nightSegments(leg('thailand'))).toEqual([
			{ key: 'left', pct: 100, tone: 'left', title: '' },
		]);
		const bkk = leg('thailand').stops[1];
		if (!bkk) throw new Error('no bangkok');
		expect(stopWhen(bkk)).toBe('dates open until the stops above have nights');
		const cm = leg('thailand').stops[0];
		if (!cm) throw new Error('no chiang mai');
		expect(stopWhen(cm)).toBe('from 2 Jan');
	});

	it('the city card says where a city sits, for stops and for cities not placed', () => {
		expect(cityCard(legs, 'china/beijing')).toMatchObject({
			status: 'Stop 3 of 6 in China',
			when: 'Sat 12 Dec → Wed 16 Dec · 4 nights',
			hasPage: true,
		});
		expect(cityCard(legs, 'thailand/bangkok')?.when).toBe(
			'Dates open: set nights for the stops before it',
		);
		const edited = routeLegs(
			model.countries.map((c) => (c.id === 'japan' ? { ...c, stops: c.stops.slice(0, 1) } : c)),
		);
		expect(cityCard(edited, 'japan/kyoto')).toMatchObject({
			status: 'Maybe · not placed',
			when: 'Japan leg: 20 Jan – 5 Feb',
			stop: null,
		});
		expect(cityCard(legs, 'china/nowhere')).toBeNull();
		expect(cityCard(legs, 'atlantis/x')).toBeNull();
	});

	it('Reset shows only for a leg the game changed away from its seed', () => {
		const china = model.countries.find((c) => c.id === 'china');
		if (!china) throw new Error('no china');
		expect(canReset(china)).toBe(false);
		const changed: RouteModelLeg = { ...china, source: 'game', stops: china.stops.slice(1) };
		expect(canReset(changed)).toBe(true);
		expect(canReset({ ...changed, source: 'config' })).toBe(false);
	});
});

describe('edits', () => {
	const china = model.countries.find((c) => c.id === 'china');
	if (!china) throw new Error('no china');
	const stops = china.stops;

	it('nights clamp the old way and an unchanged value is no edit', () => {
		expect(normalizeNights(null)).toBeNull();
		expect(normalizeNights(0)).toBeNull();
		expect(normalizeNights(2.6)).toBe(3);
		expect(normalizeNights(120)).toBe(90);
		expect(withNights(stops, 0, 4)).toBeNull();
		expect(withNights(stops, 0, 5)?.[0]?.nights).toBe(5);
		expect(withNights(stops, 0, 0)?.[0]?.nights).toBeNull();
		expect(withNights(stops, 99, 1)).toBeNull();
	});

	it('move, remove and add return a new list, or null when nothing changes', () => {
		expect(
			moved(stops, 0, 1)
				?.map((s) => s.area)
				.slice(0, 2),
		).toEqual(['huangshan', 'shanghai']);
		expect(moved(stops, 0, -1)).toBeNull();
		expect(removed(stops, 1)?.map((s) => s.area)).not.toContain('huangshan');
		expect(removed(stops, 9)).toBeNull();
		const less = removed(stops, 0) ?? [];
		expect(added(china, less, 'shanghai')?.at(-1)).toMatchObject({
			area: 'shanghai',
			nights: null,
		});
		expect(added(china, stops, 'shanghai')).toBeNull();
		expect(added(china, stops, 'tokyo')).toBeNull();
		expect(stopsPayload(stops.slice(0, 2))).toEqual([
			{ area: 'shanghai', nights: 4 },
			{ area: 'huangshan', nights: 2 },
		]);
		const first = stops[0];
		if (!first) throw new Error('no first stop');
		expect(stopsPayload([{ ...first, nights: null }])).toEqual([{ area: 'shanghai' }]);
	});
});

describe('RouteEdits (debounced saves)', () => {
	function harness(saveOutcome: Outcome = { ok: true }) {
		vi.useFakeTimers();
		const saves: { country: string; stops: unknown }[] = [];
		const toasts: string[] = [];
		const deps: EditsDeps = {
			save: (country, s) => {
				saves.push({ country, stops: s });
				return Promise.resolve(saveOutcome);
			},
			reset: () => Promise.resolve({ ok: true }),
			notify: () => undefined,
			toast: (m) => {
				toasts.push(m);
			},
			frozenMessage: 'Writes paused',
		};
		return { edits: new RouteEdits(deps), saves, toasts };
	}
	const china = model.countries.find((c) => c.id === 'china');
	if (!china) throw new Error('no china');

	it('lays edits over the live route at once and saves the whole list 600 ms after the last one', async () => {
		const { edits, saves } = harness();
		edits.edit(china, china.stops.slice(1));
		edits.edit(china, china.stops.slice(2));
		const shown = edits.apply(model.countries).find((c) => c.id === 'china');
		expect(shown?.stops).toHaveLength(4);
		expect(shown?.source).toBe('game');
		await vi.advanceTimersByTimeAsync(599);
		expect(saves).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(1);
		expect(saves).toHaveLength(1);
		expect(saves[0]?.country).toBe('china');
		expect(edits.pending).toBe(false);
		vi.useRealTimers();
	});

	it('flush saves at once; a refused save toasts and drops the local edit, a frozen one keeps it', async () => {
		const bad = harness({ ok: false, reason: 'invalid', message: 'nope' });
		bad.edits.edit(china, []);
		bad.edits.flush();
		await vi.runAllTimersAsync();
		expect(bad.saves).toHaveLength(1);
		expect(bad.toasts).toEqual(['Couldn’t save the China route: nope']);
		expect(bad.edits.has('china')).toBe(false);
		const frozen = harness({ ok: false, reason: 'frozen', message: '' });
		frozen.edits.edit(china, []);
		await vi.runAllTimersAsync();
		expect(frozen.toasts).toEqual(['Writes paused']);
		expect(frozen.edits.has('china')).toBe(true);
		vi.useRealTimers();
	});

	it('reset drops a waiting edit and toasts the old message', async () => {
		const h = harness();
		h.edits.edit(china, []);
		await h.edits.reset(china);
		await vi.runAllTimersAsync();
		expect(h.saves).toHaveLength(0);
		expect(h.toasts).toEqual(['China: back to the plan']);
		vi.useRealTimers();
	});
});

describe('map view and overlay', () => {
	const W = 390;
	const H = 437;
	const textW = (s: string): number => s.length * 7;

	it('fits the whole trip and each country, and a tap finds the nearest country', () => {
		const all = targetView(legs, WHOLE_TRIP, false, W, H);
		const jp = targetView(legs, 'japan', false, W, H);
		expect(all).not.toBeNull();
		expect(jp).not.toBeNull();
		if (!all || !jp) return;
		expect(jp.w).toBeLessThan(all.w);
		expect(all.w / all.h).toBeCloseTo(W / H);
		expect(targetView(legs, WHOLE_TRIP, false, 0, 0)).toBeNull();
		const o = computeOverlay({
			legs,
			longHaul: model.longHaul,
			view: WHOLE_TRIP,
			skipped: false,
			sel: null,
			W,
			H,
			vb: all,
			labels: true,
			textW,
			sans: 'sans',
		});
		const tokyo = o.pins.find((p) => p.key === 'japan/tokyo');
		expect(tokyo).toBeDefined();
		if (!tokyo) return;
		expect(countryAt(legs, all, W, tokyo.x + 3, tokyo.y, WHOLE_TRIP)).toBe('japan');
		expect(countryAt(legs, all, W, tokyo.x, tokyo.y, 'japan')).toBeNull();
		expect(countryAt(legs, all, W, -500, -500, WHOLE_TRIP)).toBeNull();
	});

	it('draws stops numbered in order, hops between countries, overland lines and the long-haul stubs', () => {
		const vb = targetView(legs, WHOLE_TRIP, false, W, H);
		if (!vb) throw new Error('no view');
		const o = computeOverlay({
			legs,
			longHaul: model.longHaul,
			view: WHOLE_TRIP,
			skipped: false,
			sel: 'china/beijing',
			W,
			H,
			vb,
			labels: true,
			textW,
			sans: 'sans',
		});
		const stops = o.pins.filter((p) => p.kind === 'stop');
		// Huangshan has no coordinates: 14 stops, 13 on the map
		expect(stops).toHaveLength(13);
		expect(stops.find((p) => p.key === 'china/beijing')).toMatchObject({ n: 3, sel: true });
		expect(o.lines.filter((l) => l.kind === 'hop')).toHaveLength(5);
		expect(o.lines.filter((l) => l.kind === 'land').map((l) => l.id)).toEqual([
			'land-china',
			'land-thailand',
			'land-japan',
		]);
		expect(o.lines.filter((l) => l.kind === 'long').map((l) => l.id)).toEqual(['in', 'out']);
		expect(o.fixed.map((f) => f.lines[0])).toEqual(['✈︎ From São Paulo', '✈︎ Home to São Paulo']);
		expect(o.aria).toMatch(/^Map of the route: China \(Shanghai, Huangshan \(flexible\), Beijing/);
		// phone width: no leg badges on the whole-trip map
		expect(o.labels.some((l) => l.kind === 'leg')).toBe(false);
		// labels are skipped while the zoom animates
		const moving = computeOverlay({
			legs,
			longHaul: model.longHaul,
			view: WHOLE_TRIP,
			skipped: false,
			sel: null,
			W,
			H,
			vb,
			labels: false,
			textW,
			sans: 'sans',
		});
		expect(moving.labels).toEqual([]);
		expect(arrowHead({ x: 0, y: 0 }, 0)).toBe('M-6.1 3.4L0 0L-6.1 -3.4');
	});

	it('shows unplaced Must and Maybe cities, and skipped ones only on request', () => {
		const edited = routeLegs(
			model.countries.map((c) =>
				c.id === 'china'
					? { ...c, stops: c.stops.filter((s) => !['harbin', 'shanghai'].includes(s.area)) }
					: c,
			),
		);
		const vb = targetView(edited, 'china', false, W, H);
		if (!vb) throw new Error('no view');
		const run = (skipped: boolean) =>
			computeOverlay({
				legs: edited,
				longHaul: model.longHaul,
				view: 'china',
				skipped,
				sel: null,
				W,
				H,
				vb,
				labels: true,
				textW,
				sans: 'sans',
			});
		expect(run(false).pins.find((p) => p.key === 'china/harbin')).toMatchObject({
			kind: 'must',
			label: 'Harbin: Must, not placed yet',
		});
		expect(run(false).pins.some((p) => p.key === 'china/shanghai')).toBe(false);
		expect(run(true).pins.find((p) => p.key === 'china/shanghai')?.kind).toBe('skip');
		expect(routeTotals(edited).unplaced).toBe(1);
	});
});

describe('route-map frames', () => {
	it('has an overview and one frame per leg, with the old URL shape', () => {
		const frames = frameArgs(content);
		expect(Object.keys(frames)).toEqual([
			'overview',
			'china',
			'thailand',
			'singapore',
			'korea',
			'japan',
			'hong-kong',
		]);
		const o = frames['overview'];
		expect(o?.url).toMatch(/^\/route-map\/overview\.webp\?v=\d+_[\d.-]+_[\d.-]+_\d+$/);
		expect(o?.args.width).toBe(o?.args.height);
	});

	it('a saved route has the same frames as the seeds, so the endpoint needs no Convex call', () => {
		const live = layoutRouteModel(content, savedRoute(), verdicts);
		expect(live.countries.find((c) => c.id === 'china')?.stops.map((s) => s.area)).toEqual([
			'beijing',
			'chengdu',
		]);
		expect(live.frames).toEqual(model.frames);
	});

	it('unknown and malformed keys have no frame', () => {
		expect(frameOf(content, 'japan')?.key).toBe('japan');
		expect(frameOf(content, 'atlantis')).toBeNull();
		expect(frameOf(content, '../etc')).toBeNull();
		expect(frameOf(content, 'constructor')).toBeNull();
	});
});

describe('dates', () => {
	it('a weekday date has no comma, even where the ICU data adds one (Linux WebKit)', () => {
		expect(fmtWeek('2026-12-06')).toBe('Sun 6 Dec');
		const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockReturnValue([
			{ type: 'weekday', value: 'Sun' },
			{ type: 'literal', value: ', ' },
			{ type: 'day', value: '6' },
			{ type: 'literal', value: ' ' },
			{ type: 'month', value: 'Dec' },
		]);
		try {
			expect(fmtWeek('2026-12-06')).toBe('Sun 6 Dec');
		} finally {
			spy.mockRestore();
		}
	});
});
