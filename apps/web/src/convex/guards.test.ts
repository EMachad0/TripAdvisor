// Every public function against the access rules: queries serve owner and guest and refuse the signed out;
// every mutation refuses the guest and writes nothing, runs for the owner, returns early on a replayed
// clientOpId without writing again, and throws Frozen while writes are frozen.
import type { FunctionReference } from 'convex/server';
import { beforeEach, describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import type { TableNames } from './_generated/dataModel';
import { codeOf, countRows, freeze, world, type World } from './test.helpers';
import { newTest } from './test.setup';

type AnyMutation = FunctionReference<'mutation'>;
type AnyQuery = FunctionReference<'query'>;

interface MutationCase {
	name: string;
	fn: AnyMutation;
	args: Record<string, unknown>;
	/** Tables a successful call writes to (besides appliedOps). */
	writes: TableNames[];
	/** Rows to set up first (owner calls), so the case has something to change. */
	setup?: (w: World) => Promise<void>;
}

const MUTATIONS: MutationCase[] = [
	{
		name: 'feedback.trackSeen',
		fn: api.feedback.trackSeen,
		args: { keys: ['yu-garden'] },
		writes: ['firstSeen', 'gameState'],
	},
	{
		name: 'feedback.swipe',
		fn: api.feedback.swipe,
		args: { round: 'place', id: 'yu-garden', verdict: 'must' },
		writes: ['swipes'],
	},
	{
		name: 'feedback.note',
		fn: api.feedback.note,
		args: { round: 'area', id: 'shanghai', text: 'go' },
		writes: ['notes'],
	},
	{
		name: 'decide.duel',
		fn: api.decide.duel,
		args: { winner: 'yu-garden', loser: 'the-bund' },
		writes: ['duels'],
	},
	{
		name: 'decide.setDays',
		fn: api.decide.setDays,
		args: { days: { china: 20 } },
		writes: ['gameState'],
	},
	{ name: 'decide.resetDays', fn: api.decide.resetDays, args: {}, writes: ['gameState'] },
	{
		name: 'decide.setLock',
		fn: api.decide.setLock,
		args: { holiday: 'christmas', placeId: 'yu-garden' },
		writes: ['gameState'],
	},
	{
		name: 'route.save',
		fn: api.route.save,
		args: { country: 'china', stops: [{ area: 'beijing', nights: 3 }] },
		writes: ['routes'],
	},
	{
		name: 'route.reset',
		fn: api.route.reset,
		args: { country: 'china' },
		writes: ['routes'],
		setup: async (w) => {
			await w.owner.mutation(api.route.save, {
				country: 'china',
				stops: [{ area: 'beijing' }],
				clientOpId: w.op(),
			});
		},
	},
	{
		name: 'trip.write',
		fn: api.trip.write,
		args: { col: 'tasks', op: 'set', id: 'visa', data: { title: 'Visa' } },
		writes: ['tripTasks', 'tripChanges'],
	},
	{
		name: 'trip.bagUntickAll',
		fn: api.trip.bagUntickAll,
		args: {},
		writes: ['tripChanges'],
		setup: async (w) => {
			await w.owner.mutation(api.trip.write, {
				col: 'bag',
				op: 'set',
				id: 'socks',
				data: { item: 'Socks', packed: true },
				clientOpId: w.op(),
			});
		},
	},
];

/** `perUser`: the answer describes the caller, so owner and guest differ. */
const QUERIES: { name: string; fn: AnyQuery; perUser?: boolean }[] = [
	{ name: 'feedback.state', fn: api.feedback.state },
	{ name: 'route.current', fn: api.route.current },
	{ name: 'trip.all', fn: api.trip.all },
	{ name: 'members.me', fn: api.members.me, perUser: true },
];

let w: World;
beforeEach(async () => {
	w = await world(newTest());
});

async function counts(tables: TableNames[]): Promise<number[]> {
	return await Promise.all(
		[...tables, 'appliedOps' as const].map((table) => countRows(w.t, table)),
	);
}

describe.each(MUTATIONS)('$name', ({ fn, args, writes, setup }) => {
	beforeEach(async () => {
		await setup?.(w);
	});

	test('refuses the guest and writes nothing', async () => {
		const before = await counts(writes);
		expect(await codeOf(w.guest.mutation(fn, { ...args, clientOpId: 'guest-op' }))).toBe(
			'Forbidden',
		);
		expect(await counts(writes)).toEqual(before);
	});

	test('refuses a signed-out caller', async () => {
		expect(await codeOf(w.t.mutation(fn, { ...args, clientOpId: 'anon-op' }))).toBe(
			'Unauthenticated',
		);
	});

	test('runs for the owner; a replayed clientOpId returns early and writes nothing more', async () => {
		const first: unknown = await w.owner.mutation(fn, { ...args, clientOpId: 'replay-op' });
		expect(first).not.toEqual({ replayed: true });
		const after = await counts(writes);
		expect(await w.owner.mutation(fn, { ...args, clientOpId: 'replay-op' })).toEqual({
			replayed: true,
		});
		expect(await counts(writes)).toEqual(after);
	});

	test('throws Frozen while writes are frozen and writes nothing', async () => {
		await freeze(w.t);
		const before = await counts(writes);
		expect(await codeOf(w.owner.mutation(fn, { ...args, clientOpId: 'frozen-op' }))).toBe('Frozen');
		expect(await counts(writes)).toEqual(before);
		await freeze(w.t, false);
		expect(await w.owner.mutation(fn, { ...args, clientOpId: 'frozen-op' })).not.toEqual({
			replayed: true,
		});
	});
});

describe.each(QUERIES)('$name', ({ fn, perUser }) => {
	test('serves the owner and the guest', async () => {
		const owner: unknown = await w.owner.query(fn, {});
		const guest: unknown = await w.guest.query(fn, {});
		if (perUser === true) expect(guest).not.toEqual(owner);
		else expect(guest).toEqual(owner);
	});

	test('refuses a signed-out caller', async () => {
		expect(await codeOf(w.t.query(fn, {}))).toBe('Unauthenticated');
	});
});
