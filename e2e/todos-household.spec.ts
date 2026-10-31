import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, fillDate, signIn } from './app';

/*
 * The household's to-dos beyond one person (docs/02 §2.26.6–7): Home's *To do* band with its
 * box on the right, ticking there with *Undo*, *Show all* leading to `/todos` and its groups,
 * ticking on `/todos`, *All to-dos* in the palette, and full search finding open and done
 * to-dos. Written after the owner tried them in the app (docs/08 §8.4.1).
 *
 * The suite shares one database, so every case works on a person of its own, named with letters
 * no other attempt shares. Other specs leave overdue to-dos from 2020 behind; the band's case
 * dates its own in 1990, so it is among the oldest and the band — at most three — holds it.
 * Every day is fixed far from today, so no case reads the clock.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

/** Notes a to-do on the person page in view, through the To do card's own *+ Add*. */
async function addTodo(page: Page, title: string, dueOn?: string): Promise<void> {
	const card = page.locator('#section-todos');
	await card.getByRole('button', { name: 'Add', exact: true }).click();
	const form = card.getByTestId('todo-form');
	await form.getByLabel('What is still to do?').fill(title);
	if (dueOn !== undefined) {
		await form.getByRole('button', { name: 'By when?' }).click();
		await fillDate(form, 'By', dueOn);
	}
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByTestId('todos').locator('li', { hasText: title })).toHaveCount(1);
}

const tickBox = (page: Page, title: string) =>
	page.getByRole('checkbox', { name: `Done: ${title}` });

const undo = (page: Page) => page.getByTestId('toast-undo').getByRole('button', { name: 'Undo' });

async function openHome(page: Page): Promise<void> {
	await page.goto('/');
	await appReady(page);
}

async function openTodoList(page: Page): Promise<void> {
	await page.goto('/todos');
	await appReady(page);
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('an overdue to-do stands in Home’s To do band, its box on the right', async ({ page }) => {
	const letters = runLetters();
	const last = `Imfeld${letters}`;
	await addPerson(page, 'Bandolin', last);
	const title = `Bring back the tent ${letters}`;
	await addTodo(page, title, '1990-01-05');

	await openHome(page);
	const row = page.getByTestId('todo-band').getByTestId('todo-band-row').filter({ hasText: title });
	await expect(row).toContainText(`Bandolin ${last}`);
	await expect(row.getByTestId('todo-due')).toHaveText('was due Fri, 5 Jan 1990');

	// Under the right thumb (docs/05 §5.1): the box ends the row, after the line.
	const line = await row.getByText(title).boundingBox();
	const box = await tickBox(page, title).boundingBox();
	expect(box!.x).toBeGreaterThan(line!.x + line!.width);
});

test('a to-do ticked in the band stays struck while the toast does, and Undo opens it again', async ({
	page
}) => {
	const letters = runLetters();
	await addPerson(page, 'Bandolin', `Gwerder${letters}`);
	const title = `Return the jump leads ${letters}`;
	await addTodo(page, title, '1990-01-06');

	await openHome(page);
	await tickBox(page, title).check();
	await expect(page.getByText(`Done: ${title}`)).toBeVisible();
	await expect(tickBox(page, title)).toBeChecked();

	await undo(page).click();
	await expect(tickBox(page, title)).not.toBeChecked();
	await page.reload();
	await expect(tickBox(page, title)).not.toBeChecked();
});

test('Show all leads to /todos, which groups every open one by its day', async ({ page }) => {
	const letters = runLetters();
	await addPerson(page, 'Listolin', `Bachmann${letters}`);
	const later = `Plan the hike ${letters}`;
	const noDay = `Send the address ${letters}`;
	await addTodo(page, later, '2090-06-01');
	await addTodo(page, noDay);

	await openHome(page);
	const all = page.getByTestId('todo-band-all');
	await expect(all).toHaveText(/^Show all \d+$/);
	const shown = Number((await all.textContent())!.replace(/\D/g, ''));
	await all.click();
	await page.waitForURL('/todos');

	await expect(page.getByRole('heading', { name: /^To-dos/, level: 1 })).toBeVisible();
	// *Show all N* counts what `/todos` holds.
	await expect(page.getByTestId('todo-list-open')).toHaveText(`${shown} open`);
	const group = (name: string) =>
		page.getByTestId('todo-list-group').filter({ has: page.getByRole('heading', { name }) });
	await expect(group('Later').getByTestId('todo-list-row').filter({ hasText: later })).toHaveCount(
		1
	);
	await expect(group('No day').getByTestId('todo-list-row').filter({ hasText: noDay })).toHaveCount(
		1
	);
	await expect(page.getByTestId('todo-list-row').filter({ hasText: later })).toContainText(
		`Listolin Bachmann${letters}`
	);
});

test('a to-do ticked on /todos opens again with Undo, and once saved leaves the list', async ({
	page
}) => {
	const letters = runLetters();
	await addPerson(page, 'Listolin', `Odermatt${letters}`);
	const title = `Return the fondue set ${letters}`;
	await addTodo(page, title);

	await openTodoList(page);
	await tickBox(page, title).check();
	await expect(page.getByText(`Done: ${title}`)).toBeVisible();
	await expect(tickBox(page, title)).toBeChecked();
	await undo(page).click();
	await expect(tickBox(page, title)).not.toBeChecked();

	await tickBox(page, title).check();
	// The toast stands once Stella has the tick; the box alone checks before it is saved.
	await expect(page.getByText(`Done: ${title}`)).toBeVisible();
	await page.reload();
	await expect(page.getByTestId('todo-list-row').filter({ hasText: title })).toHaveCount(0);
});

test('All to-dos in the palette opens /todos', async ({ page }) => {
	await openHome(page);
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', { name: 'Jump to' });
	await palette.getByRole('combobox').fill('all to-dos');
	await palette.getByRole('option', { name: /^All to-dos/ }).click();
	await page.waitForURL('/todos');
	await expect(page.getByRole('heading', { name: /^To-dos/, level: 1 })).toBeVisible();
});

test('full search finds an open to-do and a done one, marked done', async ({ page }) => {
	const letters = runLetters();
	const last = `Furrer${letters}`;
	await addPerson(page, 'Suchlin', last);
	const open = `Fix the bike ${letters}`;
	const done = `Frame the picture ${letters}`;
	await addTodo(page, open);
	await addTodo(page, done);
	await page.getByTestId('todos').locator('li', { hasText: done }).getByText(done).click();
	// The toast stands once Stella has the tick; the box alone checks before it is saved.
	await expect(page.getByText(`Done: ${done}`)).toBeVisible();

	await page.goto(`/search?q=${encodeURIComponent(letters)}`);
	const hits = page.getByTestId('search-todos');
	await expect(hits.getByRole('link')).toHaveCount(2);
	const openHit = hits.getByRole('link', { name: new RegExp(open) });
	const doneHit = hits.getByRole('link', { name: new RegExp(done) });
	await expect(openHit).toContainText(`for Suchlin ${last}`);
	await expect(openHit).not.toContainText('done');
	await expect(doneHit).toContainText(/· done \d/);
	// Open ones first.
	await expect(hits.getByRole('link').first()).toContainText(open);

	await openHit.click();
	await expect(page.getByRole('heading', { name: `Suchlin ${last}`, exact: true })).toBeVisible();
	await expect(page.getByTestId('todos').locator('li', { hasText: open })).toBeVisible();
});
