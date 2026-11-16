import { beforeEach, describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { codeOf, countRows, messageOf, world, type World } from './test.helpers';
import { newTest } from './test.setup';

let w: World;
beforeEach(async () => {
	w = await world(newTest());
});

describe('route.current', () => {
	test('starts from the config seeds, in trip order, with names and coordinates', async () => {
		const { countries, summary } = await w.guest.query(api.route.current, {});
		expect(countries.map((c) => [c.id, c.n, c.name, c.flag, c.nights, c.source])).toEqual([
			['china', 1, 'China', '🇨🇳', 27, 'config'],
			['korea', 2, 'South Korea', '🇰🇷', 10, 'none'],
		]);
		expect(countries[0]?.stops).toEqual([
			{
				area: 'shanghai',
				name: 'Shanghai',
				lat: 31.23,
				lng: 121.47,
				nights: 4,
				hasPage: true,
				located: true,
			},
			{
				area: 'suzhou',
				name: 'Suzhou',
				lat: 31.3,
				lng: 120.6,
				nights: 2,
				hasPage: false,
				located: true,
			},
		]);
		expect(countries[0]).toMatchObject({ planned: 6, unset: 0, status: 'under', ts: null });
		expect(summary).toEqual({ stops: 2, unplaced: 0, legs: 2, edited: false });
	});

	test('the summary counts must cities not on the route', async () => {
		await w.owner.mutation(api.feedback.swipe, {
			round: 'area',
			id: 'beijing',
			verdict: 'must',
			clientOpId: w.op(),
		});
		await w.owner.mutation(api.feedback.swipe, {
			round: 'area',
			id: 'shanghai',
			verdict: 'must',
			clientOpId: w.op(),
		});
		expect((await w.owner.query(api.route.current, {})).summary).toEqual({
			stops: 2,
			unplaced: 1,
			legs: 2,
			edited: false,
		});
	});

	test('refuses with NoContent before the content index exists', async () => {
		await w.t.run(async (ctx) => {
			const index = await ctx.db.query('contentIndex').first();
			if (index !== null) await ctx.db.delete('contentIndex', index._id);
		});
		expect(await codeOf(w.owner.query(api.route.current, {}))).toBe('NoContent');
	});
});

describe('route.save', () => {
	test('appends the whole list; a config-only stop keeps the seed name and coordinates', async () => {
		const res = await w.owner.mutation(api.route.save, {
			country: 'china',
			stops: [
				{ area: 'beijing', nights: 5 },
				{ area: 'suzhou' },
				{ area: 'shanghai', nights: 4, name: 'ignored' },
			],
			clientOpId: w.op(),
		});
		expect(res).toMatchObject({ ok: true, unchanged: false });
		if (!('event' in res)) throw new Error('expected an event');
		expect(res.event.stops).toEqual([
			{ area: 'beijing', nights: 5 },
			{ area: 'suzhou', name: 'Suzhou', lat: 31.3, lng: 120.6 },
			{ area: 'shanghai', nights: 4 },
		]);
		expect(res.country).toMatchObject({
			id: 'china',
			source: 'game',
			planned: 9,
			unset: 1,
			status: 'under',
		});
		const { summary } = await w.owner.query(api.route.current, {});
		expect(summary).toEqual({ stops: 3, unplaced: 0, legs: 2, edited: true });
	});

	test('a save equal to the current areas and nights writes nothing', async () => {
		const res = await w.owner.mutation(api.route.save, {
			country: 'china',
			stops: [
				{ area: 'shanghai', nights: 4 },
				{ area: 'suzhou', nights: 2 },
			],
			clientOpId: w.op(),
		});
		expect(res).toMatchObject({ ok: true, unchanged: true, country: { source: 'config' } });
		expect('event' in res).toBe(false);
		expect(await countRows(w.t, 'routes')).toBe(0);
	});

	test.each([
		[[{ area: 'beijing', nights: 0 }], 'stops[0].nights: 0 is below the minimum 1'],
		[[{ area: 'beijing', nights: 2.5 }], 'stops[0].nights: 2.5 must be a whole number'],
		[[{ area: 'Bei Jing' }], 'stops[0].area: "Bei Jing" is not a valid slug'],
		[[{ area: 'beijing' }, { area: 'beijing' }], 'stops[1]: beijing is on the route twice'],
		[
			[{ area: 'seoul' }],
			'"seoul" is not a city of china (no area file and not in the config route)',
		],
		[
			Array.from({ length: 31 }, (_, i) => ({ area: `c${String(i)}` })),
			'stops: has 31 items, at most 30 allowed',
		],
	])('refuses %j', async (stops, message) => {
		const call = w.owner.mutation(api.route.save, { country: 'china', stops, clientOpId: w.op() });
		expect(await messageOf(call)).toContain(message);
		expect(await countRows(w.t, 'routes')).toBe(0);
	});

	test('refuses a country that is not a leg', async () => {
		const call = w.owner.mutation(api.route.save, {
			country: 'japan',
			stops: [],
			clientOpId: w.op(),
		});
		expect(await messageOf(call)).toBe('unknown country "japan" (not a leg in config/trip.yaml)');
	});
});

describe('route.reset', () => {
	test('puts the seed back, and is unchanged when already on the seed', async () => {
		expect(
			await w.owner.mutation(api.route.reset, { country: 'china', clientOpId: w.op() }),
		).toMatchObject({ unchanged: true });
		await w.owner.mutation(api.route.save, {
			country: 'china',
			stops: [{ area: 'beijing' }],
			clientOpId: w.op(),
		});
		const res = await w.owner.mutation(api.route.reset, { country: 'china', clientOpId: w.op() });
		expect(res).toMatchObject({ unchanged: false, country: { source: 'game', planned: 6 } });
		const china = (await w.owner.query(api.route.current, {})).countries[0];
		expect(china?.stops.map((s) => [s.area, s.nights])).toEqual([
			['shanghai', 4],
			['suzhou', 2],
		]);
	});

	test('refuses a country that is not a leg', async () => {
		const call = w.owner.mutation(api.route.reset, { country: 'thailand', clientOpId: w.op() });
		expect(await codeOf(call)).toBe('Invalid');
	});
});
