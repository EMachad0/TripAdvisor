// Parity: game/lib/store.js (latestVerdicts, sortedDuels, trackSeen) and platform/lib/feedback (latestNotes)
// against the ports, on the real feedback files and on edge cases.
import { beforeAll, describe, expect, test } from 'vitest';
import * as feedback from '../../src/feedback.ts';
import type { NoteRecord, SwipeRecord } from '../../src/v1/feedback-types.ts';
import { feedbackRecords } from '../samples.ts';
import { legacy } from '../support.ts';

interface OldStore {
	latestVerdicts: typeof feedback.latestVerdicts;
	sortedDuels: typeof feedback.sortedDuels;
	trackSeen: (
		state: { firstRun: string | null; firstSeen: Record<string, string> },
		ids: string[],
		swiped: Set<string>,
		now: string,
	) => { changed: boolean };
}
interface OldPlatform {
	latestNotes: typeof feedback.latestNotes;
}

let oldStore: OldStore;
let platform: OldPlatform;
beforeAll(async () => {
	oldStore = await legacy<OldStore>('game/lib/store.js');
	platform = await legacy<OldPlatform>('platform/lib/index.js');
});

describe('feedback parity', () => {
	test('latestVerdicts and sortedDuels on the real files', () => {
		const swipes = feedbackRecords('swipes');
		const duels = feedbackRecords('duels');
		expect(swipes.length).toBeGreaterThan(0);
		expect(feedback.latestVerdicts(swipes)).toStrictEqual(oldStore.latestVerdicts(swipes));
		expect(feedback.sortedDuels(duels)).toStrictEqual(oldStore.sortedDuels(duels));
	});

	test('latestNotes on the real file, with and without cleared notes', () => {
		const notes: NoteRecord[] = feedbackRecords('notes');
		for (const opts of [{}, { keepCleared: true }]) {
			expect([...feedback.latestNotes(notes, opts)]).toStrictEqual([
				...platform.latestNotes(notes, opts),
			]);
		}
	});

	test('equal timestamps keep file order', () => {
		const swipes: SwipeRecord[] = [
			{ v: 1, ts: '2026-11-02T00:00:00Z', session: 's', round: 'place', id: 'a', verdict: 'must' },
			{ v: 1, ts: '2026-11-01T00:00:00Z', session: 's', round: 'place', id: 'a', verdict: 'skip' },
			{ v: 1, ts: '2026-11-01T00:00:00Z', session: 's', round: 'place', id: 'b', verdict: 'skip' },
			{ v: 1, ts: '2026-11-01T00:00:00Z', session: 's', round: 'place', id: 'b', verdict: 'maybe' },
		];
		expect(feedback.latestVerdicts(swipes)).toStrictEqual(oldStore.latestVerdicts(swipes));
	});

	test('unseenKeys agrees with trackSeen on which keys are recorded', () => {
		const state = { firstRun: '2026-11-01T00:00:00Z', firstSeen: { a: '2026-11-01T00:00:00Z' } };
		const keys = ['a', 'b', 'c', 'b'];
		const before = new Set(Object.keys(state.firstSeen));
		oldStore.trackSeen(state, keys, new Set(), '2026-11-02T00:00:00Z');
		const added = Object.keys(state.firstSeen).filter((k) => !before.has(k));
		expect(feedback.unseenKeys(before, keys)).toStrictEqual(added);
	});
});
