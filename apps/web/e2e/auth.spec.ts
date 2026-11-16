import { expect, test } from '@playwright/test';
import { api } from '../src/convex/_generated/api.js';
import { clientIp, convexAs, convexToken, credentials, refusalCode, STORAGE } from './support';

test.describe('writes', () => {
	test('the guest is refused by ownerMutation; the owner is not', async ({
		playwright,
		baseURL,
	}) => {
		for (const account of ['guest', 'owner'] as const) {
			const request = await playwright.request.newContext({
				baseURL: baseURL ?? '',
				storageState: STORAGE[account],
			});
			const client = convexAs(await convexToken(request));
			const code = await refusalCode(
				client.mutation(api.e2e.probeWrite, { clientOpId: crypto.randomUUID() }),
			);
			expect(code, account).toBe(account === 'guest' ? 'Forbidden' : null);
			await request.dispose();
		}
	});

	test('the guest may not change the password (spike S11)', async ({ playwright, baseURL }) => {
		const request = await playwright.request.newContext({
			baseURL: baseURL ?? '',
			storageState: STORAGE.guest,
		});
		const response = await request.post('/api/auth/change-password', {
			headers: { origin: baseURL ?? '' },
			data: { currentPassword: credentials('guest').password, newPassword: 'another-password-123' },
		});
		expect(response.status()).toBe(403);
		await request.dispose();
	});

	test('sign-up is disabled', async ({ request, baseURL }) => {
		const response = await request.post('/api/auth/sign-up/email', {
			headers: { origin: baseURL ?? '' },
			data: { email: 'someone@example.invalid', password: 'a-long-password-1', name: 'x' },
		});
		expect(response.status()).toBe(404);
	});
});

test.describe('session', () => {
	test.use({ storageState: STORAGE.owner });

	test('a reload without the Convex JWT cookie stays signed in', async ({ page, context }) => {
		await page.goto('/');
		await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
		const kept = (await context.cookies()).filter((c) => !c.name.endsWith('convex_jwt'));
		await context.clearCookies();
		await context.addCookies(kept);
		await page.reload();
		await expect(page).not.toHaveURL(/\/login/);
		await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
		expect((await context.cookies()).some((c) => c.name.endsWith('convex_jwt'))).toBe(true);
	});

	test('a full reload after the JWT expired stays signed in (spike S9)', async ({
		page,
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'one 70 s wait is enough');
		test.setTimeout(150_000);
		// The local deployment runs with JWT_EXPIRATION_SECONDS=60 (scripts/convex-local.sh init-env).
		await page.goto('/');
		await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
		await page.waitForTimeout(70_000);
		await page.reload();
		await expect(page).not.toHaveURL(/\/login/);
		await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
	});
});

test.describe('sign-in', () => {
	test('works with JavaScript off (spike S10)', async ({ browser, baseURL }, testInfo) => {
		const context = await browser.newContext({
			javaScriptEnabled: false,
			baseURL: baseURL ?? '',
			extraHTTPHeaders: { 'x-forwarded-for': clientIp(testInfo.project.name, 4) },
		});
		const page = await context.newPage();
		const { username, password } = credentials('owner');
		await page.goto('/login');
		await page.getByLabel('Username').fill(username);
		await page.getByLabel('Password').fill(password);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
		await context.close();
	});

	test('the 6th bad sign-in from one IP gets 429, another IP still signs in (spike S12)', async ({
		request,
		baseURL,
	}, testInfo) => {
		const ipA = clientIp(testInfo.project.name, 5);
		const ipB = clientIp(testInfo.project.name, 6);
		const attempt = (ip: string, password: string) =>
			request.post('/api/auth/sign-in/username', {
				headers: { origin: baseURL ?? '', 'x-forwarded-for': ip },
				data: { username: credentials('owner').username, password },
			});
		for (let i = 0; i < 5; i++) expect((await attempt(ipA, 'wrong-password')).status()).toBe(401);
		expect((await attempt(ipA, credentials('owner').password)).status()).toBe(429);
		expect((await attempt(ipB, credentials('owner').password)).status()).toBe(200);
	});

	test('sign out revokes the session', async ({ browser, baseURL }, testInfo) => {
		const context = await browser.newContext({
			baseURL: baseURL ?? '',
			extraHTTPHeaders: { 'x-forwarded-for': clientIp(testInfo.project.name, 7) },
		});
		const page = await context.newPage();
		const { username, password } = credentials('owner');
		await page.goto('/login');
		await page.getByLabel('Username').fill(username);
		await page.getByLabel('Password').fill(password);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
		const before = await context.cookies();

		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page).toHaveURL(/\/login/);

		// Replaying the old cookies does not bring the session back.
		await context.addCookies(before);
		await page.goto('/');
		await expect(page).toHaveURL(/\/login/);
		await context.close();
	});
});
