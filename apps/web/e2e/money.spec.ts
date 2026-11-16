// Money (slice G): totals against the cap, the booking check, per-country budgets, fixed costs and the spending log,
// against the e2e trip set (packages/migrate/fixtures/e2e/trip, reseeded on every backend start). Writes go through
// the UI and each test undoes its own. No direct Convex calls: each one re-checks the JWT against Better Auth's
// rate-limited JWKS route, and a reset per file was enough to hit the 429.
import { expect, test, type Page, type Response } from '@playwright/test';
import { STORAGE } from './support';

/**
 * page.goto / page.reload that waits out one Better Auth rate-limit window. Every server-side Convex call fetches
 * Better Auth's JWKS route, which shares the default limit (100 requests, 10 s quiet window) with every other auth
 * request behind the proxy, so a long run gets a 429 page now and then (reported to the integrator; the fix is a
 * rule for /convex/jwks in convex/auth.ts).
 */
async function navigate(page: Page, go: () => Promise<Response | null>): Promise<void> {
	const first = await go();
	if (first === null || first.ok()) return;
	await page.waitForTimeout(11_000);
	await go();
}

async function openMoney(page: Page): Promise<void> {
	await navigate(page, () => page.goto('/money'));
	await expect(page.getByRole('heading', { level: 1, name: 'Money' })).toBeVisible();
}

test.describe('owner', () => {
	test.use({ storageState: STORAGE.owner });

	test('shows the plan against the cap, the country budget, fixed costs and the log', async ({
		page,
	}) => {
		await openMoney(page);
		await expect(page.getByTestId('eyebrow')).toHaveText('R$ 16.290 planned · cap R$ 40.000');
		const sum = page.getByTestId('money-summary');
		await expect(sum.getByTestId('plan-total')).toHaveText('R$ 16.290');
		await expect(sum.getByText('planned of your R$ 40.000 cap')).toBeVisible();
		await expect(sum.getByText('R$ 23.710 to spare')).toBeVisible();
		await expect(sum.getByText('Logged so far')).toContainText('R$ 39');

		await expect(page.getByRole('heading', { name: 'Per day, by country' })).toContainText(
			'R$ 7.290 over 27 days',
		);
		const china = page.getByTestId('budget-card').filter({ hasText: 'China' });
		await expect(china).toContainText('R$ 270 / day · 27 days · R$ 7.290');
		await expect(china).toContainText('Spent R$ 39 of R$ 7.290');
		await expect(china.getByText('Alipay with a foreign card.')).toBeHidden();
		await china.getByRole('button', { name: 'How to pay in China' }).click();
		await expect(china.getByText('Alipay with a foreign card.')).toBeVisible();

		await expect(page.getByText('How money works on this trip')).toBeVisible();
		await expect(page.getByText('Convert a few days at a time.')).toBeVisible();

		const flights = page.getByTestId('fixed-row').filter({ hasText: 'Flights' });
		await expect(flights).toContainText('Paid');
		await expect(flights).toContainText('R$ 9.000');
		await expect(flights).toContainText('All long-haul legs.');

		await expect(page.getByRole('heading', { name: 'Spending log' })).toContainText(
			'Bed R$ 0 · Food R$ 0 · Other R$ 39',
		);
		const day = page.getByTestId('spend-day').filter({ hasText: 'Sun 6 Dec' });
		const metro = day.getByTestId('spend-row').filter({ hasText: 'Metro card' });
		await expect(metro).toContainText('Other');
		await expect(metro).toContainText('China');
		await expect(metro).toContainText('R$ 39');
		await expect(metro).toContainText('50 CNY');
	});

	test('the booking check compares a price with the daily budget', async ({ page }) => {
		await openMoney(page);
		const check = page.getByTestId('price-check');
		const verdict = check.getByTestId('verdict');
		await expect(verdict).toHaveText('Type a price to compare it with your daily budget.');
		await expect(check.getByLabel('Country')).toHaveValue('china');
		await expect(check.getByLabel('Currency')).toHaveValue('CNY');
		await check.getByLabel('Price').fill('100');
		await expect(verdict).toHaveText(
			'100 CNY ≈ R$ 72. R$ 48 under your R$ 120 bed budget per night in China.',
		);
		await expect(verdict).toHaveAttribute('data-level', 'ok');
		await check.getByLabel('What').selectOption('food');
		await check.getByLabel('Currency').selectOption('BRL');
		await expect(verdict).toHaveText(
			'R$ 10 over your R$ 90 food budget per day in China. Fine if you save elsewhere.',
		);
		await check.getByLabel('Price').fill('300');
		await expect(verdict).toHaveAttribute('data-level', 'over');
		await expect(verdict).toContainText('Look for something cheaper, or plan to make it up.');
	});

	test('logs, edits and deletes an expense in local money, converted to reais @write', async ({
		page,
	}, testInfo) => {
		const note = `E2E taxi ${testInfo.project.name}`;
		await openMoney(page);

		await page.getByRole('button', { name: 'Log expense' }).click();
		let dialog = page.getByRole('dialog', { name: 'Add expense' });
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Enter the amount first.')).toBeVisible();
		await dialog.getByLabel('What').fill(note);
		await dialog.getByLabel('Amount').fill('100');
		await dialog.getByLabel('Currency').selectOption('THB');
		await dialog.getByLabel('Country').selectOption('thailand');
		await expect(dialog.getByLabel('Type')).toHaveValue('food');
		await dialog.getByRole('button', { name: 'Save' }).click();
		await expect(dialog).toBeHidden();
		await expect(page.getByText('Added', { exact: true })).toBeVisible();
		const row = page.getByTestId('spend-row').filter({ hasText: note });
		await expect(row).toContainText('R$ 16');
		await expect(row).toContainText('100 THB');
		await expect(row).toContainText('Thailand');
		await expect(row).toContainText('Food');

		await navigate(page, () => page.reload());
		await expect(row).toContainText('R$ 16');

		await row.getByRole('button', { name: `Edit: ${note}` }).click();
		dialog = page.getByRole('dialog', { name: 'Edit expense' });
		await expect(dialog.getByLabel('Amount')).toHaveValue('100');
		await dialog.getByLabel('Amount').fill('200');
		await dialog.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Saved', { exact: true })).toBeVisible();
		await expect(row).toContainText('R$ 31');
		await expect(row).toContainText('200 THB');

		await row.getByRole('button', { name: `Edit: ${note}` }).click();
		await dialog.getByRole('button', { name: 'Delete' }).click();
		await expect(dialog.getByText('Tap Delete again to remove it.')).toBeVisible();
		await dialog.getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByText('Deleted', { exact: true })).toBeVisible();
		await expect(row).toHaveCount(0);
	});

	test('adds and removes a fixed cost, and edits the cap @write', async ({ page }, testInfo) => {
		const title = `E2E insurance ${testInfo.project.name}`;
		await openMoney(page);
		await page.getByRole('button', { name: 'Add cost' }).click();
		const add = page.getByRole('dialog', { name: 'Add cost' });
		await add.getByLabel('Cost').fill(title);
		await add.getByLabel('Amount (R$)').fill('1000');
		await add.getByLabel('Status').selectOption('estimate');
		await add.getByRole('button', { name: 'Save' }).click();
		const row = page.getByTestId('fixed-row').filter({ hasText: title });
		await expect(row).toContainText('Estimate');
		await expect(row).toContainText('R$ 1.000');
		await expect(page.getByTestId('eyebrow')).toHaveText('R$ 17.290 planned · cap R$ 40.000');

		await page.getByRole('button', { name: 'Edit: trip budget' }).click();
		const settings = page.getByRole('dialog', { name: 'Edit budget' });
		await expect(settings.getByRole('button', { name: 'Delete' })).toHaveCount(0);
		await settings.getByLabel('Trip budget cap (R$)').fill('10000');
		await settings.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByTestId('money-summary').getByText('R$ 7.290 over')).toBeVisible();
		await page.getByRole('button', { name: 'Edit: trip budget' }).click();
		await settings.getByLabel('Trip budget cap (R$)').fill('40000');
		await settings.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByTestId('money-summary').getByText('R$ 22.710 to spare')).toBeVisible();

		await row.getByRole('button', { name: `Edit: ${title}` }).click();
		const edit = page.getByRole('dialog', { name: 'Edit cost' });
		await edit.getByRole('button', { name: 'Delete' }).click();
		await edit.getByRole('button', { name: 'Delete' }).click();
		await expect(row).toHaveCount(0);
		await expect(page.getByTestId('eyebrow')).toHaveText('R$ 16.290 planned · cap R$ 40.000');
	});

	test('Escape and Cancel close the sheet without writing', async ({ page }) => {
		await openMoney(page);
		await page.getByRole('button', { name: 'Log expense' }).click();
		const dialog = page.getByRole('dialog', { name: 'Add expense' });
		await dialog.getByLabel('Amount').fill('5');
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		await page.getByRole('button', { name: 'Log expense' }).click();
		await expect(dialog.getByLabel('Amount')).toHaveValue('');
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(dialog).toBeHidden();
		await expect(page.getByTestId('spend-row')).toHaveCount(1);
	});
});

test.describe('guest', () => {
	test.use({ storageState: STORAGE.guest });

	test('sees every number and the booking check, with no write controls', async ({ page }) => {
		await openMoney(page);
		await expect(page.getByTestId('eyebrow')).toHaveText('R$ 16.290 planned · cap R$ 40.000');
		await expect(page.getByTestId('spend-row').filter({ hasText: 'Metro card' })).toBeVisible();
		await expect(page.getByTestId('fixed-row').filter({ hasText: 'Flights' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Log expense' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Add cost' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: /^Edit:/ })).toHaveCount(0);
		await page.getByTestId('price-check').getByLabel('Price').fill('100');
		await expect(page.getByTestId('verdict')).toHaveAttribute('data-level', 'ok');
	});
});
