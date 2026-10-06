import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';

/*
 * One vocabulary for what the household writes down (UX review A3, docs/02 §2.20, §2.23): a
 * single thing is a *moment*, the person page's running record is *Activity*, and the *Journal*
 * is the place the moments are kept. Written after the owner tried the renamed screens in the
 * preview (docs/08 §8.4.1).
 *
 * Each case adds its own person, so the moment it writes lands on nobody another spec reads.
 * The German case changes the profile's language, which every spec shares, so it hands the
 * account back in English — as `language.spec.ts` does.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

/** A surname only this case uses, capitalised as a name typed by hand would be. */
const surname = () => `Quillon${runLetters()}`;

/** Picks a language in Settings and waits for the page to answer in it. */
async function chooseLanguage(page: Page, language: string, settled: RegExp): Promise<void> {
	await page.goto('/settings');
	await page.getByRole('button', { name: language }).click();
	await expect(page.getByRole('heading', { name: settled })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('the person page writes a moment, and the journal keeps it as one', async ({ page }) => {
	await addPerson(page, 'Odile', surname());
	const personPage = new URL(page.url()).pathname;

	// The page's one primary action says what it makes; the old wording is gone.
	const write = page.getByTestId('identity-actions').getByRole('link', { name: 'Write a moment' });
	await expect(write).toBeVisible();
	await expect(page.getByText('Write in journal')).toHaveCount(0);
	await expect(
		page.locator('#section-story').getByRole('heading', { name: 'Activity' })
	).toBeVisible();

	// It leads to the journal, where an empty one invites the first moment.
	await write.click();
	await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
	await appReady(page);
	await expect(page.getByText('No moments yet.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Write the first moment' })).toBeVisible();

	await page.getByRole('button', { name: 'Write a moment' }).click();
	await page
		.getByRole('textbox', { name: 'Moment', exact: true })
		.fill('built a sandcastle taller than herself');
	await page.getByRole('button', { name: 'Save moment' }).click();
	await expect(page.getByText('built a sandcastle taller than herself')).toBeVisible();

	// Back on her page, Activity names the item by what it is.
	await page.goto(personPage);
	await appReady(page);
	const item = page
		.locator('#section-story [data-story-item]')
		.filter({ hasText: 'built a sandcastle taller than herself' });
	await expect(item.getByText('Moment', { exact: true })).toBeVisible();
});

test.describe('in German', () => {
	test.afterEach(async ({ page }) => {
		await chooseLanguage(page, 'English', /^Settings$/);
	});

	test('the person page offers to capture a moment, and the place stays the Tagebuch', async ({
		page
	}) => {
		// The add-person form is filled in English, like every other spec's, before switching.
		await addPerson(page, 'Odile', surname());
		const personPage = new URL(page.url()).pathname;
		await chooseLanguage(page, 'Deutsch', /^Einstellungen$/);
		// A plain link, so no wait for the shell: `appReady` reads the English search button.
		await page.goto(personPage);

		const write = page
			.getByTestId('identity-actions')
			.getByRole('link', { name: 'Moment festhalten' });
		await expect(write).toBeVisible();
		await write.click();
		await expect(page.getByRole('heading', { name: 'Tagebuch' })).toBeVisible();
	});
});
