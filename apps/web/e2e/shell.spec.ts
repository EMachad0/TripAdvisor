import { expect, test, type Page } from '@playwright/test';
import { clientIp, credentials, STORAGE } from './support';

const TABS = ['Today', 'Trip', 'Places', 'Decide', 'Money', 'Prep'];

async function expectShell(page: Page): Promise<void> {
	const nav = page.getByRole('navigation', { name: 'Sections' });
	for (const label of TABS) await expect(nav.getByRole('link', { name: label })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

test.describe('signed out', () => {
	test('every section redirects to the login page', async ({ page }) => {
		for (const path of ['/', '/trip', '/places', '/decide', '/money', '/prep']) {
			await page.goto(path);
			await expect(page).toHaveURL(/\/login/);
			await expect(page.getByLabel('Username')).toBeVisible();
		}
		await page.goto('/trip');
		expect(new URL(page.url()).searchParams.get('redirectTo')).toBe('/trip');
	});

	test('the owner signs in through the form and sees the shell', async ({ page }, testInfo) => {
		await page.setExtraHTTPHeaders({ 'x-forwarded-for': clientIp(testInfo.project.name, 2) });
		const { username, password } = credentials('owner');
		await page.goto('/places');
		await page.getByLabel('Username').fill(username);
		await page.getByLabel('Password').fill(password);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page).toHaveURL(/\/places$/);
		await expectShell(page);
		await expect(page.getByText('Guest · read only')).toHaveCount(0);
	});

	test('a wrong password shows an error and stays on the form', async ({ page }, testInfo) => {
		await page.setExtraHTTPHeaders({ 'x-forwarded-for': clientIp(testInfo.project.name, 3) });
		await page.goto('/login');
		await page.getByLabel('Username').fill(credentials('owner').username);
		await page.getByLabel('Password').fill('not-the-password');
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByText('Wrong username or password.')).toBeVisible();
		await expect(page).toHaveURL(/\/login/);
	});
});

test.describe('owner', () => {
	test.use({ storageState: STORAGE.owner });

	test('sees the shell and every tab opens', async ({ page }) => {
		await page.goto('/');
		await expectShell(page);
		await expect(page.getByTestId('username')).toHaveText(credentials('owner').username);
		const nav = page.getByRole('navigation', { name: 'Sections' });
		for (const [label, path] of [
			['Trip', '/trip'],
			['Places', '/places'],
			['Decide', '/decide'],
			['Money', '/money'],
			['Prep', '/prep'],
			['Today', '/'],
		] as const) {
			await nav.getByRole('link', { name: label }).click();
			await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/' : path}$`));
			await expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
			await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible();
		}
	});
});

test.describe('guest', () => {
	test.use({ storageState: STORAGE.guest });

	test('sees the shell with the read-only badge', async ({ page }) => {
		await page.goto('/');
		await expectShell(page);
		await expect(page.getByText('Guest · read only')).toBeVisible();
	});
});
