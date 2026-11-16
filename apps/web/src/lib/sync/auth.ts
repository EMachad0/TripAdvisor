// Getting Convex auth back after an offline start (slice L). The auth library hands `client.setAuth` a token fetcher
// once, at page start. When the page starts offline (from the service worker's saved copy) that fetch gives up, and
// the socket stays unauthenticated after the network returns: every replayed write meets Unauthenticated and live
// queries never start. This module remembers the library's own setAuth arguments so the runtime can hand them back
// once the socket is connected again (same fetcher, same callbacks, so the library's state machine and its deferred
// subscriptions carry on as after a normal start).
import type { ConvexClient } from 'convex/browser';

type SetAuthArgs = Parameters<ConvexClient['setAuth']>;

const remembered = new WeakMap<ConvexClient, SetAuthArgs>();
const patched = new WeakSet<ConvexClient>();

/** Wrap `client.setAuth` to remember its last arguments. Idempotent per client. */
export function rememberAuth(client: ConvexClient): void {
	if (patched.has(client)) return;
	patched.add(client);
	const setAuth = client.setAuth.bind(client);
	client.setAuth = (...args: SetAuthArgs): void => {
		remembered.set(client, args);
		setAuth(...args);
	};
}

/** True when the client holds no auth token (never set, or the token fetch failed). */
export function lacksAuth(client: ConvexClient): boolean {
	return !client.client.hasAuth();
}

/** Hand the remembered fetcher back to the client (it fetches a fresh token). False when there is none. */
export function reauthenticate(client: ConvexClient): boolean {
	const args = remembered.get(client);
	if (args === undefined) return false;
	client.setAuth(...args);
	return true;
}
