// Reading whole tables. The data is small (hundreds of rows per table, plan section 1), so functions read a
// table in one go with a hard cap instead of paginating; the cap fails loudly rather than truncating silently.
import type { Doc, TableNames } from '../_generated/dataModel';
import type { DatabaseReader } from '../_generated/server';

/** Far above any table today (notes: 660). Reaching it means pagination is due. */
export const MAX_ROWS = 8000;

/** Every row of a table in insertion order. Throws if the table outgrew MAX_ROWS. */
export async function allRows<T extends TableNames>(
	db: DatabaseReader,
	table: T,
): Promise<Doc<T>[]> {
	const rows = await db.query(table).take(MAX_ROWS + 1);
	if (rows.length > MAX_ROWS) {
		throw new Error(`${table} has more than ${String(MAX_ROWS)} rows; paginate this read`);
	}
	return rows;
}

interface EventRow {
	seq?: number | undefined;
	_creationTime: number;
}

/**
 * v1 file order of event rows: imported rows by source line (`seq`), then rows written since, in insertion
 * order. The derive functions then sort by `ts` and use this order for ties, as the old code used file order.
 */
export function inFileOrder<T extends EventRow>(rows: readonly T[]): T[] {
	return [...rows].sort(
		(a, b) =>
			(a.seq ?? Number.POSITIVE_INFINITY) - (b.seq ?? Number.POSITIVE_INFINITY) ||
			a._creationTime - b._creationTime,
	);
}

export type EventTable = 'swipes' | 'duels' | 'notes' | 'routes' | 'questions';

/** All rows of an event table in v1 file order. */
export async function eventsInFileOrder(
	db: DatabaseReader,
	table: 'swipes',
): Promise<Doc<'swipes'>[]>;
export async function eventsInFileOrder(
	db: DatabaseReader,
	table: 'duels',
): Promise<Doc<'duels'>[]>;
export async function eventsInFileOrder(
	db: DatabaseReader,
	table: 'notes',
): Promise<Doc<'notes'>[]>;
export async function eventsInFileOrder(
	db: DatabaseReader,
	table: 'routes',
): Promise<Doc<'routes'>[]>;
export async function eventsInFileOrder(
	db: DatabaseReader,
	table: 'questions',
): Promise<Doc<'questions'>[]>;
export async function eventsInFileOrder(
	db: DatabaseReader,
	table: EventTable,
): Promise<Doc<EventTable>[]>;
export async function eventsInFileOrder(
	db: DatabaseReader,
	table: EventTable,
): Promise<Doc<EventTable>[]> {
	return inFileOrder(await allRows(db, table));
}

/** A document without its Convex system fields. */
export function withoutSystemFields<T extends { _id: unknown; _creationTime: number }>(
	doc: T,
): Omit<T, '_id' | '_creationTime'> {
	const rest = Object.fromEntries(
		Object.entries(doc).filter(([key]) => key !== '_id' && key !== '_creationTime'),
	);
	// Object.fromEntries loses the field types; the entries are exactly T's minus the two system fields.
	return rest as Omit<T, '_id' | '_creationTime'>;
}
