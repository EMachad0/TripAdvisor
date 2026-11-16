// The Decide writes, all through #lib/sync/write.ts.
//
// Optimistic (feedback.state shows the change at once; Convex rolls it back when the write fails):
//   - a duel: the pick shows at once (old pickDuel pushed it locally before the POST);
//   - days and reset: optimistic (the 350 ms debounce lives in state.svelte.ts).
//
// NOT optimistic (the explicit list; nothing else in Decide waits for the server):
//   - a holiday lock or unlock (`saveLock`). The old setLock (game.js:797-809) redrew the holiday, the board's lock
//     panel and the badges only after POST /api/local answered, and the toast and confetti came after that too. So
//     the lock list, the "Locked in" banner and the Holidays badge only ever show what the server holds; the button
//     shows a spinner meanwhile.
import { computeRatings } from '@atr/shared/elo';
import type { OptimisticLocalStore } from 'convex/browser';
import { api } from '#convex/_generated/api.js';
import type { FeedbackState } from '#convex/feedback.js';
import { write, type WriteOutcome } from '#lib/sync/write.js';
import { mergeDays } from './model.ts';

type Patch = (cur: FeedbackState) => FeedbackState;

function patchFeedback(patch: Patch): (store: OptimisticLocalStore) => void {
	return (store) => {
		const cur = store.getQuery(api.feedback.state, {});
		if (cur === undefined) return;
		store.setQuery(api.feedback.state, {}, patch(cur));
	};
}

/** One duel result. */
export function saveDuel(winner: string, loser: string): Promise<WriteOutcome<'decide.duel'>> {
	return write(
		'decide.duel',
		{ winner, loser },
		{
			quiet: true,
			optimistic: patchFeedback((cur) => {
				const duels = [...cur.duels, { winner, loser }];
				return {
					...cur,
					duels,
					ratings: Object.fromEntries(computeRatings(cur.verdicts.place, duels)),
				};
			}),
		},
	);
}

/** Day overrides per country; null removes one. */
export function saveDays(
	days: Readonly<Record<string, number | null>>,
): Promise<WriteOutcome<'decide.setDays'>> {
	return write(
		'decide.setDays',
		{ days: { ...days } },
		{
			quiet: true,
			optimistic: patchFeedback((cur) => ({
				...cur,
				local: { ...cur.local, days: mergeDays(cur.local.days, days) },
			})),
		},
	);
}

/** Back to the trip plan's days. */
export function resetDays(): Promise<WriteOutcome<'decide.resetDays'>> {
	return write(
		'decide.resetDays',
		{},
		{
			quiet: true,
			optimistic: patchFeedback((cur) => ({ ...cur, local: { ...cur.local, days: {} } })),
		},
	);
}

/** Lock a holiday's pick, or with null unlock it. Not optimistic (see the list at the top). */
export function saveLock(
	holiday: string,
	placeId: string | null,
): Promise<WriteOutcome<'decide.setLock'>> {
	return write('decide.setLock', { holiday, placeId }, { quiet: true });
}

/** The write names that never get an optimistic update (the list above, for tests and the parity doc). */
export const NOT_OPTIMISTIC = ['decide.setLock'] as const;
