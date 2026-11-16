// The traveler's calls (Must / Maybe / Skip) as every screen sees them, and the one way to change one.
//
// - `verdictsOf(feedback)`: feedback.state verdicts with locally undone cards cleared. Undo is local only (v1 rule:
//   the swipe log is append-only), so an undone card stays unswiped in this tab until it is swiped again, exactly
//   like the old S.undone set: it survives screen changes and background refreshes, not a reload.
// - `setCall(round, id, verdict)`: feedback.swipe through #lib/sync/write.ts with an optimistic update of
//   feedback.state (Convex rolls it back when the write fails), plus the old toasts.
// - `undoStack` / `undoLast`: the deck's undo (the area sheet pushes an entry too, as the old openArea did).
import { toast } from 'svelte-sonner';
import { SvelteSet } from 'svelte/reactivity';
import { api } from '#convex/_generated/api.js';
import type { FeedbackState } from '#convex/feedback.js';
import { write, type WriteOutcome } from '#lib/sync/write.js';
import {
	cardKey,
	lastUndoIndex,
	stripUndone,
	VERDICT_LABEL,
	type Round,
	type UndoEntry,
	type Verdict,
	type VerdictMap,
} from './model.ts';

/** Cards undone in this tab. Browser only: nothing adds to it during SSR. */
export const undone = new SvelteSet<string>();

/** Undo entries, newest last. */
export const undoStack: UndoEntry[] = $state([]);

/** Verdicts with locally undone cards cleared (reactive on `undone`). */
export const verdictsOf = (feedback: Pick<FeedbackState, 'verdicts'> | undefined): VerdictMap =>
	stripUndone(feedback?.verdicts, undone);

export const canUndo = (round: Round): boolean => lastUndoIndex(undoStack, round) >= 0;

/** Undo the newest swipe of a round: the card comes back unswiped (locally). Returns the entry, or null. */
export function undoLast(round: Round): UndoEntry | null {
	const i = lastUndoIndex(undoStack, round);
	if (i < 0) return null;
	const [entry] = undoStack.splice(i, 1);
	if (entry === undefined) return null;
	undone.add(cardKey(round, entry.id));
	return entry;
}

type Refusal = Extract<WriteOutcome<'feedback.swipe' | 'feedback.note'>, { ok: false }>;

/** The toast after a refused write (the old "Couldn’t save: <reason>"); guest and frozen keep write.ts's words. */
export function reportRefusal(outcome: Refusal, prefix: string): void {
	if (outcome.reason === 'frozen') toast.warning(outcome.message);
	else if (outcome.reason === 'guest') toast.error(outcome.message);
	else toast.error(`${prefix}: ${outcome.message}`);
}

export interface SetCallOptions {
	/** Time the card was on screen (deck swipes). */
	ms?: number;
	/** Toast "<Verdict>: <name>" once it landed (sheet, My calls). */
	toastName?: string;
	/** Push an undo entry at once (deck swipes, area sheet); it is dropped again if the write fails. */
	undo?: boolean;
}

/**
 * Change a call. Optimistic: feedback.state shows it at once and Convex rolls it back if the write fails.
 * `prev` is the call before (for the undo entry). Resolves true when it landed.
 */
export async function setCall(
	round: Round,
	id: string,
	verdict: Verdict,
	prev: Verdict | undefined,
	options: SetCallOptions = {},
): Promise<boolean> {
	const k = cardKey(round, id);
	const wasUndone = undone.has(k);
	undone.delete(k);
	if (options.undo === true) undoStack.push({ round, id, prev });
	const outcome = await write(
		'feedback.swipe',
		{ round, id, verdict, ...(options.ms === undefined ? {} : { ms: options.ms }) },
		{
			quiet: true,
			optimistic: (store) => {
				const cur = store.getQuery(api.feedback.state, {});
				if (cur === undefined) return;
				store.setQuery(
					api.feedback.state,
					{},
					{
						...cur,
						verdicts: { ...cur.verdicts, [round]: { ...cur.verdicts[round], [id]: verdict } },
					},
				);
			},
		},
	);
	if (!outcome.ok) {
		if (wasUndone) undone.add(k);
		if (options.undo === true) {
			const i = undoStack.findLastIndex((u) => u.round === round && u.id === id);
			if (i >= 0) undoStack.splice(i, 1);
		}
		reportRefusal(outcome, 'Couldn’t save');
		return false;
	}
	if (options.toastName !== undefined) toast(`${VERDICT_LABEL[verdict]}: ${options.toastName}`);
	return true;
}
