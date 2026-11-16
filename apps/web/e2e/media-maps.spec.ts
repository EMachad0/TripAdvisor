// Slice H: place and area photos, the static maps and the platform assets, with the old server's URLs,
// Cache-Control values, JSON 404s and sign-in rule. The maps come from the map cache: the spec seeds the cache
// files the server looks for, so no test fetches OpenStreetMap tiles.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { STORAGE } from './support';

/**
 * The server's map cache under Playwright: ATR_CACHE_DIR is unset, so <ATR_ROOT>/.cache (gitignored). The names are
 * the cache keys of #lib/server/maps.ts mapKey: lat and lng to 5 decimals, zoom + 1, the size.
 */
const MAP_CACHE = path.resolve(
	import.meta.dirname,
	'../../../packages/migrate/fixtures/e2e/content/.cache/maps',
);
const SEEDED = [
	'31.23000_121.49000_17_1200x720.webp', // place harbin-ice-world (no map block: zoom 16)
	'45.80380_126.53490_11_1200x720.webp', // area harbin (city: zoom 10)
];

test.beforeAll(async () => {
	fs.mkdirSync(MAP_CACHE, { recursive: true });
	for (const name of SEEDED) {
		const file = path.join(MAP_CACHE, name);
		if (fs.existsSync(file)) continue;
		await sharp({ create: { width: 1200, height: 720, channels: 3, background: '#d8d2c4' } })
			.webp()
			.toFile(`${file}.tmp`);
		fs.renameSync(`${file}.tmp`, file);
	}
});

const PHOTO = '/media/harbin-ice-world/snow-sculpture-640.webp';
const AREA_PHOTO = '/area-media/china/snow-sculpture-640.webp';

test.describe('owner', () => {
	test.use({ storageState: STORAGE.owner });

	test('place and area photos: webp, max-age=600', async ({ page }) => {
		for (const url of [PHOTO, AREA_PHOTO]) {
			const r = await page.request.get(url);
			expect(r.status(), url).toBe(200);
			expect(r.headers()['content-type']).toBe('image/webp');
			expect(r.headers()['cache-control']).toBe('max-age=600');
			expect((await r.body()).subarray(8, 12).toString()).toBe('WEBP');
		}
	});

	test('missing photos and paths out of the media folder are JSON 404s', async ({ page }) => {
		for (const url of [
			'/media/harbin-ice-world/nope-640.webp',
			'/media/no-such-place/snow-sculpture-640.webp',
			'/media/harbin-ice-world/place.yaml',
			'/media/harbin-ice-world/..%2Fplace.yaml',
			'/area-media/china/nope.webp',
			'/area-media/..%2F..%2Fconfig/trip.webp',
		]) {
			const r = await page.request.get(url, { maxRedirects: 0 });
			expect(r.status(), url).toBe(404);
			expect(r.headers()['cache-control']).toBe('no-store');
			expect(await r.json()).toEqual({ error: 'not found' });
		}
	});

	test('place and area maps: webp, max-age=86400; unknown ids 404', async ({ page }) => {
		for (const url of ['/map/harbin-ice-world.webp', '/area-map/harbin.webp']) {
			const r = await page.request.get(url);
			expect(r.status(), url).toBe(200);
			expect(r.headers()['content-type']).toBe('image/webp');
			expect(r.headers()['cache-control']).toBe('max-age=86400');
		}
		for (const url of ['/map/no-such-place.webp', '/area-map/no-such-area.webp']) {
			const r = await page.request.get(url);
			expect(r.status(), url).toBe(404);
			expect(await r.json()).toEqual({ error: 'not found' });
		}
	});

	test('platform assets: atr.css and its fonts, max-age=3600', async ({ page }) => {
		const css = await page.request.get('/assets/atr.css');
		expect(css.status()).toBe(200);
		expect(css.headers()['content-type']).toBe('text/css; charset=utf-8');
		expect(css.headers()['cache-control']).toBe('max-age=3600');
		const text = await css.text();
		const font = /url\((?:'|")?(fonts\/[^'")]+\.woff2)/.exec(text)?.[1];
		expect(font).toBeTruthy();
		const woff = await page.request.get(`/assets/${font ?? ''}`);
		expect(woff.status()).toBe(200);
		expect(woff.headers()['content-type']).toBe('font/woff2');
		const missing = await page.request.get('/assets/nope.css');
		expect(missing.status()).toBe(404);
	});

	test('the embed glue is served as static files', async ({ page }) => {
		const js = await page.request.get('/embed/place.js');
		expect(js.status()).toBe(200);
		expect(js.headers()['content-type']).toMatch(/javascript/);
		const css = await page.request.get('/embed/place.css');
		expect(css.status()).toBe(200);
		expect(await css.text()).toContain('html[data-embed="1"] .topbar');
	});
});

test.describe('guest', () => {
	test.use({ storageState: STORAGE.guest });

	test('sees photos and maps like the owner', async ({ page }) => {
		for (const url of [PHOTO, AREA_PHOTO, '/area-map/harbin.webp', '/assets/atr.css']) {
			expect((await page.request.get(url)).status(), url).toBe(200);
		}
	});
});

test.describe('signed out', () => {
	test('photos and maps send the visitor to the login page', async ({ request }) => {
		for (const url of [PHOTO, AREA_PHOTO, '/map/harbin-ice-world.webp', '/area-map/harbin.webp']) {
			const r = await request.get(url, { maxRedirects: 0 });
			expect(r.status(), url).toBe(303);
			expect(r.headers()['location']).toMatch(/^\/login\?redirectTo=/);
		}
	});
});
