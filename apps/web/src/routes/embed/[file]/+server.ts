// GET /embed/place.css and /embed/place.js: the embed glue of the place and area pages (pages.server.ts links them).
// Served by a route, not from static/, so they sit behind the sign-in hook and go out with Cache-Control: no-cache,
// as the old server's /game/* did. The files live in apps/web/embed (no build step, outside the lint gate).
import css from '../../../../embed/place.css?raw';
import js from '../../../../embed/place.js?raw';
import { notFound } from '../../media/serve.server.js';
import type { RequestHandler } from './$types';

const FILES: Readonly<Record<string, { body: string; type: string }>> = {
	'place.css': { body: css, type: 'text/css; charset=utf-8' },
	'place.js': { body: js, type: 'text/javascript; charset=utf-8' },
};

export const GET: RequestHandler = ({ params }) => {
	const file = Object.hasOwn(FILES, params.file) ? FILES[params.file] : undefined;
	if (file === undefined) return notFound();
	return new Response(file.body, {
		headers: { 'content-type': file.type, 'cache-control': 'no-cache' },
	});
};
