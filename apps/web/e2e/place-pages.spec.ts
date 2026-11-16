// Slice H: the place and area full pages (platform HTML, also inside the sheet's iframe with ?embed=1) and the embed
// glue in apps/web/embed/place.js: time labels on answer cards, #answer-<id> opens its card, and in the sheet the theme
// follows the app while Escape and the brand link close it (@embed, plan section 10).
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { STORAGE } from './support';

/** The server's map cache under Playwright (<ATR_ROOT>/.cache; keys as in #lib/server/maps.ts mapKey). */
const MAP_CACHE = path.resolve(
	import.meta.dirname,
	'../../../packages/migrate/fixtures/e2e/content/.cache/maps',
);
const SEEDED = [
	'45.80380_126.53490_11_1200x720.webp', // area harbin (city: zoom 10)
	'35.01160_135.76810_11_1200x720.webp', // area kyoto
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

const PLACE = '/place/harbin-ice-world';
const ANSWER = 'answer-2026-11-20-ice-world-christmas';

/** Replace the page with a same-origin parent holding the embedded page, and record what it posts up. */
async function openInSheet(page: Page, src: string): Promise<void> {
	await page.goto(PLACE);
	await page.evaluate((frameSrc) => {
		const w = window as Window & { atrMessages?: unknown[] };
		w.atrMessages = [];
		window.addEventListener('message', (e) => {
			if (e.origin === location.origin) w.atrMessages?.push(e.data);
		});
		document.body.replaceChildren();
		const frame = document.createElement('iframe');
		frame.title = 'Place page';
		frame.src = frameSrc;
		frame.width = '360';
		frame.height = '600';
		document.body.append(frame);
	}, src);
	await expect(page.frameLocator('iframe').locator('h1')).toBeVisible();
}

const messages = (page: Page): Promise<unknown[]> =>
	page.evaluate(() => (window as Window & { atrMessages?: unknown[] }).atrMessages ?? []);

test.describe('owner', () => {
	test.use({ storageState: STORAGE.owner });

	test('a place page: platform HTML, back link, answers with time zones, no-store', async ({
		page,
	}) => {
		const response = await page.goto(PLACE);
		expect(response?.status()).toBe(200);
		expect(response?.headers()['cache-control']).toBe('no-store');
		await expect(page.locator('h1')).toContainText('Harbin Ice');
		const back = page.locator('.topbar .brand');
		await expect(back).toBeVisible();
		await expect(back).toHaveText(/Back to the game/);
		await expect(back).toHaveAttribute('href', '/');
		// atr.css is applied (its fonts and layout, not the browser defaults)
		await expect(page.locator('.topbar')).toHaveCSS('display', 'flex');
		const hero = page.locator('img[src^="/media/harbin-ice-world/"]').first();
		await expect(hero).toBeVisible();
		expect(await hero.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
		// the answer card about this place, with its country's offset written beside each time
		const card = page.locator(`#${ANSWER}`);
		await expect(card).toBeVisible();
		await expect(card).toHaveAttribute('data-tz', '8');
		await expect(card.locator('.qa__tldr')).toContainText('11:00–21:30 UTC+8');
		await expect(card.locator('details')).not.toHaveAttribute('open');
	});

	test('#answer-<id> opens that card', async ({ page }) => {
		await page.goto(`${PLACE}#${ANSWER}`);
		const card = page.locator(`#${ANSWER}`);
		await expect(card).toHaveClass(/is-target/);
		await expect(card.locator('details')).toHaveAttribute('open', '');
		await expect(card.locator('.qa__body')).toContainText('Last entry 20:30 UTC+8');
	});

	test('the theme toggle on the page switches and remembers the theme', async ({ page }) => {
		await page.goto(PLACE);
		const html = page.locator('html');
		const before = await page.evaluate(() =>
			matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
		);
		await page.locator('.theme-toggle').click();
		const after = before === 'dark' ? 'light' : 'dark';
		await expect(html).toHaveAttribute('data-theme', after);
		expect(await page.evaluate(() => localStorage.getItem('atr-theme'))).toBe(after);
		await page.evaluate(() => {
			localStorage.removeItem('atr-theme');
		});
	});

	test('an area page: map, answers, back link to the area deck', async ({ page }) => {
		const response = await page.goto('/area/kyoto');
		expect(response?.status()).toBe(200);
		await expect(page.locator('h1')).toContainText('Kyoto');
		await expect(page.locator('img[src="/area-map/kyoto.webp"]')).toBeAttached();
		await expect(page.locator('.topbar .brand')).toHaveAttribute('href', '/decide/areas');
		await expect(page.locator('#answers .qa')).toHaveCount(1);
		await page.goto('/area/harbin');
		await expect(
			page.locator('img[src^="/area-media/china/snow-sculpture-"]').first(),
		).toBeVisible();
	});

	test('an unknown place or area is the old 404 page', async ({ page }) => {
		for (const url of ['/place/no-such-place', '/area/no-such-area?embed=1']) {
			const response = await page.goto(url);
			expect(response?.status(), url).toBe(404);
			await expect(page.getByText(/doesn't exist \(any more\)/)).toBeVisible();
			await expect(page.getByRole('link', { name: 'Back to the game' })).toHaveAttribute(
				'href',
				'/',
			);
		}
	});

	test('@embed in the sheet: no top bar, links stay embedded, the theme follows the app', async ({
		page,
	}) => {
		await openInSheet(page, `${PLACE}?embed=1`);
		const frame = page.frameLocator('iframe');
		await expect(frame.locator('html')).toHaveAttribute('data-embed', '1');
		await expect(frame.locator('.topbar')).toBeHidden();
		const links = frame.locator('a[href^="/place/"]');
		for (const href of await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
			expect(href).toMatch(/\?embed=1$/);
		}
		await page.evaluate(() => {
			document
				.querySelector('iframe')
				?.contentWindow?.postMessage({ atr: 'theme', theme: 'dark' }, location.origin);
		});
		await expect(frame.locator('html')).toHaveAttribute('data-theme', 'dark');
		await page.evaluate(() => {
			document
				.querySelector('iframe')
				?.contentWindow?.postMessage({ atr: 'theme', theme: null }, location.origin);
		});
		await expect(frame.locator('html')).not.toHaveAttribute('data-theme', /.+/);
	});

	test('@embed Escape and the brand link ask the app to close the sheet', async ({ page }) => {
		await openInSheet(page, `${PLACE}?embed=1`);
		const frame = page.frameLocator('iframe');
		await frame.locator('h1').click();
		// The page first says its text is there (the sheet's skeleton waits for this).
		const ready = { atr: 'ready', path: `${PLACE}?embed=1` };
		await expect.poll(() => messages(page)).toEqual([ready]);
		await page.keyboard.press('Escape');
		await expect.poll(() => messages(page)).toEqual([ready, { atr: 'close' }]);
		await frame.locator('.topbar .brand').dispatchEvent('click');
		await expect.poll(() => messages(page)).toEqual([ready, { atr: 'close' }, { atr: 'close' }]);
		// the click was turned into a message: the frame did not navigate
		await expect(frame.locator('h1')).toContainText('Harbin Ice');
	});

	test('@embed #answer-<id> opens that card inside the sheet', async ({ page }) => {
		await openInSheet(page, `${PLACE}?embed=1#${ANSWER}`);
		const card = page.frameLocator('iframe').locator(`#${ANSWER}`);
		await expect(card).toHaveClass(/is-target/);
		await expect(card.locator('details')).toHaveAttribute('open', '');
	});

	test('a page opened on its own posts nothing on Escape', async ({ page }) => {
		await openInSheet(page, PLACE);
		await page.frameLocator('iframe').locator('h1').click();
		await page.keyboard.press('Escape');
		await expect(page.frameLocator('iframe').locator('.topbar')).toBeVisible();
		expect(await messages(page)).toEqual([]);
	});
});

test.describe('guest', () => {
	test.use({ storageState: STORAGE.guest });

	test('reads place and area pages like the owner', async ({ page }) => {
		expect((await page.goto(PLACE))?.status()).toBe(200);
		await expect(page.locator(`#${ANSWER}`)).toBeVisible();
		expect((await page.goto('/area/harbin?embed=1'))?.status()).toBe(200);
		await expect(page.locator('h1')).toContainText('Harbin');
	});
});

test.describe('signed out', () => {
	test('a place page sends the visitor to the login page and back', async ({ page }) => {
		await page.goto(`${PLACE}?embed=1`);
		await expect(page).toHaveURL(/\/login/);
		expect(new URL(page.url()).searchParams.get('redirectTo')).toBe(`${PLACE}?embed=1`);
	});
});
