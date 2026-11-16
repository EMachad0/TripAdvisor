// Bag (slice G): items by category with packed counts, the tick box, "Untick all" (one trip.bagUntickAll write),
// add / edit / delete with category suggestions, and the guest view, against the e2e trip set (reseeded on every
// backend start). Each write test undoes its own changes through the UI.
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

async function openBag(page: Page): Promise<void> {
	await navigate(page, () => page.goto('/prep/bag'));
	await expect(page.getByRole('heading', { level: 1, name: 'Bag' })).toBeVisible();
}

const group = (page: Page, name: string) => page.getByRole('region', { name });

test.describe('owner', () => {
	test.use({ storageState: STORAGE.owner });

	test('groups items by category with packed counts, quantities and notes', async ({ page }) => {
		await openBag(page);
		await expect(page.getByTestId('eyebrow')).toHaveText('1 of 2 packed');
		await expect(page.getByRole('progressbar', { name: '1 of 2 packed' })).toBeVisible();
		await expect(page.getByTestId('bag-group')).toHaveCount(2);
		await expect(group(page, 'Clothes')).toContainText('0/1');
		await expect(group(page, 'Clothes')).toContainText('For Harbin.');
		await expect(group(page, 'Tech')).toContainText('1/1');
		await expect(group(page, 'Tech')).toContainText('×2');
		await expect(page.getByRole('checkbox', { name: 'Packed: Plug adapter' })).toBeChecked();
		await expect(page.getByRole('checkbox', { name: 'Packed: Winter boots' })).not.toBeChecked();
	});

	test('packs an item, unticks everything after confirming, and packs again @write', async ({
		page,
	}) => {
		await openBag(page);
		await page.getByRole('checkbox', { name: 'Packed: Winter boots' }).click();
		await expect(page.getByTestId('eyebrow')).toHaveText('2 of 2 packed');
		await expect(group(page, 'Clothes')).toContainText('1/1');

		await page.getByRole('button', { name: 'Untick all' }).click();
		const confirm = page.getByRole('alertdialog', { name: 'Untick all 2 packed items?' });
		await confirm.getByRole('button', { name: 'Cancel' }).click();
		await expect(confirm).toBeHidden();
		await expect(page.getByTestId('eyebrow')).toHaveText('2 of 2 packed');

		await page.getByRole('button', { name: 'Untick all' }).click();
		await confirm.getByRole('button', { name: 'Confirm: untick all' }).click();
		await expect(page.getByText('All items unticked')).toBeVisible();
		await expect(page.getByTestId('eyebrow')).toHaveText('0 of 2 packed');
		await expect(page.getByRole('button', { name: 'Untick all' })).toHaveCount(0);

		await navigate(page, () => page.reload());
		await expect(page.getByTestId('eyebrow')).toHaveText('0 of 2 packed');
		await page.getByRole('checkbox', { name: 'Packed: Plug adapter' }).click();
		await expect(page.getByTestId('eyebrow')).toHaveText('1 of 2 packed');
	});

	test('adds an item in a known category, edits its quantity and deletes it @write', async ({
		page,
	}, testInfo) => {
		const item = `E2E gloves ${testInfo.project.name}`;
		await openBag(page);
		await page.getByRole('button', { name: 'Add item' }).click();
		const add = page.getByRole('dialog', { name: 'Add item' });
		await expect(add.locator('datalist option')).toHaveCount(2);
		await add.getByLabel('Item').fill(item);
		await add.getByLabel('Category').fill('Clothes');
		await add.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Added', { exact: true })).toBeVisible();
		await expect(group(page, 'Clothes')).toContainText(item);
		await expect(group(page, 'Clothes')).toContainText('0/2');
		await expect(page.getByTestId('eyebrow')).toHaveText('1 of 3 packed');

		const r = page.getByTestId('check-row').filter({ hasText: item });
		await r.getByRole('button', { name: `Edit: ${item}` }).click();
		const edit = page.getByRole('dialog', { name: 'Edit item' });
		await expect(edit.getByLabel('Quantity')).toHaveValue('1');
		await edit.getByLabel('Quantity').fill('3');
		await edit.getByRole('button', { name: 'Save' }).click();
		await expect(r).toContainText('×3');

		await r.getByRole('button', { name: `Edit: ${item}` }).click();
		await edit.getByRole('button', { name: 'Delete' }).click();
		await edit.getByRole('button', { name: 'Delete' }).click();
		await expect(r).toHaveCount(0);
		await expect(page.getByTestId('eyebrow')).toHaveText('1 of 2 packed');
	});
});

test.describe('guest', () => {
	test.use({ storageState: STORAGE.guest });

	test('sees the bag with the boxes disabled and no untick, add or edit', async ({ page }) => {
		await openBag(page);
		await expect(page.getByTestId('eyebrow')).toHaveText('1 of 2 packed');
		await expect(page.getByRole('checkbox', { name: 'Packed: Plug adapter' })).toBeDisabled();
		await expect(page.getByRole('checkbox', { name: 'Packed: Winter boots' })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Untick all' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Add item' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: /^Edit:/ })).toHaveCount(0);
	});
});
