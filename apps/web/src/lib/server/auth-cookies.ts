// Better Auth cookie handling for server-side calls (login action, logout, the SSR JWT refresh).
import type { Cookies } from '@sveltejs/kit';
import { parseSetCookieHeader, toCookieOptions } from 'better-auth/cookies';

const PREFIX = 'better-auth';
const names = (name: string): string[] => [`__Secure-${PREFIX}.${name}`, `${PREFIX}.${name}`];

export const SESSION_COOKIES = names('session_token');
export const JWT_COOKIES = names('convex_jwt');

export function hasCookie(cookies: Cookies, candidates: string[]): boolean {
	return candidates.some((name) => (cookies.get(name) ?? '') !== '');
}

/** Copy the Set-Cookie headers of a Better Auth response onto this request's cookies. */
export function applySetCookies(cookies: Cookies, response: Response): void {
	for (const header of response.headers.getSetCookie()) {
		for (const [name, attributes] of parseSetCookieHeader(header)) {
			const options = toCookieOptions(attributes);
			cookies.set(name, attributes.value, {
				path: options.path ?? '/',
				...(options.maxAge === undefined ? {} : { maxAge: options.maxAge }),
				...(options.expires === undefined ? {} : { expires: options.expires }),
				...(options.httpOnly === undefined ? {} : { httpOnly: options.httpOnly }),
				...(options.secure === undefined ? {} : { secure: options.secure }),
				...(options.sameSite === undefined ? {} : { sameSite: options.sameSite }),
			});
		}
	}
}

/** Drop every Better Auth cookie (after sign-out, or when the session is gone). */
export function clearAuthCookies(cookies: Cookies): void {
	for (const name of [...SESSION_COOKIES, ...JWT_COOKIES]) cookies.delete(name, { path: '/' });
}
