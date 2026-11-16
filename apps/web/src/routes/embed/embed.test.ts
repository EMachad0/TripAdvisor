// /embed/place.{css,js}: served by a route with the old /game/* Cache-Control, and a JSON 404 for anything else.
import { describe, expect, test } from 'vitest';
import { GET } from './[file]/+server';

type Event = Parameters<typeof GET>[0];
const get = (file: string): Promise<Response> =>
	Promise.resolve(GET({ params: { file } } as unknown as Event));

describe('/embed', () => {
	test('place.css and place.js go out with their type and no-cache', async () => {
		const css = await get('place.css');
		expect(css.status).toBe(200);
		expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8');
		expect(css.headers.get('cache-control')).toBe('no-cache');
		expect((await css.text()).length).toBeGreaterThan(100);
		const js = await get('place.js');
		expect(js.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
		expect(await js.text()).toContain("atr: 'close'");
	});

	test('any other name is the old JSON 404', async () => {
		for (const name of ['game.js', 'constructor', '..%2Fplace.js']) {
			const r = await get(name);
			expect(r.status).toBe(404);
			expect(await r.json()).toEqual({ error: 'not found' });
		}
	});
});
