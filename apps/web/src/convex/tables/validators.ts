// Shared validators and vocabularies for the schema (plan section 4). The value lists mirror the old stack:
// COUNTRY_IDS from platform/lib/schema/enums.js, verdicts and rounds from FEEDBACK_SPECS
// (platform/lib/feedback/index.js), trip enums from the trip form in game/public/trip.js.
import { COUNTRY_IDS } from '@atr/shared/schema/enums';
import { COLLECTIONS as TRIP_COLLECTIONS } from '@atr/shared/trip';
import { TRIP_TABLES } from '@atr/shared/v1';
import { literals } from 'convex-helpers/validators';
import { v, type Infer } from 'convex/values';

// The country, collection and table vocabularies are @atr/shared's, so the schema, the codec and the app agree.
export { COUNTRY_IDS, TRIP_COLLECTIONS, TRIP_TABLES };

export const ROUNDS = ['area', 'place'] as const;
export const VERDICTS = ['must', 'maybe', 'skip'] as const;
export const ROLES = ['owner', 'guest'] as const;

export const country = literals(...COUNTRY_IDS);
export const round = literals(...ROUNDS);
export const verdict = literals(...VERDICTS);
export const role = literals(...ROLES);
export const tripCollection = literals(...TRIP_COLLECTIONS);
export const tripOp = literals('set', 'update', 'delete');

export type Country = Infer<typeof country>;
export type Round = Infer<typeof round>;
export type Verdict = Infer<typeof verdict>;
export type Role = Infer<typeof role>;
export type TripCollection = (typeof TRIP_COLLECTIONS)[number];
export type TripOp = Infer<typeof tripOp>;

/**
 * `x_`-prefixed fields of a v1 feedback line (platform/lib/schema/dsl.js). The codec moves them here on import
 * and spreads them back on export-v1, unchanged; their values are arbitrary JSON, hence `v.any()`.
 */
export const extraFields = v.optional(v.record(v.string(), v.any()));

/** Fields every event row carries. */
export const eventFields = {
	v: v.literal(1),
	ts: v.string(),
	/** Source line number on imported rows; equal-ts order is seq, then _creationTime. */
	seq: v.optional(v.number()),
	/** Better Auth user id, audit only, never exported. */
	userId: v.optional(v.string()),
	extra: extraFields,
};

/** One stop of a country route (platform/lib/route.js ROUTE_STOP_SPEC). */
export const routeStop = v.object({
	area: v.string(),
	nights: v.optional(v.number()),
	name: v.optional(v.string()),
	lat: v.optional(v.number()),
	lng: v.optional(v.number()),
});
export type RouteStop = Infer<typeof routeStop>;

/** A field that is a number in some documents and a string in others (leg time zones). */
export const numberOrString = v.union(v.number(), v.string());
