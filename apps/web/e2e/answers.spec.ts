// Answers (slice D): every answer card newest first with the country chips, /places/answers/<id> and #answer-<id>
// opening one card, the UTC offset after every clock time, the About link opening the place or area sheet on that
// answer, and the platform's escaping. Runs on platform/test/site-fixtures/answers (4 cards). Read only for everyone.
import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import { STORAGE } from './support';

const ICE = '2026-11-20-ice-world-christmas';
const KYOTO = '2026-11-21-kyoto-days';
const VISA = '2026-11-22-china-visa-free';
const ESIM = '2026-11-23-esim';

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

async function openAnswers(page: Page, path = '/places/answers'): Promise<void> {
	await navigate(page, () => page.goto(path));
	await expect(page.getByRole('heading', { level: 1, name: 'Answers' })).toBeVisible();
}

const card = (page: Page, id: string): Locator => page.locator(`#answer-${id}`);
const chips = (page: Page): Locator => page.getByRole('group', { name: 'Filter by country' });

test.describe('owner', () => {
	test.use({ storageState: STORAGE.owner });

	test('lists every answer newest first with the country chips', async ({ page }) => {
		await openAnswers(page);
		await expect(page.getByText('Places · 4 answers')).toBeVisible();
		await expect(page.locator('[data-answer]')).toHaveCount(4);
		await expect(page.locator('article[data-answer]').first()).toHaveAttribute('data-answer', ESIM);
		await expect(chips(page).getByRole('radio')).toHaveText([
			/^All\s*4$/,
			/China\s*2$/,
			/Japan\s*1$/,
			/^Whole trip\s*1$/,
		]);
		await press(chips(page).getByRole('radio', { name: /China/ }));
		await expect(page.locator('article[data-answer]')).toHaveCount(2);
		await expect(card(page, VISA)).toBeVisible();
		await expect(card(page, ICE)).toBeVisible();
		await press(chips(page).getByRole('radio', { name: /Whole trip/ }));
		await expect(page.locator('article[data-answer]')).toHaveCount(1);
		await expect(card(page, ESIM)).toBeVisible();
		await press(chips(page).getByRole('radio', { name: /^All/ }));
		await expect(page.locator('article[data-answer]')).toHaveCount(4);
	});

	test('a card shows the question, dates, about, tldr and folds out the answer and sources', async ({
		page,
	}) => {
		await openAnswers(page);
		const ice = card(page, ICE);
		// the question is escaped, never markup
		await expect(ice.getByRole('heading')).toHaveText(
			'QIs the Ice World open on Christmas Day <b>really</b>?',
		);
		await expect(ice.locator('[data-answer-meta]')).toContainText('Asked 20 Nov 2026');
		await expect(ice.locator('[data-answer-about]')).toContainText(
			'About Harbin Ice and Snow World',
		);
		await expect(ice.locator('strong')).toHaveText('cheaper before 13:00 UTC+8');
		await expect(card(page, ESIM).locator('[data-answer-meta]')).toContainText(
			'Updated 24 Nov 2026',
		);
		await expect(card(page, ESIM).locator('[data-answer-about]')).toHaveText(
			'About the whole trip',
		);
		await expect(card(page, VISA).locator('[data-answer-about]')).toHaveText('About China');

		const fold = ice.getByText('Full answer and sources');
		await expect(ice.getByText('Last entry 20:30')).toBeHidden();
		await press(fold);
		await expect(ice.getByText('Last entry 20:30')).toBeVisible();
		await expect(ice.locator('.answer-body')).toContainText('<script>alert(1)</script>');
		const sources = ice.locator('[data-answer-sources] a');
		await expect(sources).toHaveCount(2);
		await expect(sources.first()).toHaveAttribute('href', 'https://example.com/ice-world');
		await expect(sources.first()).toHaveAttribute('target', '_blank');
		await expect(ice.locator('[data-answer-sources]')).toContainText('example.com');
		await expect(card(page, KYOTO).locator('details')).toHaveCount(0);
		await expect(card(page, VISA).getByText('Source', { exact: true })).toBeVisible();
	});

	test('every clock time carries its country’s offset', async ({ page }) => {
		await openAnswers(page);
		await expect(card(page, ICE).locator('p').filter({ hasText: 'it opens' })).toContainText(
			'11:00–21:30 UTC+8',
		);
		await expect(card(page, KYOTO)).toContainText('08:30–16:30 UTC+9');
		await press(card(page, ICE).getByText('Full answer and sources'));
		await expect(card(page, ICE)).toContainText('Last entry 20:30 UTC+8');
		// a whole-trip answer has no zone, so no label is guessed
		await expect(card(page, ESIM)).not.toContainText('UTC');
	});

	test('/places/answers/<id> opens that card, even when its country is filtered out', async ({
		page,
	}) => {
		await openAnswers(page);
		await press(chips(page).getByRole('radio', { name: /Whole trip/ }));
		await expect(page.locator('article[data-answer]')).toHaveCount(1);
		await navigate(page, () => page.goto(`/places/answers/${ICE}`));
		const ice = card(page, ICE);
		await expect(ice).toBeVisible();
		await expect(ice.locator('details')).toHaveAttribute('open', '');
		await expect(page.locator('[data-target]')).toHaveCount(1);
		await expect(page.locator(`[data-target] #answer-${ICE}`)).toHaveCount(1);
		await expect(chips(page).getByRole('radio', { name: /^All/ })).toHaveAttribute(
			'aria-checked',
			'true',
		);
		await expect(ice).toBeInViewport();
	});

	test('#answer-<id> on the list opens that card', async ({ page }) => {
		await openAnswers(page, `/places/answers#answer-${KYOTO}`);
		await expect(page.locator(`[data-target] #answer-${KYOTO}`)).toHaveCount(1);
		await expect(card(page, KYOTO)).toBeInViewport();
	});

	test('the About link opens the place or area sheet on that answer', async ({ page }) => {
		await openAnswers(page);
		await press(card(page, ICE).getByRole('link', { name: 'Harbin Ice and Snow World' }));
		const sheet = page.getByRole('dialog', { name: 'Harbin Ice and Snow World' });
		await expect(sheet).toBeVisible();
		await expect(sheet.locator('iframe')).toHaveAttribute(
			'src',
			`/place/harbin-ice-world?embed=1#answer-${ICE}`,
		);
		await page.keyboard.press('Escape');
		await expect(sheet).toBeHidden();
		await expect(card(page, KYOTO).getByRole('link', { name: 'Kyoto' })).toHaveAttribute(
			'href',
			'/area/kyoto',
		);
	});
});

test.describe('guest', () => {
	test.use({ storageState: STORAGE.guest });

	test('sees the same cards and can open one', async ({ page }) => {
		await openAnswers(page, `/places/answers/${VISA}`);
		await expect(page.locator('article[data-answer]')).toHaveCount(4);
		await expect(card(page, VISA).locator('details')).toHaveAttribute('open', '');
		await expect(card(page, VISA)).toContainText('Brazilians get 30 days visa-free');
	});
});
