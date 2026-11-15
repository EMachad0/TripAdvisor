// The route: the traveler's order of stops inside each country leg (plan section 5, replacing GET and
// POST /api/route). Seeds come from contentIndex.legs; every save appends a whole stops list for one country
// and the latest line per country wins. Frames and map geometry are added by the SvelteKit load.
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import type { DatabaseReader } from './_generated/server';
import { memberQuery, ownerMutation, type OwnerMutationCtx } from './lib/access';
import { invalid } from './lib/errors';
import { latestVerdicts } from '@atr/shared/feedback';
import { clean as cleanStop, stopsErrors, type CurrentLeg } from '@atr/shared/route';
import { routeFromIndex, routeSummary, sameStops, type RouteSummary } from './lib/logic/route';
import { eventsInFileOrder } from './lib/rows';
import { requireContentIndex, type ContentIndex } from './lib/state';
import {
	country as countryArg,
	routeStop,
	type Country,
	type RouteStop,
} from './tables/validators';

async function routeOf(db: DatabaseReader, index: ContentIndex): Promise<CurrentLeg[]> {
	return routeFromIndex(index, await eventsInFileOrder(db, 'routes'));
}

/** The current route per leg, in trip order, plus the Home line (stops placed, must cities not placed). */
export const current = memberQuery({
	args: {},
	handler: async (ctx): Promise<{ countries: CurrentLeg[]; summary: RouteSummary }> => {
		const index = await requireContentIndex(ctx.db);
		const [countries, swipes] = await Promise.all([
			routeOf(ctx.db, index),
			eventsInFileOrder(ctx.db, 'swipes'),
		]);
		const summary = routeSummary(countries, index.areas, latestVerdicts(swipes).area);
		return { countries, summary };
	},
});

type RouteEvent = Omit<Doc<'routes'>, '_id' | '_creationTime' | 'userId'>;

interface SaveResult {
	ok: true;
	unchanged: boolean;
	event?: RouteEvent;
	country: CurrentLeg;
}

function legOf(index: ContentIndex, country: string): ContentIndex['legs'][number] {
	const leg = index.legs.find((l) => l.country === country);
	if (leg === undefined) {
		throw invalid(`unknown country "${country}" (not a leg in config/trip.yaml)`);
	}
	return leg;
}

/**
 * Stops for a save: validated like the old POST /api/route, each one an area of that country or a stop from
 * the config seed; a stop with no area file keeps the seed's name and coordinates.
 */
function stopsForSave(
	index: ContentIndex,
	country: Country,
	stops: readonly RouteStop[],
): RouteStop[] {
	const leg = legOf(index, country);
	const errs = stopsErrors(stops);
	if (errs.length > 0) throw invalid(errs.slice(0, 3).join('; '));
	const seed = new Map(leg.routeSeed.map((s) => [s.area, s]));
	const areas = new Set(index.areas.filter((a) => a.country === country).map((a) => a.id));
	const unknown = stops.find((s) => !areas.has(s.area) && !seed.has(s.area));
	if (unknown !== undefined) {
		throw invalid(
			`"${unknown.area}" is not a city of ${country} (no area file and not in the config route)`,
		);
	}
	return stops.map((s) => {
		const sd = seed.get(s.area);
		const base: RouteStop = {
			area: s.area,
			...(s.nights === undefined ? {} : { nights: s.nights }),
		};
		if (areas.has(s.area) || sd === undefined) return cleanStop(base);
		return cleanStop({
			...base,
			...(sd.name === undefined ? {} : { name: sd.name }),
			...(sd.lat === undefined ? {} : { lat: sd.lat }),
			...(sd.lng === undefined ? {} : { lng: sd.lng }),
		});
	});
}

/** Append a route line unless it equals the current route; answer with that country's route after it. */
async function saveStops(
	ctx: OwnerMutationCtx,
	index: ContentIndex,
	country: Country,
	stops: RouteStop[],
): Promise<SaveResult> {
	const before = (await routeOf(ctx.db, index)).find((r) => r.id === country);
	let event: RouteEvent | undefined;
	if (before === undefined || !sameStops(before.stops, stops)) {
		event = { v: 1, ts: ctx.ts, session: ctx.session, country, stops };
		await ctx.db.insert('routes', { ...event, userId: ctx.member.authUserId });
	}
	const after = (await routeOf(ctx.db, index)).find((r) => r.id === country);
	if (after === undefined) throw invalid(`unknown country "${country}"`);
	return {
		ok: true,
		unchanged: event === undefined,
		...(event === undefined ? {} : { event }),
		country: after,
	};
}

/** Save the whole ordered list of stops for one country. */
export const save = ownerMutation({
	args: { country: countryArg, stops: v.array(routeStop) },
	handler: async (ctx, args): Promise<SaveResult> => {
		const index = await requireContentIndex(ctx.db);
		return await saveStops(ctx, index, args.country, stopsForSave(index, args.country, args.stops));
	},
});

/** Put one country back to its config seed. */
export const reset = ownerMutation({
	args: { country: countryArg },
	handler: async (ctx, args): Promise<SaveResult> => {
		const index = await requireContentIndex(ctx.db);
		const leg = legOf(index, args.country);
		return await saveStops(ctx, index, args.country, leg.routeSeed.map(cleanStop));
	},
});
