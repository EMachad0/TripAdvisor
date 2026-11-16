// GET /area/:id (?embed=1 inside the sheet): the curator's area page with the game chrome.
import { areaPageHtml, pageResponse } from '../../place/pages.server.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) =>
	pageResponse('area', await areaPageHtml(params.id, url.searchParams.get('embed') === '1'));
