// Typed views of the trip documents trip.all returns (each a loose record: every field optional, as the forms
// write them). The adapters keep only values of the expected type, so a hand-edited file can never crash a view.
import type { TripDoc, TripValue } from '#convex/lib/logic/trip.js';
import type { TripCollection } from '#convex/tables/validators.js';

export type { TripDoc, TripValue, TripCollection };

/** trip.all: every collection, each in stored order. */
export type TripAll = Record<TripCollection, TripDoc[]>;

export interface TripLeg {
	id: string;
	type?: string;
	status?: string;
	title?: string;
	start?: string;
	end?: string;
	note?: string;
	carrier?: string;
	flight?: string;
	cabin?: string;
	from?: string;
	to?: string;
	fromName?: string;
	toName?: string;
	duration?: string;
	country?: string;
	city?: string;
	cities?: string[] | null;
	host?: string;
	checkIn?: string;
	checkOut?: string;
	address?: string;
	mode?: string;
	fromPlace?: string;
	toPlace?: string;
	plan?: string;
	ref?: string;
	link?: string;
	order?: number;
	tz?: number | string;
	tzStart?: number | string;
	tzEnd?: number | string;
	/** A stay: the id of the stay card that was booked (its pin on the city map). */
	place?: string;
	/** A stay: the booked bed's pin when it has no card. */
	lat?: number;
	lng?: number;
	/** A stay: the hub id (config/hubs.yaml) the traveler arrives at / leaves from when no flight or transfer says. */
	arrive?: string;
	leave?: string;
}

export interface TripDay {
	/** YYYY-MM-DD */
	id: string;
	status?: string;
	holiday?: string;
	note?: string;
}

const LEG_STRINGS = [
	'type',
	'status',
	'title',
	'start',
	'end',
	'note',
	'carrier',
	'flight',
	'cabin',
	'from',
	'to',
	'fromName',
	'toName',
	'duration',
	'country',
	'city',
	'host',
	'checkIn',
	'checkOut',
	'address',
	'mode',
	'fromPlace',
	'toPlace',
	'plan',
	'ref',
	'link',
	'place',
	'arrive',
	'leave',
] as const satisfies readonly (keyof TripLeg)[];

type LegStringKey = (typeof LEG_STRINGS)[number];

const isNumOrStr = (v: TripValue | undefined): v is number | string =>
	typeof v === 'number' || typeof v === 'string';

export function asLeg(doc: TripDoc): TripLeg {
	const out: TripLeg = { id: doc.id };
	for (const k of LEG_STRINGS) {
		const v = doc[k];
		if (typeof v === 'string') out[k satisfies LegStringKey] = v;
	}
	const cities = doc['cities'];
	if (Array.isArray(cities)) out.cities = cities;
	else if (cities === null) out.cities = null;
	const order = doc['order'];
	if (typeof order === 'number') out.order = order;
	for (const k of ['tz', 'tzStart', 'tzEnd'] as const) {
		const v = doc[k];
		if (isNumOrStr(v)) out[k] = v;
	}
	for (const k of ['lat', 'lng'] as const) {
		const v = doc[k];
		if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
	}
	return out;
}

export function asDay(doc: TripDoc): TripDay {
	const out: TripDay = { id: doc.id };
	for (const k of ['status', 'holiday', 'note'] as const) {
		const v = doc[k];
		if (typeof v === 'string') out[k] = v;
	}
	return out;
}
