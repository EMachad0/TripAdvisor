// v1 trip documents: one element of trip/<collection>.json. Every field but `id` is optional because the trip
// forms omit fields or send "". The field lists mirror apps/web/src/convex/tables/trip.ts.
import type { Collection } from '../trip/constants.ts';
import type { Extra } from './json.ts';

/** How a field is checked. */
export type FieldKind =
	| 'string'
	| 'number'
	| 'boolean'
	| 'numberOrString'
	/** A list of city ids, or null (kept: the form sends it on update). */
	| 'cities'
	| { readonly enum: readonly string[] };

const S = 'string',
	N = 'number',
	B = 'boolean';

/** The fields of each collection besides `id`. */
export const TRIP_FIELDS = {
	tasks: {
		title: S,
		note: S,
		status: { enum: ['todo', 'doing', 'done'] },
		order: N,
		suggested: B,
		done: B,
	},
	legs: {
		type: { enum: ['flight', 'stay', 'transport', 'note'] },
		status: { enum: ['booked', 'planned', 'later', 'onday', 'tbd'] },
		title: S,
		start: S,
		end: S,
		note: S,
		carrier: S,
		flight: S,
		cabin: S,
		from: S,
		to: S,
		fromName: S,
		toName: S,
		duration: S,
		country: S,
		city: S,
		host: S,
		checkIn: S,
		checkOut: S,
		address: S,
		mode: S,
		fromPlace: S,
		toPlace: S,
		plan: S,
		ref: S,
		link: S,
		cities: 'cities',
		order: N,
		tz: 'numberOrString',
		tzStart: 'numberOrString',
		tzEnd: 'numberOrString',
	},
	bag: { category: S, item: S, note: S, qty: N, order: N, packed: B },
	budget: { country: S, currency: S, pay: S, bed: N, food: N, other: N, order: N },
	fixed: {
		title: S,
		note: S,
		amount: N,
		order: N,
		status: { enum: ['paid', 'topay', 'estimate'] },
	},
	spend: {
		note: S,
		currency: S,
		country: S,
		date: S,
		category: { enum: ['bed', 'food', 'other'] },
		amount: N,
		amountBRL: N,
		order: N,
	},
	settings: { cap: N, tips: S },
	days: { status: { enum: ['work', 'vacation', 'off', ''] }, note: S, holiday: S },
	visited: { at: S },
} as const satisfies Record<Collection, Readonly<Record<string, FieldKind>>>;

type ValueOf<K> = K extends 'string'
	? string
	: K extends 'number'
		? number
		: K extends 'boolean'
			? boolean
			: K extends 'numberOrString'
				? number | string
				: K extends 'cities'
					? string[] | null
					: K extends { readonly enum: readonly (infer E)[] }
						? E
						: never;

/** A document of collection C. */
export type TripRecord<C extends Collection = Collection> = {
	id: string;
} & { -readonly [F in keyof (typeof TRIP_FIELDS)[C]]?: ValueOf<(typeof TRIP_FIELDS)[C][F]> } & {
	extra?: Extra;
};

export type TripTask = TripRecord<'tasks'>;
export type TripLeg = TripRecord<'legs'>;
export type TripBag = TripRecord<'bag'>;
export type TripBudget = TripRecord<'budget'>;
export type TripFixed = TripRecord<'fixed'>;
export type TripSpend = TripRecord<'spend'>;
export type TripSettings = TripRecord<'settings'>;
export type TripDay = TripRecord<'days'>;
export type TripVisited = TripRecord<'visited'>;
