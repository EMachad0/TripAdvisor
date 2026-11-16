// Typed reads of trip.all documents (each a loose record of form fields, as the old trip/*.json files held them).
// Shared by the Money and Prep screens. Pure, so the views stay testable without a backend.
import type { TripDoc, TripValue } from '#convex/lib/logic/trip.js';
import type { TripCollection } from '#convex/tables/validators.js';

export type { TripDoc, TripValue };

/** What trip.all returns: every collection, each in stored order. */
export type TripData = Record<TripCollection, TripDoc[]>;

/** A string field ('' when missing or not a string). */
export function str(doc: TripDoc | null | undefined, key: string): string {
	const v = doc?.[key];
	return typeof v === 'string' ? v : '';
}

/** A number field as the old pages read it: `Number(v) || 0`. */
export function num(doc: TripDoc | null | undefined, key: string): number {
	const v = doc?.[key];
	if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
	if (typeof v === 'string') return Number(v) || 0;
	return 0;
}

/** A boolean field (true only for `true`). */
export function flag(doc: TripDoc | null | undefined, key: string): boolean {
	return doc?.[key] === true;
}

/** The old byOrder: `order`, then title or item. */
export function byOrder(a: TripDoc, b: TripDoc): number {
	return (
		num(a, 'order') - num(b, 'order') ||
		(str(a, 'title') || str(a, 'item')).localeCompare(str(b, 'title') || str(b, 'item'))
	);
}

/** A collection sorted by byOrder (a copy). */
export const sortedByOrder = (docs: readonly TripDoc[]): TripDoc[] => [...docs].sort(byOrder);
