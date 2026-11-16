// Trip › Calendar (slice B) against the e2e data set (trip/legs.json and trip/days.json): the months, the
// legend and the work / vacation strip, the day cells, the day sheet at /trip/calendar/<date>, the day form and
// the guest's read-only view.
import { expect, test, type Page } from '@playwright/test';
import { CONVEX_SITE_URL, STORAGE } from './support';

async function exportedDays(): Promise<{ id: string; [k: string]: unknown }[]> {
	const token = process.env['EXPORT_TOKEN'];
	if (token === undefined) throw new Error('EXPORT_TOKEN missing (apps/web/.env.tokens.local)');
	const res = await fetch(`${CONVEX_SITE_URL}/ops/export`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	expect(res.status).toBe(200);
	const body = (await res.json()) as { files: Record<string, { content: string }> };
	return JSON.parse(body.files['trip/days.json']?.content ?? '[]') as {
		id: string;
		[k: string]: unknown;
	}[];
}

const cell = (page: Page, day: string) => page.locator(`[data-date="${day}"]`);

async function openCalendar(page: Page, path = '/trip/calendar'): Promise<void> {
	await page.goto(path);
	await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
	await expect(cell(page, '2026-12-24')).toBeVisible();
}

test.describe('owner @readonly', () => {
	test.use({ storageState: STORAGE.owner });

	test('draws every month of the trip with the legend and the strip', async ({ page }) => {
		await openCalendar(page);
		await expect(page.locator('[data-month]')).toHaveCount(2);
		await expect(page.getByRole('heading', { name: 'December 2026' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'January 2027' })).toBeVisible();
		const legend = page.getByTestId('legend');
		for (const label of [
			'China',
			'Japan',
			'Stop not fixed',
			'Flight',
			'Work',
			'Vacation',
			'Holiday in Brazil',
		])
			await expect(legend).toContainText(label);
		const strip = page.getByTestId('periods');
		await expect(strip).toContainText('Vacation 24 Dec · 1 weekday');
		await expect(strip).toContainText('Work 5 Jan · 1 weekday');
	});

	test('day cells carry the stay, flights, work, holidays and labels', async ({ page }) => {
		await openCalendar(page);
		await expect(cell(page, '2026-12-04')).toHaveAttribute('aria-label', 'Fri 4 Dec, flight');
		await expect(cell(page, '2026-12-20')).toHaveAttribute(
			'aria-label',
			/^Sun 20 Dec, Harbin hostel/,
		);
		await expect(cell(page, '2026-12-20')).toContainText('Harbin hostel');
		await expect(cell(page, '2026-12-24')).toHaveAttribute(
			'aria-label',
			/^Thu 24 Dec, Harbin hostel, vacation, Christmas Eve/,
		);
		await expect(cell(page, '2026-12-25')).toHaveAttribute('aria-label', /^Fri 25 Dec, Christmas/);
		await expect(cell(page, '2027-01-05')).toHaveAttribute('aria-label', /work/);
		// Kansai is not fixed: hatched instead of coloured.
		await expect(cell(page, '2027-01-11')).toHaveClass(/hatch/);
		// Outside the trip, faint.
		await expect(cell(page, '2027-01-31')).toHaveClass(/bg-transparent/);
	});

	test('a day opens its sheet at /trip/calendar/<date>; Close and Back close it', async ({
		page,
	}) => {
		await openCalendar(page);
		await cell(page, '2026-12-24').click();
		await expect(page).toHaveURL(/\/trip\/calendar\/2026-12-24$/);
		const sheet = page.getByTestId('day-sheet');
		await expect(page.getByRole('heading', { name: 'Thu 24 Dec 2026' })).toBeVisible();
		await expect(page.getByText('Day 21 of 43 · Harbin hostel')).toBeVisible();
		await expect(sheet.getByTestId('day-status')).toContainText('Vacation');
		await expect(sheet.getByTestId('day-status')).toContainText('Christmas Eve holiday in Brazil');
		await expect(sheet.getByTestId('day-status')).toContainText('Harbin.');
		await expect(sheet.locator('[data-leg="stay-harbin"]')).toBeVisible();
		// The day sheet's cards have no edit button (as the old one).
		await expect(sheet.locator('[data-leg]').getByRole('button', { name: 'Edit' })).toHaveCount(0);
		await sheet.getByRole('button', { name: 'Close' }).click();
		await expect(page).toHaveURL(/\/trip\/calendar$/);
		await expect(sheet).toHaveCount(0);

		await cell(page, '2027-01-05').click();
		await expect(page.getByTestId('day-sheet')).toBeVisible();
		await page.goBack();
		await expect(page).toHaveURL(/\/trip\/calendar$/);
		await expect(page.getByTestId('day-sheet')).toHaveCount(0);
	});

	test('a deep link opens the day; a work day shows the night shift with both offsets', async ({
		page,
	}) => {
		await openCalendar(page, '/trip/calendar/2027-01-15');
		const sheet = page.getByTestId('day-sheet');
		await expect(sheet.locator('[data-leg="train-osaka"]')).toBeVisible();
		await sheet.getByRole('button', { name: /See the plan/ }).click();
		await expect(page.getByTestId('transfer-plan')).toContainText('08:30 UTC+9');
		// The plan sheet has the dialog's X and the old Close button; both close it.
		await page.getByTestId('trip-sheet').getByRole('button', { name: 'Close' }).last().click();
		await expect(page.getByTestId('day-sheet')).toBeVisible();

		await page.goto('/trip/calendar/2027-01-05');
		await expect(page.getByTestId('day-status')).toContainText('Work');
		await expect(page.getByTestId('day-status')).toContainText('09:00–18:00 UTC−3 in São Paulo');
	});

	test('an empty day says Nothing planned; a day outside the trip says so', async ({ page }) => {
		await openCalendar(page, '/trip/calendar/2027-01-31');
		await expect(page.getByText('Outside the trip')).toBeVisible();
		await expect(page.getByText('Nothing planned')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Open as Today' })).toHaveAttribute(
			'href',
			'/today/2027-01-31',
		);
	});

	test('a bad date shows the plain calendar', async ({ page }) => {
		await openCalendar(page, '/trip/calendar/2027-02-30');
		await expect(page.getByTestId('day-sheet')).toHaveCount(0);
	});
});

test.describe('owner @write', () => {
	test.use({ storageState: STORAGE.owner });

	test('adds a note to a day, edits it and deletes it', async ({ page }) => {
		await openCalendar(page, '/trip/calendar/2027-01-01');
		await page.getByRole('button', { name: 'Add a note' }).click();
		const form = page.getByTestId('trip-form');
		await expect(page.getByRole('heading', { name: 'Fri 1 Jan' })).toBeVisible();
		await form.getByLabel('Work or vacation').selectOption('vacation');
		await form.getByLabel('Holiday in Brazil').fill('New Year');
		await form.getByLabel('Events and notes').fill('Hotpot at 19:00.');
		await form.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Added')).toBeVisible();

		const status = page.getByTestId('day-status');
		await expect(status).toContainText('Vacation');
		await expect(status).toContainText('New Year holiday in Brazil');
		await expect(status).toContainText('Hotpot at 19:00 UTC+8.');
		expect((await exportedDays()).find((d) => d.id === '2027-01-01')).toMatchObject({
			status: 'vacation',
			holiday: 'New Year',
			note: 'Hotpot at 19:00.',
		});

		await page.reload();
		await page.getByRole('button', { name: 'Edit day' }).click();
		await expect(form.getByLabel('Events and notes')).toHaveValue('Hotpot at 19:00.');
		await form.getByLabel('Work or vacation').selectOption('');
		await form.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Saved')).toBeVisible();
		await expect(status).not.toContainText('Vacation');
		expect((await exportedDays()).find((d) => d.id === '2027-01-01')?.['status']).toBe('');

		await page.getByRole('button', { name: 'Edit day' }).click();
		await form.getByRole('button', { name: 'Delete' }).click();
		await form.getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByText('Deleted')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Add a note' })).toBeVisible();
		expect((await exportedDays()).some((d) => d.id === '2027-01-01')).toBe(false);
	});
});

test.describe('guest @readonly', () => {
	test.use({ storageState: STORAGE.guest });

	test('sees the calendar and the day sheet with no write control', async ({ page }) => {
		await openCalendar(page);
		await cell(page, '2026-12-24').click();
		const sheet = page.getByTestId('day-sheet');
		await expect(sheet.getByTestId('day-status')).toContainText('Christmas Eve');
		await expect(sheet.getByRole('button', { name: 'Edit day' })).toHaveCount(0);
		await expect(sheet.getByRole('button', { name: 'Add a note' })).toHaveCount(0);
		await expect(sheet.getByRole('link', { name: 'Open as Today' })).toBeVisible();
	});
});
