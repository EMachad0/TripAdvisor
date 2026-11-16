// The v1 codecs for trip/<collection>.json and feedback/game-state.json.
import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { COLLECTIONS } from '../src/trip/constants.ts';
import {
	parseGameState,
	parseTripFile,
	serialiseGameState,
	serialiseTripFile,
	V1CodecError,
	type TripLeg,
} from '../src/v1.ts';
import { readText, sampleFile } from './support.ts';

describe('trip files', () => {
	for (const col of COLLECTIONS) {
		test(`trip/${col}.json parses and serialises back byte for byte`, () => {
			const text = readText(sampleFile('trip', `${col}.json`));
			const r = parseTripFile(col, text);
			if (!r.ok) throw new Error(r.errors.join('; '));
			expect(r.value.dropped).toBe(0);
			expect(r.value.nulls).toEqual([]);
			expect(serialiseTripFile(col, r.value.docs)).toBe(text);
		});
	}

	test('documents without a string id are dropped and counted, like the old reader', () => {
		const r = parseTripFile(
			'tasks',
			JSON.stringify([{ id: 'a', title: 'A' }, { title: 'no id' }, { id: 7 }, null, 'x', [1]]),
		);
		expect(r).toStrictEqual({
			ok: true,
			value: { docs: [{ id: 'a', title: 'A' }], dropped: 5, nulls: [] },
		});
	});

	test('null means absent (reported), except legs.cities, which keeps its null', () => {
		const r = parseTripFile(
			'legs',
			JSON.stringify([{ id: 'a', note: null, cities: null, title: 'T' }]),
		);
		expect(r).toStrictEqual({
			ok: true,
			value: { docs: [{ id: 'a', cities: null, title: 'T' }], dropped: 0, nulls: ['[0].note'] },
		});
	});

	test('x_ fields go to extra and come back last; unknown fields and wrong types fail', () => {
		const text = JSON.stringify([{ id: 'a', title: 'A', x_why: { n: 1 } }], null, 2) + '\n';
		const r = parseTripFile('tasks', text);
		expect(r).toStrictEqual({
			ok: true,
			value: { docs: [{ id: 'a', title: 'A', extra: { x_why: { n: 1 } } }], dropped: 0, nulls: [] },
		});
		if (r.ok) expect(serialiseTripFile('tasks', r.value.docs)).toBe(text);
		expect(
			parseTripFile(
				'tasks',
				JSON.stringify([{ id: 'a', colour: 'red', status: 'later', order: '1' }]),
			),
		).toStrictEqual({
			ok: false,
			errors: [
				'[0].colour: unknown field',
				'[0].status: expected one of: "todo" | "doing" | "done" but got "later"',
				'[0].order: expected a number but got "1"',
			],
		});
		expect(
			parseTripFile('legs', JSON.stringify([{ id: 'a', tz: 8, tzStart: '+8', cities: ['x'] }])).ok,
		).toBe(true);
		expect(parseTripFile('legs', JSON.stringify([{ id: 'a', cities: [1] }])).ok).toBe(false);
	});

	test('a broken file fails instead of reading as empty', () => {
		expect(parseTripFile('bag', '{broken').ok).toBe(false);
		expect(parseTripFile('bag', '{"id":"a"}')).toStrictEqual({
			ok: false,
			errors: ['(root): expected a list of documents'],
		});
		expect(serialiseTripFile('spend', [])).toBe('[]\n');
	});

	test('serialising refuses documents that would not make a valid file', () => {
		const bad = [{ id: 'a', type: 'boat' }] as unknown as TripLeg[];
		expect(() => serialiseTripFile('legs', bad)).toThrow(V1CodecError);
		expect(() => serialiseTripFile('legs', [{ id: '', title: 'x' }])).toThrow(/\[0\]\.id/);
		expect(() => serialiseTripFile('legs', [{ id: 'a', extra: { note: 1 } }])).toThrow(
			/not an x_ field/,
		);
	});
});

describe('game-state.json', () => {
	const file = sampleFile('feedback', 'game-state.json');
	test.skipIf(!fs.existsSync(file))(
		'the real file parses and serialises back byte for byte',
		() => {
			const text = readText(file);
			const r = parseGameState(text);
			if (!r.ok) throw new Error(r.errors.join('; '));
			expect(Object.keys(r.value.firstSeen).length).toBeGreaterThan(0);
			expect(serialiseGameState(r.value)).toBe(text);
		},
	);

	test('missing maps read as empty; x_ keys ride in extra; unknown keys and wrong types fail', () => {
		expect(parseGameState('{"v":1}')).toStrictEqual({
			ok: true,
			value: { v: 1, firstRun: null, firstSeen: {}, days: {}, locks: {} },
		});
		const withX = parseGameState('{"v":1,"firstRun":null,"x_note":"n"}');
		expect(withX).toStrictEqual({
			ok: true,
			value: { v: 1, firstRun: null, firstSeen: {}, days: {}, locks: {}, extra: { x_note: 'n' } },
		});
		if (withX.ok)
			expect(JSON.parse(serialiseGameState(withX.value))).toStrictEqual({
				v: 1,
				firstRun: null,
				firstSeen: {},
				days: {},
				locks: {},
				x_note: 'n',
			});
		expect(parseGameState('{"v":2,"days":{"china":"3"},"locks":[],"mood":1}')).toStrictEqual({
			ok: false,
			errors: [
				'mood: unknown field',
				'v: expected 1 but got 2',
				'days.china: expected a number',
				'locks: expected an object',
			],
		});
		expect(parseGameState('{broken').ok).toBe(false);
		expect(() =>
			serialiseGameState({
				v: 1,
				firstRun: null,
				firstSeen: {},
				days: {},
				locks: {},
				extra: { bad: 1 },
			}),
		).toThrow(V1CodecError);
	});
});
