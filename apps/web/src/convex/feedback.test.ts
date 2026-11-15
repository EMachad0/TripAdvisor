import { beforeEach, describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { computeRatings } from '@atr/shared/elo';
import { codeOf, countRows, messageOf, world, type World } from './test.helpers';
import { as, createUser, newTest } from './test.setup';

let w: World;
beforeEach(async () => {
	w = await world(newTest());
});
/** ts as the old server wrote it: ISO at second precision. (The Convex test runtime has its own clock, so the
 * specs check the format rather than a faked time.) */
const TS = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;

describe('feedback.state', () => {
	test('derives latest verdicts, notes, duels and game Elo like GET /api/state', async () => {
		await w.t.run(async (ctx) => {
			const base = { v: 1 as const, session: 's-1' };
			// Imported rows: seq is the file line. Equal ts keeps file order, so the later line wins.
			await ctx.db.insert('swipes', {
				...base,
				ts: '2026-11-01T10:00:00Z',
				seq: 2,
				round: 'place',
				id: 'yu-garden',
				verdict: 'skip',
			});
			await ctx.db.insert('swipes', {
				...base,
				ts: '2026-11-01T10:00:00Z',
				seq: 1,
				round: 'place',
				id: 'yu-garden',
				verdict: 'maybe',
			});
			await ctx.db.insert('swipes', {
				...base,
				ts: '2026-11-02T10:00:00Z',
				seq: 3,
				round: 'place',
				id: 'the-bund',
				verdict: 'must',
			});
			await ctx.db.insert('swipes', {
				...base,
				ts: '2026-11-01T09:00:00Z',
				seq: 4,
				round: 'area',
				id: 'shanghai',
				verdict: 'must',
			});
			await ctx.db.insert('duels', {
				...base,
				ts: '2026-11-03T10:00:00Z',
				seq: 1,
				winner: 'yu-garden',
				loser: 'the-bund',
			});
			await ctx.db.insert('notes', {
				...base,
				ts: '2026-11-01T10:00:00Z',
				seq: 1,
				round: 'place',
				id: 'yu-garden',
				text: '  old  ',
			});
			await ctx.db.insert('notes', {
				...base,
				ts: '2026-11-02T10:00:00Z',
				seq: 2,
				round: 'place',
				id: 'yu-garden',
				text: ' new ',
			});
			await ctx.db.insert('notes', {
				...base,
				ts: '2026-11-02T10:00:00Z',
				seq: 3,
				round: 'area',
				id: 'shanghai',
				text: 'x',
			});
			await ctx.db.insert('notes', {
				...base,
				ts: '2026-11-03T10:00:00Z',
				seq: 4,
				round: 'area',
				id: 'shanghai',
				text: '',
			});
		});
		const state = await w.owner.query(api.feedback.state, {});
		expect(state.verdicts).toEqual({
			area: { shanghai: 'must' },
			place: { 'yu-garden': 'skip', 'the-bund': 'must' },
		});
		expect(state.notes).toEqual({ area: {}, place: { 'yu-garden': 'new' } });
		expect(state.duels).toEqual([{ winner: 'yu-garden', loser: 'the-bund' }]);
		const expected = computeRatings({ 'yu-garden': 'skip', 'the-bund': 'must' }, [
			{ winner: 'yu-garden', loser: 'the-bund' },
		]);
		expect(state.ratings).toEqual(Object.fromEntries(expected));
		expect(state.ratings['yu-garden']?.games).toBe(1);
		expect(state.local).toEqual({ days: {}, locks: {} });
		expect(state.firstRun).toBeNull();
	});

	test('a member with no data gets the empty state', async () => {
		expect(await w.guest.query(api.feedback.state, {})).toEqual({
			verdicts: { area: {}, place: {} },
			notes: { area: {}, place: {} },
			duels: [],
			ratings: {},
			local: { days: {}, locks: {} },
			firstRun: null,
			firstSeen: {},
		});
	});

	test('refuses a user with no members row', async () => {
		const stranger = as(w.t, await createUser(w.t, { username: 'stranger', role: null }));
		expect(await codeOf(stranger.query(api.feedback.state, {}))).toBe('Forbidden');
	});
});

describe('feedback.trackSeen', () => {
	test('the first call sets firstRun and the baseline; later keys are new', async () => {
		const first = await w.owner.mutation(api.feedback.trackSeen, {
			keys: ['yu-garden', 'area:shanghai', 'not-a-place', 'area:nowhere', 'yu-garden'],
			clientOpId: w.op(),
		});
		expect(first).toMatchObject({ changed: true, added: 2 });
		const firstRun = 'firstRun' in first ? first.firstRun : '';
		expect(firstRun).toMatch(TS);
		const second = await w.owner.mutation(api.feedback.trackSeen, {
			keys: ['yu-garden', 'the-bund'],
			clientOpId: w.op(),
		});
		expect(second).toEqual({ changed: true, added: 1, firstRun });
		const state = await w.owner.query(api.feedback.state, {});
		expect(state.firstRun).toBe(firstRun);
		expect(Object.keys(state.firstSeen).sort()).toEqual(['area:shanghai', 'the-bund', 'yu-garden']);
		expect(state.firstSeen['yu-garden']).toBe(firstRun);
		expect(state.firstSeen['area:shanghai']).toBe(firstRun);
		expect((state.firstSeen['the-bund'] ?? '') >= firstRun).toBe(true);
		const third = await w.owner.mutation(api.feedback.trackSeen, {
			keys: ['the-bund'],
			clientOpId: w.op(),
		});
		expect(third).toEqual({ changed: false, added: 0, firstRun });
	});

	test('refuses an oversized key list', async () => {
		const keys = Array.from({ length: 5001 }, (_, i) => `k${String(i)}`);
		expect(
			await codeOf(w.owner.mutation(api.feedback.trackSeen, { keys, clientOpId: w.op() })),
		).toBe('Invalid');
	});
});

describe('feedback.swipe', () => {
	test('stamps ts, session and the country from the content index', async () => {
		const res = await w.owner.mutation(api.feedback.swipe, {
			round: 'place',
			id: 'gyeongbokgung',
			verdict: 'must',
			ms: 1234,
			clientOpId: w.op(),
		});
		expect(res).toMatchObject({
			ok: true,
			event: {
				v: 1,
				ts: expect.stringMatching(TS) as unknown,
				round: 'place',
				id: 'gyeongbokgung',
				verdict: 'must',
				country: 'korea',
				ms: 1234,
			},
		});
		if ('event' in res) expect(res.event.session).toMatch(/^web-[0-9a-f]{12}$/);
		const rows = await w.t.run(async (ctx) => await ctx.db.query('swipes').take(10));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.userId).toBeTypeOf('string');
	});

	test.each([
		[5_000_000, 3_600_000],
		[-1, undefined],
		[1.5, undefined],
		[0, 0],
	])('ms %s is stored as %s', async (ms, stored) => {
		const res = await w.owner.mutation(api.feedback.swipe, {
			round: 'area',
			id: 'seoul',
			verdict: 'skip',
			ms,
			clientOpId: w.op(),
		});
		expect('event' in res && res.event.ms).toBe(stored);
	});

	test('refuses an unknown id, a place id in the area round, and a bad verdict', async () => {
		const call = (args: { round: 'area' | 'place'; id: string }) =>
			w.owner.mutation(api.feedback.swipe, { ...args, verdict: 'must', clientOpId: w.op() });
		expect(await messageOf(call({ round: 'place', id: 'nope' }))).toBe('unknown place id "nope"');
		expect(await codeOf(call({ round: 'area', id: 'yu-garden' }))).toBe('Invalid');
		await expect(
			w.owner.mutation(api.feedback.swipe, {
				round: 'place',
				id: 'yu-garden',
				// @ts-expect-error -- a verdict outside must|maybe|skip is refused by the args validator
				verdict: 'love',
				clientOpId: w.op(),
			}),
		).rejects.toThrow(/Validator error/);
		expect(await countRows(w.t, 'swipes')).toBe(0);
	});

	test('refuses with NoContent before the content index is published', async () => {
		const t = newTest();
		const owner = as(t, await createUser(t, { username: 'owner', role: 'owner' }));
		const call = owner.mutation(api.feedback.swipe, {
			round: 'place',
			id: 'yu-garden',
			verdict: 'must',
			clientOpId: 'x',
		});
		expect(await codeOf(call)).toBe('NoContent');
	});
});

describe('feedback.note', () => {
	const note = (text: string, id = 'yu-garden') =>
		w.owner.mutation(api.feedback.note, { round: 'place', id, text, clientOpId: w.op() });

	test('normalizes CRLF, trims, skips an unchanged save and clears with ""', async () => {
		const first = await note('  line one\r\nline two\r  ');
		expect(first).toMatchObject({ ok: true, unchanged: false, note: 'line one\nline two' });
		expect(await note('line one\nline two')).toEqual({
			ok: true,
			unchanged: true,
			note: 'line one\nline two',
		});
		expect(await countRows(w.t, 'notes')).toBe(1);
		expect(await note('')).toMatchObject({ ok: true, unchanged: false, note: null });
		expect(await note('   ')).toEqual({ ok: true, unchanged: true, note: null });
		expect(await countRows(w.t, 'notes')).toBe(2);
		expect((await w.owner.query(api.feedback.state, {})).notes.place).toEqual({});
	});

	test('a first note equal to "" is unchanged (nothing to clear)', async () => {
		expect(await note('')).toEqual({ ok: true, unchanged: true, note: null });
		expect(await countRows(w.t, 'notes')).toBe(0);
	});

	test('compares against the latest note by ts, not the last inserted', async () => {
		await w.t.run(async (ctx) => {
			await ctx.db.insert('notes', {
				v: 1,
				ts: '2026-11-02T00:00:00Z',
				seq: 1,
				round: 'place',
				id: 'yu-garden',
				text: 'newer',
			});
			await ctx.db.insert('notes', {
				v: 1,
				ts: '2026-11-01T00:00:00Z',
				seq: 2,
				round: 'place',
				id: 'yu-garden',
				text: 'older',
			});
		});
		expect(await note('newer')).toMatchObject({ unchanged: true });
		expect(await note('older')).toMatchObject({ unchanged: false });
	});

	test('refuses a note over 2000 characters and an unknown card', async () => {
		expect(await messageOf(note('x'.repeat(2001)))).toMatch(/too long \(max 2000\)/);
		expect(await note('x'.repeat(2000))).toMatchObject({ unchanged: false });
		expect(await messageOf(note('hi', 'nope'))).toBe('unknown place id "nope"');
	});
});
