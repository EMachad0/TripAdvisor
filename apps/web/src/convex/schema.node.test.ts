// Every field in the real feedback/ and trip/ files has a home in the schema (plan section 4). Reads the repo
// copies by default; ATR_SAMPLE_ROOT=<dir with feedback/ and trip/> checks another snapshot (e.g. a live pull).
import fs from 'node:fs';
import path from 'node:path';
import { validate } from 'convex-helpers/validators';
import { describe, expect, test } from 'vitest';
import schema from './schema';
import { TRIP_COLLECTIONS, TRIP_TABLES } from './tables/validators';

const root = path.resolve(
	process.env['ATR_SAMPLE_ROOT'] ?? path.join(import.meta.dirname, '../../../..'),
);

type Json = Record<string, unknown>;
const isRecord = (x: unknown): x is Json =>
	typeof x === 'object' && x !== null && !Array.isArray(x);

function readJsonl(file: string): Json[] {
	if (!fs.existsSync(file)) return [];
	return fs
		.readFileSync(file, 'utf8')
		.split('\n')
		.filter((line) => line.trim() !== '')
		.map((line): unknown => JSON.parse(line))
		.filter(isRecord);
}

/** The import transform for an event line: seq = line number, x_* fields into `extra`. */
function toEventRow(line: Json, seq: number): Json {
	const row: Json = { seq };
	const extra: Json = {};
	for (const [key, value] of Object.entries(line)) {
		if (key.startsWith('x_')) extra[key] = value;
		else row[key] = value;
	}
	if (Object.keys(extra).length > 0) row['extra'] = extra;
	return row;
}

function errorsOf(table: keyof typeof schema.tables, rows: Json[]): string[] {
	const { validator } = schema.tables[table];
	return rows.flatMap((row, i) => {
		try {
			validate(validator, row, { throw: true });
			return [];
		} catch (error) {
			return [`${table}[${String(i)}]: ${String(error)}`];
		}
	});
}

describe(`sample data under ${root}`, () => {
	const feedbackTables = {
		swipes: 'swipes',
		duels: 'duels',
		notes: 'notes',
		route: 'routes',
		questions: 'questions',
	} as const;

	for (const [file, table] of Object.entries(feedbackTables)) {
		test(`feedback/${file}.jsonl fits ${table}`, () => {
			const rows = readJsonl(path.join(root, 'feedback', `${file}.jsonl`)).map((line, i) =>
				toEventRow(line, i + 1),
			);
			expect(errorsOf(table, rows)).toEqual([]);
		});
	}

	test('an x_ field round-trips through extra', () => {
		const row = toEventRow(
			{
				v: 1,
				ts: '2026-11-15T10:00:00Z',
				session: 's',
				round: 'place',
				id: 'a',
				verdict: 'must',
				x_mood: { a: 1 },
			},
			1,
		);
		expect(errorsOf('swipes', [row])).toEqual([]);
		expect(row['extra']).toEqual({ x_mood: { a: 1 } });
	});

	test('feedback/game-state.json fits gameState and firstSeen', () => {
		const file = path.join(root, 'feedback', 'game-state.json');
		const state: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
		if (!isRecord(state)) throw new Error('game-state.json is not an object');
		const { firstSeen, ...rest } = state;
		expect(Object.keys(state).sort()).toEqual(['days', 'firstRun', 'firstSeen', 'locks', 'v']);
		expect(errorsOf('gameState', [rest])).toEqual([]);
		const seenRows = Object.entries(isRecord(firstSeen) ? firstSeen : {}).map(([key, ts]) => ({
			key,
			ts,
		}));
		expect(seenRows.length).toBeGreaterThan(0);
		expect(errorsOf('firstSeen', seenRows)).toEqual([]);
	});

	for (const col of TRIP_COLLECTIONS) {
		test(`trip/${col}.json fits ${TRIP_TABLES[col]}`, () => {
			const raw: unknown = JSON.parse(
				fs.readFileSync(path.join(root, 'trip', `${col}.json`), 'utf8'),
			);
			const docs = (Array.isArray(raw) ? raw : []).filter(isRecord);
			expect(errorsOf(TRIP_TABLES[col], docs)).toEqual([]);
		});
	}
});
