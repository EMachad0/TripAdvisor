// Parity: the place and area pages against the OLD server's placePage / areaPage (game/server.js createApp, run
// in-process) on the e2e content and the real repo content, embedded and not. The only differences allowed are the
// deliberate ones: the embed files moved from /game/place.{css,js} to /embed/place.{css,js}, and an area page's back
// link goes to /decide/areas instead of /#/areas. Maps come from the same cache in offline mode on both sides.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { embeddedMapOf, mapBlock, readContentFiles, type ContentFiles } from '#lib/server/maps.js';
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

interface OldApp {
	placePage: (id: string, embed: boolean) => Promise<string | null>;
	areaPage: (id: string, embed: boolean) => Promise<string | null>;
}
interface OldServer {
	createApp: (opts: Record<string, unknown>) => OldApp;
}

const tmp: string[] = [];
const offline = process.env['ATR_OFFLINE'];
beforeAll(() => {
	process.env['ATR_OFFLINE'] = '1';
});
afterAll(() => {
	if (offline === undefined) delete process.env['ATR_OFFLINE'];
	else process.env['ATR_OFFLINE'] = offline;
	for (const d of tmp) fs.rmSync(d, { recursive: true, force: true });
});

async function oldApp(root: string): Promise<OldApp> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atr-pages-parity-'));
	tmp.push(dir);
	const mod = (await import(pathToFileURL(path.join(ROOT, 'game/server.js')).href)) as OldServer;
	return mod.createApp({
		root,
		configFile: path.join(root, 'config', 'trip.yaml'),
		feedbackDir: path.join(dir, 'feedback'),
		stateFile: path.join(dir, 'game-state.json'),
		tripDir: path.join(dir, 'trip'),
		assetsDir: path.join(dir, 'assets'),
		accounts: {},
	});
}

const depsOf = (files: ContentFiles): PageDeps => ({
	files,
	map: (kind, id) => embeddedMapOf(files, kind, id, { offline: true }),
});

/** The old page with the deliberate differences applied. */
const expected = (html: string): string =>
	html
		.replace('href="/game/place.css"', 'href="/embed/place.css"')
		.replace('src="/game/place.js"', 'src="/embed/place.js"')
		.replace('href="/#/areas"', `href="${AREA_HOME}"`);

/** n items spread evenly over the list (the old server re-reads all content per page, so the repo is sampled). */
const spread = <T>(xs: readonly T[], n: number): T[] =>
	xs.length <= n
		? [...xs]
		: Array.from({ length: n }, (_, i) => xs[Math.floor((i * xs.length) / n)] as T);

describe.each([
	{ name: 'e2e content', root: E2E_CONTENT, includeFixtures: true, sample: Infinity },
	{ name: 'repo content', root: ROOT, includeFixtures: false, sample: 6 },
])('parity with the old server: $name', ({ root, includeFixtures, sample }) => {
	let old: OldApp;
	let deps: PageDeps;
	beforeAll(async () => {
		old = await oldApp(root);
		deps = depsOf(readContentFiles({ root, includeFixtures }));
	});

	test('place pages, embedded and not', { timeout: 120_000 }, async () => {
		expect(deps.files.places.length).toBeGreaterThan(0);
		// the sample always includes places with a map block (their pages embed a map)
		const mapped = deps.files.places.filter((p) => mapBlock(p) !== null);
		const places = new Set([...spread(deps.files.places, sample), ...spread(mapped, sample)]);
		for (const p of places) {
			for (const embed of [false, true]) {
				const want = await old.placePage(p.id, embed);
				expect(want, p.id).not.toBeNull();
				expect(await placePageHtml(p.id, embed, deps), `${p.id} embed=${String(embed)}`).toBe(
					expected(want ?? ''),
				);
			}
		}
	});

	test('area pages, embedded and not', { timeout: 120_000 }, async () => {
		expect(deps.files.areas.length).toBeGreaterThan(0);
		for (const a of spread(deps.files.areas, sample)) {
			for (const embed of [false, true]) {
				const want = await old.areaPage(a.id, embed);
				expect(await areaPageHtml(a.id, embed, deps), `${a.id} embed=${String(embed)}`).toBe(
					expected(want ?? ''),
				);
			}
		}
	});

	test('an unknown id is null on both sides', async () => {
		expect(await old.placePage('no-such-place', false)).toBeNull();
		expect(await placePageHtml('no-such-place', false, deps)).toBeNull();
		expect(await old.areaPage('no-such-area', true)).toBeNull();
		expect(await areaPageHtml('no-such-area', true, deps)).toBeNull();
	});
});

describe('page details', () => {
	const files = readContentFiles({ root: E2E_CONTENT, includeFixtures: true });
	const noMap: PageDeps = { files, map: () => Promise.resolve(null) };

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
