// HTTP routes on the Convex site (:3211): Better Auth, plus the two ops routes (plan section 5).
//   POST /ops/content-index  trip-web publishes the content index at boot (Bearer CONTENT_TOKEN)
//   GET  /ops/export         the v1 file bundle with its manifest, read-only (Bearer EXPORT_TOKEN)
import { validate, ValidationError } from 'convex-helpers/validators';
import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';
import { registerAuthRoutes } from './auth';
import { checkBearer, type BearerCheck } from './lib/bearer';
import * as env from './lib/env';
import { contentIndex } from './tables/app';

const http = httpRouter();

registerAuthRoutes(http);

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
	});
}

/** The response for a failed bearer check, or null when the token is good. */
function refusal(check: BearerCheck, route: string): Response | null {
	switch (check) {
		case 'ok':
			return null;
		case 'disabled':
			return json(503, { error: `${route} is not configured on this deployment` });
		case 'unauthorized':
			return json(401, { error: 'unauthorized' });
	}
}

/** The validator's message for a content index body that failed validation. */
function whyInvalid(body: unknown): string {
	try {
		validate(contentIndex.validator, body, { throw: true });
	} catch (error) {
		if (error instanceof ValidationError) return error.message.slice(0, 500);
		throw error;
	}
	return 'unknown reason';
}

http.route({
	path: '/ops/content-index',
	method: 'POST',
	handler: httpAction(async (ctx, request) => {
		const refused = refusal(await checkBearer(request, env.contentTokenSha256()), 'content sync');
		if (refused !== null) return refused;
		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return json(400, { error: 'body must be JSON' });
		}
		if (!validate(contentIndex.validator, body)) {
			return json(400, { error: `invalid content index: ${whyInvalid(body)}` });
		}
		const result = await ctx.runMutation(internal.content.publish, body);
		return json(200, { ok: true, ...result });
	}),
});

http.route({
	path: '/ops/export',
	method: 'GET',
	handler: httpAction(async (ctx, request) => {
		const refused = refusal(await checkBearer(request, env.exportTokenSha256()), 'export');
		if (refused !== null) return refused;
		const result = await ctx.runQuery(internal.exporter.bundle, {});
		return json(200, result);
	}),
});

export default http;
