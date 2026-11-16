// Slice F: Holiday picks (old game.js viewHolidays, setLock, the mini duel and the pick-many calls). The e2e data set
// has three Christmas options (none locked), three New Year's Eve options with Harbin Ice and Snow World locked, and
// four Lunar New Year options in Hong Kong, none called. Owner tests reseed first.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import { slot } from './slot';
import { STORAGE } from './support';

function reseed(): void {
	execFileSync(
		path.resolve(import.meta.dirname, '../../../scripts/convex-local.sh'),
		['seed-data'],
		{
			env: { ...process.env, ATR_SLOT: String(slot().n) },
			stdio: 'ignore',
		},
	);
}

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

async function navigate(page: Page, go: () => Promise<Response | null>): Promise<void> {
	const first = await go();
	if (first === null || first.ok()) return;
	await page.waitForTimeout(11_000);
	await go();
}

async function openHolidays(page: Page): Promise<void> {
	await navigate(page, () => page.goto('/decide/holidays'));
	await expect(page.getByRole('heading', { level: 1, name: 'Holiday picks' })).toBeVisible();
	await page.waitForLoadState('networkidle');
}

const section = (page: Page, id: string): Locator => page.locator(`[data-holiday="${id}"]`);
const card = (page: Page, id: string): Locator => page.locator(`[data-holiday-card="${id}"]`);

test.describe('owner', () => {
	test.use({ storageState: STORAGE.owner });
	test.describe.configure({ mode: 'serial' });
	test.beforeAll(reseed);
	// Leave the e2e data set as the next spec expects it: a CI shard runs any mix of spec files on one backend.
	test.afterAll(reseed);

	test('three holidays: dates, where you are, options, the lock banner', async ({ page }) => {
		await openHolidays(page);
		await expect(page.locator('[data-holiday]')).toHaveCount(3);
		const xmas = section(page, 'christmas');
		await expect(xmas.getByRole('heading', { level: 2 })).toHaveText(/Where for Christmas\?/);
		await expect(xmas.locator('[data-holiday-when]')).toHaveText(
			/Fri 25 Dec · you’ll be in 🇨🇳 China · 3 options/,
		);
		await expect(xmas.locator('[data-holiday-card]')).toHaveCount(3);
		await expect(xmas.getByRole('button', { name: '⚔️ Duel them' })).toBeEnabled();
		const nye = section(page, 'nye');
		await expect(nye.locator('[data-locked-banner="nye"]')).toContainText(
			"Locked in for New Year's Eve",
		);
		await expect(nye.locator('[data-locked-banner="nye"]')).toContainText(
			'Harbin Ice and Snow World',
		);
		// the locked option comes first, with its badge and "✓ Locked"
		await expect(nye.locator('[data-holiday-card]').first()).toHaveAttribute(
			'data-holiday-card',
			'harbin-ice-world',
		);
		await expect(card(page, 'harbin-ice-world').first()).toBeVisible();
		await expect(nye.locator('[data-locked="true"] [data-badge="lock"]')).toHaveText('🔒 Locked');
		await expect(
			nye.locator('[data-locked="true"]').getByRole('button', { name: /^Unlock / }),
		).toHaveText('✓ Locked');
		const lny = section(page, 'lny');
		await expect(lny.locator('[data-holiday-when]')).toHaveText(
			/Fri 5 Feb – Mon 8 Feb · Lunar New Year is Sat 6 Feb/,
		);
		await expect(lny.locator('[data-tally]')).toHaveText('4 not called yet');
		await expect(lny.locator('[data-holiday-card]')).toHaveCount(4);
		await expect(lny.locator('[data-badge="day"]').first()).toBeVisible();
	});

	test('Lock it waits for the server, then shows the banner, a toast and the board chip; Unlock clears it', async ({
		page,
	}) => {
		await openHolidays(page);
		const xmas = section(page, 'christmas');
		await expect(xmas.locator('[data-locked-banner]')).toHaveCount(0);
		await press(
			xmas.getByRole('button', { name: 'Lock Xintiandi Christmas Market for Christmas' }),
		);
		await expect(xmas.locator('[data-locked-banner="christmas"]')).toContainText(
			'Xintiandi Christmas Market',
		);
		await expect(page.getByText('🎄 Locked: Xintiandi Christmas Market')).toBeVisible();
		await expect(xmas.locator('[data-holiday-card]').first()).toHaveAttribute(
			'data-holiday-card',
			'xintiandi-christmas-market',
		);
		await page.reload();
		await expect(
			section(page, 'christmas').locator('[data-locked-banner="christmas"]'),
		).toBeVisible();
		await navigate(page, () => page.goto('/decide/board'));
		await expect(page.locator('[data-lock-chip="christmas"]')).toContainText('🔒');
		await openHolidays(page);
		await press(
			section(page, 'christmas')
				.locator('[data-locked-banner]')
				.getByRole('button', { name: 'Unlock' }),
		);
		await expect(section(page, 'christmas').locator('[data-locked-banner]')).toHaveCount(0);
		await page.reload();
		await expect(section(page, 'christmas').locator('[data-locked-banner]')).toHaveCount(0);
	});

	test('the mini duel picks one, offers the next pair, and closes', async ({ page }) => {
		await openHolidays(page);
		const xmas = section(page, 'christmas');
		await press(xmas.getByRole('button', { name: '⚔️ Duel them' }));
		const duel = xmas.locator('[data-holiday-duel]');
		await expect(duel).toContainText('🎄 Which one for Christmas?');
		await expect(xmas.getByRole('button', { name: '⚔️ Duel them' })).toHaveCount(0);
		await press(duel.locator('[data-hpick="left"]'));
		await expect(duel.locator('[data-hpick="left"][data-result="win"] [data-delta]')).toHaveText(
			/^\+\d+$/,
		);
		await expect(duel.locator('[data-result]')).toHaveCount(0);
		await press(duel.getByRole('button', { name: 'Done duelling' }));
		await expect(duel).toHaveCount(0);
		// after a duel the best-rated option is the top pick
		await expect(xmas.locator('[data-badge="top"]')).toHaveCount(1);
	});

	test('Lunar New Year options each take their own call', async ({ page }) => {
		await openHolidays(page);
		const lny = section(page, 'lny');
		const first = lny.locator('[data-holiday-card]').first();
		await press(first.getByRole('button', { name: 'Must' }));
		await expect(lny.locator('[data-tally]')).toHaveText('1 Must · 3 not called yet');
		await expect(first).toHaveAttribute('data-v', 'must');
		await page.waitForLoadState('networkidle');
		await page.reload();
		await expect(section(page, 'lny').locator('[data-tally]')).toHaveText(
			'1 Must · 3 not called yet',
		);
	});

	test('Details opens the place sheet', async ({ page }) => {
		await openHolidays(page);
		await press(
			card(page, 'bund-techno-club').getByRole('button', {
				name: 'Details for Bund Techno Basement',
			}),
		);
		await expect(page.getByRole('dialog')).toHaveAttribute('data-sheet', 'place:bund-techno-club');
	});
});

test.describe('guest', () => {
	test.use({ storageState: STORAGE.guest });

	test('sees every holiday; lock, unlock, duel and calls are disabled', async ({ page }) => {
		await openHolidays(page);
		await expect(page.getByText('Read only: guests can look at the options')).toBeVisible();
		await expect(page.locator('[data-holiday]')).toHaveCount(3);
		const xmas = section(page, 'christmas');
		await expect(xmas.getByRole('button', { name: '⚔️ Duel them' })).toBeDisabled();
		for (const b of await xmas.getByRole('button', { name: /^Lock / }).all())
			await expect(b).toBeDisabled();
		await expect(
			section(page, 'nye').locator('[data-locked-banner]').getByRole('button', { name: 'Unlock' }),
		).toBeDisabled();
		for (const b of await section(page, 'lny').getByRole('button', { name: 'Must' }).all()) {
			await expect(b).toBeDisabled();
		}
		await expect(
			card(page, 'bund-techno-club').getByRole('button', { name: /^Details/ }),
		).toBeEnabled();
	});
});
