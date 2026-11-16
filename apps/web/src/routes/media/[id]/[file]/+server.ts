// GET /media/:placeId/:file.webp: a place's photo from its media/ folder (old Cache-Control: max-age=600).
import { contentFiles } from '#lib/server/maps.js';
import { fileResponse, inside, notFound, WEBP_FILE } from '../../serve.server.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	if (!WEBP_FILE.test(params.file)) return notFound();
	const place = contentFiles().byId.get(params.id);
	return fileResponse(place ? inside(place._meta.mediaDir, params.file) : null, 'max-age=600');
};
