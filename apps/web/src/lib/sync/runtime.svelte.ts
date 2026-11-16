// The offline runtime of a tab (slice L), started once by write.ts in the browser:
//   - watches the network and the Convex socket;
//   - replays the outbox in order at start (writes kept from before a reload go into the client's queue ahead of new
//     ones), when the socket (re)connects, every RETRY_EVERY_MS while entries wait and writes are not paused, and
//     from "Retry"; Frozen keeps the entries and pauses the timer until a reconnect or "Retry";
//   - asks the service worker for an update after each navigation (plan section 11.1, at most once a minute);
//   - after the socket comes back from an offline spell without auth (an offline start), hands the auth library's
//     token fetcher back to the client (auth.ts), so replays and live queries run signed in;
//   - warns before unload while writes wait;
//   - mounts the sync badge (SyncBadge.svelte) at the top of the page.
import type { ConvexClient } from 'convex/browser';
import { mount } from 'svelte';
import { page } from '$app/state';
import { toast } from 'svelte-sonner';
import type { Readable } from 'svelte/store';
import { lacksAuth, reauthenticate } from './auth';
import type { Mirror } from './mirror';
import { writesPaused } from './state';
import { pendingJson } from './status';
import SyncBadge from './SyncBadge.svelte';
import type { OutboxEntry } from './write';

/** What the runtime needs from write.ts (passed in, so this module never imports it back). */
export interface SyncDeps {
	client: () => ConvexClient;
	mirror: Mirror;
	pendingCount: Readable<number>;
	pendingEntries: () => Promise<OutboxEntry[]>;
	replayOutbox: () => Promise<{ sent: number; kept: number }>;
}

/** How long the socket may be down before the badge says Offline. */
const OFFLINE_AFTER_MS = 2500;
/** Pending writes show as "N unsynced" only after this long (normal writes land well within it). */
const SLOW_AFTER_MS = 1500;
/** While entries wait on a live socket (an Unauthenticated refusal after an offline start, say), try again this often. */
const RETRY_EVERY_MS = 5000;
/** Service worker update checks at most this often. */
const SW_UPDATE_GAP_MS = 60_000;
/** After a reconnect, how long the auth library gets to sign the socket in by itself. */
const REAUTH_AFTER_MS = 1500;
/** Re-authentication attempts at most this often. */
const REAUTH_GAP_MS = 15_000;

export class SyncRuntime {
	pending = $state(0);
	paused = $state(false);
	online = $state(true);
	socketDown = $state(false);
	slow = $state(false);
	lastSynced = $state<string | null>(null);
	replaying = $state(false);

	readonly offline: boolean = $derived(!this.online || this.socketDown);

	readonly #deps: SyncDeps;
	#downTimer: ReturnType<typeof setTimeout> | undefined;
	#slowTimer: ReturnType<typeof setTimeout> | undefined;
	#connected = false;
	/** The tab has been offline (or started without a socket) since the last successful re-authentication. */
	#wasDown = false;
	#lastReauth = 0;

	constructor(deps: SyncDeps) {
		this.#deps = deps;
	}

	start(): void {
		const d = this.#deps;
		this.online = navigator.onLine;
		// A page that starts offline (the service worker's saved copy) has no auth to keep.
		if (!this.online) this.#wasDown = true;
		d.pendingCount.subscribe((n) => {
			this.pending = n;
			this.#watchSlow(n);
		});
		writesPaused.subscribe((p) => (this.paused = p));
		d.mirror.onSynced((at) => (this.lastSynced = at));

		window.addEventListener('online', () => {
			this.online = true;
			if (this.#connected) void this.replay();
		});
		window.addEventListener('offline', () => {
			this.online = false;
			this.#wasDown = true;
		});
		window.addEventListener('beforeunload', (event) => {
			if (this.pending === 0) return;
			event.preventDefault();
		});

		// Before the first connection, give the socket a moment before calling the tab offline.
		this.#socketDown();
		const client = d.client();
		const onState = (connected: boolean): void => {
			const was = this.#connected;
			this.#connected = connected;
			if (connected) {
				clearTimeout(this.#downTimer);
				this.socketDown = false;
				if (!was) {
					void this.replay();
					if (this.#wasDown) setTimeout(() => void this.#reauth(), REAUTH_AFTER_MS);
				}
			} else if (was) {
				this.#socketDown();
			}
		};
		onState(client.connectionState().isWebSocketConnected);
		client.subscribeToConnectionState((s) => {
			onState(s.isWebSocketConnected);
		});
		void this.replay();
		setInterval(() => {
			if (!this.#connected || this.pending === 0 || this.paused) return;
			void this.#reauth().then(() => this.replay());
		}, RETRY_EVERY_MS);
		this.#watchServiceWorker();
	}

	#watchServiceWorker(): void {
		if (!('serviceWorker' in navigator)) return;
		let last = Date.now();
		let lastPath = '';
		$effect.root(() => {
			$effect(() => {
				const path = page.url.pathname;
				if (path === lastPath) return;
				lastPath = path;
				if (Date.now() - last < SW_UPDATE_GAP_MS) return;
				last = Date.now();
				void navigator.serviceWorker
					.getRegistration()
					.then((r) => r?.update())
					.catch(() => undefined);
			});
		});
	}

	#socketDown(): void {
		clearTimeout(this.#downTimer);
		this.#downTimer = setTimeout(() => {
			if (this.#connected) return;
			this.socketDown = true;
			this.#wasDown = true;
		}, OFFLINE_AFTER_MS);
	}

	/** Sign the socket in again when it came back without auth; then send what waits. */
	async #reauth(): Promise<void> {
		if (!this.#connected) return;
		const client = this.#deps.client();
		if (!lacksAuth(client)) {
			this.#wasDown = false;
			await this.replay();
			return;
		}
		if (Date.now() - this.#lastReauth < REAUTH_GAP_MS) return;
		this.#lastReauth = Date.now();
		if (!reauthenticate(client)) return;
		this.#wasDown = false;
		// The replay waits for the fresh token: the client pauses the socket while it fetches.
		await this.replay();
	}

	#watchSlow(n: number): void {
		clearTimeout(this.#slowTimer);
		if (n === 0) {
			this.slow = false;
			return;
		}
		if (this.slow) return;
		this.#slowTimer = setTimeout(() => (this.slow = true), SLOW_AFTER_MS);
	}

	/** Send what waits, oldest first. Safe to call any time: write.ts skips entries already in flight. */
	async replay(): Promise<void> {
		if (this.replaying) return;
		this.replaying = true;
		try {
			if ((await this.#deps.pendingEntries()).length > 0) await this.#deps.replayOutbox();
		} finally {
			this.replaying = false;
		}
	}

	/** "Retry": an explicit flush (after writes were unfrozen). */
	async retry(): Promise<void> {
		await this.replay();
		if (this.pending === 0) toast.success('All changes saved');
		else if (this.paused) toast.warning('Writes are still paused. Your changes are kept.');
	}

	/** "Copy pending changes": the waiting entries as JSON on the clipboard. */
	async copyPending(): Promise<string> {
		const json = pendingJson(await this.#deps.pendingEntries());
		try {
			await navigator.clipboard.writeText(json);
			toast.success(
				`Copied ${String(this.pending)} pending change${this.pending === 1 ? '' : 's'}`,
			);
		} catch {
			toast.error('Could not reach the clipboard. Select the text below and copy it.');
		}
		return json;
	}
}

let started: SyncRuntime | null = null;

/** Start the runtime and mount the badge once per tab. */
export function startSync(deps: SyncDeps): SyncRuntime {
	if (started !== null) return started;
	const runtime = new SyncRuntime(deps);
	started = runtime;
	runtime.start();
	const host = document.createElement('div');
	host.dataset['sync'] = 'badge';
	document.body.append(host);
	mount(SyncBadge, { target: host, props: { sync: runtime } });
	return runtime;
}
