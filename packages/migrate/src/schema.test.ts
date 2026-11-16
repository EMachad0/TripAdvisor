import { v } from 'convex/values';
import { describe, expect, test } from 'vitest';
import { loadTableValidators, validatorErrors } from './schema.ts';
import { DATA_TABLES } from './tables.ts';

describe('the app schema', () => {
	test('has every data table this package loads, with the fields the codec writes', async () => {
		const tables = await loadTableValidators();
		for (const table of DATA_TABLES) expect(tables.has(table), table).toBe(true);
		const swipes = tables.get('swipes');
		if (swipes?.kind !== 'object') throw new Error('swipes is not an object validator');
		expect(Object.keys(swipes.fields)).toEqual(
			expect.arrayContaining(['seq', 'extra', 'userId', 'ts', 'v']),
		);
	});
});

describe('validatorErrors', () => {
	const doc = v.object({
		id: v.string(),
		n: v.optional(v.number()),
		kind: v.union(v.literal('a'), v.literal('b')),
		cities: v.optional(v.union(v.array(v.string()), v.null())),
		extra: v.optional(v.record(v.string(), v.any())),
	});

	test('accepts a fitting document', () => {
		expect(
			validatorErrors(doc, { id: 'x', kind: 'a', cities: null, extra: { x_a: [1, { b: 2 }] } }),
		).toEqual([]);
	});

	test('names every problem with its path', () => {
		expect(validatorErrors(doc, { n: 'one', kind: 'c', cities: [1], other: true })).toEqual([
			'$.id: missing',
			'$.n: expected number, got string',
			'$.kind: expected one of "a" | "b", got string',
			'$.cities: expected one of array | null, got array',
			'$.other: unknown field',
		]);
	});

	test('int64 and bytes never come from v1 files', () => {
		expect(validatorErrors(v.int64(), 1)).toEqual(['$: int64 cannot come from a v1 file']);
	});
});
