import { beforeEach, describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import type { TripFields } from './lib/logic/trip';
import { codeOf, countRows, freeze, messageOf, world, type World } from './test.helpers';
import { newTest } from './test.setup';
import type { TripCollection, TripOp } from './tables/validators';

let w: World;
beforeEach(async () => {
	w = await world(newTest());
});

const write = (col: TripCollection, op: TripOp, id: string | undefined, data?: TripFields) =>
	w.owner.mutation(api.trip.write, {
		col,
		op,
		...(id === undefined ? {} : { id }),
		...(data === undefined ? {} : { data }),
		clientOpId: w.op(),
	});

async function docOf(
	col: TripCollection,
	id: string,
): Promise<Record<string, unknown> | undefined> {
	const all = await w.owner.query(api.trip.all, {});
	return all[col].find((d) => d.id === id);
}

describe('trip.all', () => {
	test('returns all nine collections, each in stored order, without system fields', async () => {
		await write('tasks', 'set', 'b', { title: 'B' });
		await write('tasks', 'set', 'a', { title: 'A' });
		const all = await w.guest.query(api.trip.all, {});
		expect(Object.keys(all).sort()).toEqual([
			'bag',
			'budget',
			'days',
			'fixed',
			'legs',
			'settings',
			'spend',
			'tasks',
			'visited',
		]);
		expect(all.tasks.map((d) => d.id)).toEqual(['b', 'a']);
		expect(all.tasks[0]).toEqual({ id: 'b', title: 'B', order: 1 });
	});
});

describe('trip.write (writeDoc semantics)', () => {
	test('set creates, then replaces whole; data.id is ignored', async () => {
		expect(
			await write('fixed', 'set', 'insurance', {
				id: 'other',
				title: 'Insurance',
				amount: 900,
				status: 'topay',
			}),
		).toEqual({
			ok: true,
			doc: { id: 'insurance', title: 'Insurance', amount: 900, status: 'topay', order: 1 },
		});
		await write('fixed', 'set', 'insurance', { title: 'Insurance 2' });
		expect(await docOf('fixed', 'insurance')).toEqual({ id: 'insurance', title: 'Insurance 2' });
		expect(await countRows(w.t, 'tripFixed')).toBe(1);
	});

	test('set without an id makes an x<base36 time><4 random> id', async () => {
		const res = await write('tasks', 'set', undefined, { title: 'New' });
		expect(res).toMatchObject({
			ok: true,
			doc: { title: 'New', id: expect.stringMatching(/^x[0-9a-z]{6,}$/) as unknown },
		});
	});

	test('update merges, drops null fields, and fails on a missing id', async () => {
		await write('budget', 'set', 'china', {
			country: 'china',
			currency: 'CNY',
			bed: 100,
			food: 80,
		});
		const res = await write('budget', 'update', 'china', { food: 90, bed: null });
		expect(res).toEqual({
			ok: true,
			doc: { id: 'china', country: 'china', currency: 'CNY', food: 90, order: 1 },
		});
		expect(await messageOf(write('budget', 'update', 'japan', { food: 1 }))).toBe(
			'no budget document "japan"',
		);
	});

	test('delete removes; deleting a missing id is a no-op', async () => {
		await write('visited', 'set', 'yu-garden', { at: '2026-12-08' });
		expect(await write('visited', 'delete', 'yu-garden')).toEqual({ ok: true, doc: null });
		expect(await write('visited', 'delete', 'yu-garden')).toEqual({ ok: true, doc: null });
		expect(await countRows(w.t, 'tripVisited')).toBe(0);
	});

	test.each([
		['bad id', () => write('tasks', 'set', '-starts-with-dash', { title: 'x' })],
		['bad id', () => write('tasks', 'set', 'x'.repeat(81), { title: 'x' })],
		['data must be an object', () => write('tasks', 'set', 'a')],
		['update needs an id', () => write('tasks', 'update', undefined, { title: 'x' })],
		['delete needs an id', () => write('tasks', 'delete', undefined)],
	])('refuses with "%s"', async (message, call) => {
		expect(await messageOf(call())).toBe(message);
		expect(await countRows(w.t, 'tripTasks')).toBe(0);
	});

	test('refuses a field the collection does not have, or of the wrong type', async () => {
		expect(await codeOf(write('tasks', 'set', 'a', { title: 'x', colour: 'red' }))).toBe('Invalid');
		expect(await messageOf(write('tasks', 'set', 'a', { title: 7 }))).toMatch(
			/^invalid tasks document/,
		);
		expect(await codeOf(write('tasks', 'set', 'a', { status: 'someday' }))).toBe('Invalid');
		expect(await countRows(w.t, 'tripTasks')).toBe(0);
	});

	test('records every change in tripChanges', async () => {
		await write('tasks', 'set', 'a', { title: 'A' });
		await write('tasks', 'update', 'a', { note: 'n' });
		await write('tasks', 'delete', 'a');
		await write('tasks', 'delete', 'a');
		const changes = await w.t.run(async (ctx) => await ctx.db.query('tripChanges').take(10));
		expect(changes.map((c) => [c.col, c.op, c.id])).toEqual([
			['tasks', 'set', 'a'],
			['tasks', 'update', 'a'],
			['tasks', 'delete', 'a'],
		]);
		expect(changes[1]?.data).toEqual({ note: 'n' });
	});
});

describe('trip.write (form shaping)', () => {
	test('a new document gets the next order (not days or settings)', async () => {
		await write('tasks', 'set', 'a', { title: 'A', order: 7 });
		expect(await write('tasks', 'set', 'b', { title: 'B' })).toMatchObject({ doc: { order: 8 } });
		expect(await write('settings', 'set', 'main', { cap: 30000 })).toEqual({
			ok: true,
			doc: { id: 'main', cap: 30000 },
		});
		expect(await write('days', 'set', '2026-12-25', { status: 'off' })).toEqual({
			ok: true,
			doc: { id: '2026-12-25', status: 'off' },
		});
	});

	test('task done mirrors status', async () => {
		expect(await write('tasks', 'set', 'a', { title: 'A', status: 'done' })).toMatchObject({
			doc: { status: 'done', done: true },
		});
		expect(await write('tasks', 'update', 'a', { status: 'doing' })).toMatchObject({
			doc: { status: 'doing', done: false },
		});
		expect(await write('tasks', 'update', 'a', { note: 'only a note' })).toMatchObject({
			doc: { done: false },
		});
	});

	test('flights: IATA upper-cased and a default title; dates and times joined; cities split', async () => {
		const res = await write('legs', 'set', 'f1', {
			type: 'flight',
			from: 'pvg',
			to: 'icn',
			title: '',
			startDate: '2027-01-02',
			startTime: '09:30',
			endDate: '2027-01-02',
			endTime: '',
			city: '',
		});
		expect(res).toEqual({
			ok: true,
			doc: {
				id: 'f1',
				type: 'flight',
				from: 'PVG',
				to: 'ICN',
				title: 'PVG → ICN',
				start: '2027-01-02T09:30',
				end: '2027-01-02',
				city: '',
				order: 1,
			},
		});
		const stay = await write('legs', 'set', 's1', {
			type: 'stay',
			title: 'Hostel',
			city: 'Shanghai, Suzhou',
		});
		expect(stay).toMatchObject({ doc: { city: 'shanghai', cities: ['shanghai', 'suzhou'] } });
		const one = await write('legs', 'update', 's1', { city: 'Beijing' });
		expect(one).toMatchObject({ doc: { city: 'beijing' } });
		expect('doc' in one && one.doc !== null && 'cities' in one.doc).toBe(false);
	});

	test('an empty enum select is stored as absent; days keep an empty status', async () => {
		expect(await write('legs', 'set', 'n1', { type: 'note', status: '', title: 'x' })).toEqual({
			ok: true,
			doc: { id: 'n1', type: 'note', title: 'x', order: 1 },
		});
		expect(await write('days', 'set', '2026-12-26', { status: '' })).toMatchObject({
			doc: { status: '' },
		});
	});

	test('bag: qty defaults to 1 and a new item is unpacked', async () => {
		expect(await write('bag', 'set', 'socks', { item: 'Socks', qty: 0 })).toMatchObject({
			doc: { qty: 1, packed: false },
		});
		expect(await write('bag', 'update', 'socks', { qty: 3 })).toMatchObject({ doc: { qty: 3 } });
	});

	test('spend: amountBRL comes from the shared RATES, never from the client', async () => {
		const res = await write('spend', 'set', 's', {
			amount: 100,
			currency: 'CNY',
			amountBRL: 1,
			category: 'food',
		});
		expect(res).toMatchObject({ doc: { amountBRL: 72 } });
		expect(await write('spend', 'update', 's', { currency: 'JPY' })).toMatchObject({
			doc: { amountBRL: 3.4 },
		});
		expect(await write('spend', 'update', 's', { currency: 'XYZ' })).toMatchObject({
			doc: { amountBRL: 100 },
		});
	});
});

describe('trip.bagUntickAll', () => {
	test('unpacks every packed item in one call', async () => {
		await write('bag', 'set', 'a', { item: 'A', packed: true });
		await write('bag', 'set', 'b', { item: 'B', packed: true });
		await write('bag', 'set', 'c', { item: 'C' });
		const res = await w.owner.mutation(api.trip.bagUntickAll, { clientOpId: w.op() });
		expect(res).toEqual({ ok: true, changed: 2 });
		const bag = (await w.owner.query(api.trip.all, {})).bag;
		expect(bag.map((d) => d['packed'])).toEqual([false, false, false]);
		expect(await w.owner.mutation(api.trip.bagUntickAll, { clientOpId: w.op() })).toEqual({
			ok: true,
			changed: 0,
		});
	});
});

describe('internal trip.adminWrite', () => {
	test('follows the same rules as trip.write', async () => {
		const res = await w.t.mutation(internal.trip.adminWrite, {
			col: 'tasks',
			op: 'set',
			id: 'a',
			data: { title: 'A', status: 'done' },
		});
		expect(res).toEqual({
			ok: true,
			doc: { id: 'a', title: 'A', status: 'done', done: true, order: 1 },
		});
		expect(
			await messageOf(
				w.t.mutation(internal.trip.adminWrite, { col: 'tasks', op: 'update', id: 'zz', data: {} }),
			),
		).toBe('no tasks document "zz"');
		const change = await w.t.run(async (ctx) => await ctx.db.query('tripChanges').first());
		expect(change?.userId).toBe('admin');
	});

	test('refuses while writes are frozen, unless force: true', async () => {
		await freeze(w.t);
		const args = { col: 'tasks' as const, op: 'set' as const, id: 'a', data: { title: 'A' } };
		expect(await codeOf(w.t.mutation(internal.trip.adminWrite, args))).toBe('Frozen');
		expect(await countRows(w.t, 'tripTasks')).toBe(0);
		expect(await w.t.mutation(internal.trip.adminWrite, { ...args, force: true })).toMatchObject({
			ok: true,
		});
		expect(await countRows(w.t, 'tripTasks')).toBe(1);
	});
});
