import { beforeEach, describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { computeRatings, roundRating, START } from '@atr/shared/elo';
import { codeOf, countRows, messageOf, world, type World } from './test.helpers';
import { newTest } from './test.setup';

let w: World;
beforeEach(async () => {
	w = await world(newTest());
});

describe('decide.duel', () => {
	test('stamps both pre-duel game ratings and the shared country', async () => {
		await w.owner.mutation(api.feedback.swipe, {
			round: 'place',
			id: 'yu-garden',
			verdict: 'must',
			clientOpId: w.op(),
		});
		await w.owner.mutation(api.feedback.swipe, {
			round: 'place',
			id: 'the-bund',
			verdict: 'maybe',
			clientOpId: w.op(),
		});
		const first = await w.owner.mutation(api.decide.duel, {
			winner: 'the-bund',
			loser: 'yu-garden',
			clientOpId: w.op(),
		});
		expect(first).toMatchObject({
			ok: true,
			event: {
				winner: 'the-bund',
				loser: 'yu-garden',
				country: 'china',
				elo: { winner: 1450, loser: 1550 },
			},
		});
		const second = await w.owner.mutation(api.decide.duel, {
			winner: 'yu-garden',
			loser: 'gyeongbokgung',
			clientOpId: w.op(),
		});
		const ratings = computeRatings({ 'yu-garden': 'must', 'the-bund': 'maybe' }, [
			{ winner: 'the-bund', loser: 'yu-garden' },
		]);
		expect(second).toMatchObject({
			event: { elo: { winner: roundRating(ratings.get('yu-garden')?.rating ?? 0), loser: START } },
		});
		// Different countries: no country on the line.
		expect('event' in second && 'country' in second.event).toBe(false);
		expect((await w.owner.query(api.feedback.state, {})).duels).toHaveLength(2);
	});

	test.each([
		['yu-garden', 'yu-garden'],
		['yu-garden', 'nope'],
		['shanghai', 'yu-garden'],
	])('refuses %s vs %s', async (winner, loser) => {
		const call = w.owner.mutation(api.decide.duel, { winner, loser, clientOpId: w.op() });
		expect(await messageOf(call)).toBe('winner and loser must be two different existing places');
		expect(await countRows(w.t, 'duels')).toBe(0);
	});
});

describe('decide.setDays / resetDays', () => {
	test('sets whole days 0..90, null removes, unknown countries and bad values are skipped', async () => {
		const res = await w.owner.mutation(api.decide.setDays, {
			days: { china: 20, korea: 0, japan: 91, thailand: 2.5, brazil: 5, 'hong-kong': -1 },
			clientOpId: w.op(),
		});
		expect(res).toEqual({ ok: true, local: { days: { china: 20, korea: 0 }, locks: {} } });
		const res2 = await w.owner.mutation(api.decide.setDays, {
			days: { china: null, japan: 90 },
			clientOpId: w.op(),
		});
		expect(res2).toEqual({ ok: true, local: { days: { korea: 0, japan: 90 }, locks: {} } });
		expect((await w.guest.query(api.feedback.state, {})).local.days).toEqual({
			korea: 0,
			japan: 90,
		});
		const reset = await w.owner.mutation(api.decide.resetDays, { clientOpId: w.op() });
		expect(reset).toEqual({ ok: true, local: { days: {}, locks: {} } });
		expect(await countRows(w.t, 'gameState')).toBe(1);
	});
});

describe('decide.setLock', () => {
	test('locks and unlocks a single-pick holiday on an existing place', async () => {
		const locked = await w.owner.mutation(api.decide.setLock, {
			holiday: 'christmas',
			placeId: 'yu-garden',
			clientOpId: w.op(),
		});
		expect(locked).toEqual({
			ok: true,
			changed: true,
			local: { days: {}, locks: { christmas: 'yu-garden' } },
		});
		const unlocked = await w.owner.mutation(api.decide.setLock, {
			holiday: 'christmas',
			placeId: null,
			clientOpId: w.op(),
		});
		expect(unlocked).toEqual({ ok: true, changed: true, local: { days: {}, locks: {} } });
	});

	test.each([
		['lny', 'yu-garden', 'a many-pick holiday takes no lock'],
		['easter', 'yu-garden', 'an unknown holiday'],
		['nye', 'nope', 'an unknown place'],
	])('%s -> %s is skipped (%s)', async (holiday, placeId) => {
		const res = await w.owner.mutation(api.decide.setLock, {
			holiday,
			placeId,
			clientOpId: w.op(),
		});
		expect(res).toEqual({ ok: true, changed: false, local: { days: {}, locks: {} } });
	});

	test('keeps days when a lock changes', async () => {
		await w.owner.mutation(api.decide.setDays, { days: { china: 10 }, clientOpId: w.op() });
		const res = await w.owner.mutation(api.decide.setLock, {
			holiday: 'nye',
			placeId: 'the-bund',
			clientOpId: w.op(),
		});
		expect(res).toMatchObject({ local: { days: { china: 10 }, locks: { nye: 'the-bund' } } });
	});

	test('refuses with NoContent before the content index exists', async () => {
		await w.t.run(async (ctx) => {
			const index = await ctx.db.query('contentIndex').first();
			if (index !== null) await ctx.db.delete('contentIndex', index._id);
		});
		const call = w.owner.mutation(api.decide.setLock, {
			holiday: 'nye',
			placeId: 'the-bund',
			clientOpId: w.op(),
		});
		expect(await codeOf(call)).toBe('NoContent');
	});
});
