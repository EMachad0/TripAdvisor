// Saving a card's note (old game.js saveNote): the one editable note per card, saved through
// #lib/sync/write.ts with an optimistic update of feedback.state. Saves for one card run in order (a chain per card),
// and a save equal to the current note sends nothing, so autosave never floods the log.
import { api } from '#convex/_generated/api.js';
import { write } from '#lib/sync/write.js';
import { reportRefusal } from './calls.svelte.ts';
import { cardKey, type Round } from './model.ts';

/** Autosave after this long without typing (old NOTE_PAUSE_MS). */
export const NOTE_PAUSE_MS = 1200;
/** The longest note the server takes. */
export const NOTE_MAX = 2000;

export type NoteSaveResult = 'unchanged' | 'saved' | 'error';

const chains = new Map<string, Promise<unknown>>();

/**
 * Save `raw` (trimmed) as the note on a card, after any save for the same card still running. `current` returns
 * the note as feedback.state has it now (read when this save's turn comes).
 */
export function saveNote(
	round: Round,
	id: string,
	raw: string,
	current: () => string,
): Promise<NoteSaveResult> {
	const text = raw.trim();
	const k = cardKey(round, id);
	const before = chains.get(k) ?? Promise.resolve();
	const run = before.then(async (): Promise<NoteSaveResult> => {
		if (current() === text) return 'unchanged';
		const outcome = await write(
			'feedback.note',
			{ round, id, text },
			{
				quiet: true,
				optimistic: (store) => {
					const cur = store.getQuery(api.feedback.state, {});
					if (cur === undefined) return;
					const mine = Object.fromEntries(
						Object.entries(cur.notes[round]).filter(([k]) => k !== id),
					);
					if (text !== '') mine[id] = text;
					store.setQuery(
						api.feedback.state,
						{},
						{ ...cur, notes: { ...cur.notes, [round]: mine } },
					);
				},
			},
		);
		if (!outcome.ok) {
			reportRefusal(outcome, 'Couldn’t save your note');
			return 'error';
		}
		return 'saved';
	});
	chains.set(
		k,
		run.catch(() => undefined),
	);
	return run;
}

/** Wait for every save of a card that is still running (the My calls fold waits for it). */
export const notesSettled = (round: Round, id: string): Promise<unknown> =>
	chains.get(cardKey(round, id)) ?? Promise.resolve();
