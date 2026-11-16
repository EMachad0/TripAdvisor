// The sign-in form action (plan section 6, spike S10): works with JavaScript off, so password managers keep
// working. It calls the Better Auth proxy server-side and forwards its Set-Cookie headers.
import { fail, redirect } from '@sveltejs/kit';
import { applySetCookies } from '#lib/server/auth-cookies.js';
import { safeRedirectTarget } from '#lib/server/auth-guard.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.token !== undefined)
		redirect(303, safeRedirectTarget(url.searchParams.get('redirectTo')));
};

const field = (data: FormData, name: string): string => {
	const value = data.get(name);
	return typeof value === 'string' ? value : '';
};

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const username = field(data, 'username').trim();
		const password = field(data, 'password');
		if (username === '' || password === '') {
			return fail(400, { username, message: 'Enter your username and password.' });
		}
		const response = await event.fetch('/api/auth/sign-in/username', {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: event.url.origin },
			body: JSON.stringify({ username, password, rememberMe: true }),
		});
		if (response.status === 429) {
			return fail(429, { username, message: 'Too many attempts. Try again in 10 minutes.' });
		}
		if (!response.ok) return fail(400, { username, message: 'Wrong username or password.' });
		applySetCookies(event.cookies, response);
		redirect(303, safeRedirectTarget(event.url.searchParams.get('redirectTo')));
	},
};
