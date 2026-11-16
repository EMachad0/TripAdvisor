// Server hooks (plan section 6): refresh the 15-minute Convex JWT from the 400-day session (the SSR JWT gap,
// spike S9), publish the content index at boot, hand the token to convexLoad/createConvexHttpClient, and send signed-out visitors to /login.
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { CONTENT_TOKEN } from '$app/env/private';
import { PUBLIC_CONVEX_SITE_URL } from '$app/env/public';
import { error, redirect } from '@sveltejs/kit';
import { getToken } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { withServerConvexToken } from 'convex-svelte/sveltekit/server';
import {
	applySetCookies,
	clearAuthCookies,
	hasCookie,
	JWT_COOKIES,
	SESSION_COOKIES,
} from '#lib/server/auth-cookies.js';
import { isPublicPath } from '#lib/server/auth-guard.js';
import { contentCache } from '#lib/server/content.js';
import { startContentPublisher } from '#lib/server/content-publish.js';

/** Boot: read the content once and publish its index to Convex (retried until the backend accepts it). */
export const init: ServerInit = () => {
	const cache = contentCache();
	cache.get();
	if (CONTENT_TOKEN === undefined) {
		console.warn(
			'CONTENT_TOKEN is not set: content sync is off, so id-checked writes fail with NoContent',
		);
		return;
	}
	startContentPublisher({
		cache,
		target: { siteUrl: PUBLIC_CONVEX_SITE_URL, token: CONTENT_TOKEN },
	});
};

/**
 * A session cookie without a Convex JWT: ask Better Auth for a fresh JWT with the session cookie forwarded.
 * Returns false when the session may still be good but no JWT came back (Better Auth busy or unreachable).
 */
async function refreshConvexJwt(event: Parameters<Handle>[0]['event']): Promise<boolean> {
	if (event.url.pathname.startsWith('/api/auth/')) return true;
	if (!hasCookie(event.cookies, SESSION_COOKIES) || hasCookie(event.cookies, JWT_COOKIES))
		return true;
	const response = await event
		.fetch('/api/auth/convex/token', {
			headers: { origin: event.url.origin },
		})
		.catch(() => null);
	if (response?.ok === true) {
		applySetCookies(event.cookies, response);
		return true;
	}
	// The session is gone (signed out elsewhere, expired, revoked): drop the stale cookie instead of asking again.
	if (response?.status === 401) {
		clearAuthCookies(event.cookies);
		return true;
	}
	return false;
}

export const handle: Handle = async ({ event, resolve }) => {
	const refreshed = await refreshConvexJwt(event);
	const token = getToken(event.cookies);
	event.locals.token = token;
	if (token === undefined && !isPublicPath(event.url.pathname)) {
		// A signed-in visitor whose JWT could not be refreshed right now: say so instead of showing the sign-in form.
		if (!refreshed) error(503, 'The sign-in service did not answer. Reload in a few seconds.');
		const target = `${event.url.pathname}${event.url.search}`;
		redirect(303, target === '/' ? '/login' : `/login?redirectTo=${encodeURIComponent(target)}`);
	}
	return withServerConvexToken(token, () => resolve(event));
};
