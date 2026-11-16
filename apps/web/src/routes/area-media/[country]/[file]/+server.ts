// GET /area-media/:country/:file.webp: an area photo from areas/<country>/media/ (old Cache-Control: max-age=600).
import path from 'node:path';
import { contentFiles } from '#lib/server/maps.js';
import { fileResponse, inside, notFound, WEBP_FILE } from '../../../media/serve.server.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	if (!WEBP_FILE.test(params.file)) return notFound();
	const areas = path.join(contentFiles().opts.root, 'areas');
	return fileResponse(
		inside(areas, path.join(params.country, 'media', params.file)),
		'max-age=600',
	);
};
