// The base images of the route map by key (`overview` and one per country leg), with the arguments that render
// them (old game/server.js routeModel()._frames, read by GET /route-map/:key.webp). Pure.
//
// The old server built the frames from the live route model. They depend only on each leg's cities: areas with
// coordinates plus located stops, and a saved stop is always an area of its country or a config seed stop (route.save
// refuses anything else). So the frames of the seed route are the frames of any saved route, and the image endpoint
// needs no Convex call.
import { routeFrames, type RouteFrameArgs } from '@atr/shared/routemodel';
import { layoutRouteModel } from '#lib/content/derive.js';
import type { ContentPayload } from '#lib/content/types.js';

/** A frame key as the old URL accepted it. */
export const FRAME_KEY = /^[a-z0-9-]+$/;

export function frameArgs(content: ContentPayload): Record<string, RouteFrameArgs | null> {
	return routeFrames(layoutRouteModel(content, null, null).countries);
}

/** The frame for a key, or null for an unknown key or a leg with no located city. */
export function frameOf(content: ContentPayload, key: string): RouteFrameArgs | null {
	if (!FRAME_KEY.test(key)) return null;
	const frames = frameArgs(content);
	return Object.hasOwn(frames, key) ? (frames[key] ?? null) : null;
}
