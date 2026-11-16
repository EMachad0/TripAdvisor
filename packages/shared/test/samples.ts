// Inputs for the parity tests: the real trip/ and feedback/ files (through the v1 codec, so both sides get the
// same typed documents), the game's view of the fixture places, the trip config and the fixture areas.
import path from 'node:path';
import type { BoardCountry, BoardPlace } from '../src/board.ts';
import type { RouteArea } from '../src/route.ts';
import type { Collection } from '../src/trip/constants.ts';
import type { TripPlace } from '../src/trip/types.ts';
import { parseFeedbackJsonl, type FeedbackKind, type FeedbackRecord } from '../src/v1.ts';
import { parseTripFile } from '../src/v1/trip.ts';
import type { TripRecord } from '../src/v1/trip-types.ts';
import { FIXTURES, legacy, readText, ROOT, sampleFile, tmpDir } from './support.ts';
import fs from 'node:fs';

/** A real trip collection (empty when the file is missing). Fails loudly if the codec rejects it. */
export function tripDocs<C extends Collection>(col: C): TripRecord<C>[] {
	const file = sampleFile('trip', `${col}.json`);
	if (!fs.existsSync(file)) return [];
	const r = parseTripFile(col, readText(file));
	if (!r.ok) throw new Error(`${col}.json: ${r.errors.join('; ')}`);
	return r.value.docs;
}

/** Real feedback records of one kind. Fails loudly if any line is rejected. */
export function feedbackRecords<K extends FeedbackKind>(kind: K): FeedbackRecord<K>[] {
	const file = sampleFile('feedback', `${kind}.jsonl`);
	if (!fs.existsSync(file)) return [];
	const { records, bad } = parseFeedbackJsonl(kind, readText(file));
	if (bad.length > 0) throw new Error(`${kind}.jsonl: ${JSON.stringify(bad)}`);
	return records.map((r) => r.record);
}

/** config/trip.yaml as parsed, before route normalising (a fresh object every call). */
export async function readConfig(): Promise<Record<string, unknown>> {
	const { parseYamlText } = await legacy<{ parseYamlText: (t: string) => { data: unknown } }>(
		'platform/lib/yamlio.js',
	);
	const { data } = parseYamlText(readText(path.join(ROOT, 'config/trip.yaml')));
	if (typeof data !== 'object' || data === null) throw new Error('config/trip.yaml is not a map');
	return data as Record<string, unknown>;
}

export type GamePlace = BoardPlace & TripPlace;

export interface FixtureState {
	countries: (BoardCountry & { cities: string[] })[];
	places: GamePlace[];
	categories: Record<string, { label: string }>;
	interests: string[];
	dominantShare: number;
}

/** What GET /api/state returns for the fixture places (no feedback yet), built by the old game server. */
export async function fixtureState(): Promise<FixtureState> {
	const { createApp } = await legacy<{
		createApp: (o: Record<string, string>) => { state: (o: { write: boolean }) => FixtureState };
	}>('game/server.js');
	const dir = tmpDir();
	const app = createApp({
		root: FIXTURES,
		feedbackDir: path.join(dir, 'fb'),
		tripDir: path.join(dir, 'trip'),
		assetsDir: path.join(dir, 'assets'),
	});
	return app.state({ write: false });
}

/** The fixture area files (with coordinates), as the platform loads them. */
export async function fixtureAreas(): Promise<RouteArea[]> {
	const { loadAreas } = await legacy<{ loadAreas: (o: object) => RouteArea[] }>(
		'platform/lib/load.js',
	);
	return loadAreas({ root: FIXTURES, includeFixtures: true });
}
