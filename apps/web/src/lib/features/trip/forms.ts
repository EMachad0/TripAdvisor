// The trip edit forms as data (game/public/trip.js SCHEMA, openEdit and submitEdit): fields per collection, the
// values a form opens with, and the trip.write request a submit makes. The server (normalizeTripFields) does the
// rest of the old shaping: leg date + time joined, "a, b" cities split, IATA codes upper-cased, order, done.
import { RATES, dayKey, timeOf } from '@atr/shared/trip';
import { fmtDay } from './format.ts';
import type { TripCollection, TripDoc, TripValue } from './types.ts';

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'time' | 'select';

export interface FormField {
	key: string;
	label: string;
	type: FieldType;
	/** Spans the whole form width. */
	full?: true;
	/** Leg kinds that show the field: f flight, s stay, t transport (absent: always shown). */
	show?: string;
	options?: readonly { value: string; label: string }[];
	/** A text field's suggestions (a datalist): typing anything else is still fine. */
	suggest?: readonly { value: string; label: string }[];
	/** A number that may be left empty: empty clears it instead of sending 0 (a stay's lat / lng). */
	optional?: true;
}

/** The collections that have a form (visited is a tick, not a form). */
export type FormCollection = Exclude<TripCollection, 'visited'>;

/** What a form edits: a collection and a document id (null: a new document; days and settings carry their id). */
export interface FormTarget {
	col: FormCollection;
	id: string | null;
}

export interface FormSchema {
	/** "stop", "day", "cost": the noun in "Add stop". */
	name: string;
	fields: readonly FormField[];
}

const opts = (spec: string): { value: string; label: string }[] =>
	spec.split(',').map((o) => {
		const [value = '', label = ''] = o.split('=');
		return { value, label };
	});

const CURRENCIES = Object.keys(RATES).map((c) => ({ value: c, label: c }));

const f = (
	key: string,
	label: string,
	type: FieldType,
	extra: Pick<FormField, 'full' | 'show' | 'options' | 'suggest' | 'optional'> = {},
): FormField => ({ key, label, type, ...extra });

/** A stay card a stay leg can point to (`place`): the booked bed's pin on the city map. */
export interface StayCardOption {
	id: string;
	name: string;
	city: string;
	cityName: string;
}

/** An airport or station (config/hubs.yaml) a leg can name: a stay's Arrive at / Leave from, a leg's From / To. */
export interface HubOption {
	id: string;
	code: string | null;
	name: string;
	city: string;
}

/** The form fields of every collection, in the old order and with the old labels. */
export function tripSchema(
	countries: readonly { id: string; name: string }[],
	stayCards: readonly StayCardOption[] = [],
	hubs: readonly HubOption[] = [],
): Record<FormCollection, FormSchema> {
	const hubLabel = (h: HubOption): string => (h.code === null ? h.name : `${h.name} (${h.code})`);
	const hubPick = (none: string) => [
		{ value: '', label: none },
		...hubs.map((h) => ({ value: h.id, label: hubLabel(h) })),
	];
	// A flight names its airports by code, a train by the station's id: both count on the city map.
	const hubSuggest = hubs.map((h) => ({ value: h.code ?? h.id, label: hubLabel(h) }));
	const country = [
		{ value: '', label: 'Not set' },
		{ value: 'brazil', label: 'Brazil' },
		...countries.map((c) => ({ value: c.id, label: c.name })),
	];
	return {
		tasks: {
			name: 'task',
			fields: [
				f('title', 'Task', 'text', { full: true }),
				f('status', 'Status', 'select', { options: opts('todo=To do,doing=In progress,done=Done') }),
				f('opens', 'Opens on (first day)', 'date'),
				f('due', 'Do by (last day)', 'date'),
				f('note', 'Notes', 'textarea', { full: true }),
			],
		},
		legs: {
			name: 'stop',
			fields: [
				f('type', 'Kind', 'select', {
					options: opts('flight=Flight,stay=Stay,transport=Train / bus / transfer,note=Note'),
				}),
				f('status', 'Status', 'select', {
					options: opts(
						'booked=Booked,planned=To book,later=Book later (near the date),onday=On the day (no booking),tbd=Not fixed yet',
					),
				}),
				f('title', 'Title (city or stay name)', 'text', { full: true }),
				f('startDate', 'Start date', 'date'),
				f('startTime', 'Start time, local there (leave time for transfers)', 'time'),
				f('endDate', 'End date', 'date'),
				f('endTime', 'End time, local there (arrival airport for flights)', 'time'),
				f('country', 'Country', 'select', { show: 's', options: country }),
				f('city', 'City id, as on the cards (e.g. osaka)', 'text', { show: 's' }),
				f('place', 'Stay card (the booked bed, pinned on the city map)', 'select', {
					show: 's',
					options: [
						{ value: '', label: 'No card' },
						...stayCards.map((c) => ({ value: c.id, label: `${c.name} (${c.cityName})` })),
					],
				}),
				f('arrive', 'Arrive at (when no flight or train leg says)', 'select', {
					show: 's',
					options: hubPick('Not set'),
				}),
				f('leave', 'Leave from (when no flight or train leg says)', 'select', {
					show: 's',
					options: hubPick('Not set'),
				}),
				f('host', 'Host', 'text', { show: 's' }),
				f('address', 'Address', 'text', { full: true, show: 's' }),
				f('lat', 'Latitude (the bed, when it has no card)', 'number', {
					show: 's',
					optional: true,
				}),
				f('lng', 'Longitude', 'number', { show: 's', optional: true }),
				f('checkIn', 'Check-in from (local time)', 'time', { show: 's' }),
				f('checkOut', 'Checkout by (local time)', 'time', { show: 's' }),
				f('mode', 'Mode (Uber, taxi, train…)', 'text', { show: 't' }),
				f('from', 'From (airport code or station)', 'text', { show: 'ft', suggest: hubSuggest }),
				f('to', 'To (airport code or station)', 'text', { show: 'ft', suggest: hubSuggest }),
				f('fromName', 'From (short name)', 'text', { show: 'ft' }),
				f('toName', 'To (short name)', 'text', { show: 'ft' }),
				f('fromPlace', 'Pickup address', 'text', { full: true, show: 't' }),
				f('toPlace', 'Drop-off address', 'text', { full: true, show: 't' }),
				f(
					'plan',
					'Plan: one step per line, e.g. "12:30 Request Uber". Start a line with ! to highlight it',
					'textarea',
					{ full: true, show: 't' },
				),
				f('carrier', 'Airline', 'text', { show: 'f' }),
				f('flight', 'Flight number', 'text', { show: 'f' }),
				f('cabin', 'Cabin', 'text', { show: 'f' }),
				f('duration', 'Duration', 'text', { show: 'ft' }),
				f('ref', 'Booking reference', 'text', { full: true }),
				f('link', 'Booking or ticket link', 'text', { full: true }),
				f('note', 'Notes', 'textarea', { full: true }),
			],
		},
		bag: {
			name: 'item',
			fields: [
				f('item', 'Item', 'text', { full: true }),
				f('category', 'Category', 'text'),
				f('qty', 'Quantity', 'number'),
				f('note', 'Notes', 'textarea', { full: true }),
			],
		},
		budget: {
			name: 'country budget',
			fields: [
				f('country', 'Country', 'select', { options: country }),
				f('currency', 'Currency', 'select', { options: CURRENCIES }),
				f('bed', 'Bed per night (R$)', 'number'),
				f('food', 'Food per day (R$)', 'number'),
				f('other', 'Other per day (R$)', 'number'),
				f('pay', 'How to pay', 'textarea', { full: true }),
			],
		},
		fixed: {
			name: 'cost',
			fields: [
				f('title', 'Cost', 'text', { full: true }),
				f('amount', 'Amount (R$)', 'number'),
				f('status', 'Status', 'select', { options: opts('topay=To pay,paid=Paid,estimate=Estimate') }),
				f('note', 'Notes', 'textarea', { full: true }),
			],
		},
		spend: {
			name: 'expense',
			fields: [
				f('note', 'What', 'text', { full: true }),
				f('amount', 'Amount', 'number'),
				f('currency', 'Currency', 'select', { options: CURRENCIES }),
				f('category', 'Type', 'select', { options: opts('bed=Bed,food=Food,other=Other') }),
				f('country', 'Country', 'select', { options: country }),
				f('date', 'Date', 'date'),
			],
		},
		settings: {
			name: 'budget',
			fields: [
				f('cap', 'Trip budget cap (R$)', 'number'),
				f('tips', 'How money works', 'textarea', { full: true }),
			],
		},
		days: {
			name: 'day',
			fields: [
				f('status', 'Work or vacation', 'select', {
					options: opts('=Not set,work=Work,vacation=Vacation,off=Day off (weekend, holiday)'),
				}),
				f('holiday', 'Holiday in Brazil', 'text'),
				f('note', 'Events and notes', 'textarea', { full: true }),
			],
		},
	};
}

/**
 * The options a per-city select offers (the Stay card, Arrive at and Leave from of a stay): those of the cities
 * typed in the form ("kyoto, osaka"), plus the one already chosen. Every option when no city is typed yet.
 */
export function optionsForCities(
	options: readonly { value: string; label: string }[],
	items: readonly { id: string; city: string }[],
	cityField: string,
	chosen: string,
): { value: string; label: string }[] {
	const cities = cityField
		.split(/[,+]/)
		.map((c) => c.trim().toLowerCase())
		.filter((c) => c !== '');
	const cityOf = new Map(items.map((c) => [c.id, c.city]));
	return options.filter(
		(o) =>
			o.value === '' ||
			o.value === chosen ||
			cities.length === 0 ||
			cities.includes(cityOf.get(o.value) ?? ''),
	);
}

/** Whether a leg field shows for the chosen kind (the old data-show / applyShow). */
export function fieldShown(field: FormField, legType: string): boolean {
	if (field.show === undefined) return true;
	const k = ({ flight: 'f', stay: 's', transport: 't' } as Record<string, string>)[legType] ?? '-';
	return field.show.includes(k);
}

/** Form values: every field as the string its input holds. */
export type FormValues = Record<string, string>;

const asText = (v: TripValue | undefined): string =>
	v === undefined || v === null ? '' : Array.isArray(v) ? v.join(', ') : String(v);

export interface OpenContext {
	/** Today (YYYY-MM-DD), for a new expense's date. */
	today: string;
	/** The budget you are in, for a new expense's country and currency. */
	currentBudget?: { country?: string; currency?: string } | null;
}

/** The values a form opens with (openEdit): the document's fields, or the defaults of a new one. */
export function initialValues(
	col: FormCollection,
	schema: FormSchema,
	doc: TripDoc | null,
	ctx: OpenContext,
): FormValues {
	const x: Record<string, TripValue | undefined> = { ...(doc ?? {}) };
	if (col === 'legs') {
		const start = typeof x['start'] === 'string' ? x['start'] : '';
		const end = typeof x['end'] === 'string' ? x['end'] : '';
		x['startDate'] = dayKey(start);
		x['startTime'] = timeOf(start);
		x['endDate'] = dayKey(end);
		x['endTime'] = timeOf(end);
		if (doc === null) {
			x['type'] = 'stay';
			x['status'] = 'planned';
		}
		const cities = x['cities'];
		if (Array.isArray(cities) && cities.length > 0) x['city'] = cities.join(', ');
	}
	if (col === 'tasks') {
		x['status'] =
			typeof x['status'] === 'string' && x['status'] !== ''
				? x['status']
				: x['done'] === true
					? 'done'
					: 'todo';
	}
	if (col === 'spend' && doc === null) {
		x['date'] = ctx.today;
		x['category'] = 'food';
		x['country'] = ctx.currentBudget?.country ?? '';
		x['currency'] = ctx.currentBudget?.currency ?? 'BRL';
	}
	const out: FormValues = {};
	for (const field of schema.fields) {
		let v = asText(x[field.key]);
		// A select shows its first option when the stored value is not one of them (as a browser <select> did).
		if (field.options && !field.options.some((o) => o.value === v)) v = field.options[0]?.value ?? '';
		out[field.key] = v;
	}
	return out;
}

/** The form heading: the day for a day, else "Add stop" / "Edit stop". */
export const formTitle = (
	col: FormCollection,
	schema: FormSchema,
	id: string | null,
	exists: boolean,
): string => (col === 'days' ? fmtDay(id ?? '') : `${exists ? 'Edit' : 'Add'} ${schema.name}`);

/** The field a document cannot be saved without (null: none). */
const MAIN: Record<FormCollection, string | null> = {
	tasks: 'title',
	legs: 'title',
	bag: 'item',
	budget: 'country',
	fixed: 'title',
	spend: 'amount',
	settings: 'cap',
	days: null,
};

export interface TripWriteArgs {
	col: TripCollection;
	op: 'set' | 'update' | 'delete';
	id?: string;
	data?: Record<string, TripValue>;
}

export type SubmitResult = { ok: true; args: TripWriteArgs } | { ok: false; message: string };

const LEG_PAIRS = [
	['startDate', 'startTime'],
	['endDate', 'endTime'],
] as const;

/**
 * A form value as trimmed text. A number input bound with bind:value holds a number (or null when empty) at run
 * time, whatever FormValues says, so this never assumes a string.
 */
const text = (v: string | number | null | undefined): string =>
	v === null || v === undefined ? '' : String(v).trim();

/**
 * The trip.write a submit makes (submitEdit). A new document sends every field; an edit sends only the fields
 * that changed (plan section 11: one writer, last write wins, partial updates), keeping each leg date with its time.
 * Returns the old message when the main field is empty. `null` from an unchanged edit: nothing to send.
 */
export function submitArgs(
	col: FormCollection,
	schema: FormSchema,
	id: string | null,
	exists: boolean,
	values: FormValues,
	initial: FormValues,
): SubmitResult | null {
	const data: Record<string, TripValue> = {};
	for (const field of schema.fields) {
		const raw = text(values[field.key]);
		data[field.key] =
			field.type === 'number'
				? raw === ''
					? field.optional
						? null
						: 0
					: Number(raw)
				: raw;
	}
	const numbersOk = schema.fields.every(
		(fl) => fl.type !== 'number' || data[fl.key] === null || Number.isFinite(data[fl.key]),
	);
	if (!numbersOk) return { ok: false, message: 'Type a number.' };
	const isFlight = col === 'legs' && data['type'] === 'flight';
	if (isFlight && data['title'] === '') {
		data['title'] = `${String(data['from']).toUpperCase()} → ${String(data['to']).toUpperCase()}`;
	}
	const main = MAIN[col];
	if (main !== null) {
		const v = data[main];
		if (v === '' || v === 0) {
			return { ok: false, message: col === 'spend' ? 'Enter the amount first.' : 'Give it a name first.' };
		}
	}
	if (!exists) {
		const args: TripWriteArgs = { col, op: 'set', data };
		if (id !== null) args.id = id;
		return { ok: true, args };
	}
	const changed: Record<string, TripValue> = {};
	for (const field of schema.fields) {
		const before = text(initial[field.key]);
		const after = text(values[field.key]);
		// null (an optional number emptied) is sent as null: the server drops the field.
		const v = data[field.key];
		if (before !== after) changed[field.key] = v === undefined ? '' : v;
	}
	if (col === 'legs') {
		for (const pair of LEG_PAIRS) {
			if (pair.some((k) => k in changed)) for (const k of pair) changed[k] = data[k] ?? '';
		}
	}
	if (Object.keys(changed).length === 0) return null;
	return { ok: true, args: { col, op: 'update', id: id ?? '', data: changed } };
}
