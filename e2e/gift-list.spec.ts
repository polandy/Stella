import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, fillDate, signIn } from './app';
import { UNDO_WINDOW_MS } from '../src/lib/undo/pending-removals';

/*
 * The household's list of every open gift idea (docs/02 §2.25.6): reached from the ⌘K palette,
 * one group per person with whoever's occasion comes next on top, and *Mark as given* right on
 * the row, held for one undo window. Written after the owner tried the page (docs/08 §8.4.1).
 *
 * The suite shares one database, so every case adds people of its own under first names no
 * demo household and no other spec uses, and the run's letters keep them apart from retries.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

/** A new person whose birthday is today — e2e runs pin `TZ=UTC` on both sides. */
async function addPersonBornToday(page: Page, first: string, last: string): Promise<void> {
	const today = new Date().toISOString().slice(5, 10);
	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill(first);
	await page.getByLabel('Last name').fill(last);
	await page.getByText('More — nickname, birthday').click();
	await fillDate(page.locator('form'), 'Birthday', `1980-${today}`);
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: `${first} ${last}` })).toBeVisible();
	await appReady(page);
}

/** Notes an idea through the person page's Gifts card. */
async function addIdea(page: Page, title: string): Promise<void> {
	const card = page.locator('#section-gifts');
	await card.getByRole('button', { name: 'Idea', exact: true }).click();
	const form = card.getByTestId('gift-form');
	await form.getByLabel('What?').fill(title);
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(card.getByTestId('gift-ideas').locator('li', { hasText: title })).toHaveCount(1);
}

const group = (page: Page, name: string) =>
	page.getByTestId('gift-list-group').filter({ has: page.getByRole('heading', { name }) });

test('the palette opens the list, whoever’s occasion comes next on top', async ({ page }) => {
	await signIn(page);
	const letters = runLetters();
	// Born today, so they come first whatever else the shared database holds; on Christmas Eve
	// both share the day and the name still puts them first.
	const soon = `Aurelio Quendt${letters}`;
	await addPersonBornToday(page, 'Aurelio', `Quendt${letters}`);
	await addIdea(page, `Telescope ${letters}`);
	// No birthday: their ideas are for Christmas Eve.
	const later = `Zenobia Quendt${letters}`;
	await addPerson(page, 'Zenobia', `Quendt${letters}`);
	await addIdea(page, `Easel ${letters}`);

	await page.goto('/circles');
	await appReady(page);
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', { name: 'Jump to' });
	await expect(palette).toBeVisible();
	await page.keyboard.type('gift ideas');
	await palette.getByRole('option', { name: 'All gift ideas' }).click();
	await expect(page).toHaveURL(/\/gifts$/);
	await expect(page.getByRole('heading', { name: 'Gift ideas', level: 1 })).toBeVisible();

	await expect(group(page, soon)).toContainText(`Telescope ${letters}`);
	await expect(group(page, later)).toContainText(`Easel ${letters}`);
	const names = await page.getByTestId('gift-list-group').locator('h2').allTextContents();
	expect(names.map((name) => name.trim()).indexOf(soon)).toBeLessThan(
		names.map((name) => name.trim()).indexOf(later)
	);
	await expect(group(page, soon).getByTestId('gift-list-next')).toContainText('today');
	await expect(group(page, later).getByTestId('gift-list-next')).toHaveText(/^\s*Christmas /);
});

test('Mark as given hides the row, Undo brings it back, and after the window it is given', async ({
	page
}) => {
	// The page's clock is under the test's hand: only `runFor` ends the undo window.
	await page.clock.install();
	await signIn(page);
	const letters = runLetters();
	const name = `Ottilie Brandmoser${letters}`;
	const kite = `Kite ${letters}`;
	await addPerson(page, 'Ottilie', `Brandmoser${letters}`);
	await addIdea(page, kite);
	const personPage = page.url();

	await page.goto('/gifts');
	await appReady(page);
	const row = group(page, name).locator('li', { hasText: kite });
	await expect(row).toHaveCount(1);
	await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);

	const sent: string[] = [];
	page.on('request', (request) => {
		if (request.method() === 'POST' && request.url().includes('markGiftGiven'))
			sent.push(request.url());
	});
	const toast = page.getByTestId('toast-undo');

	// Given, then taken back inside the window: nothing went out.
	await row.getByRole('button', { name: 'Mark as given…' }).click();
	await row
		.getByTestId('mark-given')
		.getByRole('button', { name: 'Mark as given', exact: true })
		.click();
	await expect(row).toHaveCount(0);
	await expect(toast).toContainText(`“${kite}” given`);
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(toast).toHaveCount(0);
	await expect(row).toHaveCount(1);
	expect(sent).toEqual([]);

	// Given again and left alone: a window later the answer is sent and the row stays gone.
	await row.getByRole('button', { name: 'Mark as given…' }).click();
	await row
		.getByTestId('mark-given')
		.getByRole('button', { name: 'Mark as given', exact: true })
		.click();
	await expect(row).toHaveCount(0);
	const committed = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('markGiftGiven')
	);
	await page.clock.runFor(UNDO_WINDOW_MS + 1);
	await committed;
	await page.clock.resume();
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Gift ideas', level: 1 })).toBeVisible();
	await expect(group(page, name)).toHaveCount(0);

	// On the person's card it is a gift given, for Christmas — the occasion the list was for.
	await page.goto(personPage);
	const card = page.locator('#section-gifts');
	await card.getByRole('tab', { name: /^Given/ }).click();
	const given = card.getByTestId('gift-year').locator('li', { hasText: kite });
	await expect(given).toContainText('Christmas');
});
