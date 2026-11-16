// GET /healthz (plan section 5): public liveness for Traefik, Coolify and the task 8 checks.
//   /healthz          {ok: true, sha}
//   /healthz?deep=1   also checks that Convex answers GET /version (3 s timeout): 200 {ok, sha, convex: {ok}},
//                     503 when it does not.
import { GIT_SHA } from '$app/env/private';
import { PUBLIC_CONVEX_URL } from '$app/env/public';
import { version } from '$app/env';
import type { RequestHandler } from './$types';

const NO_STORE = { 'cache-control': 'no-store' };

async function convexReachable(): Promise<{ ok: boolean; status?: number; error?: string }> {
	try {
		const res = await fetch(new URL('/version', PUBLIC_CONVEX_URL), {
			signal: AbortSignal.timeout(3000),
		});
		return { ok: res.ok, status: res.status };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.name : 'unreachable' };
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const sha = GIT_SHA ?? version;
	if (url.searchParams.get('deep') !== '1')
		return Response.json({ ok: true, sha }, { headers: NO_STORE });
	const convex = await convexReachable();
	return Response.json(
		{ ok: convex.ok, sha, convex },
		{ status: convex.ok ? 200 : 503, headers: NO_STORE },
	);
};
