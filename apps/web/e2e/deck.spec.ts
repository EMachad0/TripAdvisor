// Slice E: the Areas and Swipe rounds (old game.js viewDeck and friends) and the place / area sheet.
// Every describe that writes starts from the e2e data set again (scripts/convex-local.sh seed-data), so the three
// projects see the same deck.
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

const left = (page: Page): Locator => page.locator('[data-deck-left]');
const topCard = (page: Page): Locator => page.locator('[data-deck-card][data-depth="0"]');

/** A swipe locks the deck for 300 ms (old swipeTop), so the next one waits it out. */
const settle = (page: Page): Promise<void> => page.waitForTimeout(400);

async function leftCount(page: Page): Promise<number> {
	await expect(left(page)).toBeVisible();
	return Number((await left(page).innerText()).split(' ')[0]);
}

async function openDeck(page: Page, path: '/decide/areas' | '/decide/swipe'): Promise<void> {
	await page.goto(path);
	await expect(topCard(page)).toBeVisible();
	// Hydrated: the controls react to clicks only after the app has loaded feedback.
	await expect(page.locator('[data-deck-progress]')).toBeVisible();
	await page.waitForLoadState('networkidle');
}

test.describe('owner', () => {
	test.use({ storageState: STORAGE.owner });
	test.describe.configure({ mode: 'serial' });
	test.beforeAll(reseed);

	test('the areas round shows the stack, progress, filters and controls', async ({ page }) => {
		await openDeck(page, '/decide/areas');
		await expect(page.getByRole('heading', { level: 1, name: 'Areas round' })).toBeVisible();
		await expect(page.locator('[data-deck-progress]')).toContainText('2 / 10');
		await expect(page.locator('[data-deck-card]')).toHaveCount(3);
		expect(await leftCount(page)).toBe(8);
		const filters = page.getByRole('group', { name: 'Country' });
		await expect(filters.getByRole('radio', { name: /^All 8/ })).toBeVisible();
		for (const name of ['Skip (←)', 'Maybe (↑)', 'Must (→)']) {
			await expect(page.getByRole('button', { name })).toBeEnabled();
		}
		await expect(page.getByRole('button', { name: /Undo/ })).toBeDisabled();
	});

	test('arrow keys swipe, Z undoes locally, and a swipe survives a reload', async ({ page }) => {
		await openDeck(page, '/decide/areas');
		const n = await leftCount(page);
		const after = (k: number): string => `${String(n - k)} left`;
		const first = await topCard(page).getAttribute('data-deck-card');
		await page.keyboard.press('ArrowRight');
		await expect(left(page)).toHaveText(after(1));
		await expect(page.locator(`[data-deck-card="${String(first)}"]`)).toHaveCount(0);
		await expect(page.locator('[data-deck-progress]')).toContainText('3 / 10');
		await page.keyboard.press('z');
		await expect(page.getByText('Card is back. Swipe it again to change your call.')).toBeVisible();
		await expect(left(page)).toHaveText(after(0));
		await expect(page.getByRole('button', { name: /Undo/ })).toBeDisabled();
		// Undo is local only (v1 rule): the swipe is still logged, so a reload shows it swiped.
		await page.reload();
		await expect(left(page)).toHaveText(after(1));
		// The server-rendered deck shows before the key handler is attached: wait for the app to load, as openDeck does.
		await page.waitForLoadState('networkidle');
		await page.keyboard.press('ArrowLeft');
		await expect(left(page)).toHaveText(after(2));
		await settle(page);
		await page.keyboard.press('ArrowUp');
		await expect(left(page)).toHaveText(after(3));
		await page.keyboard.press('Backspace');
		await expect(left(page)).toHaveText(after(2));
	});

	test('the buttons swipe, and dragging past 110 px swipes while a short drag springs back', async ({
		page,
	}) => {
		await openDeck(page, '/decide/areas');
		const before = await leftCount(page);
		await page.getByRole('button', { name: 'Skip (←)' }).click();
		await expect(left(page)).toHaveText(`${String(before - 1)} left`);
		await settle(page);

		const box = await topCard(page).boundingBox();
		if (box === null) throw new Error('no top card');
		const x = box.x + box.width / 2;
		const y = box.y + box.height * 0.75;
		// A short drag: springs back, nothing swiped, no sheet.
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + 40, y, { steps: 4 });
		await page.mouse.up();
		await expect(left(page)).toHaveText(`${String(before - 1)} left`);
		await expect(page.getByRole('dialog')).toHaveCount(0);
		// A long, slow drag to the right: Must.
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + 80, y, { steps: 8 });
		await expect(topCard(page).locator('[data-stamp="must"]')).not.toHaveCSS('opacity', '0');
		await page.mouse.move(x + 160, y, { steps: 8 });
		await page.mouse.up();
		await expect(left(page)).toHaveText(`${String(before - 2)} left`);
	});

	test('a tap or Space opens the sheet; Escape and Back close it', async ({ page }) => {
		await openDeck(page, '/decide/areas');
		const id = await topCard(page).getAttribute('data-deck-card');
		const box = await topCard(page).boundingBox();
		if (box === null) throw new Error('no top card');
		await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.75);
		const sheet = page.getByRole('dialog');
		await expect(sheet).toBeVisible();
		await expect(sheet).toHaveAttribute('data-sheet', `area:${String(id)}`);
		await expect(sheet.locator('iframe')).toHaveAttribute('src', /^\/area\/[^?]+\?embed=1$/);
		await page.keyboard.press('Escape');
		await expect(sheet).toHaveCount(0);
		await expect(page).toHaveURL(/\/decide\/areas$/);

		await page.locator('body').focus();
		await page.keyboard.press('Space');
		await expect(sheet).toBeVisible();
		await page.goBack();
		await expect(sheet).toHaveCount(0);
		await expect(page).toHaveURL(/\/decide\/areas$/);

		await page.getByRole('button', { name: /Details/ }).click();
		await expect(sheet).toBeVisible();
		await sheet.getByRole('button', { name: 'Close (Esc)' }).click();
		await expect(sheet).toHaveCount(0);
	});

	test('an area call in the sheet saves, closes the sheet and can be undone', async ({ page }) => {
		await openDeck(page, '/decide/areas');
		const before = await leftCount(page);
		await page.getByRole('button', { name: /Details/ }).click();
		const sheet = page.getByRole('dialog');
		await sheet
			.getByRole('group', { name: 'Your call' })
			.getByRole('button', { name: 'Must' })
			.click();
		await expect(page.getByText(/^Must: /)).toBeVisible();
		await expect(sheet).toHaveCount(0);
		await expect(left(page)).toHaveText(`${String(before - 1)} left`);
		await page.getByRole('button', { name: /Undo/ }).click();
		await expect(left(page)).toHaveText(`${String(before)} left`);
	});

	test('N opens the note panel; the note autosaves and shows on the card', async ({ page }) => {
		await openDeck(page, '/decide/swipe');
		await page.keyboard.press('n');
		const note = topCard(page).getByRole('textbox', { name: /^Your note on / });
		await expect(note).toBeFocused();
		await expect(page.getByRole('button', { name: 'Add a note (N)' })).toHaveAttribute(
			'aria-expanded',
			'true',
		);
		await note.fill('Only if it is not raining, 09:30 start');
		await expect(topCard(page).locator('[data-note-state]')).toHaveText('Saved', { timeout: 5000 });
		await page.keyboard.press('Escape');
		await expect(page.locator('[data-deck-note]')).toHaveCount(0);
		await expect(topCard(page).getByText('Note', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Edit your note (N)' })).toBeVisible();
		await page.reload();
		await page.getByRole('button', { name: 'Edit your note (N)' }).click();
		await expect(topCard(page).getByRole('textbox', { name: /^Your note on / })).toHaveValue(
			'Only if it is not raining, 09:30 start',
		);
		await page.getByRole('button', { name: 'Done' }).click();
		await expect(page.locator('[data-deck-note]')).toHaveCount(0);
	});

	test('a country filter narrows the deck and clearing it shows the done state', async ({
		page,
	}) => {
		await openDeck(page, '/decide/swipe');
		const filters = page.getByRole('group', { name: 'Country' });
		const chip = filters.getByRole('radio', { name: /Thailand/ });
		const n = Number((await chip.innerText()).trim().split(/\s+/).at(-1));
		await chip.click();
		await expect(left(page)).toHaveText(`${String(n)} left`);
		for (let i = 0; i < n; i++) {
			await page.getByRole('button', { name: 'Maybe (↑)' }).click();
			await settle(page);
		}
		await expect(page.getByRole('heading', { name: 'Thailand cleared!' })).toBeVisible();
		await page.getByRole('button', { name: 'Show all countries' }).click();
		await expect(filters.getByRole('radio', { name: /^All/ })).toHaveAttribute(
			'aria-checked',
			'true',
		);
		await expect(topCard(page)).toBeVisible();
	});

	test('the swipe round shows place cards with the calls enabled', async ({ page }) => {
		await openDeck(page, '/decide/swipe');
		await expect(page.getByRole('heading', { level: 1, name: 'Swipe round' })).toBeVisible();
		await expect(topCard(page).locator('[data-place-card]')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Must (→)' })).toBeEnabled();
	});
});

test.describe('guest', () => {
	test.use({ storageState: STORAGE.guest });

	test('sees the deck read only and can open cards', async ({ page }) => {
		await openDeck(page, '/decide/areas');
		await expect(page.getByText('Read only: guests can look through the deck')).toBeVisible();
		for (const name of ['Skip (←)', 'Maybe (↑)', 'Must (→)']) {
			await expect(page.getByRole('button', { name })).toBeDisabled();
		}
		await expect(page.getByRole('button', { name: /note \(N\)/ })).toBeDisabled();
		const before = await leftCount(page);
		await page.keyboard.press('ArrowRight');
		await expect(left(page)).toHaveText(`${String(before)} left`);
		await page.getByRole('button', { name: /Details/ }).click();
		const sheet = page.getByRole('dialog');
		await expect(sheet).toBeVisible();
		for (const b of await sheet
			.getByRole('group', { name: 'Your call' })
			.getByRole('button')
			.all()) {
			await expect(b).toBeDisabled();
		}
		await expect(sheet.getByRole('textbox')).toHaveCount(0);
	});
});
