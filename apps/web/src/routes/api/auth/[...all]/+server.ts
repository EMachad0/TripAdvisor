// Better Auth proxy: /api/auth/* on this origin -> the Convex site (:3211), with the per-IP sign-in limiter.
import { PUBLIC_CONVEX_SITE_URL } from '$app/env/public';
import { forwardToConvexAuth } from '#lib/server/auth-proxy.js';
import { isSignInPath, loginLimiter } from '#lib/server/login-limiter.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) =>
	forwardToConvexAuth(request, PUBLIC_CONVEX_SITE_URL);

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	if (!isSignInPath(url.pathname))
		return await forwardToConvexAuth(request, PUBLIC_CONVEX_SITE_URL);
	const ip = getClientAddress();
	if (loginLimiter.isBlocked(ip)) {
		return Response.json(
			{ code: 'TOO_MANY_ATTEMPTS', message: 'Too many sign-in attempts. Try again in 10 minutes.' },
			{ status: 429, headers: { 'retry-after': '600' } },
		);
	}
	const response = await forwardToConvexAuth(request, PUBLIC_CONVEX_SITE_URL);
	if (response.status === 401) loginLimiter.recordFailure(ip);
	return response;
};
