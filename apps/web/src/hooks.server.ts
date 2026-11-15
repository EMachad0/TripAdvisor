// Server hooks (plan section 6): refresh the 15-minute Convex JWT from the 400-day session (the SSR JWT gap,
// spike S9), hand the token to convexLoad/createConvexHttpClient, and send signed-out visitors to /login.
import type { Handle } from '@sveltejs/kit/hooks';
import { redirect } from '@sveltejs/kit';
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

/** A session cookie without a Convex JWT: ask Better Auth for a fresh JWT with the session cookie forwarded. */
async function refreshConvexJwt(event: Parameters<Handle>[0]['event']): Promise<void> {
	if (event.url.pathname.startsWith('/api/auth/')) return;
	if (!hasCookie(event.cookies, SESSION_COOKIES) || hasCookie(event.cookies, JWT_COOKIES)) return;
	const response = await event.fetch('/api/auth/convex/token', {
		headers: { origin: event.url.origin },
	});
	if (response.ok) applySetCookies(event.cookies, response);
	// The session is gone (signed out elsewhere, expired, revoked): drop the stale cookie instead of asking again.
	else if (response.status === 401) clearAuthCookies(event.cookies);
}

export const handle: Handle = async ({ event, resolve }) => {
	await refreshConvexJwt(event);
	const token = getToken(event.cookies);
	event.locals.token = token;
	if (token === undefined && !isPublicPath(event.url.pathname)) {
		const target = `${event.url.pathname}${event.url.search}`;
		redirect(303, target === '/' ? '/login' : `/login?redirectTo=${encodeURIComponent(target)}`);
	}
	return withServerConvexToken(token, () => resolve(event));
};
