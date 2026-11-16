import { describe, expect, it } from 'vitest';
import type { TripData } from '../money/trip-docs.ts';
import { bagModel, openTasks, todoModel, toggleTaskFields } from './model.ts';

function trip(partial: Partial<TripData> = {}): TripData {
	return {
		tasks: [],
		legs: [],
		bag: [],
		budget: [],
		fixed: [],
		spend: [],
		settings: [],
		days: [],
		visited: [],
		...partial,
	};
}

const TASKS = trip({
	tasks: [
		{ id: 'jr', title: 'JR pass', status: 'doing', order: 3 },
		{ id: 'visa', title: 'Visa', status: 'done', done: true, order: 1 },
		{ id: 'esim', title: 'eSIM', suggested: true, order: 2 },
		{ id: 'old', title: 'Old style', done: true, order: 4 },
	],
	legs: [{ id: 'f', type: 'flight', start: '2026-12-05T22:00' }],
});

describe('todoModel', () => {
	it('splits open and done tasks in order, with the counts', () => {
		const m = todoModel(TASKS, '2026-11-15');
		expect(m.open.map((x) => [x.id, x.status, x.suggested])).toEqual([
			['esim', 'todo', true],
			['jr', 'doing', false],
		]);
		expect(m.closed.map((x) => x.id)).toEqual(['visa', 'old']);
		expect(m.eyebrow).toBe('2 open · 2 done');
	});
	it('names the departure day before the trip', () => {
		expect(todoModel(TASKS, '2026-11-15').lede).toMatch(
			/^Everything to sort out before the 5 Dec departure\./,
		);
		expect(todoModel(TASKS, '2026-12-10').lede).toMatch(/^Things to sort out\./);
		expect(todoModel(trip(), '2026-11-15')).toMatchObject({ eyebrow: 'To do', total: 0 });
	});
	it('counts open tasks for the badge', () => {
		expect(openTasks(TASKS)).toBe(2);
		expect(openTasks(undefined)).toBe(0);
	});
	it('ticks a task done, and an in-progress one too; unticks a done one', () => {
		expect(toggleTaskFields('todo')).toEqual({ status: 'done', done: true });
		expect(toggleTaskFields('doing')).toEqual({ status: 'done', done: true });
		expect(toggleTaskFields('done')).toEqual({ status: 'todo', done: false });
	});
});

describe('bagModel', () => {
	it('groups by category in order of first item, with packed counts', () => {
		const m = bagModel(
			trip({
				bag: [
					{ id: 'b', item: 'Boots', category: 'Clothes', qty: 1, packed: false, order: 1 },
					{ id: 'a', item: 'Adapter', category: 'Tech', qty: 2, packed: true, order: 2 },
					{ id: 'c', item: 'Socks', category: 'Clothes', qty: '5', packed: true, order: 3 },
					{ id: 'd', item: 'Thing', order: 4 },
				],
			}),
		);
		expect(m.eyebrow).toBe('2 of 4 packed');
		expect(m.groups.map((g) => [g.category, g.packed, g.items.length])).toEqual([
			['Clothes', 1, 2],
			['Tech', 1, 1],
			['Other', 0, 1],
		]);
		expect(m.groups.flatMap((g) => g.items.map((x) => x.qtyLabel))).toEqual(['', '×5', '×2', '']);
	});
	it('says Bag when empty', () => {
		expect(bagModel(trip())).toMatchObject({ eyebrow: 'Bag', total: 0, groups: [] });
	});
});
