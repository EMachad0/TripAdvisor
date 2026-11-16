// The one write path for every screen (plan sections 8 and 11). FROZEN signature: `write(name, args, options)`.
// Components never call a Convex mutation directly; they name an operation here.
//
// What a write does, in order:
//   1. refuses at once for the guest (read only, as on the old site) with the old message as a toast;
//   2. stamps a UUID clientOpId (ownerMutation's idempotency key: a replay never lands twice);
//   3. records the entry in the outbox (see OUTBOX SEAM below) and bumps `pendingCount`;
//   4. sends the mutation with the caller's optimistic update (convex-svelte rolls it back on failure);
//   5. on success removes the entry; on Frozen keeps it and says "Writes paused"; on any other refusal removes it
//      and toasts the server's message.
//
// OUTBOX (slice L): in the browser the outbox is IndexedDB (outbox.ts), so a reload keeps unsent writes; the server
// keeps memory only. runtime.svelte.ts (started below, browser only) flushes kept entries on reconnect with
// `replayOutbox()`, shows the sync badge and the beforeunload warning; mirror.ts keeps the last query results for
// offline reads. An entry stays on Frozen and on Unauthenticated (an offline start can leave the socket without a
// token; the write is retried, never dropped); other refusals drop it. Exported signatures are unchanged.
import type { OptimisticLocalStore } from 'convex/browser';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';
import { ConvexError } from 'convex/values';
import { getConvexClient } from 'convex-svelte';
import { toast } from 'svelte-sonner';
import { writable, type Readable } from 'svelte/store';
import { browser } from '$app/env';
import { api } from '#convex/_generated/api.js';
import { errorCode } from '#lib/access-error.js';
import { rememberAuth } from './auth';
import { browserMirror, installMirror, mirroredStore, type Mirror } from './mirror';
import { durableOutbox } from './outbox';
import { setWritesPaused } from './state';

/** Every write the app makes, by name. A new mutation gets a name here (integrator change). */
export const OPERATIONS = {
	'feedback.swipe': api.feedback.swipe,
	'feedback.note': api.feedback.note,
	'feedback.trackSeen': api.feedback.trackSeen,
	'decide.duel': api.decide.duel,
	'decide.setDays': api.decide.setDays,
	'decide.resetDays': api.decide.resetDays,
	'decide.setLock': api.decide.setLock,
	'route.save': api.route.save,
	'route.reset': api.route.reset,
	'trip.write': api.trip.write,
	'trip.bagUntickAll': api.trip.bagUntickAll,
} as const satisfies Record<string, FunctionReference<'mutation'>>;

export type OperationName = keyof typeof OPERATIONS;
type Ref<N extends OperationName> = (typeof OPERATIONS)[N];
/** The mutation's arguments without clientOpId (write stamps it). */
export type OperationArgs<N extends OperationName> = Omit<FunctionArgs<Ref<N>>, 'clientOpId'>;
/** What the mutation returns (`{ replayed: true }` when the clientOpId had already landed). */
export type OperationResult<N extends OperationName> = FunctionReturnType<Ref<N>>;

export interface WriteOptions {
	/**
	 * Optimistic change to local query results, applied at once and rolled back if the write fails
	 * (convex OptimisticUpdate). Leave it out for pessimistic writes (trip forms).
	 */
	optimistic?: (store: OptimisticLocalStore) => void;
	/** No toast on a refusal; the caller shows its own message from the outcome. */
	quiet?: boolean;
}

export type WriteRefusal =
	/** The guest account: nothing was sent. */
	| 'guest'
	/** Writes are paused (cutover, rollback); the entry stays in the outbox. */
	| 'frozen'
	/** The server refused the input (the old 400) or has no content index yet (NoContent). */
	| 'invalid'
	/** Not signed in any more, or not a member. */
	| 'auth'
	/** Anything else (network, server bug). */
	| 'error';

export type WriteOutcome<N extends OperationName> =
	| { ok: true; clientOpId: string; result: OperationResult<N> }
	| { ok: false; clientOpId: string; reason: WriteRefusal; message: string };

/** One queued write. Plain JSON, so a durable outbox can store it as is. */
export interface OutboxEntry {
	clientOpId: string;
	name: OperationName;
	args: Record<string, unknown>;
	/** When the write was made (ISO). */
	at: string;
}

/** Where unsent writes wait. The default lives in memory; slice L swaps in IndexedDB with setOutbox. */
export interface Outbox {
	add(entry: OutboxEntry): Promise<void>;
	remove(clientOpId: string): Promise<void>;
	/** Oldest first. */
	list(): Promise<OutboxEntry[]>;
}

export const GUEST_MESSAGE = 'Guests can look but not change anything.';
export const FROZEN_MESSAGE = 'Writes are paused right now. Your change is kept and will retry.';

function memoryOutbox(): Outbox {
	const entries = new Map<string, OutboxEntry>();
	return {
		add: (e) => {
			entries.set(e.clientOpId, e);
			return Promise.resolve();
		},
		remove: (id) => {
			entries.delete(id);
			return Promise.resolve();
		},
		list: () => Promise.resolve([...entries.values()]),
	};
}

let outbox: Outbox = browser ? durableOutbox() : memoryOutbox();
/** The tab's query mirror (browser only): optimistic updates read through it after an offline start. */
let mirror: Mirror | null = null;
/** clientOpIds whose mutation is on its way: a replay leaves them to the call that sent them. */
const inFlight = new Set<string>();
let role: 'owner' | 'guest' | null = null;
const pending = writable(0);

/** How many writes are sent but not confirmed (or kept while frozen). For badges and beforeunload. */
export const pendingCount: Readable<number> = { subscribe: pending.subscribe };

async function syncPending(): Promise<void> {
	pending.set((await outbox.list()).length);
}

/** Replace the outbox (slice L: the durable IndexedDB outbox). Recounts pending entries. */
export function setOutbox(next: Outbox): void {
	outbox = next;
	void syncPending();
}

/** The signed-in role, set by the (app) layout from members.me. Guest writes are refused without a request. */
export function setWriterRole(next: 'owner' | 'guest' | null): void {
	role = next;
}

/** The entries waiting in the outbox, oldest first ("Copy pending changes"). */
export function pendingEntries(): Promise<OutboxEntry[]> {
	return outbox.list();
}

function errorMessage(error: unknown): string {
	if (error instanceof ConvexError) {
		const data: unknown = error.data;
		if (
			typeof data === 'object' &&
			data !== null &&
			'message' in data &&
			typeof data.message === 'string'
		) {
			return data.message;
		}
	}
	return error instanceof Error ? error.message : String(error);
}

function refusalOf(code: string | null): WriteRefusal {
	switch (code) {
		case 'Frozen':
			return 'frozen';
		case 'Invalid':
		case 'NoContent':
			return 'invalid';
		case 'Unauthenticated':
			return 'auth';
		case 'Forbidden':
			return role === 'guest' ? 'guest' : 'auth';
		case null:
		default:
			return 'error';
	}
}

const newOpId = (): string => crypto.randomUUID();

function overMirror(
	update: (store: OptimisticLocalStore) => void,
): (store: OptimisticLocalStore) => void {
	return (store) => {
		update(mirror === null ? store : mirroredStore(store, mirror));
	};
}

/** Send one entry (new or replayed). The entry is already in the outbox. */
async function send<N extends OperationName>(
	entry: OutboxEntry,
	options: WriteOptions,
): Promise<WriteOutcome<N>> {
	const ref = OPERATIONS[entry.name] as FunctionReference<'mutation'>;
	inFlight.add(entry.clientOpId);
	try {
		const result = (await getConvexClient().mutation(
			ref,
			{ ...entry.args, clientOpId: entry.clientOpId },
			options.optimistic === undefined ? {} : { optimisticUpdate: overMirror(options.optimistic) },
		)) as OperationResult<N>;
		await outbox.remove(entry.clientOpId);
		setWritesPaused(false);
		return { ok: true, clientOpId: entry.clientOpId, result };
	} catch (error) {
		const reason = refusalOf(errorCode(error));
		if (reason === 'error') console.warn(`sync: ${entry.name} failed`, error);
		if (reason === 'frozen') setWritesPaused(true);
		else if (reason !== 'auth') await outbox.remove(entry.clientOpId);
		const message =
			reason === 'frozen'
				? FROZEN_MESSAGE
				: reason === 'guest'
					? GUEST_MESSAGE
					: errorMessage(error);
		if (options.quiet !== true) {
			if (reason === 'frozen') toast.warning(message);
			else toast.error(message);
		}
		return { ok: false, clientOpId: entry.clientOpId, reason, message };
	} finally {
		inFlight.delete(entry.clientOpId);
		await syncPending();
	}
}

/**
 * Make one write. Never throws: the outcome says whether it landed. The guest gets `{ ok: false, reason: 'guest' }`
 * and a toast, with nothing sent.
 */
export async function write<N extends OperationName>(
	name: N,
	args: OperationArgs<N>,
	options: WriteOptions = {},
): Promise<WriteOutcome<N>> {
	const clientOpId = newOpId();
	if (role === 'guest') {
		if (options.quiet !== true) toast.error(GUEST_MESSAGE);
		return { ok: false, clientOpId, reason: 'guest', message: GUEST_MESSAGE };
	}
	const entry: OutboxEntry = {
		clientOpId,
		name,
		args: { ...(args as Record<string, unknown>) },
		at: new Date().toISOString(),
	};
	await outbox.add(entry);
	await syncPending();
	return send<N>(entry, options);
}

let replaying: Promise<{ sent: number; kept: number }> | null = null;

/**
 * Send every entry still in the outbox, oldest first (the runtime calls this at start, on reconnect, now and then
 * while entries wait, and from "Retry"). All entries are handed to the Convex client at once, in outbox order: the
 * client queues them while offline and the server runs one client's mutations in the order they were sent, so a
 * write made after a reload still lands after the kept ones. Entries already in flight are left to their own call.
 * Replays are safe: ownerMutation skips a clientOpId that already landed. Frozen and Unauthenticated keep an entry;
 * any other refusal drops it with a toast. Concurrent calls share one pass. The guest never replays (entries wait
 * for the owner).
 */
export function replayOutbox(): Promise<{ sent: number; kept: number }> {
	replaying ??= (async () => {
		try {
			// The guest signed in on a device that still holds the owner's unsent writes: keep them for the owner.
			if (role === 'guest') return { sent: 0, kept: (await outbox.list()).length };
			const entries = (await outbox.list()).filter((e) => !inFlight.has(e.clientOpId));
			// send() marks the entry in flight and calls the client before its first await, so order holds.
			const outcomes = await Promise.all(entries.map((e) => send(e, { quiet: true })));
			for (const o of outcomes) {
				if (!o.ok && (o.reason === 'invalid' || o.reason === 'error')) {
					toast.error(`A change saved offline was refused: ${o.message}`);
				}
			}
			return { sent: outcomes.filter((o) => o.ok).length, kept: (await outbox.list()).length };
		} finally {
			replaying = null;
		}
	})();
	return replaying;
}

// Browser only: offline reads (the query mirror must wrap the client before any screen subscribes, so it is installed
// while this module loads; hooks.ts has created the client by then) and the runtime with the badge.
if (browser) {
	// Writes kept from before a reload count at once (the badge and beforeunload).
	void syncPending();
	const tabMirror = browserMirror();
	mirror = tabMirror;
	try {
		installMirror(getConvexClient(), tabMirror);
		rememberAuth(getConvexClient());
	} catch (error) {
		console.warn('sync: no Convex client yet, offline reads are off for this page', error);
	}
	void import('./runtime.svelte.js').then(({ startSync }) =>
		startSync({
			client: getConvexClient,
			mirror: tabMirror,
			pendingCount,
			pendingEntries,
			replayOutbox,
		}),
	);
}
