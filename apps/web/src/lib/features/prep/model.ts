// The To do and Bag screens' view models (port of game/public/trip.js viewTodo, viewBag, taskRow and openTasks).
import { tripSpan } from '@atr/shared/trip';
import { fmtShort, legsOf } from '../money/model.ts';
import { taskStatus } from '../money/record/schema.ts';
import { flag, num, sortedByOrder, str, type TripData } from '../money/trip-docs.ts';

export type TaskStatus = 'todo' | 'doing' | 'done';

export interface TaskRow {
	id: string;
	title: string;
	note: string;
	status: TaskStatus;
	suggested: boolean;
}

export interface TodoModel {
	total: number;
	done: number;
	open: TaskRow[];
	closed: TaskRow[];
	/** "2 open · 1 done", or "To do" with no tasks. */
	eyebrow: string;
	lede: string;
}

const TAP_HELP = 'Tap the box to tick it off; tap ⋯ to edit or mark something as in progress.';

export function todoModel(trip: TripData, today: string): TodoModel {
	const rows = sortedByOrder(trip.tasks).map((x): TaskRow => ({
		id: x.id,
		title: str(x, 'title'),
		note: str(x, 'note'),
		status: taskStatus(x),
		suggested: flag(x, 'suggested'),
	}));
	const open = rows.filter((x) => x.status !== 'done');
	const closed = rows.filter((x) => x.status === 'done');
	const span = tripSpan(legsOf(trip));
	const before = span !== null && today < span.first;
	return {
		total: rows.length,
		done: closed.length,
		open,
		closed,
		eyebrow:
			rows.length > 0 ? `${String(open.length)} open · ${String(closed.length)} done` : 'To do',
		lede: before
			? `Everything to sort out before the ${fmtShort(span.first)} departure. ${TAP_HELP}`
			: `Things to sort out. ${TAP_HELP}`,
	};
}

/** Tasks not done yet (the To do badge). */
export const openTasks = (trip: TripData | undefined): number =>
	trip === undefined ? 0 : trip.tasks.filter((x) => taskStatus(x) !== 'done').length;

/** What ticking a task's box writes: done ↔ to do (an in-progress task becomes done). */
export function toggleTaskFields(status: TaskStatus): { status: TaskStatus; done: boolean } {
	const wasDone = status === 'done';
	return { status: wasDone ? 'todo' : 'done', done: !wasDone };
}

export interface BagItem {
	id: string;
	item: string;
	note: string;
	qty: number;
	/** "×2" when the quantity is not 1, else ''. */
	qtyLabel: string;
	packed: boolean;
}

export interface BagGroup {
	category: string;
	packed: number;
	items: BagItem[];
}

export interface BagModel {
	total: number;
	packed: number;
	groups: BagGroup[];
	/** "1 of 2 packed", or "Bag" when empty. */
	eyebrow: string;
}

export function bagModel(trip: TripData): BagModel {
	const docs = sortedByOrder(trip.bag);
	const groups: BagGroup[] = [];
	for (const x of docs) {
		const category = str(x, 'category') || 'Other';
		const qty = num(x, 'qty');
		const item: BagItem = {
			id: x.id,
			item: str(x, 'item'),
			note: str(x, 'note'),
			qty,
			qtyLabel: qty !== 0 && qty !== 1 ? `×${String(qty)}` : '',
			packed: flag(x, 'packed'),
		};
		const g = groups.find((y) => y.category === category);
		if (g === undefined) groups.push({ category, packed: item.packed ? 1 : 0, items: [item] });
		else {
			g.items.push(item);
			if (item.packed) g.packed++;
		}
	}
	const packed = docs.filter((x) => flag(x, 'packed')).length;
	return {
		total: docs.length,
		packed,
		groups,
		eyebrow: docs.length > 0 ? `${String(packed)} of ${String(docs.length)} packed` : 'Bag',
	};
}
