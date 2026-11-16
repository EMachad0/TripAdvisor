import { expect, test, type Page } from '@playwright/test';
import { api } from '../src/convex/_generated/api.js';
import { clientIp, convexAs, convexToken, credentials, STORAGE } from './support';

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
		// Each tab opens its section's first page (Trip: the Itinerary; Decide: the overview).
		for (const [label, path, heading] of [
			['Trip', '/trip/itinerary', 'Itinerary'],
			['Places', '/places', 'Places'],
			['Decide', '/decide', /Rank the trip/],
			['Money', '/money', 'Money'],
			['Prep', '/prep', 'Prep'],
			['Today', '/', 'Today'],
		] as const) {
			await nav.getByRole('link', { name: label }).click();
			await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/' : path}$`));
			await expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
			await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
		}
	});

	test('sections with several pages show their sub-tabs; /trip and old hash links redirect', async ({
		page,
	}) => {
		for (const [path, nav, links] of [
			['/trip/itinerary', 'Trip', ['Itinerary', 'Calendar', 'Map']],
			['/places', 'Places pages', ['Places', 'Answers']],
			[
				'/decide/swipe',
				'Decide pages',
				['Overview', 'Areas', 'Swipe', 'Duels', 'Board', 'Holidays', 'My calls'],
			],
			['/prep/bag', 'Prep pages', ['To do', 'Bag']],
		] as const) {
			await page.goto(path);
			const sub = page.getByRole('navigation', { name: nav, exact: true });
			for (const l of links) await expect(sub.getByRole('link', { name: l })).toBeVisible();
		}
		await page.goto('/trip');
		await expect(page).toHaveURL(/\/trip\/itinerary$/);
		await page.goto('/#/calendar');
		await expect(page).toHaveURL(/\/trip\/calendar$/);
		await page.goto('/#/home');
		await expect(page).toHaveURL(/\/decide$/);
		await expect(page.getByRole('navigation', { name: 'Decide pages' })).toBeVisible();
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

test.describe('health and data @smoke', () => {
	test('/healthz answers without a session, with the commit; deep=1 checks Convex', async ({
		request,
	}) => {
		const plain = await request.get('/healthz');
		expect(plain.status()).toBe(200);
		const body = (await plain.json()) as { ok: boolean; sha: string };
		expect(body.ok).toBe(true);
		expect(body.sha).toMatch(/^[0-9a-f]{40}$|^build-/);
		const deep = await request.get('/healthz?deep=1');
		expect(deep.status()).toBe(200);
		expect(await deep.json()).toMatchObject({ ok: true, sha: body.sha, convex: { ok: true } });
	});

	test('the e2e seed is in the backend: content index published, feedback and trip loaded', async ({
		playwright,
		baseURL,
	}) => {
		const request = await playwright.request.newContext({
			baseURL: baseURL ?? '',
			storageState: STORAGE.guest,
		});
		const client = convexAs(await convexToken(request));
		const route = await client.query(api.route.current, {});
		expect(route.countries.map((c) => c.id)).toEqual([
			'china',
			'thailand',
			'singapore',
			'korea',
			'japan',
			'hong-kong',
		]);
		const feedback = await client.query(api.feedback.state, {});
		expect(Object.keys(feedback.verdicts.place).length).toBeGreaterThan(5);
		const trip = await client.query(api.trip.all, {});
		expect(trip.legs.length).toBeGreaterThan(0);
		await request.dispose();
	});
});

test.describe('content refresh and first-seen @smoke', () => {
	test('the owner client records first-seen keys through write.ts, without console errors', async ({
		page,
		playwright,
		baseURL,
	}) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));
		page.on('console', (m) => {
			if (m.type() === 'error') errors.push(m.text());
		});
		const request = await playwright.request.newContext({
			baseURL: baseURL ?? '',
			storageState: STORAGE.owner,
		});
		const client = convexAs(await convexToken(request));
		await page.context().addCookies((await request.storageState()).cookies);
		await page.goto('/');
		await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
		// area:shanghai is in the e2e content but not in the seeded firstSeen rows.
		// Slow polling: every Convex call checks the JWT against Better Auth's JWKS route, which shares the auth
		// rate limit (one bucket behind the proxy) with the rest of the suite's sign-ins and token refreshes.
		await expect
			.poll(async () => (await client.query(api.feedback.state, {})).firstSeen['area:shanghai'], {
				intervals: [1500],
				timeout: 15_000,
			})
			.toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
		expect(errors).toEqual([]);
		await request.dispose();
	});

	test('the guest client writes nothing', async ({ browser, playwright, baseURL }) => {
		const context = await browser.newContext({ storageState: STORAGE.guest });
		const page = await context.newPage();
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await page.goto('/places');
		await expect(page.getByText('Guest · read only')).toBeVisible();
		expect(errors).toEqual([]);
		const request = await playwright.request.newContext({
			baseURL: baseURL ?? '',
			storageState: STORAGE.guest,
		});
		const state = await convexAs(await convexToken(request)).query(api.feedback.state, {});
		expect(state.firstRun).not.toBeNull();
		await request.dispose();
		await context.close();
	});
});
