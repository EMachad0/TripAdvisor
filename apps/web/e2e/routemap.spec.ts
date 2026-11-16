// Slice C: the route map and route editor (old game.js viewRoute and friends) and GET /route-map/<key>.webp, on the
// e2e data set: the config seeds plus two saved lines (China: Harbin 4, Chongqing 5, Shanghai 6; Japan: Kyoto 5),
// Harbin a Must area and Kyoto a Maybe. The owner describe reseeds the slot first and writes through the UI.
// The browser's base-image requests are answered with a placeholder here, so no test fetches OpenStreetMap tiles;
// the endpoint test seeds the server's map cache file instead.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import sharp from 'sharp';
import { slot } from './slot';
import { STORAGE } from './support';

const MAP_CACHE = path.resolve(
	import.meta.dirname,
	'../../../packages/migrate/fixtures/e2e/content/.cache/maps',
);

let placeholder: Buffer | null = null;
async function tile(): Promise<Buffer> {
	placeholder ??= await sharp({
		create: { width: 64, height: 64, channels: 3, background: '#d8d2c4' },
	})
		.webp()
		.toBuffer();
	return placeholder;
}

function reseed(): void {
	execFileSync(
		path.resolve(import.meta.dirname, '../../../scripts/convex-local.sh'),
		['seed-data'],
		{ env: { ...process.env, ATR_SLOT: String(slot().n) }, stdio: 'ignore' },
	);
}

/** page.goto / reload that waits out one Better Auth rate-limit window (see money.spec.ts). */
async function navigate(page: Page, go: () => Promise<Response | null>): Promise<void> {
	const first = await go();
	if (first === null || first.ok()) return;
	await page.waitForTimeout(11_000);
	await go();
}

async function openMap(page: Page): Promise<void> {
	await page.route('**/route-map/**', async (route) => {
		await route.fulfill({ status: 200, contentType: 'image/webp', body: await tile() });
	});
	await navigate(page, () => page.goto('/trip/map'));
	await expect(page.getByRole('heading', { level: 1, name: 'Route' })).toBeVisible();
	await expect(page.locator('[data-route-map][data-ready]')).toBeVisible();
	await page.waitForLoadState('networkidle');
}

const legCard = (page: Page, id: string): Locator => page.locator(`[data-leg="${id}"]`);
const stopNames = (page: Page, id: string): Locator =>
	legCard(page, id).locator('[data-stop] button b');
const pin = (page: Page, name: RegExp | string): Locator =>
	page.locator('[data-route-overlay]').getByRole('button', { name });
const sum = (page: Page): Locator => page.locator('[data-route-sum]');

/**
 * Tap a map pin where it is drawn. WebKit under Playwright scrolls an SVG <g> to the wrong place before a locator
 * click (the click then lands on the page or the sticky header), so scroll the map into view and tap the pin's
 * centre instead. That is where a finger lands, and elementsFromPoint there is the pin's hit circle.
 */
async function tapPin(page: Page, name: RegExp | string): Promise<void> {
	await page.locator('[data-route-map]').scrollIntoViewIfNeeded();
	const box = await pin(page, name).locator('circle').last().boundingBox();
	if (!box) throw new Error(`no pin ${String(name)}`);
	await tapAt(page, box.x + box.width / 2, box.y + box.height / 2);
}

/** Tap on a phone, click on the desktop: WebKit's emulated click misses a chip in the horizontally scrolled row. */
async function press(page: Page, target: Locator): Promise<void> {
	if (await page.evaluate(() => 'ontouchstart' in window)) await target.tap();
	else await target.click();
}

/** A tap on a phone (WebKit's emulated mouse click never reaches the SVG), a click on the desktop. */
async function tapAt(page: Page, x: number, y: number): Promise<void> {
	if (await page.evaluate(() => 'ontouchstart' in window)) await page.touchscreen.tap(x, y);
	else await page.mouse.click(x, y);
}

/**
 * A point (page px) 50 to 80 px from a pin with nothing but the overlay itself under or near it: a tap there is a
 * tap on the empty map.
 */
async function emptySpotNear(page: Page, name: string): Promise<{ x: number; y: number }> {
	await page.locator('[data-route-map]').scrollIntoViewIfNeeded();
	const box = await pin(page, name).locator('circle').last().boundingBox();
	if (!box) throw new Error(`no pin ${name}`);
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	const spot = await page.evaluate(
		({ cx, cy }) => {
			const svg = document.querySelector('[data-route-overlay]');
			// clear for 26 px around too: a phone snaps a tap near a button onto it
			const clear = (x: number, y: number): boolean =>
				[-26, 0, 26].every((dx) =>
					[-26, 0, 26].every((dy) => document.elementFromPoint(x + dx, y + dy) === svg),
				);
			for (const r of [50, 60, 70, 80])
				for (let a = 0; a < 16; a++) {
					const x = cx + r * Math.cos((a / 16) * 2 * Math.PI);
					const y = cy + r * Math.sin((a / 16) * 2 * Math.PI);
					if (clear(x, y)) return { x, y };
				}
			return null;
		},
		{ cx, cy },
	);
	if (!spot) throw new Error(`no empty spot near ${name}`);
	return spot;
}

/** Wait for the 600 ms save pause and the write to land (the pending count drops to zero). */
async function saved(page: Page): Promise<void> {
	await page.waitForTimeout(900);
	await page.waitForLoadState('networkidle');
}

test.describe('owner', () => {
	test.use({ storageState: STORAGE.owner });
	test.describe.configure({ mode: 'serial' });
	test.beforeAll(reseed);

	test('shows the route read only: header, chips, map, legend and every leg in order', async ({
		page,
	}) => {
		await openMap(page);
		await expect(
			page.getByRole('navigation', { name: 'Trip' }).getByRole('link', { name: 'Map' }),
		).toHaveAttribute('aria-current', 'page');
		await expect(page.locator('[data-route-eyebrow]')).toHaveText('6 Dec → 9 Feb · 6 legs');
		await expect(sum(page)).toHaveText('9 stops in order');
		const chips = page.getByRole('navigation', { name: 'Zoom the map' });
		await expect(chips.getByRole('button')).toHaveCount(7);
		await expect(chips.getByRole('button', { name: 'Whole trip' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		await expect(chips.getByRole('button', { name: /China/ })).toContainText('6 Dec – 2 Jan · 27n');
		await expect(page.locator('[data-route-plan] [data-leg]')).toHaveCount(6);
		await expect(stopNames(page, 'china')).toHaveText(['Harbin', 'Chongqing', 'Shanghai']);
		await expect(legCard(page, 'china').locator('[data-stop-nights]')).toHaveText([
			'4 nights',
			'5 nights',
			'6 nights',
		]);
		await expect(legCard(page, 'china').locator('[data-nights-meter]')).toContainText(
			'15 of 27 nights placed · 12 left',
		);
		await expect(legCard(page, 'japan').locator('[data-stop]')).toContainText('Maybe');
		await expect(legCard(page, 'thailand').locator('[data-stop]').nth(1)).toContainText(
			'dates open until the stops above have nights',
		);
		// read only: no edit controls until "Edit route"
		await expect(page.getByRole('button', { name: /Move .* earlier/ })).toHaveCount(0);
		await expect(page.locator('[data-add]')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Edit route' })).toBeEnabled();
		// the map: numbered stops, the overview image, the long-haul labels and the legend
		await expect(pin(page, 'Stop 1: Harbin, 4 nights')).toBeVisible();
		await expect(page.locator('[data-route-overlay] [data-pin="stop"]')).toHaveCount(9);
		await expect(page.locator('image[data-frame="overview"]')).toHaveAttribute(
			'href',
			/^\/route-map\/overview\.webp\?v=\d+_[\d.-]+_[\d.-]+_\d+$/,
		);
		await expect(page.locator('[data-label="long"]')).toHaveCount(2);
		await expect(page.locator('[data-route-legend]')).toContainText('Flight between countries');
		await expect(page.locator('[data-route-fine]')).toContainText('in from São Paulo');
	});

	test('chips, the back button and a tap on the map zoom; pins open the city card; Escape closes it', async ({
		page,
	}) => {
		await openMap(page);
		const chips = page.getByRole('navigation', { name: 'Zoom the map' });
		await press(page, chips.getByRole('button', { name: /Japan/ }));
		await expect(page.locator('[data-route-map]')).toHaveAttribute('data-view', 'japan');
		await expect(chips.getByRole('button', { name: /Japan/ })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		await expect(page.locator('image[data-frame="japan"]')).toHaveCount(1);
		await expect(page.locator('[data-route-map]:not([data-animating])')).toBeVisible();
		await press(page, page.locator('[data-map-back]'));
		await expect(page.locator('[data-route-map]')).toHaveAttribute('data-view', 'all');
		await expect(page.locator('[data-map-back]')).toHaveCount(0);

		// keyboard: Enter on a focused pin selects it
		await pin(page, 'Stop 1: Harbin, 4 nights').focus();
		await page.keyboard.press('Enter');
		const card = page.getByRole('dialog', { name: 'Harbin' });
		await expect(card).toBeVisible();
		await expect(card.locator('[data-card-status]')).toContainText('Stop 1 of 3 in China');
		await expect(card.locator('[data-card-when]')).toHaveText('Sun 6 Dec → Thu 10 Dec · 4 nights');
		await expect(card.getByRole('button', { name: 'Area page →' })).toBeVisible();
		await expect(card.getByRole('button', { name: 'Remove from route' })).toHaveCount(0);
		await page.keyboard.press('Escape');
		await expect(card).toHaveCount(0);

		// a tap on the empty map near a city zooms to its country; with a card open it only closes the card
		const spot = await emptySpotNear(page, 'Stop 8: Kyoto, 5 nights');
		await tapAt(page, spot.x, spot.y);
		await expect(page.locator('[data-route-map]')).toHaveAttribute('data-view', 'japan');
		await press(page, page.locator('[data-map-back]'));
		await expect(
			page.locator('[data-route-map][data-view="all"]:not([data-animating])'),
		).toBeVisible();
		await tapPin(page, 'Stop 1: Harbin, 4 nights');
		await expect(card).toBeVisible();
		await tapAt(page, spot.x, spot.y);
		await expect(card).toHaveCount(0);
		await expect(page.locator('[data-route-map]')).toHaveAttribute('data-view', 'all');

		// a stop in the plan selects its city and zooms to its country
		await press(page, legCard(page, 'japan').getByRole('button', { name: /Kyoto/ }));
		await expect(page.getByRole('dialog', { name: 'Kyoto' })).toBeVisible();
		await expect(page.locator('[data-route-map]')).toHaveAttribute('data-view', 'japan');
		await press(
			page,
			page.getByRole('dialog', { name: 'Kyoto' }).getByRole('button', { name: 'Close' }),
		);
		await expect(page.getByRole('dialog', { name: 'Kyoto' })).toHaveCount(0);

		// "Show skipped" adds the cities nobody swiped; zooming again (the leg title) fits them in, as before
		await expect(pin(page, 'Tokyo: not swiped')).toHaveCount(0);
		await press(page, page.locator('[data-show-skipped]'));
		await expect(page.locator('[data-show-skipped]')).toBeChecked();
		await press(
			page,
			legCard(page, 'japan').getByRole('button', { name: 'Show Japan on the map' }),
		);
		await expect(page.locator('[data-route-map]:not([data-animating])')).toBeVisible();
		await expect(pin(page, 'Tokyo: not swiped')).toBeVisible();
	});

	test('the area page opens in the sheet from the city card', async ({ page }) => {
		await openMap(page);
		await tapPin(page, 'Stop 1: Harbin, 4 nights');
		await press(
			page,
			page.getByRole('dialog', { name: 'Harbin' }).getByRole('button', { name: 'Area page →' }),
		);
		const frame = page.locator('iframe[src^="/area/harbin"]');
		await expect(frame).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(frame).toHaveCount(0);
	});

	test('edit: reorder and nights save after the pause and survive a reload; Reset goes back to the plan', async ({
		page,
	}) => {
		await openMap(page);
		await press(page, page.getByRole('button', { name: 'Edit route' }));
		await expect(page.getByRole('button', { name: 'Done editing' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		await expect(page.locator('[data-edit-hint]')).toBeVisible();
		const china = legCard(page, 'china');
		await expect(china.getByRole('button', { name: 'Move Harbin earlier' })).toBeDisabled();
		await press(page, china.getByRole('button', { name: 'Move Shanghai earlier' }));
		await expect(stopNames(page, 'china')).toHaveText(['Harbin', 'Shanghai', 'Chongqing']);
		await expect(china.getByRole('button', { name: 'Move Shanghai earlier' })).toBeFocused();
		await press(page, china.getByRole('button', { name: 'One night more in Harbin' }));
		await expect(china.getByRole('spinbutton', { name: 'Nights in Harbin' })).toHaveValue('5');
		// typed nights: 0 clears, 120 caps at 90
		const sh = china.getByRole('spinbutton', { name: 'Nights in Shanghai' });
		await sh.fill('0');
		await sh.blur();
		await expect(sh).toHaveValue('');
		await sh.fill('120');
		await sh.blur();
		await expect(sh).toHaveValue('90');
		await expect(china.locator('[data-nights-meter]')).toHaveAttribute('data-nights-meter', 'over');
		await sh.fill('6');
		await sh.blur();
		await saved(page);
		await navigate(page, () => page.reload());
		await expect(stopNames(page, 'china')).toHaveText(['Harbin', 'Shanghai', 'Chongqing']);
		await expect(china.locator('[data-stop-nights]')).toHaveText([
			'5 nights',
			'6 nights',
			'5 nights',
		]);

		await press(page, page.getByRole('button', { name: 'Edit route' }));
		await press(page, china.locator('[data-reset]'));
		await expect(page.getByText('China: back to the plan')).toBeVisible();
		await expect(stopNames(page, 'china')).toHaveText([
			'Shanghai',
			'Huangshan (flexible)',
			'Beijing',
			'Harbin',
			'Chengdu',
			'Chongqing',
		]);
		await expect(china.locator('[data-stop]').nth(1)).toContainText(
			'no coordinates, not on the map',
		);
		await expect(china.locator('[data-reset]')).toHaveCount(0);
	});

	test('edit: remove and add stops from the plan and from the map card', async ({ page }) => {
		await openMap(page);
		await press(page, page.getByRole('button', { name: 'Edit route' }));
		const japan = legCard(page, 'japan');
		await press(page, japan.getByRole('button', { name: 'Remove Kyoto from the route' }));
		await expect(page.getByText('Kyoto is off the route')).toBeVisible();
		await expect(japan.locator('[data-no-stops]')).toBeVisible();
		await expect(japan.locator('[data-add]')).toHaveText(['Kyoto']);
		await press(page, japan.getByRole('button', { name: 'Add Kyoto to the Japan route' }));
		await expect(stopNames(page, 'japan')).toHaveText(['Kyoto']);
		await expect(japan.getByRole('spinbutton', { name: 'Nights in Kyoto' })).toBeFocused();

		// a Must city taken off the route shows as "not placed", on the map and in the header (China is back on
		// its six seed stops after the Reset above)
		const china = legCard(page, 'china');
		await expect(sum(page)).toHaveText('12 stops in order');
		await press(page, china.getByRole('button', { name: 'Remove Harbin from the route' }));
		await expect(sum(page)).toContainText('1 must city not placed');
		await press(
			page,
			page.getByRole('navigation', { name: 'Zoom the map' }).getByRole('button', { name: /China/ }),
		);
		await expect(page.locator('[data-route-map]:not([data-animating])')).toBeVisible();
		await tapPin(page, 'Harbin: Must, not placed yet');
		const card = page.getByRole('dialog', { name: 'Harbin' });
		await expect(card.locator('[data-card-status]')).toContainText('Must · not placed yet');
		await press(page, card.getByRole('button', { name: 'Add to China route' }));
		await expect(card.getByRole('button', { name: 'Remove from route' })).toBeVisible();
		await expect(sum(page)).toHaveText('12 stops in order');
		await expect(stopNames(page, 'china').last()).toHaveText('Harbin');
		await press(page, card.getByRole('button', { name: 'Remove from route' }));
		await expect(card.getByRole('button', { name: 'Add to China route' })).toBeVisible();
		await press(page, page.getByRole('button', { name: 'Done editing' }));
		await saved(page);
		await navigate(page, () => page.reload());
		await expect(stopNames(page, 'china')).toHaveText([
			'Shanghai',
			'Huangshan (flexible)',
			'Beijing',
			'Chengdu',
			'Chongqing',
		]);
		await expect(legCard(page, 'china').locator('[data-unplaced]')).toHaveText(
			'1 Must city not placed: Harbin.',
		);
	});

	test('GET /route-map/<key>.webp: the cached image with max-age=86400; unknown keys are a JSON 404', async ({
		page,
	}) => {
		await openMap(page);
		const href = await page.locator('image[data-frame="overview"]').getAttribute('href');
		const m = /\?v=(\d+)_([\d.-]+)_([\d.-]+)_(\d+)$/.exec(href ?? '');
		expect(m).not.toBeNull();
		const [, zoom, lat, lng, side] = m ?? [];
		const name = `${Number(lat).toFixed(5)}_${Number(lng).toFixed(5)}_${String(Math.min(19, Number(zoom) + 1))}_${String(side)}x${String(side)}.webp`;
		fs.mkdirSync(MAP_CACHE, { recursive: true });
		const file = path.join(MAP_CACHE, name);
		if (!fs.existsSync(file)) {
			await sharp({
				create: { width: Number(side), height: Number(side), channels: 3, background: '#d8d2c4' },
			})
				.webp()
				.toFile(`${file}.tmp`);
			fs.renameSync(`${file}.tmp`, file);
		}
		const r = await page.request.get(href ?? '');
		expect(r.status()).toBe(200);
		expect(r.headers()['content-type']).toBe('image/webp');
		expect(r.headers()['cache-control']).toBe('max-age=86400');
		expect((await r.body()).subarray(8, 12).toString()).toBe('WEBP');
		for (const url of ['/route-map/atlantis.webp', '/route-map/constructor.webp']) {
			const miss = await page.request.get(url);
			expect(miss.status(), url).toBe(404);
			expect(await miss.json()).toEqual({ error: 'not found' });
		}
	});
});

test.describe('guest', () => {
	test.use({ storageState: STORAGE.guest });

	test('sees the whole route with editing disabled', async ({ page }) => {
		await openMap(page);
		await expect(stopNames(page, 'japan')).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Edit route' })).toBeDisabled();
		await expect(page.getByRole('button', { name: /Move .* earlier/ })).toHaveCount(0);
		await tapPin(page, /^Stop 1: /);
		const card = page.getByRole('dialog');
		await expect(card).toBeVisible();
		await expect(card.getByRole('button', { name: 'Area page →' })).toBeVisible();
		await expect(card.getByRole('button', { name: /Add to|Remove from/ })).toHaveCount(0);
		expect((await page.request.get('/route-map/atlantis.webp')).status()).toBe(404);
	});
});

test.describe('signed out', () => {
	test('the route map image sends the visitor to the login page', async ({ request }) => {
		const r = await request.get('/route-map/overview.webp', { maxRedirects: 0 });
		expect(r.status()).toBe(303);
		expect(r.headers()['location']).toMatch(/^\/login\?redirectTo=/);
	});
});
