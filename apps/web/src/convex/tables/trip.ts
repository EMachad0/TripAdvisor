// Trip tables, from trip/<col>.json (plan section 4). Every document has a string `id` (unique, enforced in the
// mutation) and every other field is optional, because the trip forms omit fields or send "". Field lists cover
// every field in the repo data and every field the trip form in game/public/trip.js can write.
// The `id` index is named by_doc_id: Convex reserves the index name `by_id` (the plan's name).
import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { literals } from 'convex-helpers/validators';
import { numberOrString } from './validators';

const opt = v.optional;
const str = () => v.optional(v.string());
const num = () => v.optional(v.number());
const bool = () => v.optional(v.boolean());

export const tripTasks = defineTable({
	id: v.string(),
	title: str(),
	note: str(),
	status: opt(literals('todo', 'doing', 'done')),
	order: num(),
	suggested: bool(),
	/** Mirrors status === 'done' (written by the form). */
	done: bool(),
}).index('by_doc_id', ['id']);

export const tripLegs = defineTable({
	id: v.string(),
	type: opt(literals('flight', 'stay', 'transport', 'note')),
	status: opt(literals('booked', 'planned', 'later', 'onday', 'tbd')),
	title: str(),
	/** YYYY-MM-DD or YYYY-MM-DDTHH:MM, local time at the place. */
	start: str(),
	end: str(),
	note: str(),
	carrier: str(),
	flight: str(),
	cabin: str(),
	from: str(),
	to: str(),
	fromName: str(),
	toName: str(),
	duration: str(),
	/** A country id or another country (e.g. brazil); not limited to the trip countries. */
	country: str(),
	city: str(),
	host: str(),
	checkIn: str(),
	checkOut: str(),
	address: str(),
	mode: str(),
	fromPlace: str(),
	toPlace: str(),
	plan: str(),
	ref: str(),
	link: str(),
	/** Several city ids for one stay; null is kept (the form sends it on update). */
	cities: opt(v.union(v.array(v.string()), v.null())),
	order: num(),
	tz: opt(numberOrString),
	tzStart: opt(numberOrString),
	tzEnd: opt(numberOrString),
}).index('by_doc_id', ['id']);

export const tripBag = defineTable({
	id: v.string(),
	category: str(),
	item: str(),
	note: str(),
	qty: num(),
	order: num(),
	packed: bool(),
}).index('by_doc_id', ['id']);

export const tripBudget = defineTable({
	id: v.string(),
	country: str(),
	currency: str(),
	pay: str(),
	/** BRL per night / per day. */
	bed: num(),
	food: num(),
	other: num(),
	order: num(),
}).index('by_doc_id', ['id']);

export const tripFixed = defineTable({
	id: v.string(),
	title: str(),
	note: str(),
	amount: num(),
	order: num(),
	status: opt(literals('paid', 'topay', 'estimate')),
}).index('by_doc_id', ['id']);

export const tripSpend = defineTable({
	id: v.string(),
	note: str(),
	currency: str(),
	country: str(),
	/** YYYY-MM-DD. */
	date: str(),
	category: opt(literals('bed', 'food', 'other')),
	amount: num(),
	/** Computed in the mutation from the shared RATES. */
	amountBRL: num(),
	order: num(),
}).index('by_doc_id', ['id']);

/** One document, id `main`. */
export const tripSettings = defineTable({
	id: v.string(),
	cap: num(),
	tips: str(),
}).index('by_doc_id', ['id']);

/** id is YYYY-MM-DD. */
export const tripDays = defineTable({
	id: v.string(),
	status: opt(literals('work', 'vacation', 'off', '')),
	note: str(),
	holiday: str(),
}).index('by_doc_id', ['id']);

/** id is a place id. */
export const tripVisited = defineTable({
	id: v.string(),
	at: str(),
}).index('by_doc_id', ['id']);
