import { expect, test } from 'vitest';
import { forwardedHeaders, forwardToConvexAuth } from './auth-proxy';

test('forwards only the auth headers, plus the app host for Better Auth', () => {
	const headers = forwardedHeaders(
		new Request('https://trip.example/api/auth/get-session', {
			headers: {
				cookie: 'a=1',
				origin: 'https://trip.example',
				'x-secret': 'no',
				host: 'trip.example',
			},
		}),
	);
	expect(headers.get('cookie')).toBe('a=1');
	expect(headers.get('x-secret')).toBeNull();
	expect(headers.get('x-forwarded-host')).toBeNull();
	expect(headers.get('x-better-auth-forwarded-host')).toBe('trip.example');
	expect(headers.get('x-better-auth-forwarded-proto')).toBe('https');
});

test('sends a buffered body to the Convex site path', async () => {
	let seen: { url: string; init: RequestInit | undefined } | undefined;
	const fake: typeof fetch = (input, init) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		seen = { url, init };
		return Promise.resolve(new Response(null, { status: 401 }));
	};
	const response = await forwardToConvexAuth(
		new Request('http://localhost:4173/api/auth/sign-in/username?x=1', {
			method: 'POST',
			body: JSON.stringify({ username: 'a' }),
		}),
		'http://127.0.0.1:3211',
		fake,
	);
	expect(response.status).toBe(401);
	expect(seen?.url).toBe('http://127.0.0.1:3211/api/auth/sign-in/username?x=1');
	expect(seen?.init?.body).toBeInstanceOf(ArrayBuffer);
	expect(seen?.init?.redirect).toBe('manual');
});
