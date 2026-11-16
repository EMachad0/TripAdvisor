// Parity harness: run the old JS function and its TS port on the same inputs and require identical output.
import { expect } from 'vitest';

/**
 * `same(oldFn, newFn)(cases)`: for every case, build the arguments twice (so a function that mutates its input, or
 * reads a seeded random source, gets its own copy) and require deep, strict equality: same values, same keys, same
 * undefined-valued keys. Returns how many cases ran, so a test can check it was not handed an empty list.
 * (Curried so the function type is fixed before the cases are typed against its parameters.)
 */
export function same<F extends (...args: never[]) => unknown>(
	oldFn: F,
	newFn: F,
	label = newFn.name,
): (cases: readonly (() => Parameters<F>)[]) => number {
	// F's own parameter list is what the cases build; the constraint only exists to accept any function type.
	const call = (f: F, args: Parameters<F>): unknown =>
		(f as (...a: Parameters<F>) => unknown)(...args);
	return (cases) => {
		for (const [i, make] of cases.entries()) {
			const want = call(oldFn, make());
			const got = call(newFn, make());
			expect(got, `${label} case ${String(i)}`).toStrictEqual(want);
		}
		return cases.length;
	};
}

/** Every pair from two lists. */
export const grid = <X, Y>(xs: readonly X[], ys: readonly Y[]): [X, Y][] =>
	xs.flatMap((x) => ys.map((y): [X, Y] => [x, y]));

/** n values from 0 to n - 1. */
export const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** Pick an element with a random source. */
export function pick<T>(rng: () => number, xs: readonly T[]): T {
	if (xs.length === 0) throw new Error('pick from an empty list');
	return xs[Math.floor(rng() * xs.length)] as T;
}
