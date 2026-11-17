// The To do and Bag screens' view models (port of game/public/trip.js viewTodo, viewBag, taskRow and openTasks).
// A task can have steps (tasks whose `parent` is its id) and dates (`opens`, `due`); the page lists open tasks
// by when they have to be done.
import {
	byUrgency,
	diffDays,
	statusFromSteps,
	stepsOf,
	taskBucket,
	taskDates,
	topLevelTasks,
	tripSpan,
	type TaskBucket,
	type TaskDates,
} from '@atr/shared/trip';
import { fmtDay, fmtShort, legsOf, plural } from '../money/model.ts';
import { taskStatus } from '../money/record/schema.ts';
import { flag, num, sortedByOrder, str, type TripData, type TripDoc } from '../money/trip-docs.ts';

export type TaskStatus = 'todo' | 'doing' | 'done';

/** When a task has to be done, as one short line. */
export interface When {
	/** "Due Sat 21 Nov · 4 days left", "Opens Wed 30 Dec, until Sat 2 Jan", "Overdue since Sat 14 Nov". */
	label: string;
	/** late: past its last day. soon: a week or less left. open: can be done, more than a week left. wait: not open yet. */
	tone: 'late' | 'soon' | 'open' | 'wait';
}

export interface StepRow {
	id: string;
	title: string;
	note: string;
	status: TaskStatus;
	when: When | null;
}

export interface TaskRow {
	id: string;
	title: string;
	note: string;
	status: TaskStatus;
	suggested: boolean;
	when: When | null;
	steps: StepRow[];
	stepsDone: number;
}

export interface TaskGroup {
	key: TaskBucket;
	title: string;
	rows: TaskRow[];
}

export interface TodoModel {
	total: number;
	done: number;
	/** Open tasks, the most pressing first. */
	open: TaskRow[];
	/** The open tasks by when: with a last day, any time, not open yet. Empty groups are left out. */
	groups: TaskGroup[];
	closed: TaskRow[];
	/** "2 open · 1 done", or "To do" with no tasks. */
	eyebrow: string;
	lede: string;
}

const HELP = 'Tap a title for its notes and steps; tap the box to tick it off.';

const GROUP_TITLE: Record<TaskBucket, string> = {
	next: 'Next up',
	anytime: 'Any time',
	later: 'Not open yet',
};

/** The line that says when a task has to be done; null for a done task or one with no date. */
export function whenOf(dates: TaskDates, today: string, done = false): When | null {
	if (done) return null;
	const { opens, due } = dates;
	if (opens !== '' && opens > today) {
		return {
			label: `Opens ${fmtDay(opens)}${due === '' ? '' : `, until ${fmtDay(due)}`}`,
			tone: 'wait',
		};
	}
	if (due === '') return null;
	const left = diffDays(today, due);
	if (left < 0) return { label: `Overdue since ${fmtDay(due)}`, tone: 'late' };
	if (left === 0) return { label: 'Due today', tone: 'soon' };
	if (left === 1) return { label: 'Due tomorrow', tone: 'soon' };
	const open = opens === '' ? '' : 'Open now, ';
	const by = open === '' ? (left <= 7 ? 'Due' : 'By') : 'until';
	return {
		label: `${open}${by} ${fmtDay(due)} · ${plural(left, 'day')} left`,
		tone: left <= 7 ? 'soon' : 'open',
	};
}

const taskFields = (x: TripDoc) => ({
	id: x.id,
	status: taskStatus(x),
	order: num(x, 'order'),
	parent: str(x, 'parent'),
	opens: str(x, 'opens'),
	due: str(x, 'due'),
});

export function todoModel(trip: TripData, today: string): TodoModel {
	const docs = new Map(trip.tasks.map((x) => [x.id, x]));
	const tasks = trip.tasks.map(taskFields);
	const dated = topLevelTasks(tasks).map((t) => {
		const steps = stepsOf(tasks, t.id);
		const status =
			statusFromSteps(
				t.status,
				steps.map((s) => s.status),
			) ?? t.status;
		return { ...t, status, steps, dates: taskDates(t, steps) };
	});
	const rows = dated
		.sort(
			(a, b) =>
				byUrgency<(typeof dated)[number]>(today, (t) => t.dates)(a, b) || a.id.localeCompare(b.id),
		)
		.map((t): TaskRow & { bucket: TaskBucket } => {
			const doc = docs.get(t.id);
			const done = t.status === 'done';
			const steps = t.steps.map((s): StepRow => {
				const d = docs.get(s.id);
				return {
					id: s.id,
					title: str(d, 'title'),
					note: str(d, 'note'),
					status: s.status,
					when: whenOf(taskDates(s), today, done || s.status === 'done'),
				};
			});
			return {
				id: t.id,
				title: str(doc, 'title'),
				note: str(doc, 'note'),
				status: t.status,
				suggested: flag(doc, 'suggested'),
				when: whenOf(t.dates, today, done),
				steps,
				stepsDone: steps.filter((s) => s.status === 'done').length,
				bucket: taskBucket(t.dates, today),
			};
		});
	const open = rows.filter((x) => x.status !== 'done');
	// done tasks keep the list's own order: their dates no longer matter
	const closed = rows
		.filter((x) => x.status === 'done')
		.sort((a, b) => num(docs.get(a.id), 'order') - num(docs.get(b.id), 'order'));
	const groups = (['next', 'anytime', 'later'] as const)
		.map((key) => ({
			key,
			title: GROUP_TITLE[key],
			rows: open.filter((x) => x.bucket === key),
		}))
		.filter((g) => g.rows.length > 0);
	const span = tripSpan(legsOf(trip));
	const before = span !== null && today < span.first;
	return {
		total: rows.length,
		done: closed.length,
		open,
		groups,
		closed,
		eyebrow:
			rows.length > 0 ? `${String(open.length)} open · ${String(closed.length)} done` : 'To do',
		lede: before
			? `What to sort out before the ${fmtShort(span.first)} departure, the most pressing first. ${HELP}`
			: `What is left to sort out, the most pressing first. ${HELP}`,
	};
}

/** Tasks not done yet (the To do badge); steps count with their task. */
export const openTasks = (trip: TripData | undefined): number =>
	trip === undefined
		? 0
		: topLevelTasks(trip.tasks.map(taskFields)).filter((x) => x.status !== 'done').length;

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
