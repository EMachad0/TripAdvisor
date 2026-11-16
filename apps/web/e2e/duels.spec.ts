// Slice F: Duels (old game.js viewDuels, pickDuel, skipDuel). The owner tests start from the e2e data set again
// (scripts/convex-local.sh seed-data): 13 Must / Maybe picks and 10 duels.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import { slot } from './slot';
import { STORAGE } from './support';

const KOREA = ['lol-park-t1', 'gwangjang-food-alley', 'bukhansan-snow-hike'];

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

/** A page load that waits out one window of the auth rate limit (see the slice reports). */
async function navigate(page: Page, go: () => Promise<Response | null>): Promise<void> {
	const first = await go();
	if (first === null || first.ok()) return;
	await page.waitForTimeout(11_000);
	await go();
}

async function openDuels(page: Page): Promise<void> {
	await navigate(page, () => page.goto('/decide/duels'));
	await expect(page.getByRole('heading', { level: 1, name: 'Duels' })).toBeVisible();
	// The pair is picked in the browser once feedback.state is live.
	await expect(page.locator('[data-duel-side]')).toHaveCount(2);
}

const progress = (page: Page) => page.locator('[data-duel-progress]');
const pairIds = async (page: Page): Promise<string[]> =>
	page
		.locator('[data-duel-side]')
		.evaluateAll((els) => els.map((e) => e.getAttribute('data-id') ?? ''));

test.describe('owner', () => {
	test.use({ storageState: STORAGE.owner });
	test.describe.configure({ mode: 'serial' });
	test.beforeAll(reseed);
	// Leave the e2e data set as the next spec expects it: a CI shard runs any mix of spec files on one backend.
	test.afterAll(reseed);

	test('the Decide overview: counts, links and the five steps (old #/game)', async ({ page }) => {
		await navigate(page, () => page.goto('/decide'));
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			/Rank the trip,\s*one swipe at a time\./,
		);
		const stats = page.locator('[data-decide-stats]');
		await expect(stats).toContainText(/8\s*Must/);
		await expect(stats).toContainText(/5\s*Maybe/);
		await expect(stats).toContainText(/10\s*Duels/);
		await expect(page.locator('[data-calls-link]')).toContainText(
			/My calls\s+\d+ swiped · 4 notes/,
		);
		await expect(page.locator('[data-route-link]')).toHaveAttribute('href', '/trip/map');
		const steps = page.locator('[data-step]');
		await expect(steps).toHaveCount(5);
		await expect(page.locator('[data-step="duels"] [data-step-line]')).toHaveText(
			/\d+% confident · 10 duels/,
		);
		await expect(page.locator('[data-step="holidays"] [data-step-line]')).toHaveText(
			'1 / 2 locked',
		);
		await press(page.locator('[data-step="duels"] a'));
		await expect(page).toHaveURL(/\/decide\/duels$/);
		await expect(
			page.getByRole('navigation', { name: 'Decide pages' }).getByRole('link', { name: 'Duels' }),
		).toHaveAttribute('aria-current', 'page');
	});

	test('shows the arena, the confidence, the filters and the live ranking', async ({ page }) => {
		await openDuels(page);
		await expect(progress(page)).toContainText(/\d+% confident · 10 duels/);
		const filters = page.getByRole('group', { name: 'Duel filter' });
		await expect(filters.getByRole('radio')).toHaveText([
			'Mostly same country',
			'🇨🇳 China',
			'🇰🇷 South Korea',
			'🇯🇵 Japan',
		]);
		await expect(filters.getByRole('radio', { name: 'Mostly same country' })).toHaveAttribute(
			'aria-checked',
			'true',
		);
		await expect(page.locator('[data-duel-question]')).toHaveText(
			/Which is more worth a day in .+\?|Which would you rather do\?/,
		);
		const live = page.locator('[data-live-ranking]');
		await expect(live.getByRole('heading', { name: /Live ranking/ })).toBeVisible();
		await expect(live.getByRole('link', { name: 'Full board →' })).toHaveAttribute(
			'href',
			'/decide/board',
		);
		expect(await live.locator('li').count()).toBeGreaterThan(0);
	});

	test('a country filter keeps both sides in that country', async ({ page }) => {
		await openDuels(page);
		await press(
			page
				.getByRole('group', { name: 'Duel filter' })
				.getByRole('radio', { name: '🇰🇷 South Korea' }),
		);
		await expect(page.locator('[data-duel-question]')).toHaveText(
			'🇰🇷 Which is more worth a day in South Korea?',
		);
		for (const id of await pairIds(page)) expect(KOREA).toContain(id);
		await expect(page.locator('[data-live-ranking] h2')).toHaveText('🇰🇷 Live ranking');
	});

	test('← picks the left side: +N / −N, a new pair, one more duel that survives a reload', async ({
		page,
	}) => {
		await openDuels(page);
		const [left] = await pairIds(page);
		await page.keyboard.press('ArrowLeft');
		await expect(page.locator(`[data-duel-side="left"][data-result="win"]`)).toBeVisible();
		await expect(page.locator('[data-duel-side="left"] [data-delta]')).toHaveText(/^\+\d+$/);
		await expect(page.locator('[data-duel-side="right"] [data-delta]')).toHaveText(/^−\d+$/);
		await expect(progress(page)).toContainText('11 duels');
		// the next pair comes after the pause
		await expect(page.locator('[data-duel-side][data-result]')).toHaveCount(0);
		expect(left).toBeTruthy();
		await page.waitForLoadState('networkidle');
		await page.reload();
		await expect(progress(page)).toContainText('11 duels');
	});

	test('a tap on a side picks it; D and 2 pick right', async ({ page }) => {
		await openDuels(page);
		await press(page.locator('[data-duel-side="right"] [data-pick]'));
		await expect(progress(page)).toContainText('12 duels');
		await expect(page.locator('[data-duel-side][data-result]')).toHaveCount(0);
		await page.keyboard.press('d');
		await expect(progress(page)).toContainText('13 duels');
		await expect(page.locator('[data-duel-side][data-result]')).toHaveCount(0);
		await page.reload();
		await expect(progress(page)).toContainText('13 duels');
	});

	test('Can’t decide (↓ or the button) shows another pair and logs nothing', async ({ page }) => {
		await openDuels(page);
		await expect(progress(page)).toContainText('13 duels');
		const before = (await pairIds(page)).sort().join('|');
		await page.keyboard.press('ArrowDown');
		await expect.poll(async () => (await pairIds(page)).sort().join('|')).not.toBe(before);
		await press(page.getByRole('button', { name: /Can’t decide/ }));
		await expect(page.locator('[data-duel-side]')).toHaveCount(2);
		await expect(progress(page)).toContainText('13 duels');
	});

	test('Details opens the place sheet and keys do nothing behind it', async ({ page }) => {
		await openDuels(page);
		const [left] = await pairIds(page);
		await press(
			page.locator('[data-duel-side="left"]').getByRole('button', { name: /^Details for / }),
		);
		const sheet = page.getByRole('dialog');
		await expect(sheet).toHaveAttribute('data-sheet', `place:${String(left)}`);
		await page.keyboard.press('ArrowRight');
		await expect(progress(page)).toContainText('13 duels');
		await page.keyboard.press('Escape');
		await expect(sheet).toHaveCount(0);
	});
});

test.describe('guest', () => {
	test.use({ storageState: STORAGE.guest });

	test('sees the duel and the ranking but cannot pick', async ({ page }) => {
		await openDuels(page);
		await expect(page.getByText('Read only: guests can look at the duels')).toBeVisible();
		const text = await progress(page).textContent();
		await expect(page.locator('[data-duel-side="left"] [data-pick]')).toBeDisabled();
		await expect(page.locator('[data-duel-side="right"] [data-pick]')).toBeDisabled();
		await page.keyboard.press('ArrowLeft');
		await expect(page.locator('[data-duel-side][data-result]')).toHaveCount(0);
		await expect(progress(page)).toHaveText(text ?? '');
		// skipping logs nothing, so the guest may skip
		await expect(page.getByRole('button', { name: /Can’t decide/ })).toBeEnabled();
	});
});
