// Derived feedback state (port of game/lib/store.js latestVerdicts, sortedDuels, trackSeen and
// platform/lib/feedback/index.js latestNotes). Inputs are events in file order; every function sorts by `ts`
// and keeps file order for equal timestamps, exactly like the old code.
import type { Round, Verdict } from './v1/feedback-types.ts';

interface Stamped {
	ts: string;
}

/** Stable sort by ts (localeCompare, as the old code), file order for ties. */
export function byTs<T extends Stamped>(events: readonly T[]): T[] {
	return events
		.map((event, i) => [event, i] as const)
		.sort((a, b) => a[0].ts.localeCompare(b[0].ts) || a[1] - b[1])
		.map(([event]) => event);
}

export interface Verdicts {
	area: Record<string, Verdict>;
	place: Record<string, Verdict>;
}

/** Latest verdict per (round, id). */
export function latestVerdicts(
	swipes: readonly (Stamped & { round: Round; id: string; verdict: Verdict })[],
): Verdicts {
	const out: Verdicts = { area: {}, place: {} };
	for (const s of byTs(swipes)) out[s.round][s.id] = s.verdict;
	return out;
}

/** Duels oldest first (stable for equal timestamps). */
export function sortedDuels<T extends Stamped>(duels: readonly T[]): T[] {
	return byTs(duels);
}

export interface NoteEvent extends Stamped {
	round: Round;
	id: string;
	text: string;
}

/** Latest note per `round:id`. Cleared notes (blank text) are dropped unless keepCleared. */
export function latestNotes<T extends NoteEvent>(
	notes: readonly T[],
	opts: { keepCleared?: boolean } = {},
): Map<string, T> {
	const m = new Map<string, T>();
	for (const n of byTs(notes)) m.set(`${n.round}:${n.id}`, n);
	if (opts.keepCleared !== true) {
		for (const [key, n] of m) if (n.text.trim() === '') m.delete(key);
	}
	return m;
}

/** A note as the traveler types it: CRLF and CR become LF, then trimmed (the old /api/note rule). */
export const normalizeNoteText = (text: string): string => text.replace(/\r\n?/g, '\n').trim();

/**
 * First-seen bookkeeping (game/lib/store.js trackSeen): which keys are not recorded yet. The first run records
 * everything as the baseline; later an unseen key is new until the traveler swipes it.
 */
export function unseenKeys(seen: ReadonlySet<string>, keys: readonly string[]): string[] {
	const out: string[] = [];
	const added = new Set<string>();
	for (const key of keys) {
		if (seen.has(key) || added.has(key)) continue;
		added.add(key);
		out.push(key);
	}
	return out;
}
