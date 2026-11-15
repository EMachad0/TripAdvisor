// Singletons the feature functions share: the content index (ids that mutations validate against) and the
// game state (days, locks, firstRun) with its firstSeen rows.
import type { Doc } from '../_generated/dataModel';
import type { DatabaseReader, DatabaseWriter } from '../_generated/server';
import { domainError } from './errors';
import { allRows } from './rows';

export type ContentIndex = Doc<'contentIndex'>;

/** The content index published by trip-web, or a NoContent error. */
export async function requireContentIndex(db: DatabaseReader): Promise<ContentIndex> {
	const index = await db.query('contentIndex').first();
	if (index === null) {
		throw domainError(
			'NoContent',
			'The site has not published its content index yet. Try again shortly.',
		);
	}
	return index;
}

export type ContentPlace = ContentIndex['places'][number];
export type ContentArea = ContentIndex['areas'][number];

export function findPlace(index: ContentIndex, id: string): ContentPlace | undefined {
	return index.places.find((p) => p.id === id);
}

export function findArea(index: ContentIndex, id: string): ContentArea | undefined {
	return index.areas.find((a) => a.id === id);
}

/** The place or area a swipe or note is about. */
export function findCard(
	index: ContentIndex,
	round: 'area' | 'place',
	id: string,
): ContentPlace | ContentArea | undefined {
	return round === 'area' ? findArea(index, id) : findPlace(index, id);
}

export interface GameStateValue {
	firstRun: string | null;
	days: Record<string, number>;
	locks: Record<string, string>;
}

const EMPTY_STATE: GameStateValue = { firstRun: null, days: {}, locks: {} };

/** The game state singleton, or the empty state the old readState returned for a missing file. */
export async function readGameState(db: DatabaseReader): Promise<GameStateValue> {
	const row = await db.query('gameState').first();
	if (row === null) return { ...EMPTY_STATE, days: {}, locks: {} };
	return { firstRun: row.firstRun, days: { ...row.days }, locks: { ...row.locks } };
}

/** Replace fields of the game state singleton, creating it on first write. */
export async function patchGameState(
	db: DatabaseWriter,
	patch: Partial<GameStateValue>,
): Promise<GameStateValue> {
	const row = await db.query('gameState').first();
	if (row === null) {
		const created = { v: 1 as const, ...EMPTY_STATE, ...patch };
		await db.insert('gameState', created);
		return { firstRun: created.firstRun, days: created.days, locks: created.locks };
	}
	await db.patch('gameState', row._id, patch);
	return {
		firstRun: patch.firstRun !== undefined ? patch.firstRun : row.firstRun,
		days: patch.days ?? row.days,
		locks: patch.locks ?? row.locks,
	};
}

/** firstSeen rows in first-seen (insertion) order. */
export async function firstSeenRows(db: DatabaseReader): Promise<Doc<'firstSeen'>[]> {
	return await allRows(db, 'firstSeen');
}
