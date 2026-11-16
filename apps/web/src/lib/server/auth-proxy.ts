// Forward /api/auth/* to Better Auth on the Convex site. Same headers as createSvelteKitHandler from
// @mmailaender/convex-better-auth-svelte 0.10.0, but the body is sent as a buffer: that handler re-wraps the
// incoming Request, which leaves a streamed body without a source, and Node's fetch then turns every 401 (a wrong
// password) into "TypeError: fetch failed / expected non-null body source" (Fetch spec 401 handling), i.e. a 500.

/** Request headers Better Auth needs; everything else stays on this side. */
const FORWARDED_HEADERS = new Set([
	'accept',
	'authorization',
	'better-auth-cookie',
	'content-type',
	'cookie',
	'origin',
	'referer',
	'user-agent',
]);

export function forwardedHeaders(request: Request): Headers {
	const url = new URL(request.url);
	const proto = url.protocol.replace(/:$/, '');
	const headers = new Headers();
	for (const [name, value] of request.headers) {
		if (FORWARDED_HEADERS.has(name.toLowerCase())) headers.set(name, value);
	}
	// No x-forwarded-host: Convex routes by it. The component restores the app host from these two.
	headers.set('x-forwarded-proto', proto);
	headers.set('x-better-auth-forwarded-host', url.host);
	headers.set('x-better-auth-forwarded-proto', proto);
	headers.set('accept-encoding', 'identity');
	return headers;
}

export async function forwardToConvexAuth(
	request: Request,
	convexSiteUrl: string,
	fetchImpl: typeof fetch = fetch,
): Promise<Response> {
	const url = new URL(request.url);
	const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
	return await fetchImpl(`${convexSiteUrl}${url.pathname}${url.search}`, {
		method: request.method,
		headers: forwardedHeaders(request),
		...(hasBody ? { body: await request.arrayBuffer() } : {}),
		redirect: 'manual',
	});
}
