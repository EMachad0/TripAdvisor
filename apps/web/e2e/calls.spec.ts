// Slice E: My calls (old game.js viewCalls): every swiped or noted card with its call and note editable inline.
// The owner tests start from the e2e data set again (scripts/convex-local.sh seed-data).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
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

const row = (page: Page, key: string): Locator => page.locator(`[data-call="${key}"]`);

async function openCalls(page: Page): Promise<void> {
	await page.goto('/decide/calls');
	await expect(page.getByRole('heading', { level: 1, name: 'My calls' })).toBeVisible();
	await page.waitForLoadState('networkidle');
}

test.describe('owner', () => {
	test.use({ storageState: STORAGE.owner });
	test.describe.configure({ mode: 'serial' });
	test.beforeAll(reseed);
	// Leave the e2e data set as the next spec expects it: a CI shard runs any mix of spec files on one backend.
	test.afterAll(reseed);

	test('lists areas then places, grouped by country, with counts and notes', async ({ page }) => {
		await openCalls(page);
		await expect(page.locator('[data-calls-count]')).toHaveText(/16\s+calls · 4\s+notes/);
		await expect(page.locator('[data-calls-group]')).toHaveCount(2);
		await expect(page.locator('[data-calls-group]').first()).toHaveAttribute(
			'data-calls-group',
			'area',
		);
		const harbin = row(page, 'area:harbin');
		await expect(
			harbin
				.getByRole('group', { name: 'Your call on Harbin' })
				.getByRole('button', { name: 'Must' }),
		).toHaveAttribute('aria-pressed', 'true');
		await expect(harbin.getByRole('textbox', { name: 'Your note on Harbin' })).toHaveValue(
			/only if I go in January/,
		);
		await expect(
			row(page, 'place:lol-park-t1').getByRole('button', { name: 'Add a note' }),
		).toBeVisible();
	});

	test('filters by kind, call, notes and country, and resets', async ({ page }) => {
		await openCalls(page);
		const calls = page.locator('[data-call]');
		const total = await calls.count();
		await page
			.getByRole('group', { name: 'Cards' })
			.getByRole('radio', { name: /^Areas/ })
			.click();
		await expect(calls).toHaveCount(2);
		await page.getByRole('group', { name: 'Cards' }).getByRole('radio', { name: /^All/ }).click();
		await expect(calls).toHaveCount(total);

		const verdict = page.getByRole('group', { name: 'Call' });
		await verdict.getByRole('radio', { name: /^Skip/ }).click();
		await expect(calls).toHaveCount(1);
		await expect(row(page, 'place:chatuchak-weekend-market')).toBeVisible();
		await verdict.getByRole('radio', { name: /^Skip/ }).click(); // a second tap clears it
		await expect(calls).toHaveCount(total);

		await page.getByRole('group', { name: 'Notes' }).getByRole('radio').click();
		await expect(calls).toHaveCount(4);
		await page.getByRole('group', { name: 'Notes' }).getByRole('radio').click();

		await page
			.getByRole('group', { name: 'Country' })
			.getByRole('radio', { name: /Thailand/ })
			.click();
		await expect(calls).toHaveCount(1);
		await verdict.getByRole('radio', { name: /^Must/ }).click();
		await expect(page.getByText('Nothing matches these filters.')).toBeVisible();
		await page.getByRole('button', { name: 'Show everything' }).click();
		await expect(calls).toHaveCount(total);
	});

	test('changing a call saves it, toasts and survives a reload', async ({ page }) => {
		await openCalls(page);
		const r = row(page, 'place:bukhansan-snow-hike');
		const seg = r.getByRole('group', { name: /^Your call on / });
		await seg.getByRole('button', { name: 'Must' }).click();
		await expect(page.getByText(/^Must: /)).toBeVisible();
		await expect(seg.getByRole('button', { name: 'Must' })).toHaveAttribute('aria-pressed', 'true');
		await expect(r).toHaveAttribute('data-v', 'must');
		await page.reload();
		await expect(
			row(page, 'place:bukhansan-snow-hike')
				.getByRole('group', { name: /^Your call on / })
				.getByRole('button', { name: 'Must' }),
		).toHaveAttribute('aria-pressed', 'true');
	});

	test('a note edits inline and autosaves; an empty new note folds back', async ({ page }) => {
		await openCalls(page);
		const great = row(page, 'place:great-wall-mutianyu');
		const ta = great.getByRole('textbox', { name: /^Your note on / });
		await ta.fill('Only on a clear day. Leave by 07:00.');
		await expect(great.locator('[data-note-state]')).toHaveText('Saved', { timeout: 5000 });
		await expect(page.locator('[data-calls-count]')).toHaveText(/4\s+notes/);

		const lol = row(page, 'place:lol-park-t1');
		await lol.getByRole('button', { name: 'Add a note' }).click();
		const fresh = lol.getByRole('textbox', { name: /^Your note on / });
		await expect(fresh).toBeFocused();
		await page.locator('h1').click();
		await expect(lol.getByRole('button', { name: 'Add a note' })).toBeVisible();

		await lol.getByRole('button', { name: 'Add a note' }).click();
		await lol.getByRole('textbox', { name: /^Your note on / }).fill('Book the match early');
		await page.keyboard.press('Escape');
		await expect(page.locator('[data-calls-count]')).toHaveText(/5\s+notes/);

		await page.reload();
		await expect(
			row(page, 'place:great-wall-mutianyu').getByRole('textbox', { name: /^Your note on / }),
		).toHaveValue('Only on a clear day. Leave by 07:00.');
		await expect(
			row(page, 'place:lol-park-t1').getByRole('textbox', { name: /^Your note on / }),
		).toHaveValue('Book the match early');
	});

	test('a row opens the place sheet', async ({ page }) => {
		await openCalls(page);
		await row(page, 'area:harbin').getByRole('button', { name: 'Open Harbin' }).click();
		const sheet = page.getByRole('dialog');
		await expect(sheet).toHaveAttribute('data-sheet', 'area:harbin');
		await expect(sheet.getByRole('textbox', { name: 'Your note on Harbin' })).toHaveValue(
			/only if I go in January/,
		);
		await page.keyboard.press('Escape');
		await expect(sheet).toHaveCount(0);
	});
});

test.describe('guest', () => {
	test.use({ storageState: STORAGE.guest });

	test('sees every call and note, read only', async ({ page }) => {
		await openCalls(page);
		const harbin = row(page, 'area:harbin');
		for (const b of await harbin
			.getByRole('group', { name: /^Your call on / })
			.getByRole('button')
			.all()) {
			await expect(b).toBeDisabled();
		}
		await expect(harbin.locator('[data-note-readonly]')).toContainText('only if I go in January');
		await expect(page.getByRole('textbox')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Add a note' })).toHaveCount(0);
	});
});
