// The signed-in area. hooks.server.ts already redirected visitors with no token; here the token meets Convex,
// which also refuses revoked sessions.
import { redirect } from '@sveltejs/kit';
import { createConvexHttpClient } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { api } from '#convex/_generated/api.js';
import { accessErrorCode } from '#lib/access-error.js';
import { clearAuthCookies } from '#lib/server/auth-cookies.js';
import type { Me } from '#lib/members.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies }) => {
	try {
		const me: Me = await createConvexHttpClient().query(api.members.me, {});
		return { me };
	} catch (error) {
		if (accessErrorCode(error) === 'Unauthenticated') {
			clearAuthCookies(cookies);
			redirect(303, '/login');
		}
		throw error;
	}
};
