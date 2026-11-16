// trip.all, subscribed in the browser (old GET /api/trip). Not loaded on the server: every server-side Convex call
// re-checks the JWT against Better Auth's rate-limited JWKS route (see routes/(app)/+layout.server.ts), so the
// screen renders a skeleton until the first result, then stays live.
import { useQuery } from 'convex-svelte';
import { api } from '#convex/_generated/api.js';
import type { TripData } from './trip-docs.ts';

export interface TripQuery {
	readonly data: TripData | undefined;
	readonly error: Error | undefined;
}

export function useTrip(): TripQuery {
	const q = useQuery(api.trip.all, {});
	return {
		get data() {
			return q.data;
		},
		get error() {
			return q.error;
		},
	};
}
