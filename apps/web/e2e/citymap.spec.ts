// The city map (Trip → Map → a city) and GET /tiles/<z>/<x>/<y>.png, on the e2e data set: Shanghai has five place
// cards (two Must, two Maybe, Zhujiajiao not rated) on one spot, so they open as one stack; the hubs of
// content/config/hubs.yaml (PVG, where the gru-pvg flight lands on Sun 6 Dec, and Hongqiao station, unused). The
// browser's tile requests are answered with a placeholder, so no test fetches OpenStreetMap; the endpoint test seeds
// the server's tile cache instead. Tests call Skip through the sheet and add stays through the stop form: the
// describe reseeds before and after.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import sharp from 'sharp';
import { slot } from './slot';
import { STORAGE } from './support';

const TILE_CACHE = path.resolve(
	import.meta.dirname,
	'../../../packages/migrate/fixtures/e2e/content/.cache/tiles',
);

let placeholder: Buffer | null = null;
async function png(): Promise<Buffer> {
	placeholder ??= await sharp({
		create: { width: 256, height: 256, channels: 3, background: '#d8d2c4' },
	})
		.png()
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

/** page.goto that waits out one Better Auth rate-limit window (see money.spec.ts). */
async function navigate(page: Page, go: () => Promise<Response | null>): Promise<void> {
	const first = await go();
	if (first === null || first.ok()) return;
	await page.waitForTimeout(11_000);
	await go();
}

async function openCity(page: Page, path = '/trip/map/china/shanghai'): Promise<void> {
	await page.route('**/tiles/**', async (route) => {
		await route.fulfill({ status: 200, contentType: 'image/png', body: await png() });
	});
	await navigate(page, () => page.goto(path));
	await expect(page.locator('[data-city-map][data-ready]')).toBeVisible();
}

const map = (page: Page): Locator => page.locator('[data-city-map]');
const pin = (page: Page, name: RegExp): Locator => map(page).getByRole('button', { name });
const filters = (page: Page): Locator => page.getByRole('toolbar', { name: 'Filter the map' });
const stack = (page: Page, n: number): Locator =>
	pin(page, new RegExp(`^${String(n)} places here: .+\\. Show them$`));

/** The fixture places share one spot, so they show as one stack: a tap fans them out. */
async function fanOut(page: Page, n: number): Promise<void> {
	await expect(stack(page, n)).toHaveCount(1);
	await stack(page, n).click();
	await expect(stack(page, n)).toHaveCount(0);
}

interface StayForm {
	title: string;
	status: 'booked' | 'planned';
	start: string;
	end: string;
	lat?: string;
	lng?: string;
}

/** Adds a Shanghai stay through the stop form on the itinerary. */
async function addStay(page: Page, s: StayForm): Promise<void> {
	await navigate(page, () => page.goto('/trip/itinerary'));
	await page.getByRole('button', { name: 'Add stop' }).click();
	const form = page.getByTestId('trip-form');
	await form.getByLabel('Status').selectOption(s.status);
	await form.getByLabel('Title (city or stay name)').fill(s.title);
	await form.getByLabel('Start date').fill(s.start);
	await form.getByLabel('End date').fill(s.end);
	await form.getByLabel('Country').selectOption('china');
	await form.getByLabel('City id, as on the cards (e.g. osaka)').fill('shanghai');
	if (s.lat !== undefined)
		await form.getByLabel('Latitude (the bed, when it has no card)').fill(s.lat);
	if (s.lng !== undefined) await form.getByLabel('Longitude').fill(s.lng);
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByTestId('trip-form')).toHaveCount(0);
}

test.describe('owner', () => {
	test.use({ storageState: STORAGE.owner });
	test.describe.configure({ mode: 'serial' });
	test.beforeAll(reseed);
	test.afterAll(reseed);

	test('shows the city: header, pins as buttons named with their call, hubs and the list', async ({
		page,
	}) => {
		await openCity(page);
		await expect(page.getByRole('heading', { level: 1, name: 'Shanghai' })).toBeVisible();
		await expect(
			page.getByRole('navigation', { name: 'Trip' }).getByRole('link', { name: 'Map' }),
		).toHaveAttribute('aria-current', 'page');
		// five places on one spot: one stack, named with what is in it, until it is opened
		await expect(stack(page, 5)).toHaveAccessibleName(/Nanxiang Soup Dumplings/);
		await expect(pin(page, /^Nanxiang Soup Dumplings,/)).toHaveCount(0);
		await fanOut(page, 5);
		await expect(pin(page, /^Nanxiang Soup Dumplings, .+, Must$/)).toHaveCount(1);
		await expect(pin(page, /^Bund Techno Basement, .+, Maybe$/)).toHaveCount(1);
		await expect(pin(page, /^Zhujiajiao Water Town, .+, Not rated$/)).toHaveCount(1);
		// PVG is where the flight lands; Hongqiao is on file but unused
		await expect(
			pin(page, /^Shanghai Pudong International Airport, airport, Arrive Sun 6 Dec$/),
		).toHaveCount(1);
		await expect(pin(page, /^Shanghai Hongqiao Railway Station, station$/)).toHaveCount(1);
		const list = page.locator('[data-city-list]');
		await expect(list.getByRole('heading', { name: 'Getting in and out' })).toBeVisible();
		await expect(list.getByText('Arrive Sun 6 Dec')).toBeVisible();
		await expect(list.getByText('Other airports and stations')).toBeVisible();
		await expect(list.getByRole('button', { name: /Nanxiang Soup Dumplings/ })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Fit all' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Recenter' })).toBeVisible();
		await expect(map(page).getByText('OpenStreetMap')).toBeVisible();
	});

	test('the airport outside the view gets an edge chip that brings it in', async ({ page }) => {
		await openCity(page);
		const chip = page.getByRole('button', { name: /^Show PVG .*km on the map$/ });
		await expect(chip).toBeVisible();
		await chip.click();
		await expect(
			page.getByRole('dialog', { name: 'Shanghai Pudong International Airport' }),
		).toContainText('Arrive Sun 6 Dec');
		await expect(chip).toBeHidden();
	});

	test('category chips and the hubs toggle hide and show pins', async ({ page }) => {
		await openCity(page);
		const food = filters(page).getByRole('button', { name: /Food/ });
		await food.click();
		await expect(food).toHaveAttribute('aria-pressed', 'true');
		await expect(pin(page, /^Nanxiang Soup Dumplings,/)).toHaveCount(1);
		await expect(pin(page, /^Bund Techno Basement,/)).toHaveCount(0);
		await food.click();
		await fanOut(page, 5);
		await expect(pin(page, /^Bund Techno Basement,/)).toHaveCount(1);

		const hubs = filters(page).getByRole('button', { name: 'Airports & stations' });
		await expect(hubs).toHaveAttribute('aria-pressed', 'true');
		await hubs.click();
		await expect(pin(page, /^Shanghai Pudong International Airport,/)).toHaveCount(0);
		await hubs.click();
		await expect(pin(page, /^Shanghai Pudong International Airport,/)).toHaveCount(1);
	});

	test('a pin opens the place sheet; a Skip hides it until skipped places are shown', async ({
		page,
	}) => {
		await openCity(page);
		await fanOut(page, 5);
		const zhujiajiao = pin(page, /^Zhujiajiao Water Town,/);
		// Drag the map with the mouse first: Enter on a focused pin still opens its card afterwards.
		const box = await map(page).boundingBox();
		if (box === null) throw new Error('no map box');
		await page.mouse.move(box.x + 40, box.y + box.height - 40);
		await page.mouse.down();
		await page.mouse.move(box.x + 120, box.y + box.height - 80, { steps: 8 });
		await page.mouse.up();
		await zhujiajiao.focus();
		await page.keyboard.press('Enter');
		const sheet = page.getByRole('dialog', { name: 'Zhujiajiao Water Town' });
		await expect(sheet).toBeVisible();
		await expect(sheet.locator('iframe')).toHaveAttribute(
			'src',
			/\/place\/zhujiajiao-water-town\?embed=1/,
		);
		await sheet.getByRole('button', { name: 'Skip' }).click();
		await expect(sheet.getByRole('button', { name: 'Skip' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		await page.keyboard.press('Escape');
		await expect(sheet).toBeHidden();

		const hide = filters(page).getByRole('button', { name: /Hide skipped/ });
		await expect(hide).toHaveAttribute('aria-pressed', 'true');
		await expect(zhujiajiao).toHaveCount(0);
		await hide.click();
		await fanOut(page, 5);
		await expect(pin(page, /^Zhujiajiao Water Town, .+, Skipped$/)).toHaveCount(1);
		await hide.click();
		await expect(zhujiajiao).toHaveCount(0);
	});

	test('a booked stay is drawn apart from a planned one; booking it through the form marks where the trip leaves', async ({
		page,
	}) => {
		await addStay(page, {
			title: 'Dayin East Nanjing Road',
			status: 'booked',
			start: '2026-12-06',
			end: '2026-12-08',
			lat: '31.2355',
			lng: '121.481',
		});
		await addStay(page, {
			title: 'Shanghai weekend',
			status: 'planned',
			start: '2026-12-08',
			end: '2026-12-09',
		});
		await openCity(page);
		const nights = page.locator('[data-nights-booked]');
		await expect(nights).toHaveText('2 of 3 nights booked');
		await expect(page.locator('[data-unbooked]')).toContainText('Not booked yet: Shanghai weekend');
		// The booked bed has its own pin (named as booked) and, with no card, a popup of its booking.
		const bed = pin(page, /^Dayin East Nanjing Road, .+, booked stay$/);
		await expect(bed).toHaveCount(1);
		await bed.click();
		await expect(page.getByRole('dialog', { name: 'Dayin East Nanjing Road' })).toContainText(
			'Booked · 6 – 8 Dec',
		);
		await expect(pin(page, /^Shanghai Hongqiao Railway Station, station$/)).toHaveCount(1);

		// Book the weekend and say the train out leaves from Hongqiao station (no train leg bought yet).
		await navigate(page, () => page.goto('/trip/itinerary'));
		await page
			.locator('[data-leg]', { hasText: 'Shanghai weekend' })
			.getByRole('button', { name: 'Edit' })
			.click();
		const form = page.getByTestId('trip-form');
		await form.getByLabel('Status').selectOption('booked');
		await form
			.getByLabel('Leave from (when no flight or train leg says)')
			.selectOption({ label: 'Shanghai Hongqiao Railway Station' });
		await form.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByTestId('trip-form')).toHaveCount(0);

		await openCity(page);
		await expect(nights).toHaveText('3 of 3 nights booked');
		await expect(page.locator('[data-unbooked]')).toHaveCount(0);
		await expect(
			pin(page, /^Shanghai Hongqiao Railway Station, station, Leave Wed 9 Dec$/),
		).toHaveCount(1);
		await expect(page.locator('[data-city-list]').getByText('Leave Wed 9 Dec')).toBeVisible();
	});

	test('the route map links a stop to its city map', async ({ page }) => {
		await page.route('**/route-map/**', (route) => route.fulfill({ status: 200, body: '' }));
		await navigate(page, () => page.goto('/trip/map'));
		const link = page.getByRole('link', { name: 'City map of Shanghai' }).first();
		await expect(link).toBeVisible();
		await page.route('**/tiles/**', async (route) => {
			await route.fulfill({ status: 200, contentType: 'image/png', body: await png() });
		});
		await link.click();
		await expect(page).toHaveURL(/\/trip\/map\/china\/shanghai$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Shanghai' })).toBeVisible();
	});

	test('a city without a map is the normal 404', async ({ page }) => {
		const res = await page.goto('/trip/map/china/nowhere');
		expect(res?.status()).toBe(404);
	});

	test('GET /tiles serves cached tiles and refuses bad addresses', async ({ request }) => {
		const file = path.join(TILE_CACHE, '2', '1', '1.png');
		fs.mkdirSync(path.dirname(file), { recursive: true });
		if (!fs.existsSync(file)) fs.writeFileSync(file, await png());
		const ok = await request.get('/tiles/2/1/1.png');
		expect(ok.status()).toBe(200);
		expect(ok.headers()['content-type']).toBe('image/png');
		expect(ok.headers()['cache-control']).toBe('private, max-age=604800');
		for (const bad of [
			'/tiles/1/0/0.png',
			'/tiles/19/0/0.png',
			'/tiles/2/4/0.png',
			'/tiles/2/x/0.png',
		]) {
			expect((await request.get(bad)).status(), bad).toBe(404);
		}
	});
});

test.describe('signed out', () => {
	test('tiles are behind the sign-in guard', async ({ request }) => {
		const res = await request.get('/tiles/2/1/1.png', { maxRedirects: 0 });
		expect(res.status()).toBe(303);
		expect(res.headers()['location']).toMatch(/^\/login/);
	});
});
