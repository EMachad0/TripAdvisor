// Trip › Itinerary (slice B) against the e2e data set (packages/migrate/fixtures/e2e/trip/legs.json): every leg
// kind, timezone labels, the transfer plan, the Today line, jump chips, the stop form (add, edit, delete) and the
// guest's read-only view.
import { expect, test, type Page } from '@playwright/test';
import { CONVEX_SITE_URL, STORAGE } from './support';

/** trip/<col>.json as GET /ops/export returns it (the @write check: the value really landed). */
async function exported(col: string): Promise<{ id: string; [k: string]: unknown }[]> {
	const token = process.env['EXPORT_TOKEN'];
	if (token === undefined) throw new Error('EXPORT_TOKEN missing (apps/web/.env.tokens.local)');
	const res = await fetch(`${CONVEX_SITE_URL}/ops/export`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	expect(res.status).toBe(200);
	const body = (await res.json()) as { files: Record<string, { content: string }> };
	const file = body.files[`trip/${col}.json`];
	if (file === undefined) throw new Error(`trip/${col}.json missing from the export`);
	return JSON.parse(file.content) as { id: string; [k: string]: unknown }[];
}

const card = (page: Page, id: string) => page.locator(`[data-leg="${id}"]`);

async function openItinerary(page: Page): Promise<void> {
	await page.goto('/trip/itinerary');
	await expect(page.getByRole('heading', { level: 1, name: 'Itinerary' })).toBeVisible();
	await expect(card(page, 'gru-pvg')).toBeVisible();
}

test.describe('owner @readonly', () => {
	test.use({ storageState: STORAGE.owner });

	test('shows every leg in date order with the header counts', async ({ page }) => {
		await openItinerary(page);
		await expect(page.getByTestId('eyebrow')).toHaveText('Fri 4 Dec → Fri 15 Jan · 43 days');
		await expect(page.getByText('1 of 1 flight booked, 2 stays still to book.')).toBeVisible();
		const order = await page
			.locator('[data-leg]')
			.evaluateAll((els) => els.map((e) => e.getAttribute('data-leg')));
		expect(order).toEqual(['gru-pvg', 'stay-harbin', 'note-nye', 'stay-kansai', 'train-osaka']);
		// Jump chips: the first stay of each country.
		const jumps = page.getByRole('button', { name: /China|Japan/ });
		await expect(jumps).toHaveCount(2);
		await expect(page.getByRole('button', { name: /Japan/ })).toContainText('10 Jan');
	});

	test('a flight is a boarding pass with both offsets, +2 and the booking ref', async ({
		page,
	}) => {
		await openItinerary(page);
		const f = card(page, 'gru-pvg');
		await expect(f).toContainText('Air China · CA908 · economy');
		await expect(f).toContainText('GRU');
		await expect(f).toContainText('PVG');
		await expect(f.locator('time').first()).toHaveText(/23:55\s*UTC−3/);
		await expect(f.locator('time').nth(1)).toHaveText(/06:10\s*UTC\+8/);
		await expect(f.locator('sup')).toHaveText('+2');
		await expect(f).toContainText('Arrives Sun 6 Dec');
		await expect(f).toContainText('Booking ref ABC123');
		await expect(f).toContainText('Booked');
		await expect(f).toContainText('Via Madrid.');
	});

	test('a stay is a voucher with check-in times, the address and the map links', async ({
		page,
	}) => {
		await openItinerary(page);
		const s = card(page, 'stay-harbin');
		await expect(s).toContainText('Harbin hostel');
		await expect(s).toContainText('Stay · hosted by Old Town Hostel');
		await expect(s).toContainText('To book');
		const voucher = s.getByTestId('voucher');
		await expect(voucher).toContainText('Check-in');
		await expect(voucher).toContainText('after 14:00 UTC+8');
		await expect(voucher).toContainText('4 nights');
		await expect(voucher).toContainText('by 12:00 UTC+8');
		await expect(s.getByRole('link', { name: 'Google Maps' })).toHaveAttribute(
			'href',
			/google\.com\/maps\/search\/\?api=1&query=1%20Central%20Street/,
		);
		await expect(s.getByRole('link', { name: 'Apple Maps' })).toBeVisible();
		await expect(s.getByRole('link', { name: 'Uber here' })).toBeVisible();
		// A note that already carries its offset gets no second label.
		await expect(s).toContainText('Check in 14:00 (UTC+8).');
		await expect(s).not.toContainText('14:00 UTC+8 (UTC+8)');
		// The not-fixed stay is drawn dashed and says so.
		await expect(card(page, 'stay-kansai')).toContainText('Not fixed');
		await expect(card(page, 'stay-kansai')).toHaveClass(/border-dashed/);
	});

	test('a transfer shows Leave by and opens its plan with offsets in the free text', async ({
		page,
	}) => {
		await openItinerary(page);
		const t = card(page, 'train-osaka');
		await expect(t).toContainText('Kyoto to Osaka');
		await expect(t).toContainText('Leave by');
		await expect(t.locator('time')).toHaveText(/10:00\s*UTC\+9/);
		await expect(t).toContainText('Kyoto → Osaka');
		await expect(t).toContainText('On the day');
		await t.getByRole('button', { name: 'See the plan · 1 step' }).click();
		const sheet = page.getByTestId('trip-sheet');
		await expect(sheet.getByRole('heading', { name: 'Kyoto to Osaka' })).toBeVisible();
		await expect(sheet).toContainText('train · Fri 15 Jan');
		await expect(sheet.getByTestId('transfer-plan')).toContainText(
			'Shinkansen or the JR special rapid at 08:30 UTC+9.',
		);
		await page.keyboard.press('Escape');
		await expect(sheet).toHaveCount(0);
	});

	test('during the trip it draws the Today line and marks the stay you are in', async ({
		page,
	}) => {
		await page.clock.setFixedTime(new Date('2026-12-21T10:00:00'));
		await openItinerary(page);
		await expect(card(page, 'stay-harbin').getByTestId('here-chip')).toHaveText('You are here');
		const line = page.locator('[data-today-line]');
		await expect(line).toHaveText('Today');
		const next = await line.evaluate((el) =>
			el.nextElementSibling?.querySelector('[data-leg]')?.getAttribute('data-leg'),
		);
		expect(next).toBe('note-nye');
		await expect(card(page, 'stay-harbin')).toBeInViewport();
	});

	test('a jump chip scrolls to that country', async ({ page }) => {
		await openItinerary(page);
		await page.getByRole('button', { name: /Japan/ }).click();
		await expect(card(page, 'stay-kansai')).toBeInViewport();
	});
});

test.describe('owner @tz', () => {
	test.use({ storageState: STORAGE.owner, timezoneId: 'Asia/Tokyo' });

	test('offsets come from the places, not from the device zone', async ({ page }) => {
		await openItinerary(page);
		await expect(card(page, 'gru-pvg').locator('time').first()).toHaveText(/23:55\s*UTC−3/);
		await expect(card(page, 'stay-harbin').getByTestId('voucher')).toContainText(
			'after 14:00 UTC+8',
		);
	});
});

test.describe('owner @write', () => {
	test.use({ storageState: STORAGE.owner });

	test('adds, edits and deletes a stop through the form', async ({ page }, testInfo) => {
		const title = `E2E stay ${testInfo.project.name}`;
		await openItinerary(page);
		await page.getByRole('button', { name: 'Add stop' }).click();
		const form = page.getByTestId('trip-form');
		await expect(page.getByRole('heading', { name: 'Add stop' })).toBeVisible();
		await expect(form.getByLabel('Kind')).toHaveValue('stay');
		await expect(form.getByLabel('Status')).toHaveValue('planned');
		await expect(form.getByLabel('Host')).toBeVisible();
		await expect(form.getByLabel('Airline')).toBeHidden();

		// Nothing to call it yet: refused with the old message, the sheet stays open.
		await form.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Give it a name first.')).toBeVisible();

		// Fields follow the kind.
		await form.getByLabel('Kind').selectOption('flight');
		await expect(form.getByLabel('Airline')).toBeVisible();
		await expect(form.getByLabel('Host')).toBeHidden();
		await form.getByLabel('Kind').selectOption('stay');

		await form.getByLabel('Title (city or stay name)').fill(title);
		await form.getByLabel('Start date').fill('2027-01-03');
		await form.getByLabel('End date').fill('2027-01-05');
		await form.getByLabel('Country').selectOption('thailand');
		await form.getByLabel('City id, as on the cards (e.g. osaka)').fill('Chiang-Mai, Bangkok');
		await form.getByLabel('Check-in from (local time)').fill('15:00');
		await form.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Added')).toBeVisible();
		await expect(page.getByTestId('trip-form')).toHaveCount(0);

		const added = page.locator('[data-leg]', { hasText: title });
		await expect(added).toContainText('after 15:00 UTC+7');
		await expect(added).toContainText('2 nights');
		const legs = await exported('legs');
		const doc = legs.find((l) => l['title'] === title);
		expect(doc).toMatchObject({
			type: 'stay',
			status: 'planned',
			start: '2027-01-03',
			end: '2027-01-05',
			country: 'thailand',
			city: 'chiang-mai',
			cities: ['chiang-mai', 'bangkok'],
			checkIn: '15:00',
		});

		// Survives a reload; edit changes only what was touched.
		await page.reload();
		await added.getByRole('button', { name: 'Edit' }).click();
		await expect(page.getByRole('heading', { name: 'Edit stop' })).toBeVisible();
		await expect(form.getByLabel('City id, as on the cards (e.g. osaka)')).toHaveValue(
			'chiang-mai, bangkok',
		);
		await form.getByLabel('Status').selectOption('booked');
		await form.getByLabel('Start time, local there (leave time for transfers)').fill('11:30');
		await form.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Saved')).toBeVisible();
		await expect(added).toContainText('Booked');
		const edited = (await exported('legs')).find((l) => l['title'] === title);
		expect(edited).toMatchObject({
			status: 'booked',
			start: '2027-01-03T11:30',
			end: '2027-01-05',
		});

		// Delete asks twice.
		await added.getByRole('button', { name: 'Edit' }).click();
		await form.getByRole('button', { name: 'Delete' }).click();
		await expect(form.getByText('Tap Delete again to remove it.')).toBeVisible();
		await form.getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByText('Deleted')).toBeVisible();
		await expect(added).toHaveCount(0);
		expect((await exported('legs')).some((l) => l['title'] === title)).toBe(false);
	});

	test('Cancel closes the form without writing', async ({ page }) => {
		await openItinerary(page);
		await card(page, 'stay-harbin').getByRole('button', { name: 'Edit' }).click();
		const form = page.getByTestId('trip-form');
		await form.getByLabel('Host').fill('Changed host');
		await form.getByRole('button', { name: 'Cancel' }).click();
		await expect(form).toHaveCount(0);
		await expect(card(page, 'stay-harbin')).toContainText('hosted by Old Town Hostel');
	});

	test('the plan sheet opens the stop form with Edit', async ({ page }) => {
		await openItinerary(page);
		await card(page, 'train-osaka')
			.getByRole('button', { name: /See the plan/ })
			.click();
		await page.getByTestId('trip-sheet').getByRole('button', { name: 'Edit' }).click();
		const form = page.getByTestId('trip-form');
		await expect(form.getByLabel('Kind')).toHaveValue('transport');
		await expect(form.getByLabel('Mode (Uber, taxi, train…)')).toHaveValue('train');
		await expect(form.getByLabel('Host')).toBeHidden();
	});
});

test.describe('guest @readonly', () => {
	test.use({ storageState: STORAGE.guest });

	test('sees every leg and no write control', async ({ page }) => {
		await openItinerary(page);
		await expect(card(page, 'train-osaka')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Add stop' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
		// Read-only helpers stay: the plan and the map links.
		await card(page, 'train-osaka')
			.getByRole('button', { name: /See the plan/ })
			.click();
		const sheet = page.getByTestId('trip-sheet');
		await expect(sheet.getByTestId('transfer-plan')).toBeVisible();
		await expect(sheet.getByRole('button', { name: 'Edit' })).toHaveCount(0);
	});
});
