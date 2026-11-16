// Plain data about calls (no Svelte, no Convex): the verdict vocabulary, verdict maps and the local undo rule.
export type Verdict = 'must' | 'maybe' | 'skip';
export type Round = 'place' | 'area';

/** Button order everywhere: Skip, Maybe, Must. */
export const VERDICT_ORDER: readonly Verdict[] = ['skip', 'maybe', 'must'];

export const VERDICT_LABEL: Readonly<Record<Verdict, string>> = {
	must: 'Must',
	maybe: 'Maybe',
	skip: 'Skip',
};

export const isVerdict = (x: unknown): x is Verdict =>
	x === 'must' || x === 'maybe' || x === 'skip';

/** Verdicts per round and id (feedback.state verdicts, with local undo applied). */
export interface VerdictMap {
	area: Readonly<Record<string, Verdict | undefined>>;
	place: Readonly<Record<string, Verdict | undefined>>;
}

/** One deck swipe that Undo can take back. */
export interface UndoEntry {
	round: Round;
	id: string;
	prev: Verdict | undefined;
}

/** The local key of a card ("place:<id>", "area:<id>"). */
export const cardKey = (round: Round, id: string): string => `${round}:${id}`;

const EMPTY: VerdictMap = { area: {}, place: {} };

/** Verdicts with locally undone cards cleared (the log is append-only: an undone card is simply unswiped here). */
export function stripUndone(
	verdicts: VerdictMap | undefined,
	undone: ReadonlySet<string>,
): VerdictMap {
	const base = verdicts ?? EMPTY;
	if (undone.size === 0) return base;
	const strip = (round: Round): Record<string, Verdict | undefined> => {
		const out: Record<string, Verdict | undefined> = {};
		for (const [id, v] of Object.entries(base[round])) {
			if (!undone.has(cardKey(round, id))) out[id] = v;
		}
		return out;
	};
	return { area: strip('area'), place: strip('place') };
}

/** Index of the newest undo entry of a round, -1 when none. */
export const lastUndoIndex = (stack: readonly UndoEntry[], round: Round): number =>
	stack.map((u) => u.round).lastIndexOf(round);
