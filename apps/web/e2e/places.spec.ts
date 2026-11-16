// Places (slice D): find any card by words, city, kind and Which cards; results grouped by city with "N/M been",
// the place sheet, the "been there" tick, verdict pills, notes and the "New" tag. Runs on the e2e content
// (platform/test/site-fixtures places, 21 cards) and the e2e trip set (stays in Harbin and Kyoto + Osaka). The tick test
// undoes its own write through the UI. No direct Convex calls (each one hits Better Auth's rate-limited JWKS route).
import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import { STORAGE } from './support';

/**
 * Click a control after scrolling it to the middle of the screen: a target at the top edge sits under the sticky
 * app bar.
 */
async function press(target: Locator): Promise<void> {
	await target.evaluate((el) => {
		el.scrollIntoView({ block: 'center' });
	});
	await target.click();
}

/** page.goto that waits out one Better Auth rate-limit window (see money.spec.ts). */
async function navigate(page: Page, go: () => Promise<Response | null>): Promise<void> {
	const first = await go();
	if (first === null || first.ok()) return;
	await page.waitForTimeout(11_000);
	await go();
}

async function openPlaces(page: Page, path = '/places'): Promise<void> {
	await navigate(page, () => page.goto(path));
	await expect(page.getByRole('heading', { level: 1, name: 'Places' })).toBeVisible();
	// the trip query (legs, visited) has answered once the route cities are counted
	await expect(page.getByText('21 cards · 2 cities on the route')).toBeVisible();
}

const row = (page: Page, id: string): Locator => page.locator(`[data-place="${id}"]`);
const search = (page: Page): Locator => page.getByRole('searchbox', { name: 'Search the cards' });
const count = (page: Page): Locator => page.locator('[data-places-count]');
const groups = (page: Page): Locator => page.locator('[data-places-group]');

test.describe('owner', () => {
	test.use({ storageState: STORAGE.owner });

	test('lists every card by city, route cities first, with calls, notes and the New tag', async ({
		page,
	}) => {
		await openPlaces(page);
		await expect(count(page)).toHaveText('21 cards');
		await expect(groups(page).first()).toContainText('Harbin');
		await expect(groups(page).nth(1)).toContainText('Osaka');
		await expect(groups(page).filter({ hasText: 'Shanghai' })).toContainText('0/5 been');

		const ice = row(page, 'harbin-ice-world');
		await expect(ice.locator('[data-verdict-pill]')).toHaveText('must');
		await expect(ice.locator('[data-note]')).toContainText('Go at dusk when the lights come on.');
		await expect(row(page, 'chatuchak-weekend-market')).toHaveAttribute('data-v', 'skip');
		await expect(row(page, 'chatuchak-weekend-market').locator('[data-verdict-pill]')).toHaveText(
			'skip',
		);
		// added by the curator after the first run and not swiped yet
		await expect(row(page, 'khao-san-road').locator('[data-new]')).toHaveText('New');
		await expect(row(page, 'hongyadong-night').locator('[data-new]')).toHaveCount(0);
		await expect(
			row(page, 'great-wall-mutianyu').getByRole('link', {
				name: 'Open Great Wall at Mutianyu in Maps',
			}),
		).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);

		// Must before Maybe inside a city
		const shanghai = page.getByRole('list', { name: 'Cards in Shanghai' });
		await expect(shanghai.locator('[data-place]').first()).toHaveAttribute('data-v', 'must');
	});

	test('search, city, kind and Which cards narrow the list; no match says what to try', async ({
		page,
	}) => {
		await openPlaces(page);
		await search(page).fill('DUMPLINGS');
		await expect(count(page)).toHaveText('1 card for “DUMPLINGS”');
		await expect(row(page, 'nanxiang-dumplings')).toBeVisible();

		await search(page).fill('zzz nothing');
		await expect(page.locator('[data-places-empty]')).toContainText('No card matches');
		await expect(page.locator('[data-places-empty]')).toContainText('Try another word.');
		await search(page).fill('');
		await expect(count(page)).toHaveText('21 cards');

		const city = page.getByRole('combobox', { name: 'City' });
		await city.selectOption('shanghai');
		await expect(count(page)).toHaveText('5 cards');
		await expect(groups(page)).toHaveCount(1);

		await page.getByRole('combobox', { name: 'Kind' }).selectOption('food');
		await expect(count(page)).toHaveText('1 card');

		await page.getByRole('combobox', { name: 'Kind' }).selectOption('');
		await press(page.getByRole('radio', { name: 'Must + Maybe' }));
		await expect(count(page)).toHaveText('4 cards');
		await press(page.getByRole('radio', { name: 'Been', exact: true }));
		await expect(page.locator('[data-places-empty]')).toContainText(
			'Try “Everywhere”, any kind, or All.',
		);
		await press(page.getByRole('radio', { name: 'All' }));
		await city.selectOption('');
		await expect(count(page)).toHaveText('21 cards');
	});

	test('a /places/<a+b> link picks those cities', async ({ page }) => {
		await openPlaces(page, '/places/harbin+osaka');
		await expect(page.getByRole('combobox', { name: 'City' })).toHaveValue('harbin+osaka');
		await expect(page.getByRole('combobox', { name: 'City' }).locator('option:checked')).toHaveText(
			'Harbin + Osaka',
		);
		await expect(count(page)).toHaveText('2 cards');
		await page.getByRole('combobox', { name: 'City' }).selectOption('tokyo');
		await expect(count(page)).toHaveText('2 cards');
		await expect(groups(page)).toHaveText([/Tokyo/]);
	});

	test('filters stay as they were after visiting Answers', async ({ page }) => {
		await openPlaces(page);
		await search(page).fill('market');
		await expect(count(page)).toHaveText('3 cards for “market”');
		await press(
			page.getByRole('navigation', { name: 'Places pages' }).getByRole('link', { name: 'Answers' }),
		);
		await expect(page.getByRole('heading', { level: 1, name: 'Answers' })).toBeVisible();
		await press(
			page.getByRole('navigation', { name: 'Places pages' }).getByRole('link', { name: 'Places' }),
		);
		await expect(search(page)).toHaveValue('market');
		await expect(count(page)).toHaveText('3 cards for “market”');
	});

	test('the first visit starts in the city of today’s stay', async ({ page }) => {
		await page.clock.setFixedTime(new Date('2027-01-12T10:00:00+09:00'));
		await openPlaces(page);
		await expect(page.getByRole('combobox', { name: 'City' })).toHaveValue('osaka');
		await expect(count(page)).toHaveText('1 card');
	});

	test('a row opens the place sheet', async ({ page }) => {
		await openPlaces(page);
		await press(row(page, 'shibuya-sky').getByRole('button', { name: /Shibuya Sky/ }));
		const sheet = page.getByRole('dialog', { name: 'Shibuya Sky' });
		await expect(sheet).toBeVisible();
		await expect(sheet.locator('iframe')).toHaveAttribute('src', /\/place\/shibuya-sky\?embed=1/);
		await page.keyboard.press('Escape');
		await expect(sheet).toBeHidden();
	});

	test('ticking "been there" counts it and moves it to Been; unticking undoes it', async ({
		page,
	}) => {
		await openPlaces(page);
		const ice = row(page, 'harbin-ice-world');
		// a run stopped half-way may have left it ticked: start from "not been"
		const left = ice.getByRole('checkbox', { name: 'Not been yet: Harbin Ice and Snow World' });
		if (await left.isVisible()) {
			await press(left);
			await expect(ice).not.toHaveAttribute('data-been');
		}
		const tick = ice.getByRole('checkbox', { name: 'Been there: Harbin Ice and Snow World' });
		await expect(tick).toHaveAttribute('aria-checked', 'false');
		await press(tick);
		await expect(ice).toHaveAttribute('data-been', '');
		await expect(groups(page).filter({ hasText: 'Harbin' })).toContainText('1/1 been');
		await press(page.getByRole('radio', { name: 'Been', exact: true }));
		await expect(count(page)).toHaveText('1 card');

		const untick = row(page, 'harbin-ice-world').getByRole('checkbox', {
			name: 'Not been yet: Harbin Ice and Snow World',
		});
		await press(untick);
		await expect(page.locator('[data-places-empty]')).toBeVisible();
		await press(page.getByRole('radio', { name: 'All' }));
		await expect(groups(page).filter({ hasText: 'Harbin' })).toContainText('0/1 been');
	});
});

test.describe('guest', () => {
	test.use({ storageState: STORAGE.guest });

	test('sees every card and filter, with the tick read only', async ({ page }) => {
		await openPlaces(page);
		await expect(count(page)).toHaveText('21 cards');
		const tick = row(page, 'harbin-ice-world').getByRole('checkbox', {
			name: /: Harbin Ice and Snow World$/,
		});
		await expect(tick).toBeDisabled();
		await search(page).fill('sky');
		await expect(row(page, 'shibuya-sky')).toBeVisible();
		await press(row(page, 'shibuya-sky').getByRole('button', { name: /Shibuya Sky/ }));
		await expect(page.getByRole('dialog', { name: 'Shibuya Sky' })).toBeVisible();
	});
});
