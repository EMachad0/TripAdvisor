// Universal hooks: one Convex client per process/tab, and the convexLoad transport (SSR -> live query).
import { PUBLIC_CONVEX_URL } from '$app/env/public';
import { decodeConvexLoad, encodeConvexLoad, initConvex } from 'convex-svelte/sveltekit';
import type { Transport } from '@sveltejs/kit/hooks';

initConvex(PUBLIC_CONVEX_URL);

export const transport: Transport = {
	ConvexLoadResult: { encode: encodeConvexLoad, decode: decodeConvexLoad },
};
