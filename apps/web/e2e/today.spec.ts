// Today (slice A) against the e2e data set (packages/migrate/fixtures/e2e): the trip runs Fri 4 Dec 2026 → Fri 15 Jan
// 2027, Harbin hostel 20 → 24 Dec. "Today" is pinned with page.clock.setFixedTime (the real instant) and the
// browser's timezoneId (the device zone), or with /today/<date> (a picked day). The dated cards of the fixtures
// are in Hong Kong in February, so the "Only today" and "Next events" checks add a Hong Kong stay for their run
// through trip.write and delete it afterwards.
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import type { FunctionArgs } from 'convex/server';
import { api } from '../src/convex/_generated/api';
import { convexAs, convexToken, STORAGE } from './support';

const today = (page: Page) => page.getByTestId('today');
const block = (page: Page, id: string) => page.getByTestId(id);
/** A block's own h2 (leg cards inside have h3s). */
const title = (page: Page, id: string) => block(page, id).getByRole('heading', { level: 2 });
const h1 = (page: Page) => page.getByRole('heading', { level: 1 });

/** Better Auth's JWKS route answers 429 under e2e load (a known shared problem): wait out its 10 s window. */
const QUIET_MS = 11_000;

/** Opens a page and waits for Today's header; one wait and retry when the server sent us to /login (a 429). */
async function open(page: Page, path: string): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		await page.goto(path);
		try {
			await expect(page.getByTestId('eyebrow')).toBeVisible({
				timeout: attempt < 3 ? 6000 : 10_000,
			});
			return;
		} catch (error) {
			if (attempt >= 3) throw error;
			await page.waitForTimeout(QUIET_MS);
		}
	}
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

/** One owner trip.write through Convex, retried once the JWKS limiter's window has passed. */
async function ownerWrite(request: APIRequestContext, args: TripWrite): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		try {
			await convexAs(await convexToken(request)).mutation(api.trip.write, {
				...args,
				clientOpId: randomUUID(),
			});
			return;
		} catch (error) {
			if (attempt >= 3) throw error;
			await new Promise((r) => setTimeout(r, QUIET_MS));
		}
	}
}

type TripWrite = Omit<FunctionArgs<typeof api.trip.write>, 'clientOpId'>;

// A Hong Kong stay over Lunar New Year, where the fixtures' dated cards are.
const HK_STAY = {
	col: 'legs',
	op: 'set',
	id: 'e2e-today-hk',
	data: {
		type: 'stay',
		country: 'hong-kong',
		city: 'hong-kong',
		title: 'Hong Kong guesthouse',
		start: '2027-02-05',
		end: '2027-02-09',
		status: 'planned',
	},
} as const satisfies TripWrite;
const HK_DELETE = { col: 'legs', op: 'delete', id: HK_STAY.id } as const satisfies TripWrite;

test.describe('owner @readonly', () => {
	test.use({ storageState: STORAGE.owner });

	// The Hong Kong stay of the @write block, if an earlier project's run could not delete it.
	test.beforeAll(async ({ request }) => {
		await ownerWrite(request, HK_DELETE);
	});

	test.describe('before the trip', () => {
		test.use({ timezoneId: 'America/Sao_Paulo' });

		test('days to departure, the span, both clocks, the next flight countdown', async ({
			page,
		}) => {
			await page.clock.setFixedTime(new Date('2026-11-15T12:00:00Z'));
			await open(page, '/');
			await expect(page.getByTestId('eyebrow')).toHaveText('Sun 15 Nov 2026');
			await expect(h1(page)).toHaveText(/19 days to departure$/);
			await expect(page.getByTestId('lede')).toHaveText(
				'The trip runs Fri 4 Dec → Fri 15 Jan, 43 days.',
			);
			const clocks = page.getByTestId('clocks');
			await expect(clocks.locator('[data-clock="brazil"]')).toHaveText(
				/São Paulo\s+Sun\s+09:00\s*UTC−3/,
			);
			await expect(clocks.locator('[data-clock="china"]')).toHaveText(
				/China\s+Sun\s+20:00\s*UTC\+8/,
			);
			const flight = block(page, 'next-flight');
			await expect(flight.locator('[data-leg="gru-pvg"]')).toBeVisible();
			await expect(flight).toContainText('in 19 days');
			await expect(flight.locator('time').first()).toHaveText(/23:55\s*UTC−3/);
			await expect(page.getByText('Look at another day')).toBeVisible();
			await expect(page.getByRole('link', { name: 'Back to today' })).toHaveCount(0);
			// Nothing about a stop before the trip.
			await expect(block(page, 'where')).toHaveCount(0);
			await expect(block(page, 'only-today')).toHaveCount(0);
			await expect(block(page, 'musts')).toHaveCount(0);
		});

		test('open tasks and the latest answers', async ({ page }) => {
			await page.clock.setFixedTime(new Date('2026-11-15T12:00:00Z'));
			await open(page, '/');
			const tasks = block(page, 'tasks');
			await expect(title(page, 'tasks')).toHaveText(/To do\s*2 open of 3/);
			await expect(tasks.getByTestId('check-row')).toHaveCount(2);
			await expect(tasks).toContainText('Decide on the JR pass');
			// A task with steps shows how many are done and when it is due; its box is locked (it follows its steps).
			await expect(tasks).toContainText('1 of 2 steps');
			await expect(tasks.getByTestId('when')).toHaveText(/^By Sat 5 Jan · \d+ days left$/);
			await expect(
				tasks.getByRole('checkbox', { name: 'Mark done: Decide on the JR pass' }),
			).toBeDisabled();
			await expect(tasks).not.toContainText('Price the 7-day pass');
			await expect(tasks).toContainText('Suggested');
			await expect(tasks).not.toContainText('Check China visa-free entry');

			const answers = block(page, 'answers');
			await expect(title(page, 'answers')).toHaveText(/Latest answers\s*4 answers/);
			const items = answers.locator('[data-answer]');
			await expect(items).toHaveCount(3);
			await expect(items.first()).toContainText('One eSIM for the whole trip?');
			await expect(items.first()).toContainText('23 Nov 2026 · Whole trip');
			await expect(items.nth(1)).toContainText('22 Nov 2026 · China');
			// A time in a tldr carries its offset.
			await expect(items.nth(2)).toContainText('08:30–16:30 UTC+9');
			await expect(
				answers.getByRole('link', { name: 'One eSIM for the whole trip?' }),
			).toHaveAttribute('href', '/places/answers/2026-11-23-esim');
			await expect(answers.getByRole('link', { name: /All answers/ })).toHaveAttribute(
				'href',
				'/places/answers',
			);
		});
	});

	for (const zone of ['America/Sao_Paulo', 'Asia/Shanghai', 'Asia/Tokyo']) {
		test.describe(`during the trip, device in ${zone} @tz`, () => {
			test.use({ timezoneId: zone });

			test('the day is Harbin’s, whatever zone the phone is in', async ({ page }) => {
				// 01:00 UTC on 21 Dec: 22:00 on the 20th in São Paulo, 09:00 on the 21st in Harbin (UTC+8).
				await page.clock.setFixedTime(new Date('2026-12-21T01:00:00Z'));
				await open(page, '/');
				await expect(page.getByTestId('eyebrow')).toHaveText('Mon 21 Dec 2026');
				await expect(h1(page)).toHaveText(/Day 18 of 43 · Harbin hostel$/);
				await expect(page.getByTestId('lede')).toHaveText(
					'China. 3 more nights here, until Thu 24 Dec. Next: Kansai base.',
				);
				const clocks = page.getByTestId('clocks').locator('[data-clock]');
				await expect(clocks).toHaveText([
					/China\s+Mon\s+09:00\s*UTC\+8/,
					/São Paulo\s+Sun\s+22:00\s*UTC−3/,
				]);
				const where = block(page, 'where');
				await expect(where.locator('[data-leg="stay-harbin"]')).toBeVisible();
				await expect(where.getByTestId('here-chip')).toHaveText('You are here');
				await expect(where.getByTestId('voucher')).toContainText('after 14:00 UTC+8');
			});
		});
	}

	test('a picked day: the link, "not today", the stay, musts and the empty dated list', async ({
		page,
	}) => {
		await page.clock.setFixedTime(new Date('2026-11-15T12:00:00Z'));
		await open(page, '/today/2026-12-21');
		await expect(page.getByTestId('eyebrow')).toHaveText('Mon 21 Dec 2026 · not today');
		await expect(page.getByText('Looking at')).toBeVisible();
		await expect(block(page, 'next-flight')).toContainText('No flight ahead');
		await expect(block(page, 'only-today')).toContainText(
			'Nothing with a date falls on Mon 21 Dec in China.',
		);
		const musts = block(page, 'musts');
		await expect(title(page, 'musts')).toHaveText('Still to do in Harbin hostel');
		await expect(musts.locator('[data-place="harbin-ice-world"]')).toBeVisible();
		await expect(musts.getByRole('link', { name: /All 1 card in Harbin hostel/ })).toHaveAttribute(
			'href',
			'/places/harbin',
		);
		await press(page.getByRole('link', { name: 'Back to today' }));
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByTestId('eyebrow')).toHaveText('Sun 15 Nov 2026');
	});

	test('the checkout day with a holiday and its day status', async ({ page }) => {
		await open(page, '/today/2026-12-24');
		await expect(page.getByTestId('lede')).toHaveText('China. You leave today. Next: Kansai base.');
		const status = block(page, 'where').getByTestId('day-status');
		await expect(status).toContainText('Vacation');
		await expect(status).toContainText('Christmas Eve');
		await expect(status).toContainText('holiday in Brazil');
		await expect(status).toContainText('Harbin.');
	});

	test('a day with a move: the transfer and its plan', async ({ page }) => {
		await open(page, '/today/2027-01-15');
		const moves = block(page, 'moves');
		await expect(title(page, 'moves')).toHaveText('That day: moves');
		await expect(moves.locator('[data-leg="train-osaka"]')).toContainText('Kyoto to Osaka');
		await press(moves.getByRole('button', { name: /See the plan/ }));
		const sheet = page.getByRole('dialog');
		await expect(sheet).toContainText('08:30 UTC+9');
		await press(sheet.getByRole('button', { name: 'Close' }).last());
		await expect(page.getByRole('dialog')).toHaveCount(0);
	});

	test('a day between stays and a work day', async ({ page }) => {
		await open(page, '/today/2027-01-05');
		await expect(page.getByTestId('lede')).toHaveText('Between stays today.');
		const where = block(page, 'where');
		await expect(title(page, 'where')).toHaveText('Tue 5 Jan');
		await expect(where.getByTestId('day-status')).toContainText('Work');
	});

	test('the date box opens a day as a link; an old #/today link is kept', async ({ page }) => {
		await page.clock.setFixedTime(new Date('2026-11-15T12:00:00Z'));
		await open(page, '/');
		await page.getByLabel('Look at another day').fill('2026-12-25');
		await expect(page).toHaveURL(/\/today\/2026-12-25$/);
		await expect(page.getByTestId('eyebrow')).toHaveText('Fri 25 Dec 2026 · not today');
		await page.goto('/#/today/2027-01-12');
		await expect(page).toHaveURL(/\/today\/2027-01-12$/);
		await expect(h1(page)).toHaveText(/Day 40 of 43 · Kansai base$/);
		// A bad date in the link shows the real today.
		await open(page, '/today/2027-02-30');
		await expect(page.getByTestId('eyebrow')).toHaveText('Sun 15 Nov 2026');
	});

	test('a place row opens the sheet; an answer about a place opens its sheet', async ({ page }) => {
		await open(page, '/today/2026-12-21');
		await press(block(page, 'musts').getByRole('button', { name: /Harbin Ice and Snow World/ }));
		const sheet = page.getByRole('dialog');
		await expect(sheet).toContainText('Harbin Ice and Snow World');
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await press(block(page, 'answers').getByRole('button', { name: 'Kyoto' }));
		await expect(page.getByRole('dialog')).toContainText('Kyoto');
	});
});

test.describe('owner, dated cards @write', () => {
	test.use({ storageState: STORAGE.owner });

	test.beforeAll(async ({ request }) => {
		await ownerWrite(request, HK_STAY);
	});
	test.afterAll(async ({ request }) => {
		await ownerWrite(request, HK_DELETE);
	});

	test('only today, the last day, and the next events', async ({ page }) => {
		await open(page, '/today/2027-02-06');
		await expect(h1(page)).toHaveText(/· Hong Kong guesthouse$/);
		const only = block(page, 'only-today');
		await expect(only.locator('[data-place="lny-night-parade"]')).toContainText('Only today');
		await expect(only.locator('[data-place="lny-eve-flower-fair"]')).toContainText('Last day');
		const next = block(page, 'upcoming');
		await expect(next.locator('[data-place="lny-harbour-fireworks"]')).toContainText(
			'Sun 7 Feb · tomorrow',
		);
		await expect(next.locator('[data-place="lny-raceday"]')).toContainText('Mon 8 Feb · in 2 days');
		// Upcoming rows carry no tick, as on the old page.
		await expect(next.getByRole('checkbox')).toHaveCount(0);
		await expect(next.getByRole('link', { name: 'Calendar →' })).toHaveAttribute(
			'href',
			'/trip/calendar',
		);
	});

	test('been there: tick and untick a dated card', async ({ page }) => {
		await open(page, '/today/2027-02-06');
		const row = block(page, 'only-today').locator('[data-place="lny-night-parade"]');
		const tick = row.getByRole('checkbox');
		await expect(tick).toHaveAttribute('aria-checked', 'false');
		await press(tick);
		await expect(tick).toHaveAttribute('aria-checked', 'true');
		await press(tick);
		await expect(tick).toHaveAttribute('aria-checked', 'false');
	});

	test('tick a task done and back', async ({ page }) => {
		await open(page, '/today/2027-02-06');
		const tasks = block(page, 'tasks');
		await press(tasks.getByRole('checkbox', { name: 'Mark done: Buy an eSIM' }));
		await expect(title(page, 'tasks')).toHaveText(/1 open of 3/);
		await expect(tasks).not.toContainText('Buy an eSIM');
		await page.goto('/prep/todo');
		const row = page.getByTestId('check-row').filter({ hasText: 'Buy an eSIM' });
		await press(row.getByRole('checkbox'));
		await open(page, '/today/2027-02-06');
		await expect(title(page, 'tasks')).toHaveText(/2 open of 3/);
	});
});

test.describe('guest (read only)', () => {
	test.use({ storageState: STORAGE.guest });

	test('sees everything; ticks are disabled and edit buttons hidden', async ({ page }) => {
		await open(page, '/today/2026-12-21');
		await expect(block(page, 'where').locator('[data-leg="stay-harbin"]')).toBeVisible();
		await expect(today(page).getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
		await expect(today(page).getByRole('button', { name: /^Edit:/ })).toHaveCount(0);
		const tasks = block(page, 'tasks');
		await expect(tasks.getByTestId('check-row')).toHaveCount(2);
		for (const box of await tasks.getByRole('checkbox').all()) await expect(box).toBeDisabled();
		await expect(block(page, 'musts').getByRole('checkbox')).toBeDisabled();
		await expect(block(page, 'answers').locator('[data-answer]')).toHaveCount(3);
		// The place sheet still opens.
		await press(block(page, 'musts').getByRole('button', { name: /Harbin Ice and Snow World/ }));
		await expect(page.getByRole('dialog')).toContainText('Harbin Ice and Snow World');
	});
});
