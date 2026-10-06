import { expect, test, type Page } from '@playwright/test';
import { addPerson, openPerson, signIn } from './app';

/*
 * The people every picker and ⌘K read come with the app shell, which a client-side navigation
 * and a tab left open both keep (docs/04 §4.9). Someone added elsewhere still reaches them:
 * after a navigation, and when the tab comes back into view. Written after the maintainer
 * checked it with two tabs (docs/08 §8.4.1).
 *
 * Every name carries this attempt's letters, so a retry against the same database never finds
 * an earlier attempt's person.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

/** What ⌘K offers for `name`, anchored so the closing "Search everything for …" row is not counted. */
async function paletteOffers(page: Page, name: string) {
	await page.keyboard.press('Control+k');
	await page.keyboard.type(name);
	return page
		.getByRole('dialog', { name: 'Jump to' })
		.getByRole('option', { name: new RegExp(`^${name}`) });
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('finds a person added in another tab once this one navigates', async ({ page, context }) => {
	const first = `Zora${runLetters()}`;
	await openPerson(page, /Markus Brunner/);
	await addPerson(await context.newPage(), first, 'Neuhaus');

	await openPerson(page, /Vreni/);
	await expect(await paletteOffers(page, first)).toHaveCount(1);
});

test('finds a person added in another tab once this one is looked at again, without navigating', async ({
	page,
	context
}) => {
	const first = `Zora${runLetters()}`;
	await openPerson(page, /Markus Brunner/);
	await addPerson(await context.newPage(), first, 'Neuhaus');

	await page.bringToFront();
	// What the browser fires when a tab is shown again; a headless one never hides to begin with.
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

	await expect(await paletteOffers(page, first)).toHaveCount(1);
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Add relationship' }).click();
	await page.locator('form[action="?/addRelationship"]').getByLabel('Person').fill(first);
	await expect(
		page.getByTestId('person-search-listbox').getByRole('option', { name: new RegExp(first) })
	).toHaveCount(1);
});
