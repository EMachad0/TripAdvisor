// The v1 export: GET /ops/export behind the hashed token, the manifest, and a lossless round trip of the repo's
// sample feedback/ and trip/ files (imported as the migration tool will: seq = line number, x_* into extra).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { v1 } from '@atr/shared';
import { sha256Hex } from './lib/sha256';
import { countRows, world, type World } from './test.helpers';
import { newTest } from './test.setup';
import { TRIP_COLLECTIONS, TRIP_TABLES } from './tables/validators';

const sampleFeedback = import.meta.glob<string>('../../../../feedback/*.{jsonl,json}', {
	query: '?raw',
	import: 'default',
	eager: true,
});
const sampleTrip = import.meta.glob<string>('../../../../trip/*.json', {
	query: '?raw',
	import: 'default',
	eager: true,
});
const sample = (dir: 'feedback' | 'trip', file: string): string => {
	const text = (dir === 'feedback' ? sampleFeedback : sampleTrip)[`../../../../${dir}/${file}`];
	if (text === undefined) throw new Error(`no sample ${dir}/${file}`);
	return text;
};

const TOKEN = 'export-token-for-tests';
let w: World;
beforeEach(async () => {
	vi.stubEnv('EXPORT_TOKEN_SHA256', await sha256Hex(TOKEN));
	w = await world(newTest());
});
afterEach(() => {
	vi.unstubAllEnvs();
});

const get = (token: string | null = TOKEN) =>
	w.t.fetch('/ops/export', { headers: token === null ? {} : { Authorization: `Bearer ${token}` } });

/** The bundle, plus each file's text by path (the shape most assertions want). */
async function exportBundle(): Promise<{ bundle: v1.Bundle; files: Record<string, string> }> {
	const res = await get();
	expect(res.status).toBe(200);
	expect(res.headers.get('Cache-Control')).toBe('no-store');
	const bundle = (await res.json()) as v1.Bundle;
	const files = Object.fromEntries(Object.entries(bundle.files).map(([p, f]) => [p, f.content]));
	return { bundle, files };
}

type Json = Record<string, unknown>;
const lines = (text: string): Json[] =>
	text
		.split('\n')
		.filter((l) => l.trim() !== '')
		.map((l) => JSON.parse(l) as Json);

/** Canonical JSON: keys sorted at every level (the rollback gate compares canonical hashes, S14). */
function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (typeof value === 'object' && value !== null) {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k, v]) => [k, canonical(v)]),
		);
	}
	return value;
}

describe('GET /ops/export', () => {
	test('refuses a missing or wrong token, and answers 503 when no hash is set', async () => {
		expect((await get(null)).status).toBe(401);
		expect((await get('nope')).status).toBe(401);
		vi.stubEnv('EXPORT_TOKEN_SHA256', '');
		expect((await get()).status).toBe(503);
	});

	test('an empty deployment exports empty files and the empty game state', async () => {
		const { files } = await exportBundle();
		expect(Object.keys(files).sort()).toEqual(
			[
				'feedback/duels.jsonl',
				'feedback/game-state.json',
				'feedback/notes.jsonl',
				'feedback/questions.jsonl',
				'feedback/route.jsonl',
				'feedback/swipes.jsonl',
				...TRIP_COLLECTIONS.map((c) => `trip/${c}.json`),
			].sort(),
		);
		expect(files['feedback/swipes.jsonl']).toBe('');
		expect(files['trip/tasks.json']).toBe('[]\n');
		expect(JSON.parse(files['feedback/game-state.json'] ?? '')).toEqual({
			v: 1,
			firstRun: null,
			firstSeen: {},
			days: {},
			locks: {},
		});
	});

	test('the bundle gives each file its count and sha256, in the format ./atr pull reads', async () => {
		await w.owner.mutation(api.feedback.swipe, {
			round: 'place',
			id: 'yu-garden',
			verdict: 'must',
			clientOpId: w.op(),
		});
		await w.owner.mutation(api.trip.write, {
			col: 'tasks',
			op: 'set',
			id: 'a',
			data: { title: 'Ä' },
			clientOpId: w.op(),
		});
		const { bundle } = await exportBundle();
		expect(bundle.format).toBe('atr-v1-bundle');
		expect(bundle.version).toBe(1);
		expect(bundle.generatedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
		for (const f of Object.values(bundle.files)) expect(f.sha256).toBe(await sha256Hex(f.content));
		expect(bundle.files['feedback/swipes.jsonl']?.count).toBe(1);
		expect(bundle.files['trip/tasks.json']?.count).toBe(1);
		expect(bundle.files['feedback/notes.jsonl']?.count).toBe(0);
	});

	test('new lines use the old writer key order; userId and seq are never exported', async () => {
		await w.owner.mutation(api.feedback.swipe, {
			round: 'place',
			id: 'yu-garden',
			verdict: 'must',
			ms: 5,
			clientOpId: w.op(),
		});
		await w.owner.mutation(api.decide.duel, {
			winner: 'yu-garden',
			loser: 'the-bund',
			clientOpId: w.op(),
		});
		await w.owner.mutation(api.route.save, {
			country: 'china',
			stops: [{ area: 'suzhou', nights: 1 }],
			clientOpId: w.op(),
		});
		const { files } = await exportBundle();
		const swipe = lines(files['feedback/swipes.jsonl'] ?? '')[0] ?? {};
		expect(Object.keys(swipe)).toEqual([
			'v',
			'ts',
			'session',
			'round',
			'id',
			'verdict',
			'country',
			'ms',
		]);
		const duel = lines(files['feedback/duels.jsonl'] ?? '')[0] ?? {};
		expect(Object.keys(duel)).toEqual(['v', 'ts', 'session', 'winner', 'loser', 'country', 'elo']);
		expect(Object.keys(duel['elo'] as Json)).toEqual(['winner', 'loser']);
		const route = lines(files['feedback/route.jsonl'] ?? '')[0] ?? {};
		expect(route['stops']).toEqual([
			{ area: 'suzhou', nights: 1, name: 'Suzhou', lat: 31.3, lng: 120.6 },
		]);
		expect(Object.keys((route['stops'] as Json[])[0] ?? {})).toEqual([
			'area',
			'nights',
			'name',
			'lat',
			'lng',
		]);
		expect(files['feedback/swipes.jsonl']).not.toMatch(/userId|"seq"/);
	});

	test('is read-only', async () => {
		const before = await countRows(w.t, 'appliedOps');
		await exportBundle();
		expect(await countRows(w.t, 'appliedOps')).toBe(before);
		expect(await countRows(w.t, 'tripChanges')).toBe(0);
	});
});

describe('v1 round trip of the sample data', () => {
	const FEEDBACK = [
		['swipes', 'swipes.jsonl'],
		['duels', 'duels.jsonl'],
		['notes', 'notes.jsonl'],
		['questions', 'questions.jsonl'],
	] as const;

	/** Import a v1 line as the migration tool will: seq = line number, x_* fields into extra. */
	function toRow(line: Json, seq: number): Json {
		const row: Json = { seq };
		const extra: Json = {};
		for (const [k, value] of Object.entries(line)) {
			if (k.startsWith('x_')) extra[k] = value;
			else row[k] = value;
		}
		if (Object.keys(extra).length > 0) row['extra'] = extra;
		return row;
	}

	test('every feedback line, game-state.json and trip document exports back unchanged (canonical)', async () => {
		const originals: Record<string, string> = {};
		await w.t.run(async (ctx) => {
			for (const [table, file] of FEEDBACK) {
				const text = sample('feedback', file);
				// One extra line with an x_ field proves extra round-trips (plan section 10).
				const withExtra =
					table === 'notes'
						? `${text}{"v":1,"ts":"2026-11-20T00:00:00Z","round":"place","id":"yu-garden","text":"x","x_mood":{"a":[1,2]}}\n`
						: text;
				originals[`feedback/${file}`] = withExtra;
				let seq = 0;
				for (const line of withExtra.split('\n')) {
					seq++;
					if (line.trim() === '') continue;
					// Rows are validated against the schema on insert; the sample is valid (schema.node.test.ts).
					await ctx.db.insert(table, toRow(JSON.parse(line) as Json, seq) as never);
				}
			}
			const state = JSON.parse(sample('feedback', 'game-state.json')) as {
				firstRun: string | null;
				firstSeen: Record<string, string>;
				days: Record<string, number>;
				locks: Record<string, string>;
			};
			await ctx.db.insert('gameState', {
				v: 1,
				firstRun: state.firstRun,
				days: state.days,
				locks: state.locks,
			});
			for (const [key, ts] of Object.entries(state.firstSeen))
				await ctx.db.insert('firstSeen', { key, ts });
			originals['feedback/game-state.json'] = sample('feedback', 'game-state.json');
			for (const col of TRIP_COLLECTIONS) {
				const text = sample('trip', `${col}.json`);
				originals[`trip/${col}.json`] = text;
				for (const doc of JSON.parse(text) as Json[])
					await ctx.db.insert(TRIP_TABLES[col], doc as never);
			}
		});
		const { files, bundle } = await exportBundle();
		for (const [path, original] of Object.entries(originals)) {
			const exported = files[path] ?? '';
			if (path.endsWith('.jsonl')) {
				expect(lines(exported).map(canonical), path).toEqual(lines(original).map(canonical));
				expect(bundle.files[path]?.count).toBe(lines(original).length);
			} else {
				expect(canonical(JSON.parse(exported)), path).toEqual(canonical(JSON.parse(original)));
			}
		}
		// firstSeen keeps first-seen order (insertion), not the sorted order Convex gives records.
		const exportedState = JSON.parse(files['feedback/game-state.json'] ?? '') as {
			firstSeen: Json;
		};
		const originalState = JSON.parse(originals['feedback/game-state.json'] ?? '') as {
			firstSeen: Json;
		};
		expect(Object.keys(exportedState.firstSeen)).toEqual(Object.keys(originalState.firstSeen));
		// Lines whose keys were written in the old writer's order come back byte for byte.
		expect(lines(files['feedback/notes.jsonl'] ?? '').at(-1)).toEqual({
			v: 1,
			ts: '2026-11-20T00:00:00Z',
			round: 'place',
			id: 'yu-garden',
			text: 'x',
			x_mood: { a: [1, 2] },
		});
	});

	test('trip documents keep stored order and put id first', async () => {
		await w.t.mutation(internal.trip.adminWrite, {
			col: 'legs',
			op: 'set',
			id: 'b',
			data: { title: 'B', type: 'note' },
		});
		await w.t.mutation(internal.trip.adminWrite, {
			col: 'legs',
			op: 'set',
			id: 'a',
			data: { title: 'A' },
		});
		const { files } = await exportBundle();
		const legs = JSON.parse(files['trip/legs.json'] ?? '') as Json[];
		expect(legs.map((d) => d['id'])).toEqual(['b', 'a']);
		// Key order of the real files: a note leg like a stay (id, type, …, title, …, order).
		expect(Object.keys(legs[0] ?? {})).toEqual(['id', 'type', 'title', 'order']);
	});
});
