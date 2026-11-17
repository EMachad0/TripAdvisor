import { describe, expect, it } from 'vitest';
import type { TripData } from '../money/trip-docs.ts';
import { bagModel, openTasks, todoModel, toggleTaskFields, whenOf } from './model.ts';

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
			['jr', 'doing', false],
			['esim', 'todo', true],
		]);
		expect(m.groups.map((g) => [g.title, g.rows.length])).toEqual([['Any time', 2]]);
		expect(m.closed.map((x) => x.id)).toEqual(['visa', 'old']);
		expect(m.eyebrow).toBe('2 open · 2 done');
	});
	it('names the departure day before the trip', () => {
		expect(todoModel(TASKS, '2026-11-15').lede).toMatch(
			/^What to sort out before the 5 Dec departure, the most pressing first\./,
		);
		expect(todoModel(TASKS, '2026-12-10').lede).toMatch(/^What is left to sort out/);
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

describe('todoModel with dates and steps', () => {
	const DATED = trip({
		tasks: [
			{ id: 'esim', title: 'eSIM', order: 1 },
			{ id: 'tdac', title: 'Arrival card', order: 2, opens: '2026-12-30', due: '2027-01-02' },
			{ id: 'keta', title: 'K-ETA', order: 3 },
			{ id: 'k1', title: 'Apply', parent: 'keta', status: 'done', order: 1 },
			{ id: 'k2', title: 'Book the hostel', parent: 'keta', due: '2026-12-27', order: 2 },
			{ id: 'phone', title: 'Phone', order: 4, due: '2026-11-20' },
			{ id: 'late', title: 'Case', order: 5, due: '2026-11-10' },
			{ id: 'lost', title: 'Step of a deleted task', parent: 'gone', order: 6 },
		],
	});

	it('groups open tasks by when, the nearest last day first; steps sit under their task', () => {
		const m = todoModel(DATED, '2026-11-17');
		expect(m.groups.map((g) => [g.title, g.rows.map((x) => x.id)])).toEqual([
			['Next up', ['late', 'phone', 'keta']],
			['Any time', ['esim', 'lost']],
			['Not open yet', ['tdac']],
		]);
		expect(m.eyebrow).toBe('6 open · 0 done');
		expect(openTasks(DATED)).toBe(6);
		const keta = m.open.find((x) => x.id === 'keta');
		expect(keta).toMatchObject({
			status: 'doing',
			stepsDone: 1,
			when: { label: 'By Sun 27 Dec · 40 days left', tone: 'open' },
		});
		expect(keta?.steps.map((s) => [s.id, s.status, s.when?.label ?? null])).toEqual([
			['k1', 'done', null],
			['k2', 'todo', 'By Sun 27 Dec · 40 days left'],
		]);
	});

	it('a task is done once every step is', () => {
		const tasks = DATED.tasks.map((x) => (x.id === 'k2' ? { ...x, status: 'done' } : x));
		const m = todoModel(trip({ tasks }), '2026-11-17');
		expect(m.closed.map((x) => x.id)).toEqual(['keta']);
		expect(m.closed[0]?.when).toBeNull();
	});

	it('says when in one line', () => {
		const on = (opens: string, due: string, today: string) =>
			whenOf({ opens, due }, today)?.label ?? null;
		expect(on('', '', '2026-11-17')).toBeNull();
		expect(on('2026-11-01', '', '2026-11-17')).toBeNull();
		expect(on('', '2026-11-10', '2026-11-17')).toBe('Overdue since Tue 10 Nov');
		expect(on('', '2026-11-17', '2026-11-17')).toBe('Due today');
		expect(on('', '2026-11-18', '2026-11-17')).toBe('Due tomorrow');
		expect(on('', '2026-11-20', '2026-11-17')).toBe('Due Fri 20 Nov · 3 days left');
		expect(on('2026-12-30', '2027-01-02', '2026-11-17')).toBe('Opens Wed 30 Dec, until Sat 2 Jan');
		expect(on('2026-12-30', '', '2026-11-17')).toBe('Opens Wed 30 Dec');
		expect(on('2026-12-30', '2027-01-02', '2026-12-30')).toBe(
			'Open now, until Sat 2 Jan · 3 days left',
		);
		expect(whenOf({ opens: '', due: '2026-11-10' }, '2026-11-17', true)).toBeNull();
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
