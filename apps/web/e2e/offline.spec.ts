// Slice L, offline (plan section 11, spike S25): the service worker opens saved pages with no network, the
// IndexedDB outbox keeps writes made offline across a reload and replays them in order with their clientOpId (the
// backend dedupes through appliedOps), and a Frozen refusal keeps the entries behind "Writes paused, N waiting".
// The owner describe starts from the e2e data set and restores it when done (scripts/convex-local.sh seed-data).
// @offline
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { makeFunctionReference } from 'convex/server';
import { slot } from './slot';
import { CONVEX_SITE_URL, convexAs, convexToken, STORAGE } from './support';

const SCRIPT = path.resolve(import.meta.dirname, '../../../scripts/convex-local.sh');
const run = (...args: string[]): void => {
	execFileSync(SCRIPT, args, {
		env: { ...process.env, ATR_SLOT: String(slot().n) },
		stdio: 'ignore',
	});
};
const reseed = (): void => {
	run('seed-data');
};
const setFrozen = (value: boolean): void => {
	run('convex', 'run', 'ops:setWritesFrozen', JSON.stringify({ value }));
};

/** The v1 files as GET /ops/export returns them (the @write check: what really landed, and how often). */
async function exported(): Promise<Record<string, string>> {
	const token = process.env['EXPORT_TOKEN'];
	if (token === undefined) throw new Error('EXPORT_TOKEN missing (apps/web/.env.tokens.local)');
	const res = await fetch(`${CONVEX_SITE_URL}/ops/export`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	expect(res.status).toBe(200);
	const body = (await res.json()) as { files: Record<string, { content: string }> };
	return Object.fromEntries(Object.entries(body.files).map(([k, f]) => [k, f.content]));
}

async function swipeLines(): Promise<{ id: string; verdict: string }[]> {
	const text = (await exported())['feedback/swipes.jsonl'] ?? '';
	return text
		.split('\n')
		.filter((l) => l.trim() !== '')
		.map((l) => JSON.parse(l) as { id: string; verdict: string });
}

async function tripDoc(col: string, id: string): Promise<Record<string, unknown> | undefined> {
	const docs = JSON.parse((await exported())[`trip/${col}.json`] ?? '[]') as {
		id: string;
		[k: string]: unknown;
	}[];
	return docs.find((d) => d.id === id);
}

/** The outbox as IndexedDB holds it in the page (oldest first). */
function outbox(page: Page): Promise<{ clientOpId: string; name: string; args: unknown }[]> {
	return page.evaluate(
		() =>
			new Promise((resolve, reject) => {
				const open = indexedDB.open('atr-sync');
				open.onerror = () => {
					reject(new Error('cannot open atr-sync'));
				};
				open.onsuccess = () => {
					const req = open.result.transaction('outbox').objectStore('outbox').getAll();
					req.onsuccess = () => {
						resolve(req.result as { clientOpId: string; name: string; args: unknown }[]);
						open.result.close();
					};
				};
			}),
	);
}

/**
 * Visit `paths` while online once the service worker controls the tab, so each page is saved for offline use.
 * The first page load registers the worker; it claims the tab when it activates.
 */
async function saveForOffline(page: Page, paths: readonly string[]): Promise<void> {
	await page.goto(paths[0] ?? '/');
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
		timeout: 20_000,
	});
	for (const p of paths) {
		await page.goto(p);
		await page.waitForLoadState('networkidle');
	}
}

/**
 * Press a button or checkbox from the keyboard. In WebKit's iPhone emulation a pointer click on controls below the
 * fold meets "<html> intercepts pointer events" on this checkout, online and with no service worker too (todo.spec
 * fails the same way; reported to the integrator), so this spec stays about the outbox.
 */
const press = (control: Locator): Promise<void> => control.press('Space');

const badge = (page: Page) => page.getByTestId('sync-badge');
const details = (page: Page) => page.getByTestId('sync-details');
const topCard = (page: Page) => page.locator('[data-deck-card][data-depth="0"]');
const left = (page: Page) => page.locator('[data-deck-left]');

async function openTodo(page: Page): Promise<void> {
	await page.goto('/prep/todo');
	await expect(page.getByRole('heading', { level: 1, name: 'To do' })).toBeVisible();
	await expect(
		page.getByRole('checkbox', { name: /^Mark (not )?done: Buy an eSIM$/ }),
	).toBeVisible();
	// Hydrated before the first tap.
	await page.waitForLoadState('networkidle');
}

async function openSwipe(page: Page): Promise<void> {
	await page.goto('/decide/swipe');
	await expect(topCard(page)).toBeVisible();
	await expect(page.locator('[data-deck-progress]')).toBeVisible();
	// Hydrated: the controls react only after the app has loaded feedback.
	await page.waitForLoadState('networkidle');
}

test.describe('owner @offline', () => {
	test.use({ storageState: STORAGE.owner });
	test.describe.configure({ mode: 'serial' });
	test.beforeAll(() => {
		setFrozen(false);
		reseed();
	});
	test.afterAll(() => {
		setFrozen(false);
		// Leave the e2e data set as the next spec expects it (swipes, first-seen keys, ticks).
		reseed();
	});

	test('a cold offline load of the itinerary after one online visit shows the saved legs', async ({
		page,
		context,
	}) => {
		await saveForOffline(page, ['/trip/itinerary']);
		await expect(page.locator('[data-leg="gru-pvg"]')).toBeVisible();
		await context.setOffline(true);
		await page.close();
		const cold = await context.newPage();
		await cold.goto('/trip/itinerary');
		await expect(cold.getByRole('heading', { level: 1, name: 'Itinerary' })).toBeVisible();
		await expect(cold.locator('[data-leg="gru-pvg"]')).toBeVisible();
		await expect(cold.locator('[data-leg="stay-kansai"]')).toBeVisible();
		await expect(badge(cold)).toHaveAttribute('data-kind', 'offline', { timeout: 10_000 });
		// The layout's first-seen bookkeeping may queue one write of its own on a fresh project.
		await expect(badge(cold)).toHaveText(/^\s*Offline( · \d+)?$/);
		await press(badge(cold));
		await expect(details(cold)).toContainText(/Offline · last synced .*\d{2}:\d{2} UTC[+−]\d/);
		await cold.keyboard.press('Escape');
		// A page never opened online says so instead of failing.
		await cold.goto('/money');
		await expect(cold.getByRole('heading', { name: 'You are offline' })).toBeVisible();
		await expect(cold.getByRole('link', { name: '/trip/itinerary' })).toBeVisible();
		await context.setOffline(false);
	});

	test('S25: three swipes and a task tick made offline survive a reload and land exactly once @write', async ({
		page,
		context,
		request,
	}) => {
		// 12 s of deliberate offline time plus three page loads.
		test.setTimeout(60_000);
		const before = await swipeLines();
		await saveForOffline(page, ['/decide/swipe', '/prep/todo']);
		// Open the deck with no network (the saved copy): WebKit's offline switch blocks new connections only, so a
		// socket opened before it would still carry the writes.
		await context.setOffline(true);
		await openSwipe(page);
		const n = Number((await left(page).innerText()).split(' ')[0]);
		const ids: string[] = [];
		// The deck's keys (Must →, Maybe ↑, Skip ←); see `press` for why not the buttons.
		for (const [i, key] of ['ArrowRight', 'ArrowUp', 'ArrowLeft'].entries()) {
			ids.push(String(await topCard(page).getAttribute('data-deck-card')));
			await page.keyboard.press(key);
			await expect(left(page)).toHaveText(`${String(n - i - 1)} left`);
			await page.waitForTimeout(400);
		}
		await openTodo(page);
		await press(page.getByRole('checkbox', { name: 'Mark done: Buy an eSIM' }));
		await expect.poll(async () => (await outbox(page)).length).toBe(4);
		await expect(badge(page)).toHaveAttribute('data-kind', 'offline', { timeout: 10_000 });
		await expect(badge(page)).toHaveText('Offline · 4');

		// Nothing reached the backend, and a reload (still offline) keeps all four in order.
		expect(await swipeLines()).toHaveLength(before.length);
		await page.reload();
		await expect(page.getByRole('heading', { level: 1, name: 'To do' })).toBeVisible();
		const kept = await outbox(page);
		expect(kept.map((e) => e.name)).toEqual([
			'feedback.swipe',
			'feedback.swipe',
			'feedback.swipe',
			'trip.write',
		]);
		expect(kept.slice(0, 3).map((e) => (e.args as { id: string }).id)).toEqual(ids);
		await expect(badge(page)).toHaveText('Offline · 4');
		await press(badge(page));
		await expect(details(page)).toContainText('4 unsynced');
		await page.keyboard.press('Escape');
		// Stay offline long enough for the auth library to give up its token fetch (about 8 s of retries), as on a
		// real offline start: the runtime must sign the socket in again before the replay can land.
		await page.waitForTimeout(12_000);

		await context.setOffline(false);
		await expect.poll(async () => (await outbox(page)).length, { timeout: 20_000 }).toBe(0);
		await expect(badge(page)).toHaveCount(0);
		const after = await swipeLines();
		expect(after).toHaveLength(before.length + 3);
		expect(after.slice(-3).map((s) => [s.id, s.verdict])).toEqual([
			[ids[0], 'must'],
			[ids[1], 'maybe'],
			[ids[2], 'skip'],
		]);
		expect((await tripDoc('tasks', 'esim'))?.['status']).toBe('done');
		await expect(page.getByRole('checkbox', { name: 'Mark not done: Buy an eSIM' })).toBeChecked();

		// Replaying a clientOpId that already landed adds nothing (appliedOps).
		const op = kept[0];
		if (op === undefined) throw new Error('no kept entry');
		const client = convexAs(await convexToken(request));
		const swipe = makeFunctionReference<'mutation', Record<string, unknown>, unknown>(
			'feedback:swipe',
		);
		const replay = await client.mutation(swipe, {
			...(op.args as Record<string, unknown>),
			clientOpId: op.clientOpId,
		});
		expect(replay).toEqual({ replayed: true });
		expect(await swipeLines()).toHaveLength(before.length + 3);
	});

	test('a Frozen refusal keeps the entry: "Writes paused, 1 waiting", copy, reload, then it lands once @write', async ({
		page,
	}) => {
		await saveForOffline(page, ['/prep/bag']);
		await expect(page.getByRole('checkbox', { name: 'Packed: Winter boots' })).not.toBeChecked();
		setFrozen(true);
		try {
			await press(page.getByRole('checkbox', { name: 'Packed: Winter boots' }));
			await expect(page.getByText('Writes are paused right now.')).toBeVisible();
			await expect(badge(page)).toHaveAttribute('data-kind', 'paused');
			await expect(badge(page)).toHaveText('Paused · 1');
			const [entry] = await outbox(page);
			expect(entry?.name).toBe('trip.write');

			await press(badge(page));
			await expect(details(page)).toContainText('Writes paused, 1 waiting');
			await press(details(page).getByRole('button', { name: 'Copy pending changes' }));
			const json = page.getByTestId('pending-json');
			await expect(json).toBeVisible();
			const copied = JSON.parse(await json.inputValue()) as { clientOpId: string; args: unknown }[];
			expect(copied).toEqual([expect.objectContaining({ clientOpId: entry?.clientOpId })]);
			expect(copied[0]?.args).toMatchObject({ col: 'bag', id: 'boots', data: { packed: true } });
			await page.keyboard.press('Escape');

			// A reload keeps the entry; the replay at start meets Frozen again.
			await page.reload();
			await expect(badge(page)).toHaveText('Paused · 1', { timeout: 10_000 });
			expect((await tripDoc('bag', 'boots'))?.['packed']).toBe(false);
		} finally {
			setFrozen(false);
		}
		await press(badge(page));
		await press(details(page).getByRole('button', { name: 'Retry' }));
		await expect(badge(page)).toHaveCount(0, { timeout: 10_000 });
		expect(await outbox(page)).toHaveLength(0);
		expect((await tripDoc('bag', 'boots'))?.['packed']).toBe(true);
		await expect(page.getByRole('checkbox', { name: 'Packed: Winter boots' })).toBeChecked();
	});
});

test.describe('guest @offline', () => {
	test.use({ storageState: STORAGE.guest });

	test('the guest reads saved pages offline and sees no sync actions', async ({
		page,
		context,
	}) => {
		await saveForOffline(page, ['/prep/todo']);
		await context.setOffline(true);
		await page.reload();
		await expect(page.getByRole('heading', { level: 1, name: 'To do' })).toBeVisible();
		await expect(page.getByRole('checkbox', { name: /Buy an eSIM/ })).toBeDisabled();
		await expect(badge(page)).toHaveAttribute('data-kind', 'offline', { timeout: 10_000 });
		await press(badge(page));
		await expect(details(page)).toContainText('Offline · last synced');
		await expect(details(page).getByRole('button')).toHaveCount(0);
		await context.setOffline(false);
	});
});
