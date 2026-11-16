// latestVerdicts, sortedDuels and unseenKeys. These were checked against the old server's game/lib/store.js until it
// was retired; the expected values below are what that code returned for the same inputs.
import { describe, expect, test } from 'vitest';
import { latestVerdicts, sortedDuels, unseenKeys } from '../src/feedback.ts';
import type { DuelRecord, SwipeRecord } from '../src/v1/feedback-types.ts';

describe('feedback', () => {
	test('latestVerdicts: the newest verdict per round and id; equal timestamps keep file order', () => {
		const swipes: SwipeRecord[] = [
			{ v: 1, ts: '2026-11-02T00:00:00Z', session: 's', round: 'place', id: 'a', verdict: 'must' },
			{ v: 1, ts: '2026-11-01T00:00:00Z', session: 's', round: 'place', id: 'a', verdict: 'skip' },
			{ v: 1, ts: '2026-11-01T00:00:00Z', session: 's', round: 'place', id: 'b', verdict: 'skip' },
			{ v: 1, ts: '2026-11-01T00:00:00Z', session: 's', round: 'place', id: 'b', verdict: 'maybe' },
			{
				v: 1,
				ts: '2026-11-03T00:00:00Z',
				session: 's',
				round: 'area',
				id: 'kyoto',
				verdict: 'must',
			},
		];
		expect(latestVerdicts(swipes)).toStrictEqual({
			area: { kyoto: 'must' },
			place: { a: 'must', b: 'maybe' },
		});
	});

	test('sortedDuels: oldest first, stable for equal timestamps', () => {
		const duels: DuelRecord[] = [
			{ v: 1, ts: '2026-11-02T00:00:00Z', session: 's', winner: 'a', loser: 'b' },
			{ v: 1, ts: '2026-11-01T00:00:00Z', session: 's', winner: 'c', loser: 'a' },
			{ v: 1, ts: '2026-11-01T00:00:00Z', session: 's', winner: 'b', loser: 'c' },
		];
		expect(sortedDuels(duels).map((d) => d.winner)).toStrictEqual(['c', 'b', 'a']);
	});

	test('unseenKeys: keys not seen yet, once each, in order', () => {
		expect(unseenKeys(new Set(['a']), ['a', 'b', 'c', 'b'])).toStrictEqual(['b', 'c']);
	});
});
