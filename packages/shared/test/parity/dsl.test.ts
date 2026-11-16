// Parity: the validation half of platform/lib/schema/dsl.js, COUNTRIES and FEEDBACK_SPECS against the ports,
// on every real feedback line and on broken ones.
import { beforeAll, describe, expect, test } from 'vitest';
import { check } from '../../src/schema/check.ts';
import * as dsl from '../../src/schema/dsl.ts';
import * as enums from '../../src/schema/enums.ts';
import { FEEDBACK_KINDS, FEEDBACK_SPECS } from '../../src/v1/feedback-specs.ts';
import { legacy, sampleJsonl } from '../support.ts';
import { grid, same } from './harness.ts';

interface OldDsl {
	check: typeof check;
	describe: typeof dsl.describe;
	exampleOf: typeof dsl.exampleOf;
	nearest: typeof dsl.nearest;
	levenshtein: typeof dsl.levenshtein;
	joinPath: typeof dsl.joinPath;
	t: typeof dsl.t;
	TEL_RE: RegExp;
}
let old: OldDsl;
let oldSpecs: typeof FEEDBACK_SPECS;
let oldKinds: readonly string[];
let oldEnums: { COUNTRIES: unknown; COUNTRY_IDS: unknown };
beforeAll(async () => {
	old = await legacy<OldDsl>('platform/lib/schema/dsl.js');
	({ FEEDBACK_SPECS: oldSpecs, FEEDBACK_KINDS: oldKinds } = await legacy<{
		FEEDBACK_SPECS: typeof FEEDBACK_SPECS;
		FEEDBACK_KINDS: readonly string[];
	}>('platform/lib/feedback/index.js'));
	oldEnums = await legacy<typeof oldEnums>('platform/lib/schema/enums.js');
});

/** Ways to break a valid line. */
const MUTATIONS: ((l: Record<string, unknown>) => unknown)[] = [
	(l) => l,
	(l) => ({ ...l, v: 2 }),
	(l) => ({ ...l, ts: 'yesterday' }),
	(l) => ({ ...l, ts: 20261120 }),
	(l) => ({ ...l, id: 'Not A Slug!' }),
	(l) => ({ ...l, session: 's'.repeat(81) }),
	(l) => ({ ...l, session: 12 }),
	(l) => ({ ...l, verdict: 'mustt', round: 'are' }),
	(l) => ({ ...l, country: 'japn' }),
	(l) => ({ ...l, ms: -1 }),
	(l) => ({ ...l, ms: '120' }),
	(l) => ({ ...l, ms: 1.5 }),
	(l) => ({ ...l, text: 'x'.repeat(2001) }),
	(l) => ({ ...l, text: '' }),
	(l) => ({ ...l, question: '   ' }),
	(l) => ({ ...l, elo: { winner: '1500', loser: null } }),
	(l) => ({ ...l, elo: [1, 2] }),
	(l) => ({ ...l, verdikt: 'must', x_mine: { a: 1 } }),
	(l) => ({
		...l,
		stops: [
			{ area: 'a', nights: 0 },
			{ area: 'a', label: 'x' },
		],
	}),
	(l) => ({ ...l, stops: 'shanghai' }),
	(l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== 'ts' && k !== 'id')),
	() => null,
	() => [1, 2],
	() => 'line',
	() => ({ v: 1, ts: new Date('2026-11-20T10:00:00Z') }),
];

describe('dsl parity', () => {
	test('specs and vocabularies are the same objects', () => {
		expect(FEEDBACK_SPECS).toStrictEqual(oldSpecs);
		expect([...FEEDBACK_KINDS]).toStrictEqual(oldKinds);
		expect(enums.COUNTRIES).toStrictEqual(oldEnums.COUNTRIES);
		expect([...enums.COUNTRY_IDS]).toStrictEqual(oldEnums.COUNTRY_IDS);
		expect(dsl.TEL_RE).toStrictEqual(old.TEL_RE);
	});

	test('check on every real line, and on each line broken in every way', () => {
		let lines = 0;
		const routeSample = {
			v: 1,
			ts: '2026-11-12T10:01:00Z',
			session: 's',
			country: 'china',
			stops: [{ area: 'shanghai', nights: 4 }],
		};
		for (const kind of FEEDBACK_KINDS) {
			const real = kind === 'route' ? [routeSample, ...sampleJsonl('route')] : sampleJsonl(kind);
			lines += real.length;
			same(old.check, check)(real.map((l) => () => [FEEDBACK_SPECS[kind], l]));
			same(
				old.check,
				check,
				`check ${kind}`,
			)(grid(real.slice(0, 25), MUTATIONS).map(([l, m]) => () => [FEEDBACK_SPECS[kind], m(l)]));
		}
		expect(lines).toBeGreaterThan(900);
	});

	test('the other kinds of spec', () => {
		const { t } = dsl;
		const specs = [
			t.url(),
			t.url({ tel: true }),
			t.date(),
			t.markdown({ max: 10 }),
			t.string({ min: 3, max: 5, patternHint: 'p' }),
			t.string({ pattern: /^[A-Z]{3}$/, suggest: ['PVG', 'HKG'] }),
			t.boolean(),
			t.int({ min: 1, max: 9 }),
			t.array(t.slug(), { min: 1, max: 2 }),
			t.tagged('type', { a: t.object({ x: t.number() }), b: t.object({ y: t.opt(t.string()) }) }),
			t.opt(t.enum(['one', 'two', 3])),
		];
		const values: unknown[] = [
			undefined,
			null,
			'',
			' ',
			'https://example.com/x',
			'http://x',
			'tel:+66 2 246 5472',
			'tel:12',
			'2026-02-30',
			'2026-11-09',
			'<b>hi</b>',
			'abcdef',
			'PVX',
			'yes',
			'true',
			1,
			0,
			9.5,
			10,
			'1,000',
			true,
			[],
			['ok', 'Bad Slug', 'x'],
			{ type: 'a', x: 1 },
			{ type: 'c' },
			{ x: 1 },
			{ type: 'b', y: 2, z: 3 },
			'tw',
			3,
			new Date('2026-11-20T00:00:00Z'),
			Symbol.for('s'),
		];
		same(old.check, check)(grid(specs, values).map(([s, v]) => () => [s, v, ['field', 2]]));
		same(old.describe, dsl.describe)(specs.map((s) => () => [s]));
		same(old.exampleOf, dsl.exampleOf)(specs.flatMap((s) => [() => [s], () => [s, { all: true }]]));
		same(
			old.nearest,
			dsl.nearest,
		)(
			grid(
				['mustt', 'Japan', 'hong kong', 'zzzzzz', '', 'verdict'],
				[['must', 'maybe', 'skip'], ['japan', 'hong-kong'], []],
			).map(([w, o]) => () => [w, o]),
		);
		same(
			old.levenshtein,
			dsl.levenshtein,
		)(grid(['', 'kitten', 'sitting', 'é'], ['', 'kitten', 'e']).map(([a, b]) => () => [a, b]));
		same(old.joinPath, dsl.joinPath)([() => [[]], () => [['a', 0, 'b', 1]], () => [[0, 'x']]]);
	});
});
