// GET /place/:id (?embed=1 inside the sheet): the platform's place page with the game chrome (pages.server.ts).
import { pageResponse, placePageHtml } from '../pages.server.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) =>
	pageResponse('place', await placePageHtml(params.id, url.searchParams.get('embed') === '1'));
