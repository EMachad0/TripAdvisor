// Parity: game/lib/board.js against the port, on the game's view of the fixture places with seeded verdicts,
// ratings, day overrides and holiday locks.
import { beforeAll, describe, expect, test } from 'vitest';
import * as board from '../../src/board.ts';
import { computeRatings } from '../../src/elo.ts';
import { fixtureState, type FixtureState, type GamePlace } from '../samples.ts';
import { legacy, seeded } from '../support.ts';
import { grid, pick, range, same } from './harness.ts';

let old: typeof board;
let fx: FixtureState;
beforeAll(async () => {
	old = await legacy<typeof board>('game/lib/board.js');
	fx = await fixtureState();
});

/** The fixture places as a game session would see them after some seeded swipes and duels. */
function session(seed: number): {
	places: GamePlace[];
	days: Record<string, number>;
	locks: Record<string, string>;
} {
	const rng = seeded(seed);
	const verdicts: Record<string, string> = {};
	for (const p of fx.places) {
		const v = pick(rng, ['must', 'maybe', 'skip', null, 'must']);
		if (v !== null) verdicts[p.id] = v;
	}
	const ids = fx.places.map((p) => p.id);
	const duels = range(Math.floor(rng() * 40)).map(() => ({
		winner: pick(rng, ids),
		loser: pick(rng, ids),
	}));
	const ratings = computeRatings(verdicts, duels);
	const places = fx.places.map((p) => ({
		...p,
		verdict: verdicts[p.id] ?? null,
		rating: ratings.get(p.id)?.rating ?? null,
		games: ratings.get(p.id)?.games ?? 0,
	}));
	const days: Record<string, number> = {};
	for (const c of fx.countries) if (rng() < 0.4) days[c.id] = Math.floor(rng() * 12);
	const locks: Record<string, string> = {};
	for (const h of ['christmas', 'nye']) {
		const opts = board.holidayOptions(places, h);
		if (opts.length > 0 && rng() < 0.6) locks[h] = pick(rng, opts).id;
	}
	return { places, days, locks };
}

const SEEDS = range(60).map((i) => i + 1);
const HOLIDAY_IDS = ['christmas', 'nye', 'lny', 'easter'];

describe('board parity', () => {
	test('tables', () => {
		expect(board.HOLIDAYS).toStrictEqual(old.HOLIDAYS);
		expect(board.LUNAR_NEW_YEAR).toStrictEqual(old.LUNAR_NEW_YEAR);
	});

	test('buildBoard over seeded sessions', () => {
		const n = same(
			old.buildBoard,
			board.buildBoard,
		)(
			SEEDS.map((seed) => () => {
				const s = session(seed);
				return [
					{
						places: s.places,
						countries: fx.countries,
						days: s.days,
						locks: s.locks,
						interests: seed % 2 ? fx.interests : ['nature', 'food', 'shows'],
						dominantShare: seed % 3 ? fx.dominantShare : 0.25,
						labels: Object.fromEntries(Object.entries(fx.categories).map(([k, v]) => [k, v.label])),
					},
				];
			}),
		);
		expect(n).toBe(SEEDS.length);
		same(
			old.buildBoard,
			board.buildBoard,
		)([() => [{}], () => [{ places: fx.places }], () => [{ countries: fx.countries }]]);
	});

	test('the parts on their own', () => {
		for (const seed of SEEDS.slice(0, 20)) {
			const s = session(seed);
			for (const c of fx.countries) {
				same(
					old.rankCountry,
					board.rankCountry,
				)([() => [s.places, c.id, s.locks], () => [s.places, c.id], () => [s.places, c.id, null]]);
				const ranked = board.rankCountry(s.places, c.id, s.locks);
				same(
					old.cutoff,
					board.cutoff,
				)([
					() => [ranked, c.days],
					() => [ranked, 0],
					() => [ranked, 2.7],
					() => [ranked, null],
					() => [ranked, NaN],
				]);
				same(
					old.budget,
					board.budget,
				)([
					() => [ranked, c.days, c.budget_brl_per_day],
					() => [ranked, 0, 100],
					() => [ranked, 3, undefined],
					() => [[], 0, 0],
				]);
				same(
					old.daysFor,
					board.daysFor,
				)([
					() => [c, s.days],
					() => [c],
					() => [c, null],
					() => [c, { [c.id]: -1 }],
					() => [c, { [c.id]: '3' }],
				]);
			}
			same(
				old.balance,
				board.balance,
			)([
				() => [s.places, { interests: fx.interests, labels: { food: 'Food' } }],
				() => [s.places.slice(0, 4)],
				() => [
					s.places,
					{ dominantShare: 0.1, minForDominant: 1, minForMissing: 1, interests: ['nope'] },
				],
			]);
			same(
				old.bookAhead,
				board.bookAhead,
			)([
				() => [s.places, fx.countries, s.locks],
				() => [s.places],
				() => [s.places, fx.countries, { nye: 'missing' }],
			]);
		}
	});

	test('holidays: dates, ranges, days and options', () => {
		const windows = [
			fx.countries,
			fx.countries.slice(0, 2),
			fx.countries.slice(-2),
			[],
			[{ id: 'x', from: '2027-01-30', to: '2027-02-20' }],
		];
		for (const [h, cs] of grid(HOLIDAY_IDS, windows)) {
			same(old.holidayDate, board.holidayDate)([() => [h, cs]]);
			same(old.holidayRange, board.holidayRange)([() => [h, cs]]);
			same(
				old.holidayOptions,
				board.holidayOptions,
			)([() => [fx.places, h, cs], () => [fx.places, h]]);
			const range = board.holidayRange(h, cs);
			same(old.holidayDay, board.holidayDay)(fx.places.map((p) => () => [p, range]));
		}
		same(old.picksMany, board.picksMany)(HOLIDAY_IDS.map((h) => () => [h]));
	});

	test('countryOn and addDays across the trip window', () => {
		const days = range(120).map((i) => board.addDays('2026-11-25', i));
		same(old.countryOn, board.countryOn)(days.map((d) => () => [d, fx.countries]));
		same(old.addDays, board.addDays)(days.map((d, i) => () => [d, i - 60]));
		same(old.addDays, board.addDays)([() => ['2026-12-06T10:00', 1], () => ['2027-02-28', 1]]);
	});
});
