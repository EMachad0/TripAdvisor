// The trip store on Convex: one table per collection (TRIP_TABLES), with writeDoc semantics from
// lib/logic/trip.ts. Shared by trip.write (the owner, through the outbox) and internal.trip.adminWrite
// (`./atr trip`), so both follow the same rules.
import { statusFromSteps, type TaskState } from '@atr/shared/trip';
import { validate, ValidationError } from 'convex-helpers/validators';
import type { DatabaseReader, DatabaseWriter } from '../_generated/server';
import * as tripTables from '../tables/trip';
import { TRIP_TABLES, type TripCollection } from '../tables/validators';
import { invalid } from './errors';
import {
	applyTripWrite,
	checkTripWrite,
	maxOrder,
	normalizeTripFields,
	storable,
	tripWriteSizeError,
	TripWriteError,
	type TripDoc,
	type TripWriteRequest,
} from './logic/trip';
import { allRows, withoutSystemFields } from './rows';

export type TripTable = (typeof TRIP_TABLES)[TripCollection];

/** The schema table definition of each trip table (for its validator and field order). */
const DEFINITIONS = {
	tripTasks: tripTables.tripTasks,
	tripLegs: tripTables.tripLegs,
	tripBag: tripTables.tripBag,
	tripBudget: tripTables.tripBudget,
	tripFixed: tripTables.tripFixed,
	tripSpend: tripTables.tripSpend,
	tripSettings: tripTables.tripSettings,
	tripDays: tripTables.tripDays,
	tripVisited: tripTables.tripVisited,
} as const satisfies Record<TripTable, unknown>;

/** Field names of a trip table in schema order (`id` first). */
export function tripFieldOrder(col: TripCollection): string[] {
	return Object.keys(DEFINITIONS[TRIP_TABLES[col]].validator.fields);
}

/** A stored row as the plain trip document the old files held. */
function toTripDoc(row: { _id: unknown; _creationTime: number; id: string }): TripDoc {
	return withoutSystemFields(row);
}

/** All documents of one collection, in stored order (insertion, as the old files kept them). */
export async function readCollection(db: DatabaseReader, col: TripCollection): Promise<TripDoc[]> {
	const rows = await allRows(db, TRIP_TABLES[col]);
	return rows.map(toTripDoc);
}

async function findRow(db: DatabaseReader, col: TripCollection, id: string) {
	return await db
		.query(TRIP_TABLES[col])
		.withIndex('by_doc_id', (q) => q.eq('id', id))
		.first();
}

function checkStorable(col: TripCollection, doc: TripDoc): void {
	try {
		validate(DEFINITIONS[TRIP_TABLES[col]].validator, doc, { throw: true });
	} catch (error) {
		if (error instanceof ValidationError) {
			throw invalid(`invalid ${col} document: ${error.message}`);
		}
		throw error;
	}
}

export interface TripWriter {
	userId: string;
	ts: string;
}

/**
 * One write to one trip collection: set (create or replace), update (merge) or delete. Returns the stored
 * document (null after a delete) and records the change in tripChanges. Bad input throws Invalid.
 */
export async function writeTripDoc(
	db: DatabaseWriter,
	req: TripWriteRequest,
	who: TripWriter,
): Promise<{ doc: TripDoc | null }> {
	const tooLarge = tripWriteSizeError(req);
	if (tooLarge !== null) throw invalid(tooLarge);
	let id: string | null;
	try {
		id = checkTripWrite(req);
	} catch (error) {
		throw asInvalid(error);
	}
	const table = TRIP_TABLES[req.col];
	const row = id === null ? null : await findRow(db, req.col, id);
	const existing = row === null ? null : toTripDoc(row);
	if (req.op === 'delete') {
		if (row !== null) {
			await db.delete(table, row._id);
			await db.insert('tripChanges', { col: req.col, op: 'delete', id: row.id, ...who });
			if (req.col === 'tasks') {
				await deleteSteps(db, row.id, who);
				await syncTaskStatus(db, [parentOf(existing)], who);
			}
		}
		return { doc: null };
	}
	const creating = existing === null;
	const fields = normalizeTripFields(req.col, req.data ?? {}, {
		existing,
		creating: req.op === 'set' && creating,
		maxOrder: req.op === 'set' && creating ? maxOrder(await readOrders(db, req.col)) : 0,
	});
	let written: TripDoc | null;
	try {
		written = applyTripWrite({ ...req, data: fields }, existing);
	} catch (error) {
		throw asInvalid(error);
	}
	if (written === null) return { doc: null };
	const doc = storable(req.col, written);
	checkStorable(req.col, doc);
	if (req.col === 'tasks') await checkStep(db, doc);
	if (row === null) await db.insert(table, doc);
	else await db.replace(table, row._id, doc);
	await db.insert('tripChanges', { col: req.col, op: req.op, id: doc.id, data: fields, ...who });
	if (req.col === 'tasks') await syncTaskStatus(db, [parentOf(existing), parentOf(doc)], who);
	return { doc };
}

/** The id of the task a task is a step of ('' when it is not a step). */
function parentOf(doc: TripDoc | null): string {
	const parent = doc?.['parent'];
	return typeof parent === 'string' ? parent : '';
}

function taskState(doc: TripDoc): TaskState {
	const s = doc['status'];
	if (s === 'todo' || s === 'doing' || s === 'done') return s;
	return doc['done'] === true ? 'done' : 'todo';
}

/** Steps are one level deep: a step belongs to a stored task that is not a step itself, and has no steps. */
async function checkStep(db: DatabaseReader, doc: TripDoc): Promise<void> {
	const parent = parentOf(doc);
	if (parent === '') return;
	if (parent === doc.id) throw invalid('a task cannot be a step of itself');
	const tasks = await readCollection(db, 'tasks');
	const task = tasks.find((t) => t.id === parent);
	if (task === undefined) throw invalid(`no tasks document "${parent}"`);
	if (parentOf(task) !== '') throw invalid('a step cannot have steps of its own');
	if (tasks.some((t) => parentOf(t) === doc.id)) {
		throw invalid('a task with steps cannot become a step');
	}
}

/** Deleting a task deletes its steps. */
async function deleteSteps(db: DatabaseWriter, id: string, who: TripWriter): Promise<void> {
	const rows = await allRows(db, 'tripTasks');
	for (const step of rows.filter((r) => r.parent === id)) {
		await db.delete('tripTasks', step._id);
		await db.insert('tripChanges', { col: 'tasks', op: 'delete', id: step.id, ...who });
	}
}

/** A task with steps takes its status from them (statusFromSteps), after any write to one of its steps. */
async function syncTaskStatus(
	db: DatabaseWriter,
	parents: readonly string[],
	who: TripWriter,
): Promise<void> {
	for (const id of new Set(parents)) {
		if (id === '') continue;
		const rows = await allRows(db, 'tripTasks');
		const row = rows.find((r) => r.id === id);
		if (row === undefined) continue;
		const task = toTripDoc(row);
		const steps = rows.map(toTripDoc).filter((t) => parentOf(t) === id);
		const status = statusFromSteps(taskState(task), steps.map(taskState));
		if (status === null) continue;
		const data = { status, done: status === 'done' };
		await db.replace('tripTasks', row._id, { ...task, ...data });
		await db.insert('tripChanges', { col: 'tasks', op: 'update', id, data, ...who });
	}
}

async function readOrders(db: DatabaseReader, col: TripCollection): Promise<{ order?: number }[]> {
	const docs = await readCollection(db, col);
	return docs.map((d) => (typeof d['order'] === 'number' ? { order: d['order'] } : {}));
}

function asInvalid(error: unknown): Error {
	if (error instanceof TripWriteError) return invalid(error.message);
	return error instanceof Error ? error : new Error(String(error));
}
