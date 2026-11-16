// Which v1 file feeds which Convex table: the shared v1 codec owns the mapping (@atr/shared v1/tables.ts), the
// import, the export and the bundle all read it from there. schema.test.ts checks it against the schema loaded
// at runtime, so a table rename in apps/web fails here.
import { v1 } from '@atr/shared';

export {
	DATA_TABLES,
	EVENT_TABLES,
	eventFile,
	STATE_FILE,
	TRIP_TABLES,
	tripFile,
	V1_FILES,
	type DataTable,
	type EventTable,
	type StateTable,
	type TripTable,
} from '@atr/shared/v1';

/** Feedback event kinds, in FEEDBACK_SPECS order. */
export const EVENT_KINDS = v1.FEEDBACK_KINDS;
export type EventKind = v1.FeedbackKind;

/** The nine trip collections in the old store's order (game/lib/trip.js COLLECTIONS). */
export {
	COLLECTIONS as TRIP_COLLECTIONS,
	type Collection as TripCollection,
} from '@atr/shared/trip';
