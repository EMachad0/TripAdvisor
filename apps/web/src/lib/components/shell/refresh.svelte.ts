// Keeping git content fresh in open tabs (plan section 8; old game.js refresh, lines 1983-1996, and the
// "✨ N new cards from the curator" toast, lines 53-67). Convex data is live already; content and answers come
// from the (app) layout load, so:
//   - a new deploy (kit.version.pollInterval 60 s, `updated.current`) reloads the page when nothing is being
//     edited and the outbox is empty, else reruns the loads (refreshAll);
//   - returning to the tab (focus, visibilitychange to visible) reruns the loads;
//   - after any rerun, content ids that were not there before raise the toast.
// Screens hold the refresh while a sheet, an edit or a gesture is open (old: sheet open, trip sheet open, swiping,
// duel busy, note busy) with `holdRefresh()`.
import { refreshAll } from '$app/navigation';
import { updated } from '$app/state';
import { get } from 'svelte/store';
import { toast } from 'svelte-sonner';
import { newCardsMessage } from '#lib/content/derive.js';
import { pendingCount } from '#lib/sync/write.js';

let holds = 0;

/** Hold background refreshes (a sheet or edit is open). Call the returned function to release; idempotent. */
export function holdRefresh(): () => void {
	holds++;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		holds--;
	};
}

/** True while a screen holds refreshes. */
export const refreshHeld = (): boolean => holds > 0;

/** Minimum time between two focus/visibility refreshes. */
const MIN_GAP_MS = 5000;

/**
 * Wire the refresh in the (app) layout. `ids` returns the current content ids (places and `area:<id>`), read
 * reactively so the toast follows every load.
 */
export function useContentRefresh(ids: () => readonly string[]): void {
	let last = 0;
	let previous: readonly string[] | null = null;

	const refresh = async (): Promise<void> => {
		if (document.hidden || refreshHeld()) return;
		const t = Date.now();
		if (t - last < MIN_GAP_MS) return;
		last = t;
		await refreshAll();
	};

	$effect(() => {
		const now = ids();
		const message = newCardsMessage(previous, now);
		previous = now;
		if (message !== null) toast(message);
	});

	$effect(() => {
		if (!updated.current) return;
		if (!refreshHeld() && get(pendingCount) === 0) location.reload();
		else void refreshAll();
	});

	$effect(() => {
		const onFocus = (): void => void refresh();
		const onVisible = (): void => {
			if (!document.hidden) void refresh();
		};
		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});
}
