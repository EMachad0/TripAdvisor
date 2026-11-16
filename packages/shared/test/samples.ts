// Inputs for the parity and port tests: the real feedback/ files (through the v1 codec, so both sides get the same
// typed documents), the trip config and the fixture areas.
import path from 'node:path';
import type { RouteArea } from '../src/route.ts';
import { parseFeedbackJsonl, type FeedbackKind, type FeedbackRecord } from '../src/v1.ts';
import { FIXTURES, legacy, readText, ROOT, sampleFile } from './support.ts';
import fs from 'node:fs';

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

/** The fixture area files (with coordinates), as the platform loads them. */
export async function fixtureAreas(): Promise<RouteArea[]> {
	const { loadAreas } = await legacy<{ loadAreas: (o: object) => RouteArea[] }>(
		'platform/lib/load.js',
	);
	return loadAreas({ root: FIXTURES, includeFixtures: true });
}
