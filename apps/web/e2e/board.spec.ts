// Slice F: the Board (old game.js viewBoard, changeDays). The e2e data set holds day overrides china 25 (plan 27) and
// japan 11 (plan 16), so the trip shows 58 of 65 days; Korea has 9 days and three picks. Owner tests reseed first.
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
 * A click on desktop, a tap on the phone projects (what the traveler does), after scrolling the element to the middle
 * of the screen. In WebKit's iPhone emulation a mouse click on a scrolled page lands under the sticky app bar
 * ("<header> intercepts pointer events"), whatever the target; a tap does not.
 */
async function press(target: Locator): Promise<void> {
	await target.evaluate((el) => {
		el.scrollIntoView({ block: 'center' });
	});
	if (test.info().project.name === 'desktop') await target.click();
	else await target.tap();
}

async function navigate(page: Page, go: () => Promise<Response | null>): Promise<void> {
	const first = await go();
	if (first === null || first.ok()) return;
	await page.waitForTimeout(11_000);
	await go();
}

async function openBoard(page: Page): Promise<void> {
	await navigate(page, () => page.goto('/decide/board'));
	await expect(page.getByRole('heading', { level: 1, name: 'Board' })).toBeVisible();
	await page.waitForLoadState('networkidle');
}

const country = (page: Page, id: string): Locator => page.locator(`[data-country="${id}"]`);
const stepper = (page: Page, id: string): Locator =>
	country(page, id).locator('[data-days-stepper]');
const daysum = (page: Page): Locator => page.locator('[data-daysum]');

test.describe('owner', () => {
	test.use({ storageState: STORAGE.owner });
	test.describe.configure({ mode: 'serial' });
	test.beforeAll(reseed);
	// Leave the e2e data set as the next spec expects it: a CI shard runs any mix of spec files on one backend.
	test.afterAll(reseed);

	test('ranks each country with the cut line, the stepper, budget and mix', async ({ page }) => {
		await openBoard(page);
		await expect(daysum(page)).toHaveText(/58\s*\/ 65 days\s*-7 vs trip plan\s*Reset/);
		await expect(page.locator('[data-country]')).toHaveCount(6);
		const korea = country(page, 'korea');
		await expect(korea.getByRole('heading', { level: 2 })).toHaveText('🇰🇷 South Korea');
		await expect(korea).toContainText('11 Jan – 20 Jan');
		await expect(stepper(page, 'korea').locator('output')).toHaveText(/^9\s*days\s*$/);
		await expect(korea.locator('[data-board-row]')).toHaveCount(3);
		await expect(korea.locator('[data-cut]')).toHaveText(
			/✂ 9 days · one pick per day\s*6 open days: swipe more or ask the curator/,
		);
		await expect(korea.locator('[data-budget]')).toContainText('Budget');
		await expect(korea.locator('[data-mix]')).toContainText('3 picks above the line');
		await expect(stepper(page, 'china').locator('output')).toHaveText(/^25\s*days\s*plan 27\s*$/);
		// the locked New Year's Eve pick ranks first in China with its lock tag
		await expect(country(page, 'china').locator('[data-board-row]').first()).toHaveAttribute(
			'data-board-row',
			'harbin-ice-world',
		);
		await expect(country(page, 'china').locator('[data-lock-tag="nye"]')).toBeVisible();
	});

	test('the side panels: balance, holiday locks and book ahead', async ({ page }) => {
		await openBoard(page);
		const balance = page.locator('[data-panel="balance"]');
		await expect(balance.getByRole('heading', { name: 'Balance' })).toBeVisible();
		expect(await balance.locator('li[data-cat]').count()).toBeGreaterThan(0);
		const holidays = page.locator('[data-panel="holidays"]');
		await expect(holidays.locator('[data-lock-chip="nye"]')).toContainText('🔒');
		await expect(
			holidays.locator('[data-lock-row="christmas"]').getByRole('link', { name: 'Pick →' }),
		).toHaveAttribute('href', '/decide/holidays');
		await expect(holidays.locator('[data-lock-row="lny"]')).toContainText('0 of 4 Must →');
		await press(holidays.locator('[data-lock-chip="nye"]'));
		await expect(page.getByRole('dialog')).toHaveAttribute('data-sheet', 'place:harbin-ice-world');
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(
			page.locator('[data-panel="book"]').getByRole('heading', { name: 'Book ahead' }),
		).toBeVisible();
	});

	test('fewer days move the cut line up, the change is saved, and Reset goes back to the plan', async ({
		page,
	}) => {
		await openBoard(page);
		const less = stepper(page, 'korea').getByRole('button', { name: 'One day less' });
		for (let i = 0; i < 8; i++) await press(less);
		await expect(stepper(page, 'korea').locator('output')).toHaveText(/^1\s*day\s*plan 9\s*$/);
		const korea = country(page, 'korea');
		await expect(korea.locator('[data-cut]')).toHaveText('✂ 1 day · one pick per day');
		await expect(korea.locator('[data-board-row][data-below]')).toHaveCount(2);
		await expect(korea.locator('li').nth(1).locator('[data-cut]')).toBeVisible();
		await expect(daysum(page)).toContainText('50 / 65 days');
		// sent after the 350 ms pause; it survives a reload
		await page.waitForTimeout(800);
		await page.waitForLoadState('networkidle');
		await page.reload();
		await expect(stepper(page, 'korea').locator('output')).toHaveText(/^1\s*day\s*plan 9\s*$/);
		await press(page.getByRole('button', { name: 'Reset' }));
		await expect(daysum(page)).toHaveText(/^\s*65\s*\/ 65 days\s*$/);
		await expect(stepper(page, 'korea').locator('output')).toHaveText(/^9\s*days\s*$/);
		await expect(page.getByRole('button', { name: 'Reset' })).toHaveCount(0);
		await page.waitForLoadState('networkidle');
		await page.reload();
		await expect(daysum(page)).toHaveText(/^\s*65\s*\/ 65 days\s*$/);
	});

	test('a tap on a row opens the place sheet', async ({ page }) => {
		await openBoard(page);
		await press(country(page, 'korea').locator('[data-board-row="lol-park-t1"]'));
		await expect(page.getByRole('dialog')).toHaveAttribute('data-sheet', 'place:lol-park-t1');
	});
});

test.describe('guest', () => {
	test.use({ storageState: STORAGE.guest });

	test('sees the board with the days controls disabled', async ({ page }) => {
		await openBoard(page);
		await expect(page.getByText('Read only: guests can look at the board')).toBeVisible();
		await expect(page.locator('[data-country]')).toHaveCount(6);
		await expect(
			stepper(page, 'korea').getByRole('button', { name: 'One day more' }),
		).toBeDisabled();
		await expect(
			stepper(page, 'korea').getByRole('button', { name: 'One day less' }),
		).toBeDisabled();
		const reset = page.getByRole('button', { name: 'Reset' });
		if ((await reset.count()) > 0) await expect(reset).toBeDisabled();
	});
});
