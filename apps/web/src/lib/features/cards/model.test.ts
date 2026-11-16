import { describe, expect, it } from 'vitest';
import { cardKey, isVerdict, lastUndoIndex, stripUndone, type UndoEntry } from './model.ts';

describe('local undo', () => {
	const verdicts = {
		area: { harbin: 'must' as const },
		place: { harbin: 'skip' as const, shibuya: 'maybe' as const },
	};

	it('clears only the undone card of the right round', () => {
		const out = stripUndone(verdicts, new Set([cardKey('area', 'harbin')]));
		expect(out.area).toEqual({});
		expect(out.place).toEqual({ harbin: 'skip', shibuya: 'maybe' });
	});
	it('returns the verdicts unchanged when nothing is undone, and empty maps before feedback loads', () => {
		expect(stripUndone(verdicts, new Set())).toBe(verdicts);
		expect(stripUndone(undefined, new Set(['place:x']))).toEqual({ area: {}, place: {} });
	});
	it('finds the newest entry of a round', () => {
		const stack: UndoEntry[] = [
			{ round: 'place', id: 'a', prev: undefined },
			{ round: 'area', id: 'b', prev: undefined },
			{ round: 'place', id: 'c', prev: 'skip' },
		];
		expect(lastUndoIndex(stack, 'place')).toBe(2);
		expect(lastUndoIndex(stack, 'area')).toBe(1);
		expect(lastUndoIndex([], 'area')).toBe(-1);
	});
	it('knows the three verdicts', () => {
		expect(['must', 'maybe', 'skip', 'nope', null].map(isVerdict)).toEqual([
			true,
			true,
			true,
			false,
			false,
		]);
	});
});
