// Parity: game/lib/elo.js and game/lib/pairing.js against the ports, on the real swipes and duels.
import { beforeAll, describe, expect, test } from 'vitest';
import * as elo from '../../src/elo.ts';
import * as pairing from '../../src/pairing.ts';
import { feedbackRecords, fixtureState, type FixtureState } from '../samples.ts';
import { legacy, seeded } from '../support.ts';
import { pick, range, same } from './harness.ts';

let oldElo: typeof elo;
let oldPairing: typeof pairing;
let fixtures: FixtureState;
beforeAll(async () => {
	oldElo = await legacy<typeof elo>('game/lib/elo.js');
	oldPairing = await legacy<typeof pairing>('game/lib/pairing.js');
	fixtures = await fixtureState();
});

/** Latest verdict per place id (the game's latestVerdicts().place). */
function realVerdicts(): Record<string, string> {
	const out: Record<string, string> = {};
	const swipes = feedbackRecords('swipes')
		.filter((s) => s.round === 'place')
		.map((s, i) => ({ s, i }))
		.sort((a, b) => a.s.ts.localeCompare(b.s.ts) || a.i - b.i);
	for (const { s } of swipes) out[s.id] = s.verdict;
	return out;
}
const realDuels = (): { winner: string; loser: string }[] =>
	feedbackRecords('duels').map((d) => ({ winner: d.winner, loser: d.loser }));

describe('elo parity', () => {
	test('constants', () => {
		expect([elo.START, elo.K, elo.SEED]).toStrictEqual([oldElo.START, oldElo.K, oldElo.SEED]);
	});

	test('computeRatings on the real verdicts and duels, and edge cases', () => {
		expect(realDuels().length).toBeGreaterThan(0);
		const malformed = [
			{ winner: 'a', loser: 'a' },
			{ winner: '', loser: 'b' },
			{ winner: 'a' },
			null,
			undefined,
			{ winner: 'a', loser: 'b' },
		];
		const n = same(
			oldElo.computeRatings,
			elo.computeRatings,
		)([
			() => [realVerdicts(), realDuels()],
			() => [realVerdicts(), realDuels(), 16],
			() => [{}, realDuels()],
			() => [realVerdicts(), []],
			() => [],
			() => [{ a: 'must', b: 'nope', c: null, d: 'skip' }, malformed],
		]);
		expect(n).toBe(6);
	});

	test('expected, update and confidence', () => {
		const ratings = elo.computeRatings(realVerdicts(), realDuels());
		const ids = [...ratings.keys()];
		same(
			oldElo.expected,
			elo.expected,
		)([() => [1500, 1500], () => [1612.3, 1400.1], () => [0, 3000]]);
		same(
			oldElo.update,
			elo.update,
		)([() => [1500, 1500], () => [1400, 1600, 20], () => [1700.5, 1320]]);
		same(
			oldElo.confidence,
			elo.confidence,
		)([
			() => [ids, ratings],
			() => [ids.slice(0, 3), ratings, 2],
			() => [[], ratings],
			() => [['nope'], ratings],
		]);
	});
});

describe('pairing parity', () => {
	test('pickPair over seeded random sources on the real and fixture pools', () => {
		const swipes = feedbackRecords('swipes').filter((s) => s.round === 'place');
		const real = [...new Map(swipes.map((s) => [s.id, { id: s.id, country: s.country }])).values()];
		const fixturePool = fixtures.places.map((p) => ({ id: p.id, country: p.country }));
		const ratings = elo.computeRatings(realVerdicts(), realDuels());
		const history = realDuels();
		const pools = [
			real,
			fixturePool,
			[...real, ...fixturePool],
			real.slice(0, 2),
			real.slice(0, 1),
			[],
		];
		const countries = [undefined, 'china', 'japan', 'korea', 'mars'];
		const cases = range(240).map((seed) => {
			const setup = seeded(seed + 1);
			const pool = pick(setup, pools);
			const country = pick(setup, countries);
			const recent = pick(setup, [undefined, 0, 1, 2, 5]);
			const bias = pick(setup, [undefined, 0, 0.5, 1]);
			const hist = pick(setup, [
				history,
				[],
				history.map((h): [string, string] => [h.winner, h.loser]),
			]);
			return (): Parameters<typeof pairing.pickPair> => [
				pool,
				ratings,
				hist,
				{ rng: seeded(seed * 7919), country, recent, sameCountryBias: bias },
			];
		});
		expect(same(oldPairing.pickPair, pairing.pickPair)(cases)).toBe(240);
		same(
			oldPairing.pairKey,
			pairing.pairKey,
		)([() => ['a', 'b'], () => ['b', 'a'], () => ['x', 'x']]);
	});
});
