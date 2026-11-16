// Per-tab Decide state that survives moving between screens, as the old global S did (S.duelFilter, S.pair,
// S.skipHist, S.holidayDuel), plus the board's unsent day changes. Not persisted: a reload starts fresh.
import { toast } from 'svelte-sonner';
import type { WriteOutcome, OperationName } from '#lib/sync/write.js';
import type { Duel, DuelFilter, Pair } from './model.ts';
import { saveDays } from './ops.ts';

export const duelState: {
	filter: DuelFilter;
	pair: Pair | null;
	/** "Can't decide" pairs: never logged, they only count as met locally (old S.skipHist). */
	skipped: Duel[];
} = $state({ filter: 'mix', pair: null, skipped: [] });

/** Holiday id → the mini duel's pair (absent: not duelling). */
export const holidayDuels: Record<string, Pair | null> = $state({});

/** The old "Couldn’t save …: <reason>" toast; guest and frozen keep write.ts's words. */
export function reportRefusal(
	outcome: Extract<WriteOutcome<OperationName>, { ok: false }>,
	prefix: string,
): void {
	if (outcome.reason === 'frozen') toast.warning(outcome.message);
	else if (outcome.reason === 'guest') toast.error(outcome.message);
	else toast.error(`${prefix}: ${outcome.message}`);
}

// ---- board days: shown at once, sent after a 350 ms pause (old changeDays debounce)

export const DAYS_DEBOUNCE_MS = 350;

/** Day changes not sent yet (country → days, null = back to the plan). */
export const daysDraft: Record<string, number | null> = $state({});
let daysTimer: ReturnType<typeof setTimeout> | undefined;

/** Send every pending day change now, in one write (the optimistic update takes over from the draft). */
export function flushDays(): void {
	clearTimeout(daysTimer);
	daysTimer = undefined;
	const days = { ...daysDraft };
	if (Object.keys(days).length === 0) return;
	for (const k of Object.keys(days)) Reflect.deleteProperty(daysDraft, k);
	void saveDays(days).then((outcome) => {
		if (!outcome.ok) reportRefusal(outcome, 'Couldn’t save the days');
	});
}

/** Record a change and (re)start the pause. */
export function queueDays(country: string, override: number | null): void {
	daysDraft[country] = override;
	clearTimeout(daysTimer);
	daysTimer = setTimeout(flushDays, DAYS_DEBOUNCE_MS);
}

/** Drop pending changes (Reset sends its own write). */
export function clearDaysDraft(): void {
	clearTimeout(daysTimer);
	daysTimer = undefined;
	for (const k of Object.keys(daysDraft)) Reflect.deleteProperty(daysDraft, k);
}
