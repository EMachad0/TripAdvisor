// Pure joins of the content model with live Convex data (FROZEN signatures): the "New" flags from feedback.state
// and the Route tab model from route.current. Run by the (app) layout load for SSR and again in the browser by
// app-data.svelte.ts whenever a query updates.
import { isNewCard, seenKey } from '@atr/shared/content';
import { currentRoute, type CurrentLeg } from '@atr/shared/route';
import { routeModel, type RouteModel } from '@atr/shared/routemodel';
import type { ContentPayload } from './types.ts';

/** The feedback.state fields the joins read (structurally a subset of FeedbackState in convex/feedback.ts). */
export interface SeenState {
	verdicts: { area: Readonly<Record<string, string>>; place: Readonly<Record<string, string>> };
	firstSeen: Readonly<Record<string, string>>;
	firstRun: string | null;
}

/** ISO second-precision UTC stamp, the format of feedback `ts` and firstSeen values. */
export const isoNow = (d: Date = new Date()): string => `${d.toISOString().slice(0, 19)}Z`;

/**
 * The payload with `isNew` set on every place and area (old rule: not swiped and first seen after the first run;
 * a card with no firstSeen row yet counts as seen `now`). Without feedback (still loading) nothing is new.
 */
export function withNewFlags(
	content: ContentPayload,
	feedback: SeenState | null | undefined,
	now: string,
): ContentPayload {
	if (feedback === null || feedback === undefined) return content;
	const { verdicts, firstSeen, firstRun } = feedback;
	// The old swiped set held place and area ids together, so a place sharing an id with a swiped area is not new.
	const swipedPlace = (id: string): boolean =>
		Object.hasOwn(verdicts.place, id) || Object.hasOwn(verdicts.area, id);
	return {
		...content,
		places: content.places.map((p) => ({
			...p,
			isNew: isNewCard(seenKey('place', p.id), swipedPlace(p.id), firstSeen, firstRun, now),
		})),
		areas: content.areas.map((a) => ({
			...a,
			isNew: isNewCard(
				seenKey('area', a.id),
				Object.hasOwn(verdicts.area, a.id),
				firstSeen,
				firstRun,
				now,
			),
		})),
	};
}

/** The firstSeen keys of the content (places by id, areas as `area:<id>`), in content order. */
export function contentKeys(content: Pick<ContentPayload, 'places' | 'areas'>): string[] {
	return [
		...content.places.map((p) => seenKey('place', p.id)),
		...content.areas.map((a) => seenKey('area', a.id)),
	];
}

/** Keys feedback.trackSeen still has to record (all of them on the first run). Empty: no call needed. */
export function keysToTrack(
	content: Pick<ContentPayload, 'places' | 'areas'>,
	feedback: Pick<SeenState, 'firstSeen' | 'firstRun'>,
): string[] {
	const keys = contentKeys(content);
	if (feedback.firstRun === null) return keys;
	return keys.filter((k) => !Object.hasOwn(feedback.firstSeen, k));
}

/** The current route from the config seeds alone (before the content index is published). */
export function seedRoute(
	content: Pick<ContentPayload, 'countries' | 'routeBase' | 'areas'>,
): CurrentLeg[] {
	const countries = content.routeBase.countries.map((c) => {
		const leg = content.countries.find((x) => x.id === c.id);
		return { id: c.id, from: leg?.from, to: leg?.to, route: c.route };
	});
	const areas = content.areas.map((a) => ({
		id: a.id,
		country: a.country,
		name: a.name,
		lat: a.lat ?? undefined,
		lng: a.lng ?? undefined,
	}));
	return currentRoute({ cfg: { countries }, areas, events: [] });
}

/** The Route tab model (old GET /api/route) for the current route (null: use the seeds) and verdicts. */
export function layoutRouteModel(
	content: ContentPayload,
	current: readonly CurrentLeg[] | null | undefined,
	verdicts: SeenState['verdicts'] | null | undefined,
): RouteModel {
	return routeModel({
		countries: content.routeBase.countries,
		areas: content.areas.map((a) => ({
			id: a.id,
			country: a.country,
			name: a.name,
			lat: a.lat,
			lng: a.lng,
			scope: a.scope,
			cities: a.cities,
		})),
		places: content.places,
		route: current ?? seedRoute(content),
		verdicts: (verdicts ?? { area: {}, place: {} }) as RouteModelVerdicts,
		home: content.routeBase.home,
		warnings: content.routeBase.warnings,
		fixtures: content.fixtures,
	});
}

type RouteModelVerdicts = Parameters<typeof routeModel>[0]['verdicts'];

/** The old toast text for cards that appeared since the last load (null on the first load or when none did). */
export function newCardsMessage(
	before: readonly string[] | null,
	after: readonly string[],
): string | null {
	if (before === null) return null;
	const prev = new Set(before);
	const added = after.filter((id) => !prev.has(id)).length;
	if (added === 0) return null;
	return `✨ ${String(added)} new card${added === 1 ? '' : 's'} from the curator`;
}
