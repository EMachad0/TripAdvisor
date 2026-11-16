// Sign out: Better Auth deletes the session row (real revocation), then the cookies go.
import { redirect } from '@sveltejs/kit';
import { clearAuthCookies } from '#lib/server/auth-cookies.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	redirect(303, '/');
};

export const actions: Actions = {
	default: async (event) => {
		await event.fetch('/api/auth/sign-out', {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: event.url.origin },
			body: '{}',
		});
		clearAuthCookies(event.cookies);
		redirect(303, '/login');
	},
};
