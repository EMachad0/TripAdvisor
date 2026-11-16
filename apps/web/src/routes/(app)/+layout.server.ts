// The signed-in area. hooks.server.ts already redirected visitors with no token; here the token meets Convex,
// which also refuses revoked sessions. Then everything the old GET /api/state, GET /api/route and GET /api/answers
// gave the client: the content model (cached per process), live feedback.state (convexLoad, so the browser keeps it
// subscribed) and the isNew flags for the first render. route.current and the route model (old GET /api/route) are
// live in getAppData().route.
// `depends('app:content')`: the version poll and focus refresh rerun this load with invalidateAll().
import { redirect } from '@sveltejs/kit';
import { convexLoad, createConvexHttpClient } from 'convex-svelte/sveltekit';
import { api } from '#convex/_generated/api.js';
import { accessErrorCode } from '#lib/access-error.js';
import type { AppLayoutData } from '#lib/content/app-data.svelte.js';
import { isoNow, withNewFlags } from '#lib/content/derive.js';
import { clearAuthCookies } from '#lib/server/auth-cookies.js';
import { getContent } from '#lib/server/content.js';
import type { Me } from '#lib/members.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, depends }) => {
	depends('app:content');
	let me: Me;
	try {
		me = await createConvexHttpClient().query(api.members.me, {});
	} catch (error) {
		if (accessErrorCode(error) === 'Unauthenticated') {
			clearAuthCookies(cookies);
			redirect(303, '/login');
		}
		throw error;
	}
	const { payload } = getContent();
	// One live query beside members.me: every server-side Convex call re-checks the JWT against Better Auth's JWKS
	// route (rate limited), so route.current is subscribed in the browser instead (app-data.svelte.ts).
	const feedback = await convexLoad(api.feedback.state, {});
	const now = isoNow();
	const data = {
		me,
		content: withNewFlags(payload, feedback.data, now),
		feedback,
		now,
	} satisfies AppLayoutData;
	return data;
};
