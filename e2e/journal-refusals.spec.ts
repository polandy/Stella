import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';

/*
 * What a person's journal says when an edit or a removal cannot be done (docs/02 §2.20):
 * text of nothing but spaces, in the reader's language, and an entry someone removed
 * meanwhile in another tab. Written after the maintainer checked both in the running app
 * (docs/08 §8.4.1).
 *
 * The suite shares one database, so every case writes on a person of its own.
 */

/** Six letters no other attempt shares, so a name made from them is this attempt's alone. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

/** Adds a person, writes `text` in their journal and returns the journal's path. */
async function journalWith(page: Page, text: string): Promise<string> {
	await addPerson(page, 'Ottilie', `Wyssbrod${runLetters()}`);
	const journal = `${new URL(page.url()).pathname}/journal`;
	await page.goto(journal);
	await appReady(page);
	await page.getByRole('button', { name: 'Write a moment' }).click();
	await page.getByRole('textbox', { name: 'Moment', exact: true }).fill(text);
	await page.getByRole('button', { name: 'Save moment' }).click();
	await expect(page.getByText(text)).toBeVisible();
	return journal;
}

/** Picks the language on the settings page and waits for the page to speak it. */
async function chooseLanguage(page: Page, language: string, settled: RegExp): Promise<void> {
	await page.goto('/settings');
	await page.getByRole('button', { name: language }).click();
	await expect(page.getByRole('heading', { name: settled })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('asks for text when an edit leaves only spaces, and keeps the entry', async ({ page }) => {
	const journal = await journalWith(page, 'Picked cherries at the farm');

	await page.getByRole('button', { name: 'Edit moment' }).click();
	await page.getByRole('textbox', { name: 'Moment', exact: true }).fill('   ');
	await page.getByRole('button', { name: 'Save changes' }).click();

	await expect(page.getByText('Please write something before saving.')).toBeVisible();
	await page.goto(journal);
	await appReady(page);
	await expect(page.getByText('Picked cherries at the farm')).toBeVisible();
});

test.describe('in German', () => {
	// The choice is stored in the profile, so it would reach every spec that runs after this one.
	test.afterEach(async ({ page }) => {
		await chooseLanguage(page, 'English', /^Settings$/);
	});

	test('asks for text in German too', async ({ page }) => {
		// Written in English, like every other spec's setup, before switching.
		const journal = await journalWith(page, 'Baked a Zopf together');
		await chooseLanguage(page, 'Deutsch', /^Einstellungen$/);
		// A plain load, so no wait for the shell: `appReady` reads the English search button.
		await page.goto(journal);

		await page.getByRole('button', { name: 'Moment bearbeiten' }).click();
		await page.getByRole('textbox', { name: 'Moment', exact: true }).fill('   ');
		await page.getByRole('button', { name: 'Änderungen speichern' }).click();

		await expect(page.getByText('Bitte schreibe etwas, bevor du speicherst.')).toBeVisible();
	});
});

test('counts an entry already removed in another tab as removed', async ({ page, context }) => {
	const journal = await journalWith(page, 'Fed the ducks at the Aare');

	// A second tab still shows it.
	const other = await context.newPage();
	await other.goto(journal);
	await appReady(other);
	await expect(other.getByText('Fed the ducks at the Aare')).toBeVisible();

	// The first tab removes it for real: leaving through the app commits the removal first.
	await page.getByRole('button', { name: 'Delete moment' }).click();
	await expect(page.getByTestId('toast-undo')).toBeVisible();
	await page.getByRole('link', { name: 'Settings' }).first().click();
	await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

	// The second tab's removal finds nothing left: what it asked for is done, so nothing failed.
	// The layout sends the removal before it moves on, so a notice would be up by the time the
	// next screen is.
	await other.getByRole('button', { name: 'Delete moment' }).click();
	await expect(other.getByTestId('toast-undo')).toBeVisible();
	await other.getByRole('link', { name: 'Settings' }).first().click();
	await expect(other.getByRole('heading', { name: 'Settings' })).toBeVisible();
	await expect(other.getByTestId('toast-notice')).toHaveCount(0);

	// Gone for real: the journal no longer lists it.
	await other.goto(journal);
	await appReady(other);
	await expect(other.getByText('Fed the ducks at the Aare')).toHaveCount(0);
});
