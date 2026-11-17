// Tasks with steps and dates: a step is a task whose `parent` is another task's id; `opens` is the first day a
// task can be done and `due` the last. Pure, shared by the To do page, Today and the Convex write path.
import type { Task } from './types.ts';

export type TaskState = 'todo' | 'doing' | 'done';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: string | undefined): string => (v !== undefined && DAY.test(v) ? v : '');
const statusOf = (t: Task): string =>
	t.status !== undefined && t.status !== '' ? t.status : t.done === true ? 'done' : 'todo';

/** The tasks that are not a step of another task in the list (a step whose task is gone counts as a task). */
export function topLevelTasks<T extends Task>(tasks: readonly T[]): T[] {
	const ids = new Set(tasks.map((t) => t.id));
	return tasks.filter((t) => t.parent === undefined || t.parent === '' || !ids.has(t.parent));
}

/** The steps of one task, in `order`. */
export function stepsOf<T extends Task>(tasks: readonly T[], id: string | undefined): T[] {
	if (id === undefined || id === '') return [];
	return tasks
		.filter((t) => t.parent === id && t.id !== id)
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export interface TaskDates {
	/** YYYY-MM-DD, or '' when it can be done any day. */
	opens: string;
	/** YYYY-MM-DD, or '' when it has no last day. */
	due: string;
}

/**
 * When a task has to be done: its own dates, else what its open steps say (the earliest last day; the earliest
 * first day, but only when every open step has one).
 */
export function taskDates(task: Task, steps: readonly Task[] = []): TaskDates {
	const open = steps.filter((s) => statusOf(s) !== 'done');
	const dues = open.map((s) => day(s.due)).filter((d) => d !== '');
	const opens = open.map((s) => day(s.opens));
	return {
		opens:
			day(task.opens) ||
			(day(task.due) === '' && opens.length > 0 && opens.every((d) => d !== '')
				? opens.reduce((a, b) => (a < b ? a : b))
				: ''),
		due: day(task.due) || (dues.length > 0 ? dues.reduce((a, b) => (a < b ? a : b)) : ''),
	};
}

/** next: has a last day and can be done today. later: cannot be done yet. anytime: no date. */
export type TaskBucket = 'next' | 'later' | 'anytime';

export function taskBucket(dates: TaskDates, today: string): TaskBucket {
	if (dates.opens !== '' && dates.opens > today) return 'later';
	return dates.due !== '' ? 'next' : 'anytime';
}

const BUCKET_RANK: Record<TaskBucket, number> = { next: 0, anytime: 1, later: 2 };

/**
 * Open tasks in the order to deal with them: the ones with a last day first (nearest first), then the undated
 * (in progress first, then `order`), then the ones that cannot be done yet (the first to open first).
 */
export function byUrgency<T extends Task>(
	today: string,
	datesOf: (t: T) => TaskDates,
): (a: T, b: T) => number {
	return (a, b) => {
		const da = datesOf(a);
		const db = datesOf(b);
		const ba = taskBucket(da, today);
		const bb = taskBucket(db, today);
		if (ba !== bb) return BUCKET_RANK[ba] - BUCKET_RANK[bb];
		const byDate =
			ba === 'next'
				? da.due.localeCompare(db.due)
				: ba === 'later'
					? da.opens.localeCompare(db.opens)
					: Number(statusOf(b) === 'doing') - Number(statusOf(a) === 'doing');
		return byDate || (a.order ?? 0) - (b.order ?? 0);
	};
}

/**
 * The status a task takes from its steps, or null to leave it alone: done when every step is done, in progress
 * once one is started, and back to to-do when it was done and a step is open again.
 */
export function statusFromSteps(
	current: TaskState,
	steps: readonly TaskState[],
): TaskState | null {
	if (steps.length === 0) return null;
	const next: TaskState = steps.every((s) => s === 'done')
		? 'done'
		: steps.some((s) => s !== 'todo')
			? 'doing'
			: current === 'done'
				? 'todo'
				: current;
	return next === current ? null : next;
}
