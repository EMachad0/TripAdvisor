// What the trip maths reads. Documents come from trip/<collection>.json (see ../v1/trip-types.ts for the stored
// shapes); places are the game's cards. Every field is optional because the forms omit fields freely.

export interface Leg {
	readonly id?: string | undefined;
	readonly type?: string | undefined;
	readonly status?: string | undefined;
	readonly title?: string | undefined;
	/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM", local to the place. */
	readonly start?: string | undefined;
	readonly end?: string | undefined;
	readonly country?: string | undefined;
	readonly city?: string | undefined;
	readonly cities?: readonly string[] | null | undefined;
	readonly from?: string | undefined;
	readonly to?: string | undefined;
	readonly tz?: number | string | undefined;
	readonly tzStart?: number | string | undefined;
	readonly tzEnd?: number | string | undefined;
	readonly order?: number | undefined;
}

export interface TripPlace {
	readonly id: string;
	readonly name?: string | null | undefined;
	readonly short?: string | null | undefined;
	readonly name_local?: string | null | undefined;
	readonly country?: string | null | undefined;
	readonly city?: string | undefined;
	readonly cityName?: string | null | undefined;
	readonly area?: string | null | undefined;
	readonly category?: string | null | undefined;
	readonly kind?: string | null | undefined;
	readonly tags?: readonly string[] | undefined;
	readonly why?: string | null | undefined;
	readonly note?: string | null | undefined;
	readonly verdict?: string | null | undefined;
	readonly rating?: number | null | undefined;
	readonly days?: readonly ({ readonly from?: string; readonly to?: string } | null)[] | undefined;
	readonly loc?: LatLng | null | undefined;
}

export interface LatLng {
	readonly lat: number;
	readonly lng: number;
}

export interface Task {
	readonly id?: string;
	readonly status?: string | undefined;
	readonly done?: boolean | undefined;
	readonly order?: number | undefined;
	/** The task this one is a step of. */
	readonly parent?: string | undefined;
	/** YYYY-MM-DD: first day it can be done, and the last day to do it. */
	readonly opens?: string | undefined;
	readonly due?: string | undefined;
}

export interface DayDoc {
	readonly id: string;
	readonly status?: string | undefined;
}

export interface IdDoc {
	readonly id: string;
}

/** A budget row with the days of its country added (the trip page joins them from the config). */
export interface BudgetRow {
	readonly bed?: number | string | undefined;
	readonly food?: number | string | undefined;
	readonly other?: number | string | undefined;
	readonly days?: number | string | undefined;
}

/** How close a place is to the cities you sleep in: your city, a day trip, or too far. */
export type ReachKind = 'here' | 'near' | 'far';
