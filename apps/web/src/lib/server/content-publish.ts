// Content sync (plan section 5): push the content index to Convex through POST /ops/content-index, so every
// mutation that checks an id (swipe, note, duel, lock, route save, trackSeen) can run. Without a published index
// those writes throw NoContent. trip-web publishes at boot (hooks.server.ts init) and again whenever the content
// cache sees a change; Convex treats an unchanged sha as a no-op. Node only, relative imports (see content.ts).
import type { ContentCache, ContentIndexBody } from './content.ts';

export interface PublishTarget {
	/** The Convex HTTP actions origin (PUBLIC_CONVEX_SITE_URL, :3211). */
	siteUrl: string;
	/** The bearer token whose sha256 is CONTENT_TOKEN_SHA256 in the Convex env. Never logged. */
	token: string;
}

export interface PublishResult {
	changed: boolean;
	sha: string;
}

export class PublishError extends Error {
	override readonly name = 'PublishError';
	/** HTTP status, or 0 when the backend could not be reached. */
	readonly status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

/** One POST of the index. Throws PublishError on a refusal or when Convex is unreachable. */
export async function publishContentIndex(
	index: ContentIndexBody,
	target: PublishTarget,
	fetchFn: typeof fetch = fetch,
): Promise<PublishResult> {
	let res: Response;
	try {
		res = await fetchFn(new URL('/ops/content-index', target.siteUrl), {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${target.token}` },
			body: JSON.stringify(index),
			signal: AbortSignal.timeout(15_000),
		});
	} catch (error) {
		throw new PublishError(
			`content index: Convex not reachable (${error instanceof Error ? error.message : String(error)})`,
			0,
		);
	}
	const body: unknown = await res.json().catch(() => null);
	if (!res.ok) {
		const why =
			typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
				? body.error
				: res.statusText;
		throw new PublishError(
			`content index refused (HTTP ${String(res.status)}): ${why}`,
			res.status,
		);
	}
	const changed =
		typeof body === 'object' && body !== null && 'changed' in body && body.changed === true;
	return { changed, sha: index.sha };
}

export interface PublisherOptions {
	cache: ContentCache;
	target: PublishTarget;
	fetchFn?: typeof fetch;
	/** First retry delay; doubles up to maxDelayMs. */
	retryMs?: number;
	maxDelayMs?: number;
	log?: (message: string) => void;
	setTimer?: (fn: () => void, ms: number) => unknown;
}

/**
 * Publish now and on every content change, retrying (with backoff) until Convex accepts it: at boot the backend
 * may not be up yet. A 401/503 (token missing or wrong) is retried too, slowly, and logged once per sha.
 * Returns a function that publishes immediately (used after a change) and resolves when that attempt settles.
 */
export function startContentPublisher(opts: PublisherOptions): () => Promise<void> {
	const retryMs = opts.retryMs ?? 2000;
	const maxDelayMs = opts.maxDelayMs ?? 60_000;
	const log =
		opts.log ??
		((m: string) => {
			console.warn(m);
		});
	const setTimer = opts.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms).unref());
	let published: string | null = null;
	let loggedFor: string | null = null;
	let delay = retryMs;
	let pending = false;
	let inflight: Promise<void> | null = null;

	const run = async (): Promise<void> => {
		// Loop: the content may change while a POST is in flight; publish until the latest index has landed.
		for (;;) {
			const { index } = opts.cache.get();
			if (index.sha === published) return;
			try {
				await publishContentIndex(index, opts.target, opts.fetchFn);
				published = index.sha;
				delay = retryMs;
			} catch (error) {
				if (loggedFor !== index.sha) {
					log(`${error instanceof Error ? error.message : String(error)}; retrying`);
					loggedFor = index.sha;
				}
				if (!pending) {
					pending = true;
					setTimer(() => {
						pending = false;
						void attempt();
					}, delay);
					delay = Math.min(delay * 2, maxDelayMs);
				}
				return;
			}
		}
	};
	// One attempt at a time: a change during a POST waits for it, then publishes the newer index.
	const attempt = (): Promise<void> => {
		inflight ??= run().finally(() => {
			inflight = null;
		});
		return inflight;
	};
	opts.cache.onChange(() => {
		void attempt();
	});
	void attempt();
	return attempt;
}
