// GET /favicon.ico: the browser asks for it on pages without a <link rel="icon">, such as the place and area
// pages (byte-for-byte ports of the old server's HTML). Same icon as the inline one in app.html, so the console
// shows no 404.
import type { RequestHandler } from './$types';

const ICON =
	"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='16' fill='#9b3d2a'/>" +
	"<text x='32' y='44' font-size='34' text-anchor='middle' fill='white' font-family='Georgia'>A</text></svg>";

export const GET: RequestHandler = () =>
	new Response(ICON, {
		headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' },
	});
