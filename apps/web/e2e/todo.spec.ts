// To do (slice G): open and done tasks, the tick box, add / edit / delete, the Prep sub-tabs and the guest view,
// against the e2e trip set (reseeded on every backend start). Each write test undoes its own changes through the UI.
import { expect, test, type Page, type Response } from '@playwright/test';
import { STORAGE } from './support';

/**
 * page.goto / page.reload that waits out one Better Auth rate-limit window. Every server-side Convex call fetches
 * Better Auth's JWKS route, which shares the default limit (100 requests, 10 s quiet window) with every other auth
 * request behind the proxy, so a long run gets a 429 page now and then (reported to the integrator; the fix is a
 * rule for /convex/jwks in convex/auth.ts).
 */
async function navigate(page: Page, go: () => Promise<Response | null>): Promise<void> {
	const first = await go();
	if (first === null || first.ok()) return;
	await page.waitForTimeout(11_000);
	await go();
}

async function openTodo(page: Page, path = '/prep/todo'): Promise<void> {
	await navigate(page, () => page.goto(path));
	await expect(page.getByRole('heading', { level: 1, name: 'To do' })).toBeVisible();
}

const row = (page: Page, title: string) => page.getByTestId('check-row').filter({ hasText: title });

test.describe('owner', () => {
	test.use({ storageState: STORAGE.owner });

	test('lists open tasks by when, then done ones, with chips and progress', async ({ page }) => {
		await openTodo(page);
		await expect(page.getByTestId('eyebrow')).toHaveText('2 open · 1 done');
		await expect(page.getByRole('progressbar', { name: '1 of 3 done' })).toBeVisible();
		// The task with a last day comes first; the one with no date after it.
		await expect(page.getByTestId('open-tasks').getByRole('heading', { level: 2 })).toHaveText([
			'Next up',
			'Any time',
		]);
		const next = page.getByRole('list', { name: 'Next up tasks' });
		await expect(next.getByTestId('check-row')).toHaveText([/Decide on the JR pass/]);
		await expect(row(page, 'Decide on the JR pass').getByTestId('when')).toHaveText(
			/^By Sat 5 Jan · \d+ days left$/,
		);
		await expect(row(page, 'Decide on the JR pass').getByTestId('steps-count')).toHaveText(
			'1 of 2 steps',
		);
		const any = page.getByRole('list', { name: 'Any time tasks' });
		await expect(any.getByTestId('check-row')).toHaveText([/Buy an eSIM/]);
		await expect(row(page, 'Buy an eSIM')).toContainText('Suggested');
		const done = page.getByRole('list', { name: 'Done tasks' });
		await expect(done.getByTestId('check-row')).toHaveText([/Check China visa-free entry/]);
		await expect(
			page.getByRole('checkbox', { name: 'Mark not done: Check China visa-free entry' }),
		).toBeChecked();
	});

	test('a tap on the title opens the notes and steps and never ticks the task', async ({
		page,
	}) => {
		await openTodo(page);
		const done = row(page, 'Check China visa-free entry');
		await expect(done).not.toContainText('Transit rule covers 30 days.');
		await done.getByRole('button', { name: 'Check China visa-free entry', exact: true }).click();
		await expect(done).toContainText('Transit rule covers 30 days.');
		await expect(
			page.getByRole('checkbox', { name: 'Mark not done: Check China visa-free entry' }),
		).toBeChecked();
		await expect(page.getByTestId('eyebrow')).toHaveText('2 open · 1 done');

		// A task with steps has a ring in place of its box, and its steps have boxes of their own.
		const jr = row(page, 'Decide on the JR pass');
		await expect(jr.getByRole('img', { name: '1 of 2 steps done' })).toBeVisible();
		await jr.getByRole('button', { name: 'Decide on the JR pass', exact: true }).click();
		const steps = jr.getByRole('list', { name: 'Steps: Decide on the JR pass' });
		await expect(steps.getByTestId('step')).toHaveText([/Price the 7-day pass/, /Buy it online/]);
		await expect(
			steps.getByRole('checkbox', { name: 'Mark not done: Price the 7-day pass' }),
		).toBeChecked();
		// A code in a note is a button that copies it; amounts are set apart.
		await expect(steps.getByRole('button', { name: 'Copy JR-EAST-7' })).toBeVisible();
		await expect(steps.locator('[data-fact]')).toHaveText(['JPY 50,000']);
		// Open tasks stay open across a reload.
		await navigate(page, () => page.reload());
		await expect(row(page, 'Decide on the JR pass').getByTestId('step')).toHaveCount(2);
		await row(page, 'Decide on the JR pass')
			.getByRole('button', { name: 'Decide on the JR pass', exact: true })
			.click();
		await expect(row(page, 'Decide on the JR pass').getByTestId('step')).toHaveCount(0);
	});

	test('ticking the last step finishes the task; unticking reopens it @write', async ({ page }) => {
		await openTodo(page);
		const jr = row(page, 'Decide on the JR pass');
		await jr.getByRole('button', { name: 'Decide on the JR pass', exact: true }).click();
		await jr.getByRole('checkbox', { name: 'Mark done: Buy it online' }).click();
		await expect(page.getByTestId('eyebrow')).toHaveText('1 open · 2 done');
		await expect(
			page.getByRole('list', { name: 'Done tasks' }).getByTestId('check-row'),
		).toHaveText([/Check China visa-free entry/, /Decide on the JR pass/]);
		await jr.getByRole('checkbox', { name: 'Mark not done: Buy it online' }).click();
		await expect(page.getByTestId('eyebrow')).toHaveText('2 open · 1 done');
		await expect(jr.getByTestId('steps-count')).toHaveText('1 of 2 steps');
		await jr.getByRole('button', { name: 'Decide on the JR pass', exact: true }).click();
	});

	test('the Prep tab opens To do; the sub-tabs carry the open count and reach Bag', async ({
		page,
	}) => {
		await openTodo(page, '/prep');
		const nav = page.getByRole('navigation', { name: 'Prep pages' });
		const todo = nav.getByRole('link', { name: /To do/ });
		await expect(todo).toHaveAttribute('aria-current', 'page');
		await expect(todo).toContainText('2');
		await nav.getByRole('link', { name: 'Bag' }).click();
		await expect(page).toHaveURL(/\/prep\/bag$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Bag' })).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Bag' })).toHaveAttribute('aria-current', 'page');
		await todo.click();
		await expect(page).toHaveURL(/\/prep\/todo$/);
	});

	test('ticks a task off and back; the change survives a reload @write', async ({ page }) => {
		await openTodo(page);
		await page.getByRole('checkbox', { name: 'Mark done: Buy an eSIM' }).click();
		await expect(page.getByTestId('eyebrow')).toHaveText('1 open · 2 done');
		const done = page.getByRole('list', { name: 'Done tasks' });
		await expect(done.getByTestId('check-row').filter({ hasText: 'Buy an eSIM' })).toBeVisible();
		await navigate(page, () => page.reload());
		await expect(page.getByRole('checkbox', { name: 'Mark not done: Buy an eSIM' })).toBeChecked();
		await page.getByRole('checkbox', { name: 'Mark not done: Buy an eSIM' }).click();
		await expect(page.getByTestId('eyebrow')).toHaveText('2 open · 1 done');
		await expect(page.getByRole('checkbox', { name: 'Mark done: Buy an eSIM' })).not.toBeChecked();
	});

	test('adds a task, marks it in progress, ticks it and deletes it @write', async ({
		page,
	}, testInfo) => {
		const title = `E2E book Harbin ${testInfo.project.name}`;
		await openTodo(page);
		await page.getByRole('button', { name: 'Add task' }).click();
		const add = page.getByRole('dialog', { name: 'Add task' });
		await expect(add.getByLabel('Task')).toBeFocused();
		await add.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Give it a name first.')).toBeVisible();
		await add.getByLabel('Task').fill(title);
		await add.getByLabel('Notes').fill('Ice festival tickets: https://example.com/harbin');
		await add.getByLabel('Do by (last day)').fill('2030-02-01');
		await add.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Added', { exact: true })).toBeVisible();
		const r = row(page, title);
		await expect(r.getByTestId('when')).toHaveText(/^By Fri 1 Feb/);
		await r.getByRole('button', { name: title, exact: true }).click();
		await expect(r.getByRole('link', { name: 'example.com/harbin' })).toHaveAttribute(
			'href',
			'https://example.com/harbin',
		);
		await expect(page.getByTestId('eyebrow')).toHaveText('3 open · 1 done');

		await r.getByRole('button', { name: `Edit: ${title}` }).click();
		const edit = page.getByRole('dialog', { name: 'Edit task' });
		await expect(edit.getByLabel('Status')).toHaveValue('todo');
		await edit.getByLabel('Status').selectOption('doing');
		await edit.getByRole('button', { name: 'Save' }).click();
		await expect(r).toContainText('In progress');

		// A step: added under the task, which then follows it.
		await r.getByRole('button', { name: 'Add step' }).click();
		const addStep = page.getByRole('dialog', { name: 'Add step' });
		await addStep.getByLabel('Task').fill('Pick the dates');
		await addStep.getByRole('button', { name: 'Save' }).click();
		await expect(r.getByTestId('step')).toHaveText([/Pick the dates/]);
		await expect(r.getByTestId('steps-count')).toHaveText('0 of 1 steps');
		await expect(page.getByTestId('eyebrow')).toHaveText('3 open · 1 done');

		await r.getByRole('checkbox', { name: 'Mark done: Pick the dates' }).click();
		await expect(page.getByTestId('eyebrow')).toHaveText('2 open · 2 done');

		await r.getByRole('button', { name: `Edit: ${title}` }).click();
		await expect(edit.getByLabel('Status')).toHaveValue('done');
		await edit.getByRole('button', { name: 'Delete' }).click();
		await expect(edit.getByRole('status')).toHaveText(
			'Tap Delete again to remove it and its 1 step.',
		);
		await edit.getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByText('Deleted', { exact: true })).toBeVisible();
		await expect(r).toHaveCount(0);
		await expect(page.getByText('Pick the dates')).toHaveCount(0);
		await expect(page.getByTestId('eyebrow')).toHaveText('2 open · 1 done');
	});
});

test.describe('guest', () => {
	test.use({ storageState: STORAGE.guest });

	test('sees every task with the boxes disabled and no add or edit', async ({ page }) => {
		await openTodo(page);
		await expect(page.getByTestId('check-row')).toHaveCount(3);
		await row(page, 'Decide on the JR pass')
			.getByRole('button', { name: 'Decide on the JR pass', exact: true })
			.click();
		await expect(page.getByTestId('step')).toHaveCount(2);
		await expect(page.getByRole('button', { name: 'Add step' })).toHaveCount(0);
		for (const box of await page.getByRole('checkbox').all()) await expect(box).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Add task' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: /^Edit:/ })).toHaveCount(0);
	});
});
