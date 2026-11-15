// Which v1 file feeds which Convex table (plan section 4). The table names mirror apps/web/src/convex/tables/*.ts;
// @atr/migrate's schema test checks them against the schema loaded at runtime, so a rename there fails there.
import { COLLECTIONS, type Collection } from '../trip/constants.ts';
import { FEEDBACK_KINDS, type FeedbackKind } from './feedback-specs.ts';

export const EVENT_TABLES = {
	swipes: 'swipes',
	duels: 'duels',
	questions: 'questions',
	notes: 'notes',
	route: 'routes',
} as const satisfies Record<FeedbackKind, string>;
export type EventTable = (typeof EVENT_TABLES)[FeedbackKind];

export const TRIP_TABLES = {
	tasks: 'tripTasks',
	legs: 'tripLegs',
	bag: 'tripBag',
	budget: 'tripBudget',
	fixed: 'tripFixed',
	spend: 'tripSpend',
	settings: 'tripSettings',
	days: 'tripDays',
	visited: 'tripVisited',
} as const satisfies Record<Collection, `trip${string}`>;
export type TripTable = (typeof TRIP_TABLES)[Collection];

export type StateTable = 'gameState' | 'firstSeen';

/** Every table that holds traveler data and round-trips to v1. App-only tables are never exported. */
export type DataTable = EventTable | StateTable | TripTable;

/** The fixed load order: event logs, then game state, then trip (one atomic replace per table on import). */
export const DATA_TABLES: readonly DataTable[] = [
	...FEEDBACK_KINDS.map((kind) => EVENT_TABLES[kind]),
	'gameState',
	'firstSeen',
	...COLLECTIONS.map((col) => TRIP_TABLES[col]),
];

export const eventFile = (kind: FeedbackKind): string => `feedback/${kind}.jsonl`;
export const tripFile = (col: Collection): string => `trip/${col}.json`;
export const STATE_FILE = 'feedback/game-state.json';

/** Every v1 file, in a stable order (the order of exports, manifests and reports). */
export const V1_FILES: readonly string[] = [
	...FEEDBACK_KINDS.map(eventFile),
	STATE_FILE,
	...COLLECTIONS.map(tripFile),
];
