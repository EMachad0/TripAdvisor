// Small trip actions shared by the screens: the "been there" tick (through #lib/sync/write.ts, which toasts a
// refusal) and Copy.
import { localKey } from '@atr/shared/trip';
import { toast } from 'svelte-sonner';
import { write } from '#lib/sync/write.js';

/** Tick or untick "been there" on a place (a `visited` row with the day it was ticked). */
export async function setVisited(id: string, next: boolean): Promise<boolean> {
	const outcome = await write(
		'trip.write',
		next
			? { col: 'visited', op: 'set', id, data: { at: localKey() } }
			: { col: 'visited', op: 'delete', id },
	);
	return outcome.ok;
}

/** Copy a booking ref or an address: "Copied X", or the text itself when the clipboard is blocked. */
export async function copyText(text: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		toast(`Copied ${text}`);
	} catch {
		toast(text);
	}
}
