// The add / edit forms of the Money and Prep screens (port of game/public/trip.js SCHEMA, openEdit and submitEdit
// for tasks, bag, budget, fixed, spend and settings). Pure: field lists, starting values and the write each submit
// makes. The rest of the old form shaping (done mirrors status, bag qty and packed, order, amountBRL) runs in the
// trip.write mutation (convex/lib/logic/trip.ts normalizeTripFields).
import { RATES } from '@atr/shared/trip';
import type { ContentCountry } from '#lib/content/types.js';
import type { TripDoc, TripValue } from '../trip-docs.ts';

export type RecordCol = 'tasks' | 'bag' | 'budget' | 'fixed' | 'spend' | 'settings';

/** What the add / edit sheet is open on. */
export interface RecordTarget {
	col: RecordCol;
	/** The document to edit; null adds one (settings always edits "main"). */
	id: string | null;
	/** Fields a new document gets besides the form's (a step's `parent`). */
	preset?: Record<string, string>;
}

export interface SelectOption {
	value: string;
	label: string;
}

export interface FieldDef {
	key: string;
	label: string;
	type: 'text' | 'textarea' | 'number' | 'date' | 'select';
	/** A line under the field. */
	hint?: string;
	/** Takes the whole row of the form grid. */
	full?: boolean;
	options?: readonly SelectOption[];
}

export interface RecordSchema {
	/** "task", "item", "cost"... for "Add task" and "Edit task". */
	name: string;
	fields: readonly FieldDef[];
	/** The field that must not be empty, and the message when it is. */
	required: { key: string; message: string } | null;
}

const NAME_FIRST = 'Give it a name first.';

const parse = (spec: string): SelectOption[] =>
	spec.split(',').map((o) => {
		const [value = '', label = ''] = o.split('=');
		return { value, label };
	});

export const CURRENCY_OPTIONS: readonly SelectOption[] = Object.keys(RATES).map((c) => ({
	value: c,
	label: c,
}));

/** "Not set", Brazil, then the trip countries (old countrySel). */
export function countryOptions(countries: readonly ContentCountry[]): SelectOption[] {
	return [
		{ value: '', label: 'Not set' },
		{ value: 'brazil', label: 'Brazil' },
		...countries.map((c) => ({ value: c.id, label: c.name })),
	];
}

export function recordSchema(col: RecordCol, countries: readonly ContentCountry[]): RecordSchema {
	switch (col) {
		case 'tasks':
			return {
				name: 'task',
				required: { key: 'title', message: NAME_FIRST },
				fields: [
					{ key: 'title', label: 'Task', type: 'text', full: true },
					{
						key: 'status',
						label: 'Status',
						type: 'select',
						options: parse('todo=To do,doing=In progress,done=Done'),
					},
					{ key: 'opens', label: 'Opens on (first day)', type: 'date' },
					{ key: 'due', label: 'Do by (last day)', type: 'date' },
					{
						key: 'note',
						label: 'Notes',
						type: 'textarea',
						full: true,
						hint: 'Start a line with - for a list. `PN6595` makes a code you can copy, **words** stand out.',
					},
				],
			};
		case 'bag':
			return {
				name: 'item',
				required: { key: 'item', message: NAME_FIRST },
				fields: [
					{ key: 'item', label: 'Item', type: 'text', full: true },
					{ key: 'category', label: 'Category', type: 'text' },
					{ key: 'qty', label: 'Quantity', type: 'number' },
					{ key: 'note', label: 'Notes', type: 'textarea', full: true },
				],
			};
		case 'budget':
			return {
				name: 'country budget',
				required: { key: 'country', message: NAME_FIRST },
				fields: [
					{ key: 'country', label: 'Country', type: 'select', options: countryOptions(countries) },
					{ key: 'currency', label: 'Currency', type: 'select', options: CURRENCY_OPTIONS },
					{ key: 'bed', label: 'Bed per night (R$)', type: 'number' },
					{ key: 'food', label: 'Food per day (R$)', type: 'number' },
					{ key: 'other', label: 'Other per day (R$)', type: 'number' },
					{ key: 'pay', label: 'How to pay', type: 'textarea', full: true },
				],
			};
		case 'fixed':
			return {
				name: 'cost',
				required: { key: 'title', message: NAME_FIRST },
				fields: [
					{ key: 'title', label: 'Cost', type: 'text', full: true },
					{ key: 'amount', label: 'Amount (R$)', type: 'number' },
					{
						key: 'status',
						label: 'Status',
						type: 'select',
						options: parse('topay=To pay,paid=Paid,estimate=Estimate'),
					},
					{ key: 'note', label: 'Notes', type: 'textarea', full: true },
				],
			};
		case 'spend':
			return {
				name: 'expense',
				required: { key: 'amount', message: 'Enter the amount first.' },
				fields: [
					{ key: 'note', label: 'What', type: 'text', full: true },
					{ key: 'amount', label: 'Amount', type: 'number' },
					{ key: 'currency', label: 'Currency', type: 'select', options: CURRENCY_OPTIONS },
					{
						key: 'category',
						label: 'Type',
						type: 'select',
						options: parse('bed=Bed,food=Food,other=Other'),
					},
					{ key: 'country', label: 'Country', type: 'select', options: countryOptions(countries) },
					{ key: 'date', label: 'Date', type: 'date' },
				],
			};
		case 'settings':
			return {
				name: 'budget',
				required: { key: 'cap', message: NAME_FIRST },
				fields: [
					{ key: 'cap', label: 'Trip budget cap (R$)', type: 'number' },
					{ key: 'tips', label: 'How money works', type: 'textarea', full: true },
				],
			};
	}
}

/** Form values: every field as the text its input holds. */
export type FormValues = Record<string, string>;

/** Where a new expense starts: today, food, and the country you are in (or go to next) with its currency. */
export interface NewSpendDefaults {
	today: string;
	country: string;
	currency: string;
}

const asText = (v: TripValue | undefined): string =>
	v === undefined || v === null ? '' : Array.isArray(v) ? v.join(', ') : String(v);

/**
 * The form's starting values: the stored document's fields, or a new document's defaults (old openEdit). A task
 * shows its effective status (old statusOf); a select with no stored value shows its first option, as a browser
 * select does.
 */
export function initialValues(
	schema: RecordSchema,
	col: RecordCol,
	doc: TripDoc | null,
	spendDefaults: NewSpendDefaults,
): FormValues {
	const values: FormValues = {};
	for (const f of schema.fields) values[f.key] = asText(doc?.[f.key]);
	if (col === 'tasks') {
		values['status'] = taskStatus(doc);
	}
	if (col === 'spend' && doc === null) {
		values['date'] = spendDefaults.today;
		values['category'] = 'food';
		values['country'] = spendDefaults.country;
		values['currency'] = spendDefaults.currency || 'BRL';
	}
	for (const f of schema.fields) {
		const opts = f.options;
		if (f.type === 'select' && opts !== undefined && !opts.some((o) => o.value === values[f.key])) {
			values[f.key] = opts[0]?.value ?? '';
		}
	}
	return values;
}

/** A task's status: the stored one, else done or to do from the old `done` flag. */
export function taskStatus(doc: TripDoc | null | undefined): 'todo' | 'doing' | 'done' {
	const s = doc?.['status'];
	if (s === 'todo' || s === 'doing' || s === 'done') return s;
	return doc?.['done'] === true ? 'done' : 'todo';
}

export type SubmitResult =
	| { ok: false; message: string }
	/** Nothing to send: an edit that changed no field. */
	| { ok: true; data: null }
	| { ok: true; data: Record<string, string | number> };

/**
 * The fields a submit writes (old submitEdit): strings trimmed, numbers from text ('' is 0), the required field
 * checked. A new document sends every field; an edit sends only the fields that changed (plan section 11: last
 * write wins, changed fields only).
 */
export function submitData(
	schema: RecordSchema,
	values: FormValues,
	initial: FormValues | null,
): SubmitResult {
	const data: Record<string, string | number> = {};
	for (const f of schema.fields) {
		const text = (values[f.key] ?? '').trim();
		data[f.key] = f.type === 'number' ? (text === '' ? 0 : Number(text)) : text;
	}
	const req = schema.required;
	if (req !== null) {
		const v = data[req.key];
		if (v === undefined || v === '' || v === 0 || Number.isNaN(v)) {
			return { ok: false, message: req.message };
		}
	}
	for (const f of schema.fields) {
		const v = data[f.key];
		if (typeof v === 'number' && !Number.isFinite(v)) {
			return { ok: false, message: `${f.label}: enter a number.` };
		}
	}
	if (initial === null) return { ok: true, data };
	const changed: Record<string, string | number> = {};
	for (const f of schema.fields) {
		const before = (initial[f.key] ?? '').trim();
		const now = (values[f.key] ?? '').trim();
		const v = data[f.key];
		if (v !== undefined && before !== now) changed[f.key] = v;
	}
	return Object.keys(changed).length === 0 ? { ok: true, data: null } : { ok: true, data: changed };
}

/** The distinct bag categories, for the category suggestions (old datalist). */
export function bagCategories(bag: readonly TripDoc[]): string[] {
	const out: string[] = [];
	for (const b of bag) {
		const c = b['category'];
		if (typeof c === 'string' && c !== '' && !out.includes(c)) out.push(c);
	}
	return out;
}
