// Trip writes, ported from game/lib/tripstore.js writeDoc (same id rule, ops and null handling) plus the form
// shaping that game/public/trip.js submitEdit did in the browser (lines 697-731), so every writer (the app, the
// outbox, `./atr trip`) gets the same documents.
// The tripstore port stays here (it is the server's write path); RATES is @atr/shared's port of game/lib/trip.js.
import { RATES } from '@atr/shared/trip';
import type { TripCollection, TripOp } from '../../tables/validators';
import { omitKeys, omitNulls } from './object';

export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;

/** A trip field value as the forms and the files hold it. */
export type TripValue = string | number | boolean | null | string[];
export type TripFields = Record<string, TripValue>;
export type TripDoc = TripFields & { id: string };

export interface TripWriteRequest {
	col: TripCollection;
	op: TripOp;
	id?: string | null | undefined;
	data?: TripFields | undefined;
}

/** A refused write; the message is the old server's 400 text. */
export class TripWriteError extends Error {
	override readonly name = 'TripWriteError';
}

/** `x<base36 time><4 random>`, like the old server. */
export function newTripId(now: number = Date.now(), random: () => number = Math.random): string {
	return `x${now.toString(36)}${random().toString(36).slice(2, 6)}`;
}

/**
 * Request limits. The old server refused any request body over 64 KB (413 "body too large"); Convex accepts far
 * more, so trip writes carry the same cap here, plus per-field limits no real form comes near.
 */
export const TRIP_WRITE_LIMITS = {
	/** UTF-8 bytes of the JSON request ({ col, op, id, data }), the old body cap. */
	maxBytes: 65_536,
	/** Characters in one string field (or one list item). The longest real field (a leg plan) is under 3,000. */
	maxString: 10_000,
	/** Fields in `data`. The widest document (a leg) has under 40. */
	maxFields: 64,
	/** Items in a list field (legs.cities). */
	maxList: 100,
} as const;

const utf8Bytes = (s: string): number => new TextEncoder().encode(s).length;

/** Why a write is too large (the old 413 message first), or null when it fits. */
export function tripWriteSizeError(req: TripWriteRequest): string | null {
	const L = TRIP_WRITE_LIMITS;
	if (utf8Bytes(JSON.stringify(req)) > L.maxBytes) return 'body too large';
	const entries = Object.entries(req.data ?? {});
	if (entries.length > L.maxFields) return `too many fields (max ${String(L.maxFields)})`;
	for (const [key, value] of entries) {
		if (key.length > 64) return `field name too long: ${key.slice(0, 64)}…`;
		const strings = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
		if (Array.isArray(value) && value.length > L.maxList) {
			return `${key}: too many items (max ${String(L.maxList)})`;
		}
		if (strings.some((s) => s.length > L.maxString)) {
			return `${key}: too long (max ${String(L.maxString)} characters)`;
		}
	}
	return null;
}

/** The request checks writeDoc ran before touching a file. Returns the id to look up, or null for a new doc. */
export function checkTripWrite(req: TripWriteRequest): string | null {
	const id = req.id ?? null;
	if (id !== null && !ID_RE.test(id)) throw new TripWriteError('bad id');
	if (req.op !== 'delete' && req.data === undefined) {
		throw new TripWriteError('data must be an object');
	}
	if (req.op !== 'set' && id === null) throw new TripWriteError(`${req.op} needs an id`);
	return id;
}

/**
 * The document after one write (null after a delete), from the current document with that id (or null).
 * Mirrors writeDoc: `data.id` is ignored; update merges and drops null fields and fails on a missing id; set
 * creates or replaces whole; delete of a missing id is a no-op.
 */
export function applyTripWrite(
	req: TripWriteRequest,
	existing: TripDoc | null,
	newId: () => string = newTripId,
): TripDoc | null {
	const id = checkTripWrite(req);
	if (req.op === 'delete') return null;
	const fields = omitKeys(req.data ?? {}, ['id']);
	if (req.op === 'update') {
		if (existing === null) throw new TripWriteError(`no ${req.col} document "${id ?? ''}"`);
		return { ...omitNulls<TripValue>({ ...existing, ...fields }), id: existing.id };
	}
	return { id: id ?? newId(), ...fields };
}

/** Fields that hold an enum and so cannot be stored as "" (the form's empty select). days.status allows "". */
const ENUM_FIELDS: Partial<Record<TripCollection, readonly string[]>> = {
	tasks: ['status'],
	legs: ['type', 'status'],
	fixed: ['status'],
	spend: ['category'],
};

/**
 * Make a written document storable: null becomes absent (except legs.cities, which the schema keeps), and an
 * empty enum select becomes absent. Field order is kept.
 */
export function storable(col: TripCollection, doc: TripDoc): TripDoc {
	const out: TripFields = {};
	const enums = ENUM_FIELDS[col] ?? [];
	for (const [key, value] of Object.entries(doc)) {
		if (value === null && !(col === 'legs' && key === 'cities')) continue;
		if (value === '' && enums.includes(key)) continue;
		out[key] = value;
	}
	return { ...out, id: doc.id };
}

/** Collections whose documents carry `order` (the form skipped days and settings; visited has none). */
const ORDERED: ReadonlySet<TripCollection> = new Set([
	'tasks',
	'legs',
	'bag',
	'budget',
	'fixed',
	'spend',
]);

export interface NormalizeContext {
	/** The stored document with this id, or null. */
	existing: TripDoc | null;
	/** True when this write creates a new document. */
	creating: boolean;
	/** Highest `order` in the collection (0 when empty). */
	maxOrder: number;
}

const str = (x: TripValue | undefined): string => (typeof x === 'string' ? x : '');

/**
 * The form shaping that used to run in the browser, applied to the fields a write sends: IATA codes upper-cased
 * and a default title on flights; leg date and time parts joined; "a, b" cities split; task `done` mirrors status;
 * bag qty defaults to 1 and a new item is unpacked; `amountBRL` computed from RATES; a new document gets the
 * next `order`. Fields the write does not send are left alone, so a partial update stays partial.
 */
export function normalizeTripFields(
	col: TripCollection,
	input: TripFields,
	ctx: NormalizeContext,
): TripFields {
	let data: TripFields = { ...input };
	const merged = (key: string): TripValue | undefined =>
		key in data ? data[key] : ctx.existing?.[key];
	switch (col) {
		case 'legs':
			data = shapeLeg(data, merged, ctx);
			break;
		case 'tasks':
			if ('status' in data) data['done'] = data['status'] === 'done';
			break;
		case 'bag':
			if ('qty' in data) data['qty'] = toQty(data['qty']);
			else if (ctx.creating) data['qty'] = 1;
			if (ctx.creating && data['packed'] === undefined) data['packed'] = false;
			break;
		case 'spend': {
			const amount = merged('amount');
			if (('amount' in data || 'currency' in data) && typeof amount === 'number') {
				data['amountBRL'] = amountBRL(amount, str(merged('currency')));
			}
			break;
		}
		case 'budget':
		case 'fixed':
		case 'settings':
		case 'days':
		case 'visited':
			break;
	}
	if (ctx.creating && ORDERED.has(col) && data['order'] === undefined) {
		data['order'] = ctx.maxOrder + 1;
	}
	return data;
}

function shapeLeg(
	input: TripFields,
	merged: (key: string) => TripValue | undefined,
	ctx: NormalizeContext,
): TripFields {
	const data = omitKeys(input, ['startDate', 'startTime', 'endDate', 'endTime']);
	if ('startDate' in input || 'startTime' in input) data['start'] = joinDateTime(input, 'start');
	if ('endDate' in input || 'endTime' in input) data['end'] = joinDateTime(input, 'end');
	if (typeof data['city'] === 'string') {
		const cities = data['city']
			.split(/[,+]/)
			.map((s) => s.trim().toLowerCase())
			.filter((s) => s !== '');
		data['city'] = cities[0] ?? '';
		data['cities'] = cities.length > 1 ? cities : null;
	}
	const shaped = ctx.creating && data['cities'] === null ? omitKeys(data, ['cities']) : data;
	if (merged('type') === 'flight' && ('from' in shaped || 'to' in shaped)) {
		if (typeof shaped['from'] === 'string') shaped['from'] = shaped['from'].toUpperCase();
		if (typeof shaped['to'] === 'string') shaped['to'] = shaped['to'].toUpperCase();
		if (str(merged('title')) === '') {
			shaped['title'] = `${str(merged('from')).toUpperCase()} → ${str(merged('to')).toUpperCase()}`;
		}
	}
	return shaped;
}

function joinDateTime(data: TripFields, which: 'start' | 'end'): string {
	const date = str(data[`${which}Date`]);
	const time = str(data[`${which}Time`]);
	return date === '' ? '' : time === '' ? date : `${date}T${time}`;
}

function toQty(qty: TripValue | undefined): number {
	const n = typeof qty === 'number' ? qty : typeof qty === 'string' && qty !== '' ? Number(qty) : 0;
	return Number.isFinite(n) && n !== 0 ? n : 1;
}

/** BRL value of an amount, rounded to the cent (unknown currency counts as BRL). */
export function amountBRL(amount: number, currency: string): number {
	return Math.round(amount * (RATES[currency] ?? 1) * 100) / 100;
}

/** The highest `order` among documents (0 when none), as the form computed it. */
export function maxOrder(docs: readonly { order?: number | undefined }[]): number {
	return Math.max(0, ...docs.map((d) => d.order ?? 0));
}
