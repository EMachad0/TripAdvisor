// trip.all, live in the browser (the old GET /api/trip plus its 30 s poll), with typed legs and days, and the
// places joined with the traveler's verdicts (the trip maths skips cards called Skip). Subscribed client side only:
// every server-side Convex call costs a JWKS check on Better Auth (see the (app) layout load).
import { useQuery } from 'convex-svelte';
import { api } from '#convex/_generated/api.js';
import type { AppData } from '#lib/content/app-data.svelte.js';
import type { ContentPlace } from '#lib/content/types.js';
import { asDay, asLeg, type TripAll, type TripDay, type TripDoc, type TripLeg } from './types.ts';

export type TripPlace = ContentPlace & { verdict: 'must' | 'maybe' | 'skip' | null };

const EMPTY: readonly TripDoc[] = [];

export class TripData {
	readonly #query = useQuery(api.trip.all, {});
	readonly #app: AppData;

	constructor(app: AppData) {
		this.#app = app;
	}

	/** True until the first result. */
	readonly loading: boolean = $derived.by(() => this.#query.data === undefined && this.#query.error === undefined);
	readonly error: Error | undefined = $derived.by(() => this.#query.error);
	readonly all: TripAll | undefined = $derived.by(() => this.#query.data);

	col(name: keyof TripAll): readonly TripDoc[] {
		return this.all?.[name] ?? EMPTY;
	}

	readonly legs: TripLeg[] = $derived.by(() => this.col('legs').map(asLeg));
	readonly days: TripDay[] = $derived.by(() => this.col('days').map(asDay));
	readonly places: TripPlace[] = $derived.by(() => {
		const verdicts = this.#app.feedback?.verdicts.place ?? {};
		return this.#app.content.places.map((p) => ({ ...p, verdict: verdicts[p.id] ?? null }));
	});
}
