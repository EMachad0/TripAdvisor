// The app-wide data every screen reads (FROZEN interface): content from the (app) layout load joined with the live
// feedback.state and route.current queries. The layout creates it once (setAppData); screens call getAppData() and
// read reactive fields. isNew flags and the route model follow every swipe and route save without a reload.
import { getContext, setContext } from 'svelte';
import { useQuery } from 'convex-svelte';
import { api } from '#convex/_generated/api.js';
import type { FeedbackState } from '#convex/feedback.js';
import type { Me } from '#lib/members.js';
import { isoNow, layoutRouteModel, withNewFlags } from './derive.ts';
import type { ContentPayload, RouteModel } from './types.ts';

/** A live query result as the layout hands it over (convexLoad's DetachedQueryResult, or a plain snapshot). */
export interface LiveResult<T> {
	readonly data: T | undefined;
	readonly isLoading?: boolean;
	readonly error?: Error | undefined;
}

/** What the (app) layout load returns (see routes/(app)/+layout.server.ts). */
export interface AppLayoutData {
	me: Me;
	content: ContentPayload;
	feedback: LiveResult<FeedbackState>;
	/** Server time of the load (ISO), the "now" for cards with no firstSeen row yet. */
	now: string;
}

export class AppData {
	readonly #source: () => AppLayoutData;
	/** route.current, subscribed in the browser (NoContent before the index is published: the seeds are used). */
	readonly #route = useQuery(api.route.current, {});

	constructor(source: () => AppLayoutData) {
		this.#source = source;
	}

	/** The signed-in member. */
	readonly me: Me = $derived.by(() => this.#source().me);
	readonly isGuest: boolean = $derived.by(() => this.#source().me.role === 'guest');
	/** Live feedback.state (undefined until the first result). */
	readonly feedback: FeedbackState | undefined = $derived.by(() => this.#source().feedback.data);
	/** Content with live isNew flags on places and areas. */
	readonly content: ContentPayload = $derived.by(() => {
		const s = this.#source();
		return withNewFlags(s.content, s.feedback.data, s.now || isoNow());
	});
	/**
	 * The Route tab model (old GET /api/route) from live route.current and verdicts; the config seeds until the first
	 * result (server render included).
	 */
	readonly route: RouteModel = $derived.by(() => {
		const s = this.#source();
		return layoutRouteModel(
			s.content,
			this.#route.data?.countries ?? null,
			s.feedback.data?.verdicts,
		);
	});
	/** route.current itself (stops, summary), undefined until the first result. */
	readonly currentRoute = $derived.by(() => this.#route.data);
}

const KEY = Symbol('atr.appData');

/** Called once by the (app) layout. */
export function setAppData(source: () => AppLayoutData): AppData {
	return setContext(KEY, new AppData(source));
}

/** The app data, from any component under the (app) layout. */
export function getAppData(): AppData {
	const data = getContext<AppData | undefined>(KEY);
	if (data === undefined) throw new Error('getAppData() outside the (app) layout');
	return data;
}
