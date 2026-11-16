// Convex rows <-> v1 values (src/v1/rows.ts) and the export built on them (src/v1/export.ts, src/v1/bundle.ts).
// Rows are fed the way Convex hands them back: fields sorted by name at every depth, plus system fields (S14).
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { FEEDBACK_KINDS } from '../src/v1/feedback-specs.ts';
import { parseFeedbackLine, serialiseFeedbackLine } from '../src/v1/feedback.ts';
import { isJsonObject, type Json, type JsonObject } from '../src/v1/json.ts';
import {
	compareEventRows,
	eventToRow,
	rowsToState,
	rowToEvent,
	rowToTripDoc,
	stateToRows,
	tripDocToRow,
} from '../src/v1/rows.ts';
import { exportV1Files, jsonlText, jsonText } from '../src/v1/export.ts';
import { countOf, toBundle } from '../src/v1/bundle.ts';
import { DATA_TABLES, type DataTable } from '../src/v1/tables.ts';
import { readText, sampleFile } from './support.ts';

function sortKeysDeep(value: Json): Json {
	if (Array.isArray(value)) return value.map(sortKeysDeep);
	if (!isJsonObject(value)) return value;
	const out: JsonObject = {};
	for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep(value[key] ?? null);
	return out;
}

/** What Convex hands back: fields sorted by name, plus system fields. */
const asStored = (row: JsonObject, creation = 1): JsonObject => {
	const sorted = sortKeysDeep({ ...row, _id: 'x', _creationTime: creation });
	return isJsonObject(sorted) ? sorted : {};
};

describe('events', () => {
	const line = {
		v: 1,
		ts: '2026-11-10T09:00:00Z',
		session: 's',
		winner: 'a',
		loser: 'b',
		country: 'china',
		elo: { winner: 1550.2, loser: 1449.8 },
		x_mood: { tired: true },
	};

	test('x_ fields move into extra with seq, and come back last', () => {
		const row = eventToRow(line, 7);
		expect(row).toStrictEqual({
			v: 1,
			ts: line.ts,
			session: 's',
			winner: 'a',
			loser: 'b',
			country: 'china',
			elo: line.elo,
			seq: 7,
			extra: { x_mood: { tired: true } },
		});
		expect(JSON.stringify(rowToEvent('duels', asStored({ ...row, userId: 'u1' })))).toBe(
			JSON.stringify(line),
		);
	});

	test('writer key order for every kind, nested objects included', () => {
		const swipe = {
			v: 1,
			ts: 't',
			session: 's',
			round: 'place',
			id: 'a',
			verdict: 'must',
			country: 'japan',
			ms: 10,
		};
		expect(Object.keys(rowToEvent('swipes', asStored(eventToRow(swipe, 1))))).toStrictEqual(
			Object.keys(swipe),
		);
		const route = {
			v: 1,
			ts: 't',
			session: 's',
			country: 'china',
			stops: [{ area: 'x', nights: 2, name: 'X', lat: 1, lng: 2 }],
		};
		expect(JSON.stringify(rowToEvent('route', asStored(eventToRow(route, 1))))).toBe(
			JSON.stringify(route),
		);
	});

	test('rowToEvent(stored row) is what serialiseFeedbackLine writes, for every real line', () => {
		let checked = 0;
		for (const kind of FEEDBACK_KINDS) {
			const file = sampleFile('feedback', `${kind}.jsonl`);
			if (!fs.existsSync(file)) continue;
			for (const raw of readText(file).split('\n')) {
				if (raw.trim() === '') continue;
				const parsed = parseFeedbackLine(kind, raw);
				const value = JSON.parse(raw) as Json;
				if (!parsed.ok || !isJsonObject(value)) throw new Error(`${file}: bad sample line`);
				expect(JSON.stringify(rowToEvent(kind, asStored(eventToRow(value, 1))))).toBe(
					serialiseFeedbackLine(kind, parsed.value),
				);
				checked += 1;
			}
		}
		expect(checked).toBeGreaterThan(30);
	});

	test('export order: imported rows by seq, then new rows by creation time', () => {
		const rows = [
			{ ts: 'b', _creationTime: 5 },
			{ ts: 'a', seq: 2, _creationTime: 2 },
			{ ts: 'z', seq: 1, _creationTime: 1 },
			{ ts: 'a', _creationTime: 4 },
		];
		expect(rows.sort(compareEventRows).map((r) => r._creationTime)).toStrictEqual([1, 2, 4, 5]);
	});
});

describe('trip', () => {
	test('nulls drop except legs.cities, and key order follows the files', () => {
		expect(tripDocToRow('tasks', { id: 'a', note: null, title: 'T' })).toStrictEqual({
			row: { id: 'a', title: 'T' },
			droppedNulls: ['note'],
		});
		expect(tripDocToRow('legs', { id: 'l', cities: null })).toStrictEqual({
			row: { id: 'l', cities: null },
			droppedNulls: [],
		});
		const flight = {
			id: 'f',
			type: 'flight',
			status: 'booked',
			from: 'GRU',
			to: 'PVG',
			start: 's',
			order: 1,
			tzEnd: 8,
		};
		const stay = {
			id: 's',
			type: 'stay',
			country: 'china',
			city: 'harbin',
			title: 'T',
			start: 's',
			status: 'planned',
			order: 2,
		};
		expect(Object.keys(rowToTripDoc('legs', asStored(flight)))).toStrictEqual(Object.keys(flight));
		expect(Object.keys(rowToTripDoc('legs', asStored(stay)))).toStrictEqual(Object.keys(stay));
	});
});

describe('game state', () => {
	test('splits into gameState + firstSeen rows and rebuilds the same file', () => {
		const file = {
			v: 1,
			firstRun: '2026-11-01T00:00:00Z',
			firstSeen: { z: 't1', a: 't2' },
			days: { japan: 11, china: 25 },
			locks: { nye: 'p' },
		};
		const r = stateToRows(file);
		if (!r.ok) throw new Error(r.error);
		expect(r.rows.firstSeen).toStrictEqual([
			{ key: 'z', ts: 't1' },
			{ key: 'a', ts: 't2' },
		]);
		const rebuilt = rowsToState(
			asStored(r.rows.gameState),
			r.rows.firstSeen.map((row, i) => asStored(row, i)),
		);
		// days come back in country order (china before japan); firstSeen keeps creation order.
		expect(jsonText(rebuilt)).toBe(jsonText({ ...file, days: { china: 25, japan: 11 } }));
	});

	test('readState defaults; unknown fields are refused', () => {
		const r = stateToRows({ firstSeen: { a: 't' } });
		expect(r.ok && r.rows.gameState).toStrictEqual({ v: 1, firstRun: null, days: {}, locks: {} });
		expect(stateToRows({ v: 1, extra: 1 })).toStrictEqual({
			ok: false,
			error: 'unknown field(s): extra',
		});
		expect(rowsToState(null, [])).toStrictEqual({
			v: 1,
			firstRun: null,
			firstSeen: {},
			days: {},
			locks: {},
		});
	});
});

test('text: LF line endings, two-space JSON with a final newline', () => {
	expect(jsonlText([{ a: 1 }, { b: 'é' }])).toBe('{"a":1}\n{"b":"é"}\n');
	expect(jsonText([])).toBe('[]\n');
	expect(jsonText({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}\n');
});

describe('exportV1Files and toBundle', () => {
	const tables = (rows: Partial<Record<DataTable, JsonObject[]>>) => (table: DataTable) =>
		Promise.resolve((rows[table] ?? []).map((row, i) => asStored(row, i + 1)));

	test('an empty deployment gives all 15 files, readable by the old site', async () => {
		const files = await exportV1Files(tables({}));
		expect(files.size).toBe(15);
		expect(files.get('feedback/route.jsonl')).toBe('');
		expect(files.get('trip/tasks.json')).toBe('[]\n');
		expect(files.get('feedback/game-state.json')).toBe(
			jsonText({ v: 1, firstRun: null, firstSeen: {}, days: {}, locks: {} }),
		);
		expect(DATA_TABLES).toHaveLength(16);
	});

	test('new-app rows follow imported ones; a record the codec would refuse throws', async () => {
		const swipe = {
			v: 1,
			ts: '2026-11-10T09:00:00Z',
			session: 's',
			round: 'place',
			id: 'a',
			verdict: 'must',
		};
		const files = await exportV1Files(
			tables({
				swipes: [
					{ ...swipe, id: 'new', userId: 'u' },
					{ ...swipe, seq: 1 },
				],
			}),
		);
		expect(files.get('feedback/swipes.jsonl')).toBe(jsonlText([swipe, { ...swipe, id: 'new' }]));
		await expect(
			exportV1Files(tables({ swipes: [{ ...swipe, verdict: 'nope' }] })),
		).rejects.toThrow('feedback/swipes.jsonl record 1');
		await expect(exportV1Files(tables({ tripTasks: [{ id: 'a', bogus: 1 }] }))).rejects.toThrow(
			'[0].bogus: unknown field',
		);
	});

	test('the bundle states each file count and sha256', async () => {
		const files = await exportV1Files(
			tables({ firstSeen: [{ key: 'a', ts: 't' }], tripTasks: [{ id: 'a', title: 'A' }] }),
		);
		const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
		const bundle = await toBundle(files, sha, '2026-11-15T12:00:00Z');
		expect(bundle.format).toBe('atr-v1-bundle');
		expect(bundle.files['trip/tasks.json']).toMatchObject({ count: 1 });
		expect(bundle.files['feedback/game-state.json']?.count).toBe(1);
		for (const [path, f] of Object.entries(bundle.files)) {
			expect(f.sha256, path).toBe(sha(f.content));
			expect(countOf(path, f.content), path).toBe(f.count);
		}
	});
});
