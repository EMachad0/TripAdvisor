// Shared sync flags between write.ts and the offline runtime (slice L). No imports from write.ts, so either side can
// load first.
import { writable, type Readable } from 'svelte/store';

const pausedStore = writable(false);

/** True after a write met `Frozen` and until one lands again: the badge says "Writes paused, N waiting". */
export const writesPaused: Readable<boolean> = { subscribe: pausedStore.subscribe };

export function setWritesPaused(value: boolean): void {
	pausedStore.set(value);
}
