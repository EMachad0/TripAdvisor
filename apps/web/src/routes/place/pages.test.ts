// The place and area pages (placePageHtml / areaPageHtml) on the e2e content. Until the old site was retired they were
// also compared byte for byte with the old server's pages; these are the checks that stand on their own.
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { readContentFiles } from '#lib/server/maps.js';
import {
	AREA_HOME,
	areaPageHtml,
	notFoundHtml,
	pageResponse,
	placePageHtml,
	withTz,
	type PageDeps,
} from './pages.server';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const E2E_CONTENT = path.join(ROOT, 'packages/migrate/fixtures/e2e/content');

describe('page details', () => {
	const files = readContentFiles({ root: E2E_CONTENT, includeFixtures: true });
	const noMap: PageDeps = { files, map: () => Promise.resolve(null) };

	test('an unknown id is null', async () => {
		expect(await placePageHtml('no-such-place', false, noMap)).toBeNull();
		expect(await areaPageHtml('no-such-area', true, noMap)).toBeNull();
	});

	test('embed marks the html, links stay in the sheet, and the embed glue is loaded', async () => {
		const html = (await placePageHtml('harbin-ice-world', true, noMap)) ?? '';
		expect(html).toContain('<html lang="en" data-embed="1"');
		expect(html).toContain('<link rel="stylesheet" href="/embed/place.css">');
		expect(html).toContain('<script type="module" src="/embed/place.js"></script></body>');
		expect(html).toContain('<span class="lbl">Back to the game</span>');
		expect(html).toContain('href="/assets/atr.css"');
		expect(html).toMatch(/src="\/media\/harbin-ice-world\/snow-sculpture-\d+\.webp"/);
		const plain = (await placePageHtml('harbin-ice-world', false, noMap)) ?? '';
		expect(plain).not.toContain('data-embed');
	});

	test('answers about the place sit above the footer, marked with the country offset', async () => {
		const html = (await placePageHtml('harbin-ice-world', false, noMap)) ?? '';
		expect(html).toContain('id="answers"');
		expect(html).toMatch(/<article data-tz="8" class="qa" id="answer-[^"]+"/);
		expect(html.indexOf('id="answers"')).toBeLessThan(html.indexOf('<p class="site-foot">'));
		// the answer's raw <script> stays escaped
		expect(html).not.toContain('<script>alert(1)</script>');
	});

	test('a rendered map is embedded in the area page', async () => {
		const withMap: PageDeps = {
			files,
			map: (kind, id) =>
				Promise.resolve(
					kind === 'area' ? { url: `/area-map/${id}.webp`, width: 1200, height: 720 } : null,
				),
		};
		const html = (await areaPageHtml('harbin', false, withMap)) ?? '';
		expect(html).toContain('/area-map/harbin.webp');
		expect(html).toContain(`href="${AREA_HOME}"`);
		expect(html).toMatch(/src="\/area-media\/china\/snow-sculpture-\d+\.webp"/);
	});

	test('withTz marks the root element only when the country has an offset', () => {
		expect(withTz('<article class="qa">x</article>', 'japan')).toBe(
			'<article data-tz="9" class="qa">x</article>',
		);
		expect(withTz('<article>x</article>', 'atlantis')).toBe('<article>x</article>');
		expect(withTz('<article>x</article>', null)).toBe('<article>x</article>');
	});

	test('responses: html, no-store; the old 404 page', async () => {
		const ok = pageResponse('place', '<html></html>');
		expect(ok.status).toBe(200);
		expect(ok.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(ok.headers.get('cache-control')).toBe('no-store');
		const missing = pageResponse('area', null);
		expect(missing.status).toBe(404);
		expect(missing.headers.get('cache-control')).toBe('no-store');
		expect(await missing.text()).toBe(notFoundHtml('area'));
		expect(notFoundHtml('place')).toContain("This place doesn't exist (any more).");
	});
});
