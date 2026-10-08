import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, fillDate, signIn } from './app';

/*
 * What helps before an occasion (docs/02 §2.25.2, §2.25.5): the *already given* hint under a
 * gift's title, the open ideas in Home's *Coming up*, and *Gift idea for …* in the command
 * palette. Written after the owner tried them in the app (docs/08 §8.4.1).
 *
 * The suite shares one database, so each case works on a person of its own, named with letters
 * no other attempt shares.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const giftsCard = (page: Page) => page.locator('#section-gifts');

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('a title like a gift already given says so, and still saves', async ({ page }) => {
	const letters = runLetters();
	await addPerson(page, 'Ottilie', `Gwerder${letters}`);
	const card = giftsCard(page);

	// The card's one-line state keeps *+ Given* in its menu.
	await card.getByRole('button', { name: 'More for gifts' }).click();
	await page.getByRole('menuitem', { name: 'Given' }).click();
	let form = card.getByTestId('gift-form');
	await form.getByLabel('What?').fill(`Teekanne aus Gusseisen ${letters}`);
	await form.getByText('Birthday', { exact: true }).click();
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(card.getByTestId('gift-year')).toContainText(`Teekanne aus Gusseisen ${letters}`);

	await card.getByRole('button', { name: 'Idea', exact: true }).click();
	form = card.getByTestId('gift-form');
	const what = form.getByLabel('What?');
	// Case and accents folded; the hint names the gift, its day and its occasion.
	await what.fill('TEEKÄNNE');
	const hint = form.getByTestId('gift-twice');
	await expect(hint).toContainText(`Already given: “Teekanne aus Gusseisen ${letters}” on`);
	await expect(hint).toContainText('(Birthday).');
	// It describes the field without becoming part of its name.
	await expect(what).toHaveAccessibleDescription(/Already given/);

	await what.fill(`Fotobuch ${letters}`);
	await expect(hint).toHaveText('');

	// A hint, not a block: the second teapot can be on purpose.
	await what.fill(`Teekanne ${letters}`);
	await expect(hint).toContainText('Already given');
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(card.getByTestId('gift-ideas')).toContainText(`Teekanne ${letters}`);
});

test('a person coming up with open ideas says how many, linking to their gifts', async ({
	page
}) => {
	const last = `Imhof${runLetters()}`;
	// Today, so they lead the band whatever else the shared database has coming up.
	const today = new Date().toISOString().slice(5, 10);
	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill('Severin');
	await page.getByLabel('Last name').fill(last);
	await page.getByText('More — nickname, birthday').click();
	await fillDate(page.locator('form'), 'Birthday', `1980-${today}`);
	await page.getByRole('button', { name: 'Add person' }).click();
	const name = `Severin ${last}`;
	await expect(page.getByRole('heading', { name })).toBeVisible();

	// No ideas yet: the row offers its one action and no hint.
	await page.goto('/');
	const row = page.getByTestId('coming-up').locator('li', { hasText: name });
	await expect(row).toHaveCount(1);
	await expect(row.getByTestId('coming-up-gift-ideas')).toHaveCount(0);

	await page.getByTestId('coming-up').getByRole('link', { name }).click();
	const card = giftsCard(page);
	for (const title of ['Scarf', 'Puzzle']) {
		await card.getByRole('button', { name: 'Idea', exact: true }).click();
		await card.getByTestId('gift-form').getByLabel('What?').fill(title);
		await card.getByTestId('gift-form').getByRole('button', { name: 'Save' }).click();
		await expect(card.getByTestId('gift-ideas')).toContainText(title);
	}

	await page.goto('/');
	const hint = row.getByRole('link', { name: `2 gift ideas for ${name}` });
	await expect(hint).toHaveText('2 ideas');
	await hint.click();
	await expect(page).toHaveURL(/#section-gifts$/);
	await expect(card.getByRole('tab', { name: 'Ideas · 2' })).toBeVisible();
});

test('the palette notes a gift idea for someone, from anywhere', async ({ page }) => {
	const letters = runLetters();
	const last = `Wyrsch${letters}`;
	await addPerson(page, 'Kunigunde', last);

	await page.goto('/');
	await appReady(page);
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', { name: 'Jump to' });
	await palette.getByRole('combobox').fill('gift');
	await palette.getByRole('option', { name: /^Gift idea for …/ }).click();

	// A second step in the same dialog: only people, whom the idea is for.
	const field = palette.getByRole('combobox', { name: 'Gift idea for whom?' });
	await expect(field).toHaveValue('');
	await expect(field).toBeFocused();
	// Backspace in the empty field goes back to the start, and the step is found again.
	await page.keyboard.press('Backspace');
	await expect(palette.getByRole('option', { name: /^Write a moment/ })).toBeVisible();
	await palette.getByRole('option', { name: /^Gift idea for …/ }).click();

	await page.keyboard.type(last);
	await expect(palette.getByRole('option')).toHaveCount(1);
	await page.keyboard.press('Enter');

	// Their page, the idea form open with the cursor in it.
	await expect(page.getByRole('heading', { name: `Kunigunde ${last}` })).toBeVisible();
	const form = giftsCard(page).getByTestId('gift-form');
	await expect(form.getByRole('heading', { name: `Idea for Kunigunde ${last}` })).toBeVisible();
	await expect(form.getByLabel('What?')).toBeFocused();
	await page.keyboard.type(`Hörbuch ${letters}`);
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(giftsCard(page).getByTestId('gift-ideas')).toContainText(`Hörbuch ${letters}`);
	// Saved and reloaded, the form does not open again.
	await expect(giftsCard(page).getByTestId('gift-form')).toHaveCount(0);
});
