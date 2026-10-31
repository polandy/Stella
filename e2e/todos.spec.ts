import { expect, test, type Locator, type Page } from '@playwright/test';
import { addPerson, appReady, fillDate, signIn } from './app';

/*
 * The To do card on the person page (docs/02 §2.26): noting a to-do with or without a day,
 * ticking it by its line, rewriting and removing it, the card moving to the top once something
 * is open, *To-do for …* in the palette, and noting and ticking while Stella is out of reach;
 * a ticked one in the person's Activity (§2.23), unticked or removed from there. Written after
 * the owner tried the card and the Activity row in the app (docs/08 §8.4.1).
 *
 * The suite shares one database, so every case works on a person of its own, named with letters
 * no other attempt shares. The days are fixed far from today, so no case reads the clock.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const todoCard = (page: Page) => page.locator('#section-todos');
const todoRow = (page: Page, title: string) =>
	page.getByTestId('todos').locator('li', { hasText: title });

/** Notes a to-do through the card's own *+ Add*, by a day when one is given. */
async function addTodo(page: Page, title: string, dueOn?: string): Promise<void> {
	const card = todoCard(page);
	await card.getByRole('button', { name: 'Add', exact: true }).click();
	const form = card.getByTestId('todo-form');
	await form.getByLabel('What is still to do?').fill(title);
	if (dueOn !== undefined) {
		await form.getByRole('button', { name: 'By when?' }).click();
		await fillDate(form, 'By', dueOn);
	}
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(todoRow(page, title)).toHaveCount(1);
}

/** Where the To do card stands among the page's cards, counted from the top. */
function cardPlace(page: Page): Promise<number> {
	return page
		.locator('section[id^="section-"]')
		.evaluateAll((sections) => sections.findIndex((section) => section.id === 'section-todos'));
}

/** A done to-do in the person's Activity. */
const storyTodo = (page: Page, title: string) =>
	page.getByTestId('story-timeline').locator('[data-story-item]', { hasText: title });

const undo = (page: Page) => page.getByTestId('toast-undo').getByRole('button', { name: 'Undo' });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('the first to-do moves the card from the end of the page to the top', async ({ page }) => {
	const letters = runLetters();
	await addPerson(page, 'Todolin', `Hagenbuch${letters}`);
	const card = todoCard(page);
	await expect(card).toHaveAttribute('data-empty-line', 'true');
	await expect(card).toContainText('Nothing open.');
	const atTheEnd = await cardPlace(page);

	await addTodo(page, `Return the drill ${letters}`);
	await expect(card).not.toHaveAttribute('data-empty-line');
	await expect.poll(() => cardPlace(page)).toBeLessThan(atTheEnd);
	await expect(card).toBeInViewport();
});

test('a to-do with a day comes first and says when it was due', async ({ page }) => {
	const letters = runLetters();
	await addPerson(page, 'Todolin', `Rietmann${letters}`);
	const recipe = `Send the recipe ${letters}`;
	const book = `Give back the book ${letters}`;
	await addTodo(page, recipe);
	await addTodo(page, book, '2020-03-02');

	const rows = page.getByTestId('todos').locator('li');
	await expect(rows.first()).toContainText(book);
	await expect(todoRow(page, book).getByTestId('todo-due')).toHaveText('was due Mon, 2 Mar 2020');
	await expect(todoRow(page, recipe).getByTestId('todo-due')).toHaveCount(0);

	// *No day* takes the day away again.
	await todoRow(page, book)
		.getByRole('button', { name: `Change: ${book}` })
		.click();
	const form = todoRow(page, book).getByTestId('todo-form');
	await form.getByRole('button', { name: 'No day' }).click();
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(todoRow(page, book).getByTestId('todo-due')).toHaveCount(0);
});

test('tapping the line ticks it, and Undo opens it again', async ({ page }) => {
	const letters = runLetters();
	await addPerson(page, 'Todolin', `Zgraggen${letters}`);
	const title = `Ask about the knee ${letters}`;
	await addTodo(page, title);

	await todoRow(page, title).getByText(title).click();
	await expect(page.getByText(`Done: ${title}`)).toBeVisible();
	// It stays where it stood, struck through, while the toast does: the card does not jump.
	await expect(
		todoRow(page, title).getByRole('checkbox', { name: `Done: ${title}` })
	).toBeChecked();

	await undo(page).click();
	const row = todoRow(page, title);
	await expect(row).toHaveCount(1);
	await expect(row.getByRole('checkbox', { name: `Done: ${title}` })).not.toBeChecked();
});

test('a to-do is rewritten in place, and removed with Undo', async ({ page }) => {
	const letters = runLetters();
	await addPerson(page, 'Todolin', `Imhasly${letters}`);
	const before = `Call about the visit ${letters}`;
	const after = `Plan the visit ${letters}`;
	await addTodo(page, before);

	await todoRow(page, before)
		.getByRole('button', { name: `Change: ${before}` })
		.click();
	const form = todoRow(page, before).getByTestId('todo-form');
	await form.getByLabel('What is still to do?').fill(after);
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(todoRow(page, after)).toHaveCount(1);
	await expect(todoRow(page, before)).toHaveCount(0);

	await todoRow(page, after)
		.getByRole('button', { name: `Remove: ${after}` })
		.click();
	await expect(page.getByText('To-do removed')).toBeVisible();
	await expect(todoRow(page, after)).toHaveCount(0);
	await undo(page).click();
	await expect(todoRow(page, after)).toHaveCount(1);
});

test('To-do for … in the palette opens the person with the form ready', async ({ page }) => {
	const letters = runLetters();
	const last = `Ambühl${letters}`;
	await addPerson(page, 'Todolin', last);

	await page.goto('/');
	await appReady(page);
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', { name: 'Jump to' });
	await palette.getByRole('combobox').fill('to do');
	await palette.getByRole('option', { name: /^To-do for …/ }).click();
	await expect(palette.getByRole('combobox', { name: 'A to-do for whom?' })).toBeFocused();
	await page.keyboard.type(last);
	await expect(palette.getByRole('option')).toHaveCount(1);
	await page.keyboard.press('Enter');

	await expect(page.getByRole('heading', { name: `Todolin ${last}`, exact: true })).toBeVisible();
	const form = todoCard(page).getByTestId('todo-form');
	await expect(form.getByRole('heading', { name: `To-do for Todolin ${last}` })).toBeVisible();
	await form.getByLabel('What is still to do?').fill(`Bring the photos ${letters}`);
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(todoRow(page, `Bring the photos ${letters}`)).toHaveCount(1);
});

test('noting and ticking are kept offline, and sent once back', async ({ page, context }) => {
	const letters = runLetters();
	await addPerson(page, 'Todolin', `Waldvogel${letters}`);
	const ticked = `Pay back the train ticket ${letters}`;
	await addTodo(page, ticked);

	await context.setOffline(true);
	const card = todoCard(page);
	const noted = `Return the umbrella ${letters}`;
	await card.getByRole('button', { name: 'Add', exact: true }).click();
	const form = card.getByTestId('todo-form');
	await form.getByLabel('What is still to do?').fill(noted);
	await form.getByRole('button', { name: 'Save' }).click();
	const kept: Locator = page.getByTestId('kept-todos').locator('li');
	await expect(kept).toContainText(noted);
	await expect(kept).toContainText('Not sent yet');

	await todoRow(page, ticked).getByText(ticked).click();
	const row = todoRow(page, ticked);
	await expect(row.getByRole('checkbox', { name: `Done: ${ticked}` })).toBeChecked();
	await expect(row).toContainText('Not sent yet');

	await context.setOffline(false);
	await expect(page.getByTestId('kept-todos')).toHaveCount(0);
	await page.reload();
	await expect(todoRow(page, noted)).toHaveCount(1);
	await expect(todoRow(page, ticked)).toHaveCount(0);
});

test('a tick kept offline is taken back with the row’s Undo, and never sent', async ({
	page,
	context
}) => {
	const letters = runLetters();
	await addPerson(page, 'Todolin', `Imfeld${letters}`);
	const ticked = `Bring the ladder back ${letters}`;
	await addTodo(page, ticked);

	await context.setOffline(true);
	const row = todoRow(page, ticked);
	await row.getByText(ticked).click();
	await expect(row.getByRole('checkbox', { name: `Done: ${ticked}` })).toBeChecked();
	await expect(row).toContainText('Not sent yet');

	await row.getByRole('button', { name: `Undo tick: ${ticked}` }).click();
	await expect(row.getByRole('checkbox', { name: `Done: ${ticked}` })).not.toBeChecked();
	await expect(row).not.toContainText('Not sent yet');

	// Something else kept meanwhile: once it is sent, the outbox has been through, so the tick
	// would have gone with it had Undo not dropped it.
	const card = todoCard(page);
	const noted = `Water the plants ${letters}`;
	await card.getByRole('button', { name: 'Add', exact: true }).click();
	const form = card.getByTestId('todo-form');
	await form.getByLabel('What is still to do?').fill(noted);
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByTestId('kept-todos').locator('li')).toContainText(noted);

	await context.setOffline(false);
	await expect(page.getByTestId('kept-todos')).toHaveCount(0);
	await page.reload();
	await expect(todoRow(page, noted)).toHaveCount(1);
	await expect(
		todoRow(page, ticked).getByRole('checkbox', { name: `Done: ${ticked}` })
	).not.toBeChecked();
});

test('a ticked to-do shows in Activity, and unticking it there opens it again', async ({
	page
}) => {
	const letters = runLetters();
	await addPerson(page, 'Todolin', `Gisler${letters}`);
	const title = `Give back the ladder ${letters}`;
	await addTodo(page, title);

	await todoRow(page, title).getByText(title).click();
	const item = storyTodo(page, title);
	await expect(item).toContainText('Done');
	const box = item.getByRole('checkbox', { name: `Not done yet: ${title}` });
	await expect(box).toBeChecked();

	await box.uncheck();
	await expect(page.getByText(`Open again: ${title}`)).toBeVisible();
	await expect(storyTodo(page, title)).toHaveCount(0);
	const row = todoRow(page, title);
	await expect(row).toHaveCount(1);
	await expect(row.getByRole('checkbox', { name: `Done: ${title}` })).not.toBeChecked();
	await page.reload();
	await expect(todoRow(page, title)).toHaveCount(1);
	await expect(storyTodo(page, title)).toHaveCount(0);
});

test('a done to-do removed from Activity is gone for good', async ({ page }) => {
	const letters = runLetters();
	await addPerson(page, 'Todolin', `Arnold${letters}`);
	const title = `Return the cake tin ${letters}`;
	await addTodo(page, title);
	await todoRow(page, title).getByText(title).click();
	await expect(storyTodo(page, title)).toHaveCount(1);

	await storyTodo(page, title)
		.getByRole('button', { name: `Remove: ${title}` })
		.click();
	await expect(page.getByText('To-do removed')).toBeVisible();
	await expect(storyTodo(page, title)).toHaveCount(0);
	// Leaving through a link sends the held removal; back, it is neither in Activity nor on the card.
	await page.getByRole('link', { name: 'Home', exact: true }).first().click();
	await page.waitForURL('/');
	await page.goBack();
	await expect(
		page.getByRole('heading', { name: `Todolin Arnold${letters}`, exact: true })
	).toBeVisible();
	await page.reload();
	await expect(storyTodo(page, title)).toHaveCount(0);
	await expect(todoRow(page, title)).toHaveCount(0);
});
